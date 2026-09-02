import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { bakeAnswers, isCompleteBake } from "@/lib/explain/bake";
import { EXAMPLE_QUESTIONS } from "@/lib/explain/library";
import { loadReviewBatch } from "@/lib/review/batch";

const batch = loadReviewBatch();
const real = batch.rows.find((row) => row.category === "FEE_DEDUCTION")!.recordId;

const answers = (text: string) => ({
  content: [{ type: "text" as const, text }],
  finishReason: { unified: "stop" as const, raw: undefined },
  usage: {
    inputTokens: { total: 1000, noCache: 1000, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 150, text: 150, reasoning: undefined },
  },
  warnings: [],
});

const goodModel = () =>
  new MockLanguageModelV4({
    doGenerate: async () => answers(JSON.stringify({ answer: `₹214.69 sits on [${real}].` })),
  });

const bake = (model: MockLanguageModelV4, over = {}) =>
  bakeAnswers({
    model,
    batch,
    questions: EXAMPLE_QUESTIONS,
    batchId: "11111111-1111-1111-1111-111111111111",
    delayMs: 0,
    sleep: async () => {},
    now: () => new Date("2026-09-03T09:00:00.000Z"),
    ...over,
  });

describe("bakeAnswers", () => {
  it("records one answer per question, with the wording it was asked", async () => {
    const out = await bake(goodModel());

    expect(out.answers).toHaveLength(EXAMPLE_QUESTIONS.length);
    expect(out.answers.map((a) => a.id)).toEqual(EXAMPLE_QUESTIONS.map((q) => q.id));
    // The wording is stored, not just the id. That is what lets a later reword
    // be detected instead of silently reusing an answer to a different question.
    expect(out.answers[0].question).toBe(EXAMPLE_QUESTIONS[0].question);
  });

  it("stamps every answer with the model and prompt that produced it", async () => {
    const out = await bake(goodModel());

    expect(out.answers[0].model).toBe("claude-opus-5");
    expect(out.answers[0].promptVersion).toBe("explain-v1");
    expect(out.answers[0].recordedAt).toBe("2026-09-03T09:00:00.000Z");
  });

  it("totals what the whole bake cost", async () => {
    const out = await bake(goodModel());

    expect(out.inputTokens).toBe(1000 * EXAMPLE_QUESTIONS.length);
    expect(out.outputTokens).toBe(150 * EXAMPLE_QUESTIONS.length);
    expect(out.costMicroUsd).toBeGreaterThan(0);
  });
});

describe("isCompleteBake", () => {
  it("accepts a run where every question was answered", async () => {
    const out = await bake(goodModel());

    expect(isCompleteBake(out.answers)).toBe(true);
  });

  it("rejects a run where any question failed", async () => {
    // A rate limit halfway through must not overwrite a good file with one that
    // permanently shows "the agent failed" under a real question.
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new Error("rate limited");
      },
    });

    const out = await bake(model);

    expect(out.answers.every((a) => a.verdict === "FAILED")).toBe(true);
    expect(isCompleteBake(out.answers)).toBe(false);
  });

  it("accepts a run whose answers were flagged for an invented citation", async () => {
    // The gate firing is a RESULT, not a failure to record. Refusing to write
    // it would hide the one case a reader most needs to see.
    const model = new MockLanguageModelV4({
      doGenerate: async () => answers(JSON.stringify({ answer: "See [pay_NeverExisted1]." })),
    });

    const out = await bake(model);

    expect(out.answers[0].verdict).toBe("INVALID_CITATION");
    expect(isCompleteBake(out.answers)).toBe(true);
  });
});
