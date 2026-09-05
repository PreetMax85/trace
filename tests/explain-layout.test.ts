import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bindCitations } from "@/lib/explain/citations";
import { toAnswerBlocks, type AnswerBlock } from "@/lib/explain/layout";

/**
 * The screen used to print an answer as one paragraph. It now recovers the
 * paragraphs and the numbered list the model wrote, which is a transformation
 * applied to text that carries a person's tax figures and the record ids they
 * check them against.
 *
 * The risk is therefore not that it looks wrong. It is that a citation, or a
 * rupee amount, quietly falls out during the regrouping: an answer missing one
 * of its eleven citations looks exactly like an answer that had ten, and no
 * assertion anywhere else in this suite would notice.
 *
 * So the load-bearing test here is conservation. Everything the layout produces
 * must contain every character and every citation of what went in, in order.
 * The shape tests below it are secondary.
 */

/** Every recorded answer, bound the same way the screen binds it. */
function recorded() {
  const file = JSON.parse(readFileSync("data/synthetic/explanations.json", "utf8")) as {
    id: string;
    answer: string;
    cited: string[];
  }[];

  return file.map((entry) => ({
    id: entry.id,
    answer: entry.answer,
    bound: bindCitations(entry.answer, new Set(entry.cited)),
  }));
}

/** Every segment of every block, flattened back into one list. */
function flatten(blocks: AnswerBlock[]) {
  return blocks.flatMap((block) =>
    block.kind === "paragraph"
      ? block.segments
      : block.items.flatMap((item) => item.segments),
  );
}

