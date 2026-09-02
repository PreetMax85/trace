import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { matchBatch } from "@/lib/matching";
import type { ReconItem } from "@/lib/matching";

const read = (f: string) =>
  JSON.parse(readFileSync(`data/synthetic/${f}`, "utf8"));

const julyStatement = read("gstr2b-072026.json");

/** 14 Jul 2026, comfortably inside the July filing period. */
const IN_JULY = 1784_000_000;

/** 1 Aug 2026 — T+2 on a 30 July payment pushes the settlement past month end. */
const IN_AUGUST = Date.UTC(2026, 7, 1, 10) / 1000;

function payment(over: Partial<ReconItem> = {}): ReconItem {
  return {
    entity_id: "pay_test000000001",
    type: "payment",
    amount: 149900,
    fee: 3538,
    tax: 540,
    debit: 0,
    credit: 146362,
    order_id: "order_test00000001",
    payment_id: null,
    settlement_id: "setl_test00000001",
    settled_at: IN_JULY,
    ...over,
  };
}

/** Refunds are separate rows carrying `debit`, never a reduced `credit`. */
function refund(paymentId: string, over: Partial<ReconItem> = {}): ReconItem {
  return {
    ...payment(),
    entity_id: "rfnd_test00000001",
    type: "refund",
    debit: 890000,
    credit: 0,
    amount: 890000,
    fee: 0,
    tax: 0,
    payment_id: paymentId,
    // A refund is netted into a LATER settlement cycle than the payment it
    // reverses, so it does not share that payment's settlement_id.
    settlement_id: "setl_later0000001",
    settled_at: IN_JULY + 3 * 86_400,
    ...over,
  };
}

describe("tier 1 — exact match", () => {
  it("ties a standard-rate fee settled inside the period to the STANDARD cell", () => {
    // ₹1499.00 at 2% = ₹29.98 MDR, +18% GST = ₹5.40, fee ₹35.38. Literals, not
    // recomputed here: the test must be able to disagree with the matcher.
    const batch = matchBatch({
      settlements: [payment({ amount: 149900, fee: 3538, tax: 540 })],
      statement: julyStatement,
      period: "072026",
      mode: "exact+fuzzy",
    });

    expect(batch.records).toEqual([
      {
        recordId: "pay_test000000001",
        settlementId: "setl_test00000001",
        status: "MATCHED",
        method: "EXACT",
        rateCell: "STANDARD",
        razorpayFeePaise: 3538,
        razorpayTaxPaise: 540,
        expectedFeePaise: 3538,
        expectedTaxPaise: 540,
        category: null,
        creditNoteReview: false,
        billedIn: "072026",
      },
    ]);
  });
});

describe("tier 1 — fuzzy match against an alternate rate cell", () => {
  it("resolves a corporate-card fee to the CORPORATE cell", () => {
    // ₹5600.00 at 2.15% = ₹120.40 MDR, +18% GST = ₹21.67, fee ₹142.07. The
    // STANDARD cell would predict ₹132.16 — ₹9.91 out, nowhere near the ₹1
    // tolerance, so only one cell can explain this row.
    const batch = matchBatch({
      settlements: [payment({ amount: 560000, fee: 14207, tax: 2167 })],
      statement: julyStatement,
      period: "072026",
      mode: "exact+fuzzy",
    });

    expect(batch.records).toEqual([
      {
        recordId: "pay_test000000001",
        settlementId: "setl_test00000001",
        status: "MATCHED",
        method: "FUZZY",
        rateCell: "CORPORATE",
        razorpayFeePaise: 14207,
        razorpayTaxPaise: 2167,
        expectedFeePaise: 14207,
        expectedTaxPaise: 2167,
        category: null,
        creditNoteReview: false,
        billedIn: "072026",
      },
    ]);
  });
});

describe("mode flag", () => {
  const corporateRow = payment({ amount: 560000, fee: 14207, tax: 2167 });

  it("leaves a corporate-card fee unmatched in exact-only mode", () => {
    // The lift this mode buys has to be demonstrable, not asserted: the same
    // row is a clean FUZZY match one mode up. Category is deliberately not
    // asserted here — the classifier does not exist yet.
    const batch = matchBatch({
      settlements: [corporateRow],
      statement: julyStatement,
      period: "072026",
      mode: "exact-only",
    });

    expect(batch.records[0]).toMatchObject({
      status: "EXCEPTION",
      method: "NONE",
      rateCell: null,
      expectedFeePaise: null,
      expectedTaxPaise: null,
    });
  });

  it("still matches a standard-rate fee in exact-only mode", () => {
    const batch = matchBatch({
      settlements: [payment({ amount: 149900, fee: 3538, tax: 540 })],
      statement: julyStatement,
      period: "072026",
      mode: "exact-only",
    });

    expect(batch.records[0]).toMatchObject({
      status: "MATCHED",
      method: "EXACT",
      rateCell: "STANDARD",
    });
  });
});

