import { describe, expect, it } from "vitest";
import { MODEL_ID } from "@/lib/agent/pricing";
import { resolveModelChoice } from "@/lib/eval/model";

const anthropicKey = { ANTHROPIC_API_KEY: "sk-test" };
const googleKey = { GOOGLE_GENERATIVE_AI_API_KEY: "goog-test" };

describe("resolveModelChoice", () => {
  it("runs the shipped model by default", () => {
    const choice = resolveModelChoice({}, anthropicKey);

    expect(choice.modelId).toBe(MODEL_ID);
    expect(choice.costIsMeaningful).toBe(true);
  });

  it("explains why a Google key is not a substitute, rather than trying and failing 16 times", () => {
    const error = catchError(() => resolveModelChoice({}, googleKey));

    expect(error?.message).toContain("ANTHROPIC_API_KEY");
    // The constraint itself, so nobody re-discovers it by burning a run.
    expect(error?.message).toContain("function calling");
    expect(error?.message).toContain("JSON response format");
  });

  it("refuses an explicit provider that cannot run this agent", () => {
    const error = catchError(() => resolveModelChoice({ provider: "google" }, googleKey));

    expect(error?.message).toContain("google");
    expect(error?.message).toContain("not supported");
  });

  it("distrusts the cost of a model pricing.ts does not carry rates for", () => {
    const choice = resolveModelChoice({ model: "claude-something-else" }, anthropicKey);

    expect(choice.modelId).toBe("claude-something-else");
    // Token counts stay real; the rupee figure would not be.
    expect(choice.costIsMeaningful).toBe(false);
  });
});

function catchError(fn: () => unknown): Error | null {
  try {
    fn();
    return null;
  } catch (error) {
    return error as Error;
  }
}
