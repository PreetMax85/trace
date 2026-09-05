"use client";

import { formatPeriod } from "@/lib/format/date";
import { formatRupees } from "@/lib/format/money";
import type { ReviewHeader } from "@/lib/review/batch";
import type { FigureId } from "./figure-detail";
import { Reconciliation } from "./reconciliation";
import { Body, Caption, PageTitle, CardTitle } from "./ui/type";

/**
 * The first thing on the page: the finding, then the reconciliation behind it.
 *
 * The page used to open with three paragraphs explaining the domain and put the
 * figures below them. That is backwards. The figures are the reason anyone would
 * read the rest, and a reader who leaves before scrolling past the prose never
 * sees the product do anything.
 *
 * The headline states the number rather than the product. A reader arrives
 * wanting to know whether something is wrong, and the honest answer to that is a
 * rupee figure with a reason attached.
 *
 * It states it in words a stranger already has. The first version read
 * "₹214.69 of input tax credit has nothing to explain it", which asks the
 * reader to know what input tax credit is before the sentence means anything at
 * all, and the people this is written for do not. The rule the paragraphs below
 * it follow, taken from the plain-language guidance the IRS wrote for its own
 * filing tool, is that the ordinary words come first and the official term is
 * introduced afterwards, once the reader has something to attach it to. Their
 * testing found the alternative is not that people ask: they skim past the term
 * and quietly conclude it does not apply to them.
 *
 * Beside it, not below it, is what the thing is. A reader who cannot tell what
 * they are looking at cannot be moved by the figure, and a reader who has to
 * scroll to the bottom of a long page to find out has already gone. The two
 * questions a stranger asks first, "is something wrong" and "what is this", are
 * therefore answered at the same moment and in the same view. The long version
 * of the second answer still exists in full further down; this is the paragraph
 * that buys it a reader.
 */
export function Hero({
  header,
  draftedCount,
  openFigure,
  onOpenFigure,
}: {
  header: ReviewHeader;
  /** How many flagged records already have their next action written. */
  draftedCount: number;
  /** Which figure's derivation is open, so the statement can show it. */
  openFigure: FigureId | null;
  onOpenFigure: (figure: FigureId) => void;
}) {
  const period = formatPeriod(header.period);

  return (
    <div
      className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-12"
      data-testid="hero"
    >
      <div className="flex flex-col gap-5">
        {/*
          The page's only h1, and the first heading in the document. Before this
          the outline began at h5 and a screen reader's heading list read as four
          bare rupee figures with nothing above them.

          Capped rather than full bleed: a headline that runs the whole width of
          a wide monitor is one line of 140 characters, which is past the point
          where a reader's eye reliably finds the next line.
        */}
        <PageTitle className="max-w-[15ch] sm:max-w-[24ch]">
          {formatRupees(header.itcAtRiskPaise)} of tax you have already paid is not safe to claim
          back yet.
        </PageTitle>

        {/* Two paragraphs, not one. The first is the whole idea in words a
            person who has never filed a return already has, and it is where the
            form's name is introduced rather than assumed. The second is what
            was actually done, in three short sentences: a count reads faster
            than the same count inside a clause. */}
        <div className="flex max-w-[56ch] flex-col gap-3">
          <Body>
            Razorpay takes a fee out of every settlement it pays you, and charges tax on that fee.
            You are allowed to claim that tax back. You get it back only for the part Razorpay has
            reported to the tax department, on the monthly statement it files against your name,
            the GSTR-2B.
          </Body>
          <Body>
            Trace checked all {header.totalRecords} settlement records for {period} against that
            statement. {header.matchedCount} of them line up. {header.exceptionCount} do not, and
            those are the ones below.
          </Body>
        </div>

        {/* The instruction lives inside the object it describes. Set outside
            it, under the card, it read as a caption for the whole page and was
            the last thing anyone associated with the lines it is about. */}
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 sm:p-6">
          <Reconciliation header={header} openFigure={openFigure} onOpenFigure={onOpenFigure} />
          <div className="flex flex-col gap-4 border-t border-border pt-3">
            <Caption>Select any line, or either half of the bar, to see the working behind it.</Caption>
            <ProvenanceKey draftedCount={draftedCount} />
          </div>
        </div>
      </div>

      <HowItReadsThis />
    </div>
  );
}

