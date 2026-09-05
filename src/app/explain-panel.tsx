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
import { toAnswerBlocks } from "@/lib/explain/layout";
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
  /**
   * Whether this answer was just produced or is being replayed from disk.
   *
   * A flag rather than a sentence carrying a model name and a prompt version,
   * which is what used to sit here. That was machinery talking about itself
   * beside a tax figure, and it is now in the audit trail where it belongs. The
   * one thing on this distinction a reader needs is which of the two they are
   * looking at, because a recorded answer must never read as one written for
   * the question they just typed.
   */
  origin: "live" | "recorded";
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
        origin: "live",
      });
    } catch {
      setError("The answer never arrived. The recorded examples below still work.");
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="flex flex-col gap-4" data-testid="explain-panel">
      {/*
        The field is filled and outlined rather than transparent with a hairline.
        Sitting on the indigo ground its default border measured 1.15:1 against
        the panel behind it, where WCAG asks for 3:1 on the boundary of a
        control, so the one thing on this page a person is meant to type into
        was the hardest thing on it to see. White fill says "this is where you
        write" before any border is read at all.

        Taller, too. At 32px it was the size of a filter box on a toolbar, which
        is the wrong promise for the page's main interaction.
      */}
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
          className="h-11 min-w-[16rem] flex-1 border-primary/85 bg-card px-3.5"
        />
        <Button
          className="h-11 px-5"
          disabled={asking || question.trim().length === 0}
          onClick={() => void ask()}
        >
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
              // The open one is filled in the brand indigo, not tinted. It was
              // `secondary`, a warm grey, sitting on this panel's pale indigo
              // ground: two colours a few percent apart, so the question you
              // were reading was indistinguishable from the five you were not.
              variant={candidate.id === openId ? "default" : "outline"}
              aria-pressed={candidate.id === openId}
              onClick={() => {
                setLive(null);
                setError(null);
                setOpenId(candidate.id);
              }}
              // A button's default is one unbreakable line at a fixed height,
              // which is right for "Ask" and wrong for a whole question. One of
              // these is 389px of text, so on a phone it ran off the side and
              // took the document with it.
              className="h-auto max-w-full shrink px-3 py-2 text-left whitespace-normal"
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

  const { segments, cited, unknown, verdict } = example.recorded;
  return { segments, cited, unknown, verdict, origin: "recorded" };
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

      {/*
        The answer in the shape it was written, rather than flattened into one
        paragraph. See `toAnswerBlocks`: the blank lines and the "1)" markers
        are the model's own, and printing them as a single block was throwing
        away the only structure the answer had. The worst case was the first
        example question, whose eleven citations, five rupee totals and three
        separate findings arrived as one nine-line wall.
      */}
      <div className="flex max-w-[78ch] flex-col gap-3" data-testid="answer-body">
        {toAnswerBlocks(answer.segments).map((block, index) =>
          block.kind === "paragraph" ? (
            <p key={index} className="text-body/relaxed text-foreground">
              <Segments segments={block.segments} onCite={onCite} />
            </p>
          ) : (
            // A real list, so the count is known before any of it is read, and
            // the numbers sit in a gutter of their own rather than inside the
            // first sentence. `start` and each marker come from what the model
            // wrote, so a list that begins at 2 is shown beginning at 2.
            <ol key={index} className="flex flex-col gap-2">
              {block.items.map((item) => (
                <li key={item.marker} className="flex gap-2.5">
                  <span className="w-4 shrink-0 text-body/relaxed font-medium tabular-nums text-muted-foreground">
                    {item.marker}
                  </span>
                  <span className="min-w-0 text-body/relaxed text-foreground">
                    <Segments segments={item.segments} onCite={onCite} />
                  </span>
                </li>
              ))}
            </ol>
          ),
        )}
      </div>

      {/*
        One line under the answer, and it is about the answer.

        This was two: how many records the answer rests on, and a fold-away
        carrying a model name, a prompt version and a note about punctuation.
        The second told the reader nothing they could act on. What survives of
        it is the single fact that matters, which is whether they are reading
        something written for the question they typed or something saved
        earlier, because those two must never look the same.
      */}
      <Caption as="p">
        {answer.cited.length === 0
          ? "This answer names no records."
          : `Every figure above is tied to ${answer.cited.length} named record${answer.cited.length === 1 ? "" : "s"}, and each one opens its row.`}{" "}
        {answer.origin === "live" ? "Answered just now." : "Answered earlier and saved."}
      </Caption>
    </div>
  );
}

/**
 * A run of an answer: its prose, with every cited record drawn as a link back
 * to its row.
 *
 * Pulled out of `AnswerBody` when the answer stopped being one paragraph. A
 * citation is now reachable from inside a list item as well as from a
 * paragraph, and the alternative to one shared renderer is two that drift.
 */
function Segments({
  segments,
  onCite,
}: {
  segments: AnswerSegment[];
  onCite: (recordId: string) => void;
}) {
  return (
    <>
      {segments.map((segment, index) => (
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
    </>
  );
}
