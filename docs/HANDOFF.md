# Trace — handoff: it is deployed and live; the video remains

Written 2 Sep 2026, late; rewritten 4 Sep after the deploy, and again the same day after the page
chrome landed. **Slices 1 through 9 are done and on `main`** — slice 7 (Act + the human gate +
PRD §15.6) merged on 3 Sep, slice 8 (the domain-fact audit and the 4B2 routing fix) on 4 Sep.
**Slice 10 (page chrome and the first-time-viewer fixes) is merged into `main`.** As of 5 Sep
`feat/visual-identity` is the only branch not in `main`, and `origin/main` is an ancestor of it, so
it merges as a fast forward. Confirm rather than trust this line:
`git branch -a --no-merged origin/main`.

The tree is green on `feat/visual-identity`: **497 tests across 41 files, typecheck, lint,
`npm run build` and `npm run verify:screen`** against a production build at 1680px, 1440px, 390px
and 320px. `verify:screen` now also grades whether the page says what it is, whether the in-page
navigation lands where it claims, and whether the question box clears the contrast WCAG asks of a
control.

**It is deployed and live at https://trace-zeta-three.vercel.app/.** What remains is the **video**.
All three AI layers have their output recorded and committed — 16 investigations, 6 example
answers, 16 drafts — and the Explain layer additionally answers live questions on the deployed
site, verified there on 4 Sep. See "Deployed".

## Read this first

`CLAUDE.md` and the pinned memories load automatically. **Do not re-derive them.** This file only
carries what they don't.

- `docs/PRD.md` — the spec. Read **§9 (architecture)** and **§15 (making the AI legible)** before
  writing agent code. Read **§7 (exception taxonomy)** when you need it. Don't read all of it.
  §15.5 now records how Explain actually ships, including two deviations from §9.
- `docs/BUILD-LOG.md` — 53 entries, each a thing that was wrong while its own tests passed. **Next
  free number is 54**, and **check `grep -o "^## [0-9]*" docs/BUILD-LOG.md | sort -n | uniq -d`
  before you use it**: this line was stale once and two entries got written under numbers that were
  already taken. Read **42** before touching `globals.css` or the type scale, **43** before
  rewriting any prose in bulk, **44** before touching the header navigation, **45** before styling a
  control, **37** before touching the page chrome or the styling setup, **30**
  before touching `scripts/verify-screen.mjs`, **29** before
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

The eval scored **16/16, 100% agreement** with the deterministic verdict on its first real run.

**All three files are recorded and committed:** `investigations.json` (16), `explanations.json`
(6) and `drafts.json` (16). The Act run that produced the drafts was made after the `act-v3` prompt
and gate fix — the earlier run returned `NO_ENTRY` on all sixteen records, which was wrong for the
four `FEE_DEDUCTION` rows carrying the whole ₹214.69 at-risk figure. BUILD-LOG 35 has that
diagnosis. Nothing further needs the key except a live question typed on the deployed site.

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

`main` carries slices 1 through 6: the ingestion layer, the matcher, the audit schema, the
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

## Deployed — https://trace-zeta-three.vercel.app/

**Live since 4 Sep.** GitHub repo `PreetMax85/trace` is public and connected to Vercel, so every
push to `main` redeploys. There is no `.vercel/` directory and no `vercel.json`; Next.js is
auto-detected and the CLI was never needed.

Verified against the deployed site, not locally — these are the paths that cannot be tested from
the laptop, because they depend on a Vercel function reaching Neon and Anthropic:

- All 54 records render; the headline figures are intact (invoice tax ₹1,196.92, claimable
  ₹982.23, at risk ₹214.69, matched 38/54).
- All three prompt versions are on the page: `investigate-v1`, `explain-v1`, `act-v3`.
- **Live Explain works.** A typed question returned `ACCEPTED` with four resolved citations and no
  unknowns, and the panel labelled it `answered live · claude-opus-5 · explain-v1` — distinct from
  the recorded examples' `recorded 2026-09-04 · …`, which is the distinction the panel exists to
  make.
