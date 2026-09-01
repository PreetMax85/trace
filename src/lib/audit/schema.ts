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
