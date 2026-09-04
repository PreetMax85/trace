import { describe, expect, it } from "vitest";
import { applyActGate } from "@/lib/act/policy";
import { GSTR3B_LINES } from "@/lib/act/schema";
import { confirmable } from "@/lib/act/confirm";
import type { RecordedDraft } from "@/lib/act/library";
import type { ExceptionCategory } from "@/lib/matching/types";

/**
 * The same record the rest of the gate's tests use: ₹28.32 taken on a ₹1,000.00
 * payment where the standard cell gives ₹23.60, so the GST inside the fee is
 * ₹4.32 and the excess GST is ₹0.72.
 */
const RECORD = {
  amountPaise: 100000,
  feePaise: 2832,
  taxPaise: 432,
  expectedFeePaise: 2360,
  expectedTaxPaise: 360,
  category: "FEE_DEDUCTION" as const,
};

const draft = (flag: Record<string, unknown>) => ({
  caEmail: {
    subject: "Razorpay fee query — July 2026",
    body: "Razorpay deducted ₹28.32 where the published 2% cell gives ₹23.60.",
  },
  gstr3bFlag: { amountPaise: 432, note: "The GST inside the unexplained excess.", ...flag },
  tallyEntry: {
    voucherType: "JOURNAL",
    narration: "Razorpay fee excess, July 2026.",
    lines: [
      { ledger: "Payment Gateway Charges", side: "DEBIT", amountPaise: 2400 },
      { ledger: "Input GST", side: "DEBIT", amountPaise: 432 },
      { ledger: "Razorpay Settlement", side: "CREDIT", amountPaise: 2832 },
    ],
  },
});

describe("the rows a flag may point at", () => {
  it("refuses a flag on 4A5, the row the portal fills from GSTR-2B", () => {
    // 4A5 "All other ITC" has been auto-populated from GSTR-2B since the
    // October 2025 tax period, and the lawful way to give credit back is a
    // reversal in 4(B) — never typing a smaller number over the claim. A draft
    // that asks a merchant to edit 4A5 is asking for something the form does
    // not offer, so it must not decode at all.
    const gated = applyActGate(draft({ line: "4A5", action: "REVERSE" }), RECORD);

    expect(gated.verdict).toBe("FAILED");
    expect(gated.draft).toBeNull();
  });

  it("refuses the pre-locking action words", () => {
    const gated = applyActGate(draft({ line: "4B2", action: "EXCLUDE" }), RECORD);

    expect(gated.verdict).toBe("FAILED");
  });

  it("accepts a reversal on the reclaimable reversal row", () => {
    const gated = applyActGate(draft({ line: "4B2", action: "REVERSE" }), RECORD);

    expect(gated.verdict).toBe("ACCEPTED");
    expect(gated.misfiled).toBe(false);
  });

  it("accepts no entry at all, which is what a timing difference needs", () => {
    // A credit that lands on the FOLLOWING period's GSTR-2B is not claimable
    // this month and is not a reversal either. There is genuinely no row for
    // it, and saying so is the honest draft.
    const gated = applyActGate(draft({ line: null, action: "NO_ENTRY" }), {
      ...RECORD,
      category: "TIMING" as const,
    });

    expect(gated.verdict).toBe("ACCEPTED");
    expect(gated.misfiled).toBe(false);
  });
});

/**
 * The action each row admits, written out here rather than read from
 * `GSTR3B_ROW_ACTION`. A test that imported the map would assert the map equals
 * itself and pass however the map was edited; this is a second, independent
 * statement of the same fact, so the two have to be changed in agreement.
 */
const ROW_ADMITS: Record<string, string> = {
  "4B1": "REVERSE",
  "4B2": "REVERSE",
  "4D1": "RECLAIM",
  "4D2": "REPORT_ONLY",
};

describe("every row a draft may name", () => {
  it("is covered below, so a new row cannot be added without a decision", () => {
    expect(Object.keys(ROW_ADMITS).sort()).toEqual([...GSTR3B_LINES].sort());
  });

  it.each(Object.entries(ROW_ADMITS))("accepts %s with %s", (line, action) => {
    expect(applyActGate(draft({ line, action }), RECORD).misfiled).toBe(false);
  });

  it.each(Object.entries(ROW_ADMITS))("refuses %s with any action but %s", (line, action) => {
    const wrong = ["REVERSE", "RECLAIM", "REPORT_ONLY", "NO_ENTRY"].filter((a) => a !== action);

    for (const other of wrong) {
      expect(applyActGate(draft({ line, action: other }), RECORD).misfiled).toBe(true);
    }
  });
});

describe("the row and the action have to agree", () => {
  // The action is recoverable from the row, and that redundancy is the point:
  // the two halves are checked against each other exactly as a voucher's
  // debits are checked against its credits. A draft that disagrees with itself
  // did not understand the row it chose.

  it("catches a reversal filed on the ineligible-credit row", () => {
    const gated = applyActGate(draft({ line: "4D2", action: "REVERSE" }), RECORD);

    expect(gated.misfiled).toBe(true);
    expect(gated.verdict).toBe("INVALID_FIGURE");
  });

  it("catches a reclaim filed on a reversal row", () => {
    const gated = applyActGate(draft({ line: "4B1", action: "RECLAIM" }), RECORD);

    expect(gated.misfiled).toBe(true);
  });

  it("catches a draft that names a row and then says there is no entry", () => {
    const gated = applyActGate(draft({ line: "4B2", action: "NO_ENTRY" }), RECORD);

    expect(gated.misfiled).toBe(true);
  });

  it("catches a draft that asks for a reversal with no row to put it on", () => {
    const gated = applyActGate(draft({ line: null, action: "REVERSE" }), RECORD);

    expect(gated.misfiled).toBe(true);
  });

  it("keeps the draft so a person can still read what was written", () => {
    const gated = applyActGate(draft({ line: "4D2", action: "REVERSE" }), RECORD);

    expect(gated.draft).not.toBeNull();
  });
});