/**
 * Who produced what, drawn rather than described.
 *
 * This was two sentences of prose in the card on the right, one of which read
 * "Indigo is where a model spoke". That asked a reader to hold a colour name in
 * their head and map it onto things they had not seen yet, which is work a
 * legend exists to save them. A swatch beside a label does the mapping on the
 * page.
 *
 * It sits under the reconciliation rather than beside it because a key belongs
 * with the thing it explains, and because moving it here is what brought the
 * card on the right back above the fold: it was the last two lines of that card
 * that were being cut off.
 *
 * Two rows and nothing else. A third line used to sit under them saying "No
 * figure on this page came from a model", which is the same thing the first row
 * already says, in the register of a claim being defended rather than a key
 * being read. A legend that argues with the reader is no longer a legend.
 */
function ProvenanceKey({ draftedCount }: { draftedCount: number }) {
  return (
    <div className="flex flex-col gap-2" data-testid="provenance-key">
      {/* Each swatch is drawn the way the thing it stands for is drawn: solid
          ink for a figure, and the panel treatment, pale ground inside an
          indigo edge, for anything a model wrote. Two solid squares in two
          shades would have been a legend the reader still had to decode at a
          glance. */}
      <KeyRow swatch="bg-foreground" label="Worked out from your settlement data">
        Every figure on this page. Open any of them to see the sum behind it.
      </KeyRow>
      <KeyRow swatch="border border-primary/70 bg-agent" label="Written by a model">
        {draftedCount > 0
          ? `The reasons, the answers and the drafted actions. ${draftedCount} flagged records already have their next action written and are waiting for you to approve it.`
          : "The reasons, the answers and the drafts. None of them can change a figure."}
      </KeyRow>
    </div>
  );
}

/** One entry in the key: the colour, what it marks, and what that covers. */
function KeyRow({
  swatch,
  label,
  children,
}: {
  swatch: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2.5">
      {/* Aligned on the first line's baseline the way a bullet is, rather than
          centred, which would float it in the middle of a two-line paragraph. */}
      <span className={`size-2.5 shrink-0 translate-y-px rounded-sm ${swatch}`} aria-hidden />
      <Caption as="p" className="leading-relaxed">
        <span className="font-medium text-foreground">{label}.</span> {children}
      </Caption>
    </div>
  );
}

/**
 * What the thing is, beside the finding rather than under it.
 *
 * Numbered because this genuinely is a sequence: each layer consumes what the
 * one before it produced, and a reader who does not know the order cannot tell
 * which figures a model touched. The answer to that is none of them, and the
 * separation between a deterministic matcher and three layers that ask a model
 * IS the design, so it is said here rather than left to a footnote.
 *
 * Short entries on purpose. This is the version that has to survive being read
 * in five seconds by somebody deciding whether to scroll; the full account, with
 * the tax problem and the questions people ask next, is further down the page
 * and none of it was cut to make room for this.
 */
function HowItReadsThis() {
  return (
    <aside
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 sm:p-6"
      data-testid="hero-orientation"
    >
      <div className="flex flex-col gap-1.5">
        <CardTitle as="h2">How Trace reaches that number</CardTitle>
        <Caption as="p" className="leading-relaxed">
          Four steps. Only the first one works out any money, and it never asks a model.
        </Caption>
      </div>

      <ol className="flex flex-col">
        {LAYERS.map((layer, index) => (
          <li
            key={layer.name}
            className="flex gap-3 border-t border-border/70 py-2.5 first:border-t-0 first:pt-0 last:pb-0"
          >
            <span className="mt-0.5 w-3 shrink-0 font-mono text-mono text-muted-foreground">
              {index + 1}
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span
                className={
                  layer.agent
                    ? "text-body font-medium text-primary"
                    : "text-body font-medium text-foreground"
                }
              >
                {layer.name}
              </span>
              <Caption as="p" className="leading-relaxed">
                {layer.detail}
              </Caption>
            </div>
          </li>
        ))}
      </ol>
    </aside>
  );
}

/** The four layers, in the order the data moves through them. */
const LAYERS = [
  {
    name: "Detect",
    detail:
      "Checks every fee against Razorpay's published price list, then the month against the statement.",
    agent: false,
  },
  {
    name: "Investigate",
    detail: "Sorts whatever did not match into five reasons, and shows the evidence for each.",
    agent: true,
  },
  {
    name: "Explain",
    detail: "Answers questions about this month, naming the records each answer rests on.",
    agent: true,
  },
  {
    name: "Act",
    detail: "Writes the email to your CA, the entry for your return and the Tally voucher.",
    agent: true,
  },
];
