import { Output, generateText, isStepCount, type LanguageModel, type ToolSet } from "ai";
import type { RecordedToolCall } from "@/lib/agent/investigate";
import { MODEL_ID, costMicroUsd, splitUsage, type TokenSplit } from "@/lib/agent/pricing";
import type { aiCalls } from "@/lib/audit/schema";
import type { ReviewBatch } from "@/lib/review/batch";
import { applyExplainGate, unauthorisedExplainTools, type GatedAnswer } from "./policy";
import { EXPLAIN_SYSTEM_PROMPT, questionPrompt } from "./prompt";
import { EXPLAIN_PROMPT_VERSION, explainAnswerSchema } from "./schema";
import { createExplainTools } from "./tools";

/**
 * Tool round-trips plus one for the answer itself, matching Investigate's
 * budget for the same reason: the structured answer is generated in its own
 * step, so a budget sized only for the lookups stops the run immediately before
 * the answer it was called to produce.
 */
const MAX_STEPS = 6;

/** A ceiling, not a target. The schema caps the answer; this stops a runaway. */
const MAX_OUTPUT_TOKENS = 2048;

export type ExplainInput = {
  model: LanguageModel;
  /** The question, in the person's own words. */
  question: string;
  /** The finished batch the answer must come from. */
  batch: ReviewBatch;
  batchId: string;
  /**
   * Override the tool set. Exists so a test can prove the permission boundary
   * refuses a tool Explain may not hold; production never passes it.
   */
  tools?: ToolSet;
  /** Injectable clock, so latency in tests is a fixed number rather than a race. */
  now?: () => number;
};

export type ExplainResult = GatedAnswer & {
  question: string;
  toolCalls: RecordedToolCall[];
  /**
   * The `ai_calls` row this call earns — BUILT, NOT WRITTEN, exactly as
   * `investigate()` does it. Keeping it pure means every field can be asserted
   * with no database near the test, and the caller decides whether an answer is
   * recorded at all.
   */
  aiCall: typeof aiCalls.$inferInsert;
};

/**
 * Answer one question about a finished batch (PRD §9, agent 2).
 *
 * `generateText` + `Output.object`, not `streamText`, and the reason is the
 * citation gate rather than preference. §15.5 requires every answer to name the
 * records behind it and every citation to resolve to a real row; a half-emitted
 * `[pay_ABC` cannot be checked against anything, so a streamed answer would
 * either render citations before they are validated or hold the whole stream
 * back — which is what a non-streaming call already is. §9 names `streamText`
 * as an implementation note; §15.5's guarantee is committed scope, and it wins.
 */
export async function explain(input: ExplainInput): Promise<ExplainResult> {
  const now = input.now ?? Date.now;
  const tools = input.tools ?? createExplainTools(input.batch);
  const known = new Set(input.batch.rows.map((row) => row.recordId));

  // Checked BEFORE the model is called, not after it answers. A boundary that
  // only inspects the output has already let the tool run. PRD §9.
  const blocked = unauthorisedExplainTools(Object.keys(tools));
  if (blocked.length > 0) {
    return assemble(input, {
      gated: {
        answer: null,
        segments: [],
        cited: [],
        unknown: [],
        verdict: "BLOCKED_WRITE",
      },
      toolCalls: [],
      split: { inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 },
      latencyMs: 0,
      blocked,
    });
  }

  const startedAt = now();

  try {
    const result = await generateText({
      model: input.model,
      tools,
      output: Output.object({ schema: explainAnswerSchema }),
      stopWhen: isStepCount(MAX_STEPS),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      system: {
        role: "system",
        content: EXPLAIN_SYSTEM_PROMPT,
        // Worth it on the balance of the two ways this layer runs. Baking the
        // example answers issues several questions back to back, where the
        // prefix is written once and read for a tenth of the price; a lone
        // question asked live pays a 1.25x cache write on about a thousand
        // tokens instead, which is a fraction of a cent. PRD §9.
        providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
      },
      prompt: questionPrompt(input.question, input.batch.header.period),
      providerOptions: {
        // The tools return exact aggregates over 54 records, so answering is
        // retrieval and phrasing rather than hard reasoning — the same argument
        // §9 makes for Investigate, and effort is what it costs to think.
        anthropic: { effort: "low" },
      },
    });

    return assemble(input, {
      gated: applyExplainGate(readAnswer(result), known),
      toolCalls: recordToolCalls(result.steps),
      split: splitUsage(result.usage),
      latencyMs: now() - startedAt,
    });
  } catch (error) {
    // A failed call answers nothing. Recovering what the model DID say lets the
    // gate tell "wrote an answer the schema rejected" apart from "returned
    // nothing at all" — hand it `undefined` and the two collapse into one
    // bucket, which is the signal the verdict exists to carry.
    return assemble(input, {
      gated: applyExplainGate(rawFromError(error), known),
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
 * instead of an answer — the agent looped and ran out of steps. Caught here
 * rather than by the outer handler, because that handler discards the tool
 * calls, and a run that looped is exactly the one where seeing which lookups it
 * made is the whole diagnosis.
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
 * A schema mismatch rejects with `NoObjectGeneratedError`, whose cause holds
 * the parsed-but-invalid object. Walks the cause chain, because the depth is an
 * implementation detail of the SDK rather than a contract.
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
 * Flattened tool calls with their results, in the order they happened. Matched
 * by position within a step rather than by name: the same tool can be called
 * more than once in one step, and keying by name would drop all but the first.
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
  input: ExplainInput,
  parts: {
    gated: GatedAnswer;
    toolCalls: RecordedToolCall[];
    split: TokenSplit;
    latencyMs: number;
    blocked?: string[];
  },
): ExplainResult {
  const { gated, toolCalls, split, latencyMs, blocked } = parts;

  return {
    ...gated,
    question: input.question,
    toolCalls,
    aiCall: {
      batchId: input.batchId,
      // Null, and not an oversight: Explain answers a question about the whole
      // batch, so there is no single record for the row to point at. The
      // `ai_calls` schema allows this for exactly this layer.
      recordId: null,
      layer: "EXPLAIN",
      model: MODEL_ID,
      promptVersion: EXPLAIN_PROMPT_VERSION,
      ...split,
      latencyMs,
      costMicroUsd: costMicroUsd(split),
      verdict: gated.verdict,
      // Explain may not classify, so this column stays empty for every row this
      // layer writes. An audit query can therefore prove the boundary held.
      category: null,
      toolCalls,
      reason:
        blocked !== undefined
          ? `Refused: Explain may not hold ${blocked.join(", ")}.`
          : gated.answer,
    },
  };
}