describe("rate arithmetic is exact, not float-approximate", () => {
  it("prices a half-paise MDR by the stated rounding rule", () => {
    // ₹2850.00 at 2.15% is exactly 6127.5 paise of MDR, so round-half-up gives
    // 6128 and the tax-inclusive fee is 7231. Computed as `285000 * 0.0215` a
    // double yields 6127.499999999999, rounds DOWN to 6127, and the fee comes out
    // 7230. The record matches either way — 1 paise is well inside the ₹1
    // tolerance — so only the expected figure exposes it, and that figure is what
    // the audit trail shows a CA. STANDARD is 505 paise away, so nothing here is
    // ambiguous between cells.
    const batch = matchBatch({
      settlements: [payment({ amount: 285000, fee: 7231, tax: 1103 })],
      statement: julyStatement,
      period: "072026",
      mode: "exact+fuzzy",
    });

    expect(batch.records[0]).toMatchObject({
      status: "MATCHED",
      method: "FUZZY",
      rateCell: "CORPORATE",
      expectedFeePaise: 7231,
      expectedTaxPaise: 1103,
    });
  });
});

describe("ambiguity between rate cells", () => {
  it("refuses to guess when a fee resolves to more than one cell", () => {
    // ₹1000.00: STANDARD prices the fee at 2360, CORPORATE at 2537. A fee of
    // 2449 sits 89 paise from one and 88 from the other, so BOTH explain it
    // within the ₹1 tolerance and nothing but iteration order could pick a
    // winner. Note this is a ₹1000 payment — far above the ₹572.32 floor at
    // which two CORRECT fees stop being distinguishable. Ambiguity is a
    // property of the fee, not of the amount, so the matcher counts resolving
    // cells rather than testing the amount against a threshold.
    const batch = matchBatch({
      settlements: [payment({ amount: 100000, fee: 2449, tax: 374 })],
      statement: julyStatement,
      period: "072026",
      mode: "exact+fuzzy",
    });

    expect(batch.records[0]).toMatchObject({
      status: "EXCEPTION",
      method: "NONE",
      rateCell: null,
      expectedFeePaise: null,
      expectedTaxPaise: null,
      category: "UNEXPLAINED",
    });
  });
});

describe("the ₹1 tolerance", () => {
  // ₹25,000 at 2% is 50000 paise MDR + 9000 GST = a fee of 59000. CORPORATE
  // would be 63425, so nothing here is ambiguous and the boundary is clean.
  // These two assertions exist to pin the tolerance itself: without them the
  // matcher passes its whole suite with the tolerance set to zero, because
  // every other test lands exactly on a cell.
  it("matches a fee exactly 100 paise off the cell", () => {
    const batch = matchBatch({
      settlements: [payment({ amount: 2500000, fee: 59100, tax: 9000 })],
      statement: julyStatement,
      period: "072026",
      mode: "exact+fuzzy",
    });

    expect(batch.records[0]).toMatchObject({
      status: "MATCHED",
      method: "EXACT",
      rateCell: "STANDARD",
      expectedFeePaise: 59000,
    });
  });

  it("rejects a fee 101 paise off the cell", () => {
    const batch = matchBatch({
      settlements: [payment({ amount: 2500000, fee: 59101, tax: 9000 })],
      statement: julyStatement,
      period: "072026",
      mode: "exact+fuzzy",
    });

    expect(batch.records[0]).toMatchObject({
      status: "EXCEPTION",
      method: "NONE",
      rateCell: null,
    });
  });
});

