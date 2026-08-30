import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSettlements, parseStatement } from "@/lib/ingestion";
import { matchBatch } from "@/lib/matching";

/** Read as raw TEXT, deliberately. The parser's job starts at the string. */
const rawText = (f: string) => readFileSync(`data/synthetic/${f}`, "utf8");

describe("acceptance — raw JSON text through ingestion into the matcher", () => {
  it("reproduces the locked numbers end to end", () => {
    // The point of reading the files as text is that nothing but the ingestion
    // layer decides what shape reaches `matchBatch`. If the parser widens,
    // reorders or coerces anything, these numbers move — and they are locked.
    const settlements = parseSettlements(rawText("settlements.json"));
    const statement = parseStatement(rawText("gstr2b-072026.json"));

    const batch = matchBatch({
      settlements,
      statement,
      period: "072026",
      mode: "exact+fuzzy",
    });

    expect(batch.records).toHaveLength(54);
    expect(batch.records.filter((r) => r.status === "MATCHED")).toHaveLength(38);
    expect(batch.rollup).toEqual({
      gstr2bInvoiceTxvalPaise: 664945,
      gstr2bInvoiceTaxPaise: 119692,
      rolledUpTaxPaise: 85587,
      rollupDeltaPaise: 34105,
    });
    expect(batch.itc).toEqual({ available: true, reason: null });
  });

  it("reproduces the exact-only baseline through the same parse", () => {
    // 30/54 is the merchant's own expectation holding; the lift to 38 is the
    // alternate-cell pass. Both must survive ingestion unchanged.
    const batch = matchBatch({
      settlements: parseSettlements(rawText("settlements.json")),
      statement: parseStatement(rawText("gstr2b-072026.json")),
      period: "072026",
      mode: "exact-only",
    });

    expect(batch.records.filter((r) => r.status === "MATCHED")).toHaveLength(30);
  });

  it("carries August's statement through to a zero delta", () => {
    const batch = matchBatch({
      settlements: parseSettlements(rawText("settlements.json")),
      statement: parseStatement(rawText("gstr2b-082026.json")),
      period: "082026",
      mode: "exact+fuzzy",
    });

    expect(batch.rollup.gstr2bInvoiceTaxPaise).toBe(19530);
    expect(batch.rollup.rolledUpTaxPaise).toBe(19530);
    expect(batch.rollup.rollupDeltaPaise).toBe(0);
  });
});

/**
 * Everything below is hand-built. The fixture is well-formed by construction and
 * can only ever prove that good input works — BUILD-LOG entries 14 and 15 are
 * that lesson, learned twice. These are the shapes the fixture cannot contain.
 */

/** One raw recon row as Razorpay's API actually returns it, extra fields and all. */
const rawPayment = (over: Record<string, unknown> = {}) => ({
  entity_id: "pay_test000000001",
  type: "payment",
  debit: 0,
  credit: 146362,
  amount: 149900,
  currency: "INR",
  fee: 3538,
  tax: 540,
  on_hold: false,
  settled: true,
  created_at: 1782986400,
  settled_at: 1784000000,
  settlement_id: "setl_test00000001",
  payment_id: null,
  order_id: "order_test00000001",
  method: "card",
  ...over,
});

const collection = (...items: Record<string, unknown>[]) => ({
  entity: "collection",
  count: items.length,
  items,
});

/** One raw GSTR-2B statement, in the envelope GSTN publishes. */
const rawStatement = () => ({
  gstin: "27TESTM1234A1Z0",
  rtnprd: "072026",
  gendt: "14-08-2026",
  version: "1.0",
  docdata: {
    b2b: [
      {
        ctin: "27AAGCR4375J1ZY",
        trdnm: "RAZORPAY SOFTWARE PRIVATE LIMITED",
        supprd: "072026",
        supfildt: "11-08-2026",
        inv: [
          {
            inum: "RZP/TAX/2026-07/0041882",
            typ: "R",
            dt: "31-07-2026",
            val: 7846.37,
            pos: "27",
            rev: "N",
            itcavl: "Y",
            rsn: "",
            items: [
              { num: 1, rt: 18, txval: 6649.45, igst: 0, cgst: 598.46, sgst: 598.46, cess: 0 },
            ],
          },
        ],
      },
    ],
  },
});

