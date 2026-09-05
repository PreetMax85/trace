import { describe, expect, it } from "vitest";
import { READ_ONLY_EXPLAIN_TOOL_NAMES, createExplainTools } from "@/lib/explain/tools";
import { loadReviewBatch } from "@/lib/review/batch";

const batch = loadReviewBatch();
const tools = createExplainTools(batch);

/** Vitest calls `execute` directly, so it supplies the context the SDK would. */
const call = async <I, O>(
  t: { execute?: (input: I, opts: never) => PromiseLike<O> | O },
  input: I,
): Promise<Exclude<Awaited<O>, AsyncIterable<unknown>>> =>
  (await t.execute!(input, undefined as never)) as Exclude<Awaited<O>, AsyncIterable<unknown>>;

describe("the tool surface", () => {
  it("is exactly the read-only allowlist", () => {
    // The permission boundary is enforced by comparing the tools handed to the
    // runner against this list. If the two drift the check passes vacuously.
    expect(Object.keys(tools).sort()).toEqual([...READ_ONLY_EXPLAIN_TOOL_NAMES].sort());
  });
});

describe("batchTotals", () => {
  it("reports the period's figures as the audit trail holds them", async () => {
    // Asserted against the locked figures for this period, not against the
    // header this tool reads from — otherwise the test recomputes the code.
    const out = await call(tools.batchTotals, {});

    expect(out.invoiceTaxPaise).toBe(119692);
    expect(out.itcClaimablePaise).toBe(98223);
    expect(out.itcAtRiskPaise).toBe(21469);
    expect(out.rolledUpTaxPaise).toBe(85587);
    expect(out.rollupDeltaPaise).toBe(34105);
    expect(out.totalRecords).toBe(54);
    expect(out.matchedCount).toBe(38);
    expect(out.exceptionCount).toBe(16);
  });
});

describe("listRecords", () => {
  it("narrows to one exception category", async () => {
    // Four refunds were netted in this period (PRD Section 13's locked
    // breakdown), so this is asserted against the dataset design, not the code.
    const out = await call(tools.listRecords, { category: "REFUND_NETTED" });

    expect(out.matching).toBe(4);
    expect(out.records.every((record) => record.category === "REFUND_NETTED")).toBe(true);
    expect(out.truncated).toBe(false);
  });

  it("says so when it returns fewer records than matched", async () => {
    // 38 rows matched and the cap is 25. A model handed a silently shortened
    // list would report 25 as the total, which is the one arithmetic error a
    // reconciliation product cannot afford.
    const out = await call(tools.listRecords, { status: "MATCHED" });

    expect(out.matching).toBe(38);
    expect(out.returned).toBe(25);
    expect(out.records).toHaveLength(25);
    expect(out.truncated).toBe(true);
  });

  it("returns every flagged record without truncating", async () => {
    const out = await call(tools.listRecords, { status: "EXCEPTION" });

    expect(out.matching).toBe(16);
    expect(out.truncated).toBe(false);
  });
});

describe("getRecord", () => {
  it("reports a record the batch does not hold as absent, rather than failing", async () => {
    // This is the answer that stops a citation being invented: "that record is
    // not in this batch" is information the model can act on.
    const out = await call(tools.getRecord, { recordId: "pay_NeverExisted1" });

    expect(out.found).toBe(false);
  });

  it("returns the figures held about a real record", async () => {
    const [first] = batch.rows;
    const out = await call(tools.getRecord, { recordId: first.recordId });

    expect(out.found).toBe(true);
    expect(out).toMatchObject({ recordId: first.recordId, taxPaise: first.taxPaise });
  });
});

describe("taxByCategory", () => {
  it("breaks the period's GST down the way the locked figures do", async () => {
    const out = await call(tools.taxByCategory, {});
    const byCategory = new Map(out.groups.map((group) => [group.category, group]));

    // Each figure below is one of the period's locked totals, and they
    // cross-check each other: the four unexplained fee deductions ARE the ITC
    // at risk, and the timing rows' tax IS August's invoice tax.
    expect(byCategory.get("FEE_DEDUCTION")).toMatchObject({ records: 4, taxPaise: 21469 });
    expect(byCategory.get("REFUND_NETTED")).toMatchObject({ records: 4, taxPaise: 12636 });
    expect(byCategory.get("TIMING")).toMatchObject({ records: 5, taxPaise: 19530 });
    expect(byCategory.get("PARTIAL_PAYMENT")).toMatchObject({ records: 3, taxPaise: 0 });
    expect(byCategory.get("MATCHED")).toMatchObject({ records: 38, taxPaise: 85587 });
  });

  it("accounts for every record in the batch exactly once", async () => {
    const out = await call(tools.taxByCategory, {});

    expect(out.groups.reduce((total, group) => total + group.records, 0)).toBe(54);
  });

  it("adds the two July exception groups up to the rollup delta", async () => {
    // The delta is 34105, and it is the fee deductions plus the netted refunds.
    // Timing rows are billed in August, so they are deliberately not in it.
    const out = await call(tools.taxByCategory, {});
    const tax = (category: string) =>
      out.groups.find((group) => group.category === category)?.taxPaise ?? 0;

    expect(tax("FEE_DEDUCTION") + tax("REFUND_NETTED")).toBe(34105);
  });
});
