import { tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { act } from "@/lib/act/act";
import { ACT_PROMPT_VERSION } from "@/lib/act/schema";
import { MODEL_ID } from "@/lib/agent/pricing";

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

const DRAFT = {
  caEmail: {
    subject: "Razorpay fee query — setl_JvhLpq3rzWQ1nT, July 2026",
    body: "Razorpay deducted ₹28.32 where the published 2% cell gives ₹23.60. Please ask them to explain the ₹4.72 excess.",
  },
  gstr3bFlag: {
    line: "4B2",
    action: "REVERSE",
    amountPaise: 432,
    note: "Keep this GST out of All Other ITC until the deduction is explained.",
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

const usage = () => ({
  inputTokens: { total: 900, noCache: 900, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 400, text: 400, reasoning: undefined },
});

const returns = (text: string) => ({
  content: [{ type: "text" as const, text }],
  finishReason: { unified: "stop" as const, raw: undefined },
  usage: usage(),
  warnings: [],
});

/** A clock that advances a fixed amount per read, so latency is asserted, not raced. */
const fixedClock = (stepMs: number) => {
  let t = 1_000;
  return () => {
    const current = t;
    t += stepMs;
    return current;
  };
};

const run = (model: MockLanguageModelV4, over = {}) =>
  act({
    model,
    record: RECORD,
    context: CONTEXT,
    batchId: "11111111-1111-1111-1111-111111111111",
    now: fixedClock(500),
    ...over,
  });

describe("act — the happy path", () => {
  it("accepts a draft whose figures the record carries, and builds its audit row", async () => {
    const out = await run(
      new MockLanguageModelV4({ doGenerate: async () => returns(JSON.stringify(DRAFT)) }),
    );

    expect(out.verdict).toBe("ACCEPTED");
    expect(out.unresolved).toEqual([]);
    expect(out.draft?.gstr3bFlag.action).toBe("REVERSE");

    expect(out.aiCall.layer).toBe("ACT");
    expect(out.aiCall.model).toBe(MODEL_ID);
    expect(out.aiCall.promptVersion).toBe(ACT_PROMPT_VERSION);
    expect(out.aiCall.verdict).toBe("ACCEPTED");
    expect(out.aiCall.latencyMs).toBe(500);
    expect(out.aiCall.inputTokens).toBe(900);
    expect(out.aiCall.outputTokens).toBe(400);
  });

  it("leaves the category column empty, because Act may not classify", async () => {
    const out = await run(
      new MockLanguageModelV4({ doGenerate: async () => returns(JSON.stringify(DRAFT)) }),
    );

    expect(out.aiCall.category).toBeNull();
  });

  it("records no tool calls, because Act holds no tools", async () => {
    const out = await run(
      new MockLanguageModelV4({ doGenerate: async () => returns(JSON.stringify(DRAFT)) }),
    );

    expect(out.aiCall.toolCalls).toEqual([]);
  });
});

describe("act — a draft that states a figure the record does not carry", () => {
  it("keeps the draft, names the amount, and refuses to accept it", async () => {
    const invented = {
      ...DRAFT,
      caEmail: { ...DRAFT.caEmail, body: "Razorpay owes you ₹4,200.00 on this settlement." },
    };

    const out = await run(
      new MockLanguageModelV4({ doGenerate: async () => returns(JSON.stringify(invented)) }),
    );

    expect(out.verdict).toBe("INVALID_FIGURE");
    expect(out.unresolved).toEqual([{ text: "₹4,200.00", paise: 420000 }]);
    expect(out.draft).not.toBeNull();
    expect(out.aiCall.verdict).toBe("INVALID_FIGURE");
  });
});

describe("act — the permission boundary", () => {
  it("refuses before the model is called when handed any tool at all", async () => {
    let called = false;
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        called = true;
        return returns(JSON.stringify(DRAFT));
      },
    });

    const out = await run(model, {
      tools: {
        sendEmail: tool({
          description: "Send the drafted email.",
          inputSchema: z.object({ to: z.string() }),
          execute: async () => ({ sent: true }),
        }),
      },
    });

    // The point of checking the boundary first: the model never ran, so there
    // was never a moment at which the tool could have been called.
    expect(called).toBe(false);
    expect(out.verdict).toBe("BLOCKED_WRITE");
    expect(out.draft).toBeNull();
    expect(out.aiCall.reason).toBe("Refused: Act may not hold sendEmail.");
  });

  it("refuses a read-only-looking tool just the same", async () => {
    const out = await run(
      new MockLanguageModelV4({ doGenerate: async () => returns(JSON.stringify(DRAFT)) }),
      {
        tools: {
          getRecord: tool({
            description: "Look up a record.",
            inputSchema: z.object({ id: z.string() }),
            execute: async () => ({ found: false }),
          }),
        },
      },
    );

    expect(out.verdict).toBe("BLOCKED_WRITE");
  });
});

describe("act — when the call produces nothing usable", () => {
  it("records FAILED rather than an empty draft that reads as a real one", async () => {
    const out = await run(
      new MockLanguageModelV4({ doGenerate: async () => returns("not json at all") }),
    );

    expect(out.verdict).toBe("FAILED");
    expect(out.draft).toBeNull();
    expect(out.aiCall.reason).toBeNull();
  });

  it("still records the latency and the audit row when the provider rejects", async () => {
    const out = await run(
      new MockLanguageModelV4({
        doGenerate: async () => {
          throw new Error("rate limited");
        },
      }),
    );

    expect(out.verdict).toBe("FAILED");
    expect(out.aiCall.layer).toBe("ACT");
    expect(out.aiCall.latencyMs).toBe(500);
  });
});
