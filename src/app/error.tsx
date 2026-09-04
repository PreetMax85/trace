"use client";

import { useEffect } from "react";
import { Box, Code, EmptyState, Text } from "@razorpay/blade/components";
import { Button } from "@razorpay/blade/components";

/**
 * What a visitor sees when something on the page throws.
 *
 * Error boundaries have to be client components — this is Next's documented
 * `error.js` convention, and `retry` is its prop name as of 16.3.0, not the
 * older `reset`.
 *
 * The digest is shown deliberately. React replaces a server error's message
 * with an opaque hash in production precisely so the message cannot leak, and
 * that hash is the only handle anyone has for finding the failure in the
 * deployment logs. Hiding it leaves a reporter with nothing to report.
 */
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}): React.ReactElement {
  useEffect(() => {
    // No error service is wired up (Sentry was cut — PRD §9), so the platform's
    // own function logs are where this lands.
    console.error(error);
  }, [error]);

  return (
    <Box
      display="flex"
      flex="1 1 auto"
      alignItems="center"
      justifyContent="center"
      padding="spacing.7"
      testID="error-boundary"
    >
      <EmptyState
        size="large"
        title="This screen failed to load"
        description="Nothing was changed, sent or filed — Trace only drafts, and a draft needs a person to confirm it. Reloading is safe."
      >
        <Box display="flex" flexDirection="column" alignItems="center" gap="spacing.4">
          <Button variant="primary" onClick={() => retry()}>
            Try again
          </Button>
          {error.digest !== undefined && (
            <Text variant="caption" size="small" color="surface.text.gray.muted">
              Reference{" "}
              <Code size="small" isHighlighted={false}>
                {error.digest}
              </Code>
            </Text>
          )}
        </Box>
      </EmptyState>
    </Box>
  );
}