describe("the statement is GSTR-2B, not GSTR-2A", () => {
  // Substituting one form for the other cost two days once — BUILD-LOG entry 1.
  // The two documents are not variants of each other: 2A is the older dynamic
  // ledger, 2B the static monthly ITC statement a merchant actually files
  // against. A 2A field appearing ANYWHERE means the wrong document arrived,
  // whatever else validates.
  const markers: [string, () => Record<string, unknown>][] = [
    [
      "flprdr1",
      () => {
        const s = rawStatement();
        (s.docdata.b2b[0] as Record<string, unknown>).flprdr1 = "072026";
        return s;
      },
    ],
    [
      "fldtr1",
      () => {
        const s = rawStatement();
        (s.docdata.b2b[0] as Record<string, unknown>).fldtr1 = "11-08-2026";
        return s;
      },
    ],
    [
      "itm_det",
      () => {
        const s = rawStatement();
        (s.docdata.b2b[0].inv[0].items[0] as Record<string, unknown>).itm_det = {};
        return s;
      },
    ],
    [
      "camt",
      () => {
        const s = rawStatement();
        (s.docdata.b2b[0].inv[0].items[0] as Record<string, unknown>).camt = 598.46;
        return s;
      },
    ],
    [
      "samt",
      () => {
        const s = rawStatement();
        (s.docdata.b2b[0].inv[0].items[0] as Record<string, unknown>).samt = 598.46;
        return s;
      },
    ],
    [
      "iamt",
      () => {
        const s = rawStatement();
        (s.docdata.b2b[0].inv[0].items[0] as Record<string, unknown>).iamt = 0;
        return s;
      },
    ],
  ];

  for (const [field, build] of markers) {
    it(`rejects a statement carrying the 2A field \`${field}\``, () => {
      expect(() => parseStatement(build())).toThrow(new RegExp(field));
      // And it names the form, so the error is actionable rather than cryptic.
      expect(() => parseStatement(build())).toThrow(/GSTR-2A/);
    });
  }

  it("rejects a statement with no `docdata.b2b` at all", () => {
    const missingB2b = { ...rawStatement(), docdata: {} };
    expect(() => parseStatement(missingB2b)).toThrow(/docdata\.b2b/);

    const missingDocdata = { gstin: "27TESTM1234A1Z0", rtnprd: "072026" };
    expect(() => parseStatement(missingDocdata)).toThrow(/docdata/);
  });

  it("rejects a statement whose b2b table is empty", () => {
    // Not merely pedantic: an empty table totals to a zero invoice, and the
    // rollup then reports a NEGATIVE delta — "the government billed you
    // nothing, and you claim ₹855 of credit". Well-formed-looking input,
    // nonsense output. There is nothing to reconcile against, so it is refused.
    const empty = rawStatement();
    empty.docdata.b2b = [];
    expect(() => parseStatement(empty)).toThrow(/docdata\.b2b/);
  });
});

