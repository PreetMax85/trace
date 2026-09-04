import { z } from "zod";
import type { ExceptionCategory } from "@/lib/matching/types";

/**
 * Which prompt produced a given draft. Logged on every `ai_calls` row (PRD
 * §15.4) and shown beside the draft on screen, so a draft recorded under a
 * superseded prompt cannot pass as the current one's.
 *
 * Bump it whenever ACT_SYSTEM_PROMPT or this schema changes. Both are inputs to
 * the same draft.
 */
export const ACT_PROMPT_VERSION = "act-v3";

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
 * fee arrives, and it is exactly the row a draft may NOT point at. It has been
 * auto-populated from GSTR-2B since December 2020, and CBIC Circular No.
 * 170/02/2022-GST of 6 July 2022 is explicit about what a taxpayer may do to
 * it: para 4.3(A) and para 4.4 direct that ineligible credit is given back by
 * REVERSING it in 4(B) and never by editing the auto-populated figure in 4(A).
 * The 2022 instructions issued under that circular attach interest at 18% a
 * year and a penalty to doing otherwise. Drafting an edit to `4A5` would be
 * advising an action the taxpayer is directed not to take, so the row is not in
 * the vocabulary at all.
 *
 * Whether the portal still ACCEPTS such an edit is a separate and unsettled
 * question — the hard lock on Table 4 has no traceable instrument, unlike the
 * Table 3.2 liability lock (GSTN Advisory No. 606, 7 June 2025). The vocabulary
 * does not depend on the answer: the circular settles what may be done, and
 * that is enough. BUILD-LOG 33 and 35 carry the full reasoning.
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
 * The row each exception category belongs on, and `null` where none does.
 *
 * The row↔action map above only catches a draft that contradicts ITSELF. A
 * draft can be perfectly self-consistent and still point at the wrong row for
 * the kind of exception it is about, and nothing checked that — which is how
 * the first real run came back with `NO_ENTRY` on all sixteen records, every
 * one of them marked ACCEPTED. See BUILD-LOG 35.
 *
 * The source is CBIC Circular No. 170/02/2022-GST of 6 July 2022:
 *
 * - `FEE_DEDUCTION` and `UNEXPLAINED` → **4B2**. The whole of the supplier's
 *   invoice tax auto-populates into 4A5, so a fee the merchant cannot
 *   substantiate is ALREADY claimed and "nothing is due" would leave it
 *   claimed. Para 4.3(C) puts a reversal that may be reclaimed once the
 *   condition is met in 4(B)(2), and the circular's own Annexure works this
 *   exact case: an inward supply auto-populated in 4A(5) that the registered
 *   person cannot establish was received is reversed in 4(B)(2) (Note 3).
 *   Para 4.4 adds that such a reversal goes in 4(B) and NOT 4(D).
 * - `TIMING` → **no row**. The credit lands on the FOLLOWING period's GSTR-2B
 *   and is not in this month's 4A5 to begin with. Reversing it is how a
 *   merchant gives up money they are still owed.
 * - `REFUND_NETTED` → **no row**. Razorpay keeps its fee on a refunded
 *   payment, so the merchant's inward credit is untouched. The Section 34
 *   credit note this record raises is the merchant's own OUTWARD document to
 *   its customer, which lands in Table 3, not Table 4.
 * - `PARTIAL_PAYMENT` → **no row**. These rows carry no tax at all.
 *
 * Typed against `ExceptionCategory` so a sixth category — were the taxonomy
 * ever widened — fails to compile here rather than silently routing nowhere.
 */
export const GSTR3B_CATEGORY_ROW: Record<ExceptionCategory, Gstr3bLine | null> = {
  FEE_DEDUCTION: "4B2",
  UNEXPLAINED: "4B2",
  TIMING: null,
  REFUND_NETTED: null,
  PARTIAL_PAYMENT: null,
};

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
