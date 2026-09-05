"use client";

import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { formatIstDateTime, formatIstDayMonth, formatPeriod } from "@/lib/format/date";
import { formatRupees } from "@/lib/format/money";
import { describeRecord } from "@/lib/format/record";
import type { ExceptionCategory } from "@/lib/matching";
import type { ReviewBatch, ReviewRow } from "@/lib/review/batch";
import { rateLabel } from "@/lib/review/explain";
import type { InvestigationTrace } from "@/lib/review/trace";
import { narrateToolCall } from "@/lib/review/trace-summary";
import { ActionCards } from "./action-cards";
import { ExplainPanel } from "./explain-panel";
import { FigureDetail, type FigureId } from "./figure-detail";
import { Hero } from "./hero";
import { CATEGORY_LABELS } from "./labels";
import { HowItWorks, TestDataNotice } from "./orientation";
import { Section } from "./ui/section";
import { Caption, CardTitle, RecordId } from "./ui/type";

/**
 * The DOM id a citation scrolls to (PRD §15.5).
 *
 * Derived from the record id in one place, so the anchor the table renders and
 * the anchor a citation looks for cannot come to disagree. A citation that
 * silently scrolled nowhere would look exactly like one that worked.
 */
const rowAnchorId = (recordId: string) => `row-${recordId}`;

/**
 * What the side panel is currently explaining.
 *
 * One slot, two kinds of thing. A record and a headline figure are both answers
 * to "where did that come from", and giving each its own panel would mean two
 * places to look and two interactions to learn. Null is the empty state, which
 * is a prompt rather than a blank.
 */
type Selection =
  | { kind: "record"; recordId: string }
  | { kind: "figure"; figure: FigureId }
  | null;

/** Which slice of the batch a tab shows. */
type View = "flagged" | "matched" | "all";

/**
 * The screen itself. It receives a finished batch and renders it: no fetching,
 * no matching, and no arithmetic beyond formatting, so every rupee figure comes
 * from `formatRupees` and the pixels cannot disagree with the audit trail.
 */
