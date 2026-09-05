import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SECTIONS } from "../src/app/sections";

/**
 * The header and the footer link to three sections by id. Nothing in the type
 * system connects a link to its destination, so the failure mode is silent: an
 * id renamed on one side leaves a link that scrolls nowhere, which on screen is
 * indistinguishable from a link that worked and a page that happened to be
 * short. It would also survive typecheck, lint and every other test here.
 *
 * These read the rendered source rather than the DOM, because the question is
 * whether the two literals agree, and that is answerable without a browser.
 */

/** Every `.tsx` under `src/app`, flattened. */
function screens(): { path: string; source: string }[] {
  const root = join(process.cwd(), "src", "app");
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return walk(path);
      return entry.name.endsWith(".tsx") ? [path] : [];
    });
  return walk(root).map((path) => ({ path, source: readFileSync(path, "utf8") }));
}

/**
 * Every `<Section ...>` opening tag on the screen, as its literal props.
 *
 * `\b` after the name so this does not also collect `<SectionTitle>`, which is
 * a different component and carries neither of these props.
 */
function sectionTags(): { id: string | null; title: string | null }[] {
  return screens().flatMap(({ source }) =>
    [...source.matchAll(/<Section\b([^>]*)>/g)].map((match) => ({
      id: match[1].match(/\bid="([^"]+)"/)?.[1] ?? null,
      title: match[1].match(/\btitle="([^"]+)"/)?.[1] ?? null,
    })),
  );
}

describe("the page's jump links", () => {
  it("each have a section on the page to land on", () => {
    const rendered = new Set(
      sectionTags()
        .map((tag) => tag.id)
        .filter((id): id is string => id !== null),
    );

    for (const section of SECTIONS) {
      expect(rendered, `nothing on the page renders id="${section.id}"`).toContain(section.id);
    }
  });

  /**
   * A reader confirms they arrived by matching the link they clicked against
   * the heading in front of them. A link called something its destination never
   * says leaves them checking whether the jump worked, which is most of the
   * value of the jump.
   */
  it("are labelled with the heading they land on, word for word", () => {
    const titleById = new Map(
      sectionTags()
        .filter((tag) => tag.id !== null)
        .map((tag) => [tag.id as string, tag.title]),
    );

    for (const section of SECTIONS) {
      expect(
        titleById.get(section.id),
        `the link says "${section.label}" but the section it lands on is titled differently`,
      ).toBe(section.label);
    }
  });

  it("name each section once, so two do not answer to the same anchor", () => {
    const ids = SECTIONS.map((section) => section.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /**
   * The header builds its links from this list rather than writing the hrefs
   * out, which is what keeps the labels and the anchors in step. This asserts
   * it has not quietly gone back to hardcoding one.
   *
   * The footer used to be checked here too. It carries no links now: the header
   * is sticky, so the way to a section is on screen at every point of the page,
   * and a second copy at the bottom was insurance against that having failed.
   */
  it("are built from the shared list in the header", () => {
    for (const file of ["site-nav.tsx"]) {
      const source = readFileSync(join(process.cwd(), "src", "app", file), "utf8");
      expect(source, `${file} does not read the shared section list`).toContain("SECTIONS");
      for (const section of SECTIONS) {
        expect(
          source.includes(`"#${section.id}"`),
          `${file} hardcodes an anchor instead of mapping the shared list`,
        ).toBe(false);
      }
    }
  });
});
