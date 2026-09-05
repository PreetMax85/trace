import { describe, expect, it } from "vitest";
import { formatRupees } from "@/lib/format/money";
import { loadReviewBatch, type ReviewRow } from "@/lib/review/batch";

/**
 * What the exception review screen is given. These are the same locked figures
 * `docs/HANDOFF.md` carries: if one of them moves, the screen is wrong, not the
 * number.
 */
const batch = loadReviewBatch();

describe("the review header", () => {
  it("carries the locked figures, in paise", () => {
    expect(batch.header).toMatchObject({
      period: "072026",
      merchantGstin: "27TESTM1234A1Z0",
      invoiceTaxPaise: 119692,
      itcClaimablePaise: 98223,
      itcAtRiskPaise: 21469,
      rolledUpTaxPaise: 85587,
      rollupDeltaPaise: 34105,
      matchedCount: 38,
      exceptionCount: 16,
      totalRecords: 54,
      itcAvailable: true,
    });
  });

  it("renders those figures as the rupee strings the screen shows", () => {
    // The header is the one place a wrong figure would be read as fact, so the
    // rendered strings are asserted and not just the paise behind them.
    expect(formatRupees(batch.header.invoiceTaxPaise)).toBe("₹1,196.92");
    expect(formatRupees(batch.header.itcClaimablePaise)).toBe("₹982.23");
    expect(formatRupees(batch.header.itcAtRiskPaise)).toBe("₹214.69");
    expect(`${batch.header.matchedCount}/${batch.header.totalRecords}`).toBe("38/54");
  });

  it("splits the whole invoice and nothing more", () => {
    // Claimable and at risk are two halves of one invoice. If they ever stop
    // summing to it, the screen is quietly inventing or losing credit.
    expect(batch.header.itcClaimablePaise + batch.header.itcAtRiskPaise).toBe(
      batch.header.invoiceTaxPaise,
    );
    expect(batch.header.matchedCount + batch.header.exceptionCount).toBe(
      batch.header.totalRecords,
    );
  });

  it("carries the two terms that claimable is made of, and they add up to it", () => {
    // The screen shows this subtraction, term by term, when a reader opens the
    // claimable figure. A derivation that does not reach the number printed
    // above it is worse than no derivation: it invites a reader to trust the
    // arithmetic and then hands them different arithmetic. The terms come from
    // the audit row's own function, so the only way they can drift is if one
    // of them stops being read from it.
    expect(batch.header.rolledUpTaxPaise + batch.header.refundNettedTaxPaise).toBe(
      batch.header.itcClaimablePaise,
    );
    expect(batch.header.refundNettedTaxPaise).toBe(12636);
  });

  it("names the supplier and invoice the figures were billed on", () => {
    // Shown in every figure's derivation. An amount at risk that cannot say
    // which invoice billed it is not something an accountant can query.
    expect(batch.header.supplierGstin).toMatch(/^\d{2}[A-Z]{5}\d{4}[A-Z]/);
    expect(batch.header.invoiceNumber.length).toBeGreaterThan(0);
  });
});

describe("the review rows", () => {
  it("is all 54 records, each one distinct", () => {
    expect(batch.rows).toHaveLength(54);
    expect(new Set(batch.rows.map((r) => r.recordId)).size).toBe(54);
  });

  it("keeps the locked breakdown", () => {
    const count = (pick: (r: ReviewRow) => boolean) => batch.rows.filter(pick).length;

    expect(count((r) => r.method === "EXACT")).toBe(30);
    expect(count((r) => r.method === "FUZZY")).toBe(8);
    expect(count((r) => r.category === "TIMING")).toBe(5);
    expect(count((r) => r.category === "REFUND_NETTED")).toBe(4);
    expect(count((r) => r.category === "FEE_DEDUCTION")).toBe(4);
    expect(count((r) => r.category === "PARTIAL_PAYMENT")).toBe(3);
    expect(count((r) => r.category === "UNEXPLAINED")).toBe(0);
    expect(count((r) => r.status === "EXCEPTION")).toBe(16);
  });

  it("joins each verdict back to the settlement row it came from", () => {
    // The amount, the order and the settlement time live on the recon row, not
    // on the classified record. A join that silently missed would show ₹0.00.
    const first = batch.rows.find((r) => r.recordId === "pay_4gaSMyqces2Qkk");

    expect(first).toMatchObject({
      settlementId: "setl_eWCoUGyOugcIkY",
      orderId: "order_wcsCK4S8SEIAmm",
      amountPaise: 149900,
      feePaise: 3538,
      taxPaise: 540,
      settledAt: 1783159200,
    });
    expect(batch.rows.every((r) => Number.isSafeInteger(r.amountPaise))).toBe(true);
    // Only the failed retry legs settled nothing; every other row has money on
    // it, so a wholesale join failure could not hide behind a plausible zero.
    expect(batch.rows.filter((r) => r.amountPaise === 0)).toHaveLength(3);
  });
});

