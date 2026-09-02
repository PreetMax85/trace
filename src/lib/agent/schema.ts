import { z } from "zod";
import { exceptionCategory } from "@/lib/audit/schema";

/**
 * Which prompt produced a given classification. Logged on every `ai_calls` row
 * (PRD §15.4) so the eval's agreement number (§15.2) can be attributed to a
 * prompt — without it, a tuning round that made accuracy worse is
 * indistinguishable from one that made it better.
 *
 * Bump this whenever SYSTEM_PROMPT or the output schema changes. Both are
 * inputs to the same answer, so a schema change is a prompt change.
 */
export const PROMPT_VERSION = "investigate-v1";

/**
 * A hard cap on the reason, not a style note. Output is roughly 77% of the
 * bill (PRD §9, "On cost"), so a schema that lets the model write three
 * paragraphs is the difference between a $0.31 eval run and a $1.40 one. The
 * cap is generous enough that a well-behaved one-sentence answer never trips
 * it; `maxOutputTokens` at the call site is what actually stops a runaway.
 */
export const REASON_MAX_CHARS = 320;

/**
 * The five categories, taken from the database enum rather than retyped.
 *
 * This is the §15.3 mechanism: a sixth category is not merely rejected, it is
 * unrepresentable — the model is handed a JSON schema that permits exactly
 * these five strings. Deriving them from `exceptionCategory` means the model's
 * vocabulary and the column it gets written to cannot drift apart, because
 * there is only one list.
 */
export const INVESTIGATION_CATEGORIES = exceptionCategory.enumValues;

export const investigationSchema = z.strictObject({
  category: z
    .enum(INVESTIGATION_CATEGORIES)
    .describe("The single exception category that best explains this record."),
  reason: z
    .string()
    .min(1)
    .max(REASON_MAX_CHARS)
    .describe(
      "One sentence, plain English, addressed to an accountant. State the evidence that decided it.",
    ),
});

/**
 * What Investigate is allowed to return. Note what is absent: no confidence
 * score (PRD §6 — `match_method` is the confidence tier and there is no second
 * one), no suggested action (that is the Act layer's job, behind a human gate),
 * and no free-form fields the audit trail has nowhere to put.
 */
export type Investigation = z.infer<typeof investigationSchema>;
