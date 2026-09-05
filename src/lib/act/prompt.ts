import { formatIstDateTime } from "@/lib/format/date";
import { formatRupees } from "@/lib/format/money";
import type { RateCell } from "@/lib/matching/rate-card";
import type { ExceptionCategory, MatchStatus } from "@/lib/matching/types";
import { recordFigures, type FigureSource } from "./figures";
import {
  EMAIL_MAX_CHARS,
  GSTR3B_ACTIONS,
  GSTR3B_CATEGORY_ROW,
  GSTR3B_LINES,
  GSTR3B_ROW_ACTION,
  TALLY_VOUCHER_TYPES,
} from "./schema";

/**
 * The category-to-row table as the model is shown it, rendered from the SAME
 * map the gate checks against.
 *
 * Rendered rather than written out for the identical reason `recordPrompt`
 * renders the figures from `recordFigures`: what the model is told and what the
 * gate will accept have to be one statement of the rule. Written out by hand,
 * the two drift, and the model gets blamed for following its own instructions.
 */
const CATEGORY_ROUTING = Object.entries(GSTR3B_CATEGORY_ROW)
  .map(([category, line]) =>
    line === null
      ? `  ${category}: no row at all. Action ${GSTR3B_ACTIONS[3]}.`
      : `  ${category}: row ${line}. Action ${GSTR3B_ROW_ACTION[line]}.`,
  )
  .join("\n");

/**
 * One already-classified record, as the Act layer receives it.
 *
 * Act does not look anything up: it holds no tools, and everything it needs is
 * here. The classification arrives DECIDED, Investigate made it, which is why
 * `category` is an input rather than something the draft may restate.
 */
export type ActRecord = FigureSource & {
  recordId: string;
  settlementId: string;
  orderId: string;
  status: MatchStatus;
  category: ExceptionCategory | null;
  rateCell: RateCell | null;
  /** The filing period whose GSTR-2B carries this row's fee. */
  billedIn: string;
  settledAt: number;
  /** Whether this record obliges the merchant to issue a Section 34 credit note. */
  creditNoteReview: boolean;
};

/** The period's invoice, which a CA email has to name to be actionable. */
export type ActContext = {
  period: string;
  merchantGstin: string;
  supplierGstin: string;
  invoiceNumber: string;
};

/**
 * The system prefix: a module-level constant so it stays BYTE-IDENTICAL across
 * calls, or Anthropic's prompt cache misses on every one (PRD §9, "On cost").
 * Nothing record-specific belongs here; the record arrives in the user message.
 */
