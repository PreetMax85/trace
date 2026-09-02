import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { toBatchRow, toRecordRows } from "@/lib/audit/rows";
import type { batches, records } from "@/lib/audit/schema";
import { parseSettlements, parseStatement } from "@/lib/ingestion";
import { matchBatch } from "@/lib/matching";
import type { BatchResult, MatchedRecord } from "@/lib/matching";

const rawText = (f: string) => readFileSync(`data/synthetic/${f}`, "utf8");

const july = (): BatchResult =>
  matchBatch({
    settlements: parseSettlements(rawText("settlements.json")),
    statement: parseStatement(rawText("gstr2b-072026.json")),
    period: "072026",
    mode: "exact+fuzzy",
  });

const meta = {
  merchantGstin: "27TESTM1234A1Z0",
  period: "072026",
  processingTimeMs: 42,
  startedAt: new Date("2026-08-14T04:30:00.000Z"),
  completedAt: new Date("2026-08-14T04:30:00.042Z"),
};

const BATCH_ID = "b7f3f4c8-0000-4000-8000-000000000001";

/** A classified record, for shapes the 54-row fixture cannot produce. */
const record = (over: Partial<MatchedRecord> = {}): MatchedRecord => ({
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
  ...over,
});

describe("the batch row", () => {
  it("carries the counts, the rollup and GSTN's verdict", () => {
    const row = toBatchRow(july(), meta);

    // 30 / 8 / 16 is the locked breakdown: the merchant's own rate held on 30,
    // another published cell explained 8, and 16 are the exception queue.
    expect(row.totalRecords).toBe(54);
    expect(row.matchedExact).toBe(30);
    expect(row.matchedFuzzy).toBe(8);
    expect(row.exceptions).toBe(16);
    // Every record is in exactly one of the three buckets — no record counted
    // twice, none dropped.
    expect(row.matchedExact! + row.matchedFuzzy! + row.exceptions!).toBe(row.totalRecords);

    expect(row).toMatchObject({
      merchantGstin: "27TESTM1234A1Z0",
      period: "072026",
      gstr2bInvoiceTxvalPaise: 664945,
      gstr2bInvoiceTaxPaise: 119692,
      rolledUpTaxPaise: 85587,
      rollupDeltaPaise: 34105,
      gstr2bItcAvailable: true,
      gstr2bItcReason: null,
      processingTimeMs: 42,
    });
  });

  it("splits ITC into claimable and at risk on GSTN's verdict, not on ours", () => {
    // While `itcavl` is "Y", claimable is the matched rollup PLUS the tax on
    // the netted refunds this invoice bills — those are priced at a rate a cell
    // explains, and are exceptions only because the merchant owes its customer
    // a Section 34 credit note, which is an output-side obligation that leaves
    // the input credit alone. At risk is what the invoice bills beyond that:
    // here, exactly the four fee deductions nothing explained. The moment GSTN
    // marks the invoice "N" the whole invoice is blocked on the government's
    // authority, however cleanly the records matched, so at risk is the FULL
    // invoice tax and claimable is zero.
    const eligible = toBatchRow(july(), meta);
    expect(eligible.itcClaimablePaise).toBe(98223); // 85587 rollup + 12636 refunds
    expect(eligible.itcAtRiskPaise).toBe(21469); // the 4 FEE_DEDUCTION rows
    // Not the delta: the delta still carries the refunds, and reporting it as
    // at-risk would call credit doubtful that this project has decided is good.
    expect(eligible.itcAtRiskPaise).not.toBe(eligible.rollupDeltaPaise);
    // The two halves account for the whole invoice while the credit is live.
    expect(eligible.itcClaimablePaise! + eligible.itcAtRiskPaise!).toBe(
      eligible.gstr2bInvoiceTaxPaise,
    );

    const blockedStatement = JSON.parse(rawText("gstr2b-072026.json"));
    blockedStatement.docdata.b2b[0].inv[0].itcavl = "N";
    blockedStatement.docdata.b2b[0].inv[0].rsn =
      "POS and supplier state are the same, but recipient is registered in another state";

    const blocked = toBatchRow(
      matchBatch({
        settlements: parseSettlements(rawText("settlements.json")),
        statement: parseStatement(blockedStatement),
        period: "072026",
        mode: "exact+fuzzy",
      }),
      meta,
    );

    expect(blocked.itcClaimablePaise).toBe(0);
    expect(blocked.itcAtRiskPaise).toBe(119692);
    expect(blocked.gstr2bItcAvailable).toBe(false);
    expect(blocked.gstr2bItcReason).toMatch(/registered in another state/);
    // The records are untouched by the verdict — matched is still matched.
    expect(blocked.matchedExact).toBe(30);
  });

  it("credits a netted refund only to the period whose invoice bills it", () => {
    // The scoping that is easy to drop. A refund netted into a settlement that
    // landed in the NEXT month is on the next month's Razorpay invoice, so
    // crediting it here would claim the same input tax in two periods.
    const moved = july();
    const refund = moved.records.find((r) => r.category === "REFUND_NETTED");
    expect(refund).toBeDefined();
    refund!.billedIn = "082026";

    const row = toBatchRow(moved, meta);
    expect(row.itcClaimablePaise).toBe(98223 - refund!.razorpayTaxPaise);
    expect(row.itcClaimablePaise! + row.itcAtRiskPaise!).toBe(row.gstr2bInvoiceTaxPaise);
  });

  it("credits only REFUND_NETTED — an unexplained fee stays at risk", () => {
    // Recategorising the four refunds as FEE_DEDUCTION must move their tax back
    // out of claimable. Without this, a filter on "any exception billed in the
    // period" would pass every other assertion here.
    const relabelled = july();
    for (const r of relabelled.records) {
      if (r.category === "REFUND_NETTED") r.category = "FEE_DEDUCTION";
    }
    const row = toBatchRow(relabelled, meta);
    expect(row.itcClaimablePaise).toBe(85587);
    expect(row.itcAtRiskPaise).toBe(34105);
  });

  it("leaves August alone — nothing is netted against that invoice", () => {
    const august = matchBatch({
      settlements: parseSettlements(rawText("settlements.json")),
      statement: parseStatement(rawText("gstr2b-082026.json")),
      period: "082026",
      mode: "exact+fuzzy",
    });
    const row = toBatchRow(august, { ...meta, period: "082026" });
    expect(row.itcClaimablePaise).toBe(19530);
    expect(row.itcAtRiskPaise).toBe(0);
  });

  it("counts the buckets off `status`, never off a proxy for it", () => {
    // The mapping takes a BatchResult, so this can be handed a shape the
    // matcher cannot currently produce — and that is the point. Today
    // `method === "NONE"` and `category !== null` both hold for exactly the
    // EXCEPTION records, so counting on either agrees with counting on status,
    // and two injected faults doing exactly that survived the whole suite. If
    // the matcher ever keeps the resolved cell on an exception (a netted refund
    // DOES resolve cleanly to STANDARD — only the verdict changes), counting on
    // the proxy would quietly inflate the matched figure on a slide.
    const handBuilt: BatchResult = {
      period: "072026",
      records: [
        record({ recordId: "pay_1", status: "MATCHED", method: "EXACT" }),
        record({ recordId: "pay_2", status: "MATCHED", method: "FUZZY", rateCell: "CORPORATE" }),
        record({ recordId: "pay_3", status: "EXCEPTION", method: "NONE", category: "TIMING" }),
        record({ recordId: "pay_4", status: "EXCEPTION", method: "EXACT", category: null }),
      ],
      rollup: {
        gstr2bInvoiceTxvalPaise: 1000,
        gstr2bInvoiceTaxPaise: 180,
        rolledUpTaxPaise: 100,
        rollupDeltaPaise: 80,
      },
      itc: { available: true, reason: null },
    };

    const row = toBatchRow(handBuilt, meta);
    expect(row.totalRecords).toBe(4);
    expect(row.matchedExact).toBe(1);
    expect(row.matchedFuzzy).toBe(1);
    expect(row.exceptions).toBe(2);
  });

  it("is assignable to the table's own insert type", () => {
    // Drizzle's inferred type, so a schema change breaks the build rather than
    // the demo. `satisfies` and not a cast: a cast would silence exactly the
    // error this line exists to raise.
    const row = toBatchRow(july(), meta) satisfies typeof batches.$inferInsert;
    expect(row.startedAt).toEqual(meta.startedAt);
    expect(row.completedAt).toEqual(meta.completedAt);
  });
});

