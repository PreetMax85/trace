"use client";

import { Box } from "@razorpay/blade/components";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

/**
 * Header, page, footer — the frame every route sits inside.
 *
 * A client component because Blade needs the browser, and one component rather
 * than three in the layout because the column has to own the page height: the
 * footer belongs below the content on a short page and after it on a long one,
 * which is what `minHeight="100vh"` plus a growing middle gets. The screen used
 * to claim the full viewport height itself, which left nowhere for chrome to
 * go without overflowing.
 */
export function SiteShell({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <Box
      display="flex"
      flexDirection="column"
      minHeight="100vh"
      backgroundColor="surface.background.gray.subtle"
    >
      <SiteHeader />
      <Box flex="1 1 auto" display="flex" flexDirection="column">
        {children}
      </Box>
      <SiteFooter />
    </Box>
  );
}
