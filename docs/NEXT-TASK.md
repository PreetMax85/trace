# Routine briefing — unattended build run

You are a scheduled run. Nobody is awake. Preet will read what you produced in the morning.

This file is the same for every scheduled run. It does not name a single task — it names a
**queue**, and you work down it. Two runs are scheduled (23:00 and 04:00 IST); the second picks up
wherever the first stopped, so this file must stay true for both. Do not edit it.

## The one rule that matters most

**You write code. You do not change the environment.**

Every dependency this queue needs is already installed and committed — Blade, the Vercel AI SDK,
Zod, Drizzle, Playwright's Chromium, and the MCP servers. `.npmrc` already sets
`legacy-peer-deps=true`, which Blade requires and which Vercel will inherit.

So: **do not run `npm install <new package>`, do not add MCP servers, do not provision anything, do
not change React or Next versions.** `npm ci` or a plain `npm install` to restore the existing
lockfile is fine; adding to it is not. If a slice genuinely cannot be done without a new dependency,
**skip that slice**, write down why in `docs/HANDOFF.md`, and move to the next one.

This rule exists because every failure that has cost this project a night was an environment change,
never a code change. Code either compiles or it doesn't, and the tests tell you which.

## Preflight — run this before any slice, and stop if it fails

Do these six things first, in order. They take about three minutes and they convert a silent
all-night hang into an informative early failure. **The order matters** — step 1 is first because
it is the one that can kill the session outright, and it is worth nothing if it fires after you
have already spent twenty minutes.

1. **Call `resolve-library-id` on the Context7 connector, before anything else.** This is a canary,
   and its three outcomes are not the same thing — say which one you got.
   - **It returns.** MCP is healthy; follow the documentation-first rule normally.
   - **It asks permission.** This run is already over (see below). Nothing you can write will
     rescue it, but it died in thirty seconds having wasted nothing, and the log will say why.
   - **It errors** — `fetch failed`, a timeout, an auth error. The tool is *allowed* but the
     sandbox cannot reach it. This is recoverable and you should **carry on**. Fall back to the
     version-exact docs vendored in the repo: `node_modules/next/dist/docs/` for Next.js,
     `docs/BLADE-NOTES.md` and `node_modules/@razorpay/blade/build/**/*.d.ts` for Blade, and the
     shipped `.d.ts` files for anything else. Use WebSearch only after those. Note the failure in
     `docs/HANDOFF.md` and keep going — do **not** guess at an API you could not look up.
2. `npm ci` (or `npm install`) — restore the lockfile, nothing new.
3. `npm test` — expect **195 passing**. If not, stop and report; the tree was already broken.
4. `npm run typecheck` and `npm run lint` — both clean.
5. Claim your slice in `docs/HANDOFF.md`, commit, and **push it immediately**. This proves git
   auth works. If the push fails, stop — everything after this would be stranded.
6. Start the dev server **in the background** and confirm `http://localhost:3000` answers.

If steps 2-5 fail, **stop and report**. Do not try to repair the environment. If 6 fails, carry on
— nothing in the queue strictly needs the browser.

## What MCP you have, and what you don't

**Available as connectors:** Context7, Exa, Neon, Razorpay, Vercel. Use Context7 for any library
API you are about to write against — the AI SDK especially. That is this project's first
non-negotiable rule and it applies to you.

**NOT available: the Blade MCP.** It is stdio-only, so no routine can reach it. Everything you need
is cached in **`docs/BLADE-NOTES.md`** (21 components, pulled 1 Sep against the exact version in the
lockfile) plus `.cursor/rules/frontend-blade-rules.mdc`. For anything not in those, read the shipped
types in `node_modules/@razorpay/blade/build/**/*.d.ts` — version-exact and compiler-enforced. Do
not guess a prop name.

## Never do any of these — they hang forever with nobody to answer

Each of these has already cost this project real time. They are not hypothetical.

- Anything using `sudo`, or `playwright install --with-deps`. Chromium is already installed.
- A foreground `npm run dev`, `npm run db:studio`, `npm run test:watch`, or any watch mode.
  **Always background them and always give them a timeout.**
- `npx` without `-y`.
- `git commit` without `-m` — it opens an editor and waits forever.
- `git rebase -i`, `git add -i`, or anything interactive.
- Any command that prompts for a password, a confirmation, or a permission.

