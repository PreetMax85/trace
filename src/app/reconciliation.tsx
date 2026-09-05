"use client";

import { cn } from "@/lib/utils";
import { formatPeriod } from "@/lib/format/date";
import { formatRupees } from "@/lib/format/money";
import type { ReviewHeader } from "@/lib/review/batch";
import type { FigureId } from "./figure-detail";
import { Caption } from "./ui/type";

/**
 * The reconciliation itself, drawn as a statement of reconciliation.
 *
 * This replaced four identical stat cards, and then a bare proportional bar.
 * The cards were flat: they presented a total, its two halves and a record count
 * as four peers, so the one relationship that matters, that the invoice splits
 * into credit the batch can account for and credit it cannot, had to be inferred
 * by reading three numbers and doing the subtraction. The bar showed the
 * proportion but not the arithmetic.
 *
 * So it is set out the way the document it describes is set out: two amounts,
 * a rule, and the difference under it. That form is a hundred years old and
 * every person who would use this reads one most days, which means the layout
 * itself carries meaning before a single figure has been read. The bar stays,
 * below the rule, because the proportion is the part a stranger understands
 * fastest and the arithmetic is the part an accountant checks.
 *
 * Amounts are set in the serif at ledger sizes with lining, tabular figures.
 * A statement sets its money in the text face; a monospace column here would
 * read as console output, which is the opposite of what this is.
 *
 * Every line is still a way in. The total, each half and the match count open
 * their own derivation, so nothing here is a number a reader takes on faith.
 */

/** How much of the invoice each segment gets, to two decimal places of a percent. */
const share = (part: number, whole: number): number =>
  whole === 0 ? 0 : Math.round((part / whole) * 10000) / 100;

export function Reconciliation({
  header,
  openFigure,
  onOpenFigure,
}: {
  header: ReviewHeader;
  openFigure: FigureId | null;
  onOpenFigure: (figure: FigureId) => void;
}) {
  const period = formatPeriod(header.period);
  const explained = share(header.itcClaimablePaise, header.invoiceTaxPaise);
  const atRisk = share(header.itcAtRiskPaise, header.invoiceTaxPaise);

  return (
    <div className="flex flex-col" data-testid="reconciliation">
      <StatementLine
        figure="invoiceTax"
        openFigure={openFigure}
        onOpenFigure={onOpenFigure}
        testId="figure-invoiceTax"
        label={`GST Razorpay billed on its ${period} invoice`}
        amount={header.invoiceTaxPaise}
        srLabel={`GST billed on the ${period} invoice, ${formatRupees(header.invoiceTaxPaise)}`}
      />

      <StatementLine
        figure="itcClaimable"
        openFigure={openFigure}
        onOpenFigure={onOpenFigure}
        testId="figure-itcClaimable"
        label="Backed by what Razorpay filed in GSTR-2B"
        amount={header.itcClaimablePaise}
        tone="explained"
        srLabel={`Backed by GSTR-2B, ${formatRupees(header.itcClaimablePaise)}, ${explained} percent of the invoice`}
      />

      {/*
        The rule under the second amount, exactly where a statement puts it.
        Full width rather than only under the figures, because what it separates
        is the two things being compared from the difference between them.
      */}
      <div className="mt-1 mb-1 h-px w-full bg-foreground/25" aria-hidden />

      <StatementLine
        figure="itcAtRisk"
        openFigure={openFigure}
        onOpenFigure={onOpenFigure}
        testId="figure-itcAtRisk"
        label="Nothing in the return supports it"
        amount={header.itcAtRiskPaise}
        tone="atRisk"
        emphasis
        srLabel={`At risk, ${formatRupees(header.itcAtRiskPaise)}, ${atRisk} percent of the invoice`}
      />

      {/*
        `flex-basis: 0` with a numeric grow is what makes the widths proportional
        rather than content-sized. Without it a segment holding a longer amount
        would claim more of the bar than its share of the money, which would make
        the one thing this drawing asserts quietly false.
      */}
      <div className="mt-4 flex h-2 w-full overflow-hidden rounded-full">
        <Segment
          tone="explained"
          grow={explained}
          isOpen={openFigure === "itcClaimable"}
          onClick={() => onOpenFigure("itcClaimable")}
          label={`Explained, ${formatRupees(header.itcClaimablePaise)}, ${explained} percent of the invoice. Show where this figure came from.`}
        />
        <Segment
          tone="atRisk"
          grow={atRisk}
          isOpen={openFigure === "itcAtRisk"}
          onClick={() => onOpenFigure("itcAtRisk")}
          label={`At risk, ${formatRupees(header.itcAtRiskPaise)}, ${atRisk} percent of the invoice. Show where this figure came from.`}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <FigureButton
          figure="matched"
          openFigure={openFigure}
          onOpenFigure={onOpenFigure}
          label={`${header.matchedCount} of ${header.totalRecords} records matched`}
          testId="figure-matched"
        >
          <Caption>
            {header.matchedCount} of {header.totalRecords} records matched
          </Caption>
        </FigureButton>

        <Caption>{atRisk}% of this month&apos;s credit is unsupported</Caption>
      </div>
    </div>
  );
}

