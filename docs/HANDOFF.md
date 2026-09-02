# Trace — handoff: the Explain layer is built; Act and deploy remain

Written 2 Sep 2026, late. **Slices 1 through 6 are done.** Slices 1–5 are on `main`; slice 6
(Explain + PRD §15.5) is on **`feat/explain-layer`**.

The tree is green: **319 tests, typecheck, lint, `npm run build` and `npm run verify:screen`**.

What remains is the **Act layer, deploy and the video**. The Explain layer no longer needs a key to
be *visible* — six example answers are recorded and committed — but it does need one to be
answered *live*, and no run has recorded them yet, so the file is still `[]`. See "What the key
buys now".

## Read this first

`CLAUDE.md` and the pinned memories load automatically. **Do not re-derive them.** This file only
carries what they don't.

- `docs/PRD.md` — the spec. Read **§9 (architecture)** and **§15 (making the AI legible)** before
  writing agent code. Read **§7 (exception taxonomy)** when you need it. Don't read all of it.
  §15.5 now records how Explain actually ships, including two deviations from §9.
- `docs/BUILD-LOG.md` — 30 entries, each a thing that was wrong while its own tests passed. **Next
  free number is 31.** Read **30** before touching `scripts/verify-screen.mjs`, **29** before
  touching anything model-provider-shaped, **28** before touching the table, **27** for how a
  passing test can be aimed at the wrong thing.
- `docs/NEXT-TASK.md` — the routine briefing: preflight, banned commands, the per-slice loop.

## Deadline

Applications close **5 September 2026**. Razorpay publishes no closing *time* or timezone, so treat
**end of 4 September** as the deadline. That leaves 3 and 4 September.

## What the key buys now

`ANTHROPIC_API_KEY` is **not set**. Preet is loading $5 with the console spending limit set to $5
on **3 Sep**. Until then: mock model only, and every layer still renders.

| Layer | Built? | When the key is needed |
|---|---|---|
| **Detect / matcher** | yes | never — deterministic by design, no LLM, ever |
| **Investigate** (+ §15.1 trace) | yes | **once**, to generate `data/synthetic/investigations.json`. Static afterwards. |
| **Explain** (+ §15.5 citations) | yes | **once** for the six example answers (`npm run explain`), then **at runtime** only for a question a person types |
| **Act** (drafts) | no | at runtime, *unless* drafts for the 16 known exceptions are pre-generated and committed the way the other two are |

Both fixture files — `investigations.json` and `explanations.json` — are `[]` today. That is the
honest state, and every consumer treats it as normal: the trace panel falls back to the
deterministic explanation, and the Explain panel says no answer has been recorded rather than
inventing one.

### The two runs to make the moment the key lands

```
npm run eval -- --limit=2          # ~4 cents, smoke test
npm run eval -- --write-traces     # ~$0.25–0.30, fills investigations.json (§15.1)
npm run explain -- --dry           # prints the six answers, writes nothing
npm run explain                    # ~2 cents, fills explanations.json (§15.5)
```

`npm run explain` refuses to overwrite the file if any question produced no answer, so a run cut
short by a rate limit cannot leave "the agent failed" under a real question. Re-run it with
`--delay=2000` if that happens.

## The Explain decision, now settled

The previous handoff deferred one question: does Explain answer live, or from a fixed set of
pre-generated answers? **Both, through one agent.** Preet chose this on 2 Sep.

- Six example questions (`EXAMPLE_QUESTIONS` in `src/lib/explain/library.ts`) are answered once by
  `npm run explain` and committed. They need no key, no database and no network, so the page stays
  **statically prerendered** and a rate limit or an unreachable API costs the page nothing.
- A free-text box calls `POST /api/explain` live, which is the only way a question nobody
  anticipated can be answered.
- Both go through the same `explain()`, the same four read-only tools and the same citation gate.
- **Every answer states which it is.** Provenance — model, prompt version, and either
  "recorded &lt;date&gt;" or "answered live" — sits under every answer, because an answer recorded
  weeks ago must never read as one just produced.

## Slice 6 — Explain, so it is not rebuilt

