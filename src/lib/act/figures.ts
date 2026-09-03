/**
 * One rupee figure found in a draft, and the record figure it resolved to.
 */
export type ResolvedFigure = { text: string; paise: number; label: string };

/**
 * A figure the draft states that the record does not support.
 *
 * `paise` is null when the text is money-shaped but is not a rupee amount at
 * all — `₹23.6` or `₹1.234`. Those must never be coerced into a number: `₹23.6`
 * silently read as the record's ₹23.60 would let a draft state a fee one way
 * while the audit trail states it another, which is the exact failure this gate
 * exists to catch.
 */
export type UnresolvedFigure = { text: string; paise: number | null };

export type BoundFigures = {
  resolved: ResolvedFigure[];
  unresolved: UnresolvedFigure[];
};

/** A rupee amount as `formatRupees` writes one: `₹1,196.92`, `-₹341.05`. */
const RUPEE_FIGURE = /-?₹\s?[\d,]+(?:\.\d+)?/g;

export function bindFigures(
  text: string,
  allowed: ReadonlyMap<string, number>,
): BoundFigures {
  const resolved: ResolvedFigure[] = [];
  const unresolved: UnresolvedFigure[] = [];

  for (const match of text.matchAll(RUPEE_FIGURE)) {
    const written = match[0];
    const paise = toPaise(written);

    if (paise === null) {
      if (!seen(unresolved, written)) unresolved.push({ text: written, paise: null });
      continue;
    }

    const label = labelFor(paise, allowed);
    if (label === null) {
      if (!seen(unresolved, written)) unresolved.push({ text: written, paise });
      continue;
    }

    if (!seen(resolved, written)) resolved.push({ text: written, paise, label });
  }

  return { resolved, unresolved };
}

/**
 * Whether a figure written exactly this way has already been collected.
 *
 * Deduplicated by the text as written rather than by the parsed value, so a
 * draft that states ₹23.60 in one place and ₹23.6 in another reports both — the
 * disagreement between them is the thing worth seeing.
 */
const seen = (figures: readonly { text: string }[], text: string) =>
  figures.some((figure) => figure.text === text);

/** The first record figure equal to this amount, or null. */
function labelFor(paise: number, allowed: ReadonlyMap<string, number>): string | null {
  for (const [label, value] of allowed) {
    if (value === paise) return label;
  }
  return null;
}

/**
 * `₹1,196.92` → 119692, or null when the text is not a rupee amount.
 *
 * Integer arithmetic throughout, on the same reasoning as `formatPaise`: the
 * naive `Number("1196.92") * 100` is 119691.99999999999 in IEEE-754, and a gate
 * that compared THAT against the record would report a correct figure as
 * fabricated. Paise are two digits or none; anything else is refused rather
 * than rounded, because the rounding is where a wrong figure would enter.
 */
function toPaise(written: string): number | null {
  const negative = written.startsWith("-");
  const digits = written.replace(/[-₹,\s]/g, "");
  const [rupees, fraction] = digits.split(".");

  if (!/^\d+$/.test(rupees)) return null;
  if (fraction !== undefined && !/^\d{2}$/.test(fraction)) return null;

  const value = Number(rupees) * 100 + Number(fraction ?? 0);
  if (!Number.isSafeInteger(value)) return null;

  return negative ? -value : value;
}

/**
 * The figures one record carries. A structural type rather than `ReviewRow`, so
 * the gate can be asserted against a handful of amounts with no batch, no
 * fixture and no matcher anywhere near the test.
 */
export type FigureSource = {
  amountPaise: number;
  feePaise: number;
  taxPaise: number;
  /** What the resolved rate cell says the fee should have been. Null when none resolved. */
  expectedFeePaise: number | null;
  expectedTaxPaise: number | null;
};

/**
 * Every rupee figure a draft about this record is allowed to state.
 *
 * This is the whole permission surface of the figure gate, and it is
 * DELIBERATELY the record's own amounts and nothing else. Batch totals — ITC at
 * risk, the invoice tax — are absent even though a draft could plausibly
 * mention one: an action is drafted about a single record, and the tools handed
 * to the agent expose exactly this set, so what the model can read and what the
 * gate will accept are the same list. Widening one without the other is how a
 * gate starts passing figures nothing produced.
 *
 * The two excesses are here because they are what a CA email exists to state —
 * "Razorpay deducted ₹28.32 where the published rate gives ₹23.60, an excess of
 * ₹4.72" needs all three — and they are derived from the record rather than
 * from the model.
 */
export function recordFigures(row: FigureSource): Map<string, number> {
  const figures = new Map<string, number>([
    ["amount", row.amountPaise],
    ["fee", row.feePaise],
    ["tax", row.taxPaise],
    // Razorpay's fee is INCLUSIVE of the GST inside it, so the expense a
    // bookkeeper posts is the fee less that tax. A ledger entry cannot be
    // written without this figure, and without it here the gate would report
    // every correct Tally voucher as having invented its own expense line.
    ["feeNet", row.feePaise - row.taxPaise],
  ]);

  // Absent rather than zero when no rate cell resolved. A zero in this map
  // would quietly authorise "₹0.00" as an expected fee, which is a figure a
  // FEE_DEDUCTION draft would then be free to state as fact.
  if (row.expectedFeePaise !== null) {
    figures.set("expectedFee", row.expectedFeePaise);
    figures.set("feeExcess", row.feePaise - row.expectedFeePaise);
    if (row.expectedTaxPaise !== null) {
      figures.set("expectedFeeNet", row.expectedFeePaise - row.expectedTaxPaise);
    }
  }

  if (row.expectedTaxPaise !== null) {
    figures.set("expectedTax", row.expectedTaxPaise);
    figures.set("taxExcess", row.taxPaise - row.expectedTaxPaise);
  }

  return figures;
}
