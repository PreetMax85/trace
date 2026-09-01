"use client";

import { Box, Heading, Text, Amount, Badge } from "@razorpay/blade/components";

export default function Home() {
  return (
    <Box padding="spacing.7" display="flex" flexDirection="column" gap="spacing.4">
      <Heading size="large">Blade smoke test</Heading>
      <Text>ITC claimable this period</Text>
      <Amount value={982.23} currency="INR" size="large" />
      <Badge color="negative">4 unexplained fees</Badge>
    </Box>
  );
}