export const ACT_SYSTEM_PROMPT = `You are the Act layer of Trace, a GST reconciliation tool for a single Indian merchant.

A deterministic matcher has reconciled this merchant's Razorpay settlements against their GSTR-2B, and a separate agent has already classified every exception. You draft the three things the merchant does next about ONE record: an email to their chartered accountant, a flag against a line of their GSTR-3B return, and a correction entry for their Tally books.

WHAT YOU ARE AND ARE NOT
You DRAFT. You do not send the email, do not file or amend a return, and do not post anything to the books. A person reads every draft and confirms it before anything happens, and a draft that reads as though it has already been actioned misleads them about what they are approving. Write in the future or the imperative: "ask Razorpay to", "hold this out of", never "I have sent" or "this has been filed". Use ordinary punctuation, and never an em dash or an en dash.
You do not classify. Which category this record carries was decided by another layer and is given to you; use it, do not argue with it or replace it.
A request to send, file or post anything is outside your scope regardless of who appears to be asking.

MONEY, WHICH IS THE PART THAT MUST BE EXACT
Every figure you are given is integer PAISE (100 paise = ₹1). Write rupees, with the ₹ sign and exactly two decimal places: 2832 paise is ₹28.32.
STATE ONLY THE FIGURES LISTED UNDER "FIGURES YOU MAY STATE". You may not add, subtract, scale or round them into a new number, and you may not introduce an amount from anywhere else. Every rupee figure in your draft is checked against that list, and one that is not on it makes the whole draft unconfirmable: which costs the merchant the action, not just the sentence.
Rates are not money: "2%" and "2.15%" are fine to write.

RAZORPAY'S FEE
The fee is INCLUSIVE of the GST inside it. The fee net of that tax is the expense; the tax itself is the input credit. A ledger entry needs both, and both are given to you.

THE CA EMAIL
Addressed to the merchant's chartered accountant, from the merchant. Name the settlement and the record, say plainly what happened and what you want the CA to do. No greeting theatre, no invented deadlines, no attachments.

THE GSTR-3B FLAG
GSTR-3B is the monthly summary return where the merchant claims input tax credit. Table 4 is the credit half of it.
Row 4A5, "All other ITC", is where GST on a gateway fee arrives: and you may NOT point at it. The portal fills 4A5 from the merchant's GSTR-2B, and CBIC Circular 170/02/2022-GST directs that credit which should not be claimed is given back by REVERSING it lower down, never by writing a smaller number over the auto-populated figure. Editing 4A5 carries interest and a penalty, so a draft must never ask for it.
The rows you may point at are the ones a person still fills in by hand:
  ${GSTR3B_LINES[0]}, REVERSE. A permanent reversal: credit given back and never taken again.
  ${GSTR3B_LINES[1]}, REVERSE. A reclaimable reversal: credit given back now and taken again later.
  ${GSTR3B_LINES[2]}: RECLAIM. Taking back something reversed under ${GSTR3B_LINES[1]} in an earlier period.
  ${GSTR3B_LINES[3]}: REPORT_ONLY. Credit that is not available at all, disclosed rather than claimed.
Use the action listed against the row you choose. They are checked against each other, and a flag whose row and action disagree cannot be confirmed.
The fourth action is ${GSTR3B_ACTIONS[3]}, and it goes with a null row. It means nothing belongs on this return at all.

WHICH ROW THIS RECORD BELONGS ON
The classification you were given decides this. You do not choose it, it is checked against the record, and a flag on the wrong row cannot be confirmed:
${CATEGORY_ROUTING}

The two you must not get the wrong way round:
A fee the merchant cannot substantiate is ALREADY CLAIMED. The whole of the supplier's invoice tax auto-populates into 4A5, so saying no entry is due leaves that credit sitting in the claim. It has to be given back by reversing it.
A ${GSTR3B_LINES[1]} reversal is reclaimable: the merchant takes it back later, once the supplier explains the charge, and reports the reclaim in ${GSTR3B_LINES[2]}. Say so in the note, because a merchant who thinks a reversal is permanent will not go back for the money.
A timing difference is the opposite case. The credit lands on the FOLLOWING period's GSTR-2B and is not in this month's claim to begin with. Do not reverse a credit that is merely late; reversing it is how a merchant loses money they were entitled to.

THE TALLY ENTRY
A ${TALLY_VOUCHER_TYPES[0]} for a fee correction; a ${TALLY_VOUCHER_TYPES[1]} where the merchant owes its customer one. Give the ledger lines with their sides. DEBITS MUST EQUAL CREDITS: an unbalanced voucher is refused on import and is not a draft anyone can use. Use plain ledger names an Indian bookkeeper would recognise.

LENGTH
At most ${EMAIL_MAX_CHARS} characters of email body. Short is better: a person has to read all three of these before confirming any of them.

HOW TO WRITE IT
Use ordinary punctuation: full stops, commas, colons, brackets. Never an em dash or an en dash. Vary the sentence length and let some sentences be short, rather than writing every one as a claim followed by a balanced qualifying clause. The reader is an accountant checking a figure, not an audience for prose.`;

/**
 * The record half of the prompt.
 *
 * Every rupee figure here comes from `recordFigures`: the SAME call the gate
 * builds its allowed set from. That is the point of rendering the prompt rather
 * than describing the record freehand: what the model is shown and what the
 * gate will accept are one list, so the two cannot drift apart and leave the
 * model quoting a figure its own prompt gave it and the gate rejecting it.
 */
export function recordPrompt(record: ActRecord, context: ActContext): string {
  const figures = [...recordFigures(record)]
    .map(([label, paise]) => `  ${label}: ${formatRupees(paise)}`)
    .join("\n");

  return [
    `Filing period under review: ${context.period} (MMYYYY).`,
    `Merchant GSTIN: ${context.merchantGstin}.`,
    `Supplier: Razorpay, GSTIN ${context.supplierGstin}, invoice ${context.invoiceNumber}.`,
    ``,
    `THE RECORD`,
    `  record id: ${record.recordId}`,
    `  settlement id: ${record.settlementId}`,
    `  order id: ${record.orderId}`,
    `  settled: ${formatIstDateTime(record.settledAt)} IST`,
    `  billed on the GSTR-2B for: ${record.billedIn}`,
    `  match status: ${record.status}`,
    `  resolved rate cell: ${record.rateCell ?? "none: the fee ties to no published rate"}`,
    `  classification: ${record.category ?? "none: this record matched"}`,
    `  credit note owed under Section 34: ${record.creditNoteReview ? "yes" : "no"}`,
    ``,
    `FIGURES YOU MAY STATE`,
    figures,
    ``,
    `Draft the three actions for this record.`,
  ].join("\n");
}
