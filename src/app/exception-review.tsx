"use client";

import { useState } from "react";
import {
  Badge,
  Box,
  Card,
  CardBody,
  Code,
  Divider,
  Heading,
  Indicator,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableHeaderRow,
  TableRow,
  TableToolbar,
  Text,
  type TableData,
} from "@razorpay/blade/components";
import { formatIstDateTime, formatPeriod } from "@/lib/format/date";
import { formatRupees } from "@/lib/format/money";
import type { ExceptionCategory } from "@/lib/matching";
import type { ReviewBatch, ReviewRow } from "@/lib/review/batch";

/**
 * The screen itself. It receives a finished batch and renders it — no fetching,
 * no matching, no arithmetic beyond formatting, and every rupee figure comes
 * from `formatRupees` so the pixels cannot disagree with the audit trail.
 */
export function ExceptionReview({ batch }: { batch: ReviewBatch }): React.ReactElement {
  const { header, rows } = batch;
  const [openRecordId, setOpenRecordId] = useState<string | null>(null);
  const openRow = rows.find((row) => row.recordId === openRecordId) ?? null;

  const data: TableData<ReviewRow> = {
    nodes: rows.map((row) => ({ ...row, id: row.recordId })),
  };

  return (
    <Box
      as="main"
      padding="spacing.7"
      display="flex"
      flexDirection="column"
      gap="spacing.6"
      backgroundColor="surface.background.gray.subtle"
      minHeight="100vh"
    >
      <Box display="flex" flexDirection="column" gap="spacing.2">
        <Heading size="large">Exception review — {formatPeriod(header.period)}</Heading>
        <Text variant="caption" size="medium" color="surface.text.gray.muted">
          Razorpay settlements reconciled against GSTR-2B for GSTIN {header.merchantGstin}. Every
          figure below is derived from the settlement data, not estimated.
        </Text>
      </Box>

      <Box display="flex" gap="spacing.4" flexWrap="wrap">
        <Stat
          label="Invoice tax"
          value={formatRupees(header.invoiceTaxPaise)}
          caption={`GST on Razorpay's ${formatPeriod(header.period)} invoice`}
        />
        <Stat
          label="ITC claimable"
          value={formatRupees(header.itcClaimablePaise)}
          caption="Credit this period's data supports"
          color="feedback.text.positive.intense"
        />
        <Stat
          label="ITC at risk"
          value={formatRupees(header.itcAtRiskPaise)}
          caption="Tax billed that nothing explains yet"
          color="feedback.text.negative.intense"
        />
        <Stat
          label="Matched"
          value={`${header.matchedCount}/${header.totalRecords}`}
          caption={`${header.exceptionCount} exceptions to review`}
        />
      </Box>

      <Box display="flex" gap="spacing.5" alignItems="flex-start" flexWrap="wrap">
        <Box flex="1 1 720px" minWidth="720px">
          <Table
            data={data}
            showStripedRows={false}
            showBorderedCells
            rowDensity="normal"
            gridTemplateColumns="minmax(200px, 1.6fr) minmax(96px, 0.8fr) minmax(96px, 0.8fr) minmax(96px, 0.8fr) minmax(100px, 0.8fr) minmax(170px, 1.2fr)"
            toolbar={
              <TableToolbar
                title={`${header.totalRecords} settlement records · ${header.exceptionCount} flagged`}
              />
            }
          >
            {(tableRows) => (
              <>
                <TableHeader>
                  <TableHeaderRow>
                    <TableHeaderCell>Settlement</TableHeaderCell>
                    <TableHeaderCell textAlign="right">Amount</TableHeaderCell>
                    <TableHeaderCell textAlign="right">Fee</TableHeaderCell>
                    <TableHeaderCell textAlign="right">Tax</TableHeaderCell>
                    <TableHeaderCell>Match method</TableHeaderCell>
                    <TableHeaderCell>Category</TableHeaderCell>
                  </TableHeaderRow>
                </TableHeader>

                <TableBody>
                  {tableRows.map((row) => (
                    <TableRow
                      key={row.id}
                      item={row}
                      onClick={({ item }) => setOpenRecordId(String(item.id))}
                    >
                      <TableCell>
                        <Box display="flex" alignItems="center" gap="spacing.3">
                          {/* The exception queue has to be findable at a glance,
                              so every row carries a colour at its left edge as
                              well as a category badge at its right. */}
                          <Indicator
                            color={row.status === "EXCEPTION" ? "negative" : "positive"}
                            emphasis="intense"
                            size="medium"
                            accessibilityLabel={row.status === "EXCEPTION" ? "Flagged" : "Matched"}
                          />
                          {/* Every element inside a row is a span or a div on
                              purpose. The table library only treats a click as
                              a row click when the event target is an svg, a
                              div, a span or the cell itself — a <code> or a <p>
                              swallows it silently. See BUILD-LOG entry 28. */}
                          <Box display="flex" flexDirection="column">
                            <Text as="span" size="small" weight="medium">
                              {row.settlementId}
                            </Text>
                            <Text
                              as="span"
                              variant="caption"
                              size="small"
                              color="surface.text.gray.muted"
                            >
                              {row.recordId}
                            </Text>
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell textAlign="right">
                        <Text as="span" size="small">
                          {formatRupees(row.amountPaise)}
                        </Text>
                      </TableCell>
                      <TableCell textAlign="right">
                        <Text as="span" size="small">
                          {formatRupees(row.feePaise)}
                        </Text>
                      </TableCell>
                      <TableCell textAlign="right">
                        <Text as="span" size="small">
                          {formatRupees(row.taxPaise)}
                        </Text>
                      </TableCell>
                      <TableCell>
                        <Text
                          as="span"
                          size="small"
                          weight={row.method === "NONE" ? "semibold" : "regular"}
                          color={
                            row.method === "NONE"
                              ? "feedback.text.negative.intense"
                              : "surface.text.gray.normal"
                          }
                        >
                          {row.method}
                        </Text>
                      </TableCell>
                      <TableCell>
                        {row.category ? (
                          // Blade's Badge renders its label as a <p> and takes
                          // no `as` prop, so a click on the badge itself would
                          // be swallowed by the table's tag allowlist. Letting
                          // the click fall through to the cell keeps the badge
                          // and keeps the row clickable. BUILD-LOG entry 28.
                          <Box pointerEvents="none">
                          <Badge
                            color={categoryColor(row.category)}
                            // Solid only for the two that put credit at risk;
                            // the rest are worth knowing, not worth alarm.
                            emphasis={categoryColor(row.category) === "negative" ? "intense" : "subtle"}
                            size="medium"
                          >
                            {row.category}
                          </Badge>
                          </Box>
                        ) : (
                          <Text as="span" size="small" color="surface.text.gray.muted">
                            —
                          </Text>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </>
            )}
          </Table>
        </Box>

        {/* Sticky, because a row clicked forty rows down would otherwise open
            its explanation off the top of the screen. */}
        <Box flex="1 1 360px" minWidth="320px" position="sticky" top="spacing.5">
          <Detail row={openRow} period={header.period} />
        </Box>
      </Box>
    </Box>
  );
}

/** One figure in the header strip. */
function Stat({
  label,
  value,
  caption,
  color,
}: {
  label: string;
  value: string;
  caption: string;
  /** Taken from Heading's own token union, so the compiler rejects a token that does not exist. */
  color?: React.ComponentProps<typeof Heading>["color"];
}): React.ReactElement {
  return (
    <Box flex="1" minWidth="220px">
      <Card padding="spacing.5" elevation="lowRaised" height="100%">
        <CardBody>
          <Box display="flex" flexDirection="column" gap="spacing.2">
            <Text variant="caption" size="small" color="surface.text.gray.muted">
              {label}
            </Text>
            <Heading size="medium" color={color}>
              {value}
            </Heading>
            <Text variant="caption" size="small" color="surface.text.gray.subtle">
              {caption}
            </Text>
          </Box>
        </CardBody>
      </Card>
    </Box>
  );
}

/** Why the open row carries the verdict it carries. */
function Detail({ row, period }: { row: ReviewRow | null; period: string }): React.ReactElement {
  return (
    <Card padding="spacing.5" elevation="lowRaised" testID="detail-panel">
      <CardBody>
        {row === null ? (
          <Box display="flex" flexDirection="column" gap="spacing.3">
            <Heading size="small">Why was this flagged?</Heading>
            <Text size="small" color="surface.text.gray.muted">
              Select any row to see the reasoning behind its verdict — the figures it was compared
              against, and the rule that produced the category. The flagged rows are the ones with a
              red marker.
            </Text>
          </Box>
        ) : (
          <Box display="flex" flexDirection="column" gap="spacing.4">
            <Box display="flex" flexDirection="column" gap="spacing.2">
              <Box display="flex" alignItems="center" gap="spacing.3">
                <Indicator
                  color={row.status === "EXCEPTION" ? "negative" : "positive"}
                  emphasis="intense"
                  size="medium"
                  accessibilityLabel={row.status === "EXCEPTION" ? "Flagged" : "Matched"}
                />
                <Code size="small" isHighlighted={false}>
                  {row.recordId}
                </Code>
              </Box>
              <Heading size="small">{row.explanation.headline}</Heading>
            </Box>

            <Divider />

            <Box display="flex" flexDirection="column" gap="spacing.3">
              <Field label="Settlement" value={row.settlementId} />
              <Field label="Settled" value={formatIstDateTime(row.settledAt)} />
              <Field label="Amount" value={formatRupees(row.amountPaise)} />
              <Field label="Fee charged" value={formatRupees(row.feePaise)} />
              <Field label="GST inside the fee" value={formatRupees(row.taxPaise)} />
              {row.expectedFeePaise !== null && (
                <Field label="Fee expected" value={formatRupees(row.expectedFeePaise)} />
              )}
              <Field
                label="Billed on"
                value={`${formatPeriod(row.billedIn)}'s GSTR-2B${
                  row.billedIn === period ? "" : " — the next return"
                }`}
              />
            </Box>

            <Divider />

            <Box display="flex" flexDirection="column" gap="spacing.3">
              {/* Keyed by position, not by the sentence: two identical points
                  would collide as React keys and one would silently vanish
                  from an explanation a person is meant to act on. */}
              {row.explanation.points.map((point, index) => (
                <Text key={index} size="small" color="surface.text.gray.normal">
                  {point}
                </Text>
              ))}
            </Box>

            {row.creditNoteReview && (
              <Badge color="information" emphasis="intense" size="medium">
                Credit note review
              </Badge>
            )}
          </Box>
        )}
      </CardBody>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <Box display="flex" justifyContent="space-between" gap="spacing.4">
      <Text variant="caption" size="small" color="surface.text.gray.muted">
        {label}
      </Text>
      <Text size="small" weight="medium" textAlign="right">
        {value}
      </Text>
    </Box>
  );
}

/**
 * The colour a category carries. Tied to what the category costs the merchant,
 * not chosen for variety: the two that put credit at risk are red, a timing
 * difference is a warning, and the two that are merely worth knowing are not.
 */
function categoryColor(category: ExceptionCategory): "negative" | "notice" | "information" | "neutral" {
  switch (category) {
    case "FEE_DEDUCTION":
    case "UNEXPLAINED":
      return "negative";
    case "TIMING":
      return "notice";
    case "REFUND_NETTED":
      return "information";
    case "PARTIAL_PAYMENT":
      return "neutral";
  }
}
