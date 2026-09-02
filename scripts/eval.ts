/**
 * `npm run eval` — score Investigate against ground truth (PRD §15.2).
 *
 * Runs the agent over the exceptions the deterministic matcher flagged, compares
 * each classification against `data/synthetic/expected.json`, and prints the
 * agreement plus every disagreement.
 *
 * It does NOT write to Postgres. `ai_calls` is the audit trail of real
 * reconciliation runs; filling it with eval traffic would make the batch cost
 * report in §15.4 count calls no merchant ever asked for. The rows investigate()
 * returns are read for their token counts and then dropped.
 *
 * Usage:
 *   npm run eval                 # Claude, from ANTHROPIC_API_KEY
 *   npm run eval -- --limit=3    # a cheap smoke test over three records
 *   npm run eval -- --delay=2000 # pace the calls, for a tighter rate limit
 */
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { anthropic } from "@ai-sdk/anthropic";
import { PROMPT_VERSION } from "@/lib/agent/schema";
import { resolveModelChoice } from "@/lib/eval/model";
import { formatEvalReport } from "@/lib/eval/report";
import { runEval } from "@/lib/eval/run";
import { scoreEval, type ExpectedRecord } from "@/lib/eval/score";
import { parseSettlements, parseStatement } from "@/lib/ingestion";
import { matchBatch } from "@/lib/matching";
import { MERCHANT_GSTIN, REVIEW_PERIOD } from "@/lib/review/batch";

/** A FAILED verdict is usually a rate limit, not a model that cannot classify. */
const DEFAULT_RETRIES = 2;

type Flags = {
  provider?: string;
  model?: string;
  limit?: number;
  delay?: number;
  retries?: number;
  "write-traces"?: boolean;
};

/** Where the screen reads the agent's reasoning from (PRD §15.1). */
const TRACE_PATH = "data/synthetic/investigations.json";

function parseFlags(argv: readonly string[]): Flags {
  const flags: Flags = {};
  for (const arg of argv) {
    if (arg === "--write-traces") {
      flags["write-traces"] = true;
      continue;
    }

    const match = /^--([a-z]+)=(.*)$/.exec(arg);
    if (!match) throw new Error(`eval: unrecognised argument "${arg}". Expected --name=value.`);
    const [, name, value] = match;

    switch (name) {
      case "provider":
      case "model":
        flags[name] = value;
        break;
      case "limit":
      case "delay":
      case "retries":
        flags[name] = asCount(name, value);
        break;
      default:
        throw new Error(`eval: unknown flag "--${name}".`);
    }
  }
  return flags;
}

function asCount(name: string, value: string): number {
  const parsed = Number(value);
  // Rejected rather than coerced: `--limit=abc` becoming NaN would silently
  // score zero records and print a report that looks like a finished run.
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`eval: --${name} needs a whole number, got "${value}".`);
  }
  return parsed;
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));

  // Checked BEFORE the model is called, not after the run has paid for itself.
  // Only a complete run may overwrite the traces the screen renders: a --limit
  // run would replace sixteen records' reasoning with three, and the panel
  // would then say "no agent run yet" for rows that in fact have one.
  if (flags["write-traces"] && flags.limit !== undefined) {
    throw new Error("eval: --write-traces needs a full run; drop --limit.");
  }

  const choice = resolveModelChoice(flags, process.env);

  const settlements = parseSettlements(
    JSON.parse(readFileSync("data/synthetic/settlements.json", "utf8")),
  );
  const statement = parseStatement(
    JSON.parse(readFileSync("data/synthetic/gstr2b-072026.json", "utf8")),
  );
  const truth = JSON.parse(readFileSync("data/synthetic/expected.json", "utf8")) as {
    records: ExpectedRecord[];
  };

  // The rows the agent is asked about come from the matcher, not from the answer
  // key — that is what the product does, and reading the set to investigate out
  // of `expected.json` would let the harness mark its own paper.
  const result = matchBatch({ settlements, statement, period: REVIEW_PERIOD, mode: "exact+fuzzy" });
  const byId = new Map(settlements.map((item) => [item.entity_id, item]));

  let queue = result.records
    .filter((record) => record.status === "EXCEPTION")
    .map((record) => {
      const item = byId.get(record.recordId);
      if (!item) throw new Error(`eval: classified record ${record.recordId} has no settlement row`);
      return { recordId: record.recordId, item };
    });
  if (flags.limit !== undefined) queue = queue.slice(0, flags.limit);

  const delayMs = flags.delay ?? 0;
  const retries = flags.retries ?? DEFAULT_RETRIES;

  console.error(
    `Investigating ${queue.length} exceptions on ${choice.modelId} ` +
      `(${delayMs}ms between calls, ${retries} retries on failure)…`,
  );

  const run = await runEval({
    model: anthropic(choice.modelId),
    queue,
    batch: settlements,
    claimedPeriod: REVIEW_PERIOD,
    batchId: randomUUID(),
    delayMs,
    retries,
  });

  // Scored against every exception in the ground truth, even when --limit ran
  // fewer: an unanswered record counts as a disagreement, so a partial run
  // reports a partial score rather than a flattering one.
  const score = scoreEval(truth.records, run.answers);

  console.log("");
  console.log(formatEvalReport(score, { promptVersion: PROMPT_VERSION, modelId: choice.modelId }));
  console.log("");
  console.log(
    `${run.inputTokens.toLocaleString("en-IN")} input · ${run.outputTokens.toLocaleString("en-IN")} output tokens` +
      (run.retried > 0 ? ` · ${run.retried} retries` : ""),
  );
  console.log(
    `Merchant ${MERCHANT_GSTIN} · period ${REVIEW_PERIOD} · this run wrote nothing to the database.`,
  );

  if (flags["write-traces"]) {
    writeFileSync(TRACE_PATH, `${JSON.stringify(run.traces, null, 2)}\n`);
    console.log(`Wrote ${run.traces.length} traces to ${TRACE_PATH} for the review screen.`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
