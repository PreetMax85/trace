import { describe, expect, it } from "vitest";
import { openingSelection } from "@/app/exception-review";
import type { ReviewRow } from "@/lib/review/batch";

/**
 * Which record the screen opens on, and why it is worth a test.
 *
 * The page used to open on nothing and ask the reader to select a row, which
 * meant the investigation and the three drafted actions were invisible until
 * somebody clicked. Opening on a record fixes that, but it also puts one
 * specific record in front of a person as the one worth looking at first, and a
 * picker that quietly returned the wrong one would look exactly like a picker
 * that worked. Nothing on screen would say which record it MEANT to choose.
 *
 * So the three properties are pinned here: it prefers a record with a draft to
 * show, it prefers the most tax at stake, and it is stable when two records
 * carry the same amount. That last one is the failure this project has had
 * before: a tie broken by iteration order looks deterministic on the machine
 * that wrote it and moves as soon as the data is reordered.
 */
function row(recordId: string, taxPaise: number, opts: Partial<ReviewRow> = {}): ReviewRow {
  return {
    recordId,
    taxPaise,
    status: "EXCEPTION",
    draft: null,
    ...opts,
  } as ReviewRow;
}

/** A recorded draft, shaped only as far as the picker looks at it. */
const withDraft = { draft: { draft: {} } } as unknown as Partial<ReviewRow>;

describe("the record the page opens on", () => {
  it("is nothing when nothing is flagged", () => {
    expect(openingSelection([])).toBeNull();
    expect(openingSelection([row("pay_a", 500, { status: "MATCHED" })])).toBeNull();
  });

  it("is the flagged record with the most tax at stake", () => {
    const chosen = openingSelection([row("pay_a", 100), row("pay_b", 900), row("pay_c", 400)]);
    expect(chosen).toEqual({ kind: "record", recordId: "pay_b" });
  });

  it("never opens on a matched record, however large", () => {
    const chosen = openingSelection([
      row("pay_big", 100_000, { status: "MATCHED" }),
      row("pay_small", 1, {}),
    ]);
    expect(chosen).toEqual({ kind: "record", recordId: "pay_small" });
  });

  it("prefers a record that has something to show over a larger one that does not", () => {
    // The whole point of opening on a record is to show the drafts. Opening on
    // the largest record when it has none would put an empty panel on screen
    // and demonstrate less than the empty state it replaced.
    const chosen = openingSelection([
      row("pay_bare", 900),
      row("pay_drafted", 400, withDraft),
    ]);
    expect(chosen).toEqual({ kind: "record", recordId: "pay_drafted" });
  });

  it("falls back to the largest flagged record when nothing has a draft", () => {
    const chosen = openingSelection([row("pay_a", 100), row("pay_b", 900)]);
    expect(chosen).toEqual({ kind: "record", recordId: "pay_b" });
  });

  it("does not change its mind when the same rows arrive in a different order", () => {
    // Two records with identical tax is the case a comparison written with the
    // wrong operator resolves by iteration order.
    const rows = [row("pay_a", 700), row("pay_b", 700), row("pay_c", 200)];
    const forwards = openingSelection(rows);
    const backwards = openingSelection([...rows].reverse());
    expect(forwards).toEqual(backwards);
  });
});
