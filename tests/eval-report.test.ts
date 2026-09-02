import { describe, expect, it } from "vitest";
import { formatEvalReport } from "@/lib/eval/report";
import type { EvalScore } from "@/lib/eval/score";

const score = (over: Partial<EvalScore> = {}): EvalScore => ({
  totalRecords: 54,
  matchedDeterministically: 38,
  investigated: 16,
  agreed: 15,
  disagreements: [],
  ...over,
});

const meta = { promptVersion: "investigate-v1", modelId: "gemini-2.5-flash" };

describe("formatEvalReport", () => {
  it("prints the full accounting, so no number stands alone", () => {
    const report = formatEvalReport(score(), meta);

    expect(report).toContain("investigate-v1");
    expect(report).toContain("gemini-2.5-flash");
    expect(report).toContain("54 records");
    expect(report).toContain("38 matched deterministically");
    expect(report).toContain("16 investigated");
    expect(report).toContain("agreement 15/16 (93.8%)");
  });

  it("lists every disagreement with both verdicts and the agent's reason", () => {
    const report = formatEvalReport(
      score({
        agreed: 14,
        disagreements: [
          {
            entityId: "pay_Nx4kR2ptDd0lQq",
            expected: "TIMING",
            actual: "FEE_DEDUCTION",
            reason: "The fee exceeds 2.00% of the capture.",
            verdict: "ACCEPTED",
          },
          {
            entityId: "pay_S2s6M2O4AEQkOA",
            expected: "REFUND_NETTED",
            actual: null,
            reason: null,
            verdict: null,
          },
        ],
      }),
      meta,
    );

    expect(report).toContain("DISAGREEMENTS (2)");
    expect(report).toContain("pay_Nx4kR2ptDd0lQq");
    expect(report).toContain("TIMING");
    expect(report).toContain("FEE_DEDUCTION");
    expect(report).toContain("ACCEPTED");
    expect(report).toContain("The fee exceeds 2.00% of the capture.");
    // An unanswered record must read as unanswered, never as a blank category
    // that a reader could mistake for "the agent said nothing was wrong".
    expect(report).toContain("no answer");
  });

  it("does not print NaN when nothing was investigated", () => {
    const report = formatEvalReport(
      score({ totalRecords: 0, matchedDeterministically: 0, investigated: 0, agreed: 0 }),
      meta,
    );

    expect(report).not.toContain("NaN");
    expect(report).toContain("agreement 0/0");
  });
});
