import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { READ_ONLY_TOOL_NAMES, createInvestigateTools } from "@/lib/agent/tools";
import { parseSettlements } from "@/lib/ingestion";
import { RATE_CELLS, TOLERANCE_PAISE, priceAt } from "@/lib/matching";

const items = parseSettlements(JSON.parse(readFileSync("data/synthetic/settlements.json", "utf8")));
const tools = createInvestigateTools(items);

/**
 * Vitest calls `execute` directly, so it supplies the context the SDK would.
 *
 * The `Exclude` narrows away the AsyncIterable arm of the SDK's return type —
 * that arm is for tools that stream partial results, and none of these do.
 * Without it every assertion below has to be written against a union.
 */
const call = async <I, O>(
  t: { execute?: (input: I, opts: never) => PromiseLike<O> | O },
  input: I,
): Promise<Exclude<Awaited<O>, AsyncIterable<unknown>>> =>
  (await t.execute!(input, undefined as never)) as Exclude<
    Awaited<O>,
    AsyncIterable<unknown>
  >;

describe("the tool surface", () => {
  it("is exactly the read-only allowlist", () => {
    // "May classify, may not write" (PRD Section 9) is enforced by comparing
    // the tools handed to the runner against this list. If the two drift, the
    // check passes vacuously and the boundary stops meaning anything.
    expect(Object.keys(tools).sort()).toEqual([...READ_ONLY_TOOL_NAMES].sort());
  });
});

describe("priceAtPublishedRates", () => {
  it("ties a standard-rate fee to the STANDARD cell only", async () => {
    const amountPaise = 149900;
    const { fee } = priceAt(amountPaise, "STANDARD");
    const out = await call(tools.priceAtPublishedRates, { amountPaise, feePaise: fee });
    expect(out.tiedCells).toEqual(["STANDARD"]);
  });

  it("reports every cell that ties, not the first one found", async () => {
    // Below about 1138 rupees the two published cells price within 1 rupee of
    // each other, so a fee can genuinely satisfy both. Returning one would make
    // the verdict depend on object key order. BUILD-LOG entry 10.
    const amountPaise = 50000;
    const { fee } = priceAt(amountPaise, "STANDARD");
    const out = await call(tools.priceAtPublishedRates, { amountPaise, feePaise: fee });
    expect(out.tiedCells.length).toBeGreaterThan(1);
    expect(out.tiedCells).toContain("STANDARD");
    expect(out.tiedCells).toContain("CORPORATE");
  });

  it("treats the tolerance as inclusive at exactly 1 rupee", async () => {
    // The tolerance is exactly 100 paise and the comparison is <=, so a fee
    // one rupee off still ties and a fee one paisa further does not. An
    // off-by-one here silently reclassifies rows on the boundary as
    // FEE_DEDUCTION, which is the category that claims real money was lost.
    const amountPaise = 890000;
    const { fee } = priceAt(amountPaise, "STANDARD");
    const onBoundary = await call(tools.priceAtPublishedRates, {
      amountPaise,
      feePaise: fee + TOLERANCE_PAISE,
    });
    expect(onBoundary.tiedCells).toContain("STANDARD");

    const justPast = await call(tools.priceAtPublishedRates, {
      amountPaise,
      feePaise: fee + TOLERANCE_PAISE + 1,
    });
    expect(justPast.tiedCells).not.toContain("STANDARD");
  });

  it("signs the difference as charged minus expected", async () => {
    // An overcharge must read positive. A flipped sign would have the agent
    // telling a merchant they were undercharged when they were overcharged.
    const amountPaise = 890000;
    const { fee } = priceAt(amountPaise, "STANDARD");
    const out = await call(tools.priceAtPublishedRates, { amountPaise, feePaise: fee + 500 });
    expect(out.cells.find((c) => c.cell === "STANDARD")?.differencePaise).toBe(500);
  });

  it("ties nothing when the fee matches no published rate", async () => {
    const out = await call(tools.priceAtPublishedRates, { amountPaise: 149900, feePaise: 9999 });
    expect(out.tiedCells).toEqual([]);
  });

  it("refuses to explain a fee on a zero capture", async () => {
    // 2% and 2.15% of nothing are both nothing, so without a guard every cell
    // "explains" a failed retry and it reads as a clean match. BUILD-LOG 9.
    const out = await call(tools.priceAtPublishedRates, { amountPaise: 0, feePaise: 0 });
    expect(out.tiedCells).toEqual([]);
    expect(out.cells).toEqual([]);
    expect(out.note).toMatch(/nothing was captured/i);
  });

  it("reports the same expected fee the matcher would compute", async () => {
    // The agent and the deterministic layer must not disagree about the rate
    // card, or the reasoning shown in the UI contradicts the numbers above it.
    const amountPaise = 890000;
    const out = await call(tools.priceAtPublishedRates, { amountPaise, feePaise: 21004 });
    for (const cell of ["STANDARD", "CORPORATE"] as const) {
      const expected = priceAt(amountPaise, cell);
      const reported = out.cells.find((c) => c.cell === cell);
      expect(reported?.expectedFeePaise).toBe(expected.fee);
      expect(reported?.expectedTaxPaise).toBe(expected.tax);
      expect(reported?.ratePercent).toBe(RATE_CELLS[cell] / 100);
    }
  });
});