describe("PARTIAL_PAYMENT — a failed-then-retried payment", () => {
  it("classifies the zero-value twin, in either mode", () => {
    // A failed UPI attempt and its successful retry share one order_id. The
    // failed leg settles as a zero-value row: nothing was captured, so nothing
    // was billed. It must not resolve to a rate cell — 2% of nothing is nothing,
    // which is arithmetically true and financially meaningless.
    const retry = payment({
      entity_id: "pay_failedleg0001",
      amount: 0,
      fee: 0,
      tax: 0,
      order_id: "order_shared00001",
    });
    const captured = payment({
      entity_id: "pay_capturedleg01",
      amount: 149900,
      fee: 3538,
      tax: 540,
      order_id: "order_shared00001",
    });

    for (const mode of ["exact+fuzzy", "exact-only"] as const) {
      const batch = matchBatch({
        settlements: [retry, captured],
        statement: julyStatement,
        period: "072026",
        mode,
      });
      const failed = batch.records.find((r) => r.recordId === "pay_failedleg0001");

      expect(failed).toMatchObject({
        status: "EXCEPTION",
        method: "NONE",
        rateCell: null,
        expectedFeePaise: null,
        expectedTaxPaise: null,
        category: "PARTIAL_PAYMENT",
      });
      // The successful capture is billable and matches normally.
      expect(batch.records.find((r) => r.recordId === "pay_capturedleg01")).toMatchObject({
        status: "MATCHED",
        method: "EXACT",
      });
    }
  });

  it("does not call a lone zero-value row a partial payment", () => {
    // No sibling shares its order_id, so nothing makes this a retry. It still
    // must not resolve to a rate cell. This is the case the precedence order
    // does NOT cover, and the one that keeps the zero guard honest: in
    // exact-only mode, without the guard, this row reads MATCHED / EXACT /
    // STANDARD with an expected fee of zero — a fee that was never charged,
    // reported as cleanly reconciled. BUILD-LOG entry 9.
    for (const mode of ["exact+fuzzy", "exact-only"] as const) {
      const batch = matchBatch({
        settlements: [payment({ amount: 0, fee: 0, tax: 0, order_id: "order_orphan0001" })],
        statement: julyStatement,
        period: "072026",
        mode,
      });

      expect(batch.records[0]).toMatchObject({
        status: "EXCEPTION",
        method: "NONE",
        rateCell: null,
        expectedFeePaise: null,
        category: "UNEXPLAINED",
      });
    }
  });
});

describe("REFUND_NETTED — a refund netted into a later settlement", () => {
  it("flags the payment a refund reverses, joining on payment_id", () => {
    // ₹8900.00 at 2% = 17800 MDR + 3204 GST = a fee of 21004 — priced exactly
    // right. The exception is not a pricing error: Razorpay does not return its
    // MDR on a refunded transaction, so the GST on that fee stays claimable and
    // the record keeps its rate cell. What the merchant owes is a credit note to
    // their own customer under Section 34 of the CGST Act.
    const paid = payment({
      entity_id: "pay_refunded00001",
      amount: 890000,
      fee: 21004,
      tax: 3204,
      settlement_id: "setl_original0001",
    });

    const batch = matchBatch({
      settlements: [paid, refund("pay_refunded00001")],
      statement: julyStatement,
      period: "072026",
      mode: "exact+fuzzy",
    });

    // The refund row is not itself a classified record.
    expect(batch.records).toHaveLength(1);
    expect(batch.records[0]).toMatchObject({
      status: "EXCEPTION",
      method: "NONE",
      rateCell: "STANDARD",
      expectedFeePaise: 21004,
      expectedTaxPaise: 3204,
      category: "REFUND_NETTED",
      creditNoteReview: true,
    });
  });

  it("finds the reversal even though the settlement ids differ", () => {
    // The whole point of the join key. Joining on settlement_id would match
    // nothing at all, and would look correct while finding 0 of 4.
    const paid = payment({ entity_id: "pay_refunded00002", settlement_id: "setl_aaaaaaaaaaa1" });
    const batch = matchBatch({
      settlements: [
        paid,
        refund("pay_refunded00002", { settlement_id: "setl_bbbbbbbbbbb2" }),
      ],
      statement: julyStatement,
      period: "072026",
      mode: "exact+fuzzy",
    });

    expect(batch.records[0].category).toBe("REFUND_NETTED");
  });
});

describe("TIMING — a settlement that crossed the month boundary", () => {
  it("bills a settlement that landed in August against August's GSTR-2B", () => {
    // ₹7800.00 at 2% = 15600 MDR + 2808 GST = 18408. Priced correctly, settled
    // late: T+2 on a payment taken near month end lands the settlement in the
    // next filing period, so Razorpay invoices the fee on the FOLLOWING month's
    // statement. Expected behaviour, not an error — but the July rollup must not
    // count it, or the delta stops meaning anything.
    const batch = matchBatch({
      settlements: [
        payment({ amount: 780000, fee: 18408, tax: 2808, settled_at: IN_AUGUST }),
      ],
      statement: julyStatement,
      period: "072026",
      mode: "exact+fuzzy",
    });

    expect(batch.records[0]).toMatchObject({
      status: "EXCEPTION",
      method: "NONE",
      rateCell: "STANDARD",
      expectedFeePaise: 18408,
      category: "TIMING",
      creditNoteReview: false,
      billedIn: "082026",
    });
  });

  it("leaves an in-period settlement billed in its own period", () => {
    const batch = matchBatch({
      settlements: [payment({ amount: 149900, fee: 3538, tax: 540, settled_at: IN_JULY })],
      statement: julyStatement,
      period: "072026",
      mode: "exact+fuzzy",
    });

    expect(batch.records[0]).toMatchObject({
      status: "MATCHED",
      category: null,
      billedIn: "072026",
    });
  });
});

