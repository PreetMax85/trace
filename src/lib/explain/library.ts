import { z } from "zod";

/**
 * The questions the Explain panel offers, and the only ones with an answer
 * recorded ahead of time.
 *
 * Each carries a STABLE ID as well as its wording. The id is what a recorded
 * answer is filed under, so rephrasing a question does not orphan its answer —
 * and, more importantly, a rewording is DETECTABLE: `explanationFor` compares
 * the recorded wording against the current one and treats a mismatch as no
 * answer. Showing a recorded answer beside a question it was not asked is the
 * one failure this file exists to prevent.
 */
export type ExampleQuestion = {
  id: string;
  question: string;
};

export const EXAMPLE_QUESTIONS: readonly ExampleQuestion[] = [
  {
    id: "settlement-short",
    question: "Why is my settlement short this month?",
  },
  {
    id: "safe-to-claim",
    question: "How much input tax credit can I safely claim for this period?",
  },
  {
    id: "unexplained-fees",
    question: "Which fees don't match Razorpay's published rates?",
  },
  {
    id: "missing-tax",
    question: "Why isn't all of this period's GST on this period's GSTR-2B?",
  },
  {
    id: "refund-effect",
    question: "Do the refunds change what I can claim?",
  },
  {
    id: "out-of-scope",
    question: "Can you file the correction for me?",
  },
] as const;

/**
 * One recorded answer, exported from a real `explain()` run.
 *
 * This is an EXPORT of an `ai_calls` row, on the same reasoning as the §15.1
 * reasoning trace: what a model said on one occasion is a fact about that run,
 * and the only honest source for it is the run that produced it. It ships as a
 * committed file rather than a live query because the page prerenders static
 * and must not need a database — and because a recorded answer is what keeps
 * the panel working with no API key, no database and no network.
 *
 * The provenance fields are not decoration. An answer is only checkable next to
 * the model and prompt version that produced it and the day it was recorded, so
 * a reply left over from a superseded prompt cannot pass as the current one's.
 */
const recordedAnswerSchema = z.object({
  id: z.string().min(1),
  /** The wording the answer was actually given to. */
  question: z.string().min(1),
  answer: z.string().nullable(),
  verdict: z.enum(["ACCEPTED", "INVALID_CITATION", "BLOCKED_WRITE", "FAILED"]),
  cited: z.array(z.string()),
  /** Records the answer named that the batch does not hold. */
  unknown: z.array(z.string()),
  model: z.string().min(1),
  promptVersion: z.string().min(1),
  recordedAt: z.string().min(1),
  latencyMs: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  costMicroUsd: z.number().int().nonnegative(),
});

export type RecordedAnswer = z.infer<typeof recordedAnswerSchema>;

const fileSchema = z.array(recordedAnswerSchema);

/**
 * Parse a recorded-answer file into a lookup by question id.
 *
 * Validated rather than cast, exactly as `parseTraces` is: the file is written
 * by a separate command and committed, so it can fall behind this schema
 * between runs. A malformed answer rendered as blanks would put an empty reply
 * under a real question, which reads as "the agent had nothing to say" rather
 * than as a broken file.
 */
export function parseExplanations(raw: unknown): Map<string, RecordedAnswer> {
  const parsed = fileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`recorded explanations are malformed: ${parsed.error.issues[0]?.message}`);
  }

  const byId = new Map<string, RecordedAnswer>();
  for (const answer of parsed.data) {
    if (byId.has(answer.id)) {
      throw new Error(`recorded explanations contain ${answer.id} twice`);
    }
    byId.set(answer.id, answer);
  }
  return byId;
}

/**
 * The recorded answer for one question, or null if there is not a current one.
 *
 * "Not current" covers two cases and treats them identically on purpose: no run
 * has answered this question yet, or the question has been REWORDED since the
 * answer was recorded. In both the panel has nothing honest to show, and the
 * fallback — saying so — is correct for both. Matching on the id alone would
 * quietly put an old answer under a new question, which is the failure this
 * whole file is arranged to prevent.
 */
export function explanationFor(
  question: ExampleQuestion,
  recorded: ReadonlyMap<string, RecordedAnswer>,
): RecordedAnswer | null {
  const answer = recorded.get(question.id);
  if (!answer) return null;
  return answer.question === question.question ? answer : null;
}
