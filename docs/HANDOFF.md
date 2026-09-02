# Trace — handoff: the eval harness is built; the AI now needs a key to be visible

Written 2 Sep 2026, evening. **Slices 1, 2, 3 and 4 are done, plus PRD §15.1.** Slices 1–3 are on
`main`; slice 4 and §15.1 are on **`feat/eval-harness`**, ready to merge.

The tree is green: **258 tests, typecheck, lint, `npm run build` and `npm run verify:screen`**.

What remains is the **Explain layer, the Act layer, deploy and the video** — and every one of them
needs an Anthropic API key to be *demonstrable*, which is the single most important thing on this
page. See "The key is now a prerequisite" below.

## Read this first

`CLAUDE.md` and the pinned memories load automatically. **Do not re-derive them.** This file only
carries what they don't.

- `docs/PRD.md` — the spec. Read **§9 (architecture)** and **§15 (making the AI legible)** before
  writing agent code. Read **§7 (exception taxonomy)** when you need it. Don't read all of it.
- `docs/BUILD-LOG.md` — 29 entries, each a thing that was wrong while its own tests passed. **Next
  free number is 30.** Read **29** before touching anything model-provider-shaped, **28** before
  touching the table, **27** for how a passing test can be aimed at the wrong thing.
- `docs/NEXT-TASK.md` — the routine briefing: preflight, banned commands, the per-slice loop.

## Deadline

Applications close **5 September 2026**. Razorpay publishes no closing *time* or timezone, so treat
**end of 4 September** as the deadline. That leaves 3 and 4 September.

## The key is now a prerequisite, not a nicety

`ANTHROPIC_API_KEY` is **not set**. Preet is loading $5 with the console spending limit set to $5
on **3 Sep**. Until then: mock model only.

An earlier version of this file implied the demo works without it. That was misleading, and the
correction matters for scheduling:

| Layer | Built? | When the key is needed |
|---|---|---|
| **Detect / matcher** | yes | never — deterministic by design, no LLM, ever |
| **Investigate** (+ §15.1 trace) | yes | **once**, to generate `data/synthetic/investigations.json`. Static afterwards. |
| **Explain** (+ §15.5 citations) | no | **at runtime** — free-text questions cannot be pre-baked |
| **Act** (drafts) | no | at runtime, *unless* drafts for the 16 known exceptions are pre-generated and committed the way Investigate's traces are |

So the deployed page renders today with no key — and shows **no AI at all**, because the two
interactive layers do not exist yet and the trace panel falls back to the deterministic
explanation. That is unfinished work, not a feature.

**One decision is deferred to the Explain slice:** whether Explain answers live (needs a runtime key
on Vercel, bills per judge question, can rate-limit on stage) or is scoped to a fixed set of example
questions (cheaper, defensible for a demo). Don't decide it silently.

### What a full eval run costs

Roughly **$0.25–0.30**: ~2.5k input tokens and ~200 output per record over 16 records, at Opus 5's
$5/M in and $25/M out, less with prompt caching. Smoke it first with `npm run eval -- --limit=2`
for about 4 cents.

## State of the tree

**Check `git log -3` and `git ls-remote --heads origin` before trusting this section** — it is the
part that goes stale first.

`main` carries the ingestion layer, the matcher, the audit schema, Blade, the Vercel AI SDK, Zod,
Playwright's Chromium, all of slice 1, **all of slice 2 (the screen — this IS merged; an earlier
version of this file wrongly said it was not)** and all of slice 3.

`feat/investigate-agent`, `agent/ingestion-layer` and `fix/matcher-edge-cases` are contained in
`main`. **`feat/investigate-agent` no longer exists on the remote** — anything that tells you to
branch from it is stale.

### Before you create a slice branch — the trap, which still applies

Overnight routines claim a slice by pushing a branch *before* writing code. A claim pushed on an
older `main` shares no history with a freshly cut branch of the same name, so the push is rejected
after the work is already committed. **So: `git fetch` and check first.**

