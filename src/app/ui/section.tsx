import { cn } from "@/lib/utils";
import { Caption, SectionTitle } from "./type";

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
  children,
  bodyClassName,
  "data-testid": testId,
}: {
  id?: string;
  title: string;
  description?: string;
  /** Controls that belong to the section rather than to its content. */
  actions?: React.ReactNode;
  children: React.ReactNode;
  bodyClassName?: string;
  "data-testid"?: string;
}) {
  return (
    <section
      id={id}
      data-testid={testId}
      // No `overflow-hidden` here, however tempting it is for clipping the
      // header band to the rounded corner. It makes the section a scroll
      // container, and a `position: sticky` child then sticks to a box that
      // never scrolls, so the detail panel silently stopped following the
      // reader down a table of 54 rows. Nothing about the section looked wrong;
      // the panel just was not there when it was needed.
      className="rounded-xl border border-border bg-card"
    >
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
        <div className="flex min-w-0 flex-col gap-1">
          <SectionTitle>{title}</SectionTitle>
          {description !== undefined && (
            <Caption as="p" className="max-w-[68ch]">
              {description}
            </Caption>
          )}
        </div>
        {actions}
      </header>
      <div className={cn("px-5 py-5 sm:px-6", bodyClassName)}>{children}</div>
    </section>
  );
}
