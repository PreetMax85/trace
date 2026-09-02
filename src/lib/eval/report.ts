import type { Disagreement, EvalScore } from "./score";

export type EvalMeta = {
  /** Which prompt produced these answers. A score without it cannot be compared. */
  promptVersion: string;
  /** Which model answered. Gemini's number is not Claude's number. */
  modelId: string;
};

/**
 * The eval's printed output (PRD §15.2).
 *
 * Every figure is printed beside the two others that qualify it — 54 records,
 * 38 the matcher resolved on its own, 16 the agent was actually asked about.
 * A bare "15/16" invites the reading that the agent classified the whole batch,
 * and a bare "54" invites the reading that it got 54 right. Neither is true, so
 * neither number is ever printed alone.
 */
export function formatEvalReport(score: EvalScore, meta: EvalMeta): string {
  const { totalRecords, matchedDeterministically, investigated, agreed, disagreements } = score;

  const lines = [
    `Trace eval — ${meta.promptVersion} · ${meta.modelId}`,
    "",
    `${totalRecords} records · ${matchedDeterministically} matched deterministically (not sent to the model)`,
    `${investigated} investigated · agreement ${agreed}/${investigated}${percentage(agreed, investigated)}`,
    "",
  ];

  if (disagreements.length === 0) {
    lines.push("DISAGREEMENTS (0) — the agent matched the deterministic verdict on every exception.");
    return lines.join("\n");
  }

  lines.push(`DISAGREEMENTS (${disagreements.length})`, "");
  for (const item of disagreements) {
    lines.push(...disagreementLines(item), "");
  }
  return lines.join("\n");
}

/**
 * ` (93.8%)`, or nothing at all when there is no denominator.
 *
 * Omitted rather than printed as 0% — an empty run has no accuracy, and 0%
 * would read as "the agent got everything wrong".
 */
function percentage(agreed: number, investigated: number): string {
  if (investigated === 0) return "";
  return ` (${((agreed / investigated) * 100).toFixed(1)}%)`;
}

function disagreementLines(item: Disagreement): string[] {
  const agent =
    item.actual === null
      ? "(no answer — the run did not reach this record)"
      : `${item.actual}   (verdict ${item.verdict})`;

  const lines = [`  ${item.entityId}`, `    expected  ${item.expected}`, `    agent     ${agent}`];
  if (item.reason !== null) lines.push(`    reason    "${item.reason}"`);
  return lines;
}