describe("the record rows", () => {
  it("writes one row per classified record, keyed to the batch", () => {
    const rows = toRecordRows(july(), BATCH_ID);

    expect(rows).toHaveLength(54);
    expect(new Set(rows.map((r) => r.batchId))).toEqual(new Set([BATCH_ID]));
    expect(new Set(rows.map((r) => r.recordId)).size).toBe(54);
  });

  it("copies the matcher's verdict field for field", () => {
    const result = july();
    const rows = toRecordRows(result, BATCH_ID);
    const matched = result.records.find((r) => r.status === "MATCHED")!;

    expect(rows.find((r) => r.recordId === matched.recordId)).toEqual({
      batchId: BATCH_ID,
      recordId: matched.recordId,
      settlementId: matched.settlementId,
      period: matched.billedIn,
      razorpayFeePaise: matched.razorpayFeePaise,
      razorpayTaxPaise: matched.razorpayTaxPaise,
      rateCell: matched.rateCell,
      expectedFeePaise: matched.expectedFeePaise,
      expectedTaxPaise: matched.expectedTaxPaise,
      status: matched.status,
      method: matched.method,
      category: matched.category,
      creditNoteReview: matched.creditNoteReview,
    });
  });

  it("stores the period that BILLS the record, not the batch's period", () => {
    // A TIMING record settled after the month end is billed on the FOLLOWING
    // month's invoice, and `billed_in` is the only per-record period fact there
    // is. Writing the batch's period onto every row would copy a batch fact
    // 54 times and lose the one thing that distinguishes a TIMING record.
    const result = july();
    const rows = toRecordRows(result, BATCH_ID);
    const timing = result.records.filter((r) => r.category === "TIMING");

    expect(timing).toHaveLength(5);
    for (const record of timing) {
      expect(rows.find((r) => r.recordId === record.recordId)!.period).toBe("082026");
    }
  });

  it("keeps every GSTR-2B fact off the record rows", () => {
    // The same rule `tests/schema.test.ts` enforces on the schema, enforced
    // here on the values: one GSTR-2B invoice covers a whole period, so a
    // single record has no 2B counterpart to carry a 2B verdict. Copying the
    // rollup or `itcavl` onto rows would invite the two to disagree.
    const rows = toRecordRows(july(), BATCH_ID);
    const forbidden = [
      "gstr2bInvoiceTxvalPaise",
      "gstr2bInvoiceTaxPaise",
      "rolledUpTaxPaise",
      "rollupDeltaPaise",
      "gstr2bItcAvailable",
      "gstr2bItcReason",
      "itcClaimablePaise",
      "itcAtRiskPaise",
    ];

    for (const row of rows) {
      for (const key of forbidden) expect(Object.keys(row)).not.toContain(key);
    }
  });

  it("leaves `reason` for the Investigation agent to fill in", () => {
    // The plain-language explanation is an AI-layer output. A mapping function
    // inventing one here would put un-reviewed prose into the audit trail.
    const rows = toRecordRows(july(), BATCH_ID);
    expect(rows.every((r) => r.reason === undefined)).toBe(true);
  });

  it("is assignable to the table's own insert type", () => {
    const rows = toRecordRows(july(), BATCH_ID) satisfies (typeof records.$inferInsert)[];
    expect(rows).toHaveLength(54);
  });
});