describe("statement field validation", () => {
  it("requires `rtnprd` present and shaped MMYYYY", () => {
    const withPeriod = (rtnprd: unknown) => ({ ...rawStatement(), rtnprd });

    expect(() => parseStatement(withPeriod(undefined))).toThrow(/rtnprd/);
    expect(() => parseStatement(withPeriod("2026-07"))).toThrow(/rtnprd/);
    expect(() => parseStatement(withPeriod("72026"))).toThrow(/rtnprd/);
    // Month 13 is shaped like MMYYYY only if you never look at the month.
    expect(() => parseStatement(withPeriod("132026"))).toThrow(/rtnprd/);
    expect(() => parseStatement(withPeriod("002026"))).toThrow(/rtnprd/);
    expect(() => parseStatement(withPeriod(72026))).toThrow(/rtnprd/);

    expect(parseStatement(withPeriod("122026")).rtnprd).toBe("122026");
  });

  it("requires `itcavl` to be exactly Y or N", () => {
    // GSTN's own verdict, and the one field in the statement that outranks
    // anything Trace infers. Anything but the two documented values means the
    // verdict was not understood, and guessing it in the permissive direction
    // claims credit the government may have blocked.
    const withItcavl = (itcavl: unknown) => {
      const s = rawStatement();
      (s.docdata.b2b[0].inv[0] as Record<string, unknown>).itcavl = itcavl;
      return s;
    };

    expect(() => parseStatement(withItcavl("y"))).toThrow(/itcavl/);
    expect(() => parseStatement(withItcavl(true))).toThrow(/itcavl/);
    expect(() => parseStatement(withItcavl(""))).toThrow(/itcavl/);
    expect(() => parseStatement(withItcavl(undefined))).toThrow(/itcavl/);

    expect(parseStatement(withItcavl("N")).docdata.b2b[0].inv[0].itcavl).toBe("N");
  });

  it("requires all four money heads, and lets them be fractional", () => {
    // Statement money is RUPEES and may be fractional — the asymmetry with the
    // recon side is real. `igst: 0` must still be present: reading only the two
    // intra-state heads reports every non-Maharashtra merchant's invoice as
    // carrying no tax at all (BUILD-LOG entry 15), so an absent head is a
    // missing fact, not a zero.
    const withLine = (line: Record<string, unknown>) => {
      const s = rawStatement();
      (s.docdata.b2b[0].inv[0] as Record<string, unknown>).items = [line];
      return s;
    };

    const good = { txval: 6649.45, igst: 0, cgst: 598.46, sgst: 598.46 };
    expect(parseStatement(withLine(good)).docdata.b2b[0].inv[0].items[0]).toEqual(good);

    expect(() => parseStatement(withLine({ ...good, igst: undefined }))).toThrow(/igst/);
    expect(() => parseStatement(withLine({ ...good, cgst: undefined }))).toThrow(/cgst/);
    expect(() => parseStatement(withLine({ ...good, sgst: undefined }))).toThrow(/sgst/);
    expect(() => parseStatement(withLine({ ...good, txval: undefined }))).toThrow(/txval/);
    // A number that arrived as text is the classic quiet corruption: `"6649.45"`
    // coerces to something plausible and nothing ever says it happened.
    expect(() => parseStatement(withLine({ ...good, txval: "6649.45" }))).toThrow(/txval/);
    expect(() => parseStatement(withLine({ ...good, cgst: NaN }))).toThrow(/cgst/);
  });

  it("keeps `rsn` a string rather than stringifying whatever arrived", () => {
    // Found by mutation: `String(row.rsn)` passed every other test. `rsn` is the
    // reason GSTN gives for blocking the credit and it is read by a human — a
    // number silently becoming "42", or an object becoming "[object Object]",
    // puts a fabricated reason in front of a CA. Absent is an empty reason,
    // which is what GSTN itself writes against an eligible invoice.
    const withRsn = (rsn: unknown) => {
      const s = rawStatement();
      (s.docdata.b2b[0].inv[0] as Record<string, unknown>).rsn = rsn;
      return s;
    };

    expect(() => parseStatement(withRsn(42))).toThrow(/rsn/);
    expect(() => parseStatement(withRsn({ code: "POS" }))).toThrow(/rsn/);
    expect(parseStatement(withRsn(undefined)).docdata.b2b[0].inv[0].rsn).toBe("");
    expect(parseStatement(withRsn("Section 16(4) time bar")).docdata.b2b[0].inv[0].rsn).toBe(
      "Section 16(4) time bar",
    );
  });

  it("requires GSTINs to be shaped like GSTINs", () => {
    // Also found by mutation: removing the shape check broke nothing. A judge
    // pasting an invalid GSTIN into the GST portal is a worse failure than any
    // code bug (PRD §5). The mod-36 check digit is asserted over the dataset in
    // `tests/fixtures.test.ts`; this is the structural half.
    expect(() => parseStatement({ ...rawStatement(), gstin: "NOTAGSTIN" })).toThrow(/gstin/);
    expect(() => parseStatement({ ...rawStatement(), gstin: "27TESTM1234A1Z" })).toThrow(/gstin/);
    expect(() => parseStatement({ ...rawStatement(), gstin: "27testm1234a1z0" })).toThrow(/gstin/);

    const badCtin = rawStatement();
    badCtin.docdata.b2b[0].ctin = "27AAGCR4375J1Z";
    expect(() => parseStatement(badCtin)).toThrow(/ctin/);
  });

  it("requires the identifying strings", () => {
    const blankGstin = { ...rawStatement(), gstin: "" };
    expect(() => parseStatement(blankGstin)).toThrow(/gstin/);

    const noCtin = rawStatement();
    delete (noCtin.docdata.b2b[0] as Partial<Record<"ctin", string>>).ctin;
    expect(() => parseStatement(noCtin)).toThrow(/ctin/);

    const noInum = rawStatement();
    delete (noInum.docdata.b2b[0].inv[0] as Partial<Record<"inum", string>>).inum;
    expect(() => parseStatement(noInum)).toThrow(/inum/);
  });

  it("requires each supplier to carry invoices and each invoice to carry lines", () => {
    const noInv = rawStatement();
    noInv.docdata.b2b[0].inv = [];
    expect(() => parseStatement(noInv)).toThrow(/inv/);

    const noItems = rawStatement();
    noItems.docdata.b2b[0].inv[0].items = [];
    expect(() => parseStatement(noItems)).toThrow(/items/);
  });

  it("rejects text that is not JSON, naming the failure", () => {
    expect(() => parseStatement("{ not json")).toThrow(/JSON/);
    expect(() => parseStatement("[]")).toThrow(/object/);
    expect(() => parseStatement(null)).toThrow(/object/);
  });
});

