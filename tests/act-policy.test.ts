import { describe, expect, it } from "vitest";
import { applyActGate, unauthorisedActTools } from "@/lib/act/policy";

/**
 * The record every draft below is checked against: ₹28.32 taken on a ₹1,000.00
 * payment where the standard cell gives ₹23.60. The GST inside the fee is
 * ₹4.32, the expected GST ₹3.60, so the excesses are ₹4.72 and ₹0.72.
 */
const RECORD = {
  amountPaise: 100000,
  feePaise: 2832,
  taxPaise: 432,
  expectedFeePaise: 2360,
  expectedTaxPaise: 360,
  category: "FEE_DEDUCTION" as const,
};

const draft = (overrides: Record<string, unknown> = {}) => ({
  caEmail: {
    subject: "Razorpay fee query — July 2026",
    body: "Razorpay deducted ₹28.32 where the published 2% cell gives ₹23.60, an excess of ₹4.72.",
  },
  gstr3bFlag: {
    line: "4B2",
    action: "REVERSE",
    amountPaise: 432,
    note: "Hold ₹4.32 out of All Other ITC until this deduction is explained.",
  },
  tallyEntry: {
    voucherType: "JOURNAL",
    narration: "Razorpay fee excess, July 2026.",
    lines: [
      { ledger: "Payment Gateway Charges", side: "DEBIT", amountPaise: 2400 },
      { ledger: "Input GST", side: "DEBIT", amountPaise: 432 },
      { ledger: "Razorpay Settlement", side: "CREDIT", amountPaise: 2832 },
    ],
  },
  ...overrides,
});

describe("applyActGate", () => {
  it("accepts a draft whose every figure the record carries", () => {
    const gated = applyActGate(draft(), RECORD);

    expect(gated.verdict).toBe("ACCEPTED");
    expect(gated.unresolved).toEqual([]);
    expect(gated.unbalanced).toBe(false);
    expect(gated.draft).not.toBeNull();
  });

  it("reports which record figure each stated amount resolved to", () => {
    const gated = applyActGate(draft(), RECORD);

    expect(gated.resolved.map((figure) => figure.label)).toEqual([
      "fee",
      "expectedFee",
      "feeExcess",
      "tax",
      "feeNet",
    ]);
  });
});

describe("applyActGate — a figure the record does not carry", () => {
  it("refuses a draft that states an amount out of nowhere, and keeps it visible", () => {
    const invented = draft({
      caEmail: {
        subject: "Razorpay fee query — July 2026",
        body: "Razorpay owes you ₹4,200.00 on this transaction.",
      },
    });

    const gated = applyActGate(invented, RECORD);

    expect(gated.verdict).toBe("INVALID_FIGURE");
    expect(gated.unresolved).toEqual([{ text: "₹4,200.00", paise: 420000 }]);
    // The draft is kept. A person needs to see what was written and why it is
    // not confirmable; withholding it leaves them nothing to check.
    expect(gated.draft).not.toBeNull();
  });

  it("checks the structured amounts too, not only the prose", () => {
    const gated = applyActGate(draft({
      gstr3bFlag: { line: "4B2", action: "REVERSE", amountPaise: 999, note: "Hold this." },
    }), RECORD);

    expect(gated.verdict).toBe("INVALID_FIGURE");
    expect(gated.unresolved).toEqual([{ text: "₹9.99", paise: 999 }]);
  });
});

describe("applyActGate — a voucher that does not balance", () => {
  it("refuses a Tally entry whose debits and credits disagree", () => {
    const gated = applyActGate(draft({
      tallyEntry: {
        voucherType: "JOURNAL",
        narration: "Razorpay fee excess, July 2026.",
        lines: [
          { ledger: "Payment Gateway Charges", side: "DEBIT", amountPaise: 2400 },
          { ledger: "Razorpay Settlement", side: "CREDIT", amountPaise: 2832 },
        ],
      },
    }), RECORD);

    expect(gated.unbalanced).toBe(true);
    expect(gated.verdict).toBe("INVALID_FIGURE");
  });
});

describe("applyActGate — nothing usable came back", () => {
  it("reports a draft that does not decode as FAILED, not as a bad figure", () => {
    const gated = applyActGate({ caEmail: "just a string" }, RECORD);

    expect(gated.verdict).toBe("FAILED");
    expect(gated.draft).toBeNull();
  });

  it("does the same for nothing at all", () => {
    expect(applyActGate(undefined, RECORD).verdict).toBe("FAILED");
  });
});

describe("unauthorisedActTools", () => {
  it("refuses every tool, because Act holds none", () => {
    expect(unauthorisedActTools(["sendEmail"])).toEqual(["sendEmail"]);
    expect(unauthorisedActTools(["getRecord"])).toEqual(["getRecord"]);
  });

  it("is satisfied by an empty tool set", () => {
    expect(unauthorisedActTools([])).toEqual([]);
  });
});

describe("applyActGate — a voucher whose debits exceed its credits", () => {
  it("refuses it, not only the case where credits exceed debits", () => {
    // Both directions are unbalanced. A check that only caught one would pass a
    // voucher that posts more to the expense side than it takes off the bank.
    const gated = applyActGate(draft({
      tallyEntry: {
        voucherType: "JOURNAL",
        narration: "Razorpay fee excess, July 2026.",
        lines: [
          { ledger: "Payment Gateway Charges", side: "DEBIT", amountPaise: 2832 },
          { ledger: "Input GST", side: "DEBIT", amountPaise: 432 },
          { ledger: "Razorpay Settlement", side: "CREDIT", amountPaise: 2832 },
        ],
      },
    }), RECORD);

    expect(gated.unbalanced).toBe(true);
    expect(gated.verdict).toBe("INVALID_FIGURE");
  });
});
