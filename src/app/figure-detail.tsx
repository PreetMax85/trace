"use client";

import { Separator } from "@/components/ui/separator";
import { formatPeriod } from "@/lib/format/date";
import { formatRupees } from "@/lib/format/money";
import type { ExceptionCategory } from "@/lib/matching";
import type { ReviewHeader, ReviewRow } from "@/lib/review/batch";
import { CATEGORY_LABELS } from "./labels";
import { Caption, CardTitle, RecordId } from "./ui/type";

/**
 * Which of the four headline figures is open.
 *
 * A union rather than a string, so a figure the panel does not know how to
 * derive cannot be selected. The whole point of this panel is that no figure on
 * the page is unexplained; a silent default case would put one back.
 */
export type FigureId = "invoiceTax" | "itcClaimable" | "itcAtRisk" | "matched";

/**
 * Where a headline figure came from.
 *
 * The product is called Trace, and until this existed nothing traced until you
 * clicked a row. The four figures at the top were the most consequential
 * numbers on the page and the only ones a reader had to take on faith. Now each
 * one opens its own arithmetic, in the same panel a record opens in, with every
 * contributing record a link that reveals that record.
 *
 * Nothing here recomputes a figure. Each line is a term the server already
 * derived and put on the header, printed in the order they combine. A panel
 * that added the terms up itself could show a total that disagrees with the
 * heading above it, which would be worse than showing nothing at all.
 */
