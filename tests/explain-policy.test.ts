import { describe, expect, it } from "vitest";
import { applyExplainGate, unauthorisedExplainTools } from "@/lib/explain/policy";

const KNOWN = new Set(["pay_4gaSMyqces2Qkk", "pay_GQiwcS8koSo6mm"]);

describe("applyExplainGate", () => {
  it("accepts an answer whose every citation is a record in the batch", () => {
    const gated = applyExplainGate(
      { answer: "The shortfall is the fee on [pay_4gaSMyqces2Qkk]." },
      KNOWN,
    );

    expect(gated.verdict).toBe("ACCEPTED");
    expect(gated.cited).toEqual(["pay_4gaSMyqces2Qkk"]);
    expect(gated.unknown).toEqual([]);
  });
});

describe("applyExplainGate — an answer that goes beyond the evidence", () => {
  it("keeps the words, withholds the link, and says which record was invented", () => {
    const gated = applyExplainGate(
      { answer: "Most of it is [pay_4gaSMyqces2Qkk], the rest [pay_NeverExisted1]." },
      KNOWN,
    );

    expect(gated.verdict).toBe("INVALID_CITATION");
    expect(gated.answer).toBe("Most of it is [pay_4gaSMyqces2Qkk], the rest [pay_NeverExisted1].");
    expect(gated.cited).toEqual(["pay_4gaSMyqces2Qkk"]);
    expect(gated.unknown).toEqual(["pay_NeverExisted1"]);
    expect(gated.segments).not.toContainEqual({ kind: "citation", recordId: "pay_NeverExisted1" });
  });
});

describe("applyExplainGate — what it refuses outright", () => {
  it("refuses an answer that also tries to classify a record", () => {
    // Explain is read-only and may not classify; that is Investigate's
    // authority. The schema is strict, so a category field does not decode at
    // all rather than being quietly dropped.
    const gated = applyExplainGate(
      { answer: "The fee is unexplained.", category: "FEE_DEDUCTION" },
      KNOWN,
    );

    expect(gated.verdict).toBe("FAILED");
    expect(gated.answer).toBeNull();
  });

  it("refuses a call that produced nothing", () => {
    expect(applyExplainGate(undefined, KNOWN).verdict).toBe("FAILED");
    expect(applyExplainGate({ answer: "" }, KNOWN).verdict).toBe("FAILED");
  });

  it("refuses an answer longer than the schema allows", () => {
    const gated = applyExplainGate({ answer: "x".repeat(901) }, KNOWN);

    expect(gated.verdict).toBe("FAILED");
  });

  it("distinguishes an uncheckable answer from a missing one", () => {
    // Both are failures, but a model inventing record ids is a prompt problem
    // and a call returning nothing is an infrastructure one. Collapsing them
    // would hide a regression inside rate-limit noise.
    const invented = applyExplainGate({ answer: "See [pay_NeverExisted1]." }, KNOWN);
    const missing = applyExplainGate(null, KNOWN);

    expect(invented.verdict).not.toBe(missing.verdict);
  });
});

describe("unauthorisedExplainTools", () => {
  it("allows exactly the four read-only tools Explain ships with", () => {
    expect(
      unauthorisedExplainTools(["batchTotals", "listRecords", "getRecord", "taxByCategory"]),
    ).toEqual([]);
  });

  it("refuses anything that writes", () => {
    expect(unauthorisedExplainTools(["batchTotals", "confirmAction"])).toEqual(["confirmAction"]);
  });

  it("refuses Investigate's tools too, because Explain's boundary is stricter", () => {
    // Explain may not classify, so it has no business holding the tools that
    // gather classification evidence. Two separate allowlists is what makes
    // this true rather than aspirational.
    expect(unauthorisedExplainTools(["findRefundsForPayment", "priceAtPublishedRates"])).toEqual([
      "findRefundsForPayment",
      "priceAtPublishedRates",
    ]);
  });
});
