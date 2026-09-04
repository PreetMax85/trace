"use client";

import { useState } from "react";
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  CardBody,
  Code,
  Divider,
  Heading,
  Text,
} from "@razorpay/blade/components";
import { confirmable } from "@/lib/act/confirm";
import type { RecordedDraft } from "@/lib/act/library";
import type { ActDraft } from "@/lib/act/schema";
import type { actionKind } from "@/lib/audit/schema";
import { formatRupees } from "@/lib/format/money";

/**
 * The Act layer on screen (PRD §9, agent 3).
 *
 * Three drafts per flagged record and a Confirm button on each. Nothing here
 * sends an email, files a return or posts to anyone's books — confirming writes
 * one `actions` row recording that a person approved this draft, and that is
 * the whole of the human gate.
 *
 * The drafts are RECORDED, not generated on view, and that is what makes the
 * button honest: the text on screen, the text confirmed and the text stored in
 * `actions.draft` are the same bytes. A draft regenerated each time the row was
 * opened would mean a person approved something slightly different from what
 * the audit trail kept.
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
}): React.ReactElement {
  // Keyed by record AND kind, so confirmations survive switching between rows
  // and one record's approval never reads as another's.
  const [confirmed, setConfirmed] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allowed = confirmable(recorded);

  if (recorded === null || recorded.draft === null) {
    return (
      <Box display="flex" flexDirection="column" gap="spacing.2" testID="action-cards">
        <Heading size="small">What to do next</Heading>
        <Text size="small" color="surface.text.gray.muted">
          No action has been drafted for this record yet. Nothing above needs a model — run{" "}
          <Code size="small" isHighlighted={false}>
            npm run act
          </Code>{" "}
          to record the CA email, the GSTR-3B flag and the Tally entry.
        </Text>
      </Box>
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
    <Box display="flex" flexDirection="column" gap="spacing.4" testID="action-cards">
      <Box display="flex" flexDirection="column" gap="spacing.2">
        <Heading size="small">What to do next</Heading>
        <Text size="small" color="surface.text.gray.muted">
          Drafted for you to review. Nothing is sent, filed or posted — confirming records that you
          approved this draft, and the sending stays yours.
        </Text>
      </Box>

      {/* The gate firing is shown, not hidden, and it is what disables the
          buttons. A gate that only annotates stops nothing. */}
      {!allowed.ok && (
        <Alert
          color="negative"
          emphasis="subtle"
          isDismissible={false}
          description={allowed.reason}
          testID="draft-gate-warning"
        />
      )}

      {error !== null && (
        <Alert color="notice" emphasis="subtle" isDismissible={false} description={error} />
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
      <Text variant="caption" size="small" color="surface.text.gray.muted">
        Drafted by {recorded.model} · prompt {recorded.promptVersion} · recorded{" "}
        {recorded.recordedAt.slice(0, 10)}
      </Text>
    </Box>
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
}): React.ReactElement {
  const isConfirmed = confirmedAt !== undefined;

  return (
    <Card padding="spacing.5" elevation="lowRaised" testID={`action-${kind}`}>
      <CardBody>
        <Box display="flex" flexDirection="column" gap="spacing.3">
          <Box display="flex" alignItems="center" justifyContent="space-between" gap="spacing.3">
            <Heading size="small">{KIND_LABELS[kind]}</Heading>
            {isConfirmed && (
              <Badge color="positive" emphasis="intense" size="medium">
                Confirmed
              </Badge>
            )}
          </Box>

          <ActionBody kind={kind} draft={draft} />

          <Divider />

          <Box display="flex" alignItems="center" justifyContent="space-between" gap="spacing.3">
            <Text variant="caption" size="small" color="surface.text.gray.muted">
              {isBusy
                ? "Recording your approval…"
                : isConfirmed
                  ? `Approved${confirmedAt === null ? "" : ` ${confirmedAt.slice(0, 10)}`}. Nothing was sent.`
                  : "Draft — not sent, not filed."}
            </Text>
            {/*
              `isLoading` matters more here than it looks. Confirming writes a
              row to the database over the network, and without a spinner the
              button sat unchanged for the whole round trip — so the honest
              reading of the screen was that the click had not registered, and
              the natural response was to click again. The handler already
              refuses a second click while `busy` is set; this is the half that
              tells the person why.
            */}
            <Button
              variant="primary"
              size="small"
              isLoading={isBusy}
              isDisabled={isConfirmed || isBlocked}
              onClick={onConfirm}
              testID={`confirm-${kind}`}
            >
              {isConfirmed ? "Confirmed" : "Confirm"}
            </Button>
          </Box>
        </Box>
      </CardBody>
    </Card>
  );
}

/** The draft itself, rendered as the thing a person is being asked to approve. */
function ActionBody({ kind, draft }: { kind: ActionKind; draft: ActDraft }): React.ReactElement {
  if (kind === "CA_EMAIL") {
    return (
      <Box display="flex" flexDirection="column" gap="spacing.2">
        <Text size="small" weight="semibold" color="surface.text.gray.normal">
          {draft.caEmail.subject}
        </Text>
        <Text size="small" color="surface.text.gray.normal">
          {draft.caEmail.body}
        </Text>
      </Box>
    );
  }

  if (kind === "GSTR3B_FLAG") {
    const { line, action, amountPaise, note } = draft.gstr3bFlag;
    return (
      <Box display="flex" flexDirection="column" gap="spacing.2">
        <Text size="small" weight="semibold" color="surface.text.gray.normal">
          {/* A flag with no row is not an omission — it is the draft saying
              nothing belongs on this return, which a row number would
              contradict. */}
          {action === "NO_ENTRY" || line === null
            ? `Nothing to file this period for ${formatRupees(amountPaise)}`
            : `${action} ${formatRupees(amountPaise)} on Table ${line}`}
        </Text>
        <Text size="small" color="surface.text.gray.normal">
          {note}
        </Text>
      </Box>
    );
  }

  const { voucherType, lines, narration } = draft.tallyEntry;
  return (
    <Box display="flex" flexDirection="column" gap="spacing.2">
      <Text size="small" weight="semibold" color="surface.text.gray.normal">
        {voucherType === "JOURNAL" ? "Journal voucher" : "Credit note"}
      </Text>
      {lines.map((line, index) => (
        // Keyed by position: two lines can post the same amount to the same
        // ledger on opposite sides, and keying by content would collide.
        <Box key={index} display="flex" justifyContent="space-between" gap="spacing.3">
          <Text size="small" color="surface.text.gray.normal">
            {line.side === "DEBIT" ? "Dr" : "Cr"} {line.ledger}
          </Text>
          <Text size="small" color="surface.text.gray.normal">
            {formatRupees(line.amountPaise)}
          </Text>
        </Box>
      ))}
      <Text variant="caption" size="small" color="surface.text.gray.muted">
        {narration}
      </Text>
    </Box>
  );
}
