import { buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BRAND_COLOR, BRAND_ON_COLOR } from "./brand";
import { REPO_URL } from "./site-links";
import { SiteNav } from "./site-nav";
import { GithubMark } from "./ui/icons";

/**
 * The product's name, what it does, and the way into the rest of the page.
 *
 * This exists because the screen below it had neither a name nor a purpose on
 * it. Every figure was right and none of it said what it was: the name lived
 * only in the browser tab, so a first-time reader met a table of settlement
 * rows with no way to tell what had been done to them.
 *
 * Name and one-line subtitle, and nothing else on the left. It is the only
 * thing on the page answering "what is this" before anybody has read a figure,
 * and it has to be readable in the second before a person decides whether to
 * stay. The GSTIN used to sit up here as well; it is a fact about whose books
 * these are, which matters to the merchant and means nothing to a stranger, so
 * it has moved to the footer where facts about the run belong.
 *
 * Sticky, and the only sticky thing in the layout. A page this long loses its
 * own name three screens down otherwise. Opaque rather than translucent: a
 * blurred header is a full-width backdrop-filter layer that has to re-rasterise
 * on every scroll, and at 85% opacity the table underneath was legibly showing
 * through the product's own name.
 *
 * Rendered in the root layout rather than on the page, so the 404 and the error
 * screen carry it too. Those are somebody's first contact with this as surely as
 * the home page is.
 */
export function SiteHeader() {
  return (
    <header
      data-testid="site-header"
      className="sticky top-0 z-40 border-b border-border bg-background"
    >
      {/*
        Three columns on a wide screen, with the outer two the same width, which
        is what actually centres the links: centring them inside a flex row
        instead would put them wherever the mark and the source link left room,
        and they would drift as either changed. Below `md` there are two columns
        and the links take a row of their own underneath, because the three
        labels plus the mark do not fit across a phone.
      */}
      <div className="mx-auto grid max-w-[1400px] grid-cols-[1fr_auto] items-center gap-x-6 gap-y-1 px-4 py-3 sm:px-6 md:grid-cols-[1fr_auto_1fr]">
        <div className="flex min-w-0 items-center gap-3">
          <Mark />
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="font-serif text-title font-medium">Trace</span>
            <span className="truncate text-caption text-muted-foreground">
              Settlement GST against GSTR-2B
            </span>
          </div>
        </div>

        <SiteNav className="order-last col-span-2 min-w-0 pb-1 md:order-none md:col-span-1 md:pb-0" />

        {/* The repository as a mark rather than the words "Source on GitHub".
            Everyone recognises it, it costs a fifth of the width, and it stops
            the header reading as two competing sentences. The label is still
            there for a screen reader and for anyone hovering.

            Drawn at 20px in a 32px button, which is the size of the product's
            own mark at the other end of the row. At the icon default of 16 it
            read as a disabled control rather than the one link out of here. */}
        <Tooltip>
          <TooltipTrigger
            render={
              // An anchor wearing the button's classes. Base UI's Button
              // enforces button semantics and refuses an anchor, correctly:
              // this opens a new tab and belongs on the link contract.
              <a
                href={REPO_URL}
                target="_blank"
                rel="noreferrer noopener"
                aria-label="Source on GitHub"
                className={buttonVariants({
                  variant: "ghost",
                  size: "icon-sm",
                  className: "size-8 justify-self-end",
                })}
              >
                <GithubMark className="size-5" />
              </a>
            }
          />
          <TooltipContent>Source on GitHub</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}

/**
 * The wordless half of the logo, inline rather than an `<img>`.
 *
 * The same mark as `icon.svg`, which is the browser tab's favicon, and as the
 * one drawn on the link preview in `opengraph-image.tsx`. Change one and change
 * all three. Inlined so it paints with the first HTML rather than after a second
 * request; the header is the one thing on the page that must not arrive late.
 *
 * Its colours are fixed rather than themed, and carry enough contrast to sit on
 * either a light or a dark ground, so the same file serves the page, the
 * favicon and the link preview without a variant of its own.
 */
function Mark() {
  return (
    <svg
      width="34"
      height="34"
      viewBox="0 0 32 32"
      role="img"
      aria-label="Trace"
      className="shrink-0"
    >
      <rect width="32" height="32" rx="7" fill={BRAND_COLOR} />
      <path d="M8 11h16" stroke={BRAND_ON_COLOR} strokeWidth="3" strokeLinecap="round" />
      <path d="M16 11v13" stroke={BRAND_ON_COLOR} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
