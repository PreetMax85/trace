/**
 * A literal escape sequence a model wrote as six characters instead of the
 * character it names: a backslash, a "u", and four hex digits.
 *
 * This is not a decoding bug on our side. The JSON that arrived was valid and
 * the string it carried really did contain that backslash as text, so nothing
 * between the provider and here had anything to fix. It reaches the reader as
 * visible gibberish in the middle of a sentence about money.
 *
 * The reason it is repaired HERE, on the way out of the model and before any
 * gate runs, is that the figure gate matches on the rupee sign. An answer whose
 * amounts are all written as escape sequences carries no figure the gate can
 * see, so a draft passes the check that exists to catch a wrong number by
 * having no numbers in it at all. Normalising after the gates, or at the point
 * the recording is written, would leave that hole open.
 */
const STRAY_ESCAPE = /\\u([0-9a-fA-F]{4})/g;

/**
 * Whether a code point is safe to write back into copy.
 *
 * Only printable characters are decoded. A model that emitted an escape for a
 * control character or for half a surrogate pair meant something we cannot
 * recover, and turning that into the real character would bury it inside an
 * email body rather than leaving it visible where the punctuation lint can
 * still find it.
 */
function printable(code: number): boolean {
  return code >= 0x20 && !(code >= 0xd800 && code <= 0xdfff);
}

/** One string with its stray escape sequences turned back into characters. */
export function decodeStrayEscapes(text: string): string {
  return text.replace(STRAY_ESCAPE, (whole, hex: string) => {
    const code = Number.parseInt(hex, 16);
    return printable(code) ? String.fromCodePoint(code) : whole;
  });
}

/**
 * The same repair applied to every string in a structure, however nested.
 *
 * Takes and returns `unknown` because it sits between the SDK and the schema
 * parse, where the shape has not been established yet. Non-strings pass through
 * untouched, so a number never becomes a string on the way.
 */
export function decodeStrayEscapesDeep(value: unknown): unknown {
  if (typeof value === "string") return decodeStrayEscapes(value);
  if (Array.isArray(value)) return value.map(decodeStrayEscapesDeep);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, decodeStrayEscapesDeep(entry)]),
    );
  }
  return value;
}