- **`src/lib/explain/citations.ts`** — `bindCitations` turns an answer into text and citation
  segments. Citations are read from the prose alone; there is no second list of claimed ids for it
  to disagree with. A record the batch does not hold keeps its words, loses its link, and is
  reported. What separates a citation from prose is an **allowlist of Razorpay id prefixes**, not a
  length rule — a length rule reports `[fee_deduction]` as an invented record.
- **`src/lib/explain/policy.ts`** — the gate. Its output schema has **no `category` field** and is
  `strictObject`, so an answer that tries to classify does not decode at all. Explain's tool
  allowlist is separate from Investigate's *on purpose*: one shared list would make widening one
  layer's permissions widen the other's.
- **`src/lib/explain/tools.ts`** — four read-only tools over the **already-computed** `ReviewBatch`.
  They re-derive no figure. `listRecords` caps at 25 and **reports the truncation**, because a
  model handed a silently shortened list would state 25 as the total.
- **`src/lib/explain/explain.ts`** — the call site. Boundary checked before the model is called.
  Builds the `ai_calls` row without writing it, exactly as `investigate()` does.
- **`src/lib/explain/library.ts`** — the questions and the recorded-answer file. An answer stores
  the **wording** it was asked, not just its id, so rewording a question drops its stale answer
  instead of silently reattaching it.
- **`src/lib/explain/bake.ts`** — the `npm run explain` loop, split out so a mock model drives it
  end to end with no key and no spend, the way `runEval` is.
- **`src/app/api/explain/route.ts`** — the live route. Per-process question budget claimed before
  the model is called; **declines with 503 rather than answering without writing its audit row**.
- **`src/app/explain-panel.tsx`** — the panel. Citations are links that scroll to the row and open
  it.

`npm run verify:screen` now covers the panel in **two branches and prints which one it took**, so
an empty answers file cannot look like passing coverage, plus an unconditional check that all 54
rows carry the `row-<recordId>` anchor a citation scrolls to.

### One migration was applied for this slice

`drizzle/0002_red_white_tiger.sql` adds `INVALID_CITATION` to the `ai_call_verdict` enum. **Preet
ran `npm run db:migrate` on 2 Sep.** It is a distinct verdict from `FAILED` for the same reason
`COERCED_UNEXPLAINED` is: an answer that invented a record id is a prompt problem, and a call that
returned nothing is an infrastructure one.

## State of the tree

**Check `git log -3` and `git ls-remote --heads origin` before trusting this section** — it is the
part that goes stale first.

`main` carries slices 1 through 5: the ingestion layer, the matcher, the audit schema, Blade, the
Vercel AI SDK, Zod, Playwright's Chromium, the exception review screen, the Investigate agent and
policy gate, the `npm run eval` harness and the §15.1 reasoning trace.

**`feat/eval-harness` is contained in `main`** — an earlier version of this file said slices 4 and 5
were unmerged; they are merged, and `origin/feat/eval-harness` is the same commit as `origin/main`.
`feat/exception-review-screen` and `fix/matcher-edge-cases` are likewise contained in `main`.

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
| 4 | `npm run eval` harness | `feat/eval-harness` | **done, merged into `main`** |
| 5 | §15.1 reasoning trace | `feat/eval-harness` | **done, merged into `main`** |
| 6 | Explain layer + §15.5 citations | `feat/explain-layer` | **done — not yet merged** |
| 7 | Act layer (drafts only) | — | not started |
| 8 | Deploy + video | — | not started |

## Commands

`npm run dev` · `build` · `typecheck` · `test` · `lint` · `verify:screen` · `db:*` — see
`CLAUDE.md`. Two that are specific to the AI layers:

- `npm run eval` — scores Investigate against `data/synthetic/expected.json` (§15.2).
  `-- --write-traces` also fills `investigations.json` for the §15.1 panel.
- `npm run explain` — records the six example answers into `explanations.json` (§15.5).
  `-- --dry` prints without writing.

Both refuse to run without `ANTHROPIC_API_KEY` and say why. Neither writes to Postgres.

## Database

**Live. Neon, provisioned 1 Sep.** `DATABASE_URL` is in `.env`; migrations `0001` and `0002` are
applied. Don't re-provision; if a connection fails, check `.env` first.

