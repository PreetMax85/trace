import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

/**
 * Header, page, footer: the frame every route sits inside.
 *
 * One component rather than three in the layout because the column has to own
 * the page height. The footer belongs below the content on a short page and
 * after it on a long one, which is what `min-h-dvh` plus a growing middle gets.
 * `dvh` rather than `vh` so a mobile browser's collapsing address bar does not
 * leave a strip of nothing under the footer.
 *
 * A server component. Nothing here holds state, so none of it needs to reach the
 * browser as JavaScript.
 */
export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {/*
        The first focusable thing in the document. Without it the only way past
        the chrome with a keyboard was to tab through every cell of the table,
        and the table advertises hundreds of stops.
      */}
      <a
        href="#reconciliation"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Skip to the reconciliation
      </a>
      <SiteHeader />
      <main className="flex flex-1 flex-col">{children}</main>
      <SiteFooter />
    </div>
  );
}
