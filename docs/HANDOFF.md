# Trace — handoff: the Act layer is built; deploy and the video remain

Written 2 Sep 2026, late. **Slices 1 through 7 are done.** Slices 1–6 are on `main` (slice 6 was
fast-forwarded in on 2 Sep); slice 7 (Act + the human gate + PRD §15.6) is on **`feat/act-layer`**.

The tree is green: **411 tests, typecheck, lint, `npm run build` and `npm run verify:screen`**.

What remains is **deploy and the video**. The Explain layer no longer needs a key to
be *visible* — six example answers are recorded and committed — but it does need one to be
answered *live*, and no run has recorded them yet, so the file is still `[]`. See "What the key
buys now".

## Read this first

`CLAUDE.md` and the pinned memories load automatically. **Do not re-derive them.** This file only
carries what they don't.

- `docs/PRD.md` — the spec. Read **§9 (architecture)** and **§15 (making the AI legible)** before
  writing agent code. Read **§7 (exception taxonomy)** when you need it. Don't read all of it.
  §15.5 now records how Explain actually ships, including two deviations from §9.
- `docs/BUILD-LOG.md` — 36 entries, each a thing that was wrong while its own tests passed. **Next
  free number is 37.** Read **30** before touching `scripts/verify-screen.mjs`, **29** before
  touching anything model-provider-shaped, **28** before touching the table, **27** for how a
  passing test can be aimed at the wrong thing.
- `docs/NEXT-TASK.md` — the routine briefing: preflight, banned commands, the per-slice loop.

## Deadline

Applications close **5 September 2026**. Razorpay publishes no closing *time* or timezone, so treat
**end of 4 September** as the deadline. That leaves 3 and 4 September.

## What the key buys now

`ANTHROPIC_API_KEY` is **set** as of 3 Sep, with a $5 console limit. About **$1.30 has been
spent**; the one run still owed (`npm run act`) is another ~$0.45.

| Layer | Built? | When the key is needed |
|---|---|---|
| **Detect / matcher** | yes | never — deterministic by design, no LLM, ever |
| **Investigate** (+ §15.1 trace) | yes | **once**, to generate `data/synthetic/investigations.json`. Static afterwards. |
| **Explain** (+ §15.5 citations) | yes | **once** for the six example answers (`npm run explain`), then **at runtime** only for a question a person types |
| **Act** (+ §15.6 figure gate) | yes | **once**, to generate `data/synthetic/drafts.json` (`npm run act`). Static afterwards — there is no live Act route by design. |

**`investigations.json` (16 traces) and `explanations.json` (6 answers) were recorded on 3 Sep and
are committed.** The eval scored **16/16, 100% agreement** with the deterministic verdict on its
first real run.

**`drafts.json` is still `[]`, and that is deliberate.** The first `npm run act --dry` returned
`NO_ENTRY` on all sixteen records — wrong for the four `FEE_DEDUCTION` rows, which carry the whole
₹214.69 at-risk figure. BUILD-LOG 35 has the diagnosis. The prompt and gate were fixed on 4 Sep
(`ACT_PROMPT_VERSION` is now `act-v3`), and **`npm run act` has not been re-run since.** Until it
is, the action cards correctly say no action has been drafted rather than showing three empty
shells. One record, `pay_aCKSAMew6U0eQ6`, also came back FAILED in that run and has not been
diagnosed; the bake refuses to write a partial file, so it must succeed before anything lands.

### The two runs to make the moment the key lands

```
npm run eval -- --limit=2          # ~4 cents, smoke test
npm run eval -- --write-traces     # ~$0.25–0.30, fills investigations.json (§15.1)
npm run explain -- --dry           # prints the six answers, writes nothing
npm run explain                    # ~2 cents, fills explanations.json (§15.5)
npm run act -- --dry               # prints 16 records' drafts, writes nothing
npm run act                        # ~45 cents, fills drafts.json (§15.6)
```

`npm run act` is the most expensive of the three: 16 records, three drafts each, and more output
per call than either other layer. It refuses to overwrite the file if any record produced no draft,
for the same reason `npm run explain` does.

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

### Migrations

