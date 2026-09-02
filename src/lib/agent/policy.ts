import type { ExceptionCategory } from "@/lib/matching/types";
import { INVESTIGATION_CATEGORIES, REASON_MAX_CHARS, investigationSchema } from "./schema";
import { READ_ONLY_TOOL_NAMES, type ReadOnlyToolName } from "./tools";

export type PolicyVerdict =
  | "ACCEPTED"
  | "COERCED_UNEXPLAINED"
  | "BLOCKED_WRITE"
  | "FAILED";

export type GatedClassification = {
  /** Always one of the five. A record must land somewhere; null is not an option. */
  category: ExceptionCategory;
  reason: string | null;
  verdict: PolicyVerdict;
  /**
   * What the model said, when the gate did not accept it. Kept so the audit
   * trail records the override rather than hiding it — "the gate never fired"
   * is only a meaningful claim if a firing would have left evidence.
   */
  rejected: string | null;
};

/**
 * The second of the two §15.3 mechanisms.
 *
 * The Zod enum makes a sixth category unrepresentable at generation; this
 * catches the case where that schema is loosened, bypassed, or where a provider
 * returns something the schema never saw. They are independent on purpose: a
 * schema constrains what the model may emit, a gate constrains what the system
 * will accept, and neither is asked to cover for the other.
 *
 * The input is `unknown` deliberately. A gate typed to the thing it is meant to
 * catch would be a gate that trusts its input.
 */
export function applyPolicyGate(raw: unknown): GatedClassification {
  const parsed = investigationSchema.safeParse(raw);
  if (parsed.success) {
    return {
      category: parsed.data.category,
      reason: parsed.data.reason,
      verdict: "ACCEPTED",
      rejected: null,
    };
  }

  // Not schema-valid. The distinction that follows matters for the audit
  // trail: a model that named a category we do not accept is a DIFFERENT
  // failure from a model that returned no classification at all, and
  // collapsing them would hide a prompt regression inside a noise bucket.
  const named = namedCategory(raw);
  if (named === null) {
    return { category: "UNEXPLAINED", reason: null, verdict: "FAILED", rejected: null };
  }

  return {
    category: "UNEXPLAINED",
    reason: usableReason(raw),
    verdict: "COERCED_UNEXPLAINED",
    rejected: named,
  };
}

/** The `category` the model claimed, if it claimed one at all. */
function namedCategory(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = (raw as { category?: unknown }).category;
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * The model's own words, when they are worth keeping.
 *
 * Truncated rather than discarded: the reason is evidence for a human, and a
 * classification the gate overrode is exactly the case where a person most
 * wants to see what the model was thinking. Truncation is marked, so nobody
 * reads a cut-off sentence as the whole answer.
 */
function usableReason(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = (raw as { reason?: unknown }).reason;
  if (typeof value !== "string" || value.length === 0) return null;
  return value.length <= REASON_MAX_CHARS ? value : `${value.slice(0, REASON_MAX_CHARS - 1)}…`;
}

/**
 * Tools Investigate was handed that it is not allowed to hold.
 *
 * The permission boundary — "may classify, may not write" (PRD §9) — is stated
 * in the system prompt AND enforced here, because a prompt is not an
 * enforcement mechanism. A prompt is a request; this is a check. If a later
 * change hands Investigate something that mutates state, the call is refused
 * at the boundary and logged as BLOCKED_WRITE rather than discovered by
 * whoever audits the database afterwards.
 */
export function unauthorisedTools(names: readonly string[]): string[] {
  const allowed = new Set<string>(READ_ONLY_TOOL_NAMES as readonly ReadOnlyToolName[]);
  return names.filter((name) => !allowed.has(name));
}

/** Whether a string is one of the five. Exported so the eval can score raw answers. */
export function isKnownCategory(value: string): value is ExceptionCategory {
  return (INVESTIGATION_CATEGORIES as readonly string[]).includes(value);
}