describe("filing periods are Indian calendar months", () => {
  // A Unix timestamp is an absolute instant with no timezone in it. The
  // timezone belongs to the reading, and a GST return period is a calendar
  // month *in India* — GSTR-2B for July covers 1–31 July IST. Reading these
  // instants as UTC mislabels every settlement in the last 5½ hours of a month,
  // which is exactly the window T+2 settlements crowd into.
  const lastInstantOfJulyIST = Date.UTC(2026, 6, 31, 18, 29, 59) / 1000;
  const firstInstantOfAugustIST = Date.UTC(2026, 6, 31, 18, 30, 0) / 1000;

  const run = (settledAt: number) =>
    matchBatch({
      settlements: [payment({ amount: 780000, fee: 18408, tax: 2808, settled_at: settledAt })],
      statement: julyStatement,
      period: "072026",
      mode: "exact+fuzzy",
    }).records[0];

  it("keeps 23:59:59 IST on 31 July inside the July period", () => {
    expect(run(lastInstantOfJulyIST)).toMatchObject({
      status: "MATCHED",
      category: null,
      billedIn: "072026",
    });
  });

  it("moves 00:00:00 IST on 1 August into the August period", () => {
    // 18:30 UTC. Read as UTC this is still 31 July and looks perfectly in
    // period; read in IST it is next month's invoice.
    expect(run(firstInstantOfAugustIST)).toMatchObject({
      status: "EXCEPTION",
      method: "NONE",
      category: "TIMING",
      billedIn: "082026",
    });
  });
});

describe("FEE_DEDUCTION — a fee no published rate explains", () => {
  it("classifies a fee that ties to neither cell", () => {
    // ₹12,500.00 charged a fee of ₹368.75, of which ₹56.25 is GST — an MDR of
    // ₹312.50, an effective rate of 2.5%. STANDARD would be ₹295.00 and
    // CORPORATE ₹317.13, so the row misses one by ₹73.75 and the other by
    // ₹51.62. No rate cell explains it, so there is no cell to record.
    const batch = matchBatch({
      settlements: [payment({ amount: 1250000, fee: 36875, tax: 5625 })],
      statement: julyStatement,
      period: "072026",
      mode: "exact+fuzzy",
    });

    expect(batch.records[0]).toMatchObject({
      status: "EXCEPTION",
      method: "NONE",
      rateCell: null,
      expectedFeePaise: null,
      expectedTaxPaise: null,
      category: "FEE_DEDUCTION",
      creditNoteReview: false,
    });
  });

  it("flags a fee that is too LOW as readily as one that is too high", () => {
    // ₹24,000.00 at an effective 1.75% — under the standard rate. Being
    // undercharged is still an unexplained deduction: the ITC claimed has to
    // match an invoice Razorpay actually issued, whichever way the error runs.
    const batch = matchBatch({
      settlements: [payment({ amount: 2400000, fee: 49560, tax: 7560 })],
      statement: julyStatement,
      period: "072026",
      mode: "exact+fuzzy",
    });

    expect(batch.records[0]).toMatchObject({
      category: "FEE_DEDUCTION",
      rateCell: null,
    });
  });
});