describe("recon money is integer paise", () => {
  // Razorpay returns paise as integers. A float here means somebody converted
  // to rupees upstream, and the matcher's ₹1 tolerance is exactly 100 paise —
  // so a rupee value sails through every comparison looking like a fee 100×
  // too small. Rejected rather than multiplied back: guessing which unit
  // arrived is how you get a confident wrong number.
  for (const field of ["amount", "fee", "tax", "debit", "credit"] as const) {
    it(`rejects a fractional \`${field}\``, () => {
      expect(() => parseSettlements(collection(rawPayment({ [field]: 35.38 })))).toThrow(
        new RegExp(field),
      );
      expect(() => parseSettlements(collection(rawPayment({ [field]: "3538" })))).toThrow(
        new RegExp(field),
      );
      expect(() => parseSettlements(collection(rawPayment({ [field]: undefined })))).toThrow(
        new RegExp(field),
      );
      expect(() => parseSettlements(collection(rawPayment({ [field]: NaN })))).toThrow(
        new RegExp(field),
      );
    });
  }

  it("names the offending row, not just the field", () => {
    // 54 rows in, "fee must be an integer" is not an actionable error.
    expect(() =>
      parseSettlements(
        collection(rawPayment(), rawPayment({ entity_id: "pay_broken", fee: 35.38 })),
      ),
    ).toThrow(/pay_broken/);
  });

  it("rejects an integer too large to add up safely", () => {
    // `Number.isInteger(1e21)` is true, and so is `1e21 + 1 === 1e21`. Paise
    // beyond 2^53 stop being countable, so the tier-2 rollup would sum them and
    // report a total that is quietly wrong rather than obviously absurd.
    expect(() => parseSettlements(collection(rawPayment({ amount: 1e21 })))).toThrow(/amount/);
    expect(() => parseSettlements(collection(rawPayment({ fee: 2 ** 53 })))).toThrow(/fee/);
  });

  it("rejects a non-integer `settled_at`", () => {
    // The T+2 month-boundary rule reads this instant. A fractional or absent
    // timestamp silently picks a period.
    expect(() => parseSettlements(collection(rawPayment({ settled_at: 1784000000.5 })))).toThrow(
      /settled_at/,
    );
    expect(() => parseSettlements(collection(rawPayment({ settled_at: undefined })))).toThrow(
      /settled_at/,
    );
  });
});

