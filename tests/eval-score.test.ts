import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scoreEval, type EvalAnswer, type ExpectedRecord } from "@/lib/eval/score";

/** A matched row: the deterministic matcher resolved it, so the model never sees it. */
const matched = (entityId: string): ExpectedRecord => ({
  entity_id: entityId,
  status: "MATCHED",
  match_method: "EXACT",
  exception_category: null,
});

/** An exception row: this is what Investigate is asked to classify. */
const exception = (
  entityId: string,
  category: ExpectedRecord["exception_category"],
): ExpectedRecord => ({
  entity_id: entityId,
  status: "EXCEPTION",
  match_method: "NONE",
  exception_category: category,
});

const answer = (
  entityId: string,
  category: EvalAnswer["category"],
  over: Partial<EvalAnswer> = {},
): EvalAnswer => ({
  entityId,
  category,
  reason: "Because the evidence said so.",
  verdict: "ACCEPTED",
  ...over,
});

describe("scoreEval — agreement", () => {
  it("counts every exception the agent got right, and ignores the matched rows", () => {
    const expected: ExpectedRecord[] = [
      matched("pay_a"),
      matched("pay_b"),
      exception("pay_c", "TIMING"),
      exception("pay_d", "REFUND_NETTED"),
    ];
    const answers: EvalAnswer[] = [answer("pay_c", "TIMING"), answer("pay_d", "REFUND_NETTED")];

    const score = scoreEval(expected, answers);

    expect(score.totalRecords).toBe(4);
    expect(score.matchedDeterministically).toBe(2);
    expect(score.investigated).toBe(2);
    expect(score.agreed).toBe(2);
    expect(score.disagreements).toEqual([]);
  });

  it("reports a disagreement with both verdicts and the agent's own reason", () => {
    const expected = [exception("pay_c", "TIMING"), exception("pay_d", "REFUND_NETTED")];
    const answers = [
      answer("pay_c", "FEE_DEDUCTION", { reason: "The fee exceeds 2.00% of the capture." }),
      answer("pay_d", "REFUND_NETTED"),
    ];

    const score = scoreEval(expected, answers);

    expect(score.agreed).toBe(1);
    expect(score.disagreements).toEqual([
      {
        entityId: "pay_c",
        expected: "TIMING",
        actual: "FEE_DEDUCTION",
        reason: "The fee exceeds 2.00% of the capture.",
        verdict: "ACCEPTED",
      },
    ]);
  });
});

describe("scoreEval — a run that did not finish", () => {
  it("counts an unanswered exception against agreement rather than skipping it", () => {
    const expected = [
      exception("pay_c", "TIMING"),
      exception("pay_d", "REFUND_NETTED"),
      exception("pay_e", "FEE_DEDUCTION"),
    ];
    // The run stopped after one record — a rate limit, a crash, an interrupt.
    const answers = [answer("pay_c", "TIMING")];

    const score = scoreEval(expected, answers);

    expect(score.investigated).toBe(3);
    expect(score.agreed).toBe(1);
    expect(score.disagreements).toEqual([
      {
        entityId: "pay_d",
        expected: "REFUND_NETTED",
        actual: null,
        reason: null,
        verdict: null,
      },
      {
        entityId: "pay_e",
        expected: "FEE_DEDUCTION",
        actual: null,
        reason: null,
        verdict: null,
      },
    ]);
  });
});

describe("scoreEval — an answer it cannot account for", () => {
  it("refuses an answer for a record that is not in the ground truth", () => {
    const expected = [exception("pay_c", "TIMING")];
    const answers = [answer("pay_c", "TIMING"), answer("pay_ghost", "FEE_DEDUCTION")];

    expect(() => scoreEval(expected, answers)).toThrow(/pay_ghost/);
  });

  it("refuses an answer for a row the deterministic matcher already resolved", () => {
    const expected = [matched("pay_a"), exception("pay_c", "TIMING")];
    const answers = [answer("pay_c", "TIMING"), answer("pay_a", "FEE_DEDUCTION")];

    expect(() => scoreEval(expected, answers)).toThrow(/pay_a/);
  });

  it("refuses two answers for the same record instead of silently taking one", () => {
    const expected = [exception("pay_c", "TIMING")];
    // The disagreeing pair is the point: taking either one silently would make
    // the score depend on argument order.
    const answers = [answer("pay_c", "TIMING"), answer("pay_c", "FEE_DEDUCTION")];

    expect(() => scoreEval(expected, answers)).toThrow(/pay_c/);
  });
});

describe("scoreEval — the score cannot depend on order", () => {
  it("returns the same score whichever order the answers arrive in", () => {
    const expected = [
      exception("pay_c", "TIMING"),
      exception("pay_d", "REFUND_NETTED"),
      exception("pay_e", "FEE_DEDUCTION"),
    ];
    const answers = [
      answer("pay_c", "TIMING"),
      answer("pay_d", "PARTIAL_PAYMENT"),
      answer("pay_e", "FEE_DEDUCTION"),
    ];

    const forwards = scoreEval(expected, answers);
    const backwards = scoreEval(expected, [...answers].reverse());

    // Not just the same count — the same disagreements in the same order, so a
    // run's report is reproducible rather than a function of arrival order.
    expect(backwards).toEqual(forwards);
    expect(forwards.disagreements.map((d) => d.entityId)).toEqual(["pay_d"]);
  });
});

describe("scoreEval — against the real ground truth", () => {
  it("finds exactly the 16 exceptions the locked breakdown names", () => {
    const truth = JSON.parse(
      readFileSync("data/synthetic/expected.json", "utf8"),
    ) as { records: ExpectedRecord[] };

    // A run with no answers at all: every exception is a disagreement, which
    // makes this a check on the FIXTURE's shape rather than on any model.
    const score = scoreEval(truth.records, []);

    expect(score.totalRecords).toBe(54);
    expect(score.matchedDeterministically).toBe(38);
    expect(score.investigated).toBe(16);
    expect(score.agreed).toBe(0);
    expect(score.disagreements).toHaveLength(16);

    const byCategory = new Map<string, number>();
    for (const d of score.disagreements) {
      byCategory.set(d.expected, (byCategory.get(d.expected) ?? 0) + 1);
    }
    expect(Object.fromEntries(byCategory)).toEqual({
      TIMING: 5,
      REFUND_NETTED: 4,
      FEE_DEDUCTION: 4,
      PARTIAL_PAYMENT: 3,
    });
  });
});