describe("the whole fixture against the manifest", () => {
  /**
   * The only test here whose expected values were not chosen by the same person
   * who wrote the matcher. `expected.json` is the assertion table the dataset
   * was built around, and `tests/fixtures.test.ts` independently recomputes it
   * from `settlements.json`, so agreement here is worth something.
   *
   * `timing_cause: "T+2"` appears on TIMING rows in the manifest and is
   * deliberately NOT compared: the `records` table has no column for it, and
   * PRD §7 gives T+2 as the only per-record-detectable cause anyway. Widening
   * the schema to absorb a fixture field would be the tail wagging the dog.
   */
  const allSettlements = read("settlements.json").items as ReconItem[];
  const manifest = read("expected.json") as {
    total_records: number;
    records: {
      entity_id: string;
      status: string;
      match_method: string;
      rate_cell: string | null;
      exception_category: string | null;
      credit_note_review: boolean;
      billed_in: string;
    }[];
  };

  const runAll = (mode: "exact+fuzzy" | "exact-only") =>
    matchBatch({
      settlements: allSettlements,
      statement: julyStatement,
      period: "072026",
      mode,
    });

  it("classifies all 54 records exactly as the manifest says", () => {
    const batch = runAll("exact+fuzzy");
    expect(batch.records).toHaveLength(manifest.total_records);

    const mine = new Map(batch.records.map((r) => [r.recordId, r]));
    for (const want of manifest.records) {
      const got = mine.get(want.entity_id);
      expect(got, `no record produced for ${want.entity_id}`).toBeDefined();
      expect(
        {
          status: got!.status,
          method: got!.method,
          rateCell: got!.rateCell,
          category: got!.category,
          creditNoteReview: got!.creditNoteReview,
          billedIn: got!.billedIn,
        },
        `record ${want.entity_id}`,
      ).toEqual({
        status: want.status,
        method: want.match_method,
        rateCell: want.rate_cell,
        category: want.exception_category,
        creditNoteReview: want.credit_note_review,
        billedIn: want.billed_in,
      });
    }
  });

  it("reproduces the locked Section 13 breakdown", () => {
    const batch = runAll("exact+fuzzy");
    const tally = (key: "method" | "category") =>
      batch.records.reduce<Record<string, number>>((acc, r) => {
        const v = String(r[key]);
        acc[v] = (acc[v] ?? 0) + 1;
        return acc;
      }, {});

    expect(tally("method")).toEqual({ EXACT: 30, FUZZY: 8, NONE: 16 });
    expect(tally("category")).toEqual({
      null: 38,
      TIMING: 5,
      REFUND_NETTED: 4,
      FEE_DEDUCTION: 4,
      PARTIAL_PAYMENT: 3,
    });
    expect(batch.records.filter((r) => r.creditNoteReview)).toHaveLength(4);
    // 38/54 = 70.4%, the match rate claimed for the full pass.
    expect(batch.records.filter((r) => r.status === "MATCHED")).toHaveLength(38);
  });

  it("shows the lift: exact-only reconciles 30, not 38", () => {
    const batch = runAll("exact-only");
    // The 8 corporate-card rows are not mispriced — they are billed at a cell
    // this mode does not consider, so it can only report them as fees it cannot
    // explain. That IS the lift: turning 8 apparent billing errors into matches.
    expect(batch.records.filter((r) => r.status === "MATCHED")).toHaveLength(30);
    expect(batch.records.filter((r) => r.method === "FUZZY")).toHaveLength(0);

    const corporate = new Set(
      manifest.records.filter((r) => r.rate_cell === "CORPORATE").map((r) => r.entity_id),
    );
    expect(corporate.size).toBe(8);
    for (const r of batch.records.filter((x) => corporate.has(x.recordId))) {
      expect(r.category).toBe("FEE_DEDUCTION");
      expect(r.rateCell).toBeNull();
    }
  });
});

describe("input the fixture never contains", () => {
  it("refuses a batch containing the same record twice", () => {
    // Ingestion paging over the recon API with an overlapping window produces
    // this, and it is invisible: two records, both matching, and a rollup
    // inflated by one record's tax. Inflated ITC is the direction that earns a
    // merchant a notice, so this fails loudly rather than being silently deduped.
    const dup = payment({ entity_id: "pay_duplicated001" });
    expect(() =>
      matchBatch({
        settlements: [dup, { ...dup }],
        statement: julyStatement,
        period: "072026",
        mode: "exact+fuzzy",
      }),
    ).toThrow(/pay_duplicated001/);
  });

  it("refuses a statement that is not the claimed period's", () => {
    // The statement carries its own return period. Reconciling July's
    // settlements against July's statement while claiming August produced 42
    // TIMING records and no error at all.
    expect(() =>
      matchBatch({
        settlements: [payment()],
        statement: julyStatement,
        period: "082026",
        mode: "exact+fuzzy",
      }),
    ).toThrow(/072026/);
  });

  it("will not call a zero-value row that was charged a fee a partial payment", () => {
    // PARTIAL_PAYMENT tells the user "only the successful capture is billable".
    // That is a false statement about a row carrying a ₹35.38 fee, and it would
    // drop that fee's GST out of the rollup with no explanation attached.
    const batch = matchBatch({
      settlements: [
        payment({ entity_id: "pay_captured00001", order_id: "order_shared00001" }),
        payment({
          entity_id: "pay_billedfailure",
          order_id: "order_shared00001",
          amount: 0,
          fee: 3538,
          tax: 540,
        }),
      ],
      statement: julyStatement,
      period: "072026",
      mode: "exact+fuzzy",
    });

    expect(batch.records.find((r) => r.recordId === "pay_billedfailure")).toMatchObject({
      status: "EXCEPTION",
      method: "NONE",
      rateCell: null,
      category: "UNEXPLAINED",
    });
  });
});

