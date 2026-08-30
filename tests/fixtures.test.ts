import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Integrity checks for the synthetic dataset (PRD Section 13).
 *
 * These deliberately RECOMPUTE every figure from `settlements.json` rather than
 * trusting `expected.json`. The manifest is the matcher's assertion table, so if
 * it ever drifts from the data it describes, every downstream matcher test would
 * pass against a lie. This file is what stops that.
 */

const GST_RATE = 0.18;
const TOLERANCE_PAISE = 100; // the ₹1 match tolerance, exactly
const RATE_CELLS = { STANDARD: 0.02, CORPORATE: 0.0215 } as const;

type Item = {
  entity_id: string;
  type: "payment" | "refund";
  amount: number;
  fee: number;
  tax: number;
  order_id: string;
  payment_id: string | null;
  settlement_id: string;
  settled_at: number;
};

/** A GSTR-2B statement. Note: NOT the GSTR-2A shape — see the schema note below. */
type GStatement = {
  gstin: string;
  rtnprd: string;
  docdata: {
    b2b: {
      ctin: string;
      trdnm: string;
      supprd: string;
      supfildt: string;
      inv: {
        inum: string;
        typ: string;
        dt: string;
        val: number;
        pos: string;
        rev: string;
        itcavl: "Y" | "N";
        rsn: string;
        items: {
          num: number;
          rt: number;
          txval: number;
          igst: number;
          cgst: number;
          sgst: number;
          cess: number;
        }[];
      }[];
    }[];
  };
};

type Expected = {
  entity_id: string;
  status: "MATCHED" | "EXCEPTION";
  match_method: "EXACT" | "FUZZY" | "NONE";
  rate_cell: "STANDARD" | "CORPORATE" | null;
  exception_category: string | null;
  credit_note_review: boolean;
  billed_in: string;
};

const read = (f: string) =>
  JSON.parse(readFileSync(`data/synthetic/${f}`, "utf8"));

const settlements = read("settlements.json") as { count: number; items: Item[] };
// GSTR-2B is generated per return period, so each month is its own statement.
const statements: Record<string, GStatement> = {
  "072026": read("gstr2b-072026.json"),
  "082026": read("gstr2b-082026.json"),
};
const expected = read("expected.json") as {
  total_records: number;
  merchant_gstin: string;
  supplier_gstin: string;
  records: Expected[];
};

const payments = settlements.items.filter((i) => i.type === "payment");
const refunds = settlements.items.filter((i) => i.type === "refund");
const byId = new Map(payments.map((p) => [p.entity_id, p]));

const rupeesToPaise = (r: number) => Math.round(r * 100);
const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);

/** Razorpay's `fee` is inclusive of tax; `tax` is the GST inside it. */
function priceAt(amountPaise: number, rate: number) {
  const mdr = Math.round(amountPaise * rate);
  const tax = Math.round(mdr * GST_RATE);
  return { fee: mdr + tax, tax };
}

/** Which published rate cell explains this fee, if any. */
function resolveCell(item: Item): keyof typeof RATE_CELLS | null {
  // A zero-value row has no fee to explain — it must not resolve to a cell just
  // because 2% of nothing is nothing. The matcher needs this same guard.
  if (item.amount === 0) return null;
  for (const [cell, rate] of Object.entries(RATE_CELLS)) {
    const { fee } = priceAt(item.amount, rate);
    if (Math.abs(fee - item.fee) <= TOLERANCE_PAISE) {
      return cell as keyof typeof RATE_CELLS;
    }
  }
  return null;
}

const invoiceFor = (period: string) => {
  const inv = statements[period].docdata.b2b[0].inv[0];
  const it = inv.items[0];
  return {
    inum: inv.inum,
    itcavl: inv.itcavl,
    rsn: inv.rsn,
    txval: rupeesToPaise(it.txval),
    // Always the sum: a Maharashtra merchant sees CGST+SGST, every other state
    // sees IGST. Keying on one field silently breaks for the other population.
    tax: rupeesToPaise(it.cgst) + rupeesToPaise(it.sgst) + rupeesToPaise(it.igst),
  };
};

/** GSTIN check digit, mod-36 weighted. Catches fabricated identifiers. */
function gstinIsValid(g: string): boolean {
  const A = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g)) return false;
  let total = 0;
  for (let i = 0; i < 14; i++) {
    const p = A.indexOf(g[i]) * (i % 2 ? 2 : 1);
    total += Math.floor(p / 36) + (p % 36);
  }
  return A[(36 - (total % 36)) % 36] === g[14];
}

