/**
 * One piece of an Explain answer, ready to render (PRD §15.5).
 *
 * A citation is a segment rather than a footnote because the link has to sit
 * beside the claim it supports — "every answer traces back to a specific
 * record, amount and date" is only checkable if the reader can see WHICH
 * sentence a record was cited for.
 */
export type AnswerSegment =
  | { kind: "text"; text: string }
  | { kind: "citation"; recordId: string };

export type BoundAnswer = {
  segments: AnswerSegment[];
  /** Records the answer really cited, in the order they first appear. */
  cited: string[];
  /**
   * Record ids the model named that this batch does not contain.
   *
   * Kept rather than dropped, for the same reason `policy.ts` keeps a rejected
   * category: a citation gate that silently swallowed an invented record would
   * make "every answer cites a real record" an unfalsifiable claim.
   */
  unknown: string[];
};

/** Anything in square brackets is a candidate; what it contains decides the rest. */
const MARKER = /\[([^\]]+)\]/g;

/**
 * The id prefixes Razorpay puts on the entities this batch contains.
 *
 * This — not a length threshold — is what separates a CLAIMED CITATION from
 * ordinary bracketed prose. A real answer says things like "categorised as
 * [fee_deduction]" or "a credit note under [Section 34]", and a rule that only
 * checked for an underscore would report both as records the merchant does not
 * have. That is worse than useless: it puts a hallucination warning on the one
 * panel whose job is to tell a person when to distrust the answer.
 *
 * Tied to the id scheme rather than to a shape, so it fails closed. A prefix
 * Razorpay adds later is prose here until someone adds it, which is the safe
 * direction — an uncited real record is a smaller error than a link to a record
 * that does not exist.
 */
const ENTITY_PREFIXES = ["pay", "rfnd", "setl", "order"] as const;

const ENTITY_ID = new RegExp(`^(?:${ENTITY_PREFIXES.join("|")})_[A-Za-z0-9]+$`);

/**
 * Resolve a model's answer against the records the batch actually holds.
 *
 * Citations are derived from the prose alone — there is no second list of
 * claimed record ids for it to disagree with. Two sources for "which records
 * did this answer use" is how a panel ends up linking a record the sentence
 * never mentioned.
 */
export function bindCitations(answer: string, known: ReadonlySet<string>): BoundAnswer {
  const segments: AnswerSegment[] = [];
  const cited: string[] = [];
  const unknown: string[] = [];
  let cursor = 0;

  for (const match of answer.matchAll(MARKER)) {
    const [marker, inner] = match;

    if (!ENTITY_ID.test(inner)) continue;

    if (!known.has(inner)) {
      // Left in the text exactly as written. The sentence still reads, and the
      // reader sees the id the model invented rather than a gap where a link
      // was quietly removed.
      if (!unknown.includes(inner)) unknown.push(inner);
      continue;
    }

    const before = answer.slice(cursor, match.index);
    if (before.length > 0) segments.push({ kind: "text", text: before });
    segments.push({ kind: "citation", recordId: inner });
    if (!cited.includes(inner)) cited.push(inner);
    cursor = match.index + marker.length;
  }

  const rest = answer.slice(cursor);
  if (rest.length > 0) segments.push({ kind: "text", text: rest });

  return { segments, cited, unknown };
}
