import { formatRupees } from "@/lib/format/money";
import {
  bindFigures,
  recordFigures,
  type FigureSource,
  type ResolvedFigure,
  type UnresolvedFigure,
} from "./figures";
import {
  actDraftSchema,
  GSTR3B_CATEGORY_ROW,
  GSTR3B_ROW_ACTION,
  type ActDraft,
  type TallyLine,
} from "./schema";
import type { ExceptionCategory } from "@/lib/matching/types";

/**
 * What the gate needs about the record behind a draft: its figures, and the
 * classification another layer already made.
 *
 * The category is here rather than optional because the check it enables is
 * not optional. A gate that could be called without it would silently skip the
 * row check on every call site that forgot — which is precisely how sixteen
 * wrong flags passed as ACCEPTED.
 */
export type GateSource = FigureSource & { category: ExceptionCategory | null };

/**
 * What the gate concluded about one drafted action.
 *
 * `INVALID_FIGURE` is its own value rather than a flavour of `FAILED`, on
 * exactly the reasoning that separates `INVALID_CITATION` from `FAILED` for
 * Explain and `COERCED_UNEXPLAINED` from `FAILED` for Investigate: a draft that
 * states a rupee figure the record does not carry is a PROMPT problem, and a
 * call that returned nothing is an INFRASTRUCTURE one. Collapsed into one
 * bucket, a regression that starts inventing amounts would hide inside the
 * rate-limit noise.
 */
export type ActVerdict = "ACCEPTED" | "INVALID_FIGURE" | "BLOCKED_WRITE" | "FAILED";

export type GatedDraft = {
  /** The draft as written, or null when the call produced none. */
  draft: ActDraft | null;
  /** Record figures the draft states, and which figure each one is. */
  resolved: ResolvedFigure[];
  /** Amounts the draft states that the record does not support. */
  unresolved: UnresolvedFigure[];
  /** Whether the Tally voucher's debits and credits disagree. */
  unbalanced: boolean;
  /** Whether the GSTR-3B flag's row and action contradict each other. */
  misfiled: boolean;
  /** Whether the flag points at the wrong row for this record's category. */
  misrouted: boolean;
  verdict: ActVerdict;
};

/**
 * Check one drafted action before a person can confirm it.
 *
 * This is Act's equivalent of Explain's citation gate, and it exists for the
 * same reason: the layer's whole claim is that a draft is checkable against the
 * record behind it, and a claim nothing enforces is marketing. Explain has to
 * make sure every record an answer names is real; Act has to make sure every
 * rupee figure a draft states is one the record actually carries.
 *
 * An unsupported figure does NOT discard the draft. The prose may be right
 * apart from one number, and throwing it away leaves a person with nothing to
 * inspect; instead the draft is kept, the offending amounts are named, and the
 * verdict says so — which is what stops it being confirmed.
 *
 * The input is `unknown` deliberately, exactly as the other two gates are. A
 * gate typed to the thing it exists to catch is a gate that trusts its input.
 */
export function applyActGate(raw: unknown, row: GateSource): GatedDraft {
  const parsed = actDraftSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      draft: null,
      resolved: [],
      unresolved: [],
      unbalanced: false,
      misfiled: false,
      misrouted: false,
      verdict: "FAILED",
    };
  }

  const draft = parsed.data;
  const allowed = recordFigures(row);

  // Prose and structured amounts are checked against the SAME allowed set. A
  // gate that policed the email but trusted `amountPaise` would leave the one
  // figure that gets posted to a return unchecked.
  const prose = bindFigures(proseOf(draft), allowed);
  const structured = checkAmounts(amountsOf(draft), allowed);

  // Deduplicated ACROSS the two sources, not within each. The same amount
  // written in the email and posted as a ledger line is one figure the draft
  // states, and listing it twice would read as two separate problems.
  const unresolved = distinct([...prose.unresolved, ...structured.unresolved]);
  const unbalanced = !balances(draft.tallyEntry.lines);
  const misfiled = !filedCorrectly(draft.gstr3bFlag);
  const misrouted = !routedCorrectly(draft.gstr3bFlag, row.category);

  return {
    draft,
    resolved: distinct([...prose.resolved, ...structured.resolved]),
    unresolved,
    unbalanced,
    misfiled,
    misrouted,
    verdict:
      unresolved.length > 0 || unbalanced || misfiled || misrouted
        ? "INVALID_FIGURE"
        : "ACCEPTED",
  };
}

/** The first of each distinctly-written figure, in the order it was found. */
const distinct = <T extends { text: string }>(figures: readonly T[]): T[] =>
  figures.filter(
    (figure, index) => figures.findIndex((other) => other.text === figure.text) === index,
  );

/**
 * Every stretch of the draft a person reads as prose, joined for scanning.
 *
 * Joined with a newline rather than concatenated, so a figure ending one field
 * and a digit starting the next cannot merge into a third number that neither
 * of them wrote.
 */
