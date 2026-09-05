"use client";

import { useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { confirmable } from "@/lib/act/confirm";
import type { RecordedDraft } from "@/lib/act/library";
import type { ActDraft } from "@/lib/act/schema";
import type { actionKind } from "@/lib/audit/schema";
import { formatRupees } from "@/lib/format/money";
import { Caption, CardTitle } from "./ui/type";

/**
 * The Act layer on screen (PRD §9, agent 3).
 *
 * Three drafts per flagged record and a Confirm button on each. Nothing here
 * sends an email, files a return or posts to anyone's books. Confirming writes
 * one `actions` row recording that a person approved this draft, and that is the
 * whole of the human gate.
 *
 * The drafts are RECORDED, not generated on view, and that is what makes the
 * button honest: the text on screen, the text confirmed and the text stored in
 * `actions.draft` are the same bytes. A draft regenerated each time the row was
 * opened would mean a person approved something slightly different from what the
 * audit trail kept.
 */
type ActionKind = (typeof actionKind.enumValues)[number];

const KIND_LABELS: Record<ActionKind, string> = {
  CA_EMAIL: "Email your CA",
  GSTR3B_FLAG: "Flag on GSTR-3B",
  TALLY_ENTRY: "Tally correction entry",
};

export function ActionCards({
  recordId,
  recorded,
}: {
  recordId: string;
  recorded: RecordedDraft | null;
}) {
  // Keyed by record AND kind, so confirmations survive switching between rows
  // and one record's approval never reads as another's.
  const [confirmed, setConfirmed] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allowed = confirmable(recorded);

  if (recorded === null || recorded.draft === null) {
    return (
      <div className="flex flex-col gap-1" data-testid="action-cards">
        <Caption as="p" className="leading-relaxed">
          No action has been drafted for this record yet. Nothing above needs a model. Run{" "}
          <code className="rounded-sm bg-muted px-1 py-0.5 font-mono">npm run act</code> to record
          the CA email, the GSTR-3B flag and the Tally entry.
        </Caption>
      </div>
    );
  }

  const draft = recorded.draft;

  const confirm = async (kind: ActionKind) => {
    const key = `${recordId}:${kind}`;
    if (busy !== null || confirmed[key] !== undefined) return;

    setBusy(key);
    setError(null);
    try {
      const response = await fetch("/api/actions/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId, kind }),
      });
      const payload = await response.json();

      if (!response.ok) {
        // The route's own message, shown as written. It is the one that knows
        // whether this deployment has a database and whether the gate allowed it.
        setError(typeof payload.error === "string" ? payload.error : "That did not work.");
        return;
      }

      setConfirmed((current) => ({ ...current, [key]: payload.confirmedAt ?? null }));
    } catch {
      setError("The confirmation did not reach the server. Nothing was recorded.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4" data-testid="action-cards">
      {/* The gate firing is shown, not hidden, and it is what disables the
          buttons. A gate that only annotates stops nothing. */}
      {!allowed.ok && (
        <Alert variant="destructive" data-testid="draft-gate-warning">
          <AlertDescription>{allowed.reason}</AlertDescription>
        </Alert>
      )}

      {error !== null && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/*
        Three columns, not a stack, and this is the reason the drafts are no
        longer inside the panel beside the table. Stacked in a 465px column the
        three of them ran about nine hundred words and stood a thousand pixels
        taller than the table they sat next to, so two were collapsed to stop it
        being a wall and the whole Act layer ended up as the least visible thing
        on a page whose point is that it writes the next action.

        Across a full-width band each one is its own artefact at its own height,
        so all three can be open at once: a letter, a filing instruction and a
        journal voucher, side by side, which is what a person actually has to
        take away from this screen.
      */}
      {/* The letter gets the wider column. It is four paragraphs where the other
          two are three lines, so equal thirds made it the tallest card by a long
          way and the two beside it were mostly empty. Widening it shortens it.

          `items-start` is the whole fix for a bug that read as three broken
          disclosures. Each card used to fill the row's height so that the three
          Confirm buttons lined up along the bottom, and a grid row is as tall as
          its tallest item: opening the letter therefore stretched the two closed
          cards beside it into tall empty boxes, and closing one could not shrink
          it back while another was open. On screen that is indistinguishable
          from a card that opened by itself and had nothing in it. Each card is
          now its own height, and the buttons land where their own content ends,
          which is the honest place for them. */}
      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)_minmax(0,1fr)]">
        {(Object.keys(KIND_LABELS) as ActionKind[]).map((kind) => (
          <ActionCard
            key={kind}
            kind={kind}
            draft={draft}
            confirmedAt={confirmed[`${recordId}:${kind}`]}
            isBusy={busy === `${recordId}:${kind}`}
            isBlocked={!allowed.ok}
            onConfirm={() => void confirm(kind)}
          />
        ))}
      </div>

    </div>
  );
}

