"use client";

import { Fragment, useState } from "react";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { MAX_QUESTION_CHARS } from "@/lib/explain/limits";
import type { AnswerSegment } from "@/lib/explain/citations";
import type { ExplainVerdict } from "@/lib/explain/policy";
import type { ExplainExample } from "@/lib/review/batch";
import { Caption } from "./ui/type";

/**
 * The Explain layer on screen (PRD §15.5).
 *
 * Every answer names the records behind it, and each citation is a link that
 * scrolls to that row in the table, which is what makes §2's claim ("every
 * answer traces back to a specific record, amount and date") checkable rather
 * than asserted.
 *
 * Two sources, one renderer. The example questions were answered ahead of time
 * and are committed, so they work with no API key, no database and no network; a
 * typed question is answered live by the same `explain()` through the same gate.
 * They are drawn identically EXCEPT for provenance, which always says which one
 * this is: a recorded answer must never read as one just produced.
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
}) {
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
        provenance: `Answered live just now by ${payload.model}, prompt ${payload.promptVersion}.`,
      });
    } catch {
      setError("The answer never arrived. The recorded examples below still work.");
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="flex flex-col gap-4" data-testid="explain-panel">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={question}
          maxLength={MAX_QUESTION_CHARS}
          disabled={asking}
          placeholder="Which records put my credit at risk?"
          aria-label="Ask a question about this batch"
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void ask();
          }}
          data-testid="explain-question"
          className="min-w-[16rem] flex-1"
        />
        <Button disabled={asking || question.trim().length === 0} onClick={() => void ask()}>
          {asking && <Loader2 className="animate-spin" aria-hidden />}
          Ask
        </Button>
      </div>

      {error !== null && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Caption>Or open one of the questions already answered</Caption>
        <div className="flex flex-wrap gap-2" data-testid="explain-questions">
          {examples.map((candidate) => (
            <Button
              key={candidate.id}
              variant={candidate.id === openId ? "secondary" : "outline"}
              size="sm"
              onClick={() => {
                setLive(null);
                setError(null);
                setOpenId(candidate.id);
              }}
              // A button's default is one unbreakable line at a fixed height,
              // which is right for "Ask" and wrong for a whole question. One of
              // these is 389px of text, so on a phone it ran off the side and
              // took the document with it.
              className="h-auto max-w-full shrink py-1.5 text-left whitespace-normal"
            >
              {candidate.question}
            </Button>
          ))}
        </div>
      </div>

      {/* The answer gets its own inset ground rather than sitting in the same
          plane as the controls that produced it. Without the change of surface,
          the question, the examples and the answer read as one undifferentiated
          block of text. */}
      <div className="rounded-lg border border-border bg-background p-4" data-testid="explain-answer">
        {asking ? (
          <div className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
            <Caption>Reading the batch</Caption>
          </div>
        ) : (
          <AnswerBody answer={shown} onCite={onCite} />
        )}
      </div>
    </div>
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
    provenance: `Recorded on ${recordedAt.slice(0, 10)} by ${model}, prompt ${promptVersion}. Replayed here, not regenerated.`,
  };
}

function AnswerBody({
  answer,
  onCite,
}: {
  answer: Answer | null;
  onCite: (recordId: string) => void;
}) {
  if (answer === null) {
    return (
      <Caption as="p" className="leading-relaxed">
        No answer has been recorded for this question yet, and nothing is invented in its place. Run{" "}
        <code className="rounded-sm bg-muted px-1 py-0.5 font-mono">npm run explain</code> to record
        one, or type a question above to ask live.
      </Caption>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* The gate firing is shown, not hidden. "It never cited a record that
          does not exist" is only a checkable claim if a citation that did would
          have been visible. */}
      {answer.verdict !== "ACCEPTED" && (
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="outline" className="border-at-risk/40 bg-at-risk/10 text-at-risk">
            {answer.verdict}
          </Badge>
          <Caption className="text-at-risk">
            {answer.unknown.length > 0
              ? `${answer.unknown.join(", ")} is named here but is not a record in this batch, so it is not linked.`
              : "This answer did not come back in a usable form."}
          </Caption>
        </div>
      )}

      <p className="text-body/relaxed text-foreground">
        {answer.segments.map((segment, index) => (
          <Fragment key={index}>
            {segment.kind === "text" ? (
              segment.text
            ) : (
              <button
                type="button"
                onClick={() => onCite(segment.recordId)}
                className={cn(
                  "cursor-pointer rounded-sm font-mono text-mono text-primary",
                  "underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50",
                )}
              >
                {segment.recordId}
              </button>
            )}
          </Fragment>
        ))}
      </p>

      {/*
        The count stays on the surface and the provenance folds away.

        They used to be one line. The first half is about the answer and is the
        reason to trust it. The second half is about the machinery, and printing
        a model name and a prompt version next to a tax figure reads as though
        the product were prouder of the model than of the answer. Neither is
        deleted: a recorded answer must never read as one produced just now, and
        only the provenance says which this is.
      */}
      <div className="flex flex-col gap-1">
        <Caption>
          {answer.cited.length === 0
            ? "This answer cites no records."
            : `Every claim above is tied to ${answer.cited.length} named record${answer.cited.length === 1 ? "" : "s"}.`}
        </Caption>
        <details className="group/where">
          <summary className="cursor-pointer list-none text-caption text-muted-foreground underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
            Where this answer came from
            <span className="ml-1 inline-block transition-transform group-open/where:rotate-90">
              &rsaquo;
            </span>
          </summary>
          <Caption as="p" className="mt-2">
            {answer.provenance}
          </Caption>
        </details>
      </div>
    </div>
  );
}