- **The Act gate holds in production.** `pay_qcqeWqwISCOg2K` offers three enabled Confirm buttons
  on a `4B2` reversal; the refused `pay_cOy8OKC0WYS2gq` offers three DISABLED ones and says
  "This draft states ₹28.08, which this record does not carry, so it cannot be confirmed."
- **Confirm writes to Neon.** Clicking one flipped it to "Confirmed" and inserted an `actions` row.
- Zero browser console errors.

Two costs worth knowing before the video: a live answer takes **20–28 seconds** end to end, and the
first request after an idle period pays a cold start on top. Do not cut the recording as though it
returns instantly.

The verification left real rows in the audit tables — 2 `ai_calls` and 1 `actions` row, all from
automated testing on 4 Sep. They are genuine records of genuine calls, so they were left in place
rather than deleted out of an audit trail.

## The first-time-viewer pass — found and fixed 4 Sep

The deployed site was correct and illegible. Every item below passed the whole gate — 430 tests,
typecheck, lint, `verify:screen` — because the gate only ever asked whether the figures were right.
None of it asked what somebody who has never seen this project understands. **All of it is now
fixed on `feat/page-chrome`.** BUILD-LOG 37 carries the full account; this is the shape of it and
what to look at if any of it regresses.

| # | What was wrong | Fixed by |
|---|---|---|
| 1 | 1 to 2s of unstyled HTML on every load: the server sent class names with no rules to match them | fixed at the time; the whole class of bug is now designed out, see BUILD-LOG 40 |
| 2 | The product's name appeared only in the browser tab | `src/app/site-header.tsx`, `site-shell.tsx`, `site-footer.tsx` |
| 3 | No statement of what the screen is or that the data is synthetic | `src/app/orientation.tsx` |
| 4 | At 390px the whole body scrolled sideways (752px document) | `minWidth` on the table column, and `wordBreak` on the trace text |
| 5 | An unknown URL got Next's bare default | `src/app/not-found.tsx` |
| 6 | No `error.tsx`, so a throw fell through to Next's crash screen | `src/app/error.tsx` |
| 7 | A shared link unfurled as plain text | `src/app/opengraph-image.tsx` + `openGraph` metadata |
| 8 | `README.md` had a placeholder for the live URL and omitted the Investigate layer | rewritten |
| 9 | Confirm buttons had no pending state, inviting a second click | `isLoading` in `action-cards.tsx` |
| 10 | `body` kept its 8px user-agent margin, so `100vh` always overflowed | `src/app/global-style.tsx` |
| 11 | `og:image` fell back to `http://localhost:3000` in a production build | fallback order in `src/app/layout.tsx` |

Two things worth knowing before touching any of it:

- **Styles have to be in the server's HTML, and a compiler flag alone does not put them there.**
  This is no longer a live risk: the styles are a static stylesheet the document links, so there is
  no runtime that can fall behind. `verify:screen` still checks it from the raw HTML.
- **The overflow at 390px had two causes, not one.** The table column's `minWidth: 720px` was the
  obvious one. The second only appeared with a flagged row's detail panel open: the reasoning
  trace renders tool inputs and outputs as one unbroken string of ids with no spaces, which set a
  598px floor inside a 310px column. Both are fixed; `wordBreak="break-word"` is the second.

### `verify:screen` now grades legibility too

Seven new assertions, all in `scripts/verify-screen.mjs`: the product name is on the page, the
orientation names GSTR-2B / Razorpay / input tax credit, four layers are listed, the test-data
notice and footer render, an unknown URL gets this project's 404 rather than Next's, the `og:image`
does not point at localhost outside a dev server, and the document is not wider than the viewport at
390px.

**Every one of them has been made to fail on purpose**, by pointing the run at a page without the
orientation, by renaming the header and footer test ids, by reintroducing the localhost fallback,
and — for the styles and the overflow — by the genuine failures that were there before the fix. A
new assertion is not coverage until it has gone red once.

The FOUC assertion fetches the **server's raw HTML**, not the DOM. That is the whole point of it:
by the time a DOM exists the client bundle has injected every rule, so a DOM check passes whether
or not the server sent any CSS.

### How to find the next one, since the tests cannot

