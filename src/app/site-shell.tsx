import { SiteHeader } from "./site-header";

/**
 * Header and page: the frame every route sits inside.
 *
 * One component rather than two in the layout because the column has to own the
 * page height, so a route with little in it still paints its ground to the
 * bottom of the window rather than leaving a strip of white under it. `dvh`
 * rather than `vh` so a mobile browser's collapsing address bar does not open
 * that strip up again as it slides away.
 *
 * There is no footer. There was one, and everything it carried is said earlier
 * where a reader meets it in time to use it: what Trace does is the first
 * screen, that nothing is ever sent or filed is beside every Confirm button,
 * that the merchant is invented is stated above the table and again in the FAQ,
 * and the three jump links are in a header that never leaves the screen. A
 * footer would be a second copy of all of it, insurance against the page above
 * having failed.
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
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-body focus:text-primary-foreground"
      >
        Skip to the reconciliation
      </a>
      <SiteHeader />
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