export function ExceptionReview({ batch }: { batch: ReviewBatch }) {
  const { header, rows } = batch;
  const [selection, setSelection] = useState<Selection>(null);
  const [view, setView] = useState<View>("flagged");
  const detailRef = useRef<HTMLDivElement>(null);

  const openRecordId = selection?.kind === "record" ? selection.recordId : null;
  const openRow = rows.find((row) => row.recordId === openRecordId) ?? null;

  const flagged = rows.filter((row) => row.status === "EXCEPTION");
  const matched = rows.filter((row) => row.status !== "EXCEPTION");

  /**
   * Bring the panel into view if it is not already there.
   *
   * Without this the product looked broken. Clicking a figure at the top of the
   * page changed a panel most of a screen further down, so on anything shorter
   * than a desktop monitor the visible result of the click was nothing at all.
   * Guarded rather than unconditional: scrolling a panel that is already on
   * screen yanks the page for no reason, which is its own kind of wrong.
   */
  const bringDetailIntoView = () => {
    const panel = detailRef.current;
    if (panel === null) return;

    const box = panel.getBoundingClientRect();
    const alreadyVisible = box.top >= 64 && box.bottom <= window.innerHeight;
    if (alreadyVisible) return;

    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const openFigure = (figure: FigureId) => {
    setSelection({ kind: "figure", figure });
    bringDetailIntoView();
  };

  const openRecord = (recordId: string) => {
    setSelection({ kind: "record", recordId });
    bringDetailIntoView();
  };

  /**
   * Reveal the record a citation names: open its panel and bring its row into
   * view. Both halves matter. Scrolling to a row without opening it leaves the
   * reader to find the claim again themselves.
   *
   * The view switches to the tab that actually holds the row first. A citation
   * that pointed at a row filtered out of the current tab used to scroll
   * nowhere, which reads as a broken link rather than as a hidden row.
   */
  const revealRecord = (recordId: string) => {
    const row = rows.find((candidate) => candidate.recordId === recordId);
    if (row !== undefined) {
      setView(row.status === "EXCEPTION" ? "flagged" : "matched");
    }
    setSelection({ kind: "record", recordId });

    // After the tab has committed, or the row is not in the document yet.
    requestAnimationFrame(() => {
      document
        .getElementById(rowAnchorId(recordId))
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-10 px-4 py-8 sm:px-6 sm:py-10">
      {/* Where the skip link lands. It has to be the first thing in the page:
          the point of the link is to get past the chrome, and a target below the
          hero would skip the reader past the page's own headline too. */}
      <div id="reconciliation" tabIndex={-1} className="outline-none">
        <Hero
          header={header}
          openFigure={selection?.kind === "figure" ? selection.figure : null}
          onOpenFigure={openFigure}
        />
      </div>

      <TestDataNotice />

      <Section
        title="Every settlement record"
        description="Flagged rows first, because they are the ones that need a decision. Select any row to see the working behind its verdict."
        bodyClassName="pt-4"
        data-testid="record-section"
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)] lg:items-start">
          {/*
            Three tabs, and only the open one is in the document.

            This is the difference between a page that carries 54 rows at all
            times and one that carries 16. It is a legibility decision first: a
            reader opening this wants the exceptions, and handing them every
            matched row alongside buries the queue. It is also what makes the
            colour scheme switch instant, because the cost of a repaint scales
            with how much is mounted.
          */}
          {/* `min-w-0` is what stops the whole document scrolling sideways on a
              phone. A grid item defaults to `min-width: auto`, so this column
              refused to shrink below the table's own 680px minimum and pushed
              the BODY wider than the viewport: 731px inside a 390px screen.
              The table scrolls inside its own box; the page must not scroll
              with it. */}
          <Tabs
            value={view}
            onValueChange={(next) => setView(next as View)}
            className="min-w-0"
          >
            {/* Scrolls rather than shrinks. Three tabs and their counts need about
                322px, which is more than a 320px phone has after page padding,
                and a tab list that refuses to fit takes the whole document
                sideways with it. */}
            <TabsList variant="line" className="mb-3 max-w-full overflow-x-auto">
              <TabsTrigger value="flagged" data-testid="tab-flagged">
                Flagged
                <Badge variant="outline" className="ml-1.5 tabular-nums">
                  {flagged.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="matched" data-testid="tab-matched">
                Matched
                <Badge variant="outline" className="ml-1.5 tabular-nums">
                  {matched.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="all" data-testid="tab-all">
                All
                <Badge variant="outline" className="ml-1.5 tabular-nums">
                  {rows.length}
                </Badge>
              </TabsTrigger>
            </TabsList>

            {/* `min-w-0` on the panel as well as on the tabs. The panel is a
                flex item, so its own `min-width: auto` resolves to the table's
                680px minimum and it refuses to shrink no matter what its parent
                does. Both links in the chain have to give. */}
            <TabsContent value="flagged" className="min-w-0">
              <RecordTable rows={flagged} openRecordId={openRecordId} onSelect={openRecord} />
            </TabsContent>
            <TabsContent value="matched" className="min-w-0">
              <RecordTable rows={matched} openRecordId={openRecordId} onSelect={openRecord} />
            </TabsContent>
            <TabsContent value="all" className="min-w-0">
              <RecordTable rows={rows} openRecordId={openRecordId} onSelect={openRecord} />
            </TabsContent>
          </Tabs>

          {/*
            Sticky, because a row clicked forty rows down would otherwise open
            its explanation off the top of the screen. `min-w-0` on the grid
            child is what stops a long identifier inside it setting a floor for
            the whole column and pushing the document sideways on a phone.
          */}
          <aside
            ref={detailRef}
            className="min-w-0 lg:sticky lg:top-20"
            data-testid="detail-panel"
          >
            <div className="rounded-xl border border-border bg-card p-5">
              {selection?.kind === "figure" ? (
                <FigureDetail
                  figure={selection.figure}
                  header={header}
                  rows={rows}
                  onReveal={revealRecord}
                />
              ) : (
                <Detail row={openRow} period={header.period} />
              )}
            </div>
          </aside>
        </div>
      </Section>

      <Section
        title="Ask about this batch"
        description="The agent reads the reconciled batch and answers in plain English. Every record it relies on is named, and each one is a link to that row in the table above."
        data-testid="ask-section"
      >
        <ExplainPanel examples={batch.examples} onCite={revealRecord} />
      </Section>

      <HowItWorks />
    </div>
  );
}

/**
 * The records, as a real table.
 *
 * The whole row is one tab stop and one click target. The previous table put
 * `tabindex="0"` on every cell, which advertised 324 interactive stops, and
 * Enter on any of them did nothing. A screen that says a thing is operable and
 * then is not is worse than one that never offered.
 */
function RecordTable({
  rows,
  openRecordId,
  onSelect,
}: {
  rows: ReviewRow[];
  openRecordId: string | null;
  onSelect: (recordId: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center">
        <Caption>Nothing in this view.</Caption>
      </div>
    );
  }

  return (
    // The table scrolls inside its own box rather than taking the page with it.
    // Its columns have an intrinsic minimum of about 700px, and without this the
    // BODY grew wider than the viewport on a phone.
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table className="min-w-[680px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Payment</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="text-right">Fee</TableHead>
            <TableHead className="text-right">Tax</TableHead>
            <TableHead>Rate matched</TableHead>
            <TableHead>Category</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.recordId}
              id={rowAnchorId(row.recordId)}
              tabIndex={0}
              aria-label={`${describeRecord(row.paymentMethod, row.recordType)}, ${formatRupees(row.amountPaise)}. Show the working behind its verdict.`}
              data-state={row.recordId === openRecordId ? "selected" : undefined}
              onClick={() => onSelect(row.recordId)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                // Space scrolls by default, and a reader who pressed it meant to
                // act on the row under the cursor rather than to jump a
                // screenful away from it.
                event.preventDefault();
                onSelect(row.recordId);
              }}
              className="cursor-pointer scroll-mt-24 outline-none focus-visible:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
            >
              <TableCell>
                {/* The row leads with what the record IS and keeps its id
                    underneath. It used to lead with the settlement id, so 54
                    rows opened with the same seventeen characters and the only
                    thing telling one from another was a random string. */}
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="font-medium">
                    {describeRecord(row.paymentMethod, row.recordType)},{" "}
                    {formatIstDayMonth(row.settledAt)}
                  </span>
                  <RecordId>{row.recordId}</RecordId>
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatRupees(row.amountPaise)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatRupees(row.feePaise)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatRupees(row.taxPaise)}
              </TableCell>
              <TableCell>
                {/* The rate itself, not the matcher's internal name for the
                    tier. "EXACT" and "FUZZY" mean the standard cell and one of
                    the others, which is a fact about the code rather than about
                    the payment. "2.00% standard" is the same information in the
                    form a merchant recognises from their own pricing page. */}
                <span
                  className={
                    row.rateCell === null ? "font-medium text-at-risk" : "text-muted-foreground"
                  }
                >
                  {row.rateCell === null ? "No rate matches" : rateLabel(row.rateCell)}
                </span>
              </TableCell>
              <TableCell>
                {row.category === null ? (
                  // A matched row has no category. The dash that used to sit
                  // here read as missing data rather than as nothing to report.
                  <span className="text-muted-foreground">None</span>
                ) : (
                  <Badge variant="outline" className={categoryClass(row.category)}>
                    {CATEGORY_LABELS[row.category]}
                  </Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Why the open row carries the verdict it carries. */
function Detail({ row, period }: { row: ReviewRow | null; period: string }) {
  if (row === null) {
    return (
      <div className="flex flex-col gap-2">
        <CardTitle as="h3">Why was this flagged?</CardTitle>
        <Caption as="p" className="leading-relaxed">
          Select any row to see the reasoning behind its verdict: the figures it was compared
          against, and the rule that produced the category.
        </Caption>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <RecordId className="self-start">{row.recordId}</RecordId>
        <CardTitle as="h3">{row.explanation.headline}</CardTitle>
      </div>

      <Separator />

      <dl className="flex flex-col gap-2">
        <Field label="What it is" value={describeRecord(row.paymentMethod, row.recordType)} />
        <Field label="Amount" value={formatRupees(row.amountPaise)} />
        <Field label="Fee charged" value={formatRupees(row.feePaise)} />
        <Field label="GST inside the fee" value={formatRupees(row.taxPaise)} />
        {row.expectedFeePaise !== null && (
          <Field label="Fee expected" value={formatRupees(row.expectedFeePaise)} />
        )}
        <Field label="Settled" value={formatIstDateTime(row.settledAt)} />
        <Field
          label="Billed on"
          value={`${formatPeriod(row.billedIn)}'s GSTR-2B${
            row.billedIn === period ? "" : ", the next return"
          }`}
        />
        <Field label="Payout batch" value={row.settlementId} isCode />
        {/* The one identifier on this record a merchant can find on their own
            bank statement, which is the whole reason it is worth the line. */}
        {row.settlementUtr !== null && (
          <Field label="Bank reference" value={row.settlementUtr} isCode />
        )}
      </dl>

      <Separator />

      <div className="flex flex-col gap-2">
        {/* Keyed by position, not by the sentence: two identical points would
            collide as React keys and one would silently vanish from an
            explanation a person is meant to act on. */}
        {row.explanation.points.map((point, index) => (
          <p key={index} className="text-caption/relaxed">
            {point}
          </p>
        ))}
      </div>

      {/* PRD §15.1. Only exceptions are investigated, because the matcher
          resolves the other 38 rows on its own, so a matched row gets no section
          at all rather than an empty one implying a missing run. */}
      {row.status === "EXCEPTION" && (
        <>
          <Separator />
          {row.trace === null ? (
            <div className="flex flex-col gap-1">
              <CardTitle as="h4">What the agent did</CardTitle>
              <Caption as="p">
                No agent run has classified this record yet. Everything above comes from the
                deterministic matcher, not from a model. Run{" "}
                <code className="rounded-sm bg-muted px-1 py-0.5 font-mono">npm run eval</code> to
                record one.
              </Caption>
            </div>
          ) : (
            <AgentTrace trace={row.trace} />
          )}
        </>
      )}

      {row.creditNoteReview && (
        <Badge variant="outline" className="self-start border-primary/40 text-primary">
          Credit note review
        </Badge>
      )}

      {/* PRD §9, agent 3. Only exceptions get a drafted action: a row that
          matched cleanly has no next step, and offering one would invite a
          person to act where nothing is wrong. */}
      {row.status === "EXCEPTION" && (
        <>
          <Separator />
          <ActionCards recordId={row.recordId} recorded={row.draft} />
        </>
      )}
    </div>
  );
}

/**
 * What the agent actually did to reach this verdict (PRD §15.1).
 *
 * Read from an exported `ai_calls` row, never recomputed here. The provenance
 * line is not decoration: a trace is only checkable next to the model and prompt
 * version that produced it, and printing them means a trace left over from a
 * superseded prompt cannot be read as the current one's.
 */
function AgentTrace({ trace }: { trace: InvestigationTrace }) {
  return (
    <div className="flex flex-col gap-3" data-testid="agent-trace">
      <div className="flex items-center gap-3">
        <CardTitle as="h4">What the agent did</CardTitle>
        {/* The gate firing is shown, not hidden. "The gate never fired" is only
            a meaningful claim if a firing would have been visible. */}
        {trace.verdict !== "ACCEPTED" && (
          <Badge variant="outline" className="border-notice/50 text-notice">
            {trace.verdict}
          </Badge>
        )}
      </div>

      {trace.toolCalls.length === 0 ? (
        <Caption as="p">It called no tools. The record itself was enough to classify.</Caption>
      ) : (
        <ol className="flex flex-col gap-3">
          {/* Keyed by position: the same tool can legitimately be called twice
              with different inputs, so keying by name would drop one.

              Numbered, because the order is the reasoning. A reader checking
              this is following steps, and a stack of unnumbered paragraphs does
              not say that they happened in sequence. */}
          {trace.toolCalls.map((call, index) => {
            const step = narrateToolCall(call);
            return (
              <li key={index} className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-accent font-mono text-mono text-accent-foreground">
                  {index + 1}
                </span>
                {/* Long ids and figures run without spaces, so without an
                    explicit break they set a minimum width for the whole panel
                    and push the PAGE sideways on a narrow screen. */}
                <div className="flex min-w-0 flex-col gap-0.5 break-words">
                  <span className="text-caption">{step.asked}</span>
                  <span className="text-caption text-muted-foreground">{step.found}</span>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {trace.reason !== null && (
        // Marked as the model's own words, and not paraphrased. It reads denser
        // than the rest of the panel because it IS denser: one sentence written
        // by a model to justify a category, quoted rather than rewritten so that
        // a reader checking the classification is checking what was actually
        // said. Rewriting it here would make the audit trail and the screen two
        // different claims.
        <blockquote className="flex flex-col gap-1 border-l-2 border-primary/40 pl-3">
          <Caption>Why it chose {CATEGORY_LABELS[trace.category]}, in its own words</Caption>
          <span className="text-caption break-words">{trace.reason}</span>
        </blockquote>
      )}

      <Provenance trace={trace} />
    </div>
  );
}

/**
 * Which model produced this trace, when, and what it cost, behind a disclosure.
 *
 * None of it is decoration and none of it is deleted. A trace is only checkable
 * next to the model and prompt version that produced it, and the latency and the
 * token counts are the same kind of fact: evidence that a real call happened
 * rather than a canned string.
 *
 * They are just not what the reader is here for. On the surface, a model name, a
 * prompt version, a duration and two token counts sat in the same visual
 * position as the finding and read as though the product were proud of its own
 * plumbing. Folded away, it is there for anyone auditing and invisible to
 * everyone else.
 *
 * A native `<details>` rather than a component. It opens with no JavaScript,
 * it is in the tab order for free, and the browser's own find-in-page can open
 * it to reveal a match.
 */
function Provenance({ trace }: { trace: InvestigationTrace }) {
  return (
    <details className="group/provenance">
      <summary className="cursor-pointer list-none text-caption text-muted-foreground underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
        How this was produced
        <span className="ml-1 inline-block transition-transform group-open/provenance:rotate-90">
          &rsaquo;
        </span>
      </summary>
      <dl className="mt-3 flex flex-col gap-2">
        <Field label="Model" value={trace.model} isCode />
        <Field label="Prompt version" value={trace.promptVersion} isCode />
        <Field label="Took" value={`${(trace.latencyMs / 1000).toFixed(1)}s`} />
        <Field
          label="Tokens"
          value={`${trace.inputTokens.toLocaleString("en-IN")} in, ${trace.outputTokens.toLocaleString("en-IN")} out`}
        />
      </dl>
      <Caption as="p" className="mt-2 leading-relaxed">
        Recorded from a real run and replayed here, never regenerated on view. A trace recomputed
        when someone opens it would not be the one the audit trail holds.
      </Caption>
    </details>
  );
}

/**
 * One labelled value in the detail panel.
 *
 * `isCode` is for the values that are identifiers rather than words. Setting an
 * id in the same face as a sentence is what made this panel read as a wall of
 * strings; setting it in the monospace face says "this is a code, copy it".
 */
function Field({
  label,
  value,
  isCode = false,
}: {
  label: string;
  value: string;
  isCode?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-caption text-muted-foreground">{label}</dt>
      {isCode ? (
        <dd className="min-w-0 text-right">
          <RecordId>{value}</RecordId>
        </dd>
      ) : (
        <dd className="min-w-0 text-right text-caption font-medium break-words">{value}</dd>
      )}
    </div>
  );
}

/**
 * The treatment a category carries. Tied to what the category costs the
 * merchant, not chosen for variety: the two that put credit at risk are red, a
 * timing difference is a warning, and the two that are merely worth knowing are
 * quiet.
 */
function categoryClass(category: ExceptionCategory): string {
  switch (category) {
    case "FEE_DEDUCTION":
    case "UNEXPLAINED":
      return cn("border-at-risk/40 bg-at-risk/10 text-at-risk");
    case "TIMING":
      return cn("border-notice/40 bg-notice/10 text-notice");
    case "REFUND_NETTED":
      return cn("border-primary/40 bg-primary/10 text-primary");
    case "PARTIAL_PAYMENT":
      return cn("text-muted-foreground");
  }
}