The gate checks correctness and will keep passing while a new crop accumulates. What actually
surfaces them is cheap and manual:

- **Open it as somebody who has never seen it.** Does it say what it is, who it is for, and what to
  do first? Read only what is on the screen, not what you know.
- **Break it deliberately.** Visit a URL that does not exist. Resize to 390px. Throttle the network.
  These are one command each and each one found something above.
- **Watch the first two seconds, not the steady state.** Every check we had ran against a settled
  page, which is exactly why the unstyled flash survived all of them.
- **Look at the front doors you do not open.** The README, the browser tab, the unfurled link, the
  404. All of them are somebody's first contact and none of them had ever been looked at.
- **When you add an assertion, check it can fail.** Two of the six above were wrong on the first
  try — see BUILD-LOG 37. A green new test is not evidence until you have seen it go red.

### The second pass, verified 4 Sep. Everything below is now FIXED unless marked otherwise.

All eleven items in the table above were re-checked independently against a production build served
on a fresh port, not against the source. **All eleven hold.** Nine of the new `verify:screen`
assertions were made to fail on purpose by mutating the tree and rebuilding; the tenth (the unstyled
flash) was proved from the server's raw HTML — with the registry removed it carries 47 `sc-` class
names and zero `data-styled` rules, which is exactly the condition the assertion fires on.

Two things the mutation pass established that are worth keeping:

- **The 390px assertion catches the hard cause.** Removing the three `wordBreak="break-word"` props
  and rebuilding turned the document to 630px inside a 390px window and the assertion fired. That is
  the cause that only appears with a flagged row's detail panel open, so the check is measuring the
  page in the state that matters, not a settled empty one.
- **The width floor was the real defect, not the missing `min-width: 0`.** An explicit minimum on
  the table column is what pushed the document past the viewport; the overflow container handles the
  rest on its own. The table now sets its minimum on the table itself and scrolls inside a wrapper,
  so the page cannot be taken sideways with it.

**The findings that pass turned up, worst first. All but two are fixed on `feat/visual-identity`.**

1. ~~**Nothing on this page can be operated by keyboard.**~~ **Fixed.** The one interaction the product has is
   "click any row to see the working". Every `<td>` carries `tabindex="0"` and paints a focus ring,
   so it advertises itself as interactive — but Enter does nothing and Space just scrolls the page.
   A keyboard or screen-reader user gets 324 dead tab stops between the question box and the footer
   and cannot open a single explanation. The row is now the focus stop and carries its own handler.
2. ~~**At 320px the page scrolls sideways again.**~~ **Fixed.** `exception-review.tsx:259` puts `minWidth="320px"`
   on the detail-panel column; with the shell's 16px of page padding that sets a 336px floor inside
   a 320px window. It is the same defect as item 4 in the table above, surviving in the sibling
   column that was never touched. `verify:screen` measures only 390px, so it passes. 320px is the
   width WCAG 1.4.10 (Reflow) is written against, and it is a real iPhone SE.
3. ~~**There is no `<h1>`, and the heading order is scrambled**~~ **Fixed.** — h5, h4, then four h5s, then two h6s.
   The product name in the header is a `<p>`. A screen reader's heading list therefore reads
   "What this screen is / Exception review — July 2026 / ₹1,196.92 / ₹982.23 / ₹214.69 / 38/54",
   four bare numbers with nothing saying what they are.
4. **STILL OPEN, and it is yours to do, not mine.** The repository's own front door is blank. `github.com/PreetMax85/trace` has an empty About
   description, no topics and no licence. The homepage URL is set and the README is good, but the
   one line GitHub shows next to the repo name — and in every search result and link preview of the
   repo — is empty. Following "Source on GitHub" from the site lands there.
5. Smaller, in one list: the 54 Matched/Flagged pills are `role="status"`, so the page declares 54
   live regions; the Open Graph card never says the data is synthetic, though the page itself is
   careful to; `/favicon.ico` and `/robots.txt` both 404; and the Confirm button's pending state is
   visual only — it disables correctly but carries no `aria-busy` and its label does not change.

### The interface rebuild, 4 Sep, on `feat/visual-identity`

