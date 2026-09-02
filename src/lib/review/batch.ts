import { toBatchRow } from "@/lib/audit/rows";
import { parseSettlements, parseStatement } from "@/lib/ingestion";
import { matchBatch } from "@/lib/matching";
import type {
  ExceptionCategory,
  MatchMethod,
  MatchStatus,
  RateCell,
  ReconItem,
} from "@/lib/matching";
import julyStatementJson from "../../../data/synthetic/gstr2b-072026.json";
import settlementsJson from "../../../data/synthetic/settlements.json";
import { explainRow, type RecordExplanation } from "./explain";

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
};

export type ReviewBatch = {
  header: ReviewHeader;
  rows: ReviewRow[];
};

export function loadReviewBatch(): ReviewBatch {
  const settlements = parseSettlements(settlementsJson);
  const result = matchBatch({
    settlements,
    statement: parseStatement(julyStatementJson),
    period: REVIEW_PERIOD,
    mode: "exact+fuzzy",
  });

  // The header comes from `toBatchRow` — the same pure mapping that writes the
  // audit trail — rather than from figures recomputed for the screen. Two
  // derivations of "ITC at risk" is how a demo ends up showing a number the
  // database disagrees with, and this one is already covered by its own tests.
  const batch = toBatchRow(result, {
    merchantGstin: MERCHANT_GSTIN,
    period: REVIEW_PERIOD,
  });

  // A recon row carries the payment amount and when it settled; a classified
  // record carries the verdict. The table needs both, and they join on the
  // payment id.
  const byId = new Map<string, ReconItem>(settlements.map((item) => [item.entity_id, item]));

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

    return { ...base, explanation: explainRow(base, REVIEW_PERIOD) };
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
    },
    rows,
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