function proseOf(draft: ActDraft): string {
  return [
    draft.caEmail.subject,
    draft.caEmail.body,
    draft.gstr3bFlag.note,
    draft.tallyEntry.narration,
    ...draft.tallyEntry.lines.map((line) => line.ledger),
  ].join("\n");
}

/** The amounts the draft carries as numbers rather than as words. */
function amountsOf(draft: ActDraft): number[] {
  return [draft.gstr3bFlag.amountPaise, ...draft.tallyEntry.lines.map((line) => line.amountPaise)];
}

/**
 * Structured amounts against the record's own figures.
 *
 * Reported in the same shape as a prose figure, rendered through the same
 * `formatRupees` the screen uses, so a person reading "the draft states an
 * amount this record does not carry" sees one list rather than two kinds of
 * complaint about the same fault.
 */
function checkAmounts(amounts: readonly number[], allowed: ReadonlyMap<string, number>) {
  const resolved: ResolvedFigure[] = [];
  const unresolved: UnresolvedFigure[] = [];

  for (const paise of amounts) {
    const label = labelFor(paise, allowed);
    const text = formatRupees(paise);

    if (label === null) {
      if (!unresolved.some((figure) => figure.text === text)) unresolved.push({ text, paise });
      continue;
    }

    if (!resolved.some((figure) => figure.text === text)) resolved.push({ text, paise, label });
  }

  return { resolved, unresolved };
}

function labelFor(paise: number, allowed: ReadonlyMap<string, number>): string | null {
  for (const [label, value] of allowed) {
    if (value === paise) return label;
  }
  return null;
}

/**
 * Whether a voucher's debits and credits agree.
 *
 * Double entry is the one property of a Tally entry that can be checked without
 * knowing anything about the merchant's chart of accounts, and an unbalanced
 * voucher is rejected by Tally on import — so a draft that does not balance is
 * not a draft a person can use, however well it reads. Integer paise
 * throughout, so the comparison is exact.
 */
function balances(lines: readonly TallyLine[]): boolean {
  const total = (side: TallyLine["side"]) =>
    lines
      .filter((line) => line.side === side)
      .reduce((running, line) => running + line.amountPaise, 0);

  return total("DEBIT") === total("CREDIT");
}

/**
 * Whether a GSTR-3B flag's row and its action agree.
 *
 * Each Table 4 row admits exactly one action, so naming both says the same
 * thing twice — and that redundancy is what makes the flag checkable at all.
 * The rest of the gate can verify the AMOUNT against the record, but nothing in
 * the record says which row an amount belongs on; the only thing available to
 * check is whether the draft is consistent with itself. A reclaim filed on a
 * reversal row, or a row named beside "no entry is due", is a draft that did
 * not understand the row it chose, and a merchant acting on it would put a
 * figure in the wrong half of their return.
 *
 * `null` is the row-less case and pairs with `NO_ENTRY` alone: a credit landing
 * on a later period's GSTR-2B has no row this month, and a draft that both
 * names a row and says no entry is due contradicts itself.
 */
function filedCorrectly(flag: ActDraft["gstr3bFlag"]): boolean {
  if (flag.line === null) return flag.action === "NO_ENTRY";
  return flag.action === GSTR3B_ROW_ACTION[flag.line];
}

/**
 * Whether a flag points at the row this record's category belongs on.
 *
 * `filedCorrectly` above asks whether the draft agrees with ITSELF. This asks
 * the separate question of whether it agrees with the RECORD, and the two are
 * genuinely different: `NO_ENTRY` beside a null row is perfectly self-consistent
 * and is still wrong on a fee the merchant has already claimed and cannot
 * substantiate. Nothing checked this until the first run against a real model
 * returned `NO_ENTRY` on all sixteen flagged records and the gate marked every
 * one ACCEPTED.
 *
 * A record with no category is one the matcher resolved cleanly, and Act does
 * not draft for those; if one ever arrives, there is no row to check against
 * and the self-consistency check is all there is.
 */
function routedCorrectly(
  flag: ActDraft["gstr3bFlag"],
  category: ExceptionCategory | null,
): boolean {
  if (category === null) return true;
  return flag.line === GSTR3B_CATEGORY_ROW[category];
}

/**
 * Tools Act was handed that it is not allowed to hold — which is all of them.
 *
 * Act holds NO tools, and that is the permission boundary rather than an
 * omission. Investigate needs lookups to gather evidence and Explain needs them
 * to range over 54 records, but Act drafts against ONE already-classified
 * record whose every figure is put in front of it deterministically. Holding no
 * tools means there is nothing for it to reach — no send, no write, no network
 * — and "drafts only · cannot send" (PRD §9) stops depending on which tools
 * someone remembered to leave off a list.
 *
 * It also keeps the gate honest: what the model is shown and what the gate will
 * accept are built from the same `recordFigures` call, so the two cannot drift.
 */
export function unauthorisedActTools(names: readonly string[]): string[] {
  return [...names];
}
