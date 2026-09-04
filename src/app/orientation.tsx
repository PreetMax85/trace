"use client";

import { Alert, Box, Card, CardBody, Heading, Link, Text } from "@razorpay/blade/components";
import { PRD_URL } from "./site-links";

/**
 * What this is and what it is looking at, for a reader who arrived cold.
 *
 * The problem this solves is not decoration. Every merchant on Razorpay pays a
 * gateway fee with 18% GST on top; that GST is claimable input tax credit, but
 * only for the part their supplier actually reported. Nothing on the screen
 * below said any of that, so the table of settlement rows read as a data dump
 * unless you already knew what had been done to it.
 *
 * The four layers are named here because the separation between them IS the
 * design — a deterministic matcher that never asks a model anything, and three
 * layers around it that do, none of which can act on their own. A reader who
 * does not know that cannot tell which figures a model touched, and the honest
 * answer is none of them.
 */
export function Orientation(): React.ReactElement {
  return (
    <Box display="flex" flexDirection="column" gap="spacing.4" testID="orientation">
      <Card padding="spacing.5" elevation="lowRaised">
        <CardBody>
          <Box display="flex" flexDirection="column" gap="spacing.5">
            <Box display="flex" flexDirection="column" gap="spacing.3">
              <Heading size="medium">What this screen is</Heading>
              <Text size="medium" color="surface.text.gray.subtle">
                Razorpay charges a fee on every settlement and adds 18% GST to it. That GST is
                input tax credit the merchant can claim back — but only for the part their supplier
                reported in GSTR-2B, the monthly statement the tax portal builds from what suppliers
                have filed. Trace matches one against the other, settlement by settlement, and shows
                what does not line up and what it costs.
              </Text>
              <Text size="medium" color="surface.text.gray.subtle">
                Below is one month of that reconciliation: every settlement record, whether it
                matched, and where it did not, why. Click any row to see the working behind it.
              </Text>
            </Box>

            <Box
              display="flex"
              gap="spacing.4"
              flexWrap="wrap"
              testID="layer-strip"
            >
              <Layer
                name="Detect"
                detail="Matches every settlement fee against Razorpay's published rate card, then the period against the GSTR-2B invoice. Arithmetic only — no model is asked anything."
              />
              <Layer
                name="Investigate"
                detail="Reads the records the matcher could not resolve and puts each into one of five categories, showing the evidence it used."
              />
              <Layer
                name="Explain"
                detail="Answers plain-language questions about this batch. Every answer names the records it rests on, and each one opens its row."
              />
              <Layer
                name="Act"
                detail="Drafts the CA email, the GSTR-3B flag and the Tally entry. It drafts only — a person confirms each one, and nothing is ever sent or filed."
              />
            </Box>

            <Text variant="caption" size="small" color="surface.text.gray.muted">
              The reasoning and the full specification are in the{" "}
              <Link href={PRD_URL} target="_blank" rel="noreferrer noopener" size="small">
                product requirements document
              </Link>
              .
            </Text>
          </Box>
        </CardBody>
      </Card>

      {/*
        Said up front, not in a footnote. A visitor who works out on their own
        that the numbers are synthetic has been misled up to the moment they
        worked it out, and every figure below is only worth reading once it is
        clear what it is a figure OF.
      */}
      <Alert
        color="information"
        emphasis="subtle"
        isDismissible={false}
        isFullWidth
        title="This runs on test data"
        description="One seeded merchant, 54 synthetic settlement records, and a GSTR-2B file built to the real GSTN schema. The figures are consistent and the matching is real; the merchant is not. Razorpay's API is test-mode throughout."
        testID="test-data-notice"
      />
    </Box>
  );
}

/** One of the four layers, as a fixed-width card in the strip. */
function Layer({ name, detail }: { name: string; detail: string }): React.ReactElement {
  return (
    <Box
      flex="1 1 220px"
      minWidth="200px"
      display="flex"
      flexDirection="column"
      gap="spacing.2"
      padding="spacing.4"
      backgroundColor="surface.background.gray.moderate"
      borderRadius="medium"
      borderWidth="thin"
      borderColor="surface.border.gray.muted"
    >
      <Text size="small" weight="semibold">
        {name}
      </Text>
      <Text variant="caption" size="small" color="surface.text.gray.muted">
        {detail}
      </Text>
    </Box>
  );
}
