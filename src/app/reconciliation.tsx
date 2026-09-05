"use client";

import { cn } from "@/lib/utils";
import { formatPeriod } from "@/lib/format/date";
import { formatRupees } from "@/lib/format/money";
import type { ReviewHeader } from "@/lib/review/batch";
import type { FigureId } from "./figure-detail";
import { Caption, CardTitle } from "./ui/type";

/**
 * The reconciliation itself, as one object.
 *
 * This replaced four identical stat cards in a row. The cards were not wrong,
 * they were flat: they presented a total, its two halves and a record count as
 * four peers, so the one relationship that matters on this page, that the
 * invoice splits into credit the batch can account for and credit it cannot, had
 * to be inferred by reading three numbers and doing the subtraction.
 *
 * A bank reconciliation is drawn as two columns that should agree. This is the
 * same statement in one line: the full width is the GST Razorpay billed, the
 * filled part is what the settlement data accounts for, and the stub at the end
 * is the claim nobody can defend yet. The proportion is the argument, and it is
 * legible before a single figure has been read.
 *
 * Every part of it is still a way in. The total, each half and the match count
 * open their own derivation, so nothing here is a number a reader has to take on
 * faith.
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
    <div className="flex flex-col gap-3" data-testid="reconciliation">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <Caption>GST Razorpay billed on its {period} invoice</Caption>
        <FigureButton
          figure="invoiceTax"
          openFigure={openFigure}
          onOpenFigure={onOpenFigure}
          label={`Invoice tax, ${formatRupees(header.invoiceTaxPaise)}`}
          testId="figure-invoiceTax"
        >
          <CardTitle className="text-section tabular-nums">
            {formatRupees(header.invoiceTaxPaise)}
          </CardTitle>
        </FigureButton>
      </div>

      {/*
        `flex-basis: 0` with a numeric grow is what makes the widths proportional
        rather than content-sized. Without it a segment holding a longer amount
        would claim more of the bar than its share of the money, which would make
        the one thing this drawing asserts quietly false.
      */}
      <div className="flex h-11 w-full overflow-hidden rounded-lg border border-border">
        <Segment
          tone="explained"
          grow={explained}
          isOpen={openFigure === "itcClaimable"}
          onClick={() => onOpenFigure("itcClaimable")}
          label={`Explained, ${formatRupees(header.itcClaimablePaise)}, ${explained} percent of the invoice. Show where this figure came from.`}
          testId="figure-itcClaimable"
        />
        <Segment
          tone="atRisk"
          grow={atRisk}
          isOpen={openFigure === "itcAtRisk"}
          onClick={() => onOpenFigure("itcAtRisk")}
          label={`At risk, ${formatRupees(header.itcAtRiskPaise)}, ${atRisk} percent of the invoice. Show where this figure came from.`}
          testId="figure-itcAtRisk"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <FigureButton
          figure="itcClaimable"
          openFigure={openFigure}
          onOpenFigure={onOpenFigure}
          label={`Explained, ${formatRupees(header.itcClaimablePaise)}`}
        >
          <span className="size-2 shrink-0 rounded-full bg-explained" aria-hidden />
          <Caption className="text-foreground">
            Explained {formatRupees(header.itcClaimablePaise)}
          </Caption>
        </FigureButton>

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

        <FigureButton
          figure="itcAtRisk"
          openFigure={openFigure}
          onOpenFigure={onOpenFigure}
          label={`At risk, ${formatRupees(header.itcAtRiskPaise)}`}
        >
          <span className="size-2 shrink-0 rounded-full bg-at-risk" aria-hidden />
          <Caption className="text-foreground">
            At risk {formatRupees(header.itcAtRiskPaise)}
          </Caption>
        </FigureButton>
      </div>
    </div>
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
  testId,
}: {
  tone: "explained" | "atRisk";
  grow: number;
  isOpen: boolean;
  onClick: () => void;
  label: string;
  testId: string;
}) {
  return (
    <button
      type="button"
      style={{ flexGrow: grow, flexShrink: 1, flexBasis: 0 }}
      onClick={onClick}
      aria-pressed={isOpen}
      aria-label={label}
      data-testid={testId}
      className={cn(
        "min-w-5 cursor-pointer transition-opacity outline-none",
        "focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:ring-inset",
        tone === "explained" ? "bg-explained" : "bg-at-risk",
        isOpen ? "opacity-100 ring-3 ring-foreground/70 ring-inset" : "opacity-90 hover:opacity-100",
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