- `batches`, `records`, `actions` and `ai_calls` all exist.
- Driver is `postgres-js`, provider-agnostic over a `postgresql://` URL.
- **Two connection strings, not interchangeable.** Migrations need the *direct* (unpooled) URL; the
  app on Vercel needs the *pooled* one. `.env.example` says so at the top.
- **A `batches` row is one RUN, not one period** — it carries `startedAt`, `completedAt` and
  `processingTimeMs`. That is why there is no unique constraint on (gstin, period), and why the
  live Explain route reuses the latest row for the period rather than inserting one per question.
- Deploy needs `DATABASE_URL` and `ANTHROPIC_API_KEY` in Vercel's project settings.
  `EXPLAIN_MAX_QUESTIONS` is optional and defaults to 40 live questions per server process.

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
3 `PARTIAL_PAYMENT` / 0 `UNEXPLAINED` = 54. Re-verified on 2 Sep after slice 6; all unmoved.

At risk is **exactly the four unexplained fee deductions** (21469). The refund half of the old delta
(12636) is claimable, because Razorpay keeps its MDR on a refunded payment.

Two of these now cross-check each other in `tests/explain-tools.test.ts`, which asserts against the
figures in this table rather than against the code: `FEE_DEDUCTION` tax **is** ITC at risk (21469),
and `TIMING` tax **is** August's invoice tax (19530). `FEE_DEDUCTION + REFUND_NETTED` is the rollup
delta (34105).

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
- **Explain does not stream, and that is deliberate.** The citation gate cannot check half a record
  id. PRD §15.5 carries the full reasoning; §9's `streamText` was an implementation note and the
  PRD has been corrected to match what shipped.
- **The live Explain route will not answer off the record.** No database, no answer — a 503 with an
  explanation. "Every Claude call is logged" is either true or it is marketing.
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
- **Every DOM query in `verify-screen.mjs` is scoped to what it asserts about**, never to the page.
  BUILD-LOG 30 records two instances of this in one sitting.

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

- **Preet runs every `git` write himself.** Draft them, never attempt them, and **stop after handing
  one over if your next step depends on it having run.** `git commit`, `git push`, `git reset`,
  `git checkout`, `git clean` and `rm` are denied in `.claude/settings.local.json`. Several commits
  then ONE push at the end of a block.
- **The Blade MCP is stdio-only and can never reach a cloud routine.** Everything needed is in
  **`docs/BLADE-NOTES.md`** (21 components, pulled 1 Sep against the lockfile version) plus
  `.cursor/rules/frontend-blade-rules.mdc` — don't delete that file, the MCP refuses to serve docs
  until it exists. For anything else, read `node_modules/@razorpay/blade/build/**/*.d.ts`. Slice 6
  needed `TextInput`, which is **not** in the notes; its props came from the shipped types, and its
  web build types `onSubmit` away — use `onKeyDown` and read `key`.
- **Context7 has no `ai` v7 in its index** — its newest is 6.0.0 and the repo runs `ai@7.0.87`. Pull
  it for shape, then confirm against `node_modules/ai/dist/index.d.ts`, which is version-exact.
- **Next.js ships its own docs in the repo** at `node_modules/next/dist/docs/`. Version-exact and
  cheaper than a Context7 round-trip. `01-app/01-getting-started/15-route-handlers.md` is the one
  slice 6 used.
- `CONTEXT7_API_KEY` is set locally but **not** in a cloud sandbox, so lookups there are keyless and
  IP-rate-limited. If they throttle, say so rather than guessing at an API.
- Cloud runs draw on the **same subscription usage** as an interactive session. Parallel agents
  spend the budget faster; they do not add capacity.
- `tsx` is a direct devDependency (`npm run eval` and `npm run explain` need it).
- The fixture generator was at `/tmp/trace-fixture-gen.mjs`, outside the repo, and is probably gone.
- Preet is not fluent in GST. Gloss every tax term in one or two sentences as it comes up, and say
  what was left out. Both are pinned memories; repeated here because they matter more than anything
  else in this file.
