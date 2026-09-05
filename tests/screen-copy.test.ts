import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The punctuation that reads as machine-written, and the words that give away
 * the occasion rather than the product.
 *
 * Both rules exist because a person told us the page failed them, not because a
 * style guide says so. The em dash is the single most recognisable tell of
 * generated prose, and a page that looks generated undermines a product whose
 * entire argument is that a person can check its working. The occasion words
 * are worse: copy that names the event it was written for stops being about the
 * product the moment the event is over.
 *
 * This is a lint the eye cannot do. The dashes were spread across a dozen files
 * and a search-and-replace would have found the ones already there without
 * stopping the next one, which is the only failure that matters.
 */
const BANNED_PUNCTUATION = [
  { char: "—", name: "an em dash" },
  { char: "–", name: "an en dash" },
];

const BANNED_WORDS = ["demo", "judge", "on stage", "pitch"];

/**
 * Where the reader's words live.
 *
 * `src/app` is every screen, and the two library files below are the ones whose
 * strings are rendered verbatim: the verdict headlines in the detail panel, and
 * the narrated tool calls beside them. Everything else in `src/lib` is either
 * arithmetic or a developer-facing error message.
 */
const COPY_FILES = [
  ...walk("src/app"),
  "src/lib/review/explain.ts",
  "src/lib/review/trace-summary.ts",
  "src/lib/format/record.ts",
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return walk(path);
    return path.endsWith(".ts") || path.endsWith(".tsx") ? [path] : [];
  });
}

/**
 * The file with its comments removed.
 *
 * Comments are for whoever maintains this and are not copy, so they are held to
 * the prose rules but not to this one. Stripping them is what makes the test
 * usable: without it every explanatory comment in the codebase would have to be
 * rewritten to keep the page's punctuation clean, and the test would be turned
 * off within a week.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("on-screen copy", () => {
  it("finds every file it is meant to be checking", () => {
    // A walk that silently returns nothing passes every assertion below it.
    expect(COPY_FILES.length).toBeGreaterThan(10);
    expect(COPY_FILES).toContain("src/app/site-footer.tsx");
    expect(COPY_FILES).toContain("src/lib/review/explain.ts");
  });

  it("can tell a comment from a string", () => {
    // The stripper is the part of this test most likely to be wrong, and a
    // stripper that removed everything would make the whole file pass.
    const sample = `// a — comment\nconst s = "kept";\n/* block — comment */\nconst t = "also kept";`;
    const stripped = withoutComments(sample);
    expect(stripped).toContain("kept");
    expect(stripped).toContain("also kept");
    expect(stripped).not.toContain("—");
  });

  for (const { char, name } of BANNED_PUNCTUATION) {
    it(`never puts ${name} in front of a reader`, () => {
      const offenders = COPY_FILES.filter((file) =>
        withoutComments(readFileSync(file, "utf8")).includes(char),
      );
      expect(offenders).toEqual([]);
    });
  }

  for (const word of BANNED_WORDS) {
    it(`never says "${word}" anywhere in the product`, () => {
      // These name the occasion rather than the product. Checked against the
      // whole file, comments included: a comment that says what the screen is
      // for is exactly the kind of thing that gets read out loud later.
      const pattern = new RegExp(`\\b${word.replace(" ", "\\s")}\\b`, "i");
      const offenders = COPY_FILES.filter((file) => pattern.test(readFileSync(file, "utf8")));
      expect(offenders).toEqual([]);
    });
  }
});