describe("tier 2 — the period rollup against GSTR-2B", () => {
  const allSettlements = read("settlements.json").items as ReconItem[];
  const manifest = read("expected.json") as {
    records: { entity_id: string; status: string; billed_in: string }[];
  };
  const bySettlementId = new Map(
    allSettlements.filter((i) => i.type === "payment").map((i) => [i.entity_id, i]),
  );

  it("reads GSTN's own ITC verdict off the statement", () => {
    // The sixth signal. GSTR-2B states per document whether the credit is
    // available and why not, and that is the GOVERNMENT's verdict — it outranks
    // anything Trace infers. A record can match perfectly and still be ITC at
    // risk. It is a batch-level flag, not a sixth exception category, because
    // the verdict is carried by the invoice and one invoice covers the period.
    const eligible = matchBatch({
      settlements: [payment()],
      statement: julyStatement,
      period: "072026",
      mode: "exact+fuzzy",
    });
    expect(eligible.itc).toEqual({ available: true, reason: null });

    // Not in the fixture by design: a Maharashtra merchant billed by Razorpay's
    // Maharashtra registration with place of supply in Maharashtra genuinely IS
    // eligible, and fabricating an ineligible line would be dishonest data. So
    // the path is exercised here instead.
    const blocked = structuredClone(julyStatement);
    blocked.docdata.b2b[0].inv[0].itcavl = "N";
    blocked.docdata.b2b[0].inv[0].rsn = "POS and supplier state are the same, but recipient is registered in another state";

    const atRisk = matchBatch({
      settlements: [payment()],
      statement: blocked,
      period: "072026",
      mode: "exact+fuzzy",
    });
    expect(atRisk.itc.available).toBe(false);
    expect(atRisk.itc.reason).toMatch(/recipient is registered in another state/);
    // The records themselves are untouched — matched is still matched.
    expect(atRisk.records[0].status).toBe("MATCHED");
  });

  it("ties the July invoice to the records billed in July", () => {
    // The claim the whole reconciliation rests on. Not "we matched 54 rows to 54 rows" —
    // Razorpay does not bill per row. GSTR-2B carries ONE consolidated Razorpay
    // invoice for the period, and the reconciliation is only meaningful if what
    // that invoice says, minus what we could explain, is exactly what is sitting
    // in the exception queue.
    const batch = matchBatch({
      settlements: allSettlements,
      statement: julyStatement,
      period: "072026",
      mode: "exact+fuzzy",
    });

    expect(batch.rollup).toEqual({
      gstr2bInvoiceTxvalPaise: 664945,
      gstr2bInvoiceTaxPaise: 119692,
      rolledUpTaxPaise: 85587,
      rollupDeltaPaise: 34105,
    });

    // And the delta is not merely a number that happens to be 34105 — it is the
    // tax on the exceptions billed in this same period, computed here from the
    // manifest and the raw settlement rows rather than from anything the
    // matcher produced.
    const exceptionTaxBilledInJuly = manifest.records
      .filter((r) => r.status === "EXCEPTION" && r.billed_in === "072026")
      .reduce((total, r) => total + bySettlementId.get(r.entity_id)!.tax, 0);

    expect(batch.rollup.rollupDeltaPaise).toBe(exceptionTaxBilledInJuly);
  });

  it("leaves August's invoice fully explained by the five TIMING records", () => {
    // The other half of the TIMING story. Those five fees were never July's to
    // explain; they are billed on August's invoice, and against THAT period they
    // reconcile exactly — delta zero, nothing left over.
    const batch = matchBatch({
      settlements: allSettlements,
      statement: read("gstr2b-082026.json"),
      period: "082026",
      mode: "exact+fuzzy",
    });

    expect(batch.rollup.gstr2bInvoiceTaxPaise).toBe(19530);
    expect(batch.rollup.rolledUpTaxPaise).toBe(19530);
    expect(batch.rollup.rollupDeltaPaise).toBe(0);
    expect(batch.records.filter((r) => r.status === "MATCHED")).toHaveLength(5);
  });
});

