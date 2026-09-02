import { readFileSync } from "node:fs";
import { tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { investigate } from "@/lib/agent/investigate";
import { MODEL_ID, costMicroUsd } from "@/lib/agent/pricing";
import { PROMPT_VERSION } from "@/lib/agent/schema";
import { createInvestigateTools } from "@/lib/agent/tools";
import { parseSettlements } from "@/lib/ingestion";

const batch = parseSettlements(JSON.parse(readFileSync("data/synthetic/settlements.json", "utf8")));
const item = batch.find((i) => i.entity_id === "pay_OmWyu0UGKY8O4o")!;

const usage = (over: Partial<{ noCache: number; cacheRead: number; out: number }> = {}) => ({
  inputTokens: {
    total: (over.noCache ?? 800) + (over.cacheRead ?? 0),
    noCache: over.noCache ?? 800,
    cacheRead: over.cacheRead ?? undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: over.out ?? 120, text: over.out ?? 120, reasoning: undefined },
});

const answers = (text: string, over = {}) => ({
  content: [{ type: "text" as const, text }],
  finishReason: { unified: "stop" as const, raw: undefined },
  usage: usage(over),
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
  investigate({
    model,
    item,
    claimedPeriod: "072026",
    batch,
    batchId: "11111111-1111-1111-1111-111111111111",
    recordId: "22222222-2222-2222-2222-222222222222",
    now: fixedClock(250),
    ...over,
  });

describe("investigate — the happy path", () => {
  it("accepts a valid classification and builds its audit row", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () =>
        answers(
          JSON.stringify({
            category: "REFUND_NETTED",
            reason: "A refund of 890000 paise was netted into this settlement.",
          }),
        ),
    });

    const out = await run(model);

    expect(out.category).toBe("REFUND_NETTED");
    expect(out.verdict).toBe("ACCEPTED");
    expect(out.rejected).toBeNull();
    expect(out.aiCall.model).toBe(MODEL_ID);
    expect(out.aiCall.promptVersion).toBe(PROMPT_VERSION);
    expect(out.aiCall.layer).toBe("INVESTIGATE");
    expect(out.aiCall.batchId).toBe("11111111-1111-1111-1111-111111111111");
    expect(out.aiCall.latencyMs).toBe(250);
  });

  it("prices the call from the tokens the provider reported", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () =>
        answers(JSON.stringify({ category: "TIMING", reason: "Settled 1 August." }), {
          noCache: 100,
          cacheRead: 900,
          out: 50,
        }),
    });

    const out = await run(model);

    expect(out.aiCall.inputTokens).toBe(1000);
    expect(out.aiCall.cacheReadTokens).toBe(900);
    expect(out.aiCall.outputTokens).toBe(50);
    expect(out.aiCall.costMicroUsd).toBe(
      costMicroUsd({
        inputTokens: 1000,
        cacheReadTokens: 900,
        cacheWriteTokens: 0,
        outputTokens: 50,
      }),
    );
  });

  it("marks the system prefix for caching and asks for low effort", async () => {
    // Both are cost levers from PRD Section 9 and both are invisible when
    // wrong — a dropped cache_control does not error, it just bills ten times
    // as much. Asserted against what actually reached the provider.
    const model = new MockLanguageModelV4({
      doGenerate: async () =>
        answers(JSON.stringify({ category: "TIMING", reason: "Settled 1 August." })),
    });

    await run(model);

    const call = model.doGenerateCalls[0];
    const system = call.prompt.find((m) => m.role === "system");
    expect(system?.providerOptions?.anthropic?.cacheControl).toEqual({ type: "ephemeral" });
    expect(call.providerOptions?.anthropic?.effort).toBe("low");
  });
});