/**
 * One line of the statement: what it is on the left, how much on the right.
 *
 * The dotted leader between them is the device a printed statement uses, and it
 * does real work here rather than decorating: it ties a label to an amount
 * across a gap wide enough that the eye would otherwise lose the row. The whole
 * line is the click target, so the amount and its description open the same
 * derivation.
 */
function StatementLine({
  figure,
  openFigure,
  onOpenFigure,
  label,
  amount,
  srLabel,
  testId,
  tone,
  emphasis = false,
}: {
  figure: FigureId;
  openFigure: FigureId | null;
  onOpenFigure: (figure: FigureId) => void;
  label: string;
  amount: number;
  srLabel: string;
  testId?: string;
  tone?: "explained" | "atRisk";
  /** The difference line, which is the answer and is set larger than its terms. */
  emphasis?: boolean;
}) {
  const isOpen = openFigure === figure;

  return (
    <button
      type="button"
      onClick={() => onOpenFigure(figure)}
      aria-pressed={isOpen}
      aria-label={`${srLabel}. Show where this figure came from.`}
      data-testid={testId}
      className={cn(
        "group -mx-2 flex w-[calc(100%+1rem)] cursor-pointer items-baseline gap-2 rounded-md px-2 py-1.5 text-left",
        "outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        isOpen ? "bg-accent" : "hover:bg-muted",
      )}
    >
      {/* `min-w-0` and no `shrink-0`. A label pinned at its natural width sets a
          floor for the whole line, and this line is inside a grid column inside
          the page: at 320px the label plus the amount held the document at
          478px and the entire page scrolled sideways. It wraps now. */}
      <span
        className={cn(
          "min-w-0 text-body",
          tone === "atRisk" ? "font-medium text-at-risk" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
      {/* The leader. Repeating dots rather than a solid rule, so it reads as
          the connective tissue of a statement and not as a divider. Gone on a
          phone, where there is no gap left to lead the eye across. */}
      <span
        className="hidden min-w-4 flex-1 translate-y-[-0.2em] border-b border-dotted border-foreground/25 sm:block"
        aria-hidden
      />
      <span
        className={cn(
          "ml-auto shrink-0 font-serif tabular-nums",
          emphasis ? "text-section font-medium" : "text-title",
          tone === "atRisk" ? "text-at-risk" : "text-foreground",
        )}
      >
        {formatRupees(amount)}
      </span>
    </button>
  );
}

/**
 * One share of the invoice, and a control.
 *
 * A real `<button>`, so it is in the tab order, announces itself, and takes
 * Enter and Space with no handling of its own. `aria-pressed` carries which one
 * is open, because the visual cue for that is an inset ring and a ring is not
 * something a screen reader can read.
 */
function Segment({
  tone,
  grow,
  isOpen,
  onClick,
  label,
}: {
  tone: "explained" | "atRisk";
  grow: number;
  isOpen: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      style={{ flexGrow: grow, flexShrink: 1, flexBasis: 0 }}
      onClick={onClick}
      aria-pressed={isOpen}
      aria-label={label}
      className={cn(
        "min-w-5 cursor-pointer transition-opacity outline-none",
        "focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:ring-inset",
        tone === "explained" ? "bg-explained" : "bg-at-risk",
        isOpen ? "opacity-100 ring-2 ring-foreground/70 ring-inset" : "opacity-85 hover:opacity-100",
      )}
    />
  );
}

/** A figure that opens its own arithmetic, styled as text rather than as a button. */
function FigureButton({
  figure,
  openFigure,
  onOpenFigure,
  label,
  testId,
  children,
}: {
  figure: FigureId;
  openFigure: FigureId | null;
  onOpenFigure: (figure: FigureId) => void;
  label: string;
  testId?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpenFigure(figure)}
      aria-pressed={openFigure === figure}
      aria-label={`${label}. Show where this figure came from.`}
      data-testid={testId}
      className={cn(
        "-mx-1.5 -my-1 inline-flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1",
        "outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        openFigure === figure ? "bg-accent" : "hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
