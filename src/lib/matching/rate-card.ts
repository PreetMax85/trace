/**
 * Razorpay's published rate cells (PRD Section 5), as INTEGER BASIS POINTS.
 * A settlement row is matched by resolving its fee against one of these —
 * there is no per-transaction invoice number to join on.
 *
 * Basis points, not decimals, and deliberately so. `285000 * 0.0215` evaluates
 * to 6127.499999999999 in IEEE-754, which rounds DOWN to 6127 where the exact
 * value 6127.5 rounds up to 6128 under every convention. `285000 * 215` is
 * 61,275,000 — an integer well inside a double's exact range — so dividing by
 * 10000 afterwards carries no error at all. Three of the 54 fixture records sit
 * on that fault line. See BUILD-LOG entry 12.
 */
export const RATE_CELLS = {
  STANDARD: 200, // 2.00%
  CORPORATE: 215, // 2.15%
} as const;

export type RateCell = keyof typeof RATE_CELLS;

/** GST on Razorpay's MDR, in basis points: 18%. */
export const GST_BASIS_POINTS = 1800;

const BASIS = 10_000;

/** The ₹1 match tolerance, exactly — compared as integers, never floats. */
export const TOLERANCE_PAISE = 100;

/**
 * Statement money is in RUPEES and recon money in integer paise, so somebody
 * has to convert — once, in one place. Rounded and never truncated: ₹8.29 × 100
 * evaluates to 828.9999999999999 in IEEE-754, and truncating loses a paise per
 * line, silently and only on some values. BUILD-LOG entry 12 is the same fault
 * on the fee side.
 *
 * It lives here rather than in the matcher because the ingestion layer needs
 * the identical conversion to cross-check an invoice's declared total, and two
 * copies of a rounding rule is how the two ends of a reconciliation drift.
 */
export const rupeesToPaise = (rupees: number) => Math.round(rupees * 100);

/**
 * What a cell says the fee should have been. Razorpay's `fee` is INCLUSIVE of
 * tax; `tax` is the GST inside it.
 */
export function priceAt(amountPaise: number, cell: RateCell) {
  const mdr = Math.round((amountPaise * RATE_CELLS[cell]) / BASIS);
  const tax = Math.round((mdr * GST_BASIS_POINTS) / BASIS);
  return { fee: mdr + tax, tax };
}