describe("investigate — the policy gate in the loop", () => {
  it("records one of the five when the model names a sixth", async () => {
    // PRD Section 15.3's "done when", end to end: push the model toward a
    // category outside the taxonomy and the batch still records one of the five.
    const model = new MockLanguageModelV4({
      doGenerate: async () =>
        answers(
          JSON.stringify({ category: "BANK_ERROR", reason: "The bank rejected the transfer." }),
        ),
    });

    const out = await run(model);

    expect(out.category).toBe("UNEXPLAINED");
    expect(out.verdict).toBe("COERCED_UNEXPLAINED");
    expect(out.rejected).toBe("BANK_ERROR");
    expect(out.aiCall.category).toBe("UNEXPLAINED");
    expect(out.aiCall.verdict).toBe("COERCED_UNEXPLAINED");
  });

  it("refuses a tool that could write, before calling the model at all", async () => {
    // The boundary has to be checked ahead of the call. A gate that inspects
    // the answer has already let the tool run. PRD Section 9.
    const model = new MockLanguageModelV4({
      doGenerate: async () => answers(JSON.stringify({ category: "TIMING", reason: "x" })),
    });

    const out = await run(model, {
      tools: {
        ...createInvestigateTools(batch),
        markRecordResolved: tool({
          description: "Write a resolution back to the record.",
          inputSchema: z.object({ recordId: z.string() }),
          execute: () => ({ written: true }),
        }),
      },
    });

    expect(out.verdict).toBe("BLOCKED_WRITE");
    expect(out.category).toBe("UNEXPLAINED");
    expect(out.rejected).toContain("markRecordResolved");
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  it("falls back to UNEXPLAINED when the model call throws", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new Error("connection reset");
      },
    });

    const out = await run(model);

    expect(out.category).toBe("UNEXPLAINED");
    expect(out.verdict).toBe("FAILED");
    expect(out.aiCall.verdict).toBe("FAILED");
  });

  it("records that a failed call still took time", async () => {
    // A row with zero latency is indistinguishable from a call that never
    // happened, and "the agent made fewer calls" is the hardest kind of bug
    // to notice.
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new Error("connection reset");
      },
    });

    const out = await run(model);
    expect(out.aiCall.latencyMs).toBeGreaterThan(0);
  });
});

