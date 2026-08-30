import type { BatchResult, MatchedRecord } from "@/lib/matching/types";
import type { batches, records } from "./schema";

/**
 * The matcher's output as database rows. PURE FUNCTIONS — no connection, no
 * driver, no migration. The Detect layer produces a verdict; persisting it is a
 * separate concern, and keeping the mapping pure means it can be asserted
 * field-for-field without a database anywhere near the test.
 *
 * Return types are Drizzle's own inferred insert types, so a schema change
 * breaks the build rather than the demo.
 */

/** What a batch row needs that the matcher does not know. */
export type BatchMeta = {
  merchantGstin: string;
  /** The filing period being reconciled, `MMYYYY`. */
  period: string;
  processingTimeMs?: number;
  startedAt?: Date;
  completedAt?: Date;
};

export function toBatchRow(result: BatchResult, meta: BatchMeta): typeof batches.$inferInsert {
  const { records: classified, rollup, itc } = result;

  return {
    merchantGstin: meta.merchantGstin,
    period: meta.period,
    totalRecords: classified.length,
    // `match_method` IS the confidence tier (PRD §6): EXACT means the
    // merchant's own expected rate held, FUZZY that another published cell
    // explained the fee. Counted off the records rather than tracked
    // separately, so the three buckets cannot drift out of step with the rows.
    matchedExact: countMethod(classified, "EXACT"),
    matchedFuzzy: countMethod(classified, "FUZZY"),
    exceptions: classified.filter((r) => r.status === "EXCEPTION").length,

    ...itcSplit(result),

    gstr2bInvoiceTxvalPaise: rollup.gstr2bInvoiceTxvalPaise,
    gstr2bInvoiceTaxPaise: rollup.gstr2bInvoiceTaxPaise,
    rolledUpTaxPaise: rollup.rolledUpTaxPaise,
    rollupDeltaPaise: rollup.rollupDeltaPaise,

    gstr2bItcAvailable: itc.available,
    gstr2bItcReason: itc.reason,

    processingTimeMs: meta.processingTimeMs,
    // Omitted rather than defaulted to now(): the column already defaults, and
    // inventing a timestamp here would put a made-up figure in an audit trail.
    ...(meta.startedAt ? { startedAt: meta.startedAt } : {}),
    ...(meta.completedAt ? { completedAt: meta.completedAt } : {}),
  };
}

/**
 * ITC, split into what the merchant can claim and what is at risk.
 *
 * While GSTN says the credit is available, the claimable figure is the matched
 * rollup — the tax Trace tied to a published rate cell — and the rollup delta is
 * what is at risk, being the tax on this period's invoice that nothing explained.
 *
 * When GSTN says it is NOT available, the verdict is the government's and it
 * outranks anything Trace infers (PRD §7): the whole invoice is blocked however
 * cleanly its records matched, so the full invoice tax is at risk and nothing is
 * claimable. Erring the other way would show a merchant credit they cannot take.
 */
function itcSplit(result: BatchResult) {
  const { rollup, itc } = result;

  return itc.available
    ? { itcClaimablePaise: rollup.rolledUpTaxPaise, itcAtRiskPaise: rollup.rollupDeltaPaise }
    : { itcClaimablePaise: 0, itcAtRiskPaise: rollup.gstr2bInvoiceTaxPaise };
}

const countMethod = (classified: MatchedRecord[], method: MatchedRecord["method"]) =>
  classified.filter((r) => r.status === "MATCHED" && r.method === method).length;

export function toRecordRows(
  result: BatchResult,
  batchId: string,
): (typeof records.$inferInsert)[] {
  return result.records.map((record) => ({
    batchId,
    recordId: record.recordId,
    settlementId: record.settlementId,
    // `billedIn`, NOT the batch's period. They differ exactly when T+2 pushed a
    // settlement past a month end, and that difference is the whole content of
    // a TIMING record — writing the batch's period here would erase it and
    // duplicate a batch-level fact across every row.
    period: record.billedIn,

    razorpayFeePaise: record.razorpayFeePaise,
    razorpayTaxPaise: record.razorpayTaxPaise,
    rateCell: record.rateCell,
    expectedFeePaise: record.expectedFeePaise,
    expectedTaxPaise: record.expectedTaxPaise,

    status: record.status,
    method: record.method,
    category: record.category,
    creditNoteReview: record.creditNoteReview,

    // `reason` is deliberately absent. It is the Investigation agent's
    // plain-language output, and a mapping function is not entitled to invent
    // one — the rollup and the ITC verdict are likewise absent, because one
    // GSTR-2B invoice covers a whole period and a record has no 2B counterpart.
  }));
}
