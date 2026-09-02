import { describe, expect, it } from "vitest";
import {
  INVESTIGATION_CATEGORIES,
  PROMPT_VERSION,
  REASON_MAX_CHARS,
  investigationSchema,
} from "@/lib/agent/schema";
import { SYSTEM_PROMPT, istDate, recordPrompt } from "@/lib/agent/prompt";
import { exceptionCategory } from "@/lib/audit/schema";
import { RATE_CELLS } from "@/lib/matching";
import type { ExceptionCategory, ReconItem } from "@/lib/matching/types";

/**
 * The five as the MATCHER names them, annotated with the matcher's own union
 * type. Retyped deliberately: this is the third definition, and the point is
 * that a compiler error appears here if the three ever diverge.
 */
const MATCHER_CATEGORIES: ExceptionCategory[] = [
  "FEE_DEDUCTION",
  "TIMING",
  "REFUND_NETTED",
  "PARTIAL_PAYMENT",
  "UNEXPLAINED",
];

const item: ReconItem = {
  entity_id: "pay_Nx4kR2000001",
  type: "payment",
  amount: 118000,
  fee: 4130,
  tax: 630,
  debit: 0,
  credit: 113870,
  order_id: "order_Nx4kR2000001",
  payment_id: null,
  settlement_id: "setl_Nx4kR2000001",
  settled_at: Math.floor(Date.UTC(2026, 6, 15, 6, 0, 0) / 1000),
};