`drizzle/0003_cuddly_korath.sql` adds `INVALID_FIGURE` to the `ai_call_verdict` enum for slice 7 and
**has not been applied yet — run `npm run db:migrate`.** Nothing at runtime writes that value today
(the bake does not touch Postgres, and Confirm writes `actions`, not `ai_calls`), so the app works
without it; the schema and the database must not be left drifting apart regardless.

`drizzle/0002_red_white_tiger.sql` adds `INVALID_CITATION` to the same enum. **Preet
ran `npm run db:migrate` on 2 Sep.** It is a distinct verdict from `FAILED` for the same reason
`COERCED_UNEXPLAINED` is: an answer that invented a record id is a prompt problem, and a call that
returned nothing is an infrastructure one.


## Slice 7 — Act, so it is not rebuilt

- **`src/lib/act/figures.ts`** — `recordFigures` is the closed set of amounts a draft about one
  record may state; `bindFigures` resolves every `₹` figure in the prose against it. A rupee amount
  with anything but two decimal places is refused rather than rounded — `₹23.6` read as the
  record's `₹23.60` is the exact drift this exists to catch. `feeNet` (fee less the GST inside it)
  is in the set because a Tally voucher cannot be written without it.
- **`src/lib/act/policy.ts`** — the gate. Prose figures AND the structured `amountPaise` fields are
  checked against the same set, so it cannot police the email while trusting the number that goes on
  a return. Double entry is checked in **both** directions (BUILD-LOG 31). The GSTR-3B flag's row and
  its action are checked against each other on the same principle — each row admits exactly one
  action, so the pair is deliberately redundant and a draft that disagrees with itself is refused
  (BUILD-LOG 33). A refused draft is KEPT and shown; it just cannot be confirmed.
- **`src/lib/act/schema.ts`** — the GSTR-3B vocabulary, and the one part of this slice that was
  rebuilt after it was first written. A flag may point at `4B1`, `4B2`, `4D1` or `4D2` — the rows a
  person still fills in by hand — or at **no row at all**, paired with `NO_ENTRY`, which is the
  honest answer for a `TIMING` credit that lands on the following month's GSTR-2B. Row `4A5` is
  deliberately **absent**: it has been auto-populated from GSTR-2B since the October 2025 tax period
  (CBIC Notification 16/2025), so a draft asking a merchant to edit it would be advising an action
  the form does not offer. Read BUILD-LOG 33 before touching this — including the part about which
  claim was verified and which was not.
- **`src/lib/act/prompt.ts`** — the prompt is rendered from the SAME `recordFigures` call the gate
  allows from, and `tests/act-prompt.test.ts` asserts that property directly. If the two are ever
  widened separately, that test fails rather than the model being blamed for a figure its own
  instructions gave it.
- **`src/lib/act/act.ts`** — the call site. **Act holds no tools at all**, so the boundary is a
  prohibition rather than an allowlist and `unauthorisedActTools` refuses everything. Checked before
  the model is called. Builds the `ai_calls` row without writing it, as the other two layers do.
- **`src/lib/act/library.ts`** — a recorded draft stores a **fingerprint of the record's figures**,
  not just its id, so a record whose fee moves drops its draft instead of showing a stale amount.
- **`src/lib/act/confirm.ts`** — `confirmable()` is the server-side rule, and it hands back the
  draft it checked so the caller cannot look up a different one. `draftForKind` stores ONE action in
  `actions.draft`, never all three.
- **`src/lib/audit/persist.ts`** — `ensureBatchWithRecords`, shared by both routes. Writes the batch
  and all 54 record rows in one transaction, and backfills records for a batch that has none.
  BUILD-LOG 32 is why.
- **`src/app/api/actions/confirm/route.ts`** — the human gate. Confirming twice returns the existing
  row rather than recording a second approval of one decision.
- **`src/app/action-cards.tsx`** — three cards per flagged row. A gated draft shows its warning and
  every Confirm button is disabled; `verify:screen` asserts those two as a **biconditional**, so
  neither half can pass alone.

`npm run verify:screen` first asserts the server is answering with the build now on disk, because
a run that grades a stale server turns "not verified" into "verified" — BUILD-LOG 34. It then covers
the cards in **two branches and prints which one it took**. Both were
exercised by installing a fixture `drafts.json` — the empty branch, the accepted branch and the
gated branch — because an empty file would otherwise make every card assertion pass vacuously. That
is the lesson of BUILD-LOG 30, applied deliberately this time rather than after the fact.