function ActionCard({
  kind,
  draft,
  confirmedAt,
  isBusy,
  isBlocked,
  onConfirm,
}: {
  kind: ActionKind;
  draft: ActDraft;
  /** Undefined when not confirmed; a timestamp, or null, once it has been. */
  confirmedAt: string | null | undefined;
  isBusy: boolean;
  isBlocked: boolean;
  onConfirm: () => void;
}) {
  const isConfirmed = confirmedAt !== undefined;

  return (
    <div
      className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4"
      data-testid={`action-${kind}`}
    >
      {/*
        A native disclosure rather than a state hook. The draft stays in the
        document either way, so it is findable by search, by a screen reader
        that lists content, and by anything that grades this page; only its
        visibility changes, and the browser handles the toggle, the keyboard
        and the announcement without a line of ours.
      */}
      <details open className="group/draft flex flex-col gap-3">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <CardTitle>{KIND_LABELS[kind]}</CardTitle>
          <div className="flex shrink-0 items-center gap-2">
            {isConfirmed && (
              <Badge variant="outline" className="border-explained/40 bg-explained/10 text-explained">
                Confirmed
              </Badge>
            )}
            <ChevronDown
              className="size-4 text-muted-foreground transition-transform group-open/draft:rotate-180"
              aria-hidden
            />
          </div>
        </summary>

        <div className="mt-3">
          <ActionBody kind={kind} draft={draft} />
        </div>
      </details>

      <Separator />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Caption>
          {isBusy
            ? "Recording your approval"
            : isConfirmed
              ? `Approved${confirmedAt === null ? "" : ` ${confirmedAt.slice(0, 10)}`}. Nothing was sent.`
              : "Draft. Not sent, not filed."}
        </Caption>
        {/*
          The spinner matters more than it looks. Confirming writes a row to the
          database over the network, and without it the button sat unchanged for
          the whole round trip, so the honest reading of the screen was that the
          click had not registered and the natural response was to click again.
          The handler already refuses a second click while `busy` is set; this is
          the half that tells the person why.
        */}
        <Button
          size="sm"
          disabled={isConfirmed || isBlocked || isBusy}
          onClick={onConfirm}
          data-testid={`confirm-${kind}`}
        >
          {isBusy && <Loader2 className="animate-spin" aria-hidden />}
          {isConfirmed ? "Confirmed" : "Confirm"}
        </Button>
      </div>
    </div>
  );
}

/** The draft itself, rendered as the thing a person is being asked to approve. */
function ActionBody({ kind, draft }: { kind: ActionKind; draft: ActDraft }) {
  if (kind === "CA_EMAIL") {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-caption font-semibold">{draft.caEmail.subject}</span>
        <p className="text-caption/relaxed whitespace-pre-line">{draft.caEmail.body}</p>
      </div>
    );
  }

  if (kind === "GSTR3B_FLAG") {
    const { line, action, amountPaise, note } = draft.gstr3bFlag;
    return (
      <div className="flex flex-col gap-1">
        <span className="text-caption font-semibold">
          {/* A flag with no row is not an omission. It is the draft saying that
              nothing belongs on this return, which a row number would
              contradict. */}
          {action === "NO_ENTRY" || line === null
            ? `Nothing to file this period for ${formatRupees(amountPaise)}`
            : `${action} ${formatRupees(amountPaise)} on Table ${line}`}
        </span>
        <p className="text-caption/relaxed">{note}</p>
      </div>
    );
  }

  const { voucherType, lines, narration } = draft.tallyEntry;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-caption font-semibold">
        {voucherType === "JOURNAL" ? "Journal voucher" : "Credit note"}
      </span>
      {lines.map((line, index) => (
        // Keyed by position: two lines can post the same amount to the same
        // ledger on opposite sides, and keying by content would collide.
        <div key={index} className="flex justify-between gap-3 text-caption">
          <span>
            {line.side === "DEBIT" ? "Dr" : "Cr"} {line.ledger}
          </span>
          <span className="tabular-nums">{formatRupees(line.amountPaise)}</span>
        </div>
      ))}
      <Caption as="p" className="mt-1">
        {narration}
      </Caption>
    </div>
  );
}
