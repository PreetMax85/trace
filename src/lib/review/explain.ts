import { formatIstDateTime, formatPeriod } from "@/lib/format/date";
import { formatRupees } from "@/lib/format/money";
import { priceAt, RATE_CELLS, TOLERANCE_PAISE } from "@/lib/matching";
import type { RateCell } from "@/lib/matching";
import type { ReviewRow } from "./batch";

/**
 * Why a record carries the verdict it carries, in plain language.
 *
 * Rules only. This is the Detect layer's reasoning restated for a person, not
 * the Investigate agent's — no model is called here and none should be. The
 * screen has to be readable with no API key and no network, and a deterministic
 * verdict deserves a deterministic explanation: the same row always produces
 * the same sentence, which is what makes it safe to put in an audit trail.
 *
 * Every figure it quotes is recomputed from the same `priceAt` the matcher
 * used, so the explanation cannot describe arithmetic the matcher did not do.
 */

export type RecordExplanation = {
  /** One line. What happened, in the words a person would use. */
  headline: string;
  /** The figures and the rule behind the verdict, in reading order. */
  points: string[];
};

/** A classified row before its explanation is attached. */
/**
 * `trace` is excluded as well as `explanation`, and that is load-bearing rather
 * than tidy: this module is rules-only and must stay renderable with no API key
 * (see the note at the top of the file). Withholding the agent's output at the
 * type level means it cannot come to depend on one by accident.
 */
type ClassifiedRow = Omit<ReviewRow, "explanation" | "trace">;

export function explainRow(row: ClassifiedRow, period: string): RecordExplanation {
  switch (row.category) {
    case null:
      return matched(row);
    case "FEE_DEDUCTION":
      return feeDeduction(row);
    case "TIMING":
      return timing(row, period);
    case "REFUND_NETTED":
      return refundNetted(row);
    case "PARTIAL_PAYMENT":
      return partialPayment(row);
    case "UNEXPLAINED":
      return unexplained(row);
  }
}

function matched(row: ClassifiedRow): RecordExplanation {
  const cell = row.rateCell;

  return {
    headline: cell
      ? `Matched — the fee is exactly what Razorpay's ${rateLabel(cell)} rate charges.`
      : "Matched.",
    points: [
      charged(row),
      ...(cell ? [pricedAt(row, cell)] : []),
      row.method === "EXACT"
        ? "This is the rate the merchant expects to pay, so the match is EXACT — the highest confidence tier."
        : "The merchant's own standard rate did not explain this fee, but another rate Razorpay publishes did, so the match is FUZZY.",
      `The ${formatRupees(row.taxPaise)} of GST inside the fee is input tax credit this merchant can claim.`,
    ],
  };
}

function feeDeduction(row: ClassifiedRow): RecordExplanation {
  return {
    headline: "Flagged — no rate Razorpay publishes explains this fee.",
    points: [
      charged(row),
      bothCells(row),
      `Both are more than the ${formatRupees(TOLERANCE_PAISE)} match tolerance away from what was actually deducted.`,
      `Until the difference is explained, the ${formatRupees(row.taxPaise)} of GST inside this fee is credit at risk: nothing on Razorpay's GSTR-2B invoice accounts for it.`,
    ],
  };
}

function timing(row: ClassifiedRow, period: string): RecordExplanation {
  const cell = row.rateCell;

  return {
    headline: `Flagged — this settled into ${formatPeriod(row.billedIn)}, not ${formatPeriod(period)}.`,
    points: [
      `Settled ${formatIstDateTime(row.settledAt)}, which falls in ${formatPeriod(row.billedIn)}.`,
      charged(row),
      ...(cell ? [`The fee itself is correct — ${pricedAt(row, cell).replace(/^The /, "the ")}`] : []),
      `Razorpay bills it on ${formatPeriod(row.billedIn)}'s GSTR-2B rather than ${formatPeriod(period)}'s, so it is deliberately left out of this period's rollup. Nothing is wrong with the fee; it belongs to the next return.`,
    ],
  };
}

