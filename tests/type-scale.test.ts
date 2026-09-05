import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The type scale is a fixed set of roles, and this is what keeps it fixed.
 *
 * The complaint that produced it was that the screen looked "very, very
 * disoriented", with fonts of several sizes visible at once. It was true: eight
 * steps were in use and several were two pixels apart, which reads as a mistake
 * rather than as a hierarchy. Nothing about that is caught by a typechecker or
 * by looking at one file, because each individual size was reasonable where it
 * was written. Only the total is wrong.
 *
 * So the rule is mechanical: every size a screen uses has to be one of the named
 * roles, and a role can only be added by adding a token in `globals.css`. An
 * arbitrary size written inline is exactly how the eight steps happened.
 */
const SCALE_ROLES = ["display", "section", "card", "body", "caption", "mono"];

/** Tailwind's escape hatch for a one-off size, which is what this test bans. */
const ARBITRARY_SIZE = /\btext-\[/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return walk(path);
    return path.endsWith(".ts") || path.endsWith(".tsx") ? [path] : [];
  });
}

const SCREEN_FILES = walk("src/app");
const globals = readFileSync("src/app/globals.css", "utf8");

describe("the type scale", () => {
  it("finds the screens it is meant to be checking", () => {
    // A walk that silently returns nothing passes every assertion below it.
    expect(SCREEN_FILES.length).toBeGreaterThan(10);
    expect(SCREEN_FILES).toContain("src/app/hero.tsx");
  });

  it("defines every role as a token, and no others", () => {
    const declared = [...globals.matchAll(/^\s*--text-([a-z]+):/gm)].map((match) => match[1]);
    expect(declared.sort()).toEqual([...SCALE_ROLES].sort());
  });

  it("never lets a screen invent a size of its own", () => {
    const offenders = SCREEN_FILES.filter((file) =>
      ARBITRARY_SIZE.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("can actually see an invented size", () => {
    // The regex is the part of this test most likely to be wrong, and one that
    // matched nothing would pass the check above on an empty codebase.
    expect(ARBITRARY_SIZE.test('className="text-[13px]"')).toBe(true);
    expect(ARBITRARY_SIZE.test('className="text-caption"')).toBe(false);
  });
});
