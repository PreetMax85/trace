/**
 * `npm run explain` — record the example answers the review screen shows.
 *
 * Asks Claude every question in `EXAMPLE_QUESTIONS` about the finished July
 * batch and writes the answers to `data/synthetic/explanations.json`, which the
 * screen renders. Committing them is what lets the Explain panel work with no
 * API key and no network, the same way `investigations.json` carries the §15.1
 * reasoning trace.
 *
 * It does NOT write to Postgres. `ai_calls` is the audit trail of real
 * reconciliation runs, and a baking run is not one.
 *
 * Usage:
 *   npm run explain                 # record every answer and write the file
 *   npm run explain -- --dry        # print the answers, write nothing
 *   npm run explain -- --delay=2000 # pace the calls, for a tighter rate limit
 */
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { anthropic } from "@ai-sdk/anthropic";
import { bakeAnswers, isCompleteBake } from "@/lib/explain/bake";
import { EXAMPLE_QUESTIONS } from "@/lib/explain/library";
import { resolveModelChoice } from "@/lib/eval/model";
import { loadReviewBatch } from "@/lib/review/batch";

/** Where the screen reads the recorded answers from. */
const ANSWERS_PATH = "data/synthetic/explanations.json";

type Flags = { provider?: string; model?: string; delay?: number; dry?: boolean };

function parseFlags(argv: readonly string[]): Flags {
  const flags: Flags = {};
  for (const arg of argv) {
    if (arg === "--dry") {
      flags.dry = true;
      continue;
    }

    const match = /^--([a-z]+)=(.*)$/.exec(arg);
    if (!match) throw new Error(`explain: unrecognised argument "${arg}". Expected --name=value.`);
    const [, name, value] = match;

    switch (name) {
      case "provider":
      case "model":
        flags[name] = value;
        break;
      case "delay": {
        const parsed = Number(value);
        // Rejected rather than coerced: NaN would silently mean no pacing at
        // all, on the run where pacing was asked for.
        if (!Number.isSafeInteger(parsed) || parsed < 0) {
          throw new Error(`explain: --delay needs a whole number, got "${value}".`);
        }
        flags.delay = parsed;
        break;
      }
      default:
        throw new Error(`explain: unknown flag "--${name}".`);
    }
  }
  return flags;
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const choice = resolveModelChoice(flags, process.env, "explain");
  const batch = loadReviewBatch();

  console.error(
    `Answering ${EXAMPLE_QUESTIONS.length} questions about ${batch.header.period} ` +
      `on ${choice.modelId}…`,
  );

  const bake = await bakeAnswers({
    model: anthropic(choice.modelId),
    batch,
    questions: EXAMPLE_QUESTIONS,
    batchId: randomUUID(),
    delayMs: flags.delay ?? 0,
  });

  console.log("");
  for (const answer of bake.answers) {
    console.log(`Q  ${answer.question}`);
    console.log(`A  ${answer.answer ?? "(no answer)"}`);
    console.log(
      `   ${answer.verdict} · cites ${answer.cited.length}` +
        (answer.unknown.length > 0 ? ` · INVENTED ${answer.unknown.join(", ")}` : ""),
    );
    console.log("");
  }

  const dollars = (bake.costMicroUsd / 1_000_000).toFixed(4);
  console.log(
    `${bake.inputTokens.toLocaleString("en-IN")} input · ` +
      `${bake.outputTokens.toLocaleString("en-IN")} output tokens` +
      (choice.costIsMeaningful ? ` · $${dollars}` : " · cost unknown for this model"),
  );

  if (flags.dry) {
    console.log("Dry run — nothing written.");
    return;
  }

  // A run cut short by a rate limit must not replace good answers with "the
  // agent failed" under a real question. Checked before the write, not after.
  if (!isCompleteBake(bake.answers)) {
    const failed = bake.answers.filter((answer) => answer.verdict === "FAILED");
    throw new Error(
      `explain: ${failed.length} of ${bake.answers.length} questions produced no answer, ` +
        `so ${ANSWERS_PATH} was left alone. Re-run, with --delay if this was a rate limit.`,
    );
  }

  writeFileSync(ANSWERS_PATH, `${JSON.stringify(bake.answers, null, 2)}\n`);
  console.log(`Wrote ${bake.answers.length} answers to ${ANSWERS_PATH} for the review screen.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