```
git ls-remote --heads origin <branch-name>
```

If it answers, adopt it (`git checkout -b <name> origin/<name>` then `git merge main`). If it does
not, `git checkout -b <name> main`. Always `git push -u` so `git status` warns you early.

## Status board — every run updates this before it stops

| # | Slice | Branch | Status |
|---|---|---|---|
| 1 | Backlog findings 3–8 | `fix/matcher-edge-cases` | **done, merged into `main`** |
| 2 | The exception review screen | `feat/exception-review-screen` | **done, merged into `main`** |
| 3 | `ai_calls` + Investigate + policy gate | `feat/investigate-agent` | **done, merged into `main`** |
| 4 | `npm run eval` harness | `feat/eval-harness` | **done, pushed — not yet merged** |
| 5 | §15.1 reasoning trace | `feat/eval-harness` | **done, pushed — not yet merged** |
| 6 | Explain layer + §15.5 citations | — | not started |
| 7 | Act layer (drafts only) | — | not started |
| 8 | Deploy + video | — | not started |

## Slice 4 — the eval harness, so it is not rebuilt

`npm run eval` scores Investigate against `data/synthetic/expected.json` and prints agreement plus
every disagreement. `npm run eval -- --write-traces` additionally saves what the agent did for the
review screen.

- **`src/lib/eval/score.ts`** — pure scoring. **An unanswered record counts as a DISAGREEMENT**, not
  a skip: otherwise a run cut short by a rate limit reports agreement over only the records it
  reached, and half a run prints the same number as a whole one. 13 of 13 mutants killed.
- **`src/lib/eval/report.ts`** — prints 54 records, 38 matched deterministically and 16 investigated
  *together*, so no figure stands alone.
- **`src/lib/eval/run.ts`** — the loop. Separated from the script so pacing, retries and token
  accounting are driven end to end by `MockLanguageModelV4` with no key and no spend.
- **`src/lib/eval/model.ts`** — provider resolution. Anthropic only, and the error says why.
- **`scripts/eval.ts`** — argument parsing, file IO, printing. Nothing that needs asserting.

**The denominator was a decision, not an oversight.** PRD §15.2 says "agreement out of 54" and
§15.4 says "16 investigations"; they contradict. The matched 38 have `exception_category: null` and
`investigationSchema` cannot express "no exception", so sending them would score 0/38 by
construction and measure something the product never does. Settled: **the model sees the 16, and the
report prints all three numbers.** §15.2's wording should be amended to match.

**Retries are scoped on purpose.** `investigate()` catches its own errors and returns
`verdict: "FAILED"`, so a rate limit is indistinguishable from a wrong answer at the call site. Only
`FAILED` is retried; a `COERCED_UNEXPLAINED` is a genuine miss and re-rolling it would launder a
wrong answer into a better score.

**Nothing writes to Postgres.** `ai_calls` is the audit trail of real reconciliation runs; eval
traffic in it would make §15.4's cost report count calls no merchant asked for.

### Do not retry Gemini, or any free provider, without reading BUILD-LOG 29

Google's API refuses function calling and a JSON response mime type **in the same request**.
`Output.object` sets that mime type and Investigate passes `tools`, so every record fails — and
fails *invisibly*, as sixteen wrong classifications with zero tokens. Verified: tools alone work,
`Output.object` alone works, together they are rejected, and `structuredOutputs: false` does not
lift it. `resolveModelChoice` now refuses non-Anthropic providers before any call and its error
states the constraint. **The general form: "X supports A" and "X supports B" do not compose into
"X supports A and B."**

## §15.1 — the reasoning trace, so it is not rebuilt

Every flagged row's detail panel shows the tools the agent called, what came back, the reason it
gave, and the model and prompt version that produced them.

- **`src/lib/review/trace.ts`** — parses `data/synthetic/investigations.json`, Zod-validated. A
  malformed file throws rather than rendering an empty panel beside a real verdict, which would read
  as "the agent did nothing".