describe("dataset shape", () => {
  it("has 54 classified payment records", () => {
    expect(payments).toHaveLength(54);
    expect(expected.total_records).toBe(54);
  });

  it("carries refunds as separate rows, not reduced credits", () => {
    expect(refunds).toHaveLength(4);
    expect(settlements.count).toBe(settlements.items.length);
    // Refund rows carry debit and no fee — Razorpay does not return MDR.
    for (const r of refunds) {
      expect(r.fee).toBe(0);
      expect(r.tax).toBe(0);
    }
  });

  it("puts the real id in entity_id, leaving payment_id null on payments", () => {
    for (const p of payments) expect(p.payment_id).toBeNull();
    // Refund rows DO carry payment_id, pointing back at the payment they reverse.
    for (const r of refunds) expect(byId.has(r.payment_id!)).toBe(true);
  });
});

describe("exception distribution", () => {
  it("matches the locked Section 13 breakdown", () => {
    const tally = (key: keyof Expected) =>
      expected.records.reduce<Record<string, number>>((acc, r) => {
        const v = String(r[key]);
        acc[v] = (acc[v] ?? 0) + 1;
        return acc;
      }, {});

    expect(tally("match_method")).toEqual({ EXACT: 30, FUZZY: 8, NONE: 16 });
    expect(tally("exception_category")).toEqual({
      null: 38,
      TIMING: 5,
      REFUND_NETTED: 4,
      FEE_DEDUCTION: 4,
      PARTIAL_PAYMENT: 3,
    });
    // UNEXPLAINED is deliberately 0 — judges see the category exists without
    // the dataset being cherry-picked to avoid it.
    expect(
      expected.records.filter((r) => r.exception_category === "UNEXPLAINED"),
    ).toHaveLength(0);
  });

  it("describes records that actually exist", () => {
    expect(new Set(expected.records.map((r) => r.entity_id)).size).toBe(54);
    for (const r of expected.records) expect(byId.has(r.entity_id)).toBe(true);
  });
});

describe("fee arithmetic", () => {
  it("keeps tax as 18% of the taxable value inside every fee", () => {
    for (const p of payments) {
      const mdr = p.fee - p.tax;
      expect(Math.round(mdr * GST_RATE)).toBe(p.tax);
    }
  });

  it("resolves each record to the rate cell the manifest claims", () => {
    for (const r of expected.records) {
      expect(resolveCell(byId.get(r.entity_id)!)).toBe(r.rate_cell);
    }
  });

  it("leaves no record resolvable to more than one rate cell", () => {
    // Below ~₹564.98 the 2% and 2.15% cells differ by less than the ₹1
    // tolerance, so a fee would satisfy both and the match would depend on
    // which cell the matcher happened to try first. Every amount in the
    // dataset must clear that floor, or "EXACT vs FUZZY" is not deterministic.
    for (const p of payments) {
      if (p.amount === 0) continue;
      const hits = Object.values(RATE_CELLS).filter(
        (rate) => Math.abs(priceAt(p.amount, rate).fee - p.fee) <= TOLERANCE_PAISE,
      );
      expect(hits.length).toBeLessThanOrEqual(1);
    }
  });

  it("resolves exactly 30 at STANDARD-only and 8 that need CORPORATE", () => {
    const cells = payments.map(resolveCell);
    expect(cells.filter((c) => c === "CORPORATE")).toHaveLength(8);
    // 4 FEE_DEDUCTION plus the 3 zero-value retries resolve to no cell at all.
    expect(cells.filter((c) => c === null)).toHaveLength(7);
  });
});

describe("causal structure", () => {
  it("builds PARTIAL_PAYMENT as a zero-value retry sharing an order_id", () => {
    const partials = expected.records
      .filter((r) => r.exception_category === "PARTIAL_PAYMENT")
      .map((r) => byId.get(r.entity_id)!);
    expect(partials).toHaveLength(3);
    for (const p of partials) {
      expect(p.amount).toBe(0);
      expect(p.fee).toBe(0);
      const siblings = payments.filter(
        (q) => q.order_id === p.order_id && q.entity_id !== p.entity_id,
      );
      expect(siblings).toHaveLength(1);
      expect(siblings[0].amount).toBeGreaterThan(0);
    }
  });

  it("builds REFUND_NETTED as a payment with a refund row against it", () => {
    const refunded = expected.records.filter(
      (r) => r.exception_category === "REFUND_NETTED",
    );
    expect(refunded).toHaveLength(4);
    const reversed = new Set(refunds.map((r) => r.payment_id));
    for (const r of refunded) {
      expect(reversed.has(r.entity_id)).toBe(true);
      // The obligation is a Section 34 credit note, never an ITC reversal.
      expect(r.credit_note_review).toBe(true);
    }
    // Nothing else carries the flag.
    expect(expected.records.filter((r) => r.credit_note_review)).toHaveLength(4);
  });

  it("nets refunds into a LATER settlement than the payment they reverse", () => {
    // This is why the join key is payment_id and not settlement_id. A refund is
    // deducted from a subsequent settlement cycle, so joining on settlement_id
    // would find nothing at all. Asserted so nobody "simplifies" it back.
    for (const r of refunds) {
      const payment = byId.get(r.payment_id!)!;
      expect(r.settlement_id).not.toBe(payment.settlement_id);
      expect(r.settled_at).toBeGreaterThan(payment.settled_at);
    }
  });

  it("makes every TIMING record detectable from its settlement date", () => {
    const timing = expected.records.filter(
      (r) => r.exception_category === "TIMING",
    );
    expect(timing).toHaveLength(5);

    for (const t of timing) {
      expect(t.billed_in).toBe("082026");
      // T+2 pushed the settlement past the month end. This is the only cause a
      // deterministic matcher can attribute per record — a GSTR-1A amendment
      // moves ITC to the next period too, but leaves an amended record looking
      // identical to a clean one, so it is not modelled here.
      const settled = new Date(byId.get(t.entity_id)!.settled_at * 1000);
      expect(settled.getUTCMonth()).toBe(7); // August
    }

    // And nothing else settles outside the period, or the rule would overfire.
    const settledInAugust = expected.records.filter(
      (r) => new Date(byId.get(r.entity_id)!.settled_at * 1000).getUTCMonth() === 7,
    );
    expect(settledInAugust).toHaveLength(5);
  });
});

