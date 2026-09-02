import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  aiCalls,
  aiCallVerdict,
  batches,
  exceptionCategory,
  rateCell,
  records,
} from "@/lib/audit/schema";

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

describe("ai_calls", () => {
  it("carries everything a batch needs to account for its own spend", () => {
    // PRD Section 15.4: the batch report states token count and rupee cost for
    // the run that produced it. Anything missing here has to be back-filled
    // from a provider dashboard, which is not an audit trail.
    const cols = Object.keys(getTableColumns(aiCalls));

    for (const col of [
      "batchId",
      "recordId",
      "model",
      "promptVersion",
      "inputTokens",
      "outputTokens",
      "latencyMs",
      "costMicroUsd",
      "verdict",
    ]) {
      expect(cols).toContain(col);
    }
  });

  it("splits cached input from fresh input", () => {
    // Anthropic bills a cache read at 0.1x and a cache write at 1.25x. A single
    // input_tokens column would price every call as if none of the prompt were
    // cached, overstating cost by most of the saving PRD Section 9 claims
    // prompt caching delivers — the one number this table exists to get right.
    const cols = Object.keys(getTableColumns(aiCalls));
    expect(cols).toContain("cacheReadTokens");
    expect(cols).toContain("cacheWriteTokens");
  });

  it("records what the policy gate did, including that it fired", () => {
    // "The gate never triggered" is only worth anything if a triggered gate
    // would have left a row saying so. PRD Section 15.3.
    expect(aiCallVerdict.enumValues).toEqual([
      "ACCEPTED",
      "COERCED_UNEXPLAINED",
      "BLOCKED_WRITE",
      "FAILED",
      // Explain's citation gate. Kept distinct from FAILED because an answer
      // that invented a record id is a prompt problem and a call that returned
      // nothing is an infrastructure one. PRD Section 15.5.
      "INVALID_CITATION",
    ]);
  });

  it("allows a batch-level call with no record", () => {
    // Investigate runs per record; Explain answers a question about the whole
    // batch. Forcing a record id would make the Explain layer unloggable.
    expect(getTableColumns(aiCalls).recordId.notNull).toBe(false);
    expect(getTableColumns(aiCalls).batchId.notNull).toBe(true);
  });
});
