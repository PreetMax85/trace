import { describe, expect, it } from "vitest";
import { draftFor, figureFingerprint, parseDrafts } from "@/lib/act/library";

const RECORD = {
  amountPaise: 100000,
  feePaise: 2832,
  taxPaise: 432,
  expectedFeePaise: 2360,
  expectedTaxPaise: 360,
};

const recorded = (over: Record<string, unknown> = {}) => ({
  recordId: "pay_4gaSMyqces2Qkk",
  figures: figureFingerprint(RECORD),
  draft: {
    caEmail: { subject: "Razorpay fee query", body: "Razorpay deducted ₹28.32." },
    gstr3bFlag: { line: "4B2", action: "REVERSE", amountPaise: 432, note: "Hold it." },
    tallyEntry: {
      voucherType: "JOURNAL",
      narration: "Razorpay fee excess.",
      lines: [
        { ledger: "Payment Gateway Charges", side: "DEBIT", amountPaise: 2400 },
        { ledger: "Input GST", side: "DEBIT", amountPaise: 432 },
        { ledger: "Razorpay Settlement", side: "CREDIT", amountPaise: 2832 },
      ],
    },
  },
  verdict: "ACCEPTED",
  unresolved: [],
  unbalanced: false,
  misfiled: false,
  misrouted: false,
  model: "claude-opus-5",
  promptVersion: "act-v1",
  recordedAt: "2026-09-03T10:00:00.000Z",
  latencyMs: 4200,
  inputTokens: 900,
  outputTokens: 400,
  costMicroUsd: 14500,
  ...over,
});

describe("figureFingerprint", () => {
  it("is the same for the same figures", () => {
    expect(figureFingerprint(RECORD)).toBe(figureFingerprint({ ...RECORD }));
  });

  it("changes when any figure on the record changes", () => {
    const movedFee = { ...RECORD, feePaise: 2900 };

    expect(figureFingerprint(movedFee)).not.toBe(figureFingerprint(RECORD));
  });

  it("changes when a rate cell stops resolving", () => {
    const noCell = { ...RECORD, expectedFeePaise: null, expectedTaxPaise: null };

    expect(figureFingerprint(noCell)).not.toBe(figureFingerprint(RECORD));
  });
});

describe("parseDrafts", () => {
  it("reads a recorded draft into a lookup by record", () => {
    const byRecord = parseDrafts([recorded()]);

    expect(byRecord.get("pay_4gaSMyqces2Qkk")?.verdict).toBe("ACCEPTED");
  });

  it("treats an empty file as no drafts rather than as an error", () => {
    expect(parseDrafts([]).size).toBe(0);
  });

  it("refuses a malformed file rather than rendering blanks under a real record", () => {
    expect(() => parseDrafts([{ recordId: "pay_X" }])).toThrow(/malformed/);
  });

  it("refuses the same record twice", () => {
    expect(() => parseDrafts([recorded(), recorded()])).toThrow(/twice/);
  });
});

describe("draftFor", () => {
  it("returns the draft recorded for this record", () => {
    const found = draftFor("pay_4gaSMyqces2Qkk", RECORD, parseDrafts([recorded()]));

    expect(found?.draft?.caEmail.subject).toBe("Razorpay fee query");
  });

  it("returns nothing when no draft has been recorded", () => {
    expect(draftFor("pay_NotRecorded", RECORD, parseDrafts([recorded()]))).toBeNull();
  });

  it("drops a draft whose record has moved underneath it", () => {
    // The whole reason the fingerprint is stored. A draft that states ₹28.32
    // sitting under a record that now says ₹29.00 is worse than no draft: a
    // person would confirm a figure the audit trail disagrees with.
    const movedFee = { ...RECORD, feePaise: 2900 };

    expect(draftFor("pay_4gaSMyqces2Qkk", movedFee, parseDrafts([recorded()]))).toBeNull();
  });
});
