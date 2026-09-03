import { describe, expect, it } from "vitest";
import { recordFigures } from "@/lib/act/figures";

/**
 * A FEE_DEDUCTION record: Razorpay took ₹28.32 on a ₹1,000.00 payment where the
 * standard 2% cell gives ₹20.00 plus 18% GST — ₹23.60. The excess is the figure
 * a CA email exists to state.
 *
 * Every figure below is distinct on purpose. A fixture where the excess happens
 * to equal the tax would pass whether the excess were computed or copied.
 */
const OVERCHARGED = {
  amountPaise: 100000,
  feePaise: 2832,
  taxPaise: 432,
  expectedFeePaise: 2360,
  expectedTaxPaise: 360,
};

describe("recordFigures", () => {
  it("carries the record's own amounts", () => {
    const figures = recordFigures(OVERCHARGED);

    expect(figures.get("amount")).toBe(100000);
    expect(figures.get("fee")).toBe(2832);
    expect(figures.get("tax")).toBe(432);
    expect(figures.get("expectedFee")).toBe(2360);
    expect(figures.get("expectedTax")).toBe(360);
  });

  it("carries the excess a draft is written to state", () => {
    const figures = recordFigures(OVERCHARGED);

    expect(figures.get("feeExcess")).toBe(472);
    expect(figures.get("taxExcess")).toBe(72);
  });
});

describe("recordFigures — a record with no rate cell", () => {
  /** A zero-value retry: nothing was charged, so nothing resolved. */
  const NO_CELL = {
    amountPaise: 0,
    feePaise: 0,
    taxPaise: 0,
    expectedFeePaise: null,
    expectedTaxPaise: null,
  };

  it("omits the expected figures rather than defaulting them to zero", () => {
    const figures = recordFigures(NO_CELL);

    expect(figures.has("expectedFee")).toBe(false);
    expect(figures.has("expectedTax")).toBe(false);
    expect(figures.has("feeExcess")).toBe(false);
    expect(figures.has("taxExcess")).toBe(false);
  });

  it("still carries the amounts the record does have", () => {
    expect([...recordFigures(NO_CELL).keys()]).toEqual(["amount", "fee", "tax", "feeNet"]);
  });
});

describe("recordFigures — the fee split a ledger entry needs", () => {
  it("carries the fee net of the GST inside it", () => {
    // A Tally voucher posts the base fee to an expense ledger and the GST to an
    // input-tax ledger, so the net is a figure a correct draft must state.
    const figures = recordFigures(OVERCHARGED);

    expect(figures.get("feeNet")).toBe(2400);
    expect(figures.get("expectedFeeNet")).toBe(2000);
  });
});