describe("findRefundsForPayment", () => {
  it("finds the refund that reverses a payment", async () => {
    const out = await call(tools.findRefundsForPayment, { paymentId: "pay_OmWyu0UGKY8O4o" });
    expect(out.count).toBe(1);
    expect(out.refunds[0].entityId).toBe("rfnd_si46yWo1IOGEWC");
  });

  it("finds nothing for a payment that was never refunded", async () => {
    const out = await call(tools.findRefundsForPayment, { paymentId: "pay_4gaSMyqces2Qkk" });
    expect(out.count).toBe(0);
  });

  it("joins on payment_id, not settlement_id", async () => {
    // A refund is netted into a LATER settlement cycle than the payment it
    // reverses, so the two rarely share a settlement id. A settlement join
    // would return nothing while looking like it worked. PRD Section 7.
    const payment = items.find((i) => i.entity_id === "pay_OmWyu0UGKY8O4o")!;
    const refund = items.find((i) => i.entity_id === "rfnd_si46yWo1IOGEWC")!;
    expect(refund.settlement_id).not.toBe(payment.settlement_id);

    // Found anyway — which is the whole point of the assertion above.
    const out = await call(tools.findRefundsForPayment, { paymentId: payment.entity_id });
    expect(out.count).toBe(1);
  });
});

describe("findOrderSiblings", () => {
  it("surfaces the zero-value row of a failed-then-retried payment", async () => {
    const out = await call(tools.findOrderSiblings, { orderId: "order_wcsCK4S8SEIAmm" });
    expect(out.count).toBe(2);
    expect(out.zeroValueCount).toBe(1);
  });

  it("returns just the row itself when the order has no siblings", async () => {
    const solo = items.find((i) => items.filter((j) => j.order_id === i.order_id).length === 1)!;
    const out = await call(tools.findOrderSiblings, { orderId: solo.order_id });
    expect(out.count).toBe(1);
  });
});

describe("resolveFilingPeriod", () => {
  it("places a mid-month settlement in its own period", async () => {
    const out = await call(tools.resolveFilingPeriod, {
      settledAtUnixSeconds: Math.floor(Date.UTC(2026, 6, 15, 6, 0, 0) / 1000),
    });
    expect(out.period).toBe("072026");
  });

  it("reads a month boundary in IST, so T+2 lands in the next period", async () => {
    // 19:00 UTC on 31 July is 00:30 IST on 1 August. Reading it as UTC hides
    // the crossing that TIMING exists to detect. BUILD-LOG entry 13.
    const out = await call(tools.resolveFilingPeriod, {
      settledAtUnixSeconds: Math.floor(Date.UTC(2026, 6, 31, 19, 0, 0) / 1000),
    });
    expect(out.period).toBe("082026");
  });
});
