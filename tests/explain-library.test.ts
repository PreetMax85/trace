import { describe, expect, it } from "vitest";
import explanationsJson from "../data/synthetic/explanations.json";
import { applyExplainGate } from "@/lib/explain/policy";
import { loadReviewBatch } from "@/lib/review/batch";
import { EXAMPLE_QUESTIONS, explanationFor, parseExplanations } from "@/lib/explain/library";

const recorded = (over: Record<string, unknown> = {}) => ({
  id: EXAMPLE_QUESTIONS[0].id,
  question: EXAMPLE_QUESTIONS[0].question,
  answer: "₹214.69 of GST is at risk on [pay_4gaSMyqces2Qkk].",
  verdict: "ACCEPTED",
  cited: ["pay_4gaSMyqces2Qkk"],
  unknown: [],
  model: "claude-opus-5",
  promptVersion: "explain-v1",
  recordedAt: "2026-09-03T09:00:00.000Z",
  latencyMs: 4200,
  inputTokens: 1200,
  outputTokens: 180,
  costMicroUsd: 10500,
  ...over,
});

describe("the example questions", () => {
  it("gives every question a stable id, so an answer survives a reworded question", () => {
    const ids = EXAMPLE_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("parseExplanations", () => {
  it("reads an empty file as no answers recorded yet", () => {
    expect(parseExplanations([]).size).toBe(0);
  });

  it("keys a recorded answer by its question id", () => {
    const byId = parseExplanations([recorded()]);
    expect(byId.get(EXAMPLE_QUESTIONS[0].id)?.answer).toContain("₹214.69");
  });

  it("refuses a file holding two answers to one question", () => {
    // Two runs merged into one file. The last would silently win, and the panel
    // would show one run's answer beside another run's provenance.
    expect(() => parseExplanations([recorded(), recorded()])).toThrow(/twice/);
  });

  it("refuses a malformed file rather than rendering blanks", () => {
    expect(() => parseExplanations([{ id: "x" }])).toThrow(/malformed/);
  });
});

describe("explanationFor", () => {
  it("returns the answer recorded against that exact question", () => {
    const byId = parseExplanations([recorded()]);

    expect(explanationFor(EXAMPLE_QUESTIONS[0], byId)?.answer).toContain("₹214.69");
  });

  it("reports no answer when the question has been reworded since it was recorded", () => {
    // Showing a recorded reply under a question it was never asked is worse
    // than showing no reply: the reply looks like an answer and is not one.
    const byId = parseExplanations([recorded({ question: "Some older wording?" })]);

    expect(explanationFor(EXAMPLE_QUESTIONS[0], byId)).toBeNull();
  });

  it("reports no answer when nothing has been recorded for that question", () => {
    expect(explanationFor(EXAMPLE_QUESTIONS[1], parseExplanations([]))).toBeNull();
  });
});

describe("the committed answers file", () => {
  const known = new Set(loadReviewBatch().rows.map((row) => row.recordId));

  it("holds answers whose citations still resolve against the real batch", () => {
    // A recorded answer carries the verdict its run reached. Re-checking the
    // text against today's batch is what catches a file that has fallen behind
    // the data — an answer citing a record the fixture no longer contains would
    // otherwise render as a live link to nothing.
    for (const answer of parseExplanations(explanationsJson).values()) {
      if (answer.answer === null) continue;

      const rechecked = applyExplainGate({ answer: answer.answer }, known);
      expect(rechecked.verdict).toBe(answer.verdict);
      expect(rechecked.cited).toEqual(answer.cited);
      expect(rechecked.unknown).toEqual(answer.unknown);
    }
  });

  it("would catch an answer whose recorded verdict contradicts its text", () => {
    // The loop above iterates a file that is empty until a real run happens, so
    // on its own it proves nothing. This asserts the check DISCRIMINATES, which
    // is the part that cannot be established by an empty loop.
    const rechecked = applyExplainGate({ answer: "See [pay_NeverExisted1]." }, known);

    expect(rechecked.verdict).not.toBe("ACCEPTED");
    expect(rechecked.unknown).toEqual(["pay_NeverExisted1"]);
  });
});