function refundNetted(row: ClassifiedRow): RecordExplanation {
  const cell = row.rateCell;

  return {
    headline: "Flagged — this payment was refunded, and the refund was netted into a later settlement.",
    points: [
      charged(row),
      ...(cell ? [pricedAt(row, cell)] : []),
      `Razorpay does not return its fee when a payment is refunded, so the ${formatRupees(row.taxPaise)} of GST inside it stays claimable. This row is not a threat to the input tax credit.`,
      "What the refund creates is an obligation on the other side of the books: a credit note to the customer under Section 34 of the CGST Act, which reduces the merchant's own output tax.",
      "The refund is matched to this payment by its payment id, never by its settlement id — a refund almost never lands in the same settlement as the payment it reverses.",
    ],
  };
}

function partialPayment(row: ClassifiedRow): RecordExplanation {
  return {
    headline: "Flagged — the failed leg of a retried payment.",
    points: [
      `This row settled ${formatRupees(row.amountPaise)} and was charged no fee, so there is nothing to price against a rate card.`,
      `Order ${row.orderId} was captured on a separate row, and only that capture is billable.`,
      "It is surfaced rather than hidden because a row carrying no money is exactly the kind of thing a reconciliation should say it saw, not silently drop.",
    ],
  };
}

function unexplained(row: ClassifiedRow): RecordExplanation {
  // A zero-value row that was nonetheless charged a fee. It cannot be called a
  // failed retry, because PARTIAL_PAYMENT's explanation ("only the capture is
  // billable") would then be a false statement about a real deduction.
  if (row.amountPaise === 0) {
    return {
      headline: "Flagged — a fee was charged on a row where nothing was captured.",
      points: [
        `Nothing settled on order ${row.orderId}, yet ${formatRupees(row.feePaise)} was deducted.`,
        "A rate card prices a percentage of an amount, and there is no amount here, so no published rate can explain it either way.",
        "There is no honest rule that resolves this, so it is reported as unexplained rather than filed under a category that would misdescribe it.",
      ],
    };
  }

  // Otherwise the fee resolved to more than one published cell.
  return {
    headline: "Flagged — two rates Razorpay publishes both explain this fee.",
    points: [
      charged(row),
      bothCells(row),
      `Both land within the ${formatRupees(TOLERANCE_PAISE)} tolerance, so nothing but the order the rates happen to be checked in could choose between them.`,
      'The ambiguity is reported rather than resolved. Telling a CA "you were charged a rate that does not exist" about a fee that matches two published rates would be a false statement.',
    ],
  };
}

/** What Razorpay actually took, and the tax inside it. */
const charged = (row: ClassifiedRow) =>
  `Razorpay deducted ${formatRupees(row.feePaise)} on a ${formatRupees(row.amountPaise)} payment, of which ${formatRupees(row.taxPaise)} is GST.`;

/** What one rate cell says the fee should have been. */
const pricedAt = (row: ClassifiedRow, cell: RateCell) =>
  `The ${rateLabel(cell)} rate prices this payment at ${formatRupees(priceAt(row.amountPaise, cell).fee)}.`;

/** What both published rates say — the comparison behind an unmatched fee. */
const bothCells = (row: ClassifiedRow) =>
  `At ${rateLabel("STANDARD")} the fee would be ${formatRupees(priceAt(row.amountPaise, "STANDARD").fee)}; at ${rateLabel("CORPORATE")}, ${formatRupees(priceAt(row.amountPaise, "CORPORATE").fee)}.`;

/**
 * `"STANDARD"` → `"2.00% standard"`. Derived from the matcher's own basis
 * points rather than written out, so a change to the rate card cannot leave the
 * screen quoting a rate the matcher no longer uses.
 */
function rateLabel(cell: RateCell): string {
  return `${(RATE_CELLS[cell] / 100).toFixed(2)}% ${cell.toLowerCase()}`;
}
