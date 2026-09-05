import { describe, expect, it } from "vitest";
import { narrateToolCall } from "@/lib/review/trace-summary";
import type { InvestigationToolCall } from "@/lib/review/trace";

const priced = (over: Partial<{ tiedCells: string[]; note: string | null }> = {}) =>
  ({
    toolName: "priceAtPublishedRates",
    input: { amountPaise: 149900, feePaise: 3538 },
    output: {
      cells: [
        { cell: "STANDARD", ratePercent: 2, tiesWithinTolerance: true },
        { cell: "CORPORATE", ratePercent: 2.15, tiesWithinTolerance: false },
      ],
      tiedCells: ["STANDARD"],
      note: null,
      ...over,
    },
  }) satisfies InvestigationToolCall;

describe("narrateToolCall", () => {
  it("says which published rate explained the fee, by its percentage", () => {
    const { asked, found } = narrateToolCall(priced());
    expect(asked).toContain("₹1,499.00");
    expect(found).toBe("The 2.00% standard rate explains it, within one rupee.");
  });

  it("names both rates when a fee is genuinely ambiguous", () => {
    // Two cells 0.15 percentage points apart price within one rupee of each
    // other on small payments, so a fee really can satisfy both. Reporting one
    // would make the sentence depend on key order. BUILD-LOG entry 10.
    const { found } = narrateToolCall(priced({ tiedCells: ["STANDARD", "CORPORATE"] }));
    expect(found).toContain("2.00% standard");
    expect(found).toContain("2.15% corporate");
    expect(found).toContain("ambiguous");
  });

  it("says plainly when no rate explains the fee, and names the fee", () => {
    const { found } = narrateToolCall(priced({ tiedCells: [] }));
    expect(found).toBe("No published rate explains the ₹35.38 charged.");
  });

  it("passes the tool's own note through when nothing was captured", () => {
    // 2% and 2.15% of zero are both zero, so without the tool's guard every
    // cell "explains" a fee on a failed retry. The narration must not paper
    // over that with "two rates explain it". BUILD-LOG entry 9.
    const note = "Nothing was captured, so no fee is expected and no rate cell can explain one.";
    const { found } = narrateToolCall(
      priced({ tiedCells: ["STANDARD", "CORPORATE"], note }),
    );
    expect(found).toBe(note);
  });

  it("counts refunds and gives their amounts", () => {
    const { asked, found } = narrateToolCall({
      toolName: "findRefundsForPayment",
      input: { paymentId: "pay_OmWyu0UGKY8O4o" },
      output: { refunds: [{ amountPaise: 890000, settledOn: "2026-07-13" }], count: 1 },
    });
    expect(asked).toContain("pay_OmWyu0UGKY8O4o");
    expect(found).toBe("One refund: ₹8,900.00 on 2026-07-13.");
  });

  it("says nothing reversed a payment rather than showing an empty list", () => {
    const { found } = narrateToolCall({
      toolName: "findRefundsForPayment",
      input: { paymentId: "pay_x" },
      output: { refunds: [], count: 0 },
    });
    expect(found).toBe("Nothing reversed this payment.");
  });

  it("reports order siblings and how many captured nothing", () => {
    const { found } = narrateToolCall({
      toolName: "findOrderSiblings",
      input: { orderId: "order_abc" },
      output: { count: 2, zeroValueCount: 1 },
    });
    expect(found).toBe("2 rows share that order, and one of them captured nothing.");
  });

  it("treats a lone row as no siblings at all", () => {
    // The tool includes the row asked about, so a count of 1 means it found
    // nothing. Rendering "1 rows share that order" would read as a sibling.
    const { found } = narrateToolCall({
      toolName: "findOrderSiblings",
      input: { orderId: "order_abc" },
      output: { count: 1, zeroValueCount: 0 },
    });
    expect(found).toBe("That order has this row and no other.");
  });

  it("names the filing period in words, and the date in IST", () => {
    const { asked, found } = narrateToolCall({
      toolName: "resolveFilingPeriod",
      input: { settledAtUnixSeconds: 1785522600 },
      output: { period: "082026" },
    });
    expect(asked).toContain("01 Aug 2026");
    expect(found).toBe("August 2026.");
  });

  it("falls back to the recorded payload when a trace has fallen behind the tool", () => {
    // A committed trace file can lag the tools it was generated from. A parse
    // failure has to show the payload as recorded, not a fluent sentence built
    // out of undefined fields, because only the ugly one tells a reader the
    // file needs regenerating.
    const { asked, found } = narrateToolCall({
      toolName: "findOrderSiblings",
      input: { orderId: "order_abc" },
      output: { somethingElse: true },
    });
    expect(asked).toContain("findOrderSiblings");
    expect(found).toContain("somethingElse");
  });
});
