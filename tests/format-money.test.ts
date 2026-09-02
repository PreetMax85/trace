import { describe, expect, it } from "vitest";
import { formatPaise, formatRupees } from "@/lib/format/money";

/**
 * The only float-to-rupee boundary in the product. Every figure the screen
 * shows a merchant passes through here, so these assertions are the guarantee
 * that the pixels and the audit trail carry the same number.
 */

describe("formatPaise", () => {
  it("renders the locked figures exactly as docs/HANDOFF.md states them", () => {
    // If any of these move, the formatter is wrong — not the number.
    expect(formatPaise(119692)).toBe("1,196.92"); // July invoice tax
    expect(formatPaise(664945)).toBe("6,649.45"); // July invoice taxable value
    expect(formatPaise(98223)).toBe("982.23"); // ITC claimable
    expect(formatPaise(21469)).toBe("214.69"); // ITC at risk
    expect(formatPaise(85587)).toBe("855.87"); // rollup of matched records
    expect(formatPaise(34105)).toBe("341.05"); // rollup delta
    expect(formatPaise(19530)).toBe("195.30"); // August invoice tax
  });

  it("renders zero as a full rupee figure, not an empty one", () => {
    expect(formatPaise(0)).toBe("0.00");
    expect(formatRupees(0)).toBe("₹0.00");
  });

  it("renders a negative delta with the sign ahead of the currency", () => {
    expect(formatPaise(-34105)).toBe("-341.05");
    expect(formatRupees(-34105)).toBe("-₹341.05");
    expect(formatRupees(-1)).toBe("-₹0.01");
  });

  it("reads negative zero as nothing owed, not as a shortfall", () => {
    // A delta computed as `a - b` where the two agree can arrive as -0.
    expect(formatPaise(-0)).toBe("0.00");
    expect(formatRupees(-0)).toBe("₹0.00");
    expect(formatPaise(0 - 0)).toBe("0.00");
  });

  it("keeps both paise digits, so 5 paise is not 50", () => {
    expect(formatPaise(5)).toBe("0.05");
    expect(formatPaise(50)).toBe("0.50");
    expect(formatPaise(99)).toBe("0.99");
    expect(formatPaise(100)).toBe("1.00");
    expect(formatPaise(101)).toBe("1.01");
    expect(formatPaise(110)).toBe("1.10");
  });

  it("groups digits the Indian way — three, then twos", () => {
    // Below a lakh the Indian and Western conventions agree, which is why the
    // 54-record fixture could never catch this on its own.
    expect(formatPaise(99999)).toBe("999.99");
    expect(formatPaise(100000)).toBe("1,000.00");
    expect(formatPaise(1000000)).toBe("10,000.00");
    expect(formatPaise(9999999)).toBe("99,999.99");
    expect(formatPaise(10000000)).toBe("1,00,000.00"); // one lakh — twos start here
    expect(formatPaise(123456789)).toBe("12,34,567.89");
    expect(formatPaise(1234567890)).toBe("1,23,45,678.90"); // one crore
    expect(formatRupees(-123456789)).toBe("-₹12,34,567.89");
  });

  it("refuses a value that floating point has already damaged", () => {
    // 8.29 * 100 is 828.9999999999999. A formatter that accepted it would
    // print "8.28" and a remainder of 28.999999999999943 — confident and
    // wrong, which is the failure mode this whole module exists to prevent.
    expect(8.29 * 100).not.toBe(829);
    expect(() => formatPaise(8.29 * 100)).toThrow(/exact integer count of paise/);
    expect(() => formatPaise(0.1 + 0.2)).toThrow(/exact integer count of paise/);
    expect(() => formatPaise(1196.925)).toThrow(/exact integer count of paise/);
  });

  it("refuses values where the integer arithmetic would stop being exact", () => {
    expect(() => formatPaise(Number.MAX_SAFE_INTEGER + 2)).toThrow(/safe integer range/);
    expect(() => formatPaise(Number.NaN)).toThrow(/exact integer count of paise/);
    expect(() => formatPaise(Number.POSITIVE_INFINITY)).toThrow(/exact integer count of paise/);
    expect(() => formatPaise(Number.NEGATIVE_INFINITY)).toThrow(/exact integer count of paise/);
    // The largest figure it will accept is still formatted exactly.
    expect(formatPaise(Number.MAX_SAFE_INTEGER)).toBe("9,00,71,99,25,47,409.91");
  });

  it("names the offending value, so a bad figure is traceable", () => {
    expect(() => formatPaise(1.5)).toThrow(/received 1\.5/);
  });

  it("round-trips: the digits it prints are the paise it was given", () => {
    // A property rather than a case: strip the separators, and what is left
    // must be the input. This kills any mutation that drops, doubles or
    // misplaces a digit while still producing a plausible-looking figure.
    for (const paise of [0, 1, 7, 99, 100, 4675, 21469, 98223, 119692, 123456789, 9007199254740991]) {
      const digits = formatPaise(paise).replace(/[,.]/g, "");
      expect(Number(digits)).toBe(paise);
    }
  });
});

describe("formatRupees", () => {
  it("prefixes the rupee sign", () => {
    expect(formatRupees(119692)).toBe("₹1,196.92");
    expect(formatRupees(98223)).toBe("₹982.23");
    expect(formatRupees(21469)).toBe("₹214.69");
  });

  it("uses U+20B9 and not a plain Rs", () => {
    expect(formatRupees(100).codePointAt(0)).toBe(0x20b9);
  });
});
