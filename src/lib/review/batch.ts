import { toBatchRow, toRecordRows } from "@/lib/audit/rows";
import { parseSettlements, parseStatement } from "@/lib/ingestion";
import { RAZORPAY_SUPPLIER_GSTIN, matchBatch } from "@/lib/matching";
import type {
  ExceptionCategory,
  MatchMethod,
  MatchStatus,
  RateCell,
  ReconItem,
} from "@/lib/matching";
import { applyExplainGate } from "@/lib/explain/policy";
import type { AnswerSegment } from "@/lib/explain/citations";
import type { ExplainVerdict } from "@/lib/explain/policy";
import { EXAMPLE_QUESTIONS, explanationFor, parseExplanations } from "@/lib/explain/library";
import { draftFor, parseDrafts, type RecordedDraft } from "@/lib/act/library";
import type { ActContext, ActRecord } from "@/lib/act/prompt";
import draftsJson from "../../../data/synthetic/drafts.json";
import explanationsJson from "../../../data/synthetic/explanations.json";
import investigationsJson from "../../../data/synthetic/investigations.json";
import julyStatementJson from "../../../data/synthetic/gstr2b-072026.json";
import settlementsJson from "../../../data/synthetic/settlements.json";
import { explainRow, type RecordExplanation } from "./explain";
import { parseTraces, type InvestigationTrace } from "./trace";

/**
 * The exception review screen's data, assembled straight from the fixture.
 *
 * Deliberately NOT read back out of Postgres. The database is the audit trail —
 * it records what was decided — and putting it between the fixture and the
 * pixels would mean the screen could only ever show what a previous write
 * happened to leave behind. Here the page runs the same `matchBatch` the audit
 * trail runs, so what a person sees is the matcher's verdict rather than a
 * possibly stale copy of it.
 *
 * The fixture is imported rather than read with `fs`: the JSON is bundled, so
 * there is no dependency on the process's working directory and nothing extra
 * to trace into a deployment.
 */

/**
 * The single seeded merchant (PRD §2 — one merchant, one GSTIN, test mode).
 * Matches `merchant_gstin` in `data/synthetic/expected.json`.
 */
export const MERCHANT_GSTIN = "27TESTM1234A1Z0";

/** The filing period the screen reviews, `MMYYYY`. July 2026. */
export const REVIEW_PERIOD = "072026";

/** One row of the table, and everything its detail view needs. */
export type ReviewRow = {
  recordId: string;
  settlementId: string;
  orderId: string;
  /** The payment, in integer paise. */
  amountPaise: number;
  /** Razorpay's fee, INCLUSIVE of the GST inside it. */
  feePaise: number;
  /** The GST inside the fee — the figure input tax credit is claimed on. */
  taxPaise: number;
  status: MatchStatus;
  method: MatchMethod;
  rateCell: RateCell | null;
  expectedFeePaise: number | null;
  expectedTaxPaise: number | null;
  category: ExceptionCategory | null;
  creditNoteReview: boolean;
  /** The filing period whose GSTR-2B carries this row's fee. */
  billedIn: string;
  settledAt: number;
  explanation: RecordExplanation;
  /**
   * What the agent did to reach this verdict (PRD §15.1), or null when no run
   * has classified this record yet. Null is the normal state without an API
   * key: the panel falls back to `explanation`, which is rules-only and needs
   * no model.
   */
  trace: InvestigationTrace | null;
  /**
   * The three actions drafted for this record (PRD §9, agent 3), or null when
   * no run has drafted for it — or when the record's figures have moved since
   * one did. Null is the normal state without an API key, which is why the
   * action cards treat an absent draft as ordinary rather than as an error.
   */
  draft: RecordedDraft | null;
};

/** The four figures across the top, plus what they are qualified by. */
export type ReviewHeader = {
  period: string;
  merchantGstin: string;
  /** Tax on Razorpay's GSTR-2B invoice for the period. */
  invoiceTaxPaise: number;
  itcClaimablePaise: number;
  itcAtRiskPaise: number;
  matchedCount: number;
  exceptionCount: number;
  totalRecords: number;
  rolledUpTaxPaise: number;
  rollupDeltaPaise: number;
  /** GSTN's own verdict on the invoice, and its free-text reason. */
  itcAvailable: boolean;
  itcReason: string | null;
  /**
   * Who billed this period and under which invoice number. Carried because a
   * drafted CA email is not actionable without them — an accountant asked to
   * query a fee needs the document it was billed on.
   */
  supplierGstin: string;
  invoiceNumber: string;
};

/**
 * One example question and the answer recorded for it (PRD §15.5).
 *
 * The answer is resolved, gated and split into segments HERE, on the server,
 * for the same reason the rest of this file is: the client component renders
 * and holds no logic. It also means the citation gate runs against the batch
 * the reader is actually looking at, so a recorded answer that has fallen
 * behind the fixture shows as an unresolved citation rather than a dead link.
 */
