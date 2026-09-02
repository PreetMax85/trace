import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * All monetary columns are stored as INTEGER PAISE, never floats.
 * Razorpay's API returns paise (`fee`, `tax`, `amount`), the ₹1 match
 * tolerance is exactly 100 paise, and float rupees would make an audit
 * trail that has to reconcile to the paise unreliable. Convert to rupees
 * at the presentation boundary only.
 */

export const matchStatus = pgEnum("match_status", ["MATCHED", "EXCEPTION"]);

export const matchMethod = pgEnum("match_method", ["EXACT", "FUZZY", "NONE"]);

/**
 * Razorpay's published rate cells (PRD Section 5, Source 3). A settlement row
 * is matched by resolving its fee against one of these, because no
 * per-transaction invoice number exists to join on. STANDARD is the exact
 * pass; anything resolved against another cell is a FUZZY match.
 */
export const rateCell = pgEnum("rate_cell", ["STANDARD", "CORPORATE"]);

/** The five categories are locked. Adding one is a spec change, not a code change. */
export const exceptionCategory = pgEnum("exception_category", [
  "FEE_DEDUCTION",
  "TIMING",
  "REFUND_NETTED",
  "PARTIAL_PAYMENT",
  "UNEXPLAINED",
]);

/** One reconciliation run over a set of settlement records. */
export const batches = pgTable("batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  merchantGstin: text("merchant_gstin").notNull(),
  period: text("period").notNull(),
  totalRecords: integer("total_records").notNull(),
  matchedExact: integer("matched_exact").notNull().default(0),
  matchedFuzzy: integer("matched_fuzzy").notNull().default(0),
  exceptions: integer("exceptions").notNull().default(0),
  itcClaimablePaise: integer("itc_claimable_paise").notNull().default(0),
  itcAtRiskPaise: integer("itc_at_risk_paise").notNull().default(0),

  /**
   * Tier 2 rollup (PRD Section 6). GSTR-2B carries ONE Razorpay invoice line
   * per filing period, so these live on the batch, not on a record. Nullable
   * rather than defaulted to 0: a delta of 0 means "fully explained", which
   * must stay distinguishable from "not computed yet".
   */
  gstr2bInvoiceTxvalPaise: integer("gstr2b_invoice_txval_paise"),
  gstr2bInvoiceTaxPaise: integer("gstr2b_invoice_tax_paise"),
  rolledUpTaxPaise: integer("rolled_up_tax_paise"),
  rollupDeltaPaise: integer("rollup_delta_paise"),

  /**
   * The sixth signal (PRD Section 7): GSTN's own verdict on the period's
   * invoice. `itcavl` is "Y"/"N" per document in GSTR-2B and outranks anything
   * Trace infers — an invoice marked "N" is ITC at risk on the government's
   * authority, however cleanly its records matched. It sits on the batch for
   * the same reason the rollup does: the verdict is carried by the invoice,
   * and one invoice covers the whole period.
   *
   * The reason is free text, not an enum. GSTN documents the grounds for
   * ineligibility — the place-of-supply restriction introduced with GSTR-2B by
   * Notification 82/2020, and the Section 16(4) time bar — but publishes no
   * enumerated `rsn` code list, so constraining the column would be a guess.
   *
   * Nullable: null is "not computed", which must stay distinct from a "Y".
   */
  gstr2bItcAvailable: boolean("gstr2b_itc_available"),
  gstr2bItcReason: text("gstr2b_itc_reason"),

  processingTimeMs: integer("processing_time_ms"),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

/** One settlement line matched against GSTR-2B — the audit trail row. */
export const records = pgTable("records", {
  id: uuid("id").primaryKey().defaultRandom(),
  batchId: uuid("batch_id")
    .notNull()
    .references(() => batches.id, { onDelete: "cascade" }),

  /** Razorpay's `entity_id` (pay_… / rfnd_…). `payment_id` is null in recon items. */
  recordId: text("record_id").notNull(),
  settlementId: text("settlement_id").notNull(),
  period: text("period").notNull(),

  /** Actuals from the recon item. `fee` is INCLUSIVE of tax; `tax` is the GST inside it. */
  razorpayFeePaise: integer("razorpay_fee_paise").notNull(),
  razorpayTaxPaise: integer("razorpay_tax_paise").notNull(),

  /**
   * What the resolved rate cell says the fee should have been. Null only when
   * the fee matches no published cell (FEE_DEDUCTION) or there is no fee to
   * explain (a zero-value retry) — NOT merely because the record is an
   * exception: a TIMING or REFUND_NETTED row is priced correctly and still
   * resolves to STANDARD. There is deliberately no per-record GSTR-2B column;
   * a single record has no 2B counterpart, only a period does.
   */
  rateCell: rateCell("rate_cell"),
  expectedFeePaise: integer("expected_fee_paise"),
  expectedTaxPaise: integer("expected_tax_paise"),

  status: matchStatus("status").notNull(),
  method: matchMethod("match_method").notNull(),
  category: exceptionCategory("exception_category"),

  /**
   * A netted refund obliges the merchant to issue a credit note under Section 34
   * of the CGST Act, due by 30 November following the financial year of the
   * original supply. It is NOT an ITC reversal: Razorpay does not return its MDR
   * on a refunded transaction, so the GST on that fee stays claimable. Needs a
   * human decision, which is why the drafted action waits on `actions.confirmed_at`.
   */
  creditNoteReview: boolean("credit_note_review").notNull().default(false),

  /** Plain-language explanation from the Investigation agent. Null when MATCHED. */
  reason: text("reason"),

  loggedAt: timestamp("logged_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Every drafted action. Drafts only — nothing here is ever sent automatically. */
export const actionKind = pgEnum("action_kind", [
  "CA_EMAIL",
  "GSTR3B_FLAG",
  "TALLY_ENTRY",
]);

export const actions = pgTable("actions", {
  id: uuid("id").primaryKey().defaultRandom(),
  recordId: uuid("record_id")
    .notNull()
    .references(() => records.id, { onDelete: "cascade" }),
  kind: actionKind("kind").notNull(),
  draft: jsonb("draft").notNull(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * What the policy gate did with the model's answer (PRD §15.3). The gate is the
 * second of two independent mechanisms: the Zod enum makes a sixth category
 * unrepresentable at generation, and this catches the case where the schema is
 * ever loosened. Recording which one fired is the point — "the gate never
 * triggered" is only credible if a triggered gate would have left a row saying so.
 */
export const aiCallVerdict = pgEnum("ai_call_verdict", [
  /** The model returned one of the five categories and the gate let it stand. */
  "ACCEPTED",
  /** The model returned something else; the gate forced UNEXPLAINED. */
  "COERCED_UNEXPLAINED",
  /** The agent tried to use a capability it does not have. Investigate may classify, may not write. */
  "BLOCKED_WRITE",
  /** The model call or one of its tools failed. The record stays UNEXPLAINED rather than guessing. */
  "FAILED",
  /**
   * Explain answered, but named a record this batch does not contain, so the
   * citation gate withheld the link (PRD §15.5).
   *
   * Its own value rather than a flavour of FAILED, on the same reasoning that
   * separates COERCED_UNEXPLAINED from FAILED above: an answer that invented a
   * record id is a PROMPT problem and a call that returned nothing is an
   * INFRASTRUCTURE one. Collapsed into one bucket, a regression that starts
   * inventing citations would hide inside the rate-limit noise.
   */
  "INVALID_CITATION",
]);

/** Which of the three layers made the call. */
export const agentLayer = pgEnum("agent_layer", ["INVESTIGATE", "EXPLAIN", "ACT"]);

/**
 * Every model call, logged (PRD §15.4). This is the observability layer —
 * Langfuse was cut on 1 Sep and this table replaced it, on the reasoning that
 * for an audit product the trace IS the audit trail and belongs in the same
 * database as the records it explains.
 */
export const aiCalls = pgTable("ai_calls", {
  id: uuid("id").primaryKey().defaultRandom(),
  batchId: uuid("batch_id")
    .notNull()
    .references(() => batches.id, { onDelete: "cascade" }),

  /**
   * Nullable, and not an oversight: Investigate runs per record, but Explain
   * answers a question about the whole batch and Act drafts against one. A
   * batch-level call has no record to point at.
   */
  recordId: uuid("record_id").references(() => records.id, { onDelete: "cascade" }),

  layer: agentLayer("layer").notNull(),
  model: text("model").notNull(),

  /**
   * Which prompt produced this row. Without it the eval's agreement number
   * (§15.2) cannot be attributed to a prompt, so a tuning round that made
   * things worse would be indistinguishable from one that made them better.
   */
  promptVersion: text("prompt_version").notNull(),

  /**
   * Tokens, split the way Anthropic bills them. Cached input costs 0.1x a fresh
   * read and a cache write costs 1.25x, so a single `input_tokens` column would
   * report a cost wrong by most of the saving prompt caching is claimed to
   * deliver (PRD §9, "On cost"). `inputTokens` is the total; the two cache
   * columns are the part of it that was not billed at the full rate.
   */
  inputTokens: integer("input_tokens").notNull().default(0),
  cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
  cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),

  latencyMs: integer("latency_ms").notNull().default(0),

  /**
   * Cost in MICRO-USD (millionths of a dollar), integer — the same discipline
   * as the paise columns, for the same reason. Anthropic bills in USD, so USD
   * is what gets stored; rupees are a presentation concern and need an exchange
   * rate this table has no business inventing. Micro-USD because a single
   * classification costs on the order of $0.004: in paise it would round to
   * zero, and a cost column that reports zero is worse than no column.
   */
  costMicroUsd: integer("cost_micro_usd").notNull().default(0),

  verdict: aiCallVerdict("verdict").notNull(),
  /** The category that survived the gate. Null when the call failed outright. */
  category: exceptionCategory("exception_category"),

  /**
   * The tool calls and the model's reasoning, kept so §15.1 can render what the
   * agent actually did from the audit trail rather than regenerating it on view.
   * Regenerating would show the reader a different answer from the one that was
   * recorded, which for a compliance product is the whole failure mode.
   */
  toolCalls: jsonb("tool_calls").notNull().default([]),
  reason: text("reason"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
