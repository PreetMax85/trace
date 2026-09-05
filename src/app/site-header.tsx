import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BRAND_COLOR, BRAND_ON_COLOR } from "./brand";
import { MERCHANT_GSTIN } from "./merchant";
import { REPO_URL } from "./site-links";
import { GithubMark } from "./ui/icons";
import { ThemeToggle } from "./theme-toggle";

/**
 * The product's name, whose books these are, and the way out to the source.
 *
 * This exists because the screen below it had neither a name nor an owner. Every
 * figure on it was right and none of it said what it was: the name lived only in
 * the browser tab, so a first-time reader met a table of settlement rows with no
 * way to tell whose data it was or what had been done to it.
 *
 * The GSTIN sits here rather than in the page's opening line. A tax registration
 * number is not a headline, it is the answer to "whose return is this", and that
 * question is asked once and stays answered, which is exactly what chrome is
 * for. It also survives scrolling, where the old placement did not.
 *
 * Sticky, and the only sticky thing in the layout. A page this long loses its
 * own name three screens down otherwise.
 *
 * Rendered in the root layout rather than on the page, so the 404 and the error
 * screen carry it too. Those are somebody's first contact with this as surely as
 * the home page is.
 */
export function SiteHeader() {
  return (
    <header
      data-testid="site-header"
      className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <Mark />
          <div className="flex flex-col leading-tight">
            <span className="font-serif text-card font-medium tracking-tight">Trace</span>
            <span className="text-caption text-muted-foreground">
              Settlement GST against GSTR-2B
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="hidden rounded-md border border-border bg-muted px-2 py-1 font-mono text-mono text-muted-foreground sm:inline-block">
                  {MERCHANT_GSTIN}
                </span>
              }
            />
            <TooltipContent>The GST registration these books belong to</TooltipContent>
          </Tooltip>

          {/* The repository as a mark rather than the words "Source on GitHub".
              Everyone recognises it, it costs a fifth of the width, and it stops
              the header reading as two competing sentences. The label is still
              there for a screen reader and for anyone hovering. */}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  render={<a href={REPO_URL} target="_blank" rel="noreferrer noopener" />}
                  aria-label="Source on GitHub"
                >
                  <GithubMark className="size-4" />
                </Button>
              }
            />
            <TooltipContent>Source on GitHub</TooltipContent>
          </Tooltip>

          <ThemeToggle />
        </div>
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
 * Its colours are fixed rather than themed. A logo that changes shade with the
 * colour scheme reads as two different logos, and this pair carries enough
 * contrast to sit on either ground.
 */
function Mark() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" role="img" aria-label="Trace" className="shrink-0">
      <rect width="32" height="32" rx="7" fill={BRAND_COLOR} />
      <path d="M8 11h16" stroke={BRAND_ON_COLOR} strokeWidth="3" strokeLinecap="round" />
      <path d="M16 11v13" stroke={BRAND_ON_COLOR} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