**A permission prompt is not an error you can handle — it is a crash.** You cannot abandon the
step and move on, because the prompt blocks the whole session rather than failing the one tool
call. There is no branch for you to take, and no note you can write. Earlier versions of this file
told you to "abandon that step and continue"; that instruction was impossible to follow and it cost
this project two full nights (BUILD-LOG entries 20 and 22).

So the rule is preventative, and it is not aimed at you — it is aimed at whoever schedules you.
Every tool this run may reach must be pre-approved **before the run is created**, in the routine's
`allowed_tools`. Grant whole servers rather than picking tools: `mcp__context7` allows everything
Context7 offers. Copy the name from a tool id a run actually called, not from the connector's
display name in the UI — connectors show as "Context7" but register as `context7`, and
`mcp__Context7` matches nothing. Note that a routine-level `allowed_tools` **overrides the
repository's tracked `.claude/settings.json`** — a correct grant in the repo does not save you if
the routine's own list is wrong.

Your part is only step 1 of the preflight: prove MCP answers before you spend time on anything
else.

## How to pick your work

Read `docs/HANDOFF.md` first. It records which slices are done. Take **the first slice below that is
neither done nor `in progress`**, and work down from there for as long as you have budget. A slice
marked `in progress` belongs to another run that may still be working — skip it, do not duplicate it. You will probably be cut
off mid-slice — that is expected and fine, because every completed slice is already pushed.

## The per-slice loop — follow it exactly

For each slice:

0. **Claim the slice first.** In `docs/HANDOFF.md`, set that slice's status to `in progress
   (<branch>, started HH:MM UTC)`, commit, and **push immediately** — before you write any code.
   Another run may start while you are working; this is the only thing that stops it duplicating
   your slice. When you finish, set the status to `done`. If you abandon it, set it back to
   `not started` with a note saying why.
1. `git fetch`, then check whether the slice's branch already exists on the remote —
   `git ls-remote --heads origin <branch>`. **A previous run's claim commit lives there**, on that
   run's `main`, and cutting a fresh branch of the same name off today's `main` gives you a branch
   that shares no history with it: the push is then rejected as non-fast-forward, after your work is
   already committed. If it exists, `git checkout -b <branch> origin/<branch>` and `git merge main`.
   If it does not, `git checkout -b <branch> main`. Either way, push with `-u` so divergence shows
   up in `git status` rather than in a failed push.
2. Build it. Follow TDD where a test can express the requirement.
3. `npm test`, `npm run typecheck`, `npm run lint` — all must be clean.
4. **Adversarial pass.** Mutate your own implementation in several places and confirm a test fails
   for each. A green suite you wrote yourself is weak evidence — that is this project's core
   discipline, and BUILD-LOG entries 9-19 are what happens without it. Add assertions to kill any
   mutant that survives.
5. Append a `docs/BUILD-LOG.md` entry **only if** something was wrong while its own tests passed,
   an assumption turned out false, or a decision got reverted. Use the five fields at the top of
   that file, and include the guard. Next free number is **28**.
6. `git commit -m "..."` — Conventional Commits, short subject, plain language, no jargon.
7. **`git push origin <branch>` immediately.** Do not batch pushes. Do not wait for the next slice.
8. Rewrite the status section of `docs/HANDOFF.md`: which slice you finished, what is left, anything
   you skipped and why. Commit and push that too.
9. Open a PR with `gh pr create` if it is available. If it is not, skip it — the pushed branch is
   what matters.

**Never commit a red tree.** If a slice cannot be made green, commit nothing for it, record the
attempt in `docs/HANDOFF.md`, and move to the next slice.

## The queue

Ordered by risk, lowest first, so that being cut off early still leaves value behind.

### Slice 1 — `fix/matcher-edge-cases`

Backlog findings 3 to 8, listed in `docs/HANDOFF.md`. Pure hardening of already-merged code. No new
dependencies, no UI, tests as the oracle.

**Done when:** each finding has a test that fails before the fix and passes after, and the locked
numbers in `docs/HANDOFF.md` are unchanged — 54 records, 38 matched, July `119692 / 85587 / 34105`,
ITC `98223 / 21469`, August `19530 / 0`.

### Slice 2 — `feat/exception-review-screen`

The screen. One page, server-rendered, reading the fixture directly through `matchBatch()` — **not**
through Postgres. The database is the audit trail; it must not sit between the fixture and the pixels.

- Header: invoice tax ₹1,196.92 · ITC claimable ₹982.23 · ITC at risk ₹214.69 · 38/54 matched.
- Table: all 54 rows — settlement id, amount, fee, tax, `match_method`, category. The 16 exceptions
  must be visually distinct from the 38 matched.
- Detail: clicking an exception shows why it was flagged.

Use `@razorpay/blade`. **Read `docs/BLADE-NOTES.md` before using any component** — the Blade MCP is
not reachable from a routine and the prop names are not guessable. `src/app/page.tsx` and `src/app/providers.tsx` already hold a working Blade
setup; build from those. Known issue: Blade's `Amount` logs `window is not defined` during SSR. It
renders correctly; make it client-side if that is cheap, and record it if not.

**Done when:** the page renders at `/`, all 54 rows are present, the console and build are free of
errors, and you have captured a screenshot proving it. Verify with the browser, not by assuming.

### Slice 3 — `feat/investigate-agent`

The `ai_calls` migration (PRD §15.4) plus the Investigate agent and its policy gate (§15.3).

- `ai_calls` columns: batch id, record id, model, prompt version, input tokens, output tokens,
  latency, computed cost, and the verdict the policy gate returned. Generate the migration with
  `npm run db:generate` — never hand-write SQL, never `db:push`.
- Investigate uses `generateObject` with a **Zod enum of exactly the five categories**, so a sixth
  cannot be decoded. Keep the policy gate behind it as defence in depth: anything unrecognised
  becomes `UNEXPLAINED`.
- Model `claude-opus-5`, `effort: "low"`, prompt caching on the system prefix. §9's cost section
  explains why all three.

**There is no `.env` in your environment, so no `DATABASE_URL`.** That is normal, not a failure —
do not try to fix it. Generate the migration with `npm run db:generate` and commit the SQL; do not
run `npm run db:migrate`, it will fail with no connection string. If the Neon connector is working
you may apply the migration through it instead, but generating and committing the file is the part
that matters.

**There is no `ANTHROPIC_API_KEY` either, and that is also intentional.** Build and test
against the AI SDK's mock model. Do not call the real API. Do not ask for a key.

**Done when:** tests cover the happy path, a model answer outside the five categories, and a tool
error — all against mocks — and the migration applies cleanly.

### Slice 4 — `feat/investigate-agent` (same branch)

The §15.2 eval harness: `npm run eval` scores Investigate against `data/synthetic/expected.json` and
prints agreement out of 54 plus every disagreement with both verdicts and the agent's reason.

**Done when:** the script runs end to end against the mock model and prints a well-formed report.
It will be run for real in the morning, once the key exists.

### Slice 5 — stop here

Do not start §15.1 or §15.5. They depend on slices 2 and 3 both being reviewed, and Preet reviews in
the morning. If you reach this point, write that in `docs/HANDOFF.md` and finish.

## Numbers that must never move

| | paise |
|---|---|
| July invoice taxable value | 664945 |
| July invoice tax | 119692 |
| Rollup of matched records | 85587 |
| Rollup delta | 34105 |
| ITC claimable | 98223 |
| ITC at risk | 21469 |
| August invoice tax | 19530 |

30 `EXACT` / 8 `FUZZY` / 5 `TIMING` / 4 `REFUND_NETTED` / 4 `FEE_DEDUCTION` / 3 `PARTIAL_PAYMENT` /
0 `UNEXPLAINED` = 54.

If a change moves any of these, the change is wrong. Not the number.

## Scope you may not expand

`CLAUDE.md` carries the full list and it is loaded for you. The ones most likely to tempt you: five
exception categories only, no sixth; no `confidence` column, because `match_method` is the confidence
tier; the Detect layer is deterministic and never calls an LLM; the Act layer only ever drafts.

## What to leave behind

Whatever happens, `docs/HANDOFF.md` must be accurate when you stop — which slices landed, which
branches are pushed, what you skipped and why, and anything you learned that the next run needs.
Assume you will be cut off without warning. That is what the push-after-every-commit rule is for.