describe("tier 2 — statements the fixture cannot produce", () => {
  /** A minimal one-line GSTR-2B for a period, in rupees as GSTN publishes it. */
  const statementWith = (
    line: { txval: number; cgst?: number; sgst?: number; igst?: number },
    period = "072026",
  ) => ({
    gstin: "27TESTM1234A1Z0",
    rtnprd: period,
    docdata: {
      b2b: [
        {
          ctin: "27AAGCR4375J1ZY",
          inv: [
            {
              inum: "RZP/TAX/2026-07/0041882",
              itcavl: "Y" as const,
              rsn: "",
              items: [{ txval: line.txval, cgst: line.cgst ?? 0, sgst: line.sgst ?? 0, igst: line.igst ?? 0 }],
            },
          ],
        },
      ],
    },
  });

  it("totals an inter-state invoice, where the tax is all IGST", () => {
    // The fixture merchant is in Maharashtra and Razorpay bills them from its
    // Maharashtra registration, so every rupee of tax in it is CGST+SGST and
    // IGST is always zero. Any merchant outside Maharashtra sees the mirror
    // image — tax entirely in IGST — and reading only the two intra-state heads
    // would report their invoice as carrying no tax at all.
    const batch = matchBatch({
      settlements: read("settlements.json").items as ReconItem[],
      statement: statementWith({ txval: 6649.45, igst: 1196.92 }),
      period: "072026",
      mode: "exact+fuzzy",
    });

    expect(batch.rollup.gstr2bInvoiceTaxPaise).toBe(119692);
    expect(batch.rollup.rolledUpTaxPaise).toBe(85587);
    expect(batch.rollup.rollupDeltaPaise).toBe(34105);
  });

  it("converts rupees to paise by rounding, not truncating", () => {
    // ₹8.29 × 100 evaluates to 828.9999999999999 in IEEE-754. Truncating loses a
    // paise per line, silently and only on some values — the same fault as
    // BUILD-LOG entry 12, on the statement side of the reconciliation.
    const batch = matchBatch({
      settlements: [],
      statement: statementWith({ txval: 46.06, cgst: 8.29, sgst: 8.29 }),
      period: "072026",
      mode: "exact+fuzzy",
    });

    expect(batch.rollup.gstr2bInvoiceTaxPaise).toBe(1658);
    expect(batch.rollup.gstr2bInvoiceTxvalPaise).toBe(4606);
  });

  it("rolls up what was actually charged, not what the rate card expected", () => {
    // A fee 89 paise off the STANDARD cell still matches — that is what the ₹1
    // tolerance is for — but its GST is 9014, not the 9000 the cell predicts.
    // The invoice bills what was charged, so the rollup must sum the charge.
    // Summing expectations instead would drift by exactly the tolerance the
    // matcher grants, and the delta would stop meaning anything.
    const batch = matchBatch({
      settlements: [payment({ amount: 2500000, fee: 59089, tax: 9014 })],
      statement: statementWith({ txval: 500.75, cgst: 45.07, sgst: 45.07 }),
      period: "072026",
      mode: "exact+fuzzy",
    });

    expect(batch.records[0]).toMatchObject({
      status: "MATCHED",
      method: "EXACT",
      razorpayTaxPaise: 9014,
      expectedTaxPaise: 9000,
    });
    expect(batch.rollup.rolledUpTaxPaise).toBe(9014);
    expect(batch.rollup.rollupDeltaPaise).toBe(0);
  });
});

/**
 * Backlog finding 4. `invoiceTotals` summed every supplier in `docdata.b2b`
 * into "the Razorpay invoice". A merchant's real GSTR-2B carries every supplier
 * who filed against their GSTIN, so this is not an exotic input — it is the
 * normal one. A single extra vendor took July's invoice tax from 119692 to
 * 1919692, and the delta with it.
 */
describe("the rollup's scope rests on the classifier, not on its own filter", () => {
  // Found by mutation: dropping `billedIn === period` from the rollup filter
  // breaks nothing, because `classify` calls every out-of-period row TIMING
  // before it ever looks at the fee — so MATCHED already implies in-period.
  // The filter is not wrong, it is currently unreachable, and the coupling is
  // invisible from either side. Asserted here so that reordering the classifier
  // fails a test rather than quietly moving another month's fees into this
  // period's claimed ITC.
  it("never matches a record billed outside the batch's own period", () => {
    for (const period of ["072026", "082026"]) {
      const batch = matchBatch({
        settlements: read("settlements.json").items as ReconItem[],
        statement: read(`gstr2b-${period}.json`),
        period,
        mode: "exact+fuzzy",
      });

      const matched = batch.records.filter((r) => r.status === "MATCHED");
      expect(matched.length).toBeGreaterThan(0);
      expect(matched.every((r) => r.billedIn === period)).toBe(true);
    }
  });
});

