import { z } from "zod";

/**
 * Which prompt produced a given draft. Logged on every `ai_calls` row (PRD
 * §15.4) and shown beside the draft on screen, so a draft recorded under a
 * superseded prompt cannot pass as the current one's.
 *
 * Bump it whenever ACT_SYSTEM_PROMPT or this schema changes. Both are inputs to
 * the same draft.
 */
export const ACT_PROMPT_VERSION = "act-v2";

/**
 * Caps, not targets. Output is most of the bill (PRD §9, "On cost") and a draft
 * is read by a person deciding whether to send it — a long one buries the
 * figure that makes it checkable. Generous enough that a good draft never trips
 * them, tight enough that an essay cannot be decoded at all.
 */
export const SUBJECT_MAX_CHARS = 140;
export const EMAIL_MAX_CHARS = 1200;
export const NOTE_MAX_CHARS = 280;
export const NARRATION_MAX_CHARS = 240;
export const LEDGER_MAX_CHARS = 60;

/**
 * The GSTR-3B rows a drafted flag may point at.
 *
 * GSTR-3B is the monthly summary return where a merchant declares what it owes
 * and claims the input tax credit it is entitled to; Table 4 is the credit half
 * of that form. These are the rows a taxpayer still FILLS IN — the ones that
 * carry a judgement the portal cannot make for them:
 *
 * - `4B1` — a permanent reversal: credit given back and never taken again,
 *   e.g. a blocked credit under Section 17(5) or a Rule 42/43 apportionment.
 * - `4B2` — a reclaimable (temporary) reversal: credit given back for now and
 *   taken again later, reported in `4D1` when it is reclaimed.
 * - `4D1` — a reclaim of something reversed under `4B2` in an earlier period.
 * - `4D2` — credit that is not available at all, reported for disclosure, e.g.
 *   under the Section 16(4) time bar or the place-of-supply restriction.
 *
 * Note which row is ABSENT. `4A5` ("All other ITC") is where GST on a gateway
 * fee arrives, and it is exactly the row a draft may NOT point at: since the
 * October 2025 tax period it is auto-populated from GSTR-2B according to the
 * merchant's Invoice Management System actions, and the lawful way to give
 * credit back is a reversal in 4(B) — never typing a smaller number over the
 * auto-populated claim, which merely creates a 2B-to-3B mismatch the portal
 * now validates against. Drafting an edit to `4A5` would be advising an action
 * the form does not offer, so the row is not in the vocabulary at all.
 *
 * These are ROW REFERENCES, not GSTN's own label text. The exact wording of
 * each row heading is not published in a form this project could check, so it
 * is described here rather than quoted as if it were official.
 */
export const GSTR3B_LINES = ["4B1", "4B2", "4D1", "4D2"] as const;

/**
 * What the flag asks a person to do.
 *
 * `NO_ENTRY` is the one that earns its place. A `TIMING` record's GST lands on
 * the FOLLOWING period's GSTR-2B: it is not claimable this month and it is not
 * a reversal either, so there is genuinely no Table 4 row for it and the honest
 * draft says so. Without this value a model has to pick some row anyway, and a
 * merchant would reverse a credit they are still owed.
 *
 * Each action belongs on exactly one kind of row, which makes the pair
 * redundant — deliberately. The two halves are checked against each other the
 * way a voucher's debits are checked against its credits: a draft that files a
 * reclaim on a reversal row disagrees with itself, and that disagreement is
 * evidence it did not understand the row it chose.
 */
export const GSTR3B_ACTIONS = ["REVERSE", "RECLAIM", "REPORT_ONLY", "NO_ENTRY"] as const;

/**
 * The one action each row admits, and `null` for the row-less case.
 *
 * The gate reads the flag through this map rather than through a list of
 * forbidden combinations, so a row added above without a decision about what
 * may be done on it fails to typecheck instead of silently accepting anything.
 */
export const GSTR3B_ROW_ACTION: Record<(typeof GSTR3B_LINES)[number], Gstr3bAction> = {
  "4B1": "REVERSE",
  "4B2": "REVERSE",
  "4D1": "RECLAIM",
  "4D2": "REPORT_ONLY",
};

export type Gstr3bLine = (typeof GSTR3B_LINES)[number];
export type Gstr3bAction = (typeof GSTR3B_ACTIONS)[number];

/**
 * Tally voucher types a correction can use. A fee correction is a journal; a
 * netted refund's Section 34 obligation is a credit note.
 */
export const TALLY_VOUCHER_TYPES = ["JOURNAL", "CREDIT_NOTE"] as const;

export const TALLY_SIDES = ["DEBIT", "CREDIT"] as const;

const tallyLineSchema = z.strictObject({
  ledger: z
    .string()
    .min(1)
    .max(LEDGER_MAX_CHARS)
    .describe("The Tally ledger this line posts to, e.g. Payment Gateway Charges."),
  side: z.enum(TALLY_SIDES),
  amountPaise: z
    .number()
    .int()
    .nonnegative()
    .describe("Integer paise. A line carries a positive amount; the side decides its sign."),
});

/**
 * What the Act layer is allowed to return: the three drafts, for one record.
 *
 * Note what is ABSENT, because the absence is the permission boundary rather
 * than an oversight. There is no `category` — Act drafts against a
 * classification another layer already made, and `strictObject` means a draft
 * that reaches for one fails to decode, the same mechanism §15.3 uses to make a
 * sixth category unrepresentable. There is no recipient address, no send flag,
 * and no confirmation field: Act cannot send, and a schema with nowhere to put
 * "send this" is a stronger statement of that than a prompt is.
 *
 * Every amount is INTEGER PAISE, on the same discipline as the database
 * columns. A draft that carried rupees as a float would be the one place in the
 * pipeline where a figure a merchant claims credit for went through IEEE-754.
 */
export const actDraftSchema = z.strictObject({
  caEmail: z.strictObject({
    subject: z
      .string()
      .min(1)
      .max(SUBJECT_MAX_CHARS)
      .describe("One line. Name the settlement and the period."),
    body: z
      .string()
      .min(1)
      .max(EMAIL_MAX_CHARS)
      .describe(
        "The email to the merchant's chartered accountant, in plain English. State every rupee figure with a ₹ sign and two decimal places.",
      ),
  }),

  gstr3bFlag: z.strictObject({
    line: z
      .enum(GSTR3B_LINES)
      .nullable()
      .describe("The Table 4 row this amount belongs on, or null when no entry is due."),
    action: z.enum(GSTR3B_ACTIONS),
    amountPaise: z
      .number()
      .int()
      .nonnegative()
      .describe("The GST this flag is about, in integer paise."),
    note: z
      .string()
      .min(1)
      .max(NOTE_MAX_CHARS)
      .describe("One or two sentences saying why this row is flagged."),
  }),

  tallyEntry: z.strictObject({
    voucherType: z.enum(TALLY_VOUCHER_TYPES),
    narration: z.string().min(1).max(NARRATION_MAX_CHARS),
    // At least two: a voucher with one line cannot balance. Capped because a
    // record-level correction that needs seven ledgers is not a correction.
    lines: z.array(tallyLineSchema).min(2).max(6),
  }),
});

export type ActDraft = z.infer<typeof actDraftSchema>;
export type TallyLine = z.infer<typeof tallyLineSchema>;