**The GSTR-3B vocabulary was re-verified in a real browser on 3 Sep**, on a fixture carrying all
four shapes: an accepted flag on a row, an accepted `NO_ENTRY` with no row, a draft stating an
invented figure, and a draft whose row and action disagree. The last two were refused by the server
with `409` and their own reasons, and every Confirm button was disabled. The locked figures were
re-read afterwards and had not moved: period `072026`, 54 records, 16 flagged, `itc_at_risk_paise`
**21469**.

**The write path was verified end to end in a real browser on 2 Sep**: clicking Confirm wrote one
`batches` row (`total_records` 54, `itc_at_risk_paise` 21469), 54 `records` rows and one `actions`
row holding only the confirmed email. The synthetic `actions` row was deleted afterwards and
`drafts.json` restored to `[]`; the `batches` and `records` rows were left, because they are exactly
what a real run writes.

## State of the tree

**Check `git log -3` and `git ls-remote --heads origin` before trusting this section** — it is the
part that goes stale first.

`main` carries slices 1 through 6: the ingestion layer, the matcher, the audit schema, Blade, the
Vercel AI SDK, Zod, Playwright's Chromium, the exception review screen, the Investigate agent and
policy gate, the `npm run eval` harness, the §15.1 reasoning trace, and the Explain layer with its
§15.5 citation gate.

**`feat/eval-harness`, `feat/exception-review-screen`, `fix/matcher-edge-cases` and
`feat/explain-layer` are all contained in `main`.** Slice 6 fast-forwarded in on 2 Sep.

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
| 6 | Explain layer + §15.5 citations | `feat/explain-layer` | **done, merged into `main`** |
| 7 | Act layer + human gate + §15.6 | `feat/act-layer` | **done, merged into `main`** (3 Sep) |
| 8 | Domain-fact audit + the routing fix | `chore/domain-fact-audit` | **done** (4 Sep) |
| 9 | Deploy + video | — | not started |

## Commands

`npm run dev` · `build` · `typecheck` · `test` · `lint` · `verify:screen` · `db:*` — see
`CLAUDE.md`. Two that are specific to the AI layers:

- `npm run eval` — scores Investigate against `data/synthetic/expected.json` (§15.2).
  `-- --write-traces` also fills `investigations.json` for the §15.1 panel.
- `npm run explain` — records the six example answers into `explanations.json` (§15.5).
  `-- --dry` prints without writing.
- `npm run act` — records the three drafted actions for each of the 16 flagged records into
  `drafts.json` (§15.6). `-- --dry` prints without writing. **Costs ~$0.45, not the ~$0.15–0.20
  this file used to claim.** Measured 3 Sep on a dry run: 46,528 input / 15,037 output tokens.

All three refuse to run without `ANTHROPIC_API_KEY` and say why. None of them writes to Postgres.

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
3 `PARTIAL_PAYMENT` / 0 `UNEXPLAINED` = 54. Re-verified on 2 Sep after slice 7; all unmoved. The
16 exceptions are exactly what `npm run act` drafts for.

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
- **Act holds no tools, and does not run live.** Both are deliberate and both are argued in PRD
  §15.6. Drafts are recorded once by `npm run act` because a draft is a document a person confirms:
  what is shown, what is approved and what is stored have to be the same bytes.
- **A refused draft is shown, not hidden.** The figure gate disables Confirm; it does not delete the
  draft. A person needs to see what was written in order to assess it.
- **`actions` rows exist only after a click.** No row is written unconfirmed — see §15.6 for why
  that is stronger than §9's literal wording, not weaker.
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

## Open decisions — pick these up next

Not bugs. Each is a judgement call that was deferred deliberately, with enough here to resume cold.

0. **`bakeAnswers` (Explain) has no retry, and `bakeDrafts` (Act) now does.** BUILD-LOG 36: one or
   two calls in every sixteen fail transiently, a different one each time, and pacing does not
   help. `runEval` has retried since slice 4; the two later bakes never picked it up. Act was
   fixed on 4 Sep. Explain was NOT, because `explanations.json` is already recorded and clean and
   re-running it costs money for no gain. If Explain ever has to be re-baked, port the retry first
   — it is about ten lines, and `tests/act-bake.test.ts` has the tests to copy.

