"use client";

import { Fragment, useState } from "react";
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  CardBody,
  Divider,
  Heading,
  Link,
  Spinner,
  Text,
  TextInput,
} from "@razorpay/blade/components";
import { MAX_QUESTION_CHARS } from "@/lib/explain/limits";
import type { AnswerSegment } from "@/lib/explain/citations";
import type { ExplainVerdict } from "@/lib/explain/policy";
import type { ExplainExample } from "@/lib/review/batch";

/**
 * The Explain layer on screen (PRD §15.5).
 *
 * Every answer names the records behind it, and each citation is a link that
 * scrolls to that row in the table — which is what makes §2's claim ("every
 * answer traces back to a specific record, amount and date") checkable rather
 * than asserted.
 *
 * Two sources, one renderer. The example questions were answered ahead of time
 * and are committed, so they work with no API key, no database and no network;
 * a typed question is answered live by the same `explain()` through the same
 * gate. They are drawn identically EXCEPT for provenance, which always says
 * which one this is — a recorded answer must never read as one just produced.
 */
type Answer = {
  segments: AnswerSegment[];
  cited: string[];
  unknown: string[];
  verdict: ExplainVerdict;
  /** Where this answer came from, in the words shown under it. */
  provenance: string;
};

export function ExplainPanel({
  examples,
  onCite,
}: {
  examples: ExplainExample[];
  /** Called with the record a citation points at, to reveal it in the table. */
  onCite: (recordId: string) => void;
}): React.ReactElement {
  const [openId, setOpenId] = useState<string | null>(examples[0]?.id ?? null);
  const [question, setQuestion] = useState("");
  const [live, setLive] = useState<Answer | null>(null);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const example = examples.find((candidate) => candidate.id === openId) ?? null;
  const shown = live ?? (example === null ? null : recordedAnswer(example));

  const ask = async () => {
    const asked = question.trim();
    if (asked.length === 0 || asking) return;

    setAsking(true);
    setError(null);
    try {
      const response = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: asked }),
      });
      const payload = await response.json();

      if (!response.ok) {
        // The route's own message, shown as written. It is the one that knows
        // whether this deployment has a key, a database or any budget left.
        setError(typeof payload.error === "string" ? payload.error : "That did not work.");
        return;
      }

      setOpenId(null);
      setLive({
        segments: payload.segments,
        cited: payload.cited,
        unknown: payload.unknown,
        verdict: payload.verdict,
        provenance: `answered live · ${payload.model} · ${payload.promptVersion}`,
      });
    } catch {
      setError("The answer never arrived. The recorded examples below still work.");
    } finally {
      setAsking(false);
    }
  };

  return (
    <Card padding="spacing.5" elevation="lowRaised" testID="explain-panel">
      <CardBody>
        <Box display="flex" flexDirection="column" gap="spacing.4">
          <Box display="flex" flexDirection="column" gap="spacing.2">
            <Heading size="small">Ask about this batch</Heading>
            <Text variant="caption" size="small" color="surface.text.gray.muted">
              The agent reads the reconciled batch and answers in plain English. Every record it
              relies on is named, and each one is a link to that row in the table below.
            </Text>
          </Box>

          <Box display="flex" gap="spacing.3" alignItems="flex-end" flexWrap="wrap">
            <Box flex="1 1 420px" minWidth="260px">
              <TextInput
                label="Your own question"
                placeholder="e.g. which records put my credit at risk?"
                value={question}
                maxCharacters={MAX_QUESTION_CHARS}
                isDisabled={asking}
                onChange={({ value }) => setQuestion(value ?? "")}
                // Enter submits. `onSubmit` is typed away on the web build of
                // TextInput, so the key is read here instead — verified against
                // the shipped types rather than guessed.
                onKeyDown={({ key }) => {
                  if (key === "Enter") void ask();
                }}
                testID="explain-question"
              />
            </Box>
            <Button
              variant="primary"
              size="medium"
              isDisabled={asking || question.trim().length === 0}
              onClick={() => void ask()}
            >
              Ask
            </Button>
          </Box>

          {error !== null && (
            <Alert
              color="notice"
              emphasis="subtle"
              isDismissible={false}
              description={error}
            />
          )}

          <Box display="flex" gap="spacing.3" flexWrap="wrap" testID="explain-questions">
            {examples.map((candidate) => (
              <Button
                key={candidate.id}
                variant={candidate.id === openId ? "secondary" : "tertiary"}
                size="xsmall"
                onClick={() => {
                  setLive(null);
                  setError(null);
                  setOpenId(candidate.id);
                }}
              >
                {candidate.question}
              </Button>
            ))}
          </Box>

          <Divider />

          {asking ? (
            <Box display="flex" alignItems="center" gap="spacing.3" testID="explain-answer">
              <Spinner accessibilityLabel="Answering" size="medium" />
              <Text size="small" color="surface.text.gray.muted">
                Reading the batch…
              </Text>
            </Box>
          ) : (
            <AnswerBody answer={shown} onCite={onCite} />
          )}
        </Box>
      </CardBody>
    </Card>
  );
}

