"use client";

import { formatPeriod } from "@/lib/format/date";
import { formatRupees } from "@/lib/format/money";
import type { ReviewHeader } from "@/lib/review/batch";
import type { FigureId } from "./figure-detail";
import { Reconciliation } from "./reconciliation";
import { Body, Caption, PageTitle } from "./ui/type";

/**
 * The first thing on the page: the finding, then the reconciliation behind it.
 *
 * The page used to open with three paragraphs explaining the domain and put the
 * figures below them. That is backwards. The figures are the reason anyone would
 * read the rest, and a reader who leaves before scrolling past the prose never
 * sees the product do anything. The explanation still exists, in full, at the
 * bottom of the page where somebody who wants it will look.
 *
 * The headline states the number rather than the product. A reader arrives
 * wanting to know whether something is wrong, and the honest answer to that is a
 * rupee figure with a reason attached.
 *
 * There is no label line above it. The period is in the sentence below and the
 * registration number is in the header, which is where an identifier belongs;
 * both of them stacked above the headline as a middle-dot string was chrome
 * pretending to be content.
 */
export function Hero({
  header,
  openFigure,
  onOpenFigure,
}: {
  header: ReviewHeader;
  /** Which figure's derivation is open, so the bar can show it. */
  openFigure: FigureId | null;
  onOpenFigure: (figure: FigureId) => void;
}) {
  const period = formatPeriod(header.period);

  return (
    <div className="flex flex-col gap-8" data-testid="hero">
      <div className="flex flex-col gap-4">
        {/*
          The page's only h1, and the first heading in the document. Before this
          the outline began at h5 and a screen reader's heading list read as four
          bare rupee figures with nothing above them.

          Capped rather than full bleed: a headline that runs the whole width of
          a wide monitor is one line of 140 characters, which is past the point
          where a reader's eye reliably finds the next line.
        */}
        <PageTitle className="max-w-[16ch] sm:max-w-[20ch]">
          {formatRupees(header.itcAtRiskPaise)} of input tax credit has nothing to explain it.
        </PageTitle>

        <Body className="max-w-[62ch]">
          Trace matched {header.matchedCount} of {header.totalRecords} Razorpay settlement records
          against {period}&apos;s GSTR-2B. The other {header.exceptionCount} did not line up.
        </Body>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
        <Reconciliation header={header} openFigure={openFigure} onOpenFigure={onOpenFigure} />
        <Caption className="mt-4 block">
          Select the total, either half of the bar, or the record count to see the working behind it.
        </Caption>
      </div>
    </div>
  );
}
