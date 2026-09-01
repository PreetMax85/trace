# Trace — handoff: build the screen

Written 1 Sep 2026, evening. The previous handoff (review the ingestion branch) is spent — that
work is done. This file replaces it entirely.

## Read this first

`CLAUDE.md` and the pinned memories load automatically. **Do not re-derive them.** This file only
carries what they don't.

- `docs/PRD.md` — the spec. Read **§9 (architecture)** before writing any code, because it changed
  today. Read **§7 (exception taxonomy)** and **§8 (output)** when you need them. Don't read all of it.
- `docs/BUILD-LOG.md` — 19 entries, each a thing that was wrong while its own tests passed. Entries
  **18, 19** are the newest and cover the ingestion layer.
- `docs/VIDEO.md` — story and raw notes for the 5-minute demo. Untracked, local only.

## Deadline

Applications close **5 September 2026**. Razorpay publishes no closing *time* or timezone — the
date comes from a recruiter's post, not the site. So **treat end of 4 September as the deadline**
and don't spend the 5th. That leaves 2, 3 and 4 September.

## State of the tree

**Check `git log -3` before trusting anything in this section** — it is the part that goes stale
first.

As written, `main` carried the merged ingestion layer plus `c6089c6`, which installed Blade, the
Vercel AI SDK, Zod and Playwright's Chromium, and tracked `.claude/settings.json` (the guard for
BUILD-LOG 20). **104 tests pass, typecheck and lint clean, green under three timezones.**

Everything the queue needs is installed and committed, so a scheduled run never has to install
anything. `.npmrc` sets `legacy-peer-deps=true`, which Blade requires — its peer list contradicts
itself on every React version, and BUILD-LOG 21 records why.

**Preet runs every `git` write himself.** Draft them, never attempt them. `git commit`, `git push`,
`git reset`, `git checkout`, `git clean` and `rm` are denied in `.claude/settings.local.json`.

## Where the project stands

**Built and merged on `main` — all of it:**

- **Schema + migration** — `src/lib/audit/schema.ts`, `drizzle/0000_peaceful_winter_soldier.sql`.
  Three tables: `batches`, `records`, `actions`. All money is **integer paise**, never floats.
- **Fixture** — `data/synthetic/`: `settlements.json` (54 payments + 4 refund rows),
  `gstr2b-072026.json`, `gstr2b-082026.json`, `expected.json`.
- **Matcher** — `src/lib/matching/`. `matchBatch()` takes parsed settlement rows plus a parsed
  GSTR-2B statement and returns classified records, a period rollup and GSTN's ITC verdict.

- **Ingestion** — `src/lib/ingestion/`: `parseSettlements`, `parseStatement`, `guards.ts`.
- **Row mapping** — `src/lib/audit/rows.ts`: pure `BatchResult` → Drizzle rows.

**Not built at all:** any UI, the three agent layers, deploy, the video.

## Decisions made 1 Sep — these are settled, don't relitigate

- **Inngest is cut.** Durable execution earns its cost on long, expensive or fan-out steps. Detect
  is 54 records through pure functions in under 3 seconds and a re-run is byte-identical, so there
  is nothing to resume. The pipeline is plain async functions; run state lives in the `batches` row.
  The human-in-the-loop pause it was chosen for is `actions.confirmed_at` — a nullable column plus a
  Confirm button, which is also the only version of that gate a demo can show on screen.
- **Langfuse is cut.** `langfuse-vercel` is deprecated in its own README and the current SDK drops
  spans on Vercel unless flushed explicitly — a *silent* failure. Replaced by an `ai_calls` table in
  the same Postgres: for an audit product the trace **is** the audit trail. Stretch goal only.
- **Sentry stays cut.** No production traffic to monitor.
- **The AI is three agents, and the permission boundary is the story.** Investigate (may classify,
  may not write) → Explain (read-only) → Act (drafts only, cannot send). Most multi-agent demos
  cannot say what each agent is *forbidden* to do. Trace can, and it maps onto Razorpay's own bar
  language that PRD §2 already quotes: bounded, explainable, gated.
- **No LLM in the matching, ever.** A wrong ITC claim is not a bug, it is 18% annual interest under
  Section 50 of the CGST Act. The deterministic core is the product's credibility, not a gap in it.

## The work queue and its status

`docs/NEXT-TASK.md` is the **routine briefing** — the queue, the preflight, the banned commands and
the per-slice loop. It is written for an unattended run and is the same for every run. Read it if
you are a scheduled run. If you are an interactive session, read it anyway: the slice definitions
and acceptance criteria are there and are not duplicated here.

**Run log.** Scheduled run started 22:31 UTC, 1 Sep 2026 (04:00 IST slot). Preflight steps 1-3 clean:
`npm ci` restored the lockfile, 104 tests pass, typecheck and lint are both silent. The 19:02 UTC run
had already claimed slice 1 on `fix/matcher-edge-cases` and pushed no code beyond the claim, so this
run skipped it as the briefing requires and took slice 2.

