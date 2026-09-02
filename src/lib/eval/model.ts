import { MODEL_ID } from "@/lib/agent/pricing";

export type ModelChoice = {
  modelId: string;
  /**
   * Whether the printed cost is meaningful. `pricing.ts` holds Anthropic's rate
   * card and nothing else, so a run on any other model has real token counts
   * but no trustworthy rupee figure.
   */
  costIsMeaningful: boolean;
};

/**
 * Why there is no free provider option here.
 *
 * Gemini was tried first, to run the harness without spending. Its API refuses
 * function calling and a JSON response mime type in the same request:
 *
 *   AI_APICallError — Function calling with a response mime type:
 *   'application/json' is unsupported
 *
 * Verified against gemini-2.5-flash: tools alone work, `Output.object` alone
 * works, the two together are rejected, and the provider's `structuredOutputs:
 * false` option does not lift it. Investigate needs both at once by design
 * (PRD §15.3 — the Zod enum is what makes a sixth category unrepresentable, and
 * the tools are what make it an investigation), so the shipped agent cannot run
 * on Gemini at all.
 *
 * Running it there WITHOUT structured output would score a different agent than
 * the one the product ships, which is worse than not having a free number. So
 * the harness runs on Claude, and `runEval` is covered end to end by a mock
 * model that needs no key and costs nothing.
 */
const NO_FREE_PROVIDER =
  "eval: ANTHROPIC_API_KEY is not set.\n" +
  "  Gemini cannot run this agent: Google's API rejects function calling and a\n" +
  "  JSON response format in the same request, and Investigate needs both.\n" +
  "  The harness itself is covered by `npm test` against a mock model, with no key.";

/**
 * Which model the eval runs against, and whether its cost can be trusted.
 *
 * Anthropic only, deliberately: Claude is the model the product ships, so its
 * agreement number is the only one worth putting in the report.
 */
export function resolveModelChoice(
  flags: { provider?: string; model?: string },
  env: Record<string, string | undefined>,
): ModelChoice {
  if (flags.provider !== undefined && flags.provider !== "anthropic") {
    throw new Error(`eval: provider "${flags.provider}" is not supported.\n${NO_FREE_PROVIDER}`);
  }
  if (!env.ANTHROPIC_API_KEY) throw new Error(NO_FREE_PROVIDER);

  const modelId = flags.model ?? MODEL_ID;

  return {
    modelId,
    // Not just "we are on Anthropic": a --model flag can point at a model whose
    // rates pricing.ts does not carry, and printing Claude's prices against it
    // would be the same lie.
    costIsMeaningful: modelId === MODEL_ID,
  };
}
