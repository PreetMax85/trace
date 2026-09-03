import { describe, expect, it } from "vitest";
import { bindFigures } from "@/lib/act/figures";

/**
 * The figures one record carries, by the name the gate reports them under.
 * These are real values from the July fixture: a fee of ₹23.60 containing
 * ₹3.60 of GST on a ₹1,000.00 payment.
 */
const ALLOWED = new Map([
  ["amount", 100000],
  ["fee", 2360],
  ["tax", 360],
]);

describe("bindFigures", () => {
  it("resolves a rupee figure the record really carries", () => {
    const bound = bindFigures("Razorpay deducted ₹23.60 from this settlement.", ALLOWED);

    expect(bound.resolved).toEqual([{ text: "₹23.60", paise: 2360, label: "fee" }]);
    expect(bound.unresolved).toEqual([]);
  });
});

describe("bindFigures — a figure the record does not carry", () => {
  it("reports an amount that resolves to nothing on the record", () => {
    const bound = bindFigures("You are owed ₹4,200.00 back.", ALLOWED);

    expect(bound.resolved).toEqual([]);
    expect(bound.unresolved).toEqual([{ text: "₹4,200.00", paise: 420000 }]);
  });

  it("reads Indian digit grouping, so a lakh figure is not silently truncated", () => {
    const bound = bindFigures("The invoice totals ₹12,34,567.89.", ALLOWED);

    expect(bound.unresolved).toEqual([{ text: "₹12,34,567.89", paise: 123456789 }]);
  });
});

describe("bindFigures — money-shaped text that is not a rupee amount", () => {
  it("refuses to invent paise for a figure with the wrong number of decimals", () => {
    const bound = bindFigures("The excess is ₹1.234 on that line.", ALLOWED);

    expect(bound.resolved).toEqual([]);
    expect(bound.unresolved).toEqual([{ text: "₹1.234", paise: null }]);
  });

  it("does the same for a single decimal digit, which is not paise either", () => {
    // ₹23.6 must NOT read as the record's ₹23.60. A draft that writes a fee
    // one way and the audit trail another is exactly what this gate exists for.
    const bound = bindFigures("Razorpay deducted ₹23.6.", ALLOWED);

    expect(bound.resolved).toEqual([]);
    expect(bound.unresolved).toEqual([{ text: "₹23.6", paise: null }]);
  });
});

describe("bindFigures — what is not a figure", () => {
  it("leaves a rate percentage alone", () => {
    // The rate card is 2% standard and 2.15% corporate, and both belong in a
    // draft. Reading either as money would put a fabrication warning on a
    // correct sentence.
    const bound = bindFigures("Priced at 2.15%, not the 2% standard cell.", ALLOWED);

    expect(bound.resolved).toEqual([]);
    expect(bound.unresolved).toEqual([]);
  });

  it("does not treat a bare number as money", () => {
    const bound = bindFigures("Settled on 12 July 2026 against invoice 2360.", ALLOWED);

    expect(bound.unresolved).toEqual([]);
  });
});

describe("bindFigures — the same figure written twice", () => {
  it("reports each distinct figure once", () => {
    const bound = bindFigures("₹23.60 was deducted, of which ₹23.60 is disputed.", ALLOWED);

    expect(bound.resolved).toEqual([{ text: "₹23.60", paise: 2360, label: "fee" }]);
  });

  it("reports a repeated fabrication once", () => {
    const bound = bindFigures("Claim ₹4,200.00 — yes, ₹4,200.00.", ALLOWED);

    expect(bound.unresolved).toEqual([{ text: "₹4,200.00", paise: 420000 }]);
  });
});

describe("bindFigures — a figure too large to be exact", () => {
  it("refuses an amount past the safe integer range rather than reporting a garbage one", () => {
    // Beyond 2^53 the integer arithmetic in `toPaise` stops being exact, which
    // is the same limit `formatPaise` refuses at. A silently wrong number here
    // would be reported to a person as a figure the model wrote.
    const bound = bindFigures("Razorpay owes ₹9,99,99,99,99,99,99,999.99.", ALLOWED);

    expect(bound.unresolved).toEqual([
      { text: "₹9,99,99,99,99,99,99,999.99", paise: null },
    ]);
  });
});
