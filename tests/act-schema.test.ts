import { describe, expect, it } from "vitest";
import { actDraftSchema } from "@/lib/act/schema";

/** A well-formed draft for one overcharged record. */
const DRAFT = {
  caEmail: {
    subject: "Razorpay fee query — settlement setl_ABC123, July 2026",
    body: "Razorpay deducted ₹28.32 on this transaction where the published 2% cell gives ₹23.60.",
  },
  gstr3bFlag: {
    line: "4B2",
    action: "REVERSE",
    amountPaise: 432,
    note: "Hold this GST out of All Other ITC until Razorpay explains the deduction.",
  },
  tallyEntry: {
    voucherType: "JOURNAL",
    narration: "Razorpay fee excess, July 2026, pending clarification.",
    lines: [
      { ledger: "Payment Gateway Charges", side: "DEBIT", amountPaise: 2400 },
      { ledger: "Input GST", side: "DEBIT", amountPaise: 432 },
      { ledger: "Razorpay Settlement", side: "CREDIT", amountPaise: 2832 },
    ],
  },
};

describe("actDraftSchema", () => {
  it("accepts a draft carrying all three actions", () => {
    expect(actDraftSchema.safeParse(DRAFT).success).toBe(true);
  });

  it("refuses a draft that tries to classify the record", () => {
    // Act drafts; it does not decide which category a record carries. That is
    // Investigate's authority (PRD §9), and strictObject makes a draft that
    // reaches for it fail to decode rather than merely be ignored.
    const classifying = { ...DRAFT, category: "FEE_DEDUCTION" };

    expect(actDraftSchema.safeParse(classifying).success).toBe(false);
  });

  it("refuses a draft that omits one of the three actions", () => {
    const { tallyEntry, ...withoutTally } = DRAFT;
    void tallyEntry;

    expect(actDraftSchema.safeParse(withoutTally).success).toBe(false);
  });
});
