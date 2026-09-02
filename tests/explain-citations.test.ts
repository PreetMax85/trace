import { describe, expect, it } from "vitest";
import { bindCitations } from "@/lib/explain/citations";

/** The batch the answers below are checked against. */
const KNOWN = new Set(["pay_4gaSMyqces2Qkk", "pay_GQiwcS8koSo6mm", "rfnd_JvhLpq3rzWQ1nT"]);

describe("bindCitations", () => {
  it("leaves an answer with no citations as a single run of text", () => {
    const bound = bindCitations("Nothing in this period is at risk.", KNOWN);

    expect(bound.segments).toEqual([{ kind: "text", text: "Nothing in this period is at risk." }]);
    expect(bound.cited).toEqual([]);
  });
});

describe("bindCitations — a record the batch really holds", () => {
  it("splits a cited record out of the surrounding prose", () => {
    const bound = bindCitations("The shortfall starts at [pay_4gaSMyqces2Qkk], a card payment.", KNOWN);

    expect(bound.segments).toEqual([
      { kind: "text", text: "The shortfall starts at " },
      { kind: "citation", recordId: "pay_4gaSMyqces2Qkk" },
      { kind: "text", text: ", a card payment." },
    ]);
    expect(bound.cited).toEqual(["pay_4gaSMyqces2Qkk"]);
  });
});

describe("bindCitations — a record the batch does not hold", () => {
  it("refuses to link an invented record, keeps the words, and reports it", () => {
    const bound = bindCitations("Look at [pay_NotInThisBatch01] for the rest.", KNOWN);

    expect(bound.segments).toEqual([
      { kind: "text", text: "Look at [pay_NotInThisBatch01] for the rest." },
    ]);
    expect(bound.cited).toEqual([]);
    expect(bound.unknown).toEqual(["pay_NotInThisBatch01"]);
  });

  it("treats bracketed prose as prose, not as an invented record", () => {
    const bound = bindCitations("A credit note is due [Section 34 of the CGST Act].", KNOWN);

    expect(bound.unknown).toEqual([]);
  });
});

describe("bindCitations — edges", () => {
  it("cites the same record twice without repeating it in the summary list", () => {
    const bound = bindCitations(
      "[pay_4gaSMyqces2Qkk] was refunded, so [pay_4gaSMyqces2Qkk] keeps its fee.",
      KNOWN,
    );

    expect(bound.segments).toEqual([
      { kind: "citation", recordId: "pay_4gaSMyqces2Qkk" },
      { kind: "text", text: " was refunded, so " },
      { kind: "citation", recordId: "pay_4gaSMyqces2Qkk" },
      { kind: "text", text: " keeps its fee." },
    ]);
    expect(bound.cited).toEqual(["pay_4gaSMyqces2Qkk"]);
  });

  it("keeps an invented record's words in place between two real ones", () => {
    const bound = bindCitations(
      "[pay_4gaSMyqces2Qkk], [pay_MadeUpEntirely1] and [pay_GQiwcS8koSo6mm].",
      KNOWN,
    );

    expect(bound.segments).toEqual([
      { kind: "citation", recordId: "pay_4gaSMyqces2Qkk" },
      { kind: "text", text: ", [pay_MadeUpEntirely1] and " },
      { kind: "citation", recordId: "pay_GQiwcS8koSo6mm" },
      { kind: "text", text: "." },
    ]);
    expect(bound.cited).toEqual(["pay_4gaSMyqces2Qkk", "pay_GQiwcS8koSo6mm"]);
    expect(bound.unknown).toEqual(["pay_MadeUpEntirely1"]);
  });

  it("emits no empty text between two citations that touch", () => {
    const bound = bindCitations("[pay_4gaSMyqces2Qkk][rfnd_JvhLpq3rzWQ1nT]", KNOWN);

    expect(bound.segments).toEqual([
      { kind: "citation", recordId: "pay_4gaSMyqces2Qkk" },
      { kind: "citation", recordId: "rfnd_JvhLpq3rzWQ1nT" },
    ]);
  });

  it("reports an answer that cites nothing at all", () => {
    expect(bindCitations("The settlement is short by ₹341.05.", KNOWN).cited).toEqual([]);
  });
});

describe("bindCitations — what counts as a claimed citation", () => {
  it("treats a bracketed snake_case word as prose, not as a record id", () => {
    // A real answer says things like "categorised as fee_deduction". Without a
    // rule tied to Razorpay's own id prefixes, that reads as an invented record
    // and the panel warns about a hallucination that never happened.
    const bound = bindCitations("This is a fee the rate card cannot price [fee_deduction].", KNOWN);

    expect(bound.unknown).toEqual([]);
    expect(bound.segments).toEqual([
      { kind: "text", text: "This is a fee the rate card cannot price [fee_deduction]." },
    ]);
  });

  it("names an invented record once, however often the answer repeats it", () => {
    const bound = bindCitations("[pay_MadeUpEntirely1] and again [pay_MadeUpEntirely1].", KNOWN);

    expect(bound.unknown).toEqual(["pay_MadeUpEntirely1"]);
  });
});

describe("bindCitations — a bracket that merely contains an id", () => {
  it("does not treat a phrase wrapping an id as a citation of it", () => {
    const bound = bindCitations("Check the order too [see order_wcsCK4S8SEIAmm].", KNOWN);

    expect(bound.unknown).toEqual([]);
    expect(bound.cited).toEqual([]);
  });
});
