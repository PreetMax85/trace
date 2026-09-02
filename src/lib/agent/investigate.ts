import { Output, generateText, isStepCount, type LanguageModel, type ToolSet } from "ai";
import type { aiCalls } from "@/lib/audit/schema";
import type { ReconItem } from "@/lib/matching/types";
import { SYSTEM_PROMPT, recordPrompt } from "./prompt";
import { MODEL_ID, costMicroUsd, splitUsage, type TokenSplit } from "./pricing";
import { applyPolicyGate, unauthorisedTools, type GatedClassification } from "./policy";
import { PROMPT_VERSION, investigationSchema } from "./schema";
import { createInvestigateTools } from "./tools";

/**
 * Tool round-trips plus one. The structured answer is generated in its own
 * step, so a budget sized only for the tool calls stops the run right before
 * the classification it was called to produce. There are four tools and they
 * can be called in parallel, so this is generous rather than tight.
 */
const MAX_STEPS = 6;

/**
 * A ceiling, not a target. The answer is one enum value and one short sentence,
 * but Claude Opus 5 reasons before answering even at low effort, and those
 * tokens are billed as output — so a ceiling tight enough to "save money" would
 * instead truncate the answer and cost a whole retry.
 */
const MAX_OUTPUT_TOKENS = 2048;

/** One tool round-trip, kept for the reasoning trace (PRD §15.1). */
export type RecordedToolCall = {
  toolName: string;
  input: unknown;
  output: unknown;
};

export type InvestigateInput = {
  model: LanguageModel;
  /** The row to classify. */
  item: ReconItem;
  /** The filing period being reconciled, MMYYYY. */
  claimedPeriod: string;
  /** Every row in the batch — what the tools read to answer questions about this one. */
  batch: readonly ReconItem[];
  batchId: string;
  /** The `records` row this explains. Null for a call not tied to one. */
  recordId?: string | null;
  /**
   * Override the tool set. Exists so a test can prove the permission boundary
   * refuses a tool that writes; production never passes it.
   */
  tools?: ToolSet;
  /** Injectable clock, so latency in tests is a fixed number rather than a race. */
  now?: () => number;
};

export type InvestigateResult = GatedClassification & {
  toolCalls: RecordedToolCall[];
  /**
   * The `ai_calls` row this call earns — BUILT, NOT WRITTEN.
   *
   * Same discipline as `audit/rows.ts`: the agent produces a verdict, and
   * persisting it is a separate concern. Keeping it pure means every field can
   * be asserted without a database anywhere near the test, and it is the
   * caller who decides whether a run is recorded.
   */
  aiCall: typeof aiCalls.$inferInsert;
};

/**
 * Classify one settlement row.
 *
 * `generateText` with `Output.object`, not `generateObject` — the PRD named the
 * latter, but in AI SDK v7 `generateObject` takes no `tools`, and an agent that
 * cannot look anything up cannot investigate. This keeps every property the
 * spec actually wanted: one conversation, the same Zod schema validating the
 * answer, and `toolCalls` recorded for the §15.1 reasoning trace.
 */