export function FigureDetail({
  figure,
  header,
  rows,
  onReveal,
}: {
  figure: FigureId;
  header: ReviewHeader;
  rows: ReviewRow[];
  /** Opens one record, the same way a citation does. */
  onReveal: (recordId: string) => void;
}) {
  const period = formatPeriod(header.period);
  const shown = DERIVATIONS[figure]({ header, rows, period });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Caption>{shown.label}</Caption>
        <CardTitle as="h3" className="text-section tabular-nums">
          {shown.value}
        </CardTitle>
        <p className="text-caption/relaxed text-muted-foreground">{shown.summary}</p>
      </div>

      <Separator />

      <dl className="flex flex-col gap-2">
        {shown.terms.map((term) => (
          <div key={term.label} className="flex items-baseline justify-between gap-4">
            <dt className="text-caption text-muted-foreground">{term.label}</dt>
            <dd
              className={
                term.isTotal
                  ? "text-caption font-semibold tabular-nums"
                  : "text-caption font-medium tabular-nums"
              }
            >
              {term.value}
            </dd>
          </div>
        ))}
      </dl>

      {shown.records.length > 0 && (
        <>
          <Separator />
          <div className="flex flex-col gap-2">
            <Caption>{shown.recordsLabel}</Caption>
            {shown.records.map((row) => (
              <div key={row.recordId} className="flex items-baseline justify-between gap-3">
                {/* A button and not a chip, because this one is meant to be
                    pressed: it opens that record in this same panel. */}
                <button
                  type="button"
                  onClick={() => onReveal(row.recordId)}
                  className="cursor-pointer rounded-sm font-mono text-mono text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {row.recordId}
                </button>
                <span className="text-caption font-medium tabular-nums">
                  {formatRupees(row.taxPaise)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <Separator />

      <div className="flex flex-col gap-2">
        <Caption>Billed by</Caption>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-caption">Razorpay, GSTIN</span>
          <RecordId>{header.supplierGstin}</RecordId>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-caption">on invoice</span>
          <RecordId>{header.invoiceNumber}</RecordId>
        </div>
      </div>
    </div>
  );
}

type Derivation = {
  label: string;
  value: string;
  summary: string;
  terms: { label: string; value: string; isTotal?: boolean }[];
  recordsLabel: string;
  records: ReviewRow[];
};

type Context = { header: ReviewHeader; rows: ReviewRow[]; period: string };

/**
 * One derivation per figure, keyed by the same union the caller passes.
 *
 * A `Record` over the union so a fifth figure cannot be added to the strip
 * without a derivation for it: the compiler refuses, rather than the panel
 * rendering blank next to a number nobody can check.
 */
const DERIVATIONS: Record<FigureId, (context: Context) => Derivation> = {
  invoiceTax: ({ header, period }) => ({
    label: "Invoice tax",
    value: formatRupees(header.invoiceTaxPaise),
    summary: `The GST on Razorpay's single ${period} invoice, read straight from the GSTR-2B file. This is the ceiling. Nothing above it can be claimed, whatever the settlement rows say.`,
    terms: [
      { label: `GST on the ${period} invoice`, value: formatRupees(header.invoiceTaxPaise) },
      {
        label: "GSTN says the credit is",
        value: header.itcAvailable ? "available" : "not available",
      },
    ],
    recordsLabel: "",
    records: [],
  }),

  itcClaimable: (context) => ({
    label: "ITC claimable",
    value: formatRupees(context.header.itcClaimablePaise),
    summary:
      "Tax that this period's data supports. Two terms: the fees Trace tied to a rate Razorpay publishes, plus the fees on refunds netted into this period. A netted refund keeps its credit, because Razorpay does not return its fee when a payment is refunded.",
    terms: [
      {
        label: "Tax on rows matched to a published rate",
        value: formatRupees(context.header.rolledUpTaxPaise),
      },
      {
        label: `Tax on refunds netted into ${context.period}`,
        value: formatRupees(context.header.refundNettedTaxPaise),
      },
      {
        label: "Claimable",
        value: formatRupees(context.header.itcClaimablePaise),
        isTotal: true,
      },
    ],
    recordsLabel: "The netted refunds, and the tax each carries",
    records: refundsBilledInPeriod(context),
  }),

  itcAtRisk: (context) => ({
    label: "ITC at risk",
    value: formatRupees(context.header.itcAtRiskPaise),
    summary:
      "What the invoice bills beyond what the settlement data explains. A residual, not a sum: the invoice tax minus everything Trace could account for, so nothing can hide by failing to be classified.",
    terms: [
      {
        label: `GST on the ${context.period} invoice`,
        value: formatRupees(context.header.invoiceTaxPaise),
      },
      { label: "less claimable", value: `-${formatRupees(context.header.itcClaimablePaise)}` },
      { label: "At risk", value: formatRupees(context.header.itcAtRiskPaise), isTotal: true },
    ],
    recordsLabel: "The flagged rows this period bills that no published rate explains",
    records: unexplainedBilledInPeriod(context),
  }),

  matched: ({ header, rows }) => ({
    label: "Matched",
    value: `${header.matchedCount}/${header.totalRecords}`,
    summary:
      "How many settlement rows resolved against a rate Razorpay publishes, within one rupee. The rest are the queue, and every one of them is on this page with a reason.",
    terms: [
      { label: "Rows the fixture holds", value: String(header.totalRecords) },
      { label: "Matched to a published rate", value: String(header.matchedCount) },
      { label: "Flagged for review", value: String(header.exceptionCount), isTotal: true },
      ...countByCategory(rows),
    ],
    recordsLabel: "",
    records: [],
  }),
};

/**
 * The refunds whose fee this period's invoice bills.
 *
 * Scoped by `billedIn`, which is the same scope the audit row's own term uses.
 * A refund netted into a settlement that landed in the next month is on the
 * NEXT invoice, and listing it here would show a reader records that the figure
 * above them does not include.
 */
function refundsBilledInPeriod({ rows, header }: Context): ReviewRow[] {
  return rows.filter(
    (row) => row.category === "REFUND_NETTED" && row.billedIn === header.period,
  );
}

/**
 * The flagged rows this period bills that no published rate explains.
 *
 * Listed as the records BEHIND the residual, never as its definition. At risk
 * is the invoice tax minus what could be accounted for, so these rows explain
 * where the shortfall came from without being asserted to add up to it. If they
 * ever did add up exactly, that would be a coincidence of this fixture rather
 * than a rule, and writing the panel as though it were a rule is how a figure
 * and its own derivation come to disagree.
 */
function unexplainedBilledInPeriod({ rows, header }: Context): ReviewRow[] {
  return rows.filter(
    (row) =>
      row.status === "EXCEPTION" &&
      row.billedIn === header.period &&
      (row.category === "FEE_DEDUCTION" || row.category === "UNEXPLAINED"),
  );
}

/** How the flagged rows split across the five categories. */
function countByCategory(rows: ReviewRow[]): { label: string; value: string }[] {
  const counts = new Map<ExceptionCategory, number>();
  for (const row of rows) {
    if (row.category === null) continue;
    counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
  }

  // Ordered by the label map rather than by first appearance, so the split
  // reads the same however the fixture happens to be sorted.
  return (Object.keys(CATEGORY_LABELS) as ExceptionCategory[])
    .filter((category) => counts.has(category))
    .map((category) => ({
      label: CATEGORY_LABELS[category],
      value: String(counts.get(category)),
    }));
}