describe("investigation output schema", () => {
  it("permits exactly the five locked categories", () => {
    // PRD Section 15.3: the model is handed a JSON schema that admits these
    // five strings and no others, so a sixth category is unrepresentable
    // rather than merely rejected.
    //
    // Asserted against the literal list, NOT against `exceptionCategory`.
    // `INVESTIGATION_CATEGORIES` is currently derived from that enum, so
    // comparing the two would be comparing a value to itself and would pass
    // however wrong both were.
    expect(INVESTIGATION_CATEGORIES).toEqual([
      "FEE_DEDUCTION",
      "TIMING",
      "REFUND_NETTED",
      "PARTIAL_PAYMENT",
      "UNEXPLAINED",
    ]);
  });

  it("uses the same list as the column it is written to", () => {
    // Separately from the assertion above: whatever the five are, the model's
    // vocabulary and the database column must be the same list, or a value the
    // model is allowed to emit is one the column will reject at insert time.
    expect([...INVESTIGATION_CATEGORIES]).toEqual([...exceptionCategory.enumValues]);
  });

  it("agrees with the matcher's own category type", () => {
    // A third definition of the five lives in matching/types.ts. This is a
    // compile-time assertion in both directions: if either list grows a member
    // the other lacks, `npm run typecheck` fails here rather than the two
    // layers silently disagreeing about what a category is.
    const fromAgent: ExceptionCategory[] = [...INVESTIGATION_CATEGORIES];
    const fromMatcher: (typeof INVESTIGATION_CATEGORIES)[number][] = MATCHER_CATEGORIES;
    expect(fromAgent.sort()).toEqual(fromMatcher.sort());
  });

  it("rejects a category outside the five", () => {
    const parsed = investigationSchema.safeParse({
      category: "BANK_ERROR",
      reason: "The bank returned an error.",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an empty reason", () => {
    // A category with no evidence behind it is exactly what a CA cannot use.
    const parsed = investigationSchema.safeParse({ category: "TIMING", reason: "" });
    expect(parsed.success).toBe(false);
  });

  it("caps the reason length", () => {
    // Output is roughly 77% of the bill (PRD Section 9), so this cap is a cost
    // control, not a style preference.
    const parsed = investigationSchema.safeParse({
      category: "TIMING",
      reason: "x".repeat(REASON_MAX_CHARS + 1),
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects extra fields", () => {
    // No confidence score: `match_method` is the confidence tier (PRD Section 6)
    // and there is deliberately no second one. An extra field that silently
    // passed would end up rendered somewhere as if it meant something.
    const parsed = investigationSchema.safeParse({
      category: "TIMING",
      reason: "Settled on 1 August, so the fee bills next period.",
      confidence: 0.9,
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts a well-formed answer", () => {
    const parsed = investigationSchema.safeParse({
      category: "REFUND_NETTED",
      reason: "A refund of 118000 paise was netted into this settlement.",
    });
    expect(parsed.success).toBe(true);
  });
});

describe("prompt caching", () => {
  it("stays above Claude Opus 5's minimum cacheable prefix", () => {
    // Anthropic will not cache a prefix shorter than 512 tokens on
    // claude-opus-5. Under that it does not error — it returns
    // cache_creation_input_tokens: 0 and bills every one of the 54 calls at
    // the full input rate, which is a ~10x cost regression that looks like
    // nothing at all. 4 chars per token UNDERSTATES the count for a prompt
    // this full of capitalised terms and punctuation, so this floor is
    // conservative in the safe direction.
    expect(SYSTEM_PROMPT.length).toBeGreaterThanOrEqual(512 * 4);
  });

  it("keeps the system prefix a constant, not a per-record build", () => {
    // The prefix must be byte-identical across all 54 calls or Anthropic's
    // prompt cache misses every one of them, and input cost goes back up ~10x
    // (PRD Section 9). Turning this into a function that interpolates a record
    // is the way that happens, and it fails silently — as a bill, not an error.
    expect(typeof SYSTEM_PROMPT).toBe("string");
  });

  it("carries no facts from any particular record", () => {
    const perRecord = [item.entity_id, item.settlement_id, item.order_id, String(item.fee)];
    for (const fact of perRecord) {
      expect(SYSTEM_PROMPT).not.toContain(fact);
    }
  });

  it("states the rate card the matcher actually uses", () => {
    // Interpolated from rate-card.ts rather than typed out, so the prompt and
    // the deterministic matcher cannot come to disagree about Razorpay's rates.
    expect(SYSTEM_PROMPT).toContain(`${RATE_CELLS.STANDARD / 100}%`);
    expect(SYSTEM_PROMPT).toContain(`${RATE_CELLS.CORPORATE / 100}%`);
  });

  it("tells the agent it may classify but not write", () => {
    // The permission boundary is stated in the prompt AND enforced by the gate
    // behind it. This asserts the first half is present; the gate's own tests
    // assert the second, because a prompt is not an enforcement mechanism.
    expect(SYSTEM_PROMPT).toMatch(/do not write to the database/i);
  });

  it("names a prompt version", () => {
    expect(PROMPT_VERSION).toMatch(/\S/);
  });
});

describe("record prompt", () => {
  it("reads the settlement date in IST, not UTC", () => {
    // A settlement at 19:00 UTC on 31 July is 00:30 IST on 1 August, and lands
    // on the following month's GSTR-2B. Reading it as UTC hides exactly the
    // month-boundary crossing that TIMING exists to detect. BUILD-LOG entry 13.
    expect(istDate(Math.floor(Date.UTC(2026, 6, 31, 19, 0, 0) / 1000))).toBe("2026-08-01");
    expect(istDate(Math.floor(Date.UTC(2026, 6, 31, 18, 0, 0) / 1000))).toBe("2026-07-31");
  });

  it("gives the agent the evidence and the period", () => {
    const prompt = recordPrompt(item, "072026");
    expect(prompt).toContain(item.entity_id);
    expect(prompt).toContain(String(item.fee));
    expect(prompt).toContain(String(item.amount));
    expect(prompt).toContain("072026");
    expect(prompt).toContain("2026-07-15");
  });

  it("never hands the agent the matcher's own verdict", () => {
    // If the prompt carried the deterministic category, the Section 15.2
    // agreement score would measure whether the model can copy a field. It
    // would read near 100% and prove nothing about the AI layer.
    const prompt = recordPrompt(item, "072026");
    for (const category of INVESTIGATION_CATEGORIES) {
      expect(prompt).not.toContain(category);
    }
    expect(prompt).not.toMatch(/EXACT|FUZZY|MATCHED|EXCEPTION/);
  });
});