/**
 * Backlog finding 6. The batch row is the audit trail's header: the GSTIN it
 * names is the merchant the credit is claimed by, and the period it names is
 * the return that claim lands in. Both arrived as free-form strings in `meta`,
 * unchecked, while the matcher had already agreed a period with the statement.
 */
describe("the batch row's own identity", () => {
  it("refuses a period that contradicts the one the batch reconciled", () => {
    // `matchBatch` has already refused to reconcile July's settlements against
    // any other month's statement. Writing an August header over a July batch
    // undoes that agreement one layer down, and the row it produces claims
    // ₹982.23 of credit in the wrong return.
    expect(() => toBatchRow(july(), { ...meta, period: "082026" })).toThrow(/072026/);
    expect(() => toBatchRow(july(), { ...meta, period: "082026" })).toThrow(/period/);
  });

  it("refuses a period that is not a filing period", () => {
    expect(() => toBatchRow(july(), { ...meta, period: "2026-07" })).toThrow(/period/);
    expect(() => toBatchRow(july(), { ...meta, period: "" })).toThrow(/period/);

    // The case the equality check above cannot see, and the reason the shape
    // check is not redundant: a malformed period that BOTH sides agree on.
    // `matchBatch` compares the batch's period against the statement's without
    // reading either, so a hand-built statement can carry `2026-07` in both
    // places and reach here agreeing with itself.
    const malformed = { ...july(), period: "2026-07" };
    expect(() => toBatchRow(malformed, { ...meta, period: "2026-07" })).toThrow(
      /meta\.period must be a filing period/,
    );
  });

  it("refuses a merchant GSTIN that is missing or malformed", () => {
    // An empty GSTIN wrote a batch that belongs to nobody. A malformed one is
    // worse: it is copied onto a return and rejected by the GST portal.
    expect(() => toBatchRow(july(), { ...meta, merchantGstin: "" })).toThrow(/merchantGstin/);
    expect(() => toBatchRow(july(), { ...meta, merchantGstin: "NOTAGSTIN" })).toThrow(
      /merchantGstin/,
    );
  });

  it("still writes the locked header for the batch it was actually given", () => {
    expect(toBatchRow(july(), meta)).toMatchObject({
      merchantGstin: "27TESTM1234A1Z0",
      period: "072026",
      itcClaimablePaise: 98223,
      itcAtRiskPaise: 21469,
    });
  });
});