**Status board — every run updates this before it stops.**

| # | Slice | Branch | Status |
|---|---|---|---|
| 1 | Backlog findings 3-8 | `fix/matcher-edge-cases` | in progress (claimed 19:02 UTC 1 Sep by the earlier run) |
| 2 | The screen | `feat/exception-review-screen` | in progress (`feat/exception-review-screen`, started 22:35 UTC 1 Sep) |
| 3 | `ai_calls` + Investigate + policy gate | `feat/investigate-agent` | not started |
| 4 | `npm run eval` harness | `feat/investigate-agent` | not started |
| 5 | §15.1 reasoning trace, §15.5 citations | — | **blocked until 2 and 3 are reviewed** |

Slices 3 and 4 build against the AI SDK's **mock model**. There is no `ANTHROPIC_API_KEY` in the
repo or in a sandbox, by design — Preet is loading $5 of credit separately, and the eval runs for
real only once he has. Do not call the live API and do not ask for a key.

## Database

**Live. Neon, provisioned 1 Sep.** `DATABASE_URL` is in `.env`, `npm run db:migrate` applied the
migration successfully, and `npm run db:studio` opens against it. Don't re-provision; if a
connection fails, check `.env` first.

- `batches`, `records` and `actions` exist in the database. Any further schema change is a new
  migration via `npm run db:generate` then `npm run db:migrate` — **never** `db:push`, which
  bypasses the migration history that is already committed.
- The driver is `postgres-js` (`src/lib/audit/client.ts`), which speaks to any Postgres over a
  `postgresql://` URL. Nothing in the code is provider-specific, so Neon and Supabase are
  interchangeable and switching later costs one environment variable.
- **Two connection strings, and they are not interchangeable.** Migrations need the *direct*
  (unpooled) URL; the app on Vercel needs the *pooled* one, or serverless invocations exhaust the
  connection limit. `.env.example` says so at the top.
- **`ai_calls` does not exist yet.** PRD §15.4 requires it. Adding it is a new Drizzle migration:
  batch id, record id, model, prompt version, input/output tokens, latency, computed cost, and the
  verdict the policy gate returned. Generate it with `npm run db:generate`, don't hand-write SQL.
- Deploy needs `DATABASE_URL` and `ANTHROPIC_API_KEY` set in Vercel's project settings too. Local
  `.env` does not travel.
- `ANTHROPIC_API_KEY` is **not set yet**. $5 of credit, with the console spending limit set to $5 so
  overrun is impossible. PRD §9's cost section explains why $5 is enough: structured output, prompt
  caching, `effort: "low"` and the Batch API take a full 54-record eval from ~$1.40 to ~$0.31.

## Numbers that must never move

| | paise | rupees |
|---|---|---|
| July GSTR-2B invoice taxable value | 664945 | ₹6,649.45 |
| July GSTR-2B invoice tax | 119692 | ₹1,196.92 |
| Rollup of matched records | 85587 | ₹855.87 |
| Rollup delta | 34105 | ₹341.05 |
| **ITC claimable** (as of the fix above) | **98223** | ₹982.23 |
| **ITC at risk** (as of the fix above) | **21469** | ₹214.69 |
| August GSTR-2B invoice tax | 19530 | ₹195.30 |

Breakdown: 30 `EXACT` / 8 `FUZZY` / 5 `TIMING` / 4 `REFUND_NETTED` / 4 `FEE_DEDUCTION` /
3 `PARTIAL_PAYMENT` / 0 `UNEXPLAINED` = 54.

At risk is now **exactly the four unexplained fee deductions** (21469). The refund half of the old
delta (12636) moved to claimable, because Razorpay keeps its MDR on a refunded payment.

**For the video, one number is easy to say wrong:** the delta covers **11 flagged rows billed in
July** (4 refunds, 4 unexplained fees, 3 failed retries), of which **8 carry tax**. The three
retries are zero-value. Say "eleven transactions" or "eight of them carrying tax" — never "six".

## Settled — do not reopen

- Two-tier rate-cell matching. There is **no per-transaction invoice number** to join on; GSTR-2B
  carries one consolidated Razorpay invoice line per filing period.
- **Five exception categories, locked.** `itcavl` is a batch-level *flag* (`ITC_INELIGIBLE`), not a
  sixth category.
- A netted refund triggers a **Section 34 credit note**, not an ITC reversal. Razorpay does not
  return its MDR on a refunded transaction, so that GST stays claimable.
- The GSTR-2B schema in the fixture is real and verified against GSTN. **It is not GSTR-2A.**
  `flprdr1`, `fldtr1` and `itm_det` are 2A-only and are rejected document-wide. `iamt`, `camt` and
  `samt` are rejected **only inside a b2b line item** — real 2B uses them elsewhere (IMPG carries
  `iamt` against a bill of entry). BUILD-LOG 19.
