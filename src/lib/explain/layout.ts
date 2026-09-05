import type { AnswerSegment } from "./citations";

/**
 * The shape an answer is laid out in, recovered from the shape it was written
 * in.
 *
 * The model already writes structure. It separates its points with blank lines
 * and numbers them "1)", "2)", "3)", and the recorded answers on disk carry
 * every one of those breaks. The screen threw all of it away: `segments` is a
 * flat list and the panel dropped the flat list into a single paragraph, so an
 * answer that was written as an opening sentence, three numbered findings and a
 * closing total arrived as one unbroken block with eleven record ids running
 * through it. Nobody reads that, and the point of the citations is that somebody
 * checks them.
 *
 * So this is not reformatting, it is un-flattening: no character is added,
 * removed or reordered, and the only thing recovered is the grouping the model
 * put there. Chunking prose into short blocks with a heading or a marker on each
 * is the single most reliable thing you can do for a scanning reader, and the
 * consumer-testing literature on financial disclosure says the same thing about
 * numbers specifically: separated figures are understood where the same figures
 * in prose are not.
 *
 * It is a pure function over the segments so it can be tested against a real
 * recorded answer without a browser, which is the only way to be sure that
 * un-flattening never drops a citation.
 */

/** One paragraph's worth of segments, with its list marker if it had one. */
export type AnswerParagraph = {
  /**
   * The "1" of a "1)" the paragraph opened with, if any.
   *
   * Kept as the author wrote it rather than regenerated from the position, so a
   * list that starts at 2, or skips a number, is shown as it actually is.
   */
  marker: string | null;
  segments: AnswerSegment[];
};

/**
 * A run of consecutive numbered paragraphs, or a single unnumbered one.
 *
 * Grouped into runs so the numbered findings become one list rather than three
 * paragraphs that happen to start with digits. A list is what tells a reader
 * how many things there are before they have read any of them.
 */
export type AnswerBlock =
  | { kind: "paragraph"; segments: AnswerSegment[] }
  | { kind: "list"; items: AnswerParagraph[] };

/** A leading "1)" or "1." and the space after it, which becomes the marker. */
const MARKER = /^\s*(\d{1,2})[).]\s+/;

/** Two or more newlines: the break the model uses between its points. */
const BREAK = /\n{2,}/;

export function toAnswerBlocks(segments: AnswerSegment[]): AnswerBlock[] {
  const paragraphs = splitParagraphs(segments);
  const blocks: AnswerBlock[] = [];

  for (const paragraph of paragraphs) {
    if (paragraph.marker === null) {
      blocks.push({ kind: "paragraph", segments: paragraph.segments });
      continue;
    }

    // Extends the list already being built when this paragraph continues one,
    // so three numbered findings are one list and not three.
    const last = blocks.at(-1);
    if (last !== undefined && last.kind === "list") last.items.push(paragraph);
    else blocks.push({ kind: "list", items: [paragraph] });
  }

  return blocks;
}

/**
 * The segments regrouped at every blank line.
 *
 * A citation can never start a paragraph on its own, because a break only ever
 * appears inside a text segment: the marker syntax the model writes is
 * `[pay_ABC]`, which `bindCitations` has already lifted out of the prose, so
 * whatever separated two points is still sitting in the text either side of it.
 */
function splitParagraphs(segments: AnswerSegment[]): AnswerParagraph[] {
  const paragraphs: AnswerParagraph[] = [];
  let current: AnswerSegment[] = [];

  const flush = () => {
    // Trailing whitespace on the last text segment of a paragraph would render
    // as a gap before the full stop of the sentence that follows it.
    const trimmed = trimEnds(current);
    if (trimmed.length > 0) paragraphs.push(readMarker(trimmed));
    current = [];
  };

  for (const segment of segments) {
    if (segment.kind === "citation") {
      current.push(segment);
      continue;
    }

    const parts = segment.text.split(BREAK);
    parts.forEach((part, index) => {
      if (index > 0) flush();
      if (part.length > 0) current.push({ kind: "text", text: part });
    });
  }

  flush();
  return paragraphs;
}

/** Lifts a leading "1)" off a paragraph, leaving the sentence behind it. */
function readMarker(segments: AnswerSegment[]): AnswerParagraph {
  const first = segments[0];
  if (first === undefined || first.kind !== "text") return { marker: null, segments };

  const match = MARKER.exec(first.text);
  if (match === null) return { marker: null, segments };

  const rest = first.text.slice(match[0].length);
  return {
    marker: match[1],
    // A paragraph that was nothing but its marker leaves no text segment
    // behind, rather than an empty one that would render as a stray space.
    segments: rest.length > 0 ? [{ kind: "text", text: rest }, ...segments.slice(1)] : segments.slice(1),
  };
}

/** Whitespace off the front of the first text segment and the back of the last. */
function trimEnds(segments: AnswerSegment[]): AnswerSegment[] {
  const out = segments.map((segment) => ({ ...segment }));

  const first = out[0];
  if (first !== undefined && first.kind === "text") first.text = first.text.replace(/^\s+/, "");

  const last = out.at(-1);
  if (last !== undefined && last.kind === "text") last.text = last.text.replace(/\s+$/, "");

  return out.filter((segment) => segment.kind !== "text" || segment.text.length > 0);
}