describe("recon row shape", () => {
  it("rejects a `type` that is neither payment nor refund", () => {
    expect(() => parseSettlements(collection(rawPayment({ type: "adjustment" })))).toThrow(/type/);
    expect(() => parseSettlements(collection(rawPayment({ type: "Payment" })))).toThrow(/type/);
    expect(() => parseSettlements(collection(rawPayment({ type: undefined })))).toThrow(/type/);
  });

  it("requires a refund to carry the payment it reverses", () => {
    // `payment_id` is the ONLY join key for REFUND_NETTED — a refund is netted
    // into a later settlement cycle, so joining on `settlement_id` finds
    // nothing and looks correct doing it (BUILD-LOG entry 3). A refund with a
    // null join key silently removes a record from the category.
    const orphan = rawPayment({
      entity_id: "rfnd_test00000001",
      type: "refund",
      payment_id: null,
      debit: 890000,
      credit: 0,
    });
    expect(() => parseSettlements(collection(orphan))).toThrow(/payment_id/);
    expect(() => parseSettlements(collection({ ...orphan, payment_id: "" }))).toThrow(
      /payment_id/,
    );

    const joined = { ...orphan, payment_id: "pay_test000000001" };
    expect(parseSettlements(collection(joined))[0].payment_id).toBe("pay_test000000001");
  });

  it("requires a payment's `payment_id` to be null", () => {
    // On a payment row the payment's own id is in `entity_id`; a populated
    // `payment_id` means the row is not the entity it claims to be, and it
    // would make that payment look like the target of its own reversal.
    expect(() => parseSettlements(collection(rawPayment({ payment_id: "pay_other" })))).toThrow(
      /payment_id/,
    );
    // Absent is accepted as null — JSON has no way to write "explicitly unset".
    const absent = rawPayment();
    delete (absent as Partial<Record<"payment_id", unknown>>).payment_id;
    expect(parseSettlements(collection(absent))[0].payment_id).toBeNull();
  });

  it("requires the identifying strings", () => {
    for (const field of ["entity_id", "order_id", "settlement_id"] as const) {
      expect(() => parseSettlements(collection(rawPayment({ [field]: undefined })))).toThrow(
        new RegExp(field),
      );
      expect(() => parseSettlements(collection(rawPayment({ [field]: "" })))).toThrow(
        new RegExp(field),
      );
    }
  });

  it("returns exactly the matcher's fields, dropping everything else", () => {
    // The recon row carries 25 fields; the matcher's type names 11. Passing the
    // rest through would let a later `card_type` or `notes` read reach data the
    // Detect layer never validated.
    const [row] = parseSettlements(collection(rawPayment()));
    expect(Object.keys(row).sort()).toEqual(
      [
        "amount",
        "credit",
        "debit",
        "entity_id",
        "fee",
        "order_id",
        "payment_id",
        "settled_at",
        "settlement_id",
        "tax",
        "type",
      ].sort(),
    );
  });
});

describe("recon envelope", () => {
  it("accepts a bare array as well as Razorpay's collection envelope", () => {
    expect(parseSettlements([rawPayment()])).toHaveLength(1);
    expect(parseSettlements(collection(rawPayment()))).toHaveLength(1);
    expect(parseSettlements(JSON.stringify(collection(rawPayment())))).toHaveLength(1);
  });

  it("rejects a collection whose `count` disagrees with its items", () => {
    // A short read against a paged API is the one failure that produces a
    // perfectly well-formed batch with records missing from it — and a rollup
    // computed over the survivors looks entirely reasonable.
    expect(() => parseSettlements({ entity: "collection", count: 3, items: [rawPayment()] })).toThrow(
      /count/,
    );
  });

  it("rejects anything that is not a list of rows", () => {
    expect(() => parseSettlements("{ not json")).toThrow(/JSON/);
    expect(() => parseSettlements({ entity: "collection" })).toThrow(/items/);
    expect(() => parseSettlements(null)).toThrow(/items|array/);
    expect(() => parseSettlements(collection())).toThrow(/empty/);
    expect(() => parseSettlements([null])).toThrow(/object/);
  });
});
