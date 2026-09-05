/**
 * `npm run act` — record the actions the review screen offers for confirmation.
 *
 * Drafts the CA email, the GSTR-3B flag and the Tally entry for every flagged
 * record in the July batch and writes them to `data/synthetic/drafts.json`,
 * which the screen renders. Committing them is what lets the action cards work
 * with no API key and no network, the same way `investigations.json` carries
 * the §15.1 reasoning trace and `explanations.json` the §15.5 answers.
 *
 * Unlike Explain, Act has NO live counterpart, and that is deliberate. A
 * question nobody anticipated cannot be pre-baked, so Explain needs one; the
 * set of actions is closed — one record, three drafts — so recording them all
 * IS complete coverage. More to the point, a draft is a document a person
 * confirms, and the text they read, the text they approve and the text stored
 * in `actions.draft` have to be the same bytes. Regenerating on view would make
 * the same record produce a different email every time it was opened.
 *
 * It does NOT write to Postgres. `ai_calls` is the audit trail of real
 * reconciliation runs, and a baking run is not one.
 *
 * Usage:
 *   npm run act                 # draft for every flagged record, write the file
 *   npm run act -- --dry        # print the drafts, write nothing
 *   npm run act -- --delay=2000 # pace the calls, for a tighter rate limit
 */
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { anthropic } from "@ai-sdk/anthropic";
import { bakeDrafts, isCompleteDraftBake } from "@/lib/act/bake";
import { resolveModelChoice } from "@/lib/eval/model";
import { actContext, loadReviewBatch, toActRecord } from "@/lib/review/batch";

/** Where the screen reads the recorded drafts from. */
const DRAFTS_PATH = "data/synthetic/drafts.json";

/**
 * A FAILED verdict is a call that produced nothing, not a draft the gate
 * refused. Every real run lost one or two records to one — a different record
 * each time, and pacing did not help. `runEval` has retried for this
 * from the start.
 */
const DEFAULT_RETRIES = 2;

type Flags = {
  provider?: string;
  model?: string;
  delay?: number;
  retries?: number;
  dry?: boolean;
};

function parseFlags(argv: readonly string[]): Flags {
  const flags: Flags = {};
  for (const arg of argv) {
    if (arg === "--dry") {
      flags.dry = true;
      continue;
    }

    const match = /^--([a-z]+)=(.*)$/.exec(arg);
    if (!match) throw new Error(`act: unrecognised argument "${arg}". Expected --name=value.`);
    const [, name, value] = match;

    switch (name) {
      case "provider":
      case "model":
        flags[name] = value;
        break;
      case "delay":
      case "retries": {
        const parsed = Number(value);
        // Rejected rather than coerced: NaN would silently mean no pacing at
        // all, on the run where pacing was asked for.
        if (!Number.isSafeInteger(parsed) || parsed < 0) {
          throw new Error(`act: --${name} needs a whole number, got "${value}".`);
        }
        flags[name] = parsed;
        break;
      }
      default:
        throw new Error(`act: unknown flag "--${name}".`);
    }
  }
  return flags;
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const choice = resolveModelChoice(flags, process.env, "act");
  const batch = loadReviewBatch();

  // The flagged rows only. Drafting an action for a record that matched cleanly
  // would put a "next step" under a row whose next step is nothing.
  const records = batch.rows
    .filter((row) => row.status === "EXCEPTION")
    .map(toActRecord);

  if (records.length === 0) {
    throw new Error(`act: ${batch.header.period} has no flagged records to draft for.`);
  }

  console.error(
    `Drafting three actions for ${records.length} flagged records in ` +
      `${batch.header.period} on ${choice.modelId}…`,
  );

  const bake = await bakeDrafts({
    model: anthropic(choice.modelId),
    records,
    context: actContext(batch.header),
    batchId: randomUUID(),
    delayMs: flags.delay ?? 0,
    retries: flags.retries ?? DEFAULT_RETRIES,
  });

  console.log("");
  for (const entry of bake.drafts) {
    console.log(`${entry.recordId}  ${entry.verdict}`);
    if (entry.draft) {
      console.log(`  email   ${entry.draft.caEmail.subject}`);
      console.log(
        `  gstr-3b ${entry.draft.gstr3bFlag.action}${
          entry.draft.gstr3bFlag.line === null ? "" : ` on ${entry.draft.gstr3bFlag.line}`
        }`,
      );
      console.log(
        `  tally   ${entry.draft.tallyEntry.voucherType}, ` +
          `${entry.draft.tallyEntry.lines.length} lines` +
          (entry.unbalanced ? " — DOES NOT BALANCE" : "") +
          (entry.misfiled ? " — ROW AND ACTION DISAGREE" : "") +
          (entry.misrouted ? " — WRONG ROW FOR THIS CATEGORY" : ""),
      );
    }
    if (entry.unresolved.length > 0) {
      console.log(
        `  FIGURES NOT ON THIS RECORD: ${entry.unresolved.map((f) => f.text).join(", ")}`,
      );
    }
    console.log("");
  }

  const dollars = (bake.costMicroUsd / 1_000_000).toFixed(4);
  console.log(
    `${bake.inputTokens.toLocaleString("en-IN")} input · ` +
      `${bake.outputTokens.toLocaleString("en-IN")} output tokens` +
      (choice.costIsMeaningful ? ` · $${dollars}` : " · cost unknown for this model") +
      (bake.retried > 0 ? ` · ${bake.retried} retries` : ""),
  );

  if (flags.dry) {
    console.log("Dry run — nothing written.");
    return;
  }

  // A run cut short by a rate limit must not replace good drafts with "the
  // agent failed" under a real exception. Checked before the write, not after.
  if (!isCompleteDraftBake(bake.drafts)) {
    const failed = bake.drafts.filter((entry) => entry.verdict === "FAILED");
    throw new Error(
      `act: ${failed.length} of ${bake.drafts.length} records produced no draft, ` +
        `so ${DRAFTS_PATH} was left alone. Re-run, with --delay if this was a rate limit.`,
    );
  }

  writeFileSync(DRAFTS_PATH, `${JSON.stringify(bake.drafts, null, 2)}\n`);
  console.log(`Wrote ${bake.drafts.length} drafts to ${DRAFTS_PATH} for the review screen.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
