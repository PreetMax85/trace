import { describe, expect, it } from "vitest";
import { parseTraces, summariseToolValue } from "@/lib/review/trace";

const trace = (over: Record<string, unknown> = {}) => ({
  recordId: "pay_S2s6M2O4AEQkOA",
  model: "claude-opus-5",
  promptVersion: "investigate-v1",
  verdict: "ACCEPTED",
  category: "TIMING",
  reason: "Settled on 2 August, so the fee lands on August's GSTR-2B.",
  toolCalls: [
    {
      toolName: "resolveFilingPeriod",
      input: { settledAt: 1_754_100_000 },
      output: { period: "082026" },
    },
  ],
  latencyMs: 2_400,
  inputTokens: 2_500,
  outputTokens: 180,
  costMicroUsd: 17_000,
  ...over,
});

describe("parseTraces", () => {
  it("keys a valid export by record", () => {
    const byRecord = parseTraces([trace()]);

    expect(byRecord.size).toBe(1);
    const found = byRecord.get("pay_S2s6M2O4AEQkOA");
    expect(found?.category).toBe("TIMING");
    expect(found?.toolCalls[0].toolName).toBe("resolveFilingPeriod");
    // Provenance survives the parse: a trace is only meaningful beside the
    // model and prompt that produced it.
    expect(found?.model).toBe("claude-opus-5");
    expect(found?.promptVersion).toBe("investigate-v1");
  });

  it("accepts an empty export, which is what no run yet looks like", () => {
    expect(parseTraces([]).size).toBe(0);
  });

  it("refuses a tool the agent is not allowed to hold", () => {
    // The permission boundary again, at the render edge: a trace claiming a
    // write tool must not be displayed as though the agent legitimately used it.
    expect(() =>
      parseTraces([trace({ toolCalls: [{ toolName: "deleteRecord", input: {}, output: {} }] })]),
    ).toThrow(/malformed/);
  });

  it("refuses a category outside the five", () => {
    expect(() => parseTraces([trace({ category: "CHARGEBACK" })])).toThrow(/malformed/);
  });

  it("refuses a file that merged two runs for the same record", () => {
    expect(() => parseTraces([trace(), trace({ reason: "A different run said this." })])).toThrow(
      /twice/,
    );
  });

  it("refuses a trace missing its provenance rather than rendering it blank", () => {
    expect(() => parseTraces([trace({ model: "" })])).toThrow(/malformed/);
  });
});

describe("summariseToolValue", () => {
  it("renders a small payload in full", () => {
    expect(summariseToolValue({ period: "082026" })).toBe('{"period":"082026"}');
  });

  it("marks truncation instead of showing a partial payload as if it were whole", () => {
    const long = { note: "x".repeat(300) };
    const out = summariseToolValue(long);

    expect(out).toHaveLength(140);
    expect(out.endsWith("…")).toBe(true);
  });

  it("keeps a payload that lands exactly on the limit intact", () => {
    // The boundary: 140 characters must not be truncated to 140 characters
    // where the last one is an ellipsis replacing real content.
    const exact = "y".repeat(138);
    const out = summariseToolValue(exact);

    expect(out).toBe(`"${exact}"`);
    expect(out.endsWith("…")).toBe(false);
  });

  it("survives an unserialisable payload rather than crashing the panel", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    expect(summariseToolValue(cyclic)).toBe("(unserialisable)");
  });

  it("shows a dash for a tool that returned nothing", () => {
    expect(summariseToolValue(undefined)).toBe("—");
  });
});
