import { tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { MODEL_ID } from "@/lib/agent/pricing";
import { explain } from "@/lib/explain/explain";
import { EXPLAIN_PROMPT_VERSION } from "@/lib/explain/schema";
import { loadReviewBatch } from "@/lib/review/batch";

const batch = loadReviewBatch();
const real = batch.rows.find((row) => row.category === "FEE_DEDUCTION")!.recordId;

const usage = (over: Partial<{ noCache: number; cacheRead: number; out: number }> = {}) => ({
  inputTokens: {
    total: (over.noCache ?? 1200) + (over.cacheRead ?? 0),
    noCache: over.noCache ?? 1200,
    cacheRead: over.cacheRead ?? undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: over.out ?? 180, text: over.out ?? 180, reasoning: undefined },
});

const answers = (text: string, over = {}) => ({
  content: [{ type: "text" as const, text }],
  finishReason: { unified: "stop" as const, raw: undefined },
  usage: usage(over),
  warnings: [],
});

/** A clock that advances a fixed amount per read, so latency is asserted, not raced. */
const fixedClock = (stepMs: number) => {
  let t = 1_000;
  return () => {
    const current = t;
    t += stepMs;
    return current;
  };
};

const run = (model: MockLanguageModelV4, over = {}) =>
  explain({
    model,
    question: "Why is my settlement short this month?",
    batch,
    batchId: "11111111-1111-1111-1111-111111111111",
    now: fixedClock(400),
    ...over,
  });

describe("explain — the happy path", () => {
  it("accepts an answer that cites a real record, and builds its audit row", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () =>
        answers(JSON.stringify({ answer: `₹214.69 of GST is at risk, starting with [${real}].` })),
    });

    const out = await run(model);

    expect(out.verdict).toBe("ACCEPTED");
    expect(out.cited).toEqual([real]);
    expect(out.unknown).toEqual([]);
    expect(out.segments).toContainEqual({ kind: "citation", recordId: real });

    expect(out.aiCall.layer).toBe("EXPLAIN");
    expect(out.aiCall.model).toBe(MODEL_ID);
    expect(out.aiCall.promptVersion).toBe(EXPLAIN_PROMPT_VERSION);
    expect(out.aiCall.verdict).toBe("ACCEPTED");
    expect(out.aiCall.latencyMs).toBe(400);
    expect(out.aiCall.inputTokens).toBe(1200);
    expect(out.aiCall.outputTokens).toBe(180);
    // The answer itself is on the audit row. Without it the trail records that
    // a question was asked and what it cost, but not what the merchant was
    // told — which is the only part anyone would later need to check.
    expect(out.aiCall.reason).toBe(`₹214.69 of GST is at risk, starting with [${real}].`);
  });

  it("records no record id and no category, because Explain does neither", async () => {
    // Both nulls are the permission boundary, written down where an audit query
    // can check it: Explain answers about a whole batch and may not classify.
    const model = new MockLanguageModelV4({
      doGenerate: async () => answers(JSON.stringify({ answer: "Nothing is at risk." })),
    });

    const out = await run(model);

    expect(out.aiCall.recordId).toBeNull();
    expect(out.aiCall.category).toBeNull();
  });
});

describe("explain — the citation gate", () => {
  it("flags an answer that names a record the batch does not hold", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () =>
        answers(JSON.stringify({ answer: `Look at [${real}] and [pay_NeverExisted1].` })),
    });

    const out = await run(model);

    expect(out.verdict).toBe("INVALID_CITATION");
    expect(out.aiCall.verdict).toBe("INVALID_CITATION");
    expect(out.unknown).toEqual(["pay_NeverExisted1"]);
    // The prose survives. Discarding it would leave the reader nothing to check.
    expect(out.answer).toContain("pay_NeverExisted1");
    expect(out.segments).not.toContainEqual({
      kind: "citation",
      recordId: "pay_NeverExisted1",
    });
  });
});

describe("explain — the permission boundary", () => {
  it("refuses a tool that writes without ever calling the model", async () => {
    // Checked before the call, not after. A boundary that only inspects the
    // answer has already let the tool run.
    let called = false;
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        called = true;
        return answers(JSON.stringify({ answer: "done" }));
      },
    });

    const out = await run(model, {
      tools: {
        confirmAction: tool({
          description: "Confirm and send a drafted action.",
          inputSchema: z.object({ actionId: z.string() }),
          execute: async () => ({ sent: true }),
        }),
      },
    });

    expect(called).toBe(false);
    expect(out.verdict).toBe("BLOCKED_WRITE");
    expect(out.answer).toBeNull();
    expect(out.aiCall.reason).toContain("confirmAction");
    expect(out.aiCall.verdict).toBe("BLOCKED_WRITE");
  });

  it("refuses Investigate's tools, which Explain has no authority to hold", async () => {
    let called = false;
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        called = true;
        return answers(JSON.stringify({ answer: "done" }));
      },
    });

    const out = await run(model, {
      tools: {
        findRefundsForPayment: tool({
          description: "Investigate's own tool.",
          inputSchema: z.object({ paymentId: z.string() }),
          execute: async () => ({ count: 0 }),
        }),
      },
    });

    expect(called).toBe(false);
    expect(out.verdict).toBe("BLOCKED_WRITE");
  });

  it("refuses an answer that also tries to classify a record", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () =>
        answers(JSON.stringify({ answer: "This fee is unexplained.", category: "FEE_DEDUCTION" })),
    });

    const out = await run(model);

    expect(out.verdict).toBe("FAILED");
    expect(out.answer).toBeNull();
  });
});

describe("explain — what it records for the trace", () => {
  it("keeps the tool calls it made and what they returned", async () => {
    let step = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        step += 1;
        if (step === 1) {
          return {
            content: [
              {
                type: "tool-call" as const,
                toolCallId: "call-1",
                toolName: "taxByCategory",
                input: JSON.stringify({}),
              },
            ],
            finishReason: { unified: "tool-calls" as const, raw: undefined },
            usage: usage(),
            warnings: [],
          };
        }
        return answers(JSON.stringify({ answer: `₹214.69 is at risk on [${real}].` }));
      },
    });

    const out = await run(model);

    expect(out.toolCalls).toHaveLength(1);
    expect(out.toolCalls[0].toolName).toBe("taxByCategory");
    expect(out.aiCall.toolCalls).toEqual(out.toolCalls);
  });

  it("reports a call that produced nothing as failed, not as an empty answer", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new Error("rate limited");
      },
    });

    const out = await run(model);

    expect(out.verdict).toBe("FAILED");
    expect(out.answer).toBeNull();
    expect(out.segments).toEqual([]);
  });
});
