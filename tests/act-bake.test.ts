import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { bakeDrafts, isCompleteDraftBake } from "@/lib/act/bake";
import { figureFingerprint } from "@/lib/act/library";
import type { ActRecord } from "@/lib/act/prompt";

const CONTEXT = {
  period: "072026",
  merchantGstin: "27TESTM1234A1Z0",
  supplierGstin: "27AAGCR4375J1ZY",
  invoiceNumber: "RZP/TAX/2026-07/0041882",
};

const record = (recordId: string, over: Partial<ActRecord> = {}): ActRecord => ({
  recordId,
  settlementId: "setl_JvhLpq3rzWQ1nT",
  orderId: "order_GQiwcS8koSo6mm",
  amountPaise: 100000,
  feePaise: 2832,
  taxPaise: 432,
  expectedFeePaise: 2360,
  expectedTaxPaise: 360,
  status: "EXCEPTION",
  category: "FEE_DEDUCTION",
  rateCell: null,
  billedIn: "072026",
  settledAt: 1782000000,
  creditNoteReview: false,
  ...over,
});

const DRAFT = {
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
};

const model = (text: string) =>
  new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text" as const, text }],
      finishReason: { unified: "stop" as const, raw: undefined },
      usage: {
        inputTokens: { total: 900, noCache: 900, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 400, text: 400, reasoning: undefined },
      },
      warnings: [],
    }),
  });

const bake = (records: readonly ActRecord[], text = JSON.stringify(DRAFT)) =>
  bakeDrafts({
    model: model(text),
    records,
    context: CONTEXT,
    batchId: "11111111-1111-1111-1111-111111111111",
    delayMs: 0,
    now: () => new Date("2026-09-03T10:00:00.000Z"),
  });

describe("bakeDrafts", () => {
  it("drafts once per record and stamps provenance on each", async () => {
    const out = await bake([record("pay_A1"), record("pay_B2")]);

    expect(out.drafts.map((entry) => entry.recordId)).toEqual(["pay_A1", "pay_B2"]);
    expect(out.drafts[0].recordedAt).toBe("2026-09-03T10:00:00.000Z");
    expect(out.drafts[0].promptVersion).toBe("act-v2");
  });

  it("stores the figures the record carried, so a moved record drops its draft", async () => {
    const one = record("pay_A1");
    const out = await bake([one]);

    expect(out.drafts[0].figures).toBe(figureFingerprint(one));
  });

  it("totals the tokens and the cost across the run", async () => {
    const out = await bake([record("pay_A1"), record("pay_B2")]);

    expect(out.inputTokens).toBe(1800);
    expect(out.outputTokens).toBe(800);
    expect(out.costMicroUsd).toBeGreaterThan(0);
  });

  it("paces the calls when asked to", async () => {
    const waits: number[] = [];

    await bakeDrafts({
      model: model(JSON.stringify(DRAFT)),
      records: [record("pay_A1"), record("pay_B2"), record("pay_C3")],
      context: CONTEXT,
      batchId: "11111111-1111-1111-1111-111111111111",
      delayMs: 2000,
      sleep: async (ms) => {
        waits.push(ms);
      },
    });

    // Two waits for three calls: the pause is BETWEEN calls, never before the
    // first one, which would just make every run two seconds slower.
    expect(waits).toEqual([2000, 2000]);
  });
});

describe("isCompleteDraftBake", () => {
  it("refuses to overwrite the file from a run that produced no draft", async () => {
    const out = await bake([record("pay_A1")], "not json at all");

    expect(out.drafts[0].verdict).toBe("FAILED");
    expect(isCompleteDraftBake(out.drafts)).toBe(false);
  });

  it("treats a gated draft as a result, not a failure", async () => {
    const invented = {
      ...DRAFT,
      caEmail: { ...DRAFT.caEmail, body: "Razorpay owes you ₹4,200.00." },
    };
    const out = await bake([record("pay_A1")], JSON.stringify(invented));

    // The gate firing is exactly what a reader needs to see. Suppressing it
    // would make "the gate never fired" unfalsifiable.
    expect(out.drafts[0].verdict).toBe("INVALID_FIGURE");
    expect(isCompleteDraftBake(out.drafts)).toBe(true);
  });

  it("refuses an empty run, which would blank the file", () => {
    expect(isCompleteDraftBake([])).toBe(false);
  });
});
