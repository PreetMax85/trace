import { describe, expect, it } from "vitest";
import { applyPolicyGate, isKnownCategory, unauthorisedTools } from "@/lib/agent/policy";
import { REASON_MAX_CHARS } from "@/lib/agent/schema";
import { READ_ONLY_TOOL_NAMES } from "@/lib/agent/tools";
import { NANO_USD_PER_TOKEN, costMicroUsd, splitUsage } from "@/lib/agent/pricing";

describe("the policy gate", () => {
  it("accepts one of the five unchanged", () => {
    const out = applyPolicyGate({ category: "TIMING", reason: "Settled 1 August." });
    expect(out).toEqual({
      category: "TIMING",
      reason: "Settled 1 August.",
      verdict: "ACCEPTED",
      rejected: null,
    });
  });

  it("forces a sixth category to UNEXPLAINED and records what was said", () => {
    // PRD Section 15.3's "done when": push the model toward a category outside
    // the five, and the batch still records one of the five.
    const out = applyPolicyGate({ category: "BANK_ERROR", reason: "The bank failed." });
    expect(out.category).toBe("UNEXPLAINED");
    expect(out.verdict).toBe("COERCED_UNEXPLAINED");
    expect(out.rejected).toBe("BANK_ERROR");
    expect(out.reason).toBe("The bank failed.");
  });

  it("keeps a coerced answer's reasoning, because that is when a human wants it", () => {
    const out = applyPolicyGate({ category: "CHARGEBACK", reason: "Disputed by the cardholder." });
    expect(out.reason).toBe("Disputed by the cardholder.");
  });

  it("distinguishes no answer at all from a wrong answer", () => {
    // A model that returned nothing usable is a different failure from one
    // that classified into a category we reject. Collapsing the two would hide
    // a prompt regression inside a noise bucket.
    for (const nothing of [null, undefined, "TIMING", 42, {}, { reason: "no category" }]) {
      const out = applyPolicyGate(nothing);
      expect(out.verdict).toBe("FAILED");
      expect(out.category).toBe("UNEXPLAINED");
      expect(out.rejected).toBeNull();
    }
  });

  it("never returns a null category", () => {
    // A record has to land somewhere. A null here would put a row in the audit
    // trail that no report counts and no person reviews.
    for (const junk of [null, {}, { category: "NONSENSE" }, [], "", 0]) {
      expect(applyPolicyGate(junk).category).toBeTruthy();
    }
  });

  it("truncates an over-long reason instead of dropping it, and marks the cut", () => {
    const out = applyPolicyGate({
      category: "WHATEVER",
      reason: "x".repeat(REASON_MAX_CHARS + 50),
    });
    expect(out.reason).toHaveLength(REASON_MAX_CHARS);
    expect(out.reason?.endsWith("…")).toBe(true);
  });

  it("recognises exactly the five and nothing else", () => {
    for (const good of READ_ONLY_TOOL_NAMES) expect(isKnownCategory(good)).toBe(false);
    expect(isKnownCategory("UNEXPLAINED")).toBe(true);
    expect(isKnownCategory("FEE_DEDUCTION")).toBe(true);
    expect(isKnownCategory("ITC_INELIGIBLE")).toBe(false);
  });
});

describe("the tool allowlist", () => {
  it("permits the read-only tools", () => {
    expect(unauthorisedTools([...READ_ONLY_TOOL_NAMES])).toEqual([]);
  });

  it("rejects anything that could write", () => {
    // Investigate may classify, may not write (PRD Section 9). Stated in the
    // prompt and enforced here, because a prompt is a request, not a check.
    expect(unauthorisedTools(["findOrderSiblings", "updateRecord"])).toEqual(["updateRecord"]);
    expect(unauthorisedTools(["sendCaEmail"])).toEqual(["sendCaEmail"]);
  });

  it("rejects an empty-string tool name", () => {
    expect(unauthorisedTools([""])).toEqual([""]);
  });
});

describe("cost", () => {
  it("prices an uncached call at the published rates", () => {
    const cost = costMicroUsd({
      inputTokens: 1000,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 100,
    });
    // 1000 * 5000 + 100 * 25000 = 7,500,000 nano-USD = 7500 micro = $0.0075
    expect(cost).toBe(7500);
  });

  it("charges cached input at a tenth and a cache write at 1.25x", () => {
    const cached = costMicroUsd({
      inputTokens: 1000,
      cacheReadTokens: 1000,
      cacheWriteTokens: 0,
      outputTokens: 0,
    });
    const uncached = costMicroUsd({
      inputTokens: 1000,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 0,
    });
    expect(cached * 10).toBe(uncached);

    const written = costMicroUsd({
      inputTokens: 1000,
      cacheReadTokens: 0,
      cacheWriteTokens: 1000,
      outputTokens: 0,
    });
    expect(written).toBe(uncached * 1.25);
  });

  it("treats inputTokens as the total, not as the uncached remainder", () => {
    // If this were read as "uncached input PLUS cached on top", every cached
    // call would be billed for tokens that were never charged at full rate,
    // and the batch report would overstate its own cost.
    const split = { inputTokens: 1000, cacheReadTokens: 900, cacheWriteTokens: 0, outputTokens: 0 };
    const expected = 100 * NANO_USD_PER_TOKEN.input + 900 * NANO_USD_PER_TOKEN.cacheRead;
    expect(costMicroUsd(split)).toBe(Math.round(expected / 1000));
  });

  it("never goes negative when the cache figures exceed the total", () => {
    // A provider reporting an inconsistent breakdown must not produce a
    // negative cost that silently subtracts from the batch total.
    expect(
      costMicroUsd({
        inputTokens: 10,
        cacheReadTokens: 900,
        cacheWriteTokens: 0,
        outputTokens: 0,
      }),
    ).toBeGreaterThanOrEqual(0);
  });

  it("rounds once at the end, not per line item", () => {
    // Two of the four rates are fractional in micro-USD — a cache read is
    // 0.5 and a cache write 6.25 — so rounding each line separately and
    // rounding the sum give different answers. Here: 500 + 18750 nano-USD is
    // 19.25 micro, which rounds to 19; rounding the parts first gives 1 + 19
    // = 20. Over 54 records that drift is exactly the size of the saving the
    // batch report exists to demonstrate, so it has to round once.
    expect(
      costMicroUsd({
        inputTokens: 4,
        cacheReadTokens: 1,
        cacheWriteTokens: 3,
        outputTokens: 0,
      }),
    ).toBe(19);
  });

  it("survives a provider that reports no usage at all", () => {
    expect(splitUsage(undefined)).toEqual({
      inputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 0,
    });
    expect(costMicroUsd(splitUsage(undefined))).toBe(0);
  });

  it("rebuilds inputTokens from the provider's own breakdown", () => {
    const split = splitUsage({
      inputTokens: 99999,
      inputTokenDetails: { noCacheTokens: 100, cacheReadTokens: 900, cacheWriteTokens: 0 },
      outputTokens: 50,
      outputTokenDetails: { textTokens: 50, reasoningTokens: 0 },
      totalTokens: 1050,
    });
    // 99999 is the provider contradicting itself. Trusting the total would
    // store a row whose four columns do not reconcile to its own cost.
    expect(split.inputTokens).toBe(1000);
    expect(split.cacheReadTokens).toBe(900);
    expect(split.outputTokens).toBe(50);
  });
});
