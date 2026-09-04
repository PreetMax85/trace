"use client";

import { Box, Button, EmptyState, Text } from "@razorpay/blade/components";

/**
 * The page for a URL that does not exist.
 *
 * Next's default is an unstyled line of black text on white with no product
 * name and no way back — which, on a public site, is somebody's first contact
 * with Trace as readily as the home page is. This one says where they are and
 * offers the one route there is.
 */
export default function NotFound(): React.ReactElement {
  return (
    <Box
      display="flex"
      flex="1 1 auto"
      alignItems="center"
      justifyContent="center"
      padding="spacing.7"
      testID="not-found"
    >
      <EmptyState
        size="large"
        title="There is nothing at this address"
        description="Trace has one screen: the exception review for the current filing period."
      >
        <Box display="flex" flexDirection="column" alignItems="center" gap="spacing.4">
          <Button href="/" variant="primary">
            Go to the exception review
          </Button>
          <Text variant="caption" size="small" color="surface.text.gray.muted">
            HTTP 404
          </Text>
        </Box>
      </EmptyState>
    </Box>
  );
}
