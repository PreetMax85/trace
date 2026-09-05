/**
 * Integer paise rendered as rupees, for the screen.
 *
 * The whole pipeline holds money as integer paise and never as a float, so the
 * one place that has to produce a human-readable rupee figure is the one place a
 * rounding rule could quietly enter the product. It lives here, alone, and is
 * tested: a screen that shows a merchant 982.23 when the audit trail recorded
 * 98223 paise is the only version of this that is safe to put in front of a CA.
 *
 * The locale is pinned rather than inherited, and that is the load-bearing part.
 * A formatter that falls back to `navigator.languages` follows the VIEWER'S
 * browser, so the same audit figure reads as ₹1,196.92 here and ₹1.196,92 to
 * somebody on a German browser. A figure that has to match the audit trail
 * cannot depend on who is looking at it, and anything reading `window` at all
 * throws during server rendering.
 */

/** Paise in a rupee. Named because `/ 100` twice is how two rules drift. */
const PAISE_PER_RUPEE = 100;

/** The rupee sign, U+20B9. */
const RUPEE_SIGN = "₹";

/**
 * `1196.92` → `"1,196.92"`. No currency sign; see `formatRupees`.
 *
 * Integer arithmetic throughout. The rupee part is `(abs - abs % 100) / 100`,
 * whose true quotient is always an integer inside the safe range, so IEEE-754
 * returns it exactly; the paise part is a remainder and never a division. That
 * matters because the naive `(paise / 100).toFixed(2)` is a float operation on
 * a figure the merchant will claim credit for.
 */
export function formatPaise(paise: number): string {
  const value = requirePaise(paise);

  // `value < 0` and not `Math.sign`: negative zero must read as "0.00", never
  // "-0.00". A delta of exactly nothing is not a shortfall.
  const negative = value < 0;
  const abs = Math.abs(value);

  const rupees = (abs - (abs % PAISE_PER_RUPEE)) / PAISE_PER_RUPEE;
  const fraction = abs % PAISE_PER_RUPEE;

  return `${negative ? "-" : ""}${groupIndian(rupees)}.${String(fraction).padStart(2, "0")}`;
}

/** `1196.92` → `"₹1,196.92"`. The sign leads: `-₹341.05`. */
export function formatRupees(paise: number): string {
  const formatted = formatPaise(paise);

  return formatted.startsWith("-")
    ? `-${RUPEE_SIGN}${formatted.slice(1)}`
    : `${RUPEE_SIGN}${formatted}`;
}

/**
 * Indian digit grouping: the last three digits, then twos. ₹12,34,567.89, not
 * ₹1,234,567.89. Every figure on this screen goes on an Indian tax return and
 * is read by an Indian accountant; the two conventions agree below one lakh,
 * which is exactly why getting it wrong here would never surface in testing on
 * this fixture.
 */
function groupIndian(rupees: number): string {
  const digits = String(rupees);
  if (digits.length <= 3) return digits;

  const lastThree = digits.slice(-3);
  const rest = digits.slice(0, -3);

  return `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${lastThree}`;
}

/**
 * Refuses anything that is not an exact integer count of paise.
 *
 * This is the guard that matters. `8.29 * 100` is 828.9999999999999 in
 * IEEE-754 (BUILD-LOG entry 12 is the same fault on the fee side), and a
 * formatter that accepted it would print a confident, wrong figure rather than
 * fail — `828.9999999999999 % 100` is 28.999999999999943. Anything past
 * `Number.MAX_SAFE_INTEGER` is refused for the same reason: past that point the
 * integer arithmetic above stops being exact.
 */
function requirePaise(paise: number): number {
  if (!Number.isSafeInteger(paise)) {
    throw new Error(
      `money must be an exact integer count of paise within the safe integer range, received ${paise}`,
    );
  }

  return paise;
}
