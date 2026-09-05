import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { beforeAll, describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

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
 *
 * The second rule is newer and cost more to learn. Declaring the token is not
 * the same as the class working, because `text-*` serves two theme namespaces at
 * once: `--text-name` for a size and `--color-name` for a colour. When a role's
 * name exists in both, the colour wins silently. A role called `card` collided
 * with shadcn's `--color-card`, so `text-card` compiled to `color: #ffffff` and
 * set no size at all: the wordmark was painted white on a white header and read
 * as missing rather than as broken. The old version of this file asserted the
 * token was DECLARED, which it was, all along. So the check below compiles the
 * real stylesheet and looks at what the class actually produces.
 */
const SCALE_ROLES = ["display", "section", "title", "body", "caption", "mono"];

/** Tailwind's escape hatch for a one-off size, which is what this test bans. */
const ARBITRARY_SIZE = /\btext-\[/;

/**
 * Tailwind's own size names, which this test also bans, everywhere.
 *
 * `text-sm` and friends are not part of this project's scale and nothing on
 * screen should be set in them. The rule matters most inside the components,
 * because a size baked into a variant there is invisible from the screen that
 * uses it and cannot reliably be overridden from the call site either: class
 * merging does not know that `text-sm` and `text-body` are competing for one
 * property, so both survive and which one wins depends on the order they
 * happen to compile in.
 *
 * This is the guard for a complaint that arrived from a person rather than a
 * test. Every accordion question on the page was 14px, one pixel below the
 * page's own body role and three below what a question should be, purely
 * because the component shipped that way.
 */
const LIBRARY_SIZE = /\btext-(xs|sm|base|lg|xl|[2-9]xl)\b(?!`)/;

/**
 * One exemption, named rather than pattern-matched.
 *
 * A text field set below 16px makes iOS zoom the whole page when it takes
 * focus, and this project's body role is 15px. The question box therefore
 * keeps Tailwind's 16px up to `md` and takes the role from there up. Nothing
 * else may do this: an exemption has to be listed here, with a reason.
 */
const LIBRARY_SIZE_EXEMPT = new Set(["src/components/ui/input.tsx"]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return walk(path);
    return path.endsWith(".ts") || path.endsWith(".tsx") ? [path] : [];
  });
}

const SCREEN_FILES = walk("src/app");
const COMPONENT_FILES = walk("src/components");
const globals = readFileSync("src/app/globals.css", "utf8");

/**
 * Run the stylesheet through Tailwind and return each role's compiled rule.
 *
 * `@source inline(...)` is what makes this independent of where the classes
 * happen to be used. Without it Tailwind only emits a class it found in the
 * source tree, so retiring the last use of a role would quietly empty this test
 * instead of failing it.
 */
async function compile(css: string): Promise<Map<string, string>> {
  const entry = `${css}\n@source inline("text-{${SCALE_ROLES.join(",")},card}");\n`;
  const { css: out } = await postcss([tailwind()]).process(entry, {
    from: "src/app/globals.css",
  });
  const rules = new Map<string, string>();
  for (const match of out.matchAll(/\.(text-[a-z-]+)\s*\{([^}]*)\}/g)) {
    rules.set(match[1], match[2]);
  }
  return rules;
}

let compiled: Map<string, string>;
beforeAll(async () => {
  compiled = await compile(globals);
}, 30_000);

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

  /**
   * The components are checked as well as the screens, and a comment carrying
   * one of these names in backticks does not count: the two files that explain
   * WHY the rule exists both have to name it.
   */
  it("never lets a component ship a size of the library's own", () => {
    const offenders = [...SCREEN_FILES, ...COMPONENT_FILES].filter((file) => {
      if (LIBRARY_SIZE_EXEMPT.has(file)) return false;
      const source = readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("//") && !line.trimStart().startsWith("*"))
        .join("\n");
      return LIBRARY_SIZE.test(source) || ARBITRARY_SIZE.test(source);
    });
    expect(offenders).toEqual([]);
  });

  /**
   * The second half of the same trap, and the one that actually shipped.
   *
   * Compiling correctly is not enough: `cn` still has to decide which of two
   * `text-*` classes wins, and it decides from the NAME. A role it has not been
   * told about is neither a t-shirt size nor an arbitrary length, so it gets
   * filed as a colour and evicts the real one. That is how the Confirm buttons
   * came to paint their label in the page's ordinary ink on an indigo ground:
   * the variant set `text-primary-foreground` and the size set `text-caption`
   * after it.
   */
  it("keeps a role and a colour together instead of treating the role as one", () => {
    for (const role of SCALE_ROLES) {
      const merged = cn("text-primary-foreground", `text-${role}`).split(" ");
      expect(merged, `text-${role} evicted the colour beside it`).toContain(
        "text-primary-foreground",
      );
      expect(merged, `text-${role} was dropped`).toContain(`text-${role}`);
    }
  });

  it("still lets one role replace another", () => {
    expect(cn("text-body", "text-caption")).toBe("text-caption");
  });

  it("compiles every role to a font size and to nothing else", async () => {
    // Declared is not the same as applied. This is the assertion the old file
    // was missing, and it is the reason a dead role survived a green suite.
    for (const role of SCALE_ROLES) {
      const rule = compiled.get(`text-${role}`);
      expect(rule, `text-${role} produced no CSS at all`).toBeDefined();
      expect(rule, `text-${role} sets no font size`).toContain("font-size");
      expect(rule, `text-${role} paints a colour, so its name collides with a colour token`)
        .not.toContain("color:");
    }
  });

  it("can actually see a role that collides with a colour", async () => {
    // The check above only means something if it fails on the bug it was
    // written for, so reproduce that bug and watch it fail.
    const broken = await compile(globals.replace(/--text-title:/, "--text-card:"));
    const rule = broken.get("text-card");
    expect(rule).toContain("color:");
    expect(rule).not.toContain("font-size");
  });

  it("can actually see an invented size", () => {
    // The regex is the part of this test most likely to be wrong, and one that
    // matched nothing would pass the check above on an empty codebase.
    expect(ARBITRARY_SIZE.test('className="text-[13px]"')).toBe(true);
    expect(ARBITRARY_SIZE.test('className="text-caption"')).toBe(false);
  });
});