The UI layer was replaced. It had been a component library whose theme lived in React state; it is
now Tailwind with shadcn/ui components copied into `src/components/ui`, and the project's own
palette, type scale and composition on top of them. BUILD-LOG 40 carries the measurements that
forced it. The gate is green: 462 tests across 38 files, typecheck, lint, build, and `verify:screen`
against a production build at both 390px and 320px.

**Why, in one line each.** The colour scheme switch took 2.2 to 2.9 seconds because a scheme change
re-rendered every mounted component; the page had 2,631 DOM nodes, 43 of them per table row; and
the library was not producing a distinctive look, so every design decision was a fight with it.

- **The palette is CSS custom properties in `src/app/globals.css`**, selected by a `dark` class on
  `<html>` that the server writes from a cookie. Switching is a class toggle: 39 to 54ms at 4x CPU
  throttle, measured, against 2,225 to 2,889ms before. **Never put the palette back into React
  state.** The first painted byte is already in the right scheme, so there is no flash on a return
  visit, and `verify:screen` asserts that from the raw HTML.
- **The type scale is six named roles and nothing else**: `display`, `section`, `title`, `body`,
  `caption`, and one `mono` size for machine identifiers. They are tokens in `globals.css`, and
  `tests/type-scale.test.ts` fails the build on any inline `text-[...]`. Eight ad-hoc steps were in
  use before, several two pixels apart. **A role's name must never collide with a colour's name.**
  The `title` role was called `card`, collided with shadcn's `--color-card`, and compiled to
  `color: #ffffff` with no size at all: BUILD-LOG 42. The test now compiles the stylesheet and
  asserts what each class actually produces, rather than that the token was declared.
- **Type is two families with a division of labour.** Newsreader sets the headline, the section
  titles and the panel titles; Inter sets every interface surface and every figure, with tabular
  lining numerals on for the whole document; JetBrains Mono is only for identifiers. All three are
  self-hosted through `next/font`.
- **The four stat cards became a statement of reconciliation** (5 Sep). Two amounts, a rule, and
  the difference under it, set in the serif with tabular figures, the way the document it describes
  is set out. The proportional bar survives underneath it as the fastest read of the same fact.
  Its earlier form: They presented a total, its two halves and
  a record count as four peers, so the relationship that matters had to be inferred. The bar draws
  the invoice as its full width, the explained share as the filled part and the shortfall as the
  stub, and the total, both halves and the record count each open their own derivation.
- **The table opens on the 16 flagged rows**, with the 38 matched and all 54 behind tabs. The panel
  now scrolls itself into view when a figure is opened, because clicking a figure at the top of the
  page used to change something a screen further down and read as nothing happening.
- **The table is a plain `<table>`.** The whole row is one click target and one tab stop with its
  own Enter and Space handling, rather than 324 focusable cells on which Enter did nothing.
- **The last section is an accordion with six questions**, written as the ones people actually ask,
  including the two that are admissions: no model touches a figure, and the merchant is invented.
- **Three new guards in `verify:screen`**, each proved by mutation before being believed: the tabs
  open on the 16 flagged rows, the server sends the dark class in the first bytes when the cookie
  asks for it, and there is no scroll container between the sticky detail panel and the body. The
  narrow-viewport check now measures 320px as well as 390px. BUILD-LOG 41 records why the first two
  behavioural versions of the sticky assertion both passed on the bug.
- **Do not put `overflow-hidden` on a section wrapper.** It makes the section a scroll container and
  silently kills the sticky panel inside it, and it masks any width overflow underneath, which is
  how a 731px document passed a 390px assertion for a while.

**Still open after this pass:**

- ~~**The three recorded JSON files still carry em dashes**~~ **Reversed on 5 Sep.** They were left
  verbatim on the reasoning that editing model output makes the provenance line beside it false.
  That reasoning was right about the cost and wrong about the remedy: the dashes were on screen in
  the product's voice, and the same files carried 17 unrendered `\u20b9` escapes, so a drafted
  email told a reader an amount of `\u20b90.00`. Both are now normalised in the files, and every
  provenance line says so in as many words: *"Punctuation normalised; not a word was changed."*
  It had to happen in the FILE rather than at render time, because the Act layer's design is that
  the text shown, the text confirmed and the text stored in `actions.draft` are the same bytes.
  Re-recording from the fixed prompts still needs an API key and costs real calls: `npm run
  explain`, `npm run eval -- --write-traces`, `npm run act`.