describe("tier 2 — the statement carries suppliers other than Razorpay", () => {
  /** The July statement with one more vendor's invoice filed against it. */
  const withSecondSupplier = (over: Record<string, unknown> = {}) => {
    const s = structuredClone(julyStatement);
    s.docdata.b2b.push({
      ctin: "27AABCU9603R1ZM",
      trdnm: "SOME OTHER VENDOR PRIVATE LIMITED",
      inv: [
        {
          inum: "OV/2026-07/117",
          val: 21240,
          itcavl: "Y",
          rsn: "",
          items: [{ num: 1, rt: 18, txval: 18000, igst: 0, cgst: 1620, sgst: 1620, cess: 0 }],
          ...over,
        },
      ],
    });
    return s;
  };

  const july = (statement: unknown) =>
    matchBatch({
      settlements: read("settlements.json").items as ReconItem[],
      statement: statement as typeof julyStatement,
      period: "072026",
      mode: "exact+fuzzy",
    });

  it("totals only Razorpay's own invoice", () => {
    const batch = july(withSecondSupplier());

    expect(batch.rollup).toEqual({
      gstr2bInvoiceTxvalPaise: 664945,
      gstr2bInvoiceTaxPaise: 119692,
      rolledUpTaxPaise: 85587,
      rollupDeltaPaise: 34105,
    });
  });

  it("distinguishes Razorpay's registrations from each other, not just from other vendors", () => {
    // Found by mutation: comparing everything after the state code passed every
    // other assertion here, because the second supplier is a different company.
    // A GSTIN is a two-digit STATE code, then the company's ten-character PAN,
    // then an entity code, `Z` and a check digit — so one company registered in
    // two states has two GSTINs differing ONLY in those first two digits. That
    // is Razorpay's actual situation, and the registration that billed the
    // merchant is what decides whether the tax is CGST+SGST or IGST. Summing
    // the Karnataka invoice into a Maharashtra reconciliation is the same
    // hundredfold-style error with a far more plausible cause.
    const otherState = structuredClone(julyStatement);
    otherState.docdata.b2b.push({
      // Identical to Razorpay's Maharashtra CTIN in every character but the
      // state code, deliberately: that is the only difference between two
      // registrations of one company, and it is the whole test.
      ctin: "29AAGCR4375J1ZY",
      inv: [
        {
          inum: "RZP/TAX/2026-07/0041999",
          val: 21240,
          itcavl: "Y",
          rsn: "",
          items: [{ num: 1, rt: 18, txval: 18000, igst: 3240, cgst: 0, sgst: 0, cess: 0 }],
        },
      ],
    });

    expect(july(otherState).rollup.gstr2bInvoiceTaxPaise).toBe(119692);
  });

  it("lets a merchant billed from another of Razorpay's registrations say so", () => {
    // The escape hatch the default constant needs. A merchant outside
    // Maharashtra is billed by whichever Razorpay registration serves them, and
    // their statement carries that CTIN — with the tax entirely in IGST, since
    // supplier and recipient are then in different states.
    const karnataka = structuredClone(julyStatement);
    karnataka.docdata.b2b[0].ctin = "29AAGCR4375J1ZY";
    karnataka.docdata.b2b[0].inv[0].items[0] = {
      num: 1,
      rt: 18,
      txval: 6649.45,
      igst: 1196.92,
      cgst: 0,
      sgst: 0,
      cess: 0,
    };

    expect(() => july(karnataka)).toThrow(/27AAGCR4375J1ZY/);

    const batch = matchBatch({
      settlements: read("settlements.json").items as ReconItem[],
      statement: karnataka,
      period: "072026",
      mode: "exact+fuzzy",
      supplierGstin: "29AAGCR4375J1ZY",
    });

    expect(batch.rollup.gstr2bInvoiceTaxPaise).toBe(119692);
    expect(batch.rollup.rollupDeltaPaise).toBe(34105);
  });

  it("reads GSTN's verdict off Razorpay's invoice, not off another vendor's", () => {
    // The same scoping failure with a different symptom: one blocked invoice
    // from an unrelated supplier would report the whole Razorpay invoice as
    // ineligible, and the ITC split downstream writes off every rupee of it.
    const blocked = july(withSecondSupplier({ itcavl: "N", rsn: "Section 16(4) time bar" }));

    expect(blocked.itc).toEqual({ available: true, reason: null });
  });

  it("refuses a statement with no Razorpay invoice at all, rather than totalling zero", () => {
    // The failure the filter itself could introduce. A statement filed by other
    // suppliers only would total to a zero invoice and report the merchant as
    // claiming credit the government never billed — the same nonsense an empty
    // b2b table produces, arrived at from the other side.
    const noRazorpay = structuredClone(julyStatement);
    noRazorpay.docdata.b2b[0].ctin = "27AABCU9603R1ZM";

    expect(() => july(noRazorpay)).toThrow(/27AAGCR4375J1ZY|Razorpay/);
  });
});