describe("investigate — the reasoning trace", () => {
  it("records the tools it called and what they returned", async () => {
    // PRD Section 15.1 renders this from `ai_calls` rather than regenerating
    // it on view, so the call site has to capture it here or it is lost.
    let step = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        step += 1;
        if (step === 1) {
          return {
            content: [
              {
                type: "tool-call" as const,
                toolCallId: "call-1",
                toolName: "findRefundsForPayment",
                input: JSON.stringify({ paymentId: item.entity_id }),
              },
            ],
            finishReason: { unified: "tool-calls" as const, raw: undefined },
            usage: usage(),
            warnings: [],
          };
        }
        return answers(
          JSON.stringify({
            category: "REFUND_NETTED",
            reason: "One refund of 890000 paise reverses this payment.",
          }),
        );
      },
    });

    const out = await run(model);

    expect(out.category).toBe("REFUND_NETTED");
    expect(out.toolCalls).toHaveLength(1);
    expect(out.toolCalls[0].toolName).toBe("findRefundsForPayment");
    expect(out.toolCalls[0].output).toMatchObject({ count: 1 });
    expect(out.aiCall.toolCalls).toEqual(out.toolCalls);
  });

  it("keeps classifying when a tool fails", async () => {
    // A broken lookup must not take the whole record down. The agent should
    // still land on a category — UNEXPLAINED if it has nothing to go on.
    let step = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        step += 1;
        if (step === 1) {
          return {
            content: [
              {
                type: "tool-call" as const,
                toolCallId: "call-1",
                toolName: "findRefundsForPayment",
                input: JSON.stringify({ anything: "x" }),
              },
            ],
            finishReason: { unified: "tool-calls" as const, raw: undefined },
            usage: usage(),
            warnings: [],
          };
        }
        return answers(
          JSON.stringify({
            category: "UNEXPLAINED",
            reason: "The refund lookup failed, so nothing supports a classification.",
          }),
        );
      },
    });

    // The broken tool keeps an ALLOWLISTED name, so this exercises tool
    // failure rather than the permission boundary. An earlier version of this
    // test used an invented name and was silently testing the allowlist
    // instead — both paths land on UNEXPLAINED, so only the verdict tells
    // them apart.
    const out = await run(model, {
      tools: {
        ...createInvestigateTools(batch),
        findRefundsForPayment: tool({
          description: "A read-only lookup that is currently broken.",
          inputSchema: z.object({ paymentId: z.string() }),
          // The return type is declared because the body only throws, which
          // infers `never` and matches no `tool()` overload. It also keeps the
          // stand-in honest: same shape as the tool it replaces.
          execute: (): { refunds: []; count: number } => {
            throw new Error("upstream unavailable");
          },
        }),
      },
    });

    // ACCEPTED, not FAILED, is the load-bearing assertion: it proves the run
    // completed normally despite a tool throwing, rather than the whole call
    // collapsing into the error path and landing on UNEXPLAINED by accident.
    expect(out.verdict).toBe("ACCEPTED");
    expect(out.category).toBe("UNEXPLAINED");
    expect(out.toolCalls.map((c) => c.toolName)).toEqual(["findRefundsForPayment"]);
  });

  it("reports FAILED, not a coerced category, when the answer is unparseable", async () => {
    // The two failures are different problems and the audit trail has to keep
    // them apart: a model naming a category we reject is a prompt regression,
    // a model returning noise is a call problem.
    const model = new MockLanguageModelV4({
      doGenerate: async () => answers("I could not determine a category, sorry."),
    });

    const out = await run(model);

    expect(out.verdict).toBe("FAILED");
    expect(out.category).toBe("UNEXPLAINED");
    expect(out.rejected).toBeNull();
  });

  it("keeps the model's own words when the gate overrides it", async () => {
    // The reasoning is most valuable precisely when the category was rejected,
    // because that is when a person needs to see what the model was thinking.
    const model = new MockLanguageModelV4({
      doGenerate: async () =>
        answers(
          JSON.stringify({
            category: "CHARGEBACK",
            reason: "The cardholder disputed this payment on 14 July.",
          }),
        ),
    });

    const out = await run(model);
    expect(out.reason).toBe("The cardholder disputed this payment on 14 July.");
    expect(out.aiCall.reason).toBe("The cardholder disputed this payment on 14 July.");
  });

  it("keeps repeated calls to one tool distinct", async () => {
    // Tool results are matched to their calls by POSITION, not by name. The
    // model may call the same tool twice in one step with different inputs,
    // and keying by name would attach the first result to both — showing a
    // reviewer evidence that belongs to a different record.
    let step = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        step += 1;
        if (step === 1) {
          return {
            content: [
              {
                type: "tool-call" as const,
                toolCallId: "call-1",
                toolName: "findOrderSiblings",
                input: JSON.stringify({ orderId: "order_wcsCK4S8SEIAmm" }),
              },
              {
                type: "tool-call" as const,
                toolCallId: "call-2",
                toolName: "findOrderSiblings",
                input: JSON.stringify({ orderId: "order_oAcUAWiCuaGsie" }),
              },
            ],
            finishReason: { unified: "tool-calls" as const, raw: undefined },
            usage: usage(),
            warnings: [],
          };
        }
        return answers(
          JSON.stringify({
            category: "PARTIAL_PAYMENT",
            reason: "One order carries a zero-value retry alongside the capture.",
          }),
        );
      },
    });

    const out = await run(model);

    expect(out.toolCalls).toHaveLength(2);
    // The retried order has two rows, one of them zero-value; the other order
    // has one. Identical outputs here would mean the results were misattached.
    expect(out.toolCalls[0].output).toMatchObject({ count: 2, zeroValueCount: 1 });
    expect(out.toolCalls[1].output).toMatchObject({ count: 1, zeroValueCount: 0 });
  });

  it("reports FAILED when the agent loops on tools and never answers", async () => {
    // Distinct from a schema mismatch: here `generateText` RESOLVES, and it is
    // reading the answer that throws, because the run stopped on a tool call
    // rather than a final classification. Without the fallback that reads the
    // raw text, this path would crash instead of recording a FAILED call.
    const model = new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [
          {
            type: "tool-call" as const,
            toolCallId: `call-${Math.random()}`,
            toolName: "resolveFilingPeriod",
            input: JSON.stringify({ settledAtUnixSeconds: item.settled_at }),
          },
        ],
        finishReason: { unified: "tool-calls" as const, raw: undefined },
        usage: usage(),
        warnings: [],
      }),
    });

    const out = await run(model);

    expect(out.verdict).toBe("FAILED");
    expect(out.category).toBe("UNEXPLAINED");
    // The trace still records every lookup it made before giving up — that is
    // what tells a reviewer it looped rather than never started.
    expect(out.toolCalls.length).toBeGreaterThan(0);
  });
});