describe("laying an answer out", () => {
  it("keeps every citation, in the order it was written", () => {
    for (const { id, bound } of recorded()) {
      const before = bound.segments.filter((s) => s.kind === "citation").map((s) => s.recordId);
      const after = flatten(toAnswerBlocks(bound.segments))
        .filter((s) => s.kind === "citation")
        .map((s) => s.recordId);

      expect(after, `${id} lost or reordered a citation`).toEqual(before);
    }
  });

  /**
   * Every non-space character survives. Whitespace is deliberately excluded:
   * the layout's whole job is to turn blank lines into structure, so the line
   * breaks are expected to disappear. Nothing else is.
   *
   * The list markers are put back before comparing, because they move out of
   * the prose and into a gutter rather than being deleted, and a comparison
   * that ignored them would pass on a layout that dropped them.
   */
  it("keeps every character of the answer, including the list markers", () => {
    for (const { id, bound } of recorded()) {
      const squash = (text: string) => text.replace(/\s+/g, "");

      const before = squash(
        bound.segments.map((s) => (s.kind === "text" ? s.text : s.recordId)).join(""),
      );

      const after = squash(
        toAnswerBlocks(bound.segments)
          .map((block) =>
            block.kind === "paragraph"
              ? block.segments.map((s) => (s.kind === "text" ? s.text : s.recordId)).join("")
              : block.items
                  .map(
                    (item) =>
                      `${item.marker})` +
                      item.segments.map((s) => (s.kind === "text" ? s.text : s.recordId)).join(""),
                  )
                  .join(""),
          )
          .join(""),
      );

      expect(after, `${id} lost text on its way to the screen`).toBe(before);
    }
  });

  it("never emits an empty block or an empty item", () => {
    for (const { id, bound } of recorded()) {
      for (const block of toAnswerBlocks(bound.segments)) {
        if (block.kind === "paragraph") {
          expect(block.segments.length, `${id} produced an empty paragraph`).toBeGreaterThan(0);
        } else {
          expect(block.items.length, `${id} produced an empty list`).toBeGreaterThan(0);
          for (const item of block.items) {
            expect(item.segments.length, `${id} produced an empty list item`).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  /**
   * The layout can only recover structure the model actually wrote, so a
   * recorded answer with no blank line in it renders as a wall of prose no
   * matter how good this module is. Two of the six were exactly that, and the
   * screen looked broken while every test here passed.
   *
   * This is therefore a test of the DATA, not of the code: it fails if an
   * answer is ever recorded that arrives as a single block.
   */
  it("has no recorded answer that lays out as a single block", () => {
    for (const { id, bound } of recorded()) {
      const blocks = toAnswerBlocks(bound.segments);
      expect(blocks.length, `${id} is one undivided block of prose`).toBeGreaterThan(1);
    }
  });

  /**
   * The other half of the same failure. One answer numbered its three findings
   * "(1)", "(2)", "(3)" inside a running sentence, where nothing can see them:
   * a marker is only a marker to this module at the start of its own line. The
   * prompt now says so, and this fails if an answer comes back ignoring it.
   */
  it("has no recorded answer that numbers its points inside a sentence", () => {
    for (const { id, answer } of recorded()) {
      expect(/\(\d\)/.test(answer), `${id} numbers a point inline as (1)`).toBe(false);
    }
  });

  /** The second answer a person complained about, pinned by shape. */
  it("breaks the GSTR-2B gap answer into three numbered reasons", () => {
    const answer = recorded().find((entry) => entry.id === "missing-tax");
    expect(answer, "the missing-tax example is missing").toBeDefined();

    const blocks = toAnswerBlocks(answer!.bound.segments);
    const list = blocks.find((block) => block.kind === "list");
    expect(list?.kind === "list" && list.items.map((item) => item.marker)).toEqual(["1", "2", "3"]);
  });

  /**
   * The answer the complaint was actually about: three findings and eleven
   * citations, delivered as one block. Pinned by shape rather than by prose so
   * that re-recording the answers does not break it, but tight enough that a
   * regression back to one paragraph fails here.
   */
  it("breaks the settlement answer into an opening, a numbered list and a total", () => {
    const answer = recorded().find((entry) => entry.id === "settlement-short");
    expect(answer, "the settlement-short example is missing").toBeDefined();

    const blocks = toAnswerBlocks(answer!.bound.segments);
    expect(blocks.length, "the answer was not split up at all").toBeGreaterThan(1);

    const lists = blocks.filter((block) => block.kind === "list");
    expect(lists.length).toBe(1);
    expect(lists[0].kind === "list" && lists[0].items.map((item) => item.marker)).toEqual([
      "1",
      "2",
      "3",
    ]);
  });

  /**
   * The recorded answers never happen to start a paragraph with a citation, so
   * conservation over the fixture alone does not exercise the one branch where
   * a citation arrives with no text before it. A mutation that dropped exactly
   * that citation passed every test above. This is the case that catches it.
   */
  it("keeps a citation that opens a paragraph", () => {
    const bound = bindCitations(
      "Two records are at risk.\n\n[pay_A] is the larger of them, then [pay_B].",
      new Set(["pay_A", "pay_B"]),
    );
    const blocks = toAnswerBlocks(bound.segments);

    expect(blocks.length).toBe(2);
    expect(flatten(blocks).filter((s) => s.kind === "citation").map((s) => s.recordId)).toEqual([
      "pay_A",
      "pay_B",
    ]);
    expect(blocks[1].kind === "paragraph" && blocks[1].segments[0]?.kind).toBe("citation");
  });

  /** The same, inside a numbered item, which reaches the marker code as well. */
  it("keeps a citation that opens a numbered item", () => {
    const bound = bindCitations(
      "Two things went wrong.\n\n1) [pay_A] was overcharged.\n\n2) [pay_B] was refunded.",
      new Set(["pay_A", "pay_B"]),
    );
    const blocks = toAnswerBlocks(bound.segments);

    expect(flatten(blocks).filter((s) => s.kind === "citation").map((s) => s.recordId)).toEqual([
      "pay_A",
      "pay_B",
    ]);
    const list = blocks.find((block) => block.kind === "list");
    expect(list?.kind === "list" && list.items.map((item) => item.marker)).toEqual(["1", "2"]);
  });

  it("leaves an answer with no structure in it as a single paragraph", () => {
    const bound = bindCitations("One sentence, no breaks, one record [pay_A].", new Set(["pay_A"]));
    const blocks = toAnswerBlocks(bound.segments);

    expect(blocks.length).toBe(1);
    expect(blocks[0].kind).toBe("paragraph");
  });

  /**
   * A single newline is a wrap, not a break. Only a blank line separates two
   * points, and splitting on any newline would cut a soft-wrapped sentence in
   * half. No recorded answer contains a lone newline today, so this is the only
   * thing standing between that and a paragraph break in the middle of a
   * sentence.
   */
  it("treats a single newline as a wrap rather than a new paragraph", () => {
    const bound = bindCitations("One sentence that\nwrapped once.", new Set());
    const blocks = toAnswerBlocks(bound.segments);

    expect(blocks.length).toBe(1);
  });

  /** A number that opens a sentence is not a list marker. Only "1)" is. */
  it("does not mistake a sentence beginning with a figure for a list", () => {
    const bound = bindCitations("2026 was the period.\n\n38 records matched.", new Set());
    const blocks = toAnswerBlocks(bound.segments);

    expect(blocks.map((block) => block.kind)).toEqual(["paragraph", "paragraph"]);
  });
});