- **The trace is an EXPORT of `ai_calls`, not a second derivation.** A verdict can be recomputed
  from the fixture; which tools a model chose cannot. §15.1 is explicit that regenerating on view is
  the failure mode. It ships as a committed file rather than a live query for the same reason the
  settlement fixture does: the page prerenders static and must not need a database.
- **`explainRow` is type-level barred from seeing the trace** (`Omit<ReviewRow, "explanation" |
  "trace">`). It must stay renderable with no API key, and this makes accidental dependence a
  compile error.
- **The gate firing is displayed**, as a badge, when the verdict is not `ACCEPTED`. "The gate never
  fired" is only a checkable claim if a firing would have been visible.
- **Provenance is on screen.** A trace from a mock or a superseded prompt cannot pass as the shipped
  one.
- `data/synthetic/investigations.json` is currently `[]`. That is the honest state until a run
  happens, and the panel falls back to the deterministic explanation.

`npm run verify:screen` now asserts a flagged row shows the section and a matched row does not.
The assertion was inverted once to confirm it fails on all six cases rather than passing vacuously.

## Database

**Live. Neon, provisioned 1 Sep.** `DATABASE_URL` is in `.env`; `npm run db:migrate` applied
cleanly. Don't re-provision; if a connection fails, check `.env` first.

- `batches`, `records`, `actions` and `ai_calls` all exist (`drizzle/0001_gorgeous_sandman.sql`).
- Driver is `postgres-js`, provider-agnostic over a `postgresql://` URL.
- **Two connection strings, not interchangeable.** Migrations need the *direct* (unpooled) URL; the
  app on Vercel needs the *pooled* one. `.env.example` says so at the top.
- Deploy needs `DATABASE_URL` and `ANTHROPIC_API_KEY` in Vercel's project settings.

## Numbers that must never move

| | paise | rupees |
|---|---|---|
| July GSTR-2B invoice taxable value | 664945 | ₹6,649.45 |
| July GSTR-2B invoice tax | 119692 | ₹1,196.92 |
| Rollup of matched records | 85587 | ₹855.87 |
| Rollup delta | 34105 | ₹341.05 |
| **ITC claimable** | **98223** | ₹982.23 |
| **ITC at risk** | **21469** | ₹214.69 |
| August GSTR-2B invoice tax | 19530 | ₹195.30 |

Breakdown: 30 `EXACT` / 8 `FUZZY` / 5 `TIMING` / 4 `REFUND_NETTED` / 4 `FEE_DEDUCTION` /
3 `PARTIAL_PAYMENT` / 0 `UNEXPLAINED` = 54. Re-verified on 2 Sep after §15.1; all unmoved.

At risk is **exactly the four unexplained fee deductions** (21469). The refund half of the old delta
(12636) is claimable, because Razorpay keeps its MDR on a refunded payment.

**For the video, one number is easy to say wrong:** the delta covers **11 flagged rows billed in
July** (4 refunds, 4 unexplained fees, 3 failed retries), of which **8 carry tax**. The three
retries are zero-value. Say "eleven transactions" or "eight of them carrying tax" — never "six".

## Settled — do not reopen

- **Inngest, Langfuse and Sentry are cut.** Run state lives in the `batches` row; the human gate is
  `actions.confirmed_at` plus a Confirm button; tracing is `ai_calls` in the same Postgres.
- **The AI is three agents, and the permission boundary is the point.** Investigate (may classify,
  may not write) → Explain (read-only) → Act (drafts only, cannot send).
- **No LLM in the matching, ever.** A wrong ITC claim is 18% annual interest under Section 50 of the
  CGST Act. The deterministic core is the product's credibility, not a gap in it.
- **`generateText` + `Output.object`, never `generateObject`** — the latter takes no `tools` in AI
  SDK v7. BUILD-LOG 23. Do not "restore" it.
