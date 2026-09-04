"use client";

import { Box, Link, Text } from "@razorpay/blade/components";
import { PRD_URL, REPO_URL } from "./site-links";

/**
 * The bottom of every page: what this is, and where to read more.
 *
 * The disclaimer is not boilerplate. Trace states GST positions and drafts an
 * entry against a real return, and a reader who mistakes that for filed advice
 * has been misled by the product rather than by anything they did. Saying it
 * once, plainly, at the end of the page is the cheapest place to be honest
 * about it.
 */
export function SiteFooter(): React.ReactElement {
  return (
    <Box
      as="footer"
      display="flex"
      alignItems="center"
      justifyContent="space-between"
      gap="spacing.5"
      flexWrap="wrap"
      paddingX={{ base: "spacing.5", m: "spacing.7" }}
      paddingY="spacing.5"
      backgroundColor="surface.background.gray.intense"
      borderTopWidth="thin"
      borderTopColor="surface.border.gray.muted"
      testID="site-footer"
    >
      <Text variant="caption" size="small" color="surface.text.gray.muted">
        Trace — GST reconciliation for Razorpay settlements. Test data, single merchant. Drafts are
        prepared for a person to review; nothing here is filed advice and nothing is ever sent
        automatically.
      </Text>

      <Box display="flex" gap="spacing.5" flexWrap="wrap">
        <Link href={REPO_URL} target="_blank" rel="noreferrer noopener" size="small">
          GitHub
        </Link>
        <Link href={PRD_URL} target="_blank" rel="noreferrer noopener" size="small">
          How it works
        </Link>
      </Box>
    </Box>
  );
}