export type ExplainExample = {
  id: string;
  question: string;
  /** Null when no answer has been recorded for this question's current wording. */
  recorded: {
    /** The answer, ready to render, with citations resolved. */
    segments: AnswerSegment[];
    /** Records the answer cited that really exist. */
    cited: string[];
    /** Records it named that this batch does not hold. */
    unknown: string[];
    verdict: ExplainVerdict;
    model: string;
    promptVersion: string;
    recordedAt: string;
  } | null;
};

export type ReviewBatch = {
  header: ReviewHeader;
  rows: ReviewRow[];
  /** The Explain panel's questions, and any answers already recorded for them. */
  examples: ExplainExample[];
};

/**
 * Reconcile the fixture once. The screen and the audit trail both read this,
 * so neither can end up describing a different run from the other.
 */
function reconcile() {
  const settlements = parseSettlements(settlementsJson);
  const statement = parseStatement(julyStatementJson);
  const result = matchBatch({
    settlements,
    statement,
    period: REVIEW_PERIOD,
    mode: "exact+fuzzy",
  });

  // `toBatchRow` is the same pure mapping that writes the audit trail, rather
  // than figures recomputed for the screen. Two derivations of "ITC at risk" is
  // how a screen ends up showing a number the database disagrees with.
  const batch = toBatchRow(result, {
    merchantGstin: MERCHANT_GSTIN,
    period: REVIEW_PERIOD,
  });

  return { settlements, result, batch, invoice: razorpayInvoice(statement) };
}

/**
 * Razorpay's invoice for the period, by its number.
 *
 * Read from the SAME statement the matcher reconciled against and filtered by
 * the same supplier GSTIN, so the invoice a drafted email tells an accountant to
 * query is provably the invoice the figures came from. A 2B carries every
 * vendor who filed against the merchant; taking the first line here would put
 * the landlord's invoice number in a payment-gateway query.
 */
function razorpayInvoice(statement: ReturnType<typeof parseStatement>) {
  const supplier = statement.docdata.b2b.find(
    (entry) => entry.ctin === RAZORPAY_SUPPLIER_GSTIN,
  );
  const invoice = supplier?.inv[0];

  // `matchBatch` has already refused a statement with no Razorpay invoice, so
  // reaching here means the two disagree about which supplier is Razorpay.
  if (!supplier || !invoice) {
    throw new Error(
      `GSTR-2B for ${statement.rtnprd} carries no invoice from ${RAZORPAY_SUPPLIER_GSTIN}`,
    );
  }

  return { supplierGstin: supplier.ctin, invoiceNumber: invoice.inum };
}

/**
 * The `batches` row this reconciliation earns, for a caller that needs to
 * record one — the live Explain route, which may not log an `ai_calls` row
 * without a batch to attach it to.
 *
 * Exported separately rather than added to `ReviewBatch` so the audit row does
 * not travel to the browser with the screen's props. It is the SAME mapping the
 * header is built from, so the row written and the figures displayed cannot
 * disagree.
 */
export function loadBatchAuditRow() {
  return reconcile().batch;
}

/**
 * The `batches` row AND the 54 `records` rows this reconciliation earns.
 *
 * The record rows are a function of the batch id, which does not exist until
 * the batch row is inserted — hence the callback rather than a second array.
 * They come as a pair because writing one without the other leaves a batch row
 * claiming 54 records with nothing under it, which is an audit trail that
 * misstates itself on the one row a person reads as the summary of the run.
 */
export function loadAuditRows() {
  const { result, batch } = reconcile();

  return { batch, recordsFor: (batchId: string) => toRecordRows(result, batchId) };
}

