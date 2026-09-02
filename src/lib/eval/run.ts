import type { LanguageModel } from "ai";
import { investigate } from "@/lib/agent/investigate";
import type { ReconItem } from "@/lib/matching";
import type { InvestigationTrace } from "@/lib/review/trace";
import type { EvalAnswer } from "./score";

export type EvalRunInput = {
  model: LanguageModel;
  /** The rows to classify — the matcher's exceptions, joined to their recon rows. */
  queue: readonly { recordId: string; item: ReconItem }[];
  /** Every row in the batch, which is what the agent's tools read. */
  batch: readonly ReconItem[];
  claimedPeriod: string;
  batchId: string;
  /** Milliseconds between calls, to stay under a provider's rate limit. */
  delayMs: number;
  /** Extra attempts for a record whose call FAILED outright. */
  retries: number;
  /** Injectable so a test does not actually wait. */
  sleep?: (ms: number) => Promise<void>;
};

export type EvalRun = {
  answers: EvalAnswer[];
  /**
   * The `ai_calls` rows this run produced, in the shape the screen reads
   * (PRD §15.1). Returned rather than written: the run decides nothing about
   * where a trace is stored, the same way `investigate()` builds an audit row
   * without persisting it.
   */
  traces: InvestigationTrace[];
  inputTokens: number;
  outputTokens: number;
  /** How many extra attempts were spent. Printed, so a clean run is distinguishable. */
  retried: number;
};

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Run Investigate over the queue and collect one answer per record.
 *
 * Separated from `scripts/eval.ts` so the whole loop — pacing, retries, token
 * accounting — can be driven by a mock model with no API key and no spend. The
 * script above it does argument parsing, file reading and printing, and nothing
 * that needs asserting.
 */
export async function runEval(input: EvalRunInput): Promise<EvalRun> {
  const sleep = input.sleep ?? realSleep;
  const run: EvalRun = { answers: [], traces: [], inputTokens: 0, outputTokens: 0, retried: 0 };

  for (const [index, entry] of input.queue.entries()) {
    if (index > 0 && input.delayMs > 0) await sleep(input.delayMs);

    let out = await callOnce(input, entry);
    run.inputTokens += out.aiCall.inputTokens ?? 0;
    run.outputTokens += out.aiCall.outputTokens ?? 0;

    // Only FAILED is retried. `investigate()` catches its own errors and reports
    // FAILED rather than throwing, so a rate limit arrives here looking exactly
    // like a wrong answer — but a COERCED_UNEXPLAINED is a real classification
    // the model got wrong, and re-rolling it would launder a genuine miss into
    // a better score.
    for (let attempt = 0; out.verdict === "FAILED" && attempt < input.retries; attempt += 1) {
      const backoff = input.delayMs > 0 ? input.delayMs * (attempt + 2) : 2_000 * (attempt + 1);
      run.retried += 1;
      await sleep(backoff);
      out = await callOnce(input, entry);
      run.inputTokens += out.aiCall.inputTokens ?? 0;
      run.outputTokens += out.aiCall.outputTokens ?? 0;
    }

    run.answers.push({
      entityId: entry.recordId,
      category: out.category,
      reason: out.reason,
      verdict: out.verdict,
    });

    run.traces.push({
      recordId: entry.recordId,
      model: out.aiCall.model,
      promptVersion: out.aiCall.promptVersion,
      verdict: out.verdict,
      category: out.category,
      reason: out.reason,
      toolCalls: out.toolCalls as InvestigationTrace["toolCalls"],
      latencyMs: out.aiCall.latencyMs ?? 0,
      inputTokens: out.aiCall.inputTokens ?? 0,
      outputTokens: out.aiCall.outputTokens ?? 0,
      costMicroUsd: out.aiCall.costMicroUsd ?? 0,
    });
  }

  return run;
}

function callOnce(input: EvalRunInput, entry: { recordId: string; item: ReconItem }) {
  return investigate({
    model: input.model,
    item: entry.item,
    claimedPeriod: input.claimedPeriod,
    batch: input.batch,
    batchId: input.batchId,
    recordId: entry.recordId,
  });
}
