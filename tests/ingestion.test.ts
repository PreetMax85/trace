import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSettlements, parseStatement } from "@/lib/ingestion";
import { matchBatch, periodOf } from "@/lib/matching";

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
 * can only ever prove that good input works, a lesson this project
 * learned twice. These are the shapes the fixture cannot contain.
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
  settlement_utr: "1783159200004rzp",
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
  // Substituting one form for the other cost two days once.
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

  it("names the LINE-ITEM field, so the reader is not sent to the wrong problem", () => {
    // A 2A item read as a 2B one would otherwise fail as "igst must be a finite
    // number", which describes a missing field rather than the wrong document.
    for (const field of ["iamt", "camt", "samt"]) {
      const s = rawStatement();
      (s.docdata.b2b[0].inv[0].items[0] as Record<string, unknown>)[field] = 1;
      expect(() => parseStatement(s)).toThrow(/GSTR-2A line-item field/);
    }
  });

  it("rejects a genuine GSTR-2A document outright", () => {
    const twoA = {
      gstin: "27TESTM1234A1Z0",
      fp: "072026",
      b2b: [
        {
          ctin: "27AAGCR4375J1ZY",
          cfs: "Y",
          inv: [
            {
              inum: "RZP/TAX/2026-07/0041882",
              flprdr1: "072026",
              fldtr1: "11-08-2026",
              val: 7846.37,
              itms: [{ num: 1, itm_det: { rt: 18, txval: 6649.45, camt: 598.46, samt: 598.46 } }],
            },
          ],
        },
      ],
    };
    expect(() => parseStatement(twoA)).toThrow(/GSTR-2A/);
  });

  // The other direction, and the one a global scan got wrong: `iamt`, `camt`
  // and `samt` are NOT 2A-exclusive. A real GSTR-2B uses them outside `b2b` —
  // the IMPG section carries `iamt` against a bill of entry for imported goods,
  // and the ITC summary node totals all three heads. Scanning the whole
  // document for them rejected a genuine 2B AS a 2A. Only `flprdr1`, `fldtr1`
  // and `itm_det` are safe to look for document-wide.
  it("accepts a real GSTR-2B carrying an IMPG section and an ITC summary", () => {
    const s = rawStatement() as Record<string, unknown>;
    (s.docdata as Record<string, unknown>).impg = [
      {
        recdt: "12-07-2026",
        portcd: "INNSA1",
        boenum: "9876543",
        boedt: "10-07-2026",
        txval: 250000,
        iamt: 45000,
        csamt: 0,
        isamd: "N",
      },
    ];
    s.itcsumm = { itcavl: [{ ty: "B2B", iamt: 0, camt: 598.46, samt: 598.46, csamt: 0 }] };

    const parsed = parseStatement(s);
    expect(parsed.rtnprd).toBe("072026");
    // And neither section leaks into the Razorpay invoice the rollup reads.
    expect(parsed.docdata.b2b).toHaveLength(1);
    expect(parsed.docdata.b2b[0].inv[0].items[0].cgst).toBe(598.46);
  });

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
    // carrying no tax at all, so an absent head is a
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
    // Also found by mutation: removing the shape check broke nothing. Anyone
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

  it("holds a GSTIN to the same structure the dataset is held to", () => {
    // `tests/fixtures.test.ts:133` gates the mod-36 checksum behind
    // `[1-9A-Z]Z[0-9A-Z]`: the entity code is 1-9 or A-Z and never 0, and the
    // 14th character is a literal Z. Ingestion accepting a shape the dataset's
    // own assertion rejects would put an identifier into the audit trail that
    // the repo elsewhere calls invalid — and the checksum, which is what would
    // catch it later, is deliberately not computed here.
    const withGstin = (gstin: string) => ({ ...rawStatement(), gstin });

    expect(() => parseStatement(withGstin("27TESTM1234A0Z0"))).toThrow(/gstin/);
    expect(() => parseStatement(withGstin("27TESTM1234A1X0"))).toThrow(/gstin/);

    const badCtin = rawStatement();
    badCtin.docdata.b2b[0].ctin = "27AAGCR4375J0ZY";
    expect(() => parseStatement(badCtin)).toThrow(/ctin/);

    // The two real identifiers still parse.
    expect(parseStatement(withGstin("27TESTM1234A1Z0")).gstin).toBe("27TESTM1234A1Z0");
    expect(parseStatement(rawStatement()).docdata.b2b[0].ctin).toBe("27AAGCR4375J1ZY");
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
    // nothing and looks correct doing it. A refund with a
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

  it("returns exactly the fields the type names, dropping everything else", () => {
    // The recon row carries 25 fields; `ReconItem` names 13. Passing the rest
    // through would let a later `card_type` or `notes` read reach data the
    // Detect layer never validated.
    //
    // Two of the 13 are for the screen alone: `payment_method` and
    // `settlement_utr` are rendered and never computed with. They are listed
    // here so that adding a field to the type is a deliberate act rather than
    // something that happens by accident.
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
        "payment_method",
        "settled_at",
        "settlement_id",
        "settlement_utr",
        "tax",
        "type",
      ].sort(),
    );
  });

  it("reads the display-only fields leniently, because neither moves a figure", () => {
    // Everything the matcher computes with is refused when it is missing or
    // malformed. These two are not: a batch must not stop reconciling because
    // a row failed to say how the customer paid. The distinction is the point
    // of the test — if either ever starts feeding arithmetic, this leniency
    // becomes a silent wrong answer and this test should start failing.
    const [row] = parseSettlements(collection(rawPayment()));
    expect(row.payment_method).toBe("card");
    expect(row.settlement_utr).toBe("1783159200004rzp");

    const bare = rawPayment();
    delete (bare as Partial<Record<"method" | "settlement_utr", unknown>>).method;
    delete (bare as Partial<Record<"method" | "settlement_utr", unknown>>).settlement_utr;
    const [without] = parseSettlements(collection(bare));
    expect(without.payment_method).toBeNull();
    expect(without.settlement_utr).toBeNull();

    // A non-string is dropped rather than coerced: "42" in a method column
    // would read as a payment method that does not exist.
    const wrong = parseSettlements(collection(rawPayment({ method: 42 })));
    expect(wrong[0].payment_method).toBeNull();
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

/**
 * Backlog finding 3. `settled_at` decides which month's GSTR-2B bills a fee, so
 * a wrong unit does not fail — it silently moves the record into another filing
 * period. One row given in milliseconds takes the July batch from 38 matched to
 * 37 and the rollup delta from 34105 to 34645, with nothing anywhere saying so.
 */
describe("settlement timestamps are epoch seconds", () => {
  const settledAt = (value: unknown) => () => parseSettlements([rawPayment({ settled_at: value })]);

  it("rejects a timestamp given in milliseconds", () => {
    // The same instant, times a thousand. It is a perfectly good safe integer,
    // so every existing guard passes it through.
    expect(settledAt(1784000000000)).toThrow(/settled_at/);
    expect(settledAt(1784000000000)).toThrow(/millisecond/i);
  });

  it("is the silent failure the guard exists to stop", () => {
    // Why milliseconds are worse than garbage: the value reads as a real date
    // 54,000 years out, which resolves to a filing period that is merely not
    // this one. Nothing throws; the row is just billed somewhere else.
    expect(periodOf(1784000000)).toBe("072026");
    expect(periodOf(1784000000000)).not.toBe("072026");
  });

  it("rejects an instant before GST existed, and one absurdly far out", () => {
    // GST commenced on 1 July 2017, so no settlement before it can appear on
    // any GSTR-2B. The upper bound catches microseconds and nanoseconds too.
    expect(settledAt(0)).toThrow(/settled_at/);
    expect(settledAt(-1784000000)).toThrow(/settled_at/);
    expect(settledAt(1483228800)).toThrow(/settled_at/); // 1 Jan 2017
    expect(settledAt(1784000000000000)).toThrow(/settled_at/);
  });

  it("puts the boundaries exactly where it says it does", () => {
    // Both bounds are inclusive, and an off-by-one on either survives every
    // other assertion here — the window is 83 years wide, so nothing else in
    // the suite comes anywhere near an edge of it.
    const GST_COMMENCEMENT = 1_498_847_400; // 00:00 IST, 1 Jul 2017
    const FAR_FUTURE = 4_102_444_800; // 00:00 UTC, 1 Jan 2100

    expect(settledAt(GST_COMMENCEMENT)).not.toThrow();
    expect(settledAt(GST_COMMENCEMENT - 1)).toThrow(/settled_at/);
    expect(settledAt(FAR_FUTURE)).not.toThrow();
    expect(settledAt(FAR_FUTURE + 1)).toThrow(/settled_at/);
  });

  it("accepts every timestamp the fixture actually carries", () => {
    const rows = parseSettlements(rawText("settlements.json"));
    expect(rows).toHaveLength(58);
    expect(rows.every((r) => r.settled_at > 1_600_000_000 && r.settled_at < 2_000_000_000)).toBe(true);
  });
});

/**
 * Backlog finding 5. Statement money is RUPEES. The same figures given in paise
 * inflate the invoice a hundredfold, and nothing about a scaled number is wrong
 * on its face — so the check has to come from the document itself. `val` is the
 * invoice total GSTN publishes alongside the lines, and it is the only
 * cross-check a single statement carries.
 */
describe("the invoice's declared total is cross-checked against its lines", () => {
  const withInvoice = (over: Record<string, unknown>) => {
    const s = rawStatement();
    Object.assign(s.docdata.b2b[0].inv[0] as Record<string, unknown>, over);
    return s;
  };

  it("catches line items given in paise under a rupee invoice total", () => {
    // The finding, exactly: ×100 on the lines and nothing else. Every field is
    // a finite number, every head is present, and the invoice reports 100× the
    // tax the merchant was actually charged.
    const inPaise = withInvoice({
      items: [{ num: 1, rt: 18, txval: 664945, igst: 0, cgst: 59846, sgst: 59846, cess: 0 }],
    });

    // Asserted on `.val declares`, not on /val/: `txval` contains "val" and
    // every money guard's message ends in "rupees", so the loose regex would
    // have been satisfied by an entirely different check firing.
    expect(() => parseStatement(inPaise)).toThrow(/\.val declares/);
    expect(() => parseStatement(inPaise)).toThrow(/RUPEES/);
  });

  it("rejects any invoice whose lines do not add up to its declared total", () => {
    expect(() => parseStatement(withInvoice({ val: 9999.99 }))).toThrow(/val/);
    // A line dropped in transit is the same failure in the other direction.
    expect(() =>
      parseStatement(
        withInvoice({ items: [{ num: 1, rt: 18, txval: 100, igst: 0, cgst: 9, sgst: 9, cess: 0 }] }),
      ),
    ).toThrow(/val/);
  });

  it("requires `val`, because without it nothing can be cross-checked", () => {
    const noVal = rawStatement();
    delete (noVal.docdata.b2b[0].inv[0] as Partial<Record<"val", number>>).val;
    expect(() => parseStatement(noVal)).toThrow(/\.val must be a finite number/);
  });

  it("counts cess towards the declared total", () => {
    // Cess is a real head on a real invoice and it is inside `val`. Ignoring it
    // would reject a well-formed statement that happens to carry one.
    expect(() =>
      parseStatement(
        withInvoice({
          val: 7856.37,
          items: [{ num: 1, rt: 18, txval: 6649.45, igst: 0, cgst: 598.46, sgst: 598.46, cess: 10 }],
        }),
      ),
    ).not.toThrow();
  });

  it("allows the rounding-off line an invoice is entitled to", () => {
    // A tax invoice may round its total to the nearest rupee, so the tolerance
    // is a rupee — four orders of magnitude short of a unit error.
    // Pinned on both sides, to the paise. A tolerance loose enough to be
    // arbitrary is not a check, and one quietly tightened later would start
    // rejecting invoices that round their total, which is legal.
    expect(() => parseStatement(withInvoice({ val: 7846.37 + 1 }))).not.toThrow();
    expect(() => parseStatement(withInvoice({ val: 7846.37 - 1 }))).not.toThrow();
    expect(() => parseStatement(withInvoice({ val: 7846.37 + 1.01 }))).toThrow(/\.val declares/);
    expect(() => parseStatement(withInvoice({ val: 7846.37 - 1.01 }))).toThrow(/\.val declares/);
  });

  it("still totals the fixture to the locked numbers", () => {
    const batch = matchBatch({
      settlements: parseSettlements(rawText("settlements.json")),
      statement: parseStatement(rawText("gstr2b-072026.json")),
      period: "072026",
      mode: "exact+fuzzy",
    });
    expect(batch.rollup.gstr2bInvoiceTaxPaise).toBe(119692);
  });
});

/**
 * Backlog finding 7. `extractItems` compares `count` against the rows present,
 * and its own comment says a short read is the one failure that yields a
 * well-formed batch with records missing from it — but an envelope that simply
 * omits `count` skipped the comparison entirely.
 */
describe("recon envelope — an unverifiable count", () => {
  it("refuses a collection that declares no count", () => {
    // The message has to say which failure this is: "declares count undefined
    // but carries 1 items" would also match /count/, and did — the assertion
    // was passing on a message about a mismatch rather than about the absence.
    expect(() => parseSettlements({ entity: "collection", items: [rawPayment()] })).toThrow(
      /carries no `count`/,
    );
  });

  it("still accepts a bare array, which claims no count to begin with", () => {
    // The bare array is not an envelope with a missing field — it is a
    // different shape, and Razorpay's own paging never produces it.
    expect(parseSettlements([rawPayment()])).toHaveLength(1);
  });
});
