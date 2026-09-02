import { bindCitations, type AnswerSegment } from "./citations";
import { explainAnswerSchema } from "./schema";
import { READ_ONLY_EXPLAIN_TOOL_NAMES, type ExplainToolName } from "./tools";

/**
 * What the gate concluded about one Explain call.
 *
 * `INVALID_CITATION` is a distinct value rather than a flavour of `FAILED`, for
 * the same reason `applyPolicyGate` separates a rejected category from a missing
 * one: an answer that named a record the batch does not hold is a PROMPT
 * problem, and a call that returned nothing is an INFRASTRUCTURE problem. Put
 * them in one bucket and a regression that starts inventing record ids hides
 * inside the rate-limit noise.
 */
export type ExplainVerdict = "ACCEPTED" | "INVALID_CITATION" | "BLOCKED_WRITE" | "FAILED";

export type GatedAnswer = {
  /** The answer as written, or null when the call produced none. */
  answer: string | null;
  /** The answer split for rendering, with citations resolved (PRD §15.5). */
  segments: AnswerSegment[];
  cited: string[];
  unknown: string[];
  verdict: ExplainVerdict;
};

/**
 * Check one Explain answer before it reaches a person.
 *
 * The input is `unknown` deliberately, exactly as Investigate's gate is: a gate
 * typed to the thing it exists to catch is a gate that trusts its input.
 *
 * An invented citation does NOT discard the answer. The prose may well be
 * right, and throwing it away would leave a person with nothing to check; the
 * link is withheld, the invented id is named, and the verdict says so. That is
 * the honest handling — the reader sees both what the model said and where it
 * went beyond the evidence.
 */
export function applyExplainGate(raw: unknown, known: ReadonlySet<string>): GatedAnswer {
  const parsed = explainAnswerSchema.safeParse(raw);
  if (!parsed.success) {
    return { answer: null, segments: [], cited: [], unknown: [], verdict: "FAILED" };
  }

  const bound = bindCitations(parsed.data.answer, known);

  return {
    answer: parsed.data.answer,
    segments: bound.segments,
    cited: bound.cited,
    unknown: bound.unknown,
    verdict: bound.unknown.length > 0 ? "INVALID_CITATION" : "ACCEPTED",
  };
}

/**
 * Tools Explain was handed that it is not allowed to hold.
 *
 * Explain is read-only (PRD §9) — a stricter boundary than Investigate's, which
 * may at least classify. Kept as its own allowlist rather than shared with
 * Investigate's because the two lists are different by design, and a single
 * shared list would make widening one layer's permissions silently widen the
 * other's.
 */
export function unauthorisedExplainTools(names: readonly string[]): string[] {
  const allowed = new Set<string>(READ_ONLY_EXPLAIN_TOOL_NAMES as readonly ExplainToolName[]);
  return names.filter((name) => !allowed.has(name));
}
