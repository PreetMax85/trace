import { describe, expect, it } from "vitest";
import { confirmable, draftForKind, parseConfirmRequest } from "@/lib/act/confirm";
import type { RecordedDraft } from "@/lib/act/library";

const DRAFT = {
  caEmail: { subject: "Razorpay fee query", body: "Razorpay deducted ₹28.32." },
  gstr3bFlag: { line: "4B2" as const, action: "REVERSE" as const, amountPaise: 432, note: "Hold it." },
  tallyEntry: {
    voucherType: "JOURNAL" as const,
    narration: "Razorpay fee excess.",
    lines: [
      { ledger: "Payment Gateway Charges", side: "DEBIT" as const, amountPaise: 2400 },
      { ledger: "Input GST", side: "DEBIT" as const, amountPaise: 432 },
      { ledger: "Razorpay Settlement", side: "CREDIT" as const, amountPaise: 2832 },
    ],
  },
};

const recorded = (over: Partial<RecordedDraft> = {}): RecordedDraft => ({
  recordId: "pay_4gaSMyqces2Qkk",
  figures: "amount:100000|fee:2832",
  draft: DRAFT,
  verdict: "ACCEPTED",
  unresolved: [],
  unbalanced: false,
  misfiled: false,
  model: "claude-opus-5",
  promptVersion: "act-v1",
  recordedAt: "2026-09-03T10:00:00.000Z",
  latencyMs: 4200,
  inputTokens: 900,
  outputTokens: 400,
  costMicroUsd: 14500,
  ...over,
});

describe("parseConfirmRequest", () => {
  it("reads a record and a kind", () => {
    expect(parseConfirmRequest({ recordId: "pay_A1", kind: "CA_EMAIL" })).toEqual({
      recordId: "pay_A1",
      kind: "CA_EMAIL",
    });
  });

  it("refuses a kind the actions table has no column value for", () => {
    expect(() => parseConfirmRequest({ recordId: "pay_A1", kind: "SEND_EMAIL" })).toThrow();
  });

  it("refuses a request with no record", () => {
    expect(() => parseConfirmRequest({ kind: "CA_EMAIL" })).toThrow();
  });

  it("refuses anything that is not an object", () => {
    expect(() => parseConfirmRequest("CA_EMAIL")).toThrow();
  });
});

describe("draftForKind", () => {
  it("stores the email when the email is what was confirmed", () => {
    expect(draftForKind(DRAFT, "CA_EMAIL")).toEqual(DRAFT.caEmail);
  });

  it("stores the flag for a GSTR-3B confirmation", () => {
    expect(draftForKind(DRAFT, "GSTR3B_FLAG")).toEqual(DRAFT.gstr3bFlag);
  });

  it("stores the voucher for a Tally confirmation", () => {
    expect(draftForKind(DRAFT, "TALLY_ENTRY")).toEqual(DRAFT.tallyEntry);
  });

  it("stores only the confirmed action, never all three", () => {
    // `actions.draft` is the record of what a person approved. Storing the
    // other two beside it would make the audit trail claim approval for
    // actions nobody clicked.
    expect(draftForKind(DRAFT, "CA_EMAIL")).not.toHaveProperty("tallyEntry");
  });
});

describe("confirmable", () => {
  it("allows a draft the gate accepted, and hands back what it checked", () => {
    // Returned rather than looked up again by the caller: a second lookup is a
    // second chance to confirm something other than what was checked.
    expect(confirmable(recorded())).toEqual({ ok: true, draft: DRAFT });
  });

  it("refuses a draft that states a figure the record does not carry", () => {
    const gated = recorded({
      verdict: "INVALID_FIGURE",
      unresolved: [{ text: "₹4,200.00", paise: 420000 }],
    });

    const verdict = confirmable(gated);

    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.reason).toContain("₹4,200.00");
  });

  it("refuses a draft whose voucher does not balance", () => {
    const gated = recorded({ verdict: "INVALID_FIGURE", unbalanced: true });

    expect(confirmable(gated).ok).toBe(false);
  });

  it("refuses when there is no draft at all", () => {
    expect(confirmable(null).ok).toBe(false);
  });

  it("refuses a draft the model never produced", () => {
    expect(confirmable(recorded({ verdict: "FAILED", draft: null })).ok).toBe(false);
  });
});