- **The repo's GitHub About box is still empty.** Nothing in the code can fix that.
- **`/favicon.ico` and `/robots.txt` still 404.** `icon.svg` covers every browser that matters.
- **The Confirm button's pending state is visual only.** It disables and shows a spinner but carries
  no `aria-busy`, and its label does not change until it is confirmed.
- **`.npmrc` is gone.** It only existed to set `legacy-peer-deps=true` for the old UI package;
  `npm install` now resolves cleanly without it, checked with a dry run.


### The judge pass, 5 Sep, on `feat/visual-identity`

Preet read the page as a Razorpay judge would and found four things wrong on screen, all of which
had passed the entire gate. BUILD-LOG **42** and **43** carry the accounts. (They were written as
38 and 39, which were already taken; renumbered on 5 Sep. Check `grep -o "^## [0-9]*"` for
duplicates before adding one.) What changed:

- **The wordmark was invisible.** `--text-card` collided with shadcn's `--color-card`, so
  `text-card` compiled to `color: #ffffff` and no size. The role is now `title`, and
  `tests/type-scale.test.ts` compiles the stylesheet rather than trusting the declaration. The
  component is still called `CardTitle` while the role it applies is called `title`: renaming it
  would have touched five more files for no behaviour and forced every UI change into one commit.
  The mismatch is deliberate and `src/app/ui/type.tsx` says so.
- **Two console errors on every load.** Base UI's `Button` was rendering the GitHub links, which
  its own docs forbid; they are anchors wearing `buttonVariants` now. The accordion panel had a
  keyframe animation and a transition on the same property; the transition won.
- **The Act layer was invisible.** All three drafts lived behind a table-row click. The page now
  opens on the flagged record with the most tax at stake that has a draft recorded
  (`openingSelection` in `exception-review.tsx`, with `tests/opening-selection.test.ts` pinning the
  tie-break, which was order-dependent when it was written).
- **Colour now marks provenance, and this is the design rule to keep.** Ink is arithmetic, indigo
  is anything a model wrote, green and red are the verdict on money and nothing else. `Section`
  takes `tone="agent"`, the detail panel and the Ask section use it, and the hero states the key in
  two lines. It is the page's honesty claim drawn rather than asserted, so **do not spend indigo on
  decoration.**
- **The hero says what the thing is, beside the finding.** Four layers, compact, top right
  (`hero-orientation`). The full account stays at the foot of the page and the `layer-strip` testid
  stays with it; `verify:screen` counts four layers there.
- **Three rows showed "No rate matches" in red against a ₹0.00 fee.** Correct data reading as a
  broken matcher. They say "No fee charged" now, and a matched rate still wins over that label.

**Left open after this pass, and since resolved:**

- **The dark-mode black flash could not be reproduced** (class toggle 0.2ms synchronously, worst
  frame 47ms in headless Chromium). It stopped mattering on 5 Sep: Preet asked for dark mode to be
  removed outright, so there is no longer a switch to flash. See the section below.
- **The three ₹0.00 partial-payment records are genuinely all-zero in the fixture** (amount, fee and
  tax). That is deliberate per PRD §13. The row copy now explains it; the data is not the problem.


### One scheme, three jump links, and the drafts out in the open. 5 Sep, on `feat/visual-identity`

Preet's second read of the page. BUILD-LOG **44** and **45** carry the two defects that had a
guard added; the rest were design decisions, not breakages.

- **Dark mode is gone, on Preet's instruction, and should not come back without him asking.**
  `theme-toggle.tsx` and `color-scheme.ts` are deleted, the `.dark` block and `@custom-variant` are
  out of `globals.css`, and 27 `dark:` variants are stripped from four `components/ui` files. The
  real prize was in `layout.tsx`: reading the scheme cookie is what forced `/` to render
  dynamically, so the whole route is **static** again and the fixture is no longer parsed, matched
  and classified once per request. If anything reintroduces a second scheme, that cost comes back
  with it.
