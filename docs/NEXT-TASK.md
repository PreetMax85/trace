# Next task — briefing for a fresh session

You are picking this up cold, probably as a scheduled run. Read this fully before writing code.

## Orientation

1. `CLAUDE.md` — commands, non-negotiable rules, locked scope. Already loaded for you.
2. `docs/PRD.md` — **§5 (data sources), §6 (matching engine), §7 (exception taxonomy)**. Don't
   read the whole thing.
3. `docs/BUILD-LOG.md` — 15 entries, each one a mistake already made and paid for. Entries
   **9, 12, 13, 14, 15** are about the code you are extending. Reading them is cheaper than
   rediscovering them.

## What already exists

`src/lib/matching/` is complete and committed (`2635ed2`). `matchBatch()` takes parsed
settlement rows plus a parsed GSTR-2B statement and returns classified records, a period rollup
and GSTN's ITC verdict. 52 tests pass; `npm test`, `npm run typecheck`, `npm run lint` are all
clean, and the suite passes under any host timezone.

It reproduces these, and they are locked — if your change moves any of them, your change is
wrong:

| | |
|---|---|
| matched, both rate cells | **38 / 54** (70.4%) |
| matched, standard rate only | **30 / 54** (55.6%) |
| July invoice tax / matched rollup / delta | **119692 / 85587 / 34105** paise |
| August invoice tax / rollup / delta | **19530 / 19530 / 0** paise |

**Nothing else is built** — no ingestion, no database writes, no pipeline, no AI layers, no UI.

## Task 1 — the ingestion layer

Build `src/lib/ingestion/`: turn raw JSON into exactly what `matchBatch` already accepts.

- Two entry points: `parseSettlements(raw)` → `ReconItem[]`, and `parseStatement(raw)` →
  `Gstr2bStatement`.
- **Import both types from `src/lib/matching/types.ts`. Do not redefine or widen them.**
- Validation fails **loudly**, with a `throw` naming the offending field — same style as the
  duplicate-record and wrong-period guards already in `matchBatch`. Silently coercing bad input
  into a plausible number is the failure mode this whole project is built against.

Validate at minimum:

- **The statement is GSTR-2B, not GSTR-2A.** Reject if `flprdr1`, `fldtr1`, `itm_det`, `camt`,
  `samt` or `iamt` appear anywhere, and reject if `docdata.b2b` is missing. This substitution
  cost two days once — see build-log entry 1.
- `rtnprd` present and shaped `MMYYYY`.
- `itcavl` is exactly `"Y"` or `"N"`.
- Recon money fields (`amount`, `fee`, `tax`, `debit`, `credit`) are **integers**. They are
  paise. A float here means somebody converted to rupees upstream — reject it.
- Statement money fields (`txval`, `cgst`, `sgst`, `igst`) are rupees and may be fractional.
  This asymmetry is real, not a bug; the matcher converts them once.
- Rows with `type: "refund"` carry a non-null `payment_id`; rows with `type: "payment"` have it
  null. Any other `type` is rejected.

**Acceptance:** an end-to-end test that reads `data/synthetic/settlements.json` and
`data/synthetic/gstr2b-072026.json` from disk as raw text, parses them, feeds `matchBatch`, and
reproduces **38 matched and a delta of 34105**. Plus hand-built tests for each rejection — the
fixture is well-formed by construction and can only ever prove that good input works. Build-log
entries 14 and 15 are that lesson, learned twice.

## Task 2 — only if Task 1 is finished and green

Build `src/lib/audit/rows.ts`: **pure functions**, no database connection, no `drizzle-kit`, no
migrations.

- `toBatchRow(result, meta)` → an object assignable to `typeof batches.$inferInsert`.
- `toRecordRows(result, batchId)` → objects assignable to `typeof records.$inferInsert`.
- Use Drizzle's inferred insert types so a schema change breaks the build rather than the demo.
- The rollup and the `itcavl` verdict go on the **batch row only**. Nothing per-record.
  `tests/schema.test.ts` enforces this — do not weaken that test to make your code fit.
- Derive `matchedExact` / `matchedFuzzy` / `exceptions` and assert them as **30 / 8 / 16**.
- For `itcClaimablePaise` / `itcAtRiskPaise`, use this and **state it explicitly in the PR** as an
  assumption rather than burying it: when `itc.available` is true, claimable is the matched
  rollup and at-risk is the delta; when it is false, GSTN has blocked the whole invoice, so
  at-risk is the full invoice tax and claimable is zero.

## Task 3 — only if 1 and 2 are both finished and green

**Research, not code.** Do not start a fourth build task; a half-finished feature in an
unreviewed PR is worse than an idle hour.

`docs/PRD.md` §9 describes the stack — Inngest for durable pipeline execution, Langfuse for
tracing, the Vercel AI SDK for the agent layers. **Those claims have never been verified**, and
the project's first rule is never to code against a remembered API. Verify them now, before
anyone writes code against them:

- Pull current documentation for each. **If you are running as a scheduled cloud agent the
  Context7 MCP server is not available to you** — it is configured locally in Claude Code and
  routines cannot reach it. Use `WebSearch` / `WebFetch` against first-party sources instead
  (official docs, vendor changelogs, GitHub releases), and say in your findings which tool you
  used, so a later session knows how the claim was checked.
- For each: does it still work the way §9 assumes? Is the API shape §9 implies real? Are there
  version constraints against Next.js 16 / React 19? Is the free tier enough for a demo?
- Write findings to `docs/STACK-CHECK.md` — one section per library, each claim marked
  **verified**, **wrong**, or **could not confirm**, with the source URL. Say plainly where a
  lookup failed rather than filling the gap from memory.
- If something in §9 is wrong, **say so in that file and in the PR. Do not edit `docs/PRD.md`.**

This is a genuinely useful hour and it cannot break anything.

## How to work

- **Branch.** `git checkout -b agent/ingestion-layer`. Never commit to `main`, never merge, never
  force-push. Open a PR and stop.
- **Test first, one behaviour at a time.** Write the failing test, watch it fail for the right
  reason, then write the smallest code that passes it.
- **Before claiming anything is done:** `npm test`, `npm run typecheck`, `npm run lint` all clean,
  and the suite green under `TZ=Asia/Kolkata` and `TZ=America/Los_Angeles` as well. This machine's
  clock is UTC, which hides an entire class of timezone bug — build-log entry 13.
- **Attack your own work before reporting it.** Break the implementation on purpose and check a
  test notices. Report what survived, including "nothing". A green suite you wrote yourself is
  weak evidence: eleven of the fifteen build-log entries were code that was wrong while its own
  tests passed.
- **Append a `docs/BUILD-LOG.md` entry** for anything that broke while tests were green, using
  the five fields at the top of that file. An entry without a guard against recurrence is not
  finished.
- **If you get blocked, stop and say so in the PR.** Do not improvise around a missing decision.

## Do not

- Regenerate or edit `data/synthetic/*` — the counts are locked (PRD §13), and `expected.json` is
  the assertion table everything is checked against.
- Add a sixth exception category, or a `confidence` column. Both are settled.
- Change `matchBatch`'s behaviour or its numbers.
- Put an LLM call anywhere in the matching or ingestion path. The Detect layer is deterministic
  by design, permanently.
- Edit `docs/PRD.md`. If the spec looks wrong, say so in the PR — it has been wrong before, and
  that is a conversation, not a commit.
