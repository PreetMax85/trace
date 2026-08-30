import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { batches, exceptionCategory, rateCell, records } from "@/lib/audit/schema";

describe("exception taxonomy", () => {
  it("is exactly the five locked categories", () => {
    // Locked by PRD Section 7. Widening this list is a spec change and
    // should fail here first, not surface as an unexpected report column.
    expect(exceptionCategory.enumValues).toEqual([
      "FEE_DEDUCTION",
      "TIMING",
      "REFUND_NETTED",
      "PARTIAL_PAYMENT",
      "UNEXPLAINED",
    ]);
  });
});

describe("rate cells", () => {
  it("matches Razorpay's published rate card", () => {
    // PRD Section 5, Source 3. STANDARD is the exact pass, everything else is
    // the fuzzy pass, so adding a cell changes the reported match rate.
    expect(rateCell.enumValues).toEqual(["STANDARD", "CORPORATE"]);
  });
});

describe("GSTR-2B verdict placement", () => {
  it("keeps 2B facts on the batch, never on a record", () => {
    // A GSTR-2B invoice covers a whole filing period, so a single settlement
    // record has no 2B counterpart to carry a 2B verdict — including `itcavl`,
    // the sixth signal. Moving any of these onto `records` would copy one
    // period-level fact across every row and invite the two to disagree.
    const batchCols = Object.keys(getTableColumns(batches));
    const recordCols = Object.keys(getTableColumns(records));

    for (const col of [
      "gstr2bInvoiceTxvalPaise",
      "gstr2bInvoiceTaxPaise",
      "rolledUpTaxPaise",
      "rollupDeltaPaise",
      "gstr2bItcAvailable",
      "gstr2bItcReason",
    ]) {
      expect(batchCols).toContain(col);
      expect(recordCols).not.toContain(col);
    }
  });
});
