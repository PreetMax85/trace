"use client";

import { Box, Link, Text } from "@razorpay/blade/components";
import { REPO_URL, TAGLINE } from "./site-links";

/**
 * The product's name and what it does, at the top of every page.
 *
 * This exists because the screen below it had neither. Every figure on it was
 * right and none of it said what it was: the name lived only in the browser
 * tab, so a first-time reader met a table of settlement rows with no way to
 * tell whose data it was, what had been done to it, or where the source lived.
 * A correct screen and a legible one are different things and only the first
 * was ever checked.
 *
 * Rendered in the root layout rather than on the page, so the 404 and the error
 * screen carry it too — those are somebody's first contact with this as surely
 * as the home page is.
 */
export function SiteHeader(): React.ReactElement {
  return (
    <Box
      as="header"
      display="flex"
      alignItems="center"
      justifyContent="space-between"
      gap="spacing.5"
      flexWrap="wrap"
      paddingX={{ base: "spacing.5", m: "spacing.7" }}
      paddingY="spacing.4"
      backgroundColor="surface.background.gray.intense"
      borderBottomWidth="thin"
      borderBottomColor="surface.border.gray.muted"
      testID="site-header"
    >
      <Box display="flex" alignItems="center" gap="spacing.4">
        <Mark />
        <Box display="flex" flexDirection="column">
          <Text size="large" weight="semibold">
            Trace
          </Text>
          <Text variant="caption" size="small" color="surface.text.gray.muted">
            {TAGLINE}
          </Text>
        </Box>
      </Box>

      <Link href={REPO_URL} target="_blank" rel="noreferrer noopener" size="small">
        Source on GitHub
      </Link>
    </Box>
  );
}

/**
 * The wordless half of the logo, inline rather than an `<img>`.
 *
 * The same mark as `icon.svg`, which is the browser tab's favicon. Inlined so
 * it paints with the first HTML rather than after a second request — the header
 * is the one thing on the page that must not arrive late.
 */
function Mark(): React.ReactElement {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" role="img" aria-label="Trace">
      <rect width="32" height="32" rx="7" fill="#0F172A" />
      <path d="M8 11h16" stroke="#38BDF8" strokeWidth="3" strokeLinecap="round" />
      <path d="M16 11v13" stroke="#38BDF8" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
