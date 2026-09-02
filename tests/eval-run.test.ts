import { readFileSync } from "node:fs";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { MODEL_ID } from "@/lib/agent/pricing";
import { PROMPT_VERSION } from "@/lib/agent/schema";
import { runEval } from "@/lib/eval/run";
import { parseTraces } from "@/lib/review/trace";
import { parseSettlements } from "@/lib/ingestion";
import { matchBatch } from "@/lib/matching";
import { parseStatement } from "@/lib/ingestion";

const settlements = parseSettlements(
  JSON.parse(readFileSync("data/synthetic/settlements.json", "utf8")),
);
const statement = parseStatement(
  JSON.parse(readFileSync("data/synthetic/gstr2b-072026.json", "utf8")),
);
const result = matchBatch({ settlements, statement, period: "072026", mode: "exact+fuzzy" });
const byId = new Map(settlements.map((item) => [item.entity_id, item]));

/** The same queue the runner builds: the matcher's exceptions, joined to their recon rows. */
const queue = result.records
  .filter((r) => r.status === "EXCEPTION")
  .map((r) => ({ recordId: r.recordId, item: byId.get(r.recordId)! }));

const answers = (text: string) => ({
  content: [{ type: "text" as const, text }],
  finishReason: { unified: "stop" as const, raw: undefined },
  usage: {
    inputTokens: { total: 500, noCache: 500, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 40, text: 40, reasoning: undefined },
  },
  warnings: [],
});

const base = {
  batch: settlements,
  claimedPeriod: "072026",
  batchId: "11111111-1111-1111-1111-111111111111",
  delayMs: 0,
  retries: 0,
  // The loop must never actually wait in a test.
  sleep: async () => {},
};

describe("runEval", () => {
  it("classifies every queued record and totals the tokens it spent", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () =>
        answers(JSON.stringify({ category: "TIMING", reason: "Settled after the period closed." })),
    });

    const run = await runEval({ ...base, model, queue });

    expect(run.answers).toHaveLength(16);
    expect(run.answers.every((a) => a.category === "TIMING")).toBe(true);
    expect(run.answers.map((a) => a.entityId)).toEqual(queue.map((q) => q.recordId));
    expect(run.inputTokens).toBe(16 * 500);
    expect(run.outputTokens).toBe(16 * 40);
    expect(run.retried).toBe(0);
  });

  it("retries a FAILED call and keeps the answer the retry produced", async () => {
    let call = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        call += 1;
        // First call returns nothing usable — what a rate limit looks like once
        // investigate() has caught it. The second answers properly.
        return call === 1
          ? answers("not json at all")
          : answers(JSON.stringify({ category: "REFUND_NETTED", reason: "A refund was netted." }));
      },
    });

    const run = await runEval({ ...base, model, queue: queue.slice(0, 1), retries: 2 });

    expect(run.retried).toBe(1);
    expect(run.answers[0].category).toBe("REFUND_NETTED");
    expect(run.answers[0].verdict).toBe("ACCEPTED");
  });

  it("does not re-roll a classification the gate merely overrode", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () =>
        // A category outside the five: a real miss, not a transport failure.
        answers(JSON.stringify({ category: "CHARGEBACK", reason: "Looks like a chargeback." })),
    });

    const run = await runEval({ ...base, model, queue: queue.slice(0, 1), retries: 3 });

    expect(run.answers[0].verdict).toBe("COERCED_UNEXPLAINED");
    // Retrying this would launder a genuine wrong answer into a better score.
    expect(run.retried).toBe(0);
  });

  it("gives up after the retry budget and still records an answer", async () => {
    const model = new MockLanguageModelV4({ doGenerate: async () => answers("never valid") });

    const run = await runEval({ ...base, model, queue: queue.slice(0, 1), retries: 2 });

    expect(run.retried).toBe(2);
    expect(run.answers).toHaveLength(1);
    expect(run.answers[0].category).toBe("UNEXPLAINED");
  });
});

describe("runEval — the reasoning trace it hands to the screen", () => {
  it("records the tool calls and provenance for every record (PRD §15.1)", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () =>
        answers(JSON.stringify({ category: "TIMING", reason: "Settled after the period closed." })),
    });

    const run = await runEval({ ...base, model, queue: queue.slice(0, 1) });

    expect(run.traces).toHaveLength(1);
    const trace = run.traces[0];
    expect(trace.recordId).toBe(queue[0].recordId);
    expect(trace.category).toBe("TIMING");
    expect(trace.verdict).toBe("ACCEPTED");
    expect(trace.reason).toBe("Settled after the period closed.");
    // Provenance, without which a trace cannot be checked against the prompt
    // that produced it.
    expect(trace.model).toBe(MODEL_ID);
    expect(trace.promptVersion).toBe(PROMPT_VERSION);
    expect(trace.inputTokens).toBe(500);
    expect(trace.outputTokens).toBe(40);
  });

  it("writes a trace the screen's own parser accepts", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () =>
        answers(JSON.stringify({ category: "TIMING", reason: "Settled after the period closed." })),
    });

    const run = await runEval({ ...base, model, queue });

    // The two ends of the file are asserted against each other rather than each
    // against its own idea of the shape — a producer and a parser that agree
    // only in my head is exactly how this file goes stale unnoticed.
    const roundTripped = parseTraces(JSON.parse(JSON.stringify(run.traces)));
    expect(roundTripped.size).toBe(16);
  });
});