describe("why a row was flagged", () => {
  it("explains every row, in the right voice", () => {
    for (const row of batch.rows) {
      expect(row.explanation.headline.length).toBeGreaterThan(0);
      expect(row.explanation.points.length).toBeGreaterThan(0);

      if (row.status === "EXCEPTION") {
        expect(row.explanation.headline).toMatch(/^Flagged\. /);
      } else {
        expect(row.explanation.headline).toMatch(/^Matched\. /);
      }
    }
  });

  it("never renders a figure it could not compute", () => {
    // `undefined` and `NaN` reach a template literal silently. On a screen of
    // money that a person acts on, they must not survive to the pixels.
    for (const row of batch.rows) {
      for (const line of [row.explanation.headline, ...row.explanation.points]) {
        expect(line).not.toMatch(/NaN|undefined|null|\[object/);
        expect(line).not.toMatch(/₹\s|₹$/);
      }
    }
  });

  it("says the right thing about a fee no rate explains", () => {
    const row = batch.rows.find((r) => r.category === "FEE_DEDUCTION")!;
    const text = row.explanation.points.join(" ");

    expect(text).toContain("2.00% standard");
    expect(text).toContain("2.15% corporate");
    expect(text).toContain("credit at risk");
    // The quoted comparison must be the matcher's own arithmetic, not a
    // restatement of the fee that was charged.
    expect(text).toContain(formatRupees(row.feePaise));
  });

  it("says a late settlement is billed on the next month's return", () => {
    const row = batch.rows.find((r) => r.category === "TIMING")!;
    const text = `${row.explanation.headline} ${row.explanation.points.join(" ")}`;

    expect(row.billedIn).toBe("082026");
    expect(text).toContain("August 2026");
    expect(text).toContain("July 2026");
    expect(text).toContain("IST");
    expect(text).toContain("Nothing is wrong with the fee");
  });

  it("says a netted refund keeps its credit and owes a credit note", () => {
    const row = batch.rows.find((r) => r.category === "REFUND_NETTED")!;
    const text = row.explanation.points.join(" ");

    expect(row.creditNoteReview).toBe(true);
    expect(text).toContain("Section 34");
    expect(text).toContain("stays claimable");
    expect(text).toContain("payment id");
  });

  it("says a failed retry leg was charged nothing", () => {
    const row = batch.rows.find((r) => r.category === "PARTIAL_PAYMENT")!;
    const text = row.explanation.points.join(" ");

    expect(row.amountPaise).toBe(0);
    expect(row.feePaise).toBe(0);
    expect(text).toContain("charged no fee");
    expect(text).toContain(row.orderId);
  });

  it("tells a matched row apart by its confidence tier", () => {
    const exact = batch.rows.find((r) => r.method === "EXACT")!;
    const fuzzy = batch.rows.find((r) => r.method === "FUZZY")!;

    expect(exact.explanation.points.join(" ")).toContain("the match is EXACT");
    expect(fuzzy.explanation.points.join(" ")).toContain("the match is FUZZY");
    expect(fuzzy.explanation.headline).toContain("2.15% corporate");
  });
});