/** A recorded example's answer, or nothing when none has been recorded. */
function recordedAnswer(example: ExplainExample): Answer | null {
  if (example.recorded === null) return null;

  const { segments, cited, unknown, verdict, model, promptVersion, recordedAt } = example.recorded;
  return {
    segments,
    cited,
    unknown,
    verdict,
    // Always says it was recorded, and when. An answer produced weeks ago must
    // never read as one produced just now, and the model and prompt version are
    // what make it checkable at all.
    provenance: `recorded ${recordedAt.slice(0, 10)} · ${model} · ${promptVersion}`,
  };
}

function AnswerBody({
  answer,
  onCite,
}: {
  answer: Answer | null;
  onCite: (recordId: string) => void;
}): React.ReactElement {
  if (answer === null) {
    return (
      <Box display="flex" flexDirection="column" gap="spacing.2" testID="explain-answer">
        <Text size="small" color="surface.text.gray.muted">
          No answer has been recorded for this question yet, and nothing is invented in its place.
          Run{" "}
          <Text as="span" size="small" weight="semibold">
            npm run explain
          </Text>{" "}
          to record one, or type a question above to ask live.
        </Text>
      </Box>
    );
  }

  return (
    <Box display="flex" flexDirection="column" gap="spacing.3" testID="explain-answer">
      {/* The gate firing is shown, not hidden. "It never cited a record that
          does not exist" is only a checkable claim if a citation that did would
          have been visible. */}
      {answer.verdict !== "ACCEPTED" && (
        <Box display="flex" alignItems="center" gap="spacing.3" flexWrap="wrap">
          <Badge color="negative" emphasis="intense" size="small">
            {answer.verdict}
          </Badge>
          <Text variant="caption" size="small" color="feedback.text.negative.intense">
            {answer.unknown.length > 0
              ? `${answer.unknown.join(", ")} is named here but is not a record in this batch, so it is not linked.`
              : "This answer did not come back in a usable form."}
          </Text>
        </Box>
      )}

      <Text size="small" color="surface.text.gray.normal">
        {answer.segments.map((segment, index) => (
          <Fragment key={index}>
            {segment.kind === "text" ? (
              segment.text
            ) : (
              <Link size="small" onClick={() => onCite(segment.recordId)}>
                {segment.recordId}
              </Link>
            )}
          </Fragment>
        ))}
      </Text>

      <Text size="xsmall" color="surface.text.gray.subtle">
        {answer.cited.length === 0
          ? "This answer cites no records."
          : `Cites ${answer.cited.length} record${answer.cited.length === 1 ? "" : "s"}.`}{" "}
        {answer.provenance}
      </Text>
    </Box>
  );
}