- **Three jump links in the header**, built from `src/app/sections.ts`, which is the single source
  for the id, the label and the scroll margin. The header and the footer both map that list; both
  are asserted not to hardcode an anchor. Scrolling is a plain anchor plus `scroll-behavior: smooth`
  in CSS, so the links work before the bundle boots and the existing reduced-motion block turns the
  glide into a jump for anyone who asked for less movement. `site-nav.tsx` holds only the mark for
  the current section. **NN/g advises against jump links in a nav bar** because people expect a nav
  bar to load another page; it is safe here only because Trace has no other page, so if a second
  route is ever added, revisit this.
- **The Ask section is now "Ask a question" and the FAQ is its own section.** Both renames exist to
  satisfy one rule: a jump link must be labelled with the heading it lands on, or the reader cannot
  tell the jump worked. `tests/sections.test.ts` enforces it.
- **The drafted actions moved out of the detail panel into a full-width band** (`next-action`).
  Measured at 1440x900: the panel was 2192px against a 1166px table, so a full screenful of blank
  paper sat beside the one part of the product that writes anything. It is 1067px now, 99px from the
  table. The three drafts sit in three columns, all open, with the CA email in the wider one.
  `verify:screen` looks for the cards inside `next-action` rather than inside `detail-panel`.
- **The band survives a figure click.** `actionRecordId` is held separately from `selection` in
  `exception-review.tsx` precisely so that opening a headline figure does not make a whole section
  vanish under the reader. A matched row gets the section saying there is nothing to do rather than
  no section at all.
- **The colour key is drawn, not described.** It was two sentences in the right-hand card, one of
  which read "Indigo is where a model spoke". It is now two swatches with labels, under the
  reconciliation where the colours are, and moving it is also what brought the right-hand card back
  above the fold: 654px to 523px, and the cut-off lines Preet photographed were the legend.
- **The question box is filled, outlined and 44px tall.** It measured 1.15:1 against the indigo
  ground, under the 3:1 WCAG 2.2 asks of a control's boundary. It is 3.72:1 now and `verify:screen`
  measures it on every run.
- **The footer carries the page's own provenance**: the model and the three prompt versions,
  imported from the constants the runs are recorded under so the line cannot drift, plus the
  merchant GSTIN which used to sit in the header. A fintech footer is normally a compliance
  instrument, licence numbers and FDIC and SOC 2, and Trace has none of those, so **do not add
  trust badges here.** Borrowing that pattern would mean inventing marks on a page whose argument
  is that every claim can be checked. *(Superseded on 5 Sep, see below. The instruction not to add
  trust badges still stands.)*

**Still open:**

- **The live-question budget is per server process.** `EXPLAIN_MAX_QUESTIONS` defaults to 40 and
  `createQuestionBudget` holds the count in module scope, so on Vercel every cold instance gets its
  own 40 and the real ceiling for a public link is unbounded. The Anthropic account's spending limit
  is the only hard stop. Not fixed, and it is the one thing here that could cost money.
- **The footer does not name the buildathon or the track.** That was a judgement call against
  Preet's standing preference not to write anything that reads as playing to an evaluator. If he
  wants it, it goes in the block beside the disclaimer.


### Plain words, and three bugs a person found before any test did. 5 Sep, on `feat/visual-identity`

Preet went through the built page and reported what was wrong with it. Most of it was one problem
wearing different clothes: the page explained itself in the vocabulary of the people who built it.
"we have to use easy wordings at least on our hero sections so a random person coming could
understand that but we have just used buzz words and all of that no?"

- **No model or prompt provenance anywhere a reader meets by default.** The caption under the
  drafted actions ("Drafted by claude-opus-5 ... Punctuation normalised; not a word was changed"),
  the footer's provenance bar, the recorded answer's fold-away, and the merchant GSTIN are all
  gone, on instruction, and the instruction was general: "plus specific such wordings from
  everywhere". **Do not put a model id, a prompt version, a recording date or a normalisation note
  back on a screen.** What survives is the collapsed "How this was produced" disclosure inside a
  record's detail panel, which is the audit trail and is opened deliberately. The answer panel now
  says only "Answered just now" or "Answered earlier and saved", which is the one part of the old
  provenance a reader could act on.
