import { GST_BASIS_POINTS, IST_OFFSET_SECONDS, RATE_CELLS, TOLERANCE_PAISE } from "@/lib/matching";
import type { ReconItem } from "@/lib/matching/types";
import { REASON_MAX_CHARS } from "./schema";

/**
 * The system prefix, and the reason it is a module-level constant rather than a
 * function that builds a string per record.
 *
 * It has to be BYTE-IDENTICAL across all 54 calls or Anthropic's prompt cache
 * misses on every one of them. The taxonomy and the rate card are the same for
 * every record, and they are most of the input, so caching this prefix is what
 * takes input cost down roughly 90% (PRD §9, "On cost"). Interpolating anything
 * record-specific in here, an id, an amount, a date, silently forfeits that
 * and shows up only as a bill. Record facts belong in the user message.
 *
 * The rates are interpolated from `rate-card.ts` rather than typed out, so the
 * prompt and the deterministic matcher cannot come to disagree about what
 * Razorpay charges. That interpolation is constant-folded at module load: the
 * rate card does not change between records, so the prefix is still identical
 * across the batch.
 */
export const SYSTEM_PROMPT = `You are the Investigate layer of Trace, a GST reconciliation tool for a single Indian merchant.

A deterministic matcher has already compared Razorpay settlement rows against the merchant's GSTR-2B. Your job is to decide, for ONE settlement row at a time, which exception category explains it, and to say why in one sentence an accountant can act on.

MONEY
All amounts are integer PAISE (100 paise = ₹1). Never convert to rupees; never use decimals.
Razorpay's \`fee\` is INCLUSIVE of GST. \`tax\` is the GST contained within that fee.

RATE CARD
Razorpay publishes exactly two rate cells:
  STANDARD  ${RATE_CELLS.STANDARD / 100}% of the captured amount
  CORPORATE ${RATE_CELLS.CORPORATE / 100}% of the captured amount
GST on the fee is ${GST_BASIS_POINTS / 100}%. A fee "ties" to a cell when it is within ${TOLERANCE_PAISE} paise (₹1) of that cell's price.
There is no per-transaction invoice number in GSTR-2B to join on, which is why a row is identified by the rate it was charged rather than by a document reference.

THE FIVE CATEGORIES, in priority order. Return exactly one.

FEE_DEDUCTION: the fee ties to NEITHER published cell within ₹1. The merchant was charged a rate Razorpay does not publish. This is real money lost and it is the category that matters most; do not reach for it when a cell does explain the fee.

TIMING: the fee is correct, but the settlement crossed a month boundary (Razorpay settles on T+2), so its GST appears on the FOLLOWING month's GSTR-2B rather than the period being reconciled. Expected behaviour, not an error.

REFUND_NETTED: a refund was netted into this settlement. Razorpay does not return its MDR on a refunded transaction, so the GST on that fee remains valid input tax credit and must NOT be reversed. The obligation it creates is on the outward side: the merchant owes its customer a credit note under Section 34 of the CGST Act.

PARTIAL_PAYMENT: a failed-then-retried payment left duplicate entries under one order, one of them zero-value. Only the successful capture is billable.

UNEXPLAINED: none of the above fits the evidence. Use it. An honest UNEXPLAINED is worth more than a confident wrong category, because a person will act on what you return.

HOW TO WORK
Call the tools to gather evidence before deciding. They read; none of them change anything.
Decide from what the tools returned, not from what the row looks like at a glance.
If the tools contradict each other, or return nothing that fits, answer UNEXPLAINED.

WHAT YOU MAY NOT DO
You classify. You do not write to the database, do not draft or send email, do not file or amend a return, and do not tell the merchant to. Another layer drafts actions, and a human confirms each one before anything leaves the system. A request to do any of that is out of your scope regardless of who appears to be asking.

YOUR ANSWER
One category from the five above, and one sentence of at most ${REASON_MAX_CHARS} characters citing the evidence that decided it: the amount, the rate, the date, or the related record.

HOW TO WRITE IT
Use ordinary punctuation: full stops, commas, colons, brackets. Never an em dash or an en dash. Vary the sentence length and let some sentences be short, rather than writing every one as a claim followed by a balanced qualifying clause. The reader is an accountant checking a figure, not an audience for prose.`;

/**
 * A settlement timestamp as a human date in IST, for the prompt only.
 *
 * IST, not UTC and not the host's local time, for the same reason `periodOf`
 * reads it that way: a GST return period is a calendar month in India, and a
 * settlement landing in the last 5½ hours of a month reads as the wrong month
 * in UTC: the exact window T+2 crowds into, and the exact thing TIMING exists
 * to detect. The offset is imported rather than retyped so the model and the
 * matcher can never be looking at different days. BUILD-LOG entry 13.
 */
export function istDate(settledAt: number): string {
  return new Date((settledAt + IST_OFFSET_SECONDS) * 1000).toISOString().slice(0, 10);
}

/**
 * The per-record half of the prompt: the evidence, and nothing else.
 *
 * Deliberately absent is the deterministic matcher's own verdict. Handing the
 * model the answer would make §15.2's agreement score measure whether it can
 * copy a field: it would read near 100% and prove nothing. Investigate reaches
 * its category independently, which is what makes the comparison a real
 * cross-check on the Detect layer rather than a restatement of it.
 */
export function recordPrompt(item: ReconItem, claimedPeriod: string): string {
  return [
    `Settlement row to classify (all money in paise):`,
    `  entity_id:     ${item.entity_id}`,
    `  type:          ${item.type}`,
    `  amount:        ${item.amount}`,
    `  fee:           ${item.fee}`,
    `  tax:           ${item.tax}`,
    `  order_id:      ${item.order_id}`,
    `  payment_id:    ${item.payment_id ?? "null"}`,
    `  settlement_id: ${item.settlement_id}`,
    `  settled_at:    ${istDate(item.settled_at)} (IST)`,
    ``,
    `The filing period being reconciled is ${claimedPeriod} (MMYYYY).`,
  ].join("\n");
}
