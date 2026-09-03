import { z } from "zod";
import { recordFigures, type FigureSource } from "./figures";
import { actDraftSchema } from "./schema";

/**
 * A fingerprint of every figure a draft was allowed to state.
 *
 * This is Act's equivalent of the recorded WORDING an Explain answer carries.
 * There the risk is a reworded question silently keeping its old answer; here it
 * is a record whose fee has moved keeping a draft that states the old one — and
 * that is worse, because a person would confirm a figure the audit trail
 * disagrees with and send it to their accountant.
 *
 * Sorted by label rather than taken in map order, so the fingerprint depends on
 * the figures themselves and not on the order `recordFigures` happens to insert
 * them in.
 */
export function figureFingerprint(record: FigureSource): string {
  return [...recordFigures(record)]
    .map(([label, paise]) => `${label}:${paise}`)
    .sort()
    .join("|");
}

/**
 * One recorded draft, exported from a real `act()` run.
 *
 * An EXPORT of what the agent produced on one occasion, on the same reasoning
 * as the §15.1 reasoning trace and the §15.5 recorded answers: what a model
 * wrote is a fact about that run, and the only honest source for it is the run
 * itself. It ships as a committed file so the screen works with no API key, no
 * database and no network — and, unlike an answer, a draft is a document a
 * person confirms, so it has to be BYTE-STABLE between the moment it is read
 * and the moment it is approved. Regenerating on view would show a different
 * document from the one that gets recorded.
 */
const recordedDraftSchema = z.object({
  recordId: z.string().min(1),
  /** The figures the record carried when this was drafted. */
  figures: z.string().min(1),
  /** Null when the call produced no usable draft. */
  draft: actDraftSchema.nullable(),
  verdict: z.enum(["ACCEPTED", "INVALID_FIGURE", "BLOCKED_WRITE", "FAILED"]),
  unresolved: z.array(
    z.object({ text: z.string(), paise: z.number().int().nullable() }),
  ),
  unbalanced: z.boolean(),
  misfiled: z.boolean(),
  model: z.string().min(1),
  promptVersion: z.string().min(1),
  recordedAt: z.string().min(1),
  latencyMs: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  costMicroUsd: z.number().int().nonnegative(),
});

export type RecordedDraft = z.infer<typeof recordedDraftSchema>;

const fileSchema = z.array(recordedDraftSchema);

/**
 * Parse a recorded-draft file into a lookup by record id.
 *
 * Validated rather than cast, exactly as `parseExplanations` and `parseTraces`
 * are: the file is written by a separate command and committed, so it can fall
 * behind this schema between runs. A malformed draft rendered as blanks would
 * put an empty action card under a real exception, which reads as "there is
 * nothing to do here" rather than as a broken file.
 */
export function parseDrafts(raw: unknown): Map<string, RecordedDraft> {
  const parsed = fileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`recorded drafts are malformed: ${parsed.error.issues[0]?.message}`);
  }

  const byRecord = new Map<string, RecordedDraft>();
  for (const entry of parsed.data) {
    if (byRecord.has(entry.recordId)) {
      throw new Error(`recorded drafts contain ${entry.recordId} twice`);
    }
    byRecord.set(entry.recordId, entry);
  }
  return byRecord;
}

/**
 * The recorded draft for one record, or null if there is not a current one.
 *
 * "Not current" covers two cases and treats them identically on purpose: no run
 * has drafted for this record yet, or the record's figures have MOVED since the
 * draft was recorded. In both the screen has nothing honest to show, and saying
 * so is correct for both. Matching on the record id alone would quietly put a
 * stale draft under a changed record, which is the failure this file exists to
 * prevent.
 */
export function draftFor(
  recordId: string,
  record: FigureSource,
  recorded: ReadonlyMap<string, RecordedDraft>,
): RecordedDraft | null {
  const entry = recorded.get(recordId);
  if (!entry) return null;
  return entry.figures === figureFingerprint(record) ? entry : null;
}