/**
 * Backlog finding 8. The three buckets are counted independently off the
 * records, so a record in none of them is simply absent from all three —
 * `totalRecords` says 54 and the buckets say 53, on a row a human reads as the
 * summary of the whole batch.
 */
describe("every record lands in exactly one bucket", () => {
  const handBuilt = (records: MatchedRecord[]): BatchResult => ({
    records,
    period: "072026",
    rollup: {
      gstr2bInvoiceTxvalPaise: 1000,
      gstr2bInvoiceTaxPaise: 180,
      rolledUpTaxPaise: 100,
      rollupDeltaPaise: 80,
    },
    itc: { available: true, reason: null },
  });

  it("refuses a batch whose buckets do not add up to its records", () => {
    // MATCHED with no method is the shape that falls through every count: it is
    // neither EXACT nor FUZZY, and it is not an EXCEPTION either.
    const row = () =>
      toBatchRow(
        handBuilt([
          record({ recordId: "pay_1" }),
          record({ recordId: "pay_2", status: "MATCHED", method: "NONE", rateCell: null }),
        ]),
        meta,
      );

    expect(row).toThrow(/2 records/);
    expect(row).toThrow(/1 EXACT \+ 0 FUZZY \+ 0 exceptions/);
  });

  it("counts a well-formed batch without complaint", () => {
    expect(() =>
      toBatchRow(
        handBuilt([
          record({ recordId: "pay_1" }),
          record({ recordId: "pay_2", status: "EXCEPTION", method: "NONE", category: "TIMING" }),
        ]),
        meta,
      ),
    ).not.toThrow();
  });
});
