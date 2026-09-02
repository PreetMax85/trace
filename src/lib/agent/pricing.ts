import type { LanguageModelUsage } from "ai";

/**
 * One model for all three layers (PRD §9). Investigate decides a tax
 * classification, which is the output most expensive to get wrong and so the
 * wrong place to economise; and one model means one prompt-cache namespace,
 * where a cheap-model cascade would forfeit cache reuse across models.
 */
export const MODEL_ID = "claude-opus-5";

/**
 * Anthropic's published rates for `claude-opus-5`, as INTEGER NANO-USD PER
 * TOKEN. Base is $5.00 per million input tokens and $25.00 per million output.
 *
 * Nano-USD per token, not dollars per million, for the same reason money is
 * paise everywhere else: a cache read costs half a micro-USD, so anything
 * coarser rounds the cheapest tokens to zero and quietly overstates the saving
 * prompt caching is supposed to prove. Integers throughout, rounded once at the
 * end.
 *
 * Cache reads bill at 0.1x base and cache writes at 1.25x on the default
 * 5-minute TTL. The 5-minute TTL is the right one here: all 54 calls run
 * back-to-back, so entries never go cold, and the 1-hour TTL would double the
 * write price to buy a window nothing uses.
 */
export const NANO_USD_PER_TOKEN = {
  input: 5_000,
  cacheRead: 500,
  cacheWrite: 6_250,
  output: 25_000,
} as const;

/**
 * The token counts as `ai_calls` stores them. `inputTokens` is the TOTAL,
 * inclusive of the two cache figures — so the tokens billed at the full input
 * rate are `inputTokens - cacheReadTokens - cacheWriteTokens`.
 *
 * Stored that way deliberately: cost is then recomputable from the four columns
 * alone. Anyone auditing the bill can redo the arithmetic from the database
 * without trusting the code that wrote the row, which is the entire point of
 * keeping the trace in our own Postgres rather than a vendor dashboard.
 */
export type TokenSplit = {
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
};

const ZERO_SPLIT: TokenSplit = {
  inputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  outputTokens: 0,
};

/**
 * The AI SDK's usage object as the four columns.
 *
 * Every field on `LanguageModelUsage` is `number | undefined` — a provider that
 * reports nothing is normal, not an error — so each falls back to 0 rather than
 * producing NaN, which would poison the batch total silently.
 *
 * `inputTokens` is recomputed as the sum of the three parts whenever the
 * provider breaks them out, rather than trusting its total. If a provider's
 * total ever disagreed with its own breakdown, taking the total would make the
 * stored row fail its own arithmetic.
 */
export function splitUsage(usage: LanguageModelUsage | undefined): TokenSplit {
  if (!usage) return ZERO_SPLIT;

  const cacheReadTokens = usage.inputTokenDetails?.cacheReadTokens ?? 0;
  const cacheWriteTokens = usage.inputTokenDetails?.cacheWriteTokens ?? 0;
  const noCacheTokens = usage.inputTokenDetails?.noCacheTokens;

  return {
    inputTokens:
      noCacheTokens === undefined
        ? (usage.inputTokens ?? 0)
        : noCacheTokens + cacheReadTokens + cacheWriteTokens,
    cacheReadTokens,
    cacheWriteTokens,
    outputTokens: usage.outputTokens ?? 0,
  };
}

/**
 * What one call cost, in integer MICRO-USD.
 *
 * Summed in nano-USD and rounded exactly once, at the end. Rounding each line
 * item would lose a half-micro on every cache read and understate a 54-record
 * batch by a visible amount.
 *
 * Tokens billed at full rate are the total minus the two cached figures, so a
 * fully cached prefix costs a tenth of an uncached one — which is what makes
 * the §9 budget work, and what this function has to get right for the batch
 * report to be worth showing.
 */
export function costMicroUsd(split: TokenSplit): number {
  const fullRateInput = Math.max(
    0,
    split.inputTokens - split.cacheReadTokens - split.cacheWriteTokens,
  );

  const nanoUsd =
    fullRateInput * NANO_USD_PER_TOKEN.input +
    split.cacheReadTokens * NANO_USD_PER_TOKEN.cacheRead +
    split.cacheWriteTokens * NANO_USD_PER_TOKEN.cacheWrite +
    split.outputTokens * NANO_USD_PER_TOKEN.output;

  return Math.round(nanoUsd / 1000);
}