1. **The Tally entry posts one "Input GST" ledger, not a CGST/SGST split.** A real Indian ledger
   usually carries the two halves separately. One ledger was chosen because splitting means picking
   a rounding rule for the half-paise, and inventing a statutory rounding rule is worse than not
   splitting. Revisit only with a source for the rule; the voucher balances either way.
2. **UNVERIFIED — do not act on this without a source.** The claim that real GSTR-2B JSON carries
   an `imsStatus` field could NOT be confirmed on 4 Sep; GSTN's schema sits behind
   `developer.gstsystem.co.in`, which needs credentials, and no third-party GSP doc surfaces the
   name. What IS confirmed from the IMS advisory is behavioural, not structural: rejected records
   form an "ITC Rejected" section of GSTR-2B, and IMS action decides what reaches 2B at all. Do
   not add a field to the fixture on a name nobody can source — inventing schema is how
   BUILD-LOG 1 happened. Original wording follows.

   **Real GSTR-2B JSON may carry an `imsStatus` field that our fixture and `Gstr2bStatement` type do
   not.** It records what the merchant did to the invoice in the Invoice Management System — accept,
   reject or leave pending — and since October 2025 that action is what decides whether the credit
   reaches GSTR-2B at all. Nothing breaks today, because the parser ignores unknown fields. But the
   fixture claims to be a faithful 2B and currently is not.
3. **The July 2026 locking of GSTR-3B Table 4 has no traceable instrument.** Widely reported, never
   notified as far as could be found — see BUILD-LOG 33. Nothing in the code depends on it. If an
   advisory does appear, the vocabulary already survives it; only the wording in the docs would need
   a line.
4. **The domain-fact audit has been run — 4 Sep. Do not re-run it.** All six claims in the
   `NEXT-TASK.md` table were chased through two separate questions: what instrument established
   this, and has anything superseded it. A seventh was added when the first real `npm run act`
   returned `NO_ENTRY` on every record. Results:

   | Claim | Rests on | Verdict |
   |---|---|---|
   | GSTR-3B row for an at-risk fee | **Circular 170/02/2022-GST, 6 Jul 2022** | code was WRONG — fixed, BUILD-LOG 35 |
   | GSTR-2B is final once generated | **GSTN revised IMS advisory** | premise WRONG — see below |
   | Section 34 credit note | **s.34(2) as amended, in force 1 Oct 2025** | moved; we survive |
   | Section 16(4) time bar | s.16(4); 16(5)/(6) cover FY2017–21 only | correct, unchanged |
   | Fee is inclusive of its GST | **Razorpay API reference** | correct, now sourced |
   | Razorpay 2% / 2.15% | razorpay.com/pricing — a company page, not an instrument | matches |
   | Real 2B carries `imsStatus` | **nothing** | UNVERIFIED — see item 2 |

   Two things follow that are not yet done, both docs-only:

   **GSTR-2B is a DRAFT, not a final statement.** GSTN's IMS advisory: a draft 2B is generated on
   the 14th, the recipient may accept/reject/keep-pending "even after generation of GSTR-2B till
   the filing of GSTR-3B", must click Recompute if they act after the 14th, and 2B is sequential —
   a period's 2B is not generated until the previous period's GSTR-3B is filed. PRD §5 still
   describes 2B as static and final. Nothing in the code depends on it and no number moves; the
   fixture's `gendt` is already `14-08-2026`, which is the draft date. This makes the product's
   position STRONGER, not weaker: the window between the 14th and the filing of GSTR-3B is exactly
   when a merchant can still act, and that is the window Trace works in. Worth a paragraph in
   PRD §5 and one line wherever the product is described.

   **Section 34(2) gained a condition on 1 October 2025** (Finance Act 2025): a supplier may not
   reduce output tax via a credit note unless the RECIPIENT has reversed the corresponding ITC.
   The settled position — a netted refund raises a Section 34 credit note, not an ITC reversal —
   is still right, and `REFUND_NETTED` correctly maps to no GSTR-3B row, because the merchant's
   credit note is its own OUTWARD document and lands in Table 3. But the position is now
   incomplete and PRD §7 should say so in a sentence.

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
