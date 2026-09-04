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
  /** Extra attempts for a record whose call FAILED outright. */
  retries: number;
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
  /** How many extra attempts were spent. Printed, so a clean run is distinguishable. */
  retried: number;
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
  const bake: DraftBake = {
    drafts: [],
    inputTokens: 0,
    outputTokens: 0,
    costMicroUsd: 0,
    retried: 0,
  };

  for (const [index, record] of input.records.entries()) {
    if (index > 0 && input.delayMs > 0) await sleep(input.delayMs);

    const draftOnce = () =>
      act({
        model: input.model,
        record,
        context: input.context,
        batchId: input.batchId,
      });

    let out = await draftOnce();
    bake.inputTokens += out.aiCall.inputTokens ?? 0;
    bake.outputTokens += out.aiCall.outputTokens ?? 0;
    bake.costMicroUsd += out.aiCall.costMicroUsd ?? 0;

    // Only FAILED is retried. `act()` catches its own errors and reports FAILED
    // rather than throwing, so a provider error arrives here looking like any
    // other empty result — but an INVALID_FIGURE is a real draft the gate
    // refused, and re-rolling that would launder a genuine miss into a clean
    // file. The same rule `runEval` applies to COERCED_UNEXPLAINED.
    for (let attempt = 0; out.verdict === "FAILED" && attempt < input.retries; attempt += 1) {
      const backoff = input.delayMs > 0 ? input.delayMs * (attempt + 2) : 2_000 * (attempt + 1);
      bake.retried += 1;
      await sleep(backoff);
      out = await draftOnce();
      bake.inputTokens += out.aiCall.inputTokens ?? 0;
      bake.outputTokens += out.aiCall.outputTokens ?? 0;
      bake.costMicroUsd += out.aiCall.costMicroUsd ?? 0;
    }

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
      misrouted: out.misrouted,
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
