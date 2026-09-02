# Trace — handoff: slices 1 and 3 are done, the screen is next

Written 2 Sep 2026, evening. **Slice 3 (the Investigate agent) is merged into `main`, and slice 1
(the six matcher bugs) is done on `fix/matcher-edge-cases`.** The next session takes **slice 2, the
exception review screen** — it is the only thing standing between the working matcher and something
a person can look at.

## Read this first

`CLAUDE.md` and the pinned memories load automatically. **Do not re-derive them.** This file only
carries what they don't.

- `docs/PRD.md` — the spec. Read **§9 (architecture)** and **§15 (making the AI legible)** before
  writing agent code. Read **§7 (exception taxonomy)** when you need it. Don't read all of it.
- `docs/BUILD-LOG.md` — 27 entries, each a thing that was wrong while its own tests passed. **25**
  (a timestamp in the wrong unit) and **26** (every supplier summed into Razorpay's invoice) are the
  two live bugs slice 1 found in merged code; **27** is the pass that found three of slice 1's own
  new assertions passing for the wrong reason, and is the most useful one to read.
- `docs/NEXT-TASK.md` — the routine briefing: preflight, banned commands, the per-slice loop and
  the slice definitions. Read it even as an interactive session; acceptance criteria live there and
  are not duplicated here.

## Deadline

Applications close **5 September 2026**. Razorpay publishes no closing *time* or timezone — the
date comes from a recruiter's post, not the site. So **treat end of 4 September as the deadline**
and don't spend the 5th. That leaves 2, 3 and 4 September.

## The night of 1 Sep — read this before scheduling anything

Two cloud routines fired (19:00Z and 22:30Z). Both passed preflight cleanly, claimed a slice,
pushed the claim, and then **hung on a Context7 permission prompt within three minutes**. Neither
wrote a line of code. Both sessions sat in `requires_action` until morning; approving the prompt
woke them and they exited with `turns=0`, so nothing was recoverable.

Cause: the routines' `allowed_tools` listed `mcp__Context7`, copied from the connector's display
name. A run registers it lowercase and calls `mcp__context7__resolve-library-id`, so the grant
matched nothing. A routine-level `allowed_tools` also **overrides** the repo's tracked
`.claude/settings.json`, so the correct grant sitting in the clone never applied. Full write-up in
BUILD-LOG 22.

**Fixed on both routines** (`trig_01FVg9FSUUnv59n41RJKf1WG`, `trig_01WDfhGcZ4QKuUVW5k4fLqqe`):
the allowlist now carries lowercase server prefixes and explicit tool ids, with the capitalised
forms kept alongside. Both are spent one-shots (`enabled: false`), so firing one needs
`RemoteTrigger action: "run"` or a fresh `run_once_at`.

Two rules came out of this and are now in `docs/NEXT-TASK.md`:

- The MCP canary is **preflight step 1**, ahead of `npm ci`. A blocked tool kills the whole
  session, so the only useful place to find out is before anything else has been done.
- **A permission prompt is a crash, not an error.** No instruction can tell a run to skip one —
  the prompt blocks the session rather than failing the call. Everything a run may touch has to be
  pre-approved before it is scheduled.

The one guard that worked: claim-and-push-before-coding. It is why this is a legible failure
rather than a mystery, and it stays.

## The night of 2 Sep — the allowlist is fixed, the network is not

The 04:31Z run got past the thing that killed 1 Sep. `mcp__context7__resolve-library-id` was
**permitted** — no permission prompt, the call ran — so the lowercase allowlist fix works and
BUILD-LOG 22 is closed. It failed one layer down instead:

```
TypeError: fetch failed
proxy: connect_rejected — "gateway answered 403 to CONNECT" — host: context7.com:443
```

The sandbox's egress proxy denies `context7.com` outright. Same run, same moment:
`api.github.com` → 200 and `registry.npmjs.org` → 200. So this is **not** the routine's
`allowed_tools` and not an MCP problem — it is the **remote environment's network policy**, which
lists the domains a session may reach. `context7.com` is not on it.

**The fix is on the environment, not the routine:** add `context7.com` to the allowed domains
(Claude Code on the web → the environment's network policy). Re-check by running the preflight
canary; it answers or it doesn't, in about ten seconds.

The run stopped there without claiming a slice, per the briefing's step-1 rule — no branch, no
code, nothing to unwind. Slice 1 is still the first unclaimed slice.

Worth knowing for whoever fixes this: `CONTEXT7_API_KEY` is not set in a cloud sandbox either, so
once the domain is unblocked, lookups there are keyless and rate-limited per IP.

Two other connectors were down in the same run, both expected: `blade` (stdio-only, can never
reach a routine) and `razorpay` (needs an OAuth flow no unattended run can complete).

## State of the tree

**Check `git log -3` before trusting anything in this section** — it is the part that goes stale
first.

`main` carries the ingestion layer, Blade, the Vercel AI SDK, Zod, Playwright's Chromium, and — as
of `c4a0d7a` — **all of slice 3**. `feat/investigate-agent` is merged; don't branch from it.

`fix/matcher-edge-cases` carries slice 1 on top of `main`: **195 tests pass, typecheck and lint
clean.** It touches ingestion, the matcher and the row mapping, and nothing under `src/lib/agent/`,
so it does not overlap the screen. Branch slice 2 from `main` or from it, either is safe.

Everything the queue needs is installed and committed, so a scheduled run never has to install
anything. `.npmrc` sets `legacy-peer-deps=true`, which Blade requires — its peer list contradicts
itself on every React version, and BUILD-LOG 21 records why.

**Preet runs every `git` write himself.** Draft them, never attempt them. `git commit`, `git push`,
`git reset`, `git checkout`, `git clean` and `rm` are denied in `.claude/settings.local.json`.
Several commits then ONE push at the end of the block — do not repeat `git push` after every
commit. The branch does have to be pushed before a scheduled routine fires or before he stops for
the day, because routines clone from the remote and a stale `main` makes a run rediscover problems
already fixed.

## Where the project stands

**Built and merged on `main`:**

- **Schema + migration** — `src/lib/audit/schema.ts`, `drizzle/0000_peaceful_winter_soldier.sql`.
  Three tables: `batches`, `records`, `actions`. All money is **integer paise**, never floats.
- **Fixture** — `data/synthetic/`: `settlements.json` (54 payments + 4 refund rows),
  `gstr2b-072026.json`, `gstr2b-082026.json`, `expected.json`.
- **Matcher** — `src/lib/matching/`. `matchBatch()` takes parsed settlement rows plus a parsed
  GSTR-2B statement and returns classified records, a period rollup and GSTN's ITC verdict.
- **Ingestion** — `src/lib/ingestion/`: `parseSettlements`, `parseStatement`, `guards.ts`.
- **Row mapping** — `src/lib/audit/rows.ts`: pure `BatchResult` → Drizzle rows.

**Also merged:** the `ai_calls` table and the whole Investigate layer. See the slice 3 section
below.

**On `fix/matcher-edge-cases`, not yet merged:** the six matcher fixes, described under Backlog.

**Not built at all:** any UI, the Explain and Act layers, the eval harness, deploy, the video.

## Status board — every run updates this before it stops

| # | Slice | Branch | Status |
|---|---|---|---|
| 1 | Backlog findings 3-8 | `fix/matcher-edge-cases` | **done, unmerged** |
| 2 | The screen | `feat/exception-review-screen` | not started |
| 3 | `ai_calls` + Investigate + policy gate | `feat/investigate-agent` | **done, merged into `main`** |
| 4 | `npm run eval` harness | `feat/investigate-agent` | not started — unblocked, slice 3 is on `main` |
| 5 | §15.1 reasoning trace, §15.5 citations | — | blocked until 2 and 3 are reviewed |

The two branches from last night hold **only** a slice-claim commit each, no code. Either build on
them or delete them; don't mistake them for work in progress.

## Slice 3 — what was built, so it is not rebuilt

All on `feat/investigate-agent`, all against the AI SDK's mock model. No API key was used and none
is needed to run the tests.

- **`ai_calls`** — `drizzle/0001_gorgeous_sandman.sql`, **applied to Neon**. Beyond the columns the
  brief named it carries `layer` (three agents write here), `cache_read_tokens` / `cache_write_tokens`
  (Anthropic bills cached input at 0.1x and a cache write at 1.25x, so one `input_tokens` column
  would misreport cost by most of the caching saving), and `tool_calls` / `reason` for §15.1.
- **`src/lib/agent/schema.ts`** — the Zod enum, read from `exceptionCategory.enumValues` so the
  model's vocabulary and the column it writes to are one list.
- **`src/lib/agent/prompt.ts`** — `SYSTEM_PROMPT` is a module constant and must stay one. It is
  ~2,900 chars; **Claude Opus 5 will not cache a prefix under 512 tokens**, and under that limit
  caching fails silently as a 10x bill rather than an error. A test guards the floor.
- **`src/lib/agent/tools.ts`** — four read-only tools, reusing the matcher's own `priceAt` and
  `periodOf` rather than reimplementing them.
- **`src/lib/agent/policy.ts`** — the gate, plus the tool allowlist checked *before* the model call.
- **`src/lib/agent/pricing.ts`** — cost in integer micro-USD, recomputable from the stored columns.
- **`src/lib/agent/investigate.ts`** — the call site.

**The one thing to know before touching it:** it uses `generateText` + `Output.object`, **not**
`generateObject`. In AI SDK v7 `generateObject` accepts no `tools`, so the PRD's original wording
was unimplementable. PRD §15.3 and the §9 diagram now say so; BUILD-LOG 23 records why. Do not
"restore" it.

Slice 4 (the `npm run eval` harness) is unblocked and small — it scores `investigate()` against
`data/synthetic/expected.json`. It needs slice 3's code, so branch from `feat/investigate-agent`
or merge that to `main` first.

## Database

**Live. Neon, provisioned 1 Sep.** `DATABASE_URL` is in `.env`, `npm run db:migrate` applied the
migration successfully, and `npm run db:studio` opens against it. Don't re-provision; if a
connection fails, check `.env` first.

- `batches`, `records` and `actions` exist. **`ai_calls` does not** — it is slice 3's first task.
- The driver is `postgres-js` (`src/lib/audit/client.ts`), which speaks to any Postgres over a
  `postgresql://` URL. Nothing is provider-specific, so switching later costs one env var.
- **Two connection strings, not interchangeable.** Migrations need the *direct* (unpooled) URL; the
  app on Vercel needs the *pooled* one, or serverless invocations exhaust the connection limit.
  `.env.example` says so at the top.
- Deploy needs `DATABASE_URL` and `ANTHROPIC_API_KEY` in Vercel's project settings. Local `.env`
  does not travel.
- `ANTHROPIC_API_KEY` is **not set, deliberately.** Preet will load $5 with the console spending
  limit set to $5 so overrun is impossible, once there is something worth spending it on. Until
  then: mock model only. Do not ask for a key and do not call the live API.

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
3 `PARTIAL_PAYMENT` / 0 `UNEXPLAINED` = 54.

At risk is **exactly the four unexplained fee deductions** (21469). The refund half of the old delta
(12636) is claimable, because Razorpay keeps its MDR on a refunded payment.

**For the video, one number is easy to say wrong:** the delta covers **11 flagged rows billed in
July** (4 refunds, 4 unexplained fees, 3 failed retries), of which **8 carry tax**. The three
retries are zero-value. Say "eleven transactions" or "eight of them carrying tax" — never "six".

## Settled — do not reopen

- **Inngest is cut.** 54 records through pure functions in under 3 seconds, byte-identical on
  re-run — nothing to resume. Run state lives in the `batches` row. The human-in-the-loop pause is
  `actions.confirmed_at`, a nullable column plus a Confirm button.
- **Langfuse is cut.** `langfuse-vercel` is deprecated in its own README and the current SDK drops
  spans on Vercel unless flushed explicitly — a *silent* failure. Replaced by `ai_calls` in the same
  Postgres: for an audit product the trace **is** the audit trail.
- **Sentry stays cut.** No production traffic to monitor.
- **The AI is three agents, and the permission boundary is the point.** Investigate (may classify,
  may not write) → Explain (read-only) → Act (drafts only, cannot send).
- **No LLM in the matching, ever.** A wrong ITC claim is not a bug, it is 18% annual interest under
  Section 50 of the CGST Act. The deterministic core is the product's credibility, not a gap in it.
- Two-tier rate-cell matching. There is **no per-transaction invoice number** to join on; GSTR-2B
  carries one consolidated Razorpay invoice line per filing period.
- **Five exception categories, locked.** `itcavl` is a batch-level *flag* (`ITC_INELIGIBLE`), not a
  sixth category.
- A netted refund triggers a **Section 34 credit note**, not an ITC reversal. Razorpay does not
  return its MDR on a refunded transaction, so that GST stays claimable.
- The GSTR-2B schema in the fixture is real and verified against GSTN. **It is not GSTR-2A.**
  `flprdr1`, `fldtr1` and `itm_det` are 2A-only and rejected document-wide. `iamt`, `camt` and
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

## Backlog — all six fixed on `fix/matcher-edge-cases`

These were slice 1 and they are done: each has a test that failed before its fix and passes after,
and every locked number above is unmoved. 195 tests pass, typecheck and lint clean. Findings 3 and
4 were live bugs in already-merged code and are BUILD-LOG **25** and **26**; the adversarial pass
is **27**. Next free BUILD-LOG number is **28**.

What each fix actually does, since the finding text describes the bug and not the remedy:

3. **`settled_at` accepts milliseconds** — fixed. `requireEpochSeconds` bounds the value to
   1 Jul 2017 (GST commencement) → 1 Jan 2100, so any millisecond, microsecond or nanosecond
   value is refused by name rather than silently billed to a period that does not exist.
4. **A second supplier in `docdata.b2b` was summed into "the Razorpay invoice"** — fixed. Both
   `invoiceTotals` and `itcVerdict` are scoped to `RAZORPAY_SUPPLIER_GSTIN`, overridable per batch
   via `MatchInput.supplierGstin`. A statement with no Razorpay invoice throws instead of totalling
   zero. The comparison is the whole GSTIN, state code included.
5. **Statement money given in paise** — guarded as far as a single statement allows. Every invoice
   must now carry `val`, GSTN's own declared total, and its line items (cess included) must add up
   to it within ₹1. That catches lines scaled by 100 under a rupee total. It does **not** catch a
   uniformly scaled document — `val` in paise too is internally consistent, and nothing inside the
   statement can see it; that one surfaces as a hundredfold rollup delta in front of a human, which
   is the product's answer to it. Said plainly in the code comment rather than implied.
6. **`toBatchRow` accepted a contradicting `meta.period` and an empty `merchantGstin`** — fixed.
   `BatchResult` now carries the period it reconciled, and the mapping refuses a `meta` that
   disagrees with it. Both fields are held to the same shapes ingestion holds the statement to.
7. **An envelope with no `count`** — fixed. Refused outright, naming the absence; a bare array is
   still accepted, because it is a different shape rather than an envelope missing a field.
8. **The three buckets could fall short of `totalRecords`** — fixed. `toBatchRow` asserts
   `exact + fuzzy + exceptions === totalRecords` and names all four numbers when it doesn't hold.

## Making the AI legible — PRD §15, committed scope

Five items, each with a "done when" line in the spec. Read that section; don't re-derive it here.
Investigate renders its tool calls and reasoning in the UI (15.1); the agent is scored against
`expected.json` for a real accuracy number (15.2); categories are constrained by a Zod enum at
generation *and* by the policy gate behind it (15.3); the batch reports its own token count and
rupee cost from `ai_calls` (15.4); Explain cites the records it used, as links (15.5).

Build them **alongside** each layer, not as a cleanup pass — 15.1 and 15.4 are nearly free while
writing the Investigate call site, and expensive to retrofit. §15 also records what is deliberately
*not* being added: no vector DB, no agent framework, no second model provider.

## Loose ends

- **The Blade MCP cannot be reached from a cloud routine at all** — it is stdio-only and has no
  HTTP endpoint, so it can never appear in a routine's `allowed_tools`. (An earlier version of this
  file said routines must list it. That was wrong.) Everything needed is cached in
  **`docs/BLADE-NOTES.md`** (21 components, pulled 1 Sep against the lockfile version) plus
  `.cursor/rules/frontend-blade-rules.mdc`. For anything not in those, read the shipped types in
  `node_modules/@razorpay/blade/build/**/*.d.ts` — version-exact and compiler-enforced.
- The Blade MCP refuses to serve docs until `create_blade_cursor_rules` has been called once. It
  has been, and `.cursor/rules/frontend-blade-rules.mdc` is committed. Don't delete that file.
- **Next.js ships its own docs in the repo** at `node_modules/next/dist/docs/`. For anything
  Next-specific, read those first — version-exact and cheaper than a Context7 round-trip.
- `CONTEXT7_API_KEY` is set locally but **not** in a cloud sandbox, so Context7 runs keyless and
  IP-rate-limited there. If lookups throttle, say so rather than guessing at an API.
- Cloud runs draw on the **same subscription usage** as an interactive session. Parallel agents
  spend the budget faster; they do not add capacity. Worth weighing before fanning out.
- The fixture generator is at `/tmp/trace-fixture-gen.mjs`, outside the repo, and `/tmp` may have
  been cleared. Worth committing as `scripts/generate-fixture.mjs` if it survives.
- `docs/VIDEO.md` should be added to `.gitignore` alongside `PLAN.md`, `PITCH.md` and `BRIEF.md`.
  `HANDOFF.md` and `NEXT-TASK.md` are **tracked on purpose** — routines clone from the remote and
  cannot read an untracked file.
- Preet is not fluent in GST. Gloss every tax term in one or two sentences as it comes up, and say
  what was left out. Both are pinned memories that load automatically; repeated here because they
  matter more than anything else in this file.