- **Plain language first, the official term second.** The headline was "₹214.69 of input tax credit
  has nothing to explain it", which is unreadable to anyone who does not already know what input
  tax credit is. The rule now followed across the hero, the four section descriptions and the
  footer comes from the IRS Direct File content style guide: ordinary words first, and the term of
  art introduced afterwards once the reader has something to attach it to. Their research is the
  reason it matters, and it is not that people ask: they skim past a term they do not know and
  conclude it does not apply to them.
- **The footer is now the plain-English version of the whole product.** Three sentences, no term of
  art in any of them, beside the only place on the page the name is set as type rather than drawn
  as a mark. The "The work" column (source, spec, build log) was removed entirely on instruction;
  the GitHub mark in the header is the remaining route to the repository. *(Superseded twice on the
  same day and then deleted, see the section below. The GitHub mark is still the only route to the
  repository.)*
- **Three defects a person found and no test could see**, all written up in BUILD-LOG 46 to 48
  with the guard each one now has: the drafted-action cards stretching to a shared height, the
  answer being flattened into one paragraph, and `#reconciliation` having no scroll margin.

**Still open after this pass:**

- ~~**The FAQ section has an empty right half.**~~ **Closed on 5 Sep.** The accordion runs the full
  width of its card now. A question is one short line, so the reading measure it was capped at was
  buying nothing and leaving a third of the section blank; only the answer keeps a measure.
- **The hero's right-hand card is about 200px shorter than the left column**, so there is some
  dead space beside the colour key. Down from a 1026px difference before the drafts moved out of
  the sidebar, and not worth filling with something invented.


### Bigger type, structured answers, and no footer at all. 5 Sep, on `feat/visual-identity`

Preet's third read of the page. BUILD-LOG **49**, **50** and **51** carry the accounts.

- **The type scale is a third larger at every prose step**: body 15, card and header 20, section
  headings 30, the headline on a 40 to 64px clamp. The old steps were internally consistent and too
  compressed to read as a hierarchy. The reasoning is written above the tokens in `globals.css`;
  **do not compress them back to save vertical space.**
- **The type scale is declared in two places and both are load-bearing**: the tokens in
  `globals.css`, and the `font-size` group in the `cn` built in `src/lib/utils.ts`. Class merging
  decides a `text-*` conflict from the NAME, so a role it has not been told about is filed as a
  colour and evicts the real one. That is BUILD-LOG 53, and it painted the Confirm buttons black
  on indigo. **Adding a role means adding it in both places**, and every component imports `cn`
  from `@/lib/utils`, never from the package.
- **No component may ship a size of Tailwind's own.** Every `text-sm`, `text-xs` and `text-base` in
  `src/components/ui` is a role now, and `tests/type-scale.test.ts` fails the build if one comes
  back, in `src/app` or in `src/components`. There is exactly one exemption and it is named in the
  test: the question box keeps 16px up to `md`, because a field below 16px makes iOS zoom the page
  on focus. Add an exemption only with a reason written beside it.
- **The open example question is a filled indigo chip.** It was `secondary`, a warm grey, on the
  panel's pale indigo ground: two colours a few percent apart, so nothing looked selected.
- **The Explain prompt now says how to lay an answer out**, and the six recorded answers were
  re-laid to match. No word was changed and no figure was touched; the edits are inserted line
  breaks plus three inline `(1)` markers moved to the front of their lines. Two of the six had no
  line break in them at all, which is why one answer rendered as a list and five as prose.
- **There is no footer, and one should not be added back.** A version carrying the whole product
  name across a navy band was built and then removed the same day on Preet's instruction: "remove
  the footer completely, I don't like it." `site-footer.tsx` is deleted, along with the
  `--text-wordmark` role and the `--ink` palette that existed only for it. Everything a footer
  would carry is said earlier, where a reader meets it in time to use it: what Trace does is the
  first screen, that nothing is ever sent or filed is beside every Confirm button, that the
  merchant is invented is stated above the table and again in the FAQ, and the three jump links
  are in a header that never leaves the screen.
