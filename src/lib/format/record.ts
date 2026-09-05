/**
 * What a settlement row is, in the words a person would use.
 *
 * `pay_OmWyu0UGKY8O4o` is a perfectly good identifier and a terrible label. It
 * is the join key back to Razorpay's own dashboard, so it stays on the row and
 * has to stay exact. It just should not be the first thing anyone reads, and
 * before this it was the only thing there was to read.
 *
 * Nothing here is used in a computation. These functions turn fields the
 * matcher deliberately ignores into a sentence, and the matcher must keep
 * ignoring them: the rate a fee is checked against comes from Razorpay's
 * published card, never from what the row says about itself.
 */

/**
 * How the customer paid, capitalised the way each one is normally written.
 *
 * A lookup rather than a `toUpperCase` on the first letter, because "Upi" and
 * "Netbanking" are not how anyone writes those, and an unrecognised method
 * falls through to the raw string rather than to a guess.
 */
const METHOD_LABELS: Record<string, string> = {
  card: "Card",
  upi: "UPI",
  netbanking: "Netbanking",
  wallet: "Wallet",
  emi: "EMI",
  paylater: "Pay later",
};

/**
 * `("card", "payment")` → `"Card payment"`, `(null, "refund")` → `"Refund"`.
 *
 * The method is genuinely absent on some rows, and an absent method must read
 * as an ordinary payment rather than as an empty space or as "Unknown payment",
 * which would look like a data problem where there is none.
 */
export function describeRecord(method: string | null, type: "payment" | "refund"): string {
  // An empty string is treated as absent, not as a method. The parser already
  // drops empty strings to null, so this is defence against a second caller
  // rather than against the one that exists — a bare `""` here would render as
  // a leading space before "payment", which looks like a rendering fault.
  const named = method === null || method.length === 0 ? null : method;
  const label = named === null ? null : (METHOD_LABELS[named] ?? capitalise(named));
  if (label === null) return type === "refund" ? "Refund" : "Payment";
  return `${label} ${type}`;
}

/** First letter up, rest untouched. Only ever reached by an unlisted method. */
function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
