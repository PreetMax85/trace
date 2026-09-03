import type { LanguageModel } from "ai";
import { act } from "./act";
import { figureFingerprint, type RecordedDraft } from "./library";
import type { ActContext, ActRecord } from "./prompt";

export type DraftBakeInput = {
  model: LanguageModel;
  /** The records to draft for — the flagged ones, not all 54. */
  records: readonly ActRecord[];
  context: ActContext;
  batchId: string;
  /** Milliseconds between calls, to stay under a provider's rate limit. */
  delayMs: number;
  /** Injectable so a test does not actually wait. */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable clock, so `recordedAt` in a test is a fixed string, not today. */
  now?: () => Date;
};

export type DraftBake = {
  drafts: RecordedDraft[];
  inputTokens: number;
  outputTokens: number;
  costMicroUsd: number;
};

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Draft for every flagged record once and collect the results for committing.
 *
 * Separated from `scripts/act.ts` for the same reason `bakeAnswers` is
 * separated from `scripts/explain.ts`: the loop — pacing, provenance stamping,
 * fingerprinting, token accounting — is then driven end to end by a mock model,
 * with no API key and no spend. The script above it does argument parsing, file
 * IO and printing, and nothing that needs asserting.
 */
export async function bakeDrafts(input: DraftBakeInput): Promise<DraftBake> {
  const sleep = input.sleep ?? realSleep;
  const now = input.now ?? (() => new Date());
  const bake: DraftBake = { drafts: [], inputTokens: 0, outputTokens: 0, costMicroUsd: 0 };

  for (const [index, record] of input.records.entries()) {
    if (index > 0 && input.delayMs > 0) await sleep(input.delayMs);

    const out = await act({
      model: input.model,
      record,
      context: input.context,
      batchId: input.batchId,
    });

    bake.inputTokens += out.aiCall.inputTokens ?? 0;
    bake.outputTokens += out.aiCall.outputTokens ?? 0;
    bake.costMicroUsd += out.aiCall.costMicroUsd ?? 0;

    bake.drafts.push({
      recordId: record.recordId,
      // The FIGURES, not just the id. A draft filed under a record id alone
      // would silently reattach itself to a record whose fee has since moved.
      figures: figureFingerprint(record),
      draft: out.draft,
      verdict: out.verdict,
      unresolved: out.unresolved,
      unbalanced: out.unbalanced,
      misfiled: out.misfiled,
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
 * A `FAILED` draft means the call produced nothing — usually a rate limit — and
 * writing it would leave "the agent failed" permanently under a real exception,
 * because the file is only ever rewritten by running the command again.
 *
 * `INVALID_FIGURE` is deliberately NOT a failure here. The gate firing is a
 * result: the model drafted, and it stated an amount the record does not carry.
 * That is exactly the case a reader most needs to see, and suppressing it would
 * make "the gate never fired" unfalsifiable.
 */
export function isCompleteDraftBake(drafts: readonly RecordedDraft[]): boolean {
  return drafts.length > 0 && drafts.every((entry) => entry.verdict !== "FAILED");
}
