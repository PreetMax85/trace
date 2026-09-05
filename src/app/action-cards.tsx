"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
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
        <CardTitle as="h4">What to do next</CardTitle>
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
    <div className="flex flex-col gap-3" data-testid="action-cards">
      <div className="flex flex-col gap-1">
        <CardTitle as="h4">What to do next</CardTitle>
        <Caption as="p" className="leading-relaxed">
          Drafted for you to review. Nothing is sent, filed or posted. Confirming records that you
          approved this draft, and the sending stays yours.
        </Caption>
      </div>

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

      {/* Provenance, on the same reasoning as the reasoning trace's: a draft is
          only checkable next to the model and prompt that wrote it and the day
          it was written, so one left over from a superseded prompt cannot pass
          as the current one's. */}
      <Caption as="p">
        Drafted by {recorded.model} on {recorded.recordedAt.slice(0, 10)}, prompt{" "}
        {recorded.promptVersion}.
      </Caption>
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
      <div className="flex items-center justify-between gap-3">
        <CardTitle>{KIND_LABELS[kind]}</CardTitle>
        {isConfirmed && (
          <Badge variant="outline" className="border-explained/40 bg-explained/10 text-explained">
            Confirmed
          </Badge>
        )}
      </div>

      <ActionBody kind={kind} draft={draft} />

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
