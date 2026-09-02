import { z } from "zod";
import { MAX_QUESTION_CHARS } from "./limits";

export { MAX_QUESTION_CHARS };

/**
 * What a caller is allowed to choose: the question, and nothing else.
 *
 * Deliberately NOT a passthrough. The model, the system prompt, the tools and
 * the batch are the server's decisions — accepting any of them from the request
 * would let a caller ask a different agent than the one whose behaviour this
 * project describes and tests.
 */
const requestSchema = z.object({
  question: z.string().trim().min(1).max(MAX_QUESTION_CHARS),
});

export type ExplainRequest = z.infer<typeof requestSchema>;

/**
 * Read one request body, or say why it cannot be read.
 *
 * The messages are written for the person who will see them in the panel, not
 * for a log: a rejected question should tell them what to change.
 */
export function parseExplainRequest(raw: unknown): ExplainRequest {
  const parsed = requestSchema.safeParse(raw);
  if (parsed.success) return { question: parsed.data.question };

  const issue = parsed.error.issues[0];
  if (issue?.code === "too_big") {
    throw new Error(`That question is too long — keep it under ${MAX_QUESTION_CHARS} characters.`);
  }
  throw new Error("Ask a question first.");
}

export type QuestionBudget = {
  /** Claim one question. False once the budget is spent. */
  take: () => boolean;
  remaining: () => number;
};

/**
 * A ceiling on how many live questions one server process will answer.
 *
 * Crude on purpose. It is per-process, so it does not survive a restart and
 * does not coordinate across serverless instances — but the failure it exists
 * to stop is someone holding down enter on a public route, and for that a
 * local counter is enough. The real hard stop is the spending limit on the API
 * account; this is what keeps an accident from reaching it.
 */
export function createQuestionBudget(max: number): QuestionBudget {
  let spent = 0;

  return {
    take: () => {
      if (spent >= max) return false;
      spent += 1;
      return true;
    },
    // Not clamped, and it does not need to be: `take` refuses without
    // incrementing once the budget is spent, so `spent` never passes `max`. A
    // test asserts the remainder never goes negative, which keeps that
    // invariant enforced at the seam rather than papered over here.
    remaining: () => max - spent,
  };
}
