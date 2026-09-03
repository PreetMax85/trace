import { describe, expect, it } from "vitest";
import { bindFigures, recordFigures } from "@/lib/act/figures";
import { ACT_SYSTEM_PROMPT, recordPrompt } from "@/lib/act/prompt";

const RECORD = {
  recordId: "pay_4gaSMyqces2Qkk",
  settlementId: "setl_JvhLpq3rzWQ1nT",
  orderId: "order_GQiwcS8koSo6mm",
  amountPaise: 100000,
  feePaise: 2832,
  taxPaise: 432,
  expectedFeePaise: 2360,
  expectedTaxPaise: 360,
  status: "EXCEPTION" as const,
  category: "FEE_DEDUCTION" as const,
  rateCell: null,
  billedIn: "072026",
  settledAt: 1782000000,
  creditNoteReview: false,
};

const CONTEXT = {
  period: "072026",
  merchantGstin: "27TESTM1234A1Z0",
  supplierGstin: "27AAGCR4375J1ZY",
  invoiceNumber: "RZP/TAX/2026-07/0041882",
};

describe("recordPrompt", () => {
  it("puts the record's identifiers in front of the model", () => {
    const prompt = recordPrompt(RECORD, CONTEXT);

    expect(prompt).toContain("pay_4gaSMyqces2Qkk");
    expect(prompt).toContain("setl_JvhLpq3rzWQ1nT");
    expect(prompt).toContain("RZP/TAX/2026-07/0041882");
    expect(prompt).toContain("FEE_DEDUCTION");
  });

  it("states every figure in rupees, as the draft must", () => {
    const prompt = recordPrompt(RECORD, CONTEXT);

    expect(prompt).toContain("fee: ₹28.32");
    expect(prompt).toContain("expectedFee: ₹23.60");
    expect(prompt).toContain("feeExcess: ₹4.72");
    expect(prompt).toContain("feeNet: ₹24.00");
  });
});

describe("recordPrompt — the prompt and the gate cannot drift", () => {
  it("shows the model no figure its own gate would reject", () => {
    // The property that makes the figure gate workable rather than hostile: the
    // prompt is rendered from the same `recordFigures` the gate allows from, so
    // a model that copies a figure straight out of its instructions can never
    // be told it invented one. If this fails, one of the two has been widened
    // without the other.
    const prompt = recordPrompt(RECORD, CONTEXT);

    expect(bindFigures(prompt, recordFigures(RECORD)).unresolved).toEqual([]);
  });

  it("holds for a record with no resolved rate cell", () => {
    const noCell = { ...RECORD, expectedFeePaise: null, expectedTaxPaise: null };

    expect(bindFigures(recordPrompt(noCell, CONTEXT), recordFigures(noCell)).unresolved).toEqual([]);
  });
});

describe("ACT_SYSTEM_PROMPT", () => {
  it("tells the model it drafts and does not send", () => {
    expect(ACT_SYSTEM_PROMPT).toContain("You do not send the email");
  });

  it("is free of anything that would break the prompt cache between calls", () => {
    // A prefix that varied per call would miss Anthropic's cache every time.
    expect(ACT_SYSTEM_PROMPT).toBe(ACT_SYSTEM_PROMPT);
    expect(ACT_SYSTEM_PROMPT).not.toMatch(/pay_|setl_|order_/);
  });
});