describe("identifiers", () => {
  it("uses GSTINs that pass the check-digit algorithm", () => {
    // 27AAGCR4375J1ZU, used in earlier drafts, fails: it welds Maharashtra's
    // state code to the Karnataka registration's check digit. A judge pasting an
    // invalid GSTIN into the portal is a worse failure than any code bug.
    expect(gstinIsValid(expected.supplier_gstin)).toBe(true);
    expect(gstinIsValid(expected.merchant_gstin)).toBe(true);
    expect(gstinIsValid("27AAGCR4375J1ZU")).toBe(false);

    for (const s of Object.values(statements)) {
      expect(gstinIsValid(s.gstin)).toBe(true);
      for (const b of s.docdata.b2b) expect(gstinIsValid(b.ctin)).toBe(true);
    }
  });
});

describe("GSTR-2B rollup", () => {
  const jul = invoiceFor("072026");
  const aug = invoiceFor("082026");
  const billedIn = (period: string) =>
    expected.records
      .filter((r) => r.billed_in === period)
      .map((r) => byId.get(r.entity_id)!);

  it("carries one Razorpay invoice line per filing period", () => {
    expect(Object.keys(statements)).toHaveLength(2);
    for (const [period, s] of Object.entries(statements)) {
      expect(s.rtnprd).toBe(period);
      expect(s.docdata.b2b).toHaveLength(1);
      expect(s.docdata.b2b[0].ctin).toBe(expected.supplier_gstin);
      expect(s.docdata.b2b[0].inv).toHaveLength(1);
    }
  });

  it("records GSTN's own ITC verdict on every invoice", () => {
    // itcavl is the sixth signal: GSTN saying the credit is not claimable
    // outranks anything Trace infers. A Maharashtra merchant billed by
    // Razorpay's Maharashtra registration with PoS in Maharashtra is eligible,
    // so both statements are "Y" here — but the field must be read, not assumed.
    for (const inv of [jul, aug]) {
      expect(inv.itcavl).toBe("Y");
      expect(inv.rsn).toBe(""); // non-empty rsn only accompanies itcavl "N"
    }
  });

  it("ties each invoice to the records billed in that period", () => {
    for (const [period, inv] of [
      ["072026", jul],
      ["082026", aug],
    ] as const) {
      const rows = billedIn(period);
      expect(inv.tax).toBe(sum(rows.map((r) => r.tax)));
      expect(inv.txval).toBe(sum(rows.map((r) => r.fee - r.tax)));
    }
  });

  it("accounts for every record across the two periods", () => {
    expect(jul.tax + aug.tax).toBe(sum(payments.map((p) => p.tax)));
    expect(billedIn("072026")).toHaveLength(49);
    expect(billedIn("082026")).toHaveLength(5);
  });

  it("leaves a delta equal to the exceptions billed in the period", () => {
    const matched = expected.records
      .filter((r) => r.status === "MATCHED")
      .map((r) => byId.get(r.entity_id)!);
    expect(matched).toHaveLength(38);

    const rolledUp = sum(matched.map((r) => r.tax));
    const exceptionsBilledInJuly = sum(
      expected.records
        .filter((r) => r.status === "EXCEPTION" && r.billed_in === "072026")
        .map((r) => byId.get(r.entity_id)!.tax),
    );

    // The whole reconciliation claim in one assertion: what the 2B invoice says,
    // minus what we matched, is exactly what sits in the exception queue.
    expect(jul.tax - rolledUp).toBe(exceptionsBilledInJuly);
  });
});