- `match_method` **is** the confidence tier. There is no `confidence` column and there won't be.
- A batch is **one filing period**, not a date range.
- `REFUND_NETTED` joins on `payment_id`, never `settlement_id`.
- The ₹1 tolerance is exactly **100 paise**, compared as integers.
- Filing-period boundaries use **IST as a fixed +05:30 offset**. India has had no DST since 1945.
- **Ambiguity is a property of the fee, not the amount.** Count the cells that resolve within
  tolerance and treat more than one as ambiguous — never test the amount against a floor. PRD §6,
  BUILD-LOG 10.
- Dataset counts are locked (PRD §13). Don't regenerate.

## Owed

**Nothing, if the doc commit has landed.** BUILD-LOG entries **20** (the Context7 permission
incident that stalled the overnight run for eleven hours) and **21** (the Inngest and Langfuse
cuts) are written. Entry 20's guard is that `.claude/settings.json` becomes **tracked**, so the
Context7 grant travels with the clone into any cloud sandbox — that file must be in the same
commit or the entry is not finished. `.claude/settings.local.json` is gitignored and stays that way.

`docs/VIDEO.md` should be added to `.gitignore` alongside `PLAN.md`, `PITCH.md`, `BRIEF.md` and
`HANDOFF.md` — it is a local working doc, not part of the shipped repo.

## Backlog — real bugs, found in review, deliberately deferred

None of these block the screen. Fix them when the screen is standing, cheapest first.

3. **`settled_at` accepts milliseconds.** A single row with a millisecond timestamp silently yields
   37 matched and a delta of 34645 instead of 38 / 34105. Needs a range guard.
4. **A second supplier in `docdata.b2b` is summed into "the Razorpay invoice."** One extra vendor
   turns invoice tax 119692 into 1919692. `invoiceTotals` needs a supplier-CTIN filter. This is in
   the already-merged matcher, not the branch.
5. Statement money given in paise instead of rupees inflates the invoice 100× unguarded.
6. `toBatchRow` accepts a `meta.period` that contradicts the statement, and an empty `merchantGstin`.
7. An envelope with no `count` accepts truncation silently, despite a comment claiming otherwise.
8. `matchedExact + matchedFuzzy + exceptions` can fall short of `totalRecords` with no runtime invariant.

## Making the AI legible — now PRD §15, committed scope

The five ideas that were floating on 1 Sep are **decided and written into `docs/PRD.md` §15**, each
with a "done when" line. Read that section; don't re-derive it from here. In short: Investigate
renders its tool calls and reasoning in the UI (15.1); the agent is scored against
`expected.json` for a real accuracy number (15.2); categories are constrained by a Zod enum at
generation *and* by the policy gate behind it (15.3); the batch reports its own token count and
rupee cost from `ai_calls` (15.4); Explain cites the records it used, as links (15.5).

Build them **alongside** each layer, not as a cleanup pass at the end — 15.1 and 15.4 are nearly
free while you are writing the Investigate call site, and expensive to retrofit afterwards.

§15 also records what is deliberately *not* being added — no vector DB, no agent framework, no
second model provider. Don't rediscover those.

## Loose ends

- The fixture generator is at `/tmp/trace-fixture-gen.mjs`, outside the repo, and `/tmp` may have
  been cleared. Worth committing as `scripts/generate-fixture.mjs` if it survives — anyone asking
  "is this data reproducible?" should be able to see that it is.
- `docs/NEXT-TASK.md` was rewritten on 1 Sep and is **live** — it is the routine briefing for the
  slice queue, written to stay true across runs. Don't edit it per-run; update the status board in
  this file instead.
- Two one-shot cloud routines from 30 Aug fired and are disabled (`trig_01LpejejykaVudvGaYGx9aDa`
  build, `trig_016RmmwsLJb1v8BYh11rbGSR` review). Any routine must list the Context7 **and Blade**
  MCP tools in its `allowed_tools`; the 30 Aug one did not, which is what caused the eleven-hour
  stall in BUILD-LOG 20.
- The Blade MCP refuses to serve any docs until `create_blade_cursor_rules` has been called once.
  It has been, and `.cursor/rules/frontend-blade-rules.mdc` is committed — so a fresh clone is
  fine. Don't delete that file.
- `CONTEXT7_API_KEY` is set locally but almost certainly **not** in a cloud sandbox, so Context7 runs
  keyless and IP-rate-limited there. If lookups throttle, say so rather than guessing at an API.
- Preet is not fluent in GST. Gloss every tax term in one or two sentences as it comes up, and say
  what was left out. Both are pinned memories that load automatically; repeated here because they
  matter more than anything else in this file.