export async function investigate(input: InvestigateInput): Promise<InvestigateResult> {
  const now = input.now ?? Date.now;
  const tools = input.tools ?? createInvestigateTools(input.batch);

  // Checked BEFORE the model is called, not after it answers. A boundary that
  // only inspects the output has already let the tool run. PRD §9.
  const blocked = unauthorisedTools(Object.keys(tools));
  if (blocked.length > 0) {
    return assemble(input, {
      gated: {
        category: "UNEXPLAINED",
        reason: `Refused: Investigate may not hold ${blocked.join(", ")}.`,
        verdict: "BLOCKED_WRITE",
        rejected: blocked.join(", "),
      },
      toolCalls: [],
      split: { inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 },
      latencyMs: 0,
    });
  }

  const startedAt = now();

  try {
    const result = await generateText({
      model: input.model,
      tools,
      output: Output.object({ schema: investigationSchema }),
      stopWhen: isStepCount(MAX_STEPS),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      system: {
        role: "system",
        content: SYSTEM_PROMPT,
        // The taxonomy and rate card are identical for all 54 records, so this
        // prefix is written to the cache once and read 53 times at a tenth of
        // the price. The default 5-minute TTL is deliberate: the batch runs
        // back-to-back so entries never go cold, and the 1-hour TTL would
        // double the write cost to buy a window nothing uses. PRD §9.
        providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
      },
      prompt: recordPrompt(input.item, input.claimedPeriod),
      providerOptions: {
        // A bounded classification over evidence the tools already fetched is
        // not hard reasoning, and effort is what it costs to think. PRD §9.
        anthropic: { effort: "low" },
      },
    });

    return assemble(input, {
      gated: applyPolicyGate(readAnswer(result)),
      toolCalls: recordToolCalls(result.steps),
      split: splitUsage(result.usage),
      latencyMs: now() - startedAt,
    });
  } catch (error) {
    // A failed call classifies nothing. The record stays UNEXPLAINED and the
    // row records that a call was attempted and cost time — silence here would
    // make a broken run indistinguishable from a run that never happened.
    return assemble(input, {
      gated: applyPolicyGate(rawFromError(error)),
      toolCalls: [],
      split: { inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 },
      latencyMs: now() - startedAt,
    });
  }
}

/**
 * The model's answer, or nothing if the run never produced one.
 *
 * Reading `result.output` throws when the final step stopped on a tool call
 * instead of a classification — the agent looped and ran out of steps. Caught
 * HERE rather than left to the outer handler, because the outer handler
 * discards the tool calls, and a run that looped is exactly the one where
 * seeing which lookups it made is the whole diagnosis.
 *
 * A schema mismatch does NOT arrive here: `generateText` rejects in that case,
 * and `rawFromError` recovers what the model said. Verified against the SDK
 * rather than assumed — the two failures surface through different channels.
 */
function readAnswer(result: { output: unknown }): unknown {
  try {
    return result.output;
  } catch {
    return undefined;
  }
}

/**
 * The invalid answer carried by a rejected `generateText`.
 *
 * A schema mismatch rejects with `NoObjectGeneratedError`, whose `cause` is a
 * `TypeValidationError` holding the parsed-but-invalid object. Recovering it is
 * what lets the gate tell "named a category we reject" apart from "returned
 * nothing usable" — hand the gate `undefined` and those two collapse into one
 * bucket, losing the signal §15.3 exists to produce.
 *
 * Walks the cause chain because the value sits one level down, and the depth is
 * an implementation detail of the SDK rather than a contract.
 */
function rawFromError(error: unknown): unknown {
  if (typeof error !== "object" || error === null) return undefined;
  const carrier = error as { value?: unknown; cause?: unknown };
  if (carrier.value !== undefined) return carrier.value;
  if (carrier.cause !== undefined && carrier.cause !== error) return rawFromError(carrier.cause);
  return undefined;
}

type StepLike = {
  toolCalls: readonly { toolName: string; input: unknown }[];
  toolResults: readonly { toolName: string; output?: unknown }[];
};

/**
 * Flattened tool calls with their results, in the order they happened.
 *
 * Matched by position within a step rather than by name: the same tool can be
 * called more than once in one step, and keying by name would silently drop
 * every call after the first.
 */
function recordToolCalls(steps: readonly StepLike[]): RecordedToolCall[] {
  return steps.flatMap((step) =>
    step.toolCalls.map((call, index) => ({
      toolName: call.toolName,
      input: call.input,
      output: step.toolResults[index]?.output ?? null,
    })),
  );
}

function assemble(
  input: InvestigateInput,
  parts: {
    gated: GatedClassification;
    toolCalls: RecordedToolCall[];
    split: TokenSplit;
    latencyMs: number;
  },
): InvestigateResult {
  const { gated, toolCalls, split, latencyMs } = parts;

  return {
    ...gated,
    toolCalls,
    aiCall: {
      batchId: input.batchId,
      recordId: input.recordId ?? null,
      layer: "INVESTIGATE",
      model: MODEL_ID,
      promptVersion: PROMPT_VERSION,
      ...split,
      latencyMs,
      costMicroUsd: costMicroUsd(split),
      verdict: gated.verdict,
      category: gated.category,
      toolCalls,
      reason: gated.reason,
    },
  };
}
