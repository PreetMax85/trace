import type { ExceptionCategory, MatchMethod, MatchStatus } from "@/lib/matching";
import type { PolicyVerdict } from "@/lib/agent/policy";

/** One record of `data/synthetic/expected.json`. Snake case, because the file is. */
export type ExpectedRecord = {
  entity_id: string;
  status: MatchStatus;
  match_method: MatchMethod;
  exception_category: ExceptionCategory | null;
};

/** What Investigate said about one record. */
export type EvalAnswer = {
  entityId: string;
  category: ExceptionCategory;
  reason: string | null;
  verdict: PolicyVerdict;
};

export type Disagreement = {
  entityId: string;
  expected: ExceptionCategory;
  /** What the agent said. `null` means it never answered — the run did not finish. */
  actual: ExceptionCategory | null;
  reason: string | null;
  /** `null` for the same reason `actual` is: there was no call to have a verdict. */
  verdict: PolicyVerdict | null;
};

export type EvalScore = {
  totalRecords: number;
  matchedDeterministically: number;
  investigated: number;
  agreed: number;
  disagreements: Disagreement[];
};

export function scoreEval(
  expected: readonly ExpectedRecord[],
  answers: readonly EvalAnswer[],
): EvalScore {
  const exceptions = expected.filter((r) => r.exception_category !== null);

  // Building the map first and counting afterwards would already have lost the
  // duplicate: `new Map` keeps the last write. So refuse before collapsing.
  // Two answers for one record mean the runner classified it twice, and taking
  // either would make the score depend on argument order rather than on the
  // model — the same class of order-dependence BUILD-LOG 10 records.
  const seen = new Set<string>();
  const duplicates = answers
    .map((a) => a.entityId)
    .filter((id) => {
      const repeat = seen.has(id);
      seen.add(id);
      return repeat;
    });
  if (duplicates.length > 0) {
    throw new Error(
      `scoreEval: ${duplicates.length} record(s) answered more than once: ${[...new Set(duplicates)].join(", ")}`,
    );
  }

  const byEntity = new Map(answers.map((a) => [a.entityId, a]));

  // Every answer must correspond to an exception row the harness was asked to
  // score. An answer that does not is a runner bug, and the failure mode of
  // ignoring it is the expensive one: the denominator still reads 16, so the
  // report looks correct while being computed over the wrong set of records.
  const scorable = new Set(exceptions.map((r) => r.entity_id));
  const orphans = answers.map((a) => a.entityId).filter((id) => !scorable.has(id));
  if (orphans.length > 0) {
    throw new Error(
      `scoreEval: ${orphans.length} answer(s) match no exception in the ground truth: ${orphans.join(", ")}`,
    );
  }

  const disagreements: Disagreement[] = [];
  let agreed = 0;

  for (const record of exceptions) {
    // Non-null: `exceptions` is filtered on exactly this field being non-null.
    const truth = record.exception_category as ExceptionCategory;
    const answer = byEntity.get(record.entity_id);

    // An unanswered record is a DISAGREEMENT, not a skip. A run cut short by a
    // rate limit would otherwise report agreement over only the records it got
    // to, so half a run and a perfect run would print the same number — which
    // is the one way this harness could lie about the figure it exists to
    // produce. Scored this way, 1 answer out of 16 reads as 1/16.
    if (answer === undefined) {
      disagreements.push({
        entityId: record.entity_id,
        expected: truth,
        actual: null,
        reason: null,
        verdict: null,
      });
      continue;
    }

    if (answer.category === truth) {
      agreed += 1;
    } else {
      disagreements.push({
        entityId: record.entity_id,
        expected: truth,
        actual: answer.category,
        reason: answer.reason,
        verdict: answer.verdict,
      });
    }
  }

  return {
    totalRecords: expected.length,
    matchedDeterministically: expected.length - exceptions.length,
    investigated: exceptions.length,
    agreed,
    disagreements,
  };
}