- **Removing it broke the header's navigation mark, and BUILD-LOG 52 is the account.** The footer
  was 624px of document that the scroll-spy had been depending on: without it the last section
  can never be scrolled high enough to cross the spy's band, so clicking FAQ marked "How Trace
  works". The spy now answers the end of the document separately from the band. **If anything
  ever adds or removes a large block at the bottom of the page, re-run `verify:screen` and read
  the in-page navigation line.**
- **The interactive indigo is one step lighter**, `#4f46e5` rather than `#4338ca`, because the
  Confirm buttons read as heavy navy blocks against the pale indigo card behind them. `brand.ts`
  and `icon.svg` carry the same value, so the mark, the favicon and the buttons cannot drift
  apart. White on it measures 6.3:1. The question box's border was widened from `/70` to `/85` to
  hold its own contrast, which `verify:screen` measures on every run: it is 4.27:1, against the
  3:1 WCAG asks for a control's boundary.

**Still open after this pass:**

- **The live-question budget is still per server process** (see the previous section). Unchanged
  and still the one thing here that could cost money.
- **The hero's right-hand card is about 200px shorter than the left column.** Unchanged, and still
  not worth filling with something invented.


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
| 9 | Deploy to Vercel | — | **done, live** (4 Sep) |
| 10 | Page chrome + the first-time-viewer fixes | `feat/page-chrome` | **done, merged into `main`** (4 Sep) |
| 11 | Interface rebuild: Tailwind and shadcn, our own palette, type scale and composition | `feat/visual-identity` | **done, awaiting merge** (4 Sep) |
| 12 | Video | — | not started |

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
- Vercel carries exactly three variables: `DATABASE_URL` (the POOLED string), `ANTHROPIC_API_KEY`
  and `EXPLAIN_MAX_QUESTIONS=15`. The import screen pre-fills the `RAZORPAY_*` keys from
  `.env.example`; they were removed, because nothing in `src/` reads them — they are dev-time
  only and `RAZORPAY_MCP_TOKEN` is consumed by `.mcp.json` on the laptop.
- `EXPLAIN_MAX_QUESTIONS` is 15 rather than the default 40 because the cap is per server
  PROCESS and Vercel may run several. A live answer costs a measured **$0.042**, so 15 × three
  instances is about $1.89 — inside the prepaid balance, which cannot overdraw.

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
- **Money is formatted in one place with a pinned locale.** Anything that formats through the
  viewer's browser locale renders an audit figure differently per viewer. Use
  `src/lib/format/money.ts`.
- **A row click has to be verified in a real browser.** BUILD-LOG 28 is an afternoon lost to a
  handler that typechecked, was passed, and was never called. `verify:screen` dispatches a genuine
  mouse event at the row's coordinates for exactly this reason.
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
- **The interface needs no connector at all.** Every component the page uses has its source in
  `src/components/ui`, so read the file; `npx shadcn@latest docs <component>` prints the API
  offline. The design tokens are all in `src/app/globals.css`. Note the components are built on Base
  UI, not Radix: a trigger takes a `render` prop rather than `asChild`, and a tab panel unmounts
  when it is not active, which is what keeps the mounted tree small.
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
- **`docs/NEXT-TASK.md` carries two stale numbers** — it expects 195 passing tests (there are 430)
  and says the next BUILD-LOG number is 28 (it is 38). A scheduled run reading it halts at
  preflight. The file says "Do not edit it", so it has been left alone; it needs Preet's say-so.
- **`bakeAnswers` in the Explain layer still has the missing-retry gap `bakeDrafts` had.** Known,
  deliberately not fixed — nothing needs to re-run it before the deadline.
- **A stale `next start` may be holding port 3000.** It keeps answering with whatever build was on
  disk when it started, so `verify:screen` against `localhost:3000` can grade the wrong tree. The
  script's build-id check catches this and says so; run on another port rather than killing it.
- Preet is not fluent in GST. Gloss every tax term in one or two sentences as it comes up, and say
  what was left out. Both are pinned memories; repeated here because they matter more than anything
  else in this file.