export function loadReviewBatch(): ReviewBatch {
  const { settlements, result, batch, invoice } = reconcile();

  // A recon row carries the payment amount and when it settled; a classified
  // record carries the verdict. The table needs both, and they join on the
  // payment id.
  const byId = new Map<string, ReconItem>(settlements.map((item) => [item.entity_id, item]));

  // The agent's reasoning trace, exported from a real run's `ai_calls` rows by
  // `npm run eval -- --write-traces`. Empty until one has been run, which is
  // why every consumer treats an absent trace as normal rather than as an error.
  const traces = parseTraces(investigationsJson);

  // The drafted actions, exported from a real run by `npm run act`. Empty until
  // one has been run, and a draft whose record has moved since is dropped by
  // `draftFor` rather than shown against figures it no longer matches.
  const drafts = parseDrafts(draftsJson);

  const rows = result.records.map((record): ReviewRow => {
    const item = byId.get(record.recordId);
    // Every classified record came from a recon row, so an absent one means the
    // two collections have drifted. Refused rather than rendered as ₹0.00,
    // which is a figure a person would act on.
    if (!item) {
      throw new Error(
        `classified record ${record.recordId} has no settlement row to read its amount from`,
      );
    }

    const base = {
      recordId: record.recordId,
      settlementId: record.settlementId,
      orderId: item.order_id,
      amountPaise: item.amount,
      feePaise: record.razorpayFeePaise,
      taxPaise: record.razorpayTaxPaise,
      status: record.status,
      method: record.method,
      rateCell: record.rateCell,
      expectedFeePaise: record.expectedFeePaise,
      expectedTaxPaise: record.expectedTaxPaise,
      category: record.category,
      creditNoteReview: record.creditNoteReview,
      billedIn: record.billedIn,
      settledAt: item.settled_at,
    };

    return {
      ...base,
      explanation: explainRow(base, REVIEW_PERIOD),
      trace: traces.get(record.recordId) ?? null,
      draft: draftFor(record.recordId, base, drafts),
    };
  });

  // The recorded Explain answers (PRD §15.5). Empty until `npm run explain`
  // has been run, which is why the panel treats an absent answer as normal
  // rather than as an error — the same discipline as the reasoning trace.
  const recorded = parseExplanations(explanationsJson);
  const knownRecordIds = new Set(rows.map((row) => row.recordId));

  const examples = EXAMPLE_QUESTIONS.map((question): ExplainExample => {
    const answer = explanationFor(question, recorded);
    if (answer === null || answer.answer === null) {
      return { id: question.id, question: question.question, recorded: null };
    }

    // Re-checked against today's batch rather than trusting the verdict the
    // file carries. The two agree — a test asserts it — but the one that must
    // drive the pixels is the one computed from the records now on screen.
    const gated = applyExplainGate({ answer: answer.answer }, knownRecordIds);

    return {
      id: question.id,
      question: question.question,
      recorded: {
        segments: gated.segments,
        cited: gated.cited,
        unknown: gated.unknown,
        verdict: gated.verdict,
        model: answer.model,
        promptVersion: answer.promptVersion,
        recordedAt: answer.recordedAt,
      },
    };
  });

  return {
    header: {
      period: result.period,
      merchantGstin: MERCHANT_GSTIN,
      invoiceTaxPaise: result.rollup.gstr2bInvoiceTaxPaise,
      itcClaimablePaise: required(batch.itcClaimablePaise, "itcClaimablePaise"),
      itcAtRiskPaise: required(batch.itcAtRiskPaise, "itcAtRiskPaise"),
      matchedCount: required(batch.matchedExact, "matchedExact") + required(batch.matchedFuzzy, "matchedFuzzy"),
      exceptionCount: required(batch.exceptions, "exceptions"),
      totalRecords: required(batch.totalRecords, "totalRecords"),
      rolledUpTaxPaise: result.rollup.rolledUpTaxPaise,
      rollupDeltaPaise: result.rollup.rollupDeltaPaise,
      itcAvailable: result.itc.available,
      itcReason: result.itc.reason,
      ...invoice,
    },
    rows,
    examples,
  };
}

/**
 * Drizzle's inferred insert type makes columns with defaults optional, so every
 * header figure arrives as `number | undefined`. Falling back to zero would put
 * a plausible, invented figure on the one row a person reads as the summary of
 * the whole batch, so an absent one stops the page instead.
 */
function required(value: number | undefined, field: string): number {
  if (typeof value !== "number") {
    throw new Error(`the batch row carries no ${field}, so the header cannot be shown`);
  }

  return value;
}

/**
 * The period and invoice a drafted action names (PRD §9, agent 3).
 *
 * Built from the header the screen renders, so an email that tells an
 * accountant which invoice to query names the one the figures on screen came
 * from.
 */
export function actContext(header: ReviewHeader): ActContext {
  return {
    period: header.period,
    merchantGstin: header.merchantGstin,
    supplierGstin: header.supplierGstin,
    invoiceNumber: header.invoiceNumber,
  };
}

/**
 * One review row as the Act layer receives it.
 *
 * A narrowing rather than a copy: Act is handed the record's identifiers,
 * figures and the classification another layer already made, and nothing else.
 * The explanation, the reasoning trace and any previously recorded draft are
 * deliberately absent — a draft written against a previous draft would drift
 * from the record with nothing to catch it.
 */
export function toActRecord(row: ReviewRow): ActRecord {
  return {
    recordId: row.recordId,
    settlementId: row.settlementId,
    orderId: row.orderId,
    amountPaise: row.amountPaise,
    feePaise: row.feePaise,
    taxPaise: row.taxPaise,
    expectedFeePaise: row.expectedFeePaise,
    expectedTaxPaise: row.expectedTaxPaise,
    status: row.status,
    category: row.category,
    rateCell: row.rateCell,
    billedIn: row.billedIn,
    settledAt: row.settledAt,
    creditNoteReview: row.creditNoteReview,
  };
}
