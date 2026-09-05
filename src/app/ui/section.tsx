import { cn } from "@/lib/utils";
import { SCROLL_MARGIN } from "../sections";
import { SectionTitle } from "./type";

/**
 * A named part of the page, drawn as a sheet with a real edge.
 *
 * The screen used to be one continuous column: a reader scrolling it had no way
 * to tell where the reconciliation ended and the question box began, and a
 * screen reader had no landmarks at all. Space alone did not fix it, because the
 * panels were white on a near-white page and there was nothing to see. Each
 * section is now a bordered sheet with its own header band, so the boundary is
 * drawn rather than implied.
 *
 * The heading level is fixed at `h2` rather than passed in. There is exactly one
 * `h1` on this page and everything else sits directly under it, so a prop here
 * would only ever be an opportunity to break the outline.
 */
export function Section({
  id,
  title,
  description,
  actions,
  tone = "ledger",
  children,
  bodyClassName,
  "data-testid": testId,
}: {
  id?: string;
  title: string;
  description?: string;
  /** Controls that belong to the section rather than to its content. */
  actions?: React.ReactNode;
  /**
   * Who produced what is inside.
   *
   * `ledger` is arithmetic over the settlement rows and the GSTR-2B file, drawn
   * as paper. `agent` is a section whose content a model wrote, drawn on the
   * indigo ground. This is the page's provenance claim made visible: it says in
   * colour what the copy says in words, that no figure here came from a model,
   * and it means a reader can tell the two apart without reading a caption.
   */
  tone?: "ledger" | "agent";
  children: React.ReactNode;
  bodyClassName?: string;
  "data-testid"?: string;
}) {
  const isAgent = tone === "agent";

  return (
    <section
      id={id}
      data-testid={testId}
      data-tone={tone}
      // No `overflow-hidden` here, however tempting it is for clipping the
      // header band to the rounded corner. It makes the section a scroll
      // container, and a `position: sticky` child then sticks to a box that
      // never scrolls, so the detail panel silently stopped following the
      // reader down a table of 54 rows. Nothing about the section looked wrong;
      // the panel just was not there when it was needed.
      className={cn(
        "rounded-xl border",
        // A section with an id is something the header links to, so it needs
        // room above it to come to rest in. Landing flush with the top of the
        // page puts the heading underneath the sticky header, and the reader
        // arrives looking at a paragraph with no idea whether they got there.
        id !== undefined && SCROLL_MARGIN,
        isAgent ? "border-agent-border bg-agent" : "border-border bg-card",
      )}
    >
      <header
        className={cn(
          "flex flex-wrap items-end justify-between gap-4 border-b px-5 py-4 sm:px-6",
          isAgent ? "border-agent-border" : "border-border",
        )}
      >
        <div className="flex min-w-0 flex-col gap-1.5">
          <SectionTitle>{title}</SectionTitle>
          {/* Body size, not caption. The heading above it is the largest thing
              on the page after the headline, and a sentence set in small print
              underneath read as a footnote to it rather than as the line that
              says what the section is for. */}
          {description !== undefined && (
            <p className="max-w-[68ch] text-body text-muted-foreground">{description}</p>
          )}
        </div>
        {actions}
      </header>
      <div className={cn("px-5 py-5 sm:px-6", bodyClassName)}>{children}</div>
    </section>
  );
}