- **No second model provider.** BUILD-LOG 29 is the evidence, not just the policy.
- Two-tier rate-cell matching; there is **no per-transaction invoice number** to join on.
- **Five exception categories, locked.** `itcavl` is a batch-level flag, not a sixth category.
- A netted refund triggers a **Section 34 credit note**, not an ITC reversal.
- The GSTR-2B schema in the fixture is verified against GSTN. **It is not GSTR-2A.** BUILD-LOG 19.
- `match_method` **is** the confidence tier. There is no `confidence` column.
- A batch is **one filing period**, not a date range.
- `REFUND_NETTED` joins on `payment_id`, never `settlement_id`.
- The ₹1 tolerance is exactly **100 paise**, compared as integers.
- Filing-period boundaries use **IST as a fixed +05:30 offset**.
- **Ambiguity is a property of the fee, not the amount.** PRD §6, BUILD-LOG 10.
- Dataset counts are locked (PRD §13). Don't regenerate.
- **Blade's `Amount` is deliberately unused** — it formats through the viewer's browser locale, so
  an audit figure would render differently per viewer. Use `src/lib/format/money.ts`.
- **A click inside a `Table` row is discarded** unless the target is an `svg`, `path`, `div`, `span`
  or the `td`. BUILD-LOG 28. Everything inside a row is a span or a div for this reason.

## Cloud routines — the two failures, compressed

Both are fixed or diagnosed; kept because they recur.

1. **1 Sep:** routine `allowed_tools` listed `mcp__Context7` (the connector's display name). Runs
   register it lowercase, so the grant matched nothing and the session hung on a permission prompt.
   A routine-level `allowed_tools` **overrides** the repo's `.claude/settings.json`. Fixed on both
   triggers (`trig_01FVg9FSUUnv59n41RJKf1WG`, `trig_01WDfhGcZ4QKuUVW5k4fLqqe`), both now
   `enabled: false`. BUILD-LOG 22.
2. **2 Sep:** the allowlist fix worked; the sandbox's egress proxy denies `context7.com:443`
   outright (403 to CONNECT) while `api.github.com` and `registry.npmjs.org` return 200. **The fix
   is on the environment, not the routine:** add `context7.com` to the network policy in Claude Code
   on the web. Re-check with the preflight canary.

Two rules came out of these and live in `docs/NEXT-TASK.md`: the MCP canary is **preflight step 1**,
ahead of `npm ci`; and **a permission prompt is a crash, not an error** — everything a run may touch
must be pre-approved before it is scheduled.

The guard that worked and stays: claim-and-push-before-coding.

## Loose ends

- **Preet runs every `git` write himself.** Draft them, never attempt them. `git commit`, `git
  push`, `git reset`, `git checkout`, `git clean` and `rm` are denied in
  `.claude/settings.local.json`. Several commits then ONE push at the end of a block.
- **The Blade MCP is stdio-only and can never reach a cloud routine.** Everything needed is in
  **`docs/BLADE-NOTES.md`** (21 components, pulled 1 Sep against the lockfile version) plus
  `.cursor/rules/frontend-blade-rules.mdc` — don't delete that file, the MCP refuses to serve docs
  until it exists. For anything else, read `node_modules/@razorpay/blade/build/**/*.d.ts`.
- **Next.js ships its own docs in the repo** at `node_modules/next/dist/docs/`. Version-exact and
  cheaper than a Context7 round-trip.
- `CONTEXT7_API_KEY` is set locally but **not** in a cloud sandbox, so lookups there are keyless and
  IP-rate-limited. If they throttle, say so rather than guessing at an API.
- Cloud runs draw on the **same subscription usage** as an interactive session. Parallel agents
  spend the budget faster; they do not add capacity.
- `tsx` is a direct devDependency now (`npm run eval` needs it); it was previously only transitive.
- The fixture generator was at `/tmp/trace-fixture-gen.mjs`, outside the repo, and is probably gone.
- Preet is not fluent in GST. Gloss every tax term in one or two sentences as it comes up, and say
  what was left out. Both are pinned memories; repeated here because they matter more than anything
  else in this file.