describe("a misfiled flag cannot be confirmed", () => {
  const recorded = (over: Partial<RecordedDraft>): RecordedDraft =>
    ({
      recordId: "pay_4gaSMyqces2Qkk",
      figures: "amount:100000|fee:2832",
      draft: applyActGate(draft({ line: "4B2", action: "REVERSE" }), RECORD).draft,
      verdict: "ACCEPTED",
      unresolved: [],
      unbalanced: false,
      misfiled: false,
      misrouted: false,
      model: "claude-opus-5",
      promptVersion: "act-v2",
      recordedAt: "2026-09-03T10:00:00.000Z",
      latencyMs: 4200,
      inputTokens: 900,
      outputTokens: 400,
      costMicroUsd: 14500,
      ...over,
    }) as RecordedDraft;

  it("refuses one whose row and action disagree", () => {
    const verdict = confirmable(recorded({ verdict: "INVALID_FIGURE", misfiled: true }));

    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.reason).toMatch(/row/i);
  });

  it("refuses one whose row is wrong for what the record is", () => {
    // `misfiled` is held FALSE deliberately. Both refusals mention a row, so a
    // fixture with both flags set would pass whichever branch fired, and the
    // test would not be aimed at the one it names. The assertion is on the
    // clause only the routing refusal carries. BUILD-LOG 27 is why.
    const verdict = confirmable(
      recorded({ verdict: "INVALID_FIGURE", misfiled: false, misrouted: true }),
    );

    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.reason).toMatch(/kind of exception/i);
  });

  it("allows one that agrees", () => {
    expect(confirmable(recorded({})).ok).toBe(true);
  });
});

/**
 * Which Table 4 row each exception category belongs on, stated here
 * independently of the map the code reads — the same discipline `ROW_ADMITS`
 * uses above. A test that imported the map would assert the map equals itself.
 *
 * The source is CBIC Circular 170/02/2022-GST, 6 July 2022. Para 4.3(C) puts a
 * reversal that can be reclaimed later — including one for a supply the
 * registered person cannot establish was received — in 4(B)(2), and the
 * circular's own Annexure works exactly that case (Note 3). A `TIMING` credit
 * lands on the FOLLOWING period's GSTR-2B, so nothing belongs on this return.
 * A `REFUND_NETTED` record's Section 34 credit note is the merchant's own
 * OUTWARD document and touches Table 3, not Table 4. `PARTIAL_PAYMENT` rows
 * carry no tax at all.
 */
const CATEGORY_ROW: Record<string, string | null> = {
  FEE_DEDUCTION: "4B2",
  UNEXPLAINED: "4B2",
  REFUND_NETTED: null,
  TIMING: null,
  PARTIAL_PAYMENT: null,
};

describe("the flag has to match what the record actually is", () => {
  const forCategory = (category: string) => ({
    ...RECORD,
    category: category as ExceptionCategory,
  });

  it("refuses no entry on a fee deduction, whose credit is already claimed", () => {
    // The whole of Razorpay's invoice tax auto-populates into 4A5. A fee the
    // merchant cannot substantiate is therefore ALREADY claimed, and "no entry
    // is due" leaves it claimed. Circular 170 para 4.4: give it back in 4(B).
    const gated = applyActGate(
      draft({ line: null, action: "NO_ENTRY" }),
      forCategory("FEE_DEDUCTION"),
    );

    expect(gated.misrouted).toBe(true);
    expect(gated.verdict).toBe("INVALID_FIGURE");
  });

  it("refuses a reversal on a timing difference, which is money still owed", () => {
    const gated = applyActGate(
      draft({ line: "4B2", action: "REVERSE" }),
      forCategory("TIMING"),
    );

    expect(gated.misrouted).toBe(true);
  });

  it("keeps the draft so a person can read what was written", () => {
    const gated = applyActGate(
      draft({ line: null, action: "NO_ENTRY" }),
      forCategory("FEE_DEDUCTION"),
    );

    expect(gated.draft).not.toBeNull();
  });

  it.each(Object.entries(CATEGORY_ROW))("routes %s to %s", (category, line) => {
    const action = line === null ? "NO_ENTRY" : "REVERSE";
    const gated = applyActGate(draft({ line, action }), forCategory(category));

    expect(gated.misrouted).toBe(false);
    expect(gated.verdict).toBe("ACCEPTED");
  });

  it.each(Object.entries(CATEGORY_ROW))("refuses %s on any row but %s", (category, line) => {
    const others = [...GSTR3B_LINES, null].filter((other) => other !== line);

    for (const other of others) {
      const action = other === null ? "NO_ENTRY" : ROW_ADMITS[other];
      expect(applyActGate(draft({ line: other, action }), forCategory(category)).misrouted).toBe(
        true,
      );
    }
  });
});
