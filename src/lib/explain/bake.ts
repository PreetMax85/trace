import type { LanguageModel } from "ai";
import type { ReviewBatch } from "@/lib/review/batch";
import { explain } from "./explain";
import type { ExampleQuestion, RecordedAnswer } from "./library";

export type BakeInput = {
  model: LanguageModel;
  /** The finished batch every answer must come from. */
  batch: ReviewBatch;
  questions: readonly ExampleQuestion[];
  batchId: string;
  /** Milliseconds between calls, to stay under a provider's rate limit. */
  delayMs: number;
  /** Injectable so a test does not actually wait. */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable clock, so `recordedAt` in a test is a fixed string, not today. */
  now?: () => Date;
};

export type Bake = {
  answers: RecordedAnswer[];
  inputTokens: number;
  outputTokens: number;
  costMicroUsd: number;
};

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Ask every example question once and collect the answers for committing.
 *
 * Separated from `scripts/explain.ts` for the same reason `runEval` is
 * separated from `scripts/eval.ts`: the loop — pacing, provenance stamping,
 * token accounting — is then driven end to end by a mock model, with no API key
 * and no spend. The script above it does argument parsing, file IO and
 * printing, and nothing that needs asserting.
 */
export async function bakeAnswers(input: BakeInput): Promise<Bake> {
  const sleep = input.sleep ?? realSleep;
  const now = input.now ?? (() => new Date());
  const bake: Bake = { answers: [], inputTokens: 0, outputTokens: 0, costMicroUsd: 0 };

  for (const [index, question] of input.questions.entries()) {
    if (index > 0 && input.delayMs > 0) await sleep(input.delayMs);

    const out = await explain({
      model: input.model,
      question: question.question,
      batch: input.batch,
      batchId: input.batchId,
    });

    bake.inputTokens += out.aiCall.inputTokens ?? 0;
    bake.outputTokens += out.aiCall.outputTokens ?? 0;
    bake.costMicroUsd += out.aiCall.costMicroUsd ?? 0;

    bake.answers.push({
      id: question.id,
      // The WORDING, not just the id. An answer filed under an id alone would
      // silently reattach itself to a reworded question later.
      question: question.question,
      answer: out.answer,
      verdict: out.verdict,
      cited: out.cited,
      unknown: out.unknown,
      model: out.aiCall.model,
      promptVersion: out.aiCall.promptVersion,
      recordedAt: now().toISOString(),
      latencyMs: out.aiCall.latencyMs ?? 0,
      inputTokens: out.aiCall.inputTokens ?? 0,
      outputTokens: out.aiCall.outputTokens ?? 0,
      costMicroUsd: out.aiCall.costMicroUsd ?? 0,
    });
  }

  return bake;
}

/**
 * Whether a bake is fit to overwrite the committed file.
 *
 * A `FAILED` answer means the call never produced one — usually a rate limit —
 * and writing it would leave "the agent failed" permanently under a real
 * question, because the file is only ever rewritten by running the command
 * again.
 *
 * `INVALID_CITATION` is deliberately NOT a failure here. The gate firing is a
 * result: the model answered, and it named a record it should not have. That is
 * exactly the case a reader most needs to see, and suppressing it would make
 * "the gate never fired" unfalsifiable.
 */
export function isCompleteBake(answers: readonly RecordedAnswer[]): boolean {
  return answers.length > 0 && answers.every((answer) => answer.verdict !== "FAILED");
}
