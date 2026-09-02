import { z } from "zod";

/**
 * Which prompt produced a given answer. Logged on every `ai_calls` row the same
 * way Investigate's is (PRD §15.4), and shown on screen beside the answer, so a
 * reply recorded under a superseded prompt cannot pass as the current one's.
 *
 * Bump it whenever SYSTEM_PROMPT or this schema changes. Both are inputs to the
 * same answer.
 */
export const EXPLAIN_PROMPT_VERSION = "explain-v1";

/**
 * A ceiling on the answer, not a target.
 *
 * Explain is read by a person deciding whether to trust a tax figure, and a
 * long answer buries the citation that makes it checkable. Output is also most
 * of the bill (PRD §9, "On cost"), so this is the same lever `REASON_MAX_CHARS`
 * pulls for Investigate: generous enough that a good four-sentence answer never
 * trips it, tight enough that an essay cannot be decoded at all.
 */
export const ANSWER_MAX_CHARS = 900;

/**
 * What Explain is allowed to return.
 *
 * Note what is ABSENT, because the absence is the permission boundary rather
 * than an oversight: there is no `category` field. Explain may not classify —
 * that is Investigate's authority (PRD §9) — and `strictObject` means an answer
 * that tries to carry a classification is not merely ignored, it fails to
 * decode. The same mechanism §15.3 uses to make a sixth category
 * unrepresentable makes a classification from the wrong layer unrepresentable.
 *
 * There is no separate `citations` array either, and that is also deliberate.
 * Citations are read out of the prose by `bindCitations`, so there is exactly
 * one source for "which records did this answer use". A second list is how a
 * panel ends up linking a record the sentence never mentioned.
 */
export const explainAnswerSchema = z.strictObject({
  answer: z
    .string()
    .min(1)
    .max(ANSWER_MAX_CHARS)
    .describe(
      "The answer, in plain English, for an accountant. Wrap every record id you rely on in square brackets, e.g. [pay_ABC123].",
    ),
});

export type ExplainAnswer = z.infer<typeof explainAnswerSchema>;
