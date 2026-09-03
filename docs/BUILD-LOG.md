# Build log — challenges, breakages, and what changed

Raw material for the buildathon submission question *"What issues did you face while building,
and how did you solve them? What broke at 2AM, what you did about it, and how you got out."*

**This file is notes, not prose.** The Google Form answer and the video script get generated
from it at the end. Don't write pitch copy here — capturing the incident accurately is the job,
and phrasing it is a separate job done once, later, when the shape of the video is known.

**Format — five fields, every time:**

1. **Believed** — what we thought was true
2. **Broke** — what was actually true
3. **Caught by** — the specific thing that surfaced it
4. **Would have cost** — what ships broken if we miss it
5. **Permanently changed** — the test, comment, or rule that makes the class of bug impossible

Field 5 is not optional. Failure plus a guard reads as rigor; failure alone reads as sloppiness.

---

## 1. Two days of spec written against the wrong government form

**Believed.** The GSTR-2B JSON schema documented in PRD §5 was correct, and the synthetic
fixture built from it was valid input.

**Broke.** It was the **GSTR-2A** schema. Different statement, different form, different field
names throughout: `flprdr1`/`fldtr1` instead of `supprd`/`supfildt`, nested `itms`→`itm_det`
instead of flat `items`, `camt`/`samt`/`iamt` instead of `cgst`/`sgst`/`igst`. GSTR-2A is the
older dynamic ledger; GSTR-2B is the static monthly ITC statement that a merchant actually files
against. The entire input format was a different document.

**Caught by.** A documentation-first verification pass against GSTN's published schema, run
because a run of unrelated corrections had eroded confidence in the PRD generally — not because
anything failed.

**Would have cost.** The whole product parses an input format that does not exist. Every demo
claim about "matching against GSTR-2B" would have been false, and anyone who works in GST
would have spotted it in the first screen.

**Permanently changed.** Fixture rebuilt against the verified 2B envelope (`docdata.b2b` root,
`itcavl`/`rsn` present, per-period statements). `CLAUDE.md` now carries an explicit
*"GSTR-2B is NOT GSTR-2A"* rule listing the 2A field names so the substitution can't recur.
Caught **before** the first fixture commit, deliberately — so the wrong format never entered git
history at all. First and only fixture commit `04da72e` is correct from birth.

---

## 2. Two rate cells that were mathematically indistinguishable

**Believed.** Matching a settlement fee against Razorpay's published rate cards within ₹1
uniquely identifies which card was billed.

**Broke.** `STANDARD` (2%) and `CORPORATE` (2.15%) are 0.15 percentage points apart. Below a
transaction value of about **₹564.98**, the two expected fees differ by *less than the ₹1
tolerance* — so a fee satisfies both cells at once. Two records in the dataset (₹450 and ₹550)
resolved to both, and which one won depended on the iteration order of the rate-cell object.

**Caught by.** A deliberate adversarial pass **after the tests were already green**. The
generator and the test shared one unexamined assumption, so a passing suite proved nothing.

**Would have cost.** The demo's headline number — "30 exact, 8 fuzzy, 70.4%" — would have been
nondeterministic. Re-running the same data could produce a different match rate on stage.

**Permanently changed.** Amounts moved above the floor (66500 / 78500 paise). Guard test at
`tests/fixtures.test.ts:209` asserts no record resolves to more than one cell. PRD §6 documents
the floor and requires the matcher to report ambiguity rather than silently take the first hit.

> **Corrected later — see entry 10.** The ₹564.98 figure above is wrong (the real boundary is
> ₹572.32), and more importantly the whole "floor" framing is the wrong shape. The guard test
> asserting one cell per record was right; the number written beside it was not.

---

## 3. An exception category that would have matched exactly zero records

**Believed.** A netted refund could be tied back to its original payment by joining refund rows
to payment rows on `settlement_id`.

**Broke.** A refund is deducted from a **later** settlement cycle than the payment it reverses.
It almost never shares a settlement ID with that payment. The rule would have found 0 of 4.

**Caught by.** The same adversarial pass as #2.

**Would have cost.** `REFUND_NETTED` silently returning nothing — and it would have looked
*correct*, because the fixture would have been generated under the same wrong assumption. A
whole category of the taxonomy, dead on arrival, with green tests over it.

**Permanently changed.** Join key is `payment_id`. PRD §7 states **"Do not join on
`settlement_id`"** with the reason. Guard test at `tests/fixtures.test.ts:263` asserts every
refund settles strictly later than the payment it reverses, "so nobody simplifies it back."

---

## 4. Wrong section of the CGST Act — and the flag pointed the wrong way

**Believed.** A netted refund creates an **ITC reversal** obligation under **Section 41**, and
the record should be flagged for reversal review.

**Broke.** Two separate errors stacked.

- Section 41 was **substituted on 1 October 2022** and now reads "Availment of ITC" — the
  reversal machinery it used to carry has moved elsewhere.
- More seriously, the obligation ran in the **opposite direction**. Razorpay does not refund its
  MDR when a transaction is refunded, so the GST on that fee **remains claimable**. There is
  nothing to reverse. What the merchant actually owes is a **credit note to their own customer
  under Section 34**, due by 30 November following the end of that financial year.

**Caught by.** User-supplied research, then verified against CBIC — which found that the
supplied research had itself conflated the output-side and input-side credit notes, and that the
original flag was backwards.

**Would have cost.** A compliance tool instructing a CA to reverse input credit they are legally
entitled to keep. Wrong in the direction that takes money away from the user, and wrong in a way
the user is trusting the tool to get right.

**Permanently changed.** Column renamed `itc_reversal_review` → `credit_note_review`. The
schema comment states the reasoning and the deadline inline. Guard test asserts exactly the four
refunded records carry the flag and that nothing else does.

---

## 5. Two fabricated statistics in the problem statement

**Believed.** PRD §1 opened with "a CA Club India survey (Dec 2025) found GSTR-2B reconciliation
takes 5-20 hours per merchant per month" and "manual VLOOKUP matching achieves 51% accuracy."

**Broke.** The CAClubIndia thread exists — but it is dated **31 March 2026**, is a **seven-reply
forum discussion** rather than a survey, and reports **2–4 hours per client**. The **51% figure
has no source anywhere**; a direct search for it returns nothing resembling it.

**Caught by.** A source-verification pass over §1, checking every claim against a primary source
before it reached the pitch.

**Would have cost.** The single most quotable line in the pitch, unsourced, stated as fact
who work in this domain daily. "Where's the survey?" has no good answer.

**Permanently changed.** Replaced with what the thread actually says, linked, and explicitly
labelled *practitioner testimony from a forum discussion, not a controlled survey*. The Zoho
Payments article (16 June 2026) was verified and promoted to carry the argument instead — a
competitor documenting the exact gap in writing is stronger evidence than a statistic anyway.
Commit `bfb3662`.

---

## 6. A field claimed in three places that never existed

**Believed.** PRD §4, §6 and §11 all described a per-record **confidence tier** logged in the
audit trail. §11 listed it in the table of what the project measures.

**Broke.** No `confidence` column had ever existed in the schema. The claim had propagated
across three sections without anything checking it against the code.

**Caught by.** Grepping the PRD's claims against the actual schema during a full audit.

**Would have cost.** A falsifiable claim in the "how we meet the requirements" table — the one
table anyone would check first, and the cheapest possible thing to be wrong about.

**Permanently changed.** The **claim was removed rather than the column added**. `match_method`
*is* the confidence tier — `EXACT` / `FUZZY` / `NONE` — and a second column would have been a
pure function of the first, free to drift out of step with it. Commit `bfb3662`.

---

## 7. Documentation lookups silently degrading to guesswork

**Believed.** `${CONTEXT7_API_KEY}` in `.mcp.json` would expand from the project's `.env` file.

**Broke.** MCP config expands variables from the **process environment**, not from `.env`.
Error: ``Variable `CONTEXT7_API_KEY` not found``. The server fell back to keyless mode, which is
rate-limited per IP.

**Caught by.** The editor surfacing the unresolved variable.

**Would have cost.** This project's central rule is *never code against a remembered API*.
Silent throttling on documentation lookups is precisely the failure that produces guessed
function signatures — the rule defeats itself without anyone noticing it happened.

**Permanently changed.** Export moved to the shell profile. Needed a fresh terminal, because the
interactive-shell guard near the top of `.bashrc` short-circuits before the export line is
reached. `CLAUDE.md` now says to report throttling out loud rather than quietly degrading.
Commit `fc9431e`.

---

## 8. A 246-character commit subject line

**Believed.** Pasting a multi-line commit message into the terminal preserves its structure.

**Broke.** The shell collapsed the entire message — subject, blank line, body — into one
246-character subject.

**Caught by.** Reading `git log --oneline`.

**Would have cost.** Little, honestly. Included because it's the mundane 2AM kind, and because
the fix generalises.

**Permanently changed.** Every commit message is now handed over as
`git commit -m "subject" -m "body"`, which survives a paste intact. No SHA — the bad commit was
rewritten out of history by interactive rebase.

---

## 9. A zero-value row that matched a rate cell "exactly"

**Believed.** Tier 1 is complete when a row's fee ties to a published rate cell within ₹1 —
`|expected − actual| ≤ 100` paise identifies which cell was billed.

**Broke.** 2% of nothing is nothing. A `PARTIAL_PAYMENT` retry carries `amount: 0` and `fee: 0`,
so the `STANDARD` cell predicts a fee of 0 and `|0 − 0| = 0` clears the tolerance with room to
spare. `matchBatch` returned `MATCHED` / `EXACT` / `rate_cell: STANDARD` for all **3** of them.
The tolerance test is the wrong shape for the zero case: it asks *"is the fee close to what we
expected"* when the real question is *"is there a fee to explain at all"*.

**Caught by.** Running `matchBatch` over the whole 58-row fixture and diffing every record
against `expected.json` — **42 `EXACT` where the manifest says 30**. The slice's own unit test
was green throughout; it asserts one ₹1,499 record. Note that `tests/fixtures.test.ts:106`
already carried the guard, with the comment *"The matcher needs this same guard"* — the
knowledge was in the repo and the implementation did not inherit it.

**Would have cost.** The headline wrong in the flattering direction: 42/54 = 77.8% instead of
30/54 = 55.6%, on a slide. Worse in substance — a failed payment that was never billed anything
would be reported as cleanly matched ITC with `expected_fee_paise: 0`, i.e. the reconciliation
claiming to have explained a fee that does not exist.

**Permanently changed.** *Closed in the `PARTIAL_PAYMENT` slice.* `src/lib/matching/index.ts:100`
returns no rate cells at all for a zero-amount row, ahead of any pricing, so the bug cannot
reappear through either mode. Two guard tests: `tests/matching.test.ts:223` pins the retry twin
as `PARTIAL_PAYMENT` in **both** modes, and `tests/matching.test.ts:268` pins the case the
classifier precedence does **not** cover — a lone zero-value row with no sibling sharing its
`order_id`, which is not a partial payment and must still not resolve to a cell. Removing the
guard fails both. Measured effect: `exact-only` fell from **42 `EXACT` to 39**, the three
phantom matches gone. Logged when found rather than at commit time deliberately — the agreed
precedence (`PARTIAL_PAYMENT` evaluated before tier 1) hides this bug on the fixture, so it would
have looked fixed without ever being fixed.

*Update, ambiguity slice.* The symptom moved without the cause being touched. Counting resolving
cells means a zero-value row now matches **both** cells (2% and 2.15% of nothing are both nothing),
so it is reported `EXCEPTION` / `UNEXPLAINED` as ambiguous rather than `MATCHED` / `EXACT`. Better
output, entirely wrong reason — the row is not ambiguous, it has no fee to explain. In `exact-only`
mode, where only one cell is ever tried, the original bug is still fully live: **42 `EXACT` against
the manifest's 30**. The zero-amount guard is still required and still owed.

---

## 10. The rate-cell floor was wrong twice — wrong number, and wrong shape

**Believed.** Carried from entry #2 above and written into `docs/PRD.md:210` and the handoff:
the two cells cannot be told apart below **₹564.98**, derived from `amount × 0.0015 × 1.18 < ₹1`.
Above that, a fee resolves to at most one cell.

**Broke.** Two separate errors.

- **The number.** The formula treats paise as continuous, but both the MDR and the 18% GST on it
  are rounded to whole paise, and that rounding widens the band. Brute-forcing every amount from
  1 to 200,000 paise, the last one whose two cells sit within 100 paise of each other is
  **57,232 paise (₹572.32)** — ₹7.34 above the documented floor. The boundary is clean, not
  ragged: nothing above it is ambiguous. No fixture record sits in the gap, by luck.
- **The shape, which matters more.** *Ambiguity is not a function of the amount.* The floor
  describes a **correct** fee sitting exactly on one cell. A **wrong** fee sitting between the
  cells satisfies both whenever they are less than 200 paise apart — true all the way up to
  **₹1,138.37**. Worked case: on a ₹1,000 payment, `STANDARD` predicts ₹23.60 and `CORPORATE`
  ₹25.37; a fee of ₹24.49 is within ₹1 of both. **8 of the 51** non-zero fixture amounts
  (₹645–₹999) sit in that band.

**Caught by.** A brute-force scan of the boundary during the adversarial pass on the first
matcher slice, run because the figure was about to be quoted from the log rather than recomputed.

**Would have cost.** An implementation reading the spec literally — `if (amount < FLOOR)
ambiguous` — is wrong in both directions: it waves genuinely ambiguous mid-gap fees through as
clean `EXACT` matches up to ₹1,138, and it flags a ₹7.34 band that is fine. That is precisely
the order-dependent nondeterminism entry #2 was supposed to have closed, reintroduced by the
fix's own documentation.

**Permanently changed.** The matcher never compares an amount to a threshold. It counts how many
cells resolve within tolerance and treats `> 1` as `EXCEPTION` / `UNEXPLAINED` — decided with
Preet at the seam-agreement step, before any test was written. The fixture itself was never at
risk: `tests/fixtures.test.ts:209` asserts the correct property (per-record cell hits ≤ 1,
computed from actual fees, not from a threshold), which is why the wrong number never corrupted
the data. **Applied:** PRD §6 now states both thresholds and forbids comparing an amount to a
floor at all; `docs/HANDOFF.md` and the guard test's comment say the same; entry 2 above carries
a pointer here so the superseded number cannot be read as current.

---

## 11. A green test that verified less than it appeared to

**Believed.** The first matcher slice was verified — its test asserts the entire returned record:
status, method, rate cell, expected fee and tax, category, credit-note flag, billing period.

**Broke.** Mutation-tested the implementation against it: **5 deliberate faults injected, 3
caught, 2 survived.** Setting `TOLERANCE_PAISE` from 100 to **0** still passes. Changing the MDR
from `Math.round` to `Math.floor` still passes. The test's record (₹1,499 → ₹29.98 MDR → ₹5.40
GST → ₹35.38 fee) lands exactly on the cell at a round amount, so it exercises neither the
tolerance nor the rounding mode — the two things every match depends on.

**Caught by.** Deliberate mutation. Not by re-running the suite: it was green before each
mutation, after each surviving one, and after reverting.

**Would have cost.** Nothing shipped — this one is about the evidence, not the code. It is worth
recording because it puts a number on this log's own thesis: a suite that catches 3 of 5 injected
faults is 60% of a test, and nothing in the terminal output distinguishes that from 100%.

**Permanently changed.** Both survivors die in slices already queued — the `CORPORATE` slice
prices `amount × 0.0215`, which is fractional and therefore rounding-sensitive, and the
ambiguity slice tests a fee sitting exactly 100 paise from a cell. Mutation-injection is now part
of the adversarial pass before *each* slice is reported done, not a one-off.

*Update, acceptance slice — the fixture is a demo, not a test suite.* With the matcher complete,
10 faults were injected and measured against the 54-record acceptance test alone versus the whole
suite. The acceptance test caught **7 of 10**. The three it missed: removing the zero-amount
guard, widening the ₹1 tolerance by a single paise, and dropping the sibling check that
distinguishes a retry from a lone zero-value row. Each is invisible in the fixture for the same
reason — the data contains no record that discriminates it (all three zero-value rows have
siblings, no fee sits 101 paise from a cell). All three are caught by hand-built unit cases. So
the headline "54 records, every one matching the manifest" is the weaker half of the evidence,
not the stronger one, and a dataset assembled to demonstrate a product should never be mistaken
for one assembled to falsify it.

---

## 12. Rounding that wasn't rounding — a rate multiplied in floating point

**Believed.** `Math.round(amountPaise * RATE_CELLS[cell])` implements round-half-up on the MDR,
which is what the rate card means by "2.15%".

**Broke.** It implements *whatever IEEE-754 does to the product, then round*. ₹2,850.00 at 2.15%
is exactly **6127.5 paise**; the double evaluates to `6127.499999999999` and rounds **down** to
6127, where every convention — half-up and half-even alike — says 6128. Scanning 1 paise to
₹50,000 against both cells, the float expression disagrees with exact arithmetic **1,320 times**.
**3 of the 54 fixture records** sit on it: ₹2,850, ₹6,750 and ₹1,750, all on the `CORPORATE`
price. The fixture generator used the same expression, so the data and the matcher agreed by
construction — same author, same assumption, green either way.

**Caught by.** Mutation testing during the adversarial pass on the `FUZZY` slice. Swapping
`Math.floor` for `Math.round` was *expected* to be an equivalent mutant on a record whose MDR is
mathematically a whole number (₹5,600 × 2.15% = 12,040 paise exactly) — and it changed the
answer, which is only possible if the product was never that integer. `560000 * 0.0215` is
`12039.999999999998`.

**Would have cost.** Small and slow-acting rather than dramatic. `expected_fee_paise` in the
audit trail off by a paise on ~6% of records — the figure a CA is being asked to trust, in a
product whose entire claim is that the arithmetic is checkable. And at the tolerance boundary a
1-paise drift flips a match verdict outright, which is precisely where the next slice was about
to start pricing *every* cell for *every* record in order to detect ambiguity.

**Permanently changed.** Rates are integer basis points — `STANDARD: 200`, `CORPORATE: 215`,
divided by `10000` **after** the multiply, so the product (`285000 * 215 = 61,275,000`) stays
exact inside a double. Guard test at `tests/matching.test.ts:132` pins ₹2,850 → fee 7231, and
dies on both a `floor`/`round` swap and a regression to `amount * (bp / 10000)`. Reasoning is in
the `src/lib/matching/rate-card.ts` header so the next person doesn't "simplify" it back to a
decimal literal.

---

## 13. The month-boundary rule was using the wrong month boundary

**Believed.** A settlement's filing period is the calendar month of its `settled_at` timestamp,
read in UTC.

**Broke.** A GST return period is a calendar month **in India**. A Unix timestamp carries no
timezone at all — the timezone belongs to the *reading* — and reading these instants as UTC
mislabels every settlement in the last **5½ hours** of a month. `31 Jul 2026, 20:00 UTC` is
`1 Aug 2026, 01:30 IST`: read as UTC it is July and perfectly in period, read in IST it is
August and a `TIMING` exception. So the rule whose only job is detecting month-boundary
crossings was using the wrong month boundary — in precisely the window that T+2 settlements
crowd into.

**Caught by.** Mutation testing on the `TIMING` slice. Swapping `getUTCMonth` for `getMonth`
changed nothing, which meant nothing in the suite pinned the reading at all. The fixture cannot
discriminate either: every settlement in it is stamped `10:00:00` UTC — 15:30 IST — so UTC and
IST agree on all 54 records, and no test written against that data could have found this.

**Would have cost.** Nothing in the demo, everything on real data. `TIMING` is the category the
pitch leans on hardest, and it would have misfiled month-end settlements in both directions: a
late settlement counted into the wrong period's rollup means the tier-2 delta stops equalling the
tax on that period's exceptions, so the reconciliation's central claim fails on exactly the
records it exists to explain.

**Permanently changed.** `periodOf` shifts by a fixed **+05:30** before reading — IST has had no
daylight saving since 1945, so a fixed offset is exact and needs no timezone database — with the
reasoning in the function header. Guard tests pin the exact boundary:
`tests/matching.test.ts:430` keeps `31 Jul 18:29:59 UTC` (23:59:59 IST) in July, and
`tests/matching.test.ts:438` moves `18:30:00 UTC` (00:00:00 IST) into August. They fail on a UTC
reading, a `+05:00` offset, a flipped sign, and a host-local reading.

**Second-order finding, worth more than the bug.** This machine's clock runs in **UTC**, so a
host-local regression is an *equivalent mutant here* — it passes locally and fails under
`Asia/Kolkata`, `America/Los_Angeles` and `Pacific/Kiritimati` alike. Vercel's runtime is UTC
too. An entire class of timezone bug is therefore invisible in local runs and in CI by default,
and passing tests say nothing about it. The suite is now also run under a hostile `TZ` as part of
the adversarial pass.

---

## 14. Three input shapes nobody had thought about

**Believed.** With all 54 records reproducing the manifest field-for-field and 10 of 10 injected
faults dying, the matcher was done.

**Broke.** The manifest contains only well-formed input, so agreeing with it says nothing about
malformed input. Feeding the seam shapes the fixture does not contain found three defects, none
of which any existing test can see.

- **A duplicated row is counted twice.** Passing the same `entity_id` twice yields two records
  and rolls up **1620 paise of tax where two distinct payments are worth 1080** — a 50% inflation
  from one duplicate. There is no de-duplication anywhere, and the tier-2 rollup is the exact
  place that inflation turns into a wrong ITC figure. Any ingestion that pages over the recon API
  with an overlapping window produces this silently.
- **The claimed period is never checked against the statement.** `matchBatch` takes a GSTR-2B
  statement and *ignores it entirely* — passing `null` still returns `MATCHED`. Reconciling July's
  settlements while claiming period `082026` against July's own statement yields 42 `TIMING`
  records and no error at all.
- **A zero-value leg that was nonetheless charged a fee is called `PARTIAL_PAYMENT`.** The
  category's plain-language reason is *"only the successful capture is billable"* — a false
  statement about a row carrying a ₹35.38 fee. Its GST silently leaves the rollup unexplained.
  (Related, smaller: a refund row with `debit: 0` still raises a Section 34 credit-note flag.)

**Caught by.** A deliberate second-direction pass after the acceptance test was already green —
mutation testing attacks the code, so this attacked the *inputs* instead: order shuffling,
duplicate ids, orphan refunds, null join keys, zero-with-fee, and a mismatched statement/period
pair. Four other directions came back clean and are worth recording as such: an independent
integer-only recomputation of all 54 rate cells (BigInt, no division, a different method from
both the matcher and `fixtures.test.ts`) disagreed with the manifest **zero** times; 25 input
shuffles produced identical output; `matchBatch` does not mutate its input; and the slice-7
targets were confirmed by hand before writing the code that must reproduce them —
119692 − 85587 = **34105**, which equals the July exception tax exactly, and August's 19530 is
exactly the five `TIMING` records.

**Would have cost.** The duplicate is the dangerous one: it inflates claimed ITC, which is the
direction that gets a merchant a notice rather than a refund. The unvalidated statement means a
mis-wired pipeline reconciles against the wrong month's invoice and reports a confident,
meaningless delta. The zero-with-fee row makes the tool state something untrue in plain language
to a CA — the failure mode this product exists to prevent.

**Permanently changed.** *Closed in the tier-2 slice.* All three now fail loudly rather than
producing a plausible number. Guard tests: `tests/matching.test.ts:597` rejects a batch carrying
the same `entity_id` twice — refused outright rather than silently de-duplicated, because quiet
de-duplication hides the ingestion bug behind a number that still looks right; `:613` rejects a
statement whose `rtnprd` is not the claimed period, so a mis-wired pipeline cannot reconcile
against the wrong month's invoice; and `:627` requires `fee === 0` before a zero-value row may be
called `PARTIAL_PAYMENT`, leaving `UNEXPLAINED` — which is true — for a failed leg that was
nonetheless charged.

---

## 15. A rollup that was right for reasons nothing tested

**Believed.** With `119692 − 85587 = 34105` reproduced, and the delta equal to the July exception
tax, the tier-2 rollup was verified.

**Broke.** Nothing shipped wrong — but the suite could not tell the correct rollup from three
incorrect ones. Eleven faults were injected; four survived, and three of those were real:

- **Dropping IGST entirely** from the invoice total changed nothing. The fixture merchant is in
  Maharashtra and Razorpay bills them from its Maharashtra registration, so every rupee of tax in
  the data is CGST+SGST and `igst` is always `0`. **Every merchant outside Maharashtra is the
  mirror image** — tax entirely in IGST — and a rollup reading only the two intra-state heads
  would report their invoice as carrying no tax at all, then declare the whole period an
  exception. The most consequential defect in the project so far, and the fixture cannot express
  it.
- **Summing expected tax instead of actual tax** changed nothing, because all 38 matched records
  sit exactly on their rate cell. The invoice bills what was charged; a rollup of what the rate
  card *predicted* drifts by up to the ₹1 tolerance per record, and the delta stops meaning
  anything.
- **Truncating rupees instead of rounding** changed nothing, by luck: none of the fixture's rupee
  values lands on the wrong side of a float boundary. `8.29 × 100` evaluates to
  `828.9999999999999` — the statement-side twin of entry 12.

The fourth survivor is genuinely equivalent: the rollup filters on `billedIn === period` as well
as `MATCHED`, and the TIMING rule already guarantees no matched record can be billed elsewhere.
Kept as redundancy, and named here so nobody deletes it thinking a test justified it.

**Caught by.** Mutation injection against tier 2 specifically, run because this was the slice the
demo's headline claim rests on. Not by the acceptance test, which passed throughout.

**Would have cost.** Nothing today, since the code was already right. What was missing is the
*evidence* — and correct-by-luck is indistinguishable from correct-by-design until something
tries to break it. The IGST reading would have failed for every merchant outside one state, which
is the first thing a second merchant would have hit.

**Permanently changed.** Three guard tests built on hand-written statements the fixture cannot
produce: `tests/matching.test.ts:773` totals an all-IGST inter-state invoice to the same 119692,
`:791` pins ₹8.29 → 829 paise against truncation, and `:806` matches a fee 89 paise off its cell
and asserts the rollup sums the 9014 actually charged rather than the 9000 predicted. Each was
verified to fail against its own mutant before being kept.

---

## 16. An integer check that admitted an uncountable integer

**Believed.** `Number.isInteger` is the right test for "this arrived as integer paise", and the
ingestion layer's 32 tests — an end-to-end acceptance run plus a hand-built rejection case for
every documented rule — were adequate evidence that the guards work.

**Broke.** Three things, none of which any test could see.

- **`Number.isInteger(1e21)` is `true`.** So is `1e21 + 1 === 1e21`. Money past 2^53 passes
  validation and then stops being countable: the tier-2 rollup sums it into a total that is
  quietly wrong rather than obviously absurd. The check was asking "is this a whole number"
  when the question is "can this be added up".
- **The GSTIN shape check had no test at all.** Deleting it left the suite green. `gstin: ""`
  was covered; `gstin: "NOTAGSTIN"` was not, and PRD §5 is explicit that an invalid GSTIN
  reaching a real user is worse than a code bug.
- **`rsn` could be stringified instead of validated.** Replacing the string check with
  `String(row.rsn)` also left the suite green — turning a numeric or object `rsn` into `"42"` or
  `"[object Object]"`. That field is GSTN's stated reason for blocking a credit, read by a human
  deciding whether to claim it, so the failure mode is a fabricated government reason.

**Caught by.** Two passes run *after* the suite was green, in opposite directions. Mutation
injection — 18 faults, 16 killed immediately, 2 survivors — found the two blind spots. A separate
input-direction probe, 16 hostile payload shapes fed straight into both parsers, found the
oversized integer. Neither would have been found by running the tests again; both were green
throughout.

**Would have cost.** Low probability, silent direction — the expensive combination. An oversized
amount corrupts an ITC figure with no error anywhere. A stringified `rsn` puts words in the
government's mouth on the one field that decides whether the merchant may claim.

**Permanently changed.** `requireInteger` now demands `Number.isSafeInteger`, with the reasoning
in its header. Guards in `tests/ingestion.test.ts` pin `1e21` and `2**53`, the GSTIN shape on both
`gstin` and `ctin`, and `rsn` typing (rejects a number and an object; accepts absent as `""`,
which is what GSTN itself writes against an eligible invoice). Each was verified to fail against
its own mutant before being kept.

*Recorded rather than silently allowed:* negative money still parses. No verified source says a
negative `fee` is impossible in Razorpay's ledger, and the matcher already reports a fee it cannot
explain as `FEE_DEDUCTION` rather than inventing a reason for it. Rejecting it would be a rule
invented by the parser, which is the same class of mistake as coercing.

---

## 17. Two bucket counts that were right for a reason that isn't guaranteed

**Believed.** Counting the audit trail's `matched_exact` / `matched_fuzzy` / `exceptions` buckets
off `match_method` (or off `exception_category`) is the same as counting them off `status`.

**Broke.** It is the same *only* because of an invariant inside `matchBatch`: `method` is `NONE`
exactly when the status is `EXCEPTION`, and `category` is non-null exactly then too. Both proxies
survived mutation against the full suite. The invariant is not a law — a netted refund already
resolves cleanly to `STANDARD` and is an exception purely on its verdict, so a matcher change that
kept the resolved cell on an exception row would make the proxies disagree with the truth, in the
flattering direction, on the headline 30 / 8 / 16.

**Caught by.** Mutation injection on `src/lib/audit/rows.ts` — 11 faults, 9 killed, 2 survived —
with all 96 tests green before, during and after.

**Would have cost.** Nothing today; the numbers are correct. What was missing is evidence that
they are correct *by construction* rather than by a coincidence in a neighbouring file.

**Permanently changed.** Both counts read `status`. `tests/audit-rows.test.ts` feeds `toBatchRow`
a hand-built `BatchResult` containing an `EXCEPTION` that carries `method: "EXACT"` and a null
category — a shape the 54-row fixture cannot produce and the matcher does not currently emit —
and asserts 1 / 1 / 2. It fails against both proxy mutants. The mapping layer takes a
`BatchResult` rather than raw settlements precisely so this shape can be handed to it.

---

## 18. ITC reported as at risk that we had already decided was claimable

**Believed.** With GSTN's `itcavl` flag on "Y", the input tax credit a merchant can claim is the
matched rollup, and the tier-2 delta — the invoice tax nothing matched — is what is at risk. That
is what `toBatchRow` wrote, and what `tests/audit-rows.test.ts` asserted: 85587 claimable, 34105
at risk.

**Broke.** The delta is not one thing. Decomposed, July's 34105 is **12636 of REFUND_NETTED tax +
21469 of FEE_DEDUCTION tax + 0 from three zero-value retry legs**. The refund half contradicts a
decision this project settled long before: a netted refund obliges the merchant to issue a
Section 34 credit note, which is an **output-side** obligation to its own customer, and Razorpay
does **not** return its MDR on a refunded transaction — so the GST on that fee is still a real
input tax the merchant paid, and the credit on it is untouched. Those rows are exceptions for a
reason that has nothing to do with whether the credit is good. Sweeping their tax into "at risk"
took a number the project had already reasoned about correctly in `schema.ts` and PRD §7 and
reversed it at the row-mapping boundary.

The size is not marginal: at risk was overstated by 59% (34105 against a true 21469), and the
corrected at-risk figure is now exactly the four unexplained fee deductions — which is both right
and a far better sentence to say to a CA than a number that quietly includes credit they can take.

**Caught by.** An adversarial review pass over the ingestion PR that decomposed the delta by
exception category instead of accepting it as a total. All 98 tests were green; the test asserting
the wrong split was written by the same agent that wrote the wrong split. Nothing in the suite
could have found this, because the suite encoded the assumption.

**Would have cost.** The headline number on the dashboard, and the one anyone would check first to
ask about. Worse in the direction it was wrong: telling a merchant credit is at risk when it is
not is the error that makes them *not* claim money they are owed.

**Permanently changed.** `itcSplit` now adds the tax on `REFUND_NETTED` records billed in the
period, and derives at-risk from the invoice total rather than from the delta, so the two halves
always sum to the tax the period was actually billed. The `itcavl: "N"` branch is unchanged — a
government block still outranks everything. Three guards in `tests/audit-rows.test.ts`, each
verified to fail against its own mutant: a refund whose settlement landed in the next month is not
credited here (it is on the next invoice, and crediting it twice is the obvious way to get this
wrong); relabelling the refunds as `FEE_DEDUCTION` moves their tax back out of claimable, which
kills a filter on "any exception in the period"; and August, which nets no refunds, still reads
19530 / 0.

---

## 19. A GSTR-2A detector that would have rejected a real GSTR-2B

**Believed.** `flprdr1`, `fldtr1`, `itm_det`, `camt`, `samt` and `iamt` are GSTR-2A field names
that do not exist in GSTR-2B (entry 1), so finding any of them **anywhere** in a document proves
the wrong form arrived. `parseStatement` deep-scanned the whole parsed document for all six.

**Broke.** Only the first three are 2A-exclusive. `iamt`, `camt` and `samt` are 2A's names for
the three tax heads **inside a line item**, where 2B says `igst`/`cgst`/`sgst` — but a real
GSTR-2B uses the same names elsewhere in the document: the **IMPG** section (import of goods)
carries `iamt` against a bill of entry, and the ITC summary node totals all three heads. So a
genuine GSTR-2B downloaded by a merchant who imports anything would have been rejected with
"this is a GSTR-2A" — a false rejection, and the most confusing possible way to be wrong, since
the operator would go looking for a document-substitution bug that never happened.

Entry 1 is not wrong; it is scoped to the item level and was read as document-wide.

**Caught by.** A web verification pass against GSTN's own IMPG advisory and 2B-schema
documentation, run during PR review specifically to check whether a blocklist inherited from
entry 1 was still true. The fixture is b2b-only, so no test in the repo could ever have fired
this — the input that triggers it cannot be built from `data/synthetic/`.

**Would have cost.** Nothing in the demo, and everything in the claim the demo makes. The pitch is
"we read GSTN's real schema"; anyone handing it a real 2B with an import line would have watched
it refuse the document on camera.

**Permanently changed.** The blocklist is split. `GSTR_2A_ONLY_FIELDS` (`flprdr1`, `fldtr1`,
`itm_det`) still deep-scans the whole document. `GSTR_2A_ITEM_FIELDS` (`iamt`, `camt`, `samt`) is
checked **only** inside a `docdata.b2b[].inv[].items[]` entry, which is the one place the
substitution actually occurs, and throws naming it as a line-item field so the reader is not sent
to the wrong problem. Guards in `tests/ingestion.test.ts`: a 2B carrying both an IMPG section and
an `itcsumm` node parses and its invoice total is unaffected; a genuine 2A document is still
refused; all six markers still reject in the position they really occupy. Verified against three
mutants — restoring the global list, dropping the item check, and an item check that only looks
for `camt`.

*Recorded rather than fixed:* three of the four `csamt`/`cess`-adjacent names were not audited,
and neither were the `cdnr`/`isd` sections, because nothing reads them. If the parser is ever
extended past `b2b`, this blocklist needs the same treatment again.

---

## 20. A briefing that told an agent a tool was missing when it was merely locked

**Believed.** `docs/NEXT-TASK.md`, written to brief an unattended overnight cloud run, said: "the
Context7 MCP server is not available to you — use WebSearch instead." The reasoning was that a
cloud sandbox is a fresh environment, so the local MCP configuration would not follow it there.

**Broke.** Context7 was **attached but not pre-approved**. That is strictly worse than absent.
Absent would have fallen through to WebSearch and finished the task. Present-but-blocked put an
unanswerable permission prompt in front of an agent with no human awake to answer it, and it
stalled there for **eleven hours**, one step before pushing its branch. The code was written,
green and complete at 04:24 IST; it survived only because the push happened to come before the
step that asked for permission. The task the prompt blocked — writing `docs/STACK-CHECK.md` —
was never done that night and had to be redone by hand the following morning.

**Caught by.** Preet noticing the run had produced commits but no `STACK-CHECK.md`, then reading
the transcript to find out where it stopped.

**Would have cost.** It did cost: eleven hours of a three-day build, and very nearly the whole
branch. Had the optional step been ordered before the push instead of after, 1,273 reviewed lines
would have died in a sandbox behind a dialog box nobody could click.

**Permanently changed.** Two guards, because the incident has two independent causes.
`.claude/settings.json` is now **tracked in the repo**, so the Context7 grant travels with the
clone into any sandbox rather than living only in a local file. And any future unattended briefing
must carry the instruction: *push the branch as soon as it is green, before any optional step, and
if anything asks for permission, abandon that step and report the block rather than waiting.* The
general rule is that an unattended agent must never be told a tool is unavailable unless that has
been verified — "I could not reach it" and "I was not allowed to reach it" fail in opposite
directions, and only the second one hangs.

---

## 21. Two dependencies in the spec: one wrong about itself, one just unnecessary

**Believed.** PRD §9 committed to Inngest for durable pipeline execution and Langfuse for tracing
every Claude call. Both had been chosen on reputation and on prior use, and neither had been
checked against the packages as they actually ship — which is the exact thing this project's first
non-negotiable rule exists to prevent, applied to everything except its own spec.

**Broke.** Two different failures, worth separating because only one is an error.

*Langfuse was wrong about itself.* `langfuse-vercel` is **deprecated in its own README**, and the
current SDK drops spans on Vercel unless `exportMode: "immediate"` is set and `forceFlush()` is
called explicitly. The failure is silent: traces simply do not arrive, which reads as "the model
made fewer calls than I expected" rather than as an error. That is the worst possible failure
shape for observability, because the tool whose job is telling you what happened is the tool
lying to you, and you would be debugging it the night before a deadline.

*Inngest was not wrong — it was just not load-bearing.* `docs/STACK-CHECK.md` verified every §9
claim about it against the shipped type definitions: `step.run`, App Router `serve`, and
`step.waitForEvent` all exist and work as described. The problem is scale. Detect is 54 records
through pure functions in under three seconds, and a re-run is byte-identical because the matcher
is deterministic. There is no expensive step to resume. Durable execution was being paid for in
setup time, a second local dev process, and deploy configuration, and returning nothing the demo
could show.

**Caught by.** A stack-verification pass reading the published `.d.ts` files and READMEs out of
the installed tarballs, after `www.inngest.com` and `langfuse.com` both returned `EGRESS_BLOCKED`
and no first-party documentation page could be fetched. The type definitions turned out to be the
stronger source anyway — they are what the compiler enforces.

**Would have cost.** Somewhere between four and eight hours of a three-day build, spent wiring two
dependencies, one of which would then have failed quietly.

**Permanently changed.** Both are cut, and the replacements are things the product already needed.
The pipeline is plain async functions with run state in the `batches` row. The human-in-the-loop
pause Inngest was chosen for becomes `actions.confirmed_at` — a nullable column and a Confirm
button, which is also the only version of that gate a demo can show on screen. Tracing becomes an
`ai_calls` table in the same Postgres, which for an audit product is the correct home anyway: the
trace **is** the audit trail, and it belongs beside the records it explains. PRD §9 and `CLAUDE.md`
were both edited rather than left stale, and `CLAUDE.md` now says explicitly not to reintroduce
either without asking — a cut dependency that stays listed in the instructions is how a future
session quietly puts it back.

*The general guard:* the documentation-first rule applies to the spec, not only to the code. A
stack table is a set of claims, and claims get verified before anything is built on them.

---

## 22. A permission prompt that no instruction could survive

**Believed.** Entry 20's guards had closed this. `.claude/settings.json` is tracked and grants
`mcp__context7__resolve-library-id` explicitly, so the grant travels with the clone. The briefing
tells the run, in bold, to abandon any step that asks for permission and continue. Two independent
defences, both aimed at exactly this failure.

**Broke.** Both overnight runs died on the first Context7 call, 2 minutes in, and hung until
morning — about 12 hours between them, producing nothing but a slice-claim commit each.

Two things were wrong at once, and each defeated one guard.

The routine's `session_context.allowed_tools` listed `mcp__Context7`. The *shape* of that is
right — a bare `mcp__<server>` prefix is the documented way to allow every tool on one server, and
it is exactly what the tracked `.claude/settings.json` already used. The bug is one capital letter.
The connector is *displayed* as "Context7", but a run registers it lowercase and calls
`mcp__context7__resolve-library-id`. `mcp__Context7` matched nothing at all.

So this was never an over-narrow allowlist — it was a whole-server grant with a typo, which fails
identically to granting nothing. And because a routine-level `allowed_tools` **takes precedence
over the repository's tracked `.claude/settings.json`**, the correct grant sitting in the clone
never got a vote. The guard from entry 20 was right, and I disabled it myself by writing a
misspelled list above it.

The second failure is the more general one. The briefing's instruction — *"if anything asks for
permission, abandon that step and continue"* — is not executable. A permission prompt does not
fail a step and return control; it blocks the session. There is no branch for the model to take.
An instruction cannot rescue a permission prompt, and writing one that reads as though it can is
worse than writing nothing, because it makes the run look defended.

**Caught by.** Preet asking to review the two branches. Both existed, both looked plausible in
`git branch -r`, and both contained a single 4-line documentation commit. `list_runs` showed both
sessions still `requires_action`; the logs showed the identical `permission prompt` line.

**Would have cost.** It did cost: the entire overnight window, on a build with three days left.
Nothing was lost, because the claim-and-push rule meant each run pushed before it stalled — that
guard worked exactly as designed and is the only reason this is a lost night rather than a lost
night plus a mystery.

**Permanently changed.** Three things.

The allowlist is written from the **tool id a run actually calls**, never from the connector's
display name, and always lowercase. It grants whole servers by prefix and then repeats the
specific ids underneath, so a mistake in one form is caught by the other. The briefing also now
records that routine-level `allowed_tools` overrides tracked repo permissions, so the entry-20
guard cannot be switched off from above without someone noticing.

The MCP canary moves to **preflight step 1**, ahead of `npm ci`. A blocked tool is fatal to the
whole session, so the only useful place to discover it is before anything else has been done. A run
that dies in its first 30 seconds costs nothing and says exactly what is wrong in its log.

And the briefing no longer claims a permission prompt can be handled. It says the opposite: a
prompt ends the run, so every tool the run may reach must be pre-approved before it is scheduled.
The general rule: **in an unattended run, treat a permission prompt as a crash, not an error.**
Errors can be caught. Crashes have to be made impossible in advance.

---

## The pattern (notes for the narrative — not final wording)

Almost nothing crashed. **Every significant failure here was code or spec that was wrong while
passing its own tests.** #2 and #3 both had green suites over them at the moment they were
wrong, because the same assumption authored the artifact and the test that was supposed to check
it. A passing suite is close to worthless as evidence when one author wrote both halves.

What actually worked was making the second look **routine rather than occasional** — a
deliberate pass that attacks the work from a direction its own tests can't cover, run before
presenting anything as done. Every incident above except #8 was found that way or by a
verification pass against a primary source. None were found by running the tests again.

Three things this cost, worth stating plainly: it is slower, it repeatedly invalidated work that
was already "finished," and it required rewriting the PRD enough times that the spec itself
became untrustworthy for a while and had to be audited section by section.

The connection worth drawing: the PRD's own argument is that **verification capacity, not
generation speed, is the bottleneck**. This log is that argument demonstrated on ourselves. The
product and the process are making the same claim — which is the useful kind of coincidence,
because it's simply what happened.

---

## 23. The spec named a function that cannot do the job

**Believed.** Investigate would classify through `generateObject` with a Zod enum, calling tools
along the way to fetch refunds and order context. PRD §15.3 and the §9 architecture box both said
so, in two places, since the spec was written.

**Broke.** `generateObject` in AI SDK v7 accepts no `tools` parameter. It is a one-shot: prompt in,
validated object out, no tool loop. The two commitments were never satisfiable together — an agent
that cannot look anything up cannot investigate. Verified against the shipped signature at
`node_modules/ai/dist/index.d.ts:7476`, not inferred.

**Caught by.** Reading the shipped `.d.ts` before writing the call site, not by Context7. Context7
returned a correct and current description of `generateObject`; a doc that describes what a function
*does* has no reason to mention what it does *not* accept. Only the type signature is a complete
statement. The failure would otherwise have surfaced as a compile error after the prompt, schema,
gate and tools were all built around it.

**Would have cost.** The obvious repair under deadline is two calls per record — `generateText` to
gather evidence, `generateObject` to classify — which doubles input on all 54 records and takes the
eval past the $5 the whole budget is built on (§9). The alternative repair, dropping the tools, would
have silently deleted §15.1's reasoning trace from the product.

**Permanently changed.** The call site uses `generateText` + `Output.object` + `stopWhen`, which
validates against the same Zod schema in one conversation and exposes `toolCalls` for the trace. PRD
§15.3 and the §9 diagram now name it, with the constraint recorded so nobody "restores" the spec.
The general rule this project already had — documentation-first via Context7 — is amended in
practice rather than in wording: Context7 for how an API is meant to be used, the version-exact
`.d.ts` in `node_modules` for what it will actually accept. Neither alone was sufficient here.

---

## 24. A test that named its own subject wrongly and passed anyway

**Believed.** `investigate` survives a tool that throws, and a test proved it: the mock model called
a broken tool, the tool threw, and the run still returned a category. Green.

**Broke.** The broken tool was named `explodes`, which is not on the read-only allowlist, so the
permission boundary refused the whole call *before the model ever ran*. The test exercised the
allowlist, not tool failure. It passed because both paths end at `UNEXPLAINED`, and the assertion
only checked the category.

**Caught by.** Strengthening the assertion from "lands on UNEXPLAINED" to "verdict is ACCEPTED"
during the adversarial pass. The verdict is the only field that distinguishes the two paths. The
mutation pass had not caught it either, because no mutation targeted a test that was measuring the
wrong thing — mutation testing checks that tests fail when the code breaks, not that they test what
they claim.

Two smaller things surfaced in the same pass and belong here. First, three `sed` mutations silently
failed to apply because the patterns were single-line and the code was multi-line; a no-op mutation
reads exactly like a surviving mutant, i.e. like a test that holds. Second, two genuinely surviving
mutants turned out to be unreachable defensive branches — a `parseJson(result.text)` fallback that
could only ever yield `undefined`, and an error-payload branch shadowed by the cause-chain walk.
Both were deleted rather than papered over with a test.

**Would have cost.** A claim in the submission that the agent degrades gracefully when a lookup
fails, with a green test behind it and no coverage of the case at all. The permission boundary would
have looked doubly tested while one of its two tests was really testing it twice.

**Permanently changed.** The broken-tool test now uses an allowlisted name, so it can only exercise
tool failure, and asserts the verdict rather than the category. The mutation harness prints
`(mutation applied)` or `(MUTATION DID NOT APPLY)` for every mutant by grepping for the mutated text
before running the suite, so a no-op can no longer be misread as a passing test. Standing rule:
when two code paths share an outcome, assert on the field that separates them, never the outcome.

---

## 25. A timestamp in the wrong unit moved a record into a filing period that does not exist

**Believed.** `settled_at` was validated. Ingestion required it to be a safe integer, and the
comment above the check said in as many words that an absent or fractional timestamp silently
picks a filing period — so the field looked like one somebody had already thought about.

**Broke.** Milliseconds are a safe integer. Razorpay returns seconds, but a payload from anywhere
else — a hand-built fixture, a different SDK, a spreadsheet export — carries the same instant times
a thousand, and every guard passed it through. `periodOf` then read it as a date roughly 54,000
years out, which is not an error, just a different filing period. The record was billed against a
GSTR-2B that does not exist, so it could never match: **one such row took the July batch from 38
matched to 37 and the rollup delta from 34105 to 34645**, with nothing anywhere saying so.

**Caught by.** Reading the guard rather than the tests. Every assertion about `settled_at` was
about integers and fractions, and the class the comment claimed to cover — a wrongly scaled value —
had no test at all.

**Would have cost.** A demo where the headline number is 37/54 and the delta is ₹346.45, with no
way to tell from the screen that anything is wrong. Both numbers are plausible. The exception queue
would have carried a record whose only fault is that its clock was in another unit.

**Permanently changed.** `requireEpochSeconds` in `src/lib/ingestion/guards.ts` bounds the value to
a window with a domain meaning rather than an arbitrary one: GST commenced on 1 July 2017, so no
settlement before it can appear on any GSTR-2B, and the ceiling is 1 January 2100. Milliseconds
(~1.8e12), microseconds and nanoseconds all sit far above it. The error names the likely cause
instead of saying "out of range". Both bounds are asserted at the exact boundary and one second
outside it — an off-by-one on either survived the first mutation pass, because the window is 83
years wide and nothing else in the suite came near an edge.

---

## 26. Every supplier on the statement was summed into "the Razorpay invoice"

**Believed.** `invoiceTotals` walked `docdata.b2b` and summed it, with a comment explaining that
summing beats indexing `[0]` because a real statement might carry more than one document. The
reasoning was right and the scope was wrong.

**Broke.** A merchant's GSTR-2B carries **every supplier who filed against their GSTIN** — the
landlord, the SaaS vendor, the courier. So the table is not "Razorpay's invoice, possibly split
across lines"; it is the whole month of purchases, and Razorpay is one row of it. Adding a single
unrelated vendor turned July's invoice tax from **119692 into 1919692**. `itcVerdict` had the same
scope and a worse consequence: any other supplier's `itcavl: "N"` marked the whole batch
ineligible, and `itcSplit` then writes off every rupee of Razorpay's invoice as at risk.

**Caught by.** Review of already-merged code, not by a test. The fixture carries exactly one
supplier, so the dataset could never produce the failure — the assumption that made the bug and the
data that would have caught it were the same choice.

**Would have cost.** The product's central number. Trace tells a merchant how much input tax credit
to claim; a claim inflated by an unrelated vendor's invoice is a wrong ITC claim, which is 18%
annual interest under Section 50 of the CGST Act rather than a bug report.

**Permanently changed.** Both totals are scoped to Razorpay's own CTIN
(`RAZORPAY_SUPPLIER_GSTIN`, overridable per batch via `MatchInput.supplierGstin` for a merchant
billed from another of Razorpay's state registrations). A statement carrying no Razorpay invoice
throws rather than totalling zero — the filter's own failure mode, which would otherwise report the
government as having billed nothing. The comparison is the **whole** GSTIN: mutation showed that
comparing everything after the state code passed every test, and two registrations of one company
differ only in those first two digits, so Razorpay's Karnataka invoice would have been summed into
a Maharashtra reconciliation.

---

## 27. Three assertions in this slice's own tests passed for the wrong reason

**Believed.** Each of the six fixes had a test that failed before it and passed after, which is the
bar this project sets. That bar turns out to be necessary and not sufficient.

**Broke.** Three of the new assertions could not tell their fix from something else firing.
(1) The envelope test asserted `/count/`, but both branches say "count" — deleting the new
"carries no `count`" guard still throws "declares count undefined but carries 1 items", so the
test held on a message about a mismatch while claiming to be about an absence. (2) The unit-error
test asserted `/val/` and `/rupees/i`, and **`txval` contains "val"** while every money guard's
message ends in "rupees" — so any line-item check firing would have satisfied it. (3) The
second-supplier test used a different company's CTIN, so it proved the filter compares *something*,
not that it compares the state code.

**Caught by.** The mutation pass, and only the parts of it aimed at boundaries rather than at
whole branches. Deleting a guard outright was caught every time; narrowing one was not.

**Would have cost.** Six findings reported as closed with tests that would keep passing through a
later refactor that reopened them. The worst of the three is the `txval` substring, because it
would have looked like coverage of the exact bug it does not cover.

**Permanently changed.** Each assertion now names the field that separates the paths: `/carries no
\`count\`/`, `/\.val declares/`, and a supplier CTIN identical to Razorpay's in every character but
the state code. The `val` tolerance is pinned to the paise on both sides — widening it to 2× and
narrowing it to 0.6× both survived the first pass. One surviving mutant was left alive
deliberately: dropping `billedIn === period` from the rollup filter breaks nothing, because
`classify` calls every out-of-period row TIMING before it looks at a fee, so MATCHED already
implies in-period. It is an equivalent mutant, not a missing test, and the invariant it depends on
is now asserted directly so that reordering the classifier fails a test rather than quietly moving
another month's fees into this period's claimed credit.

## 28. Clicking a row did nothing, and no test could have known

**Believed.** The exception review table was finished: `TableRow` was given an `onClick`, the
handler set the open record, the detail panel read it, and everything typechecked. Blade's own
documented example wires a row click exactly this way.

**Broke.** Clicking a row did nothing at all. Blade's `Table` is built on
`@table-library/react-table-library`, whose `Row` only forwards a click when `isRowClick(event)`
passes — and that function is an allowlist of five tag names:

```js
"svg" === target.tagName || "path" === target.tagName ||
"DIV" === target.tagName || "SPAN" === target.tagName || "TD" === target.tagName
```

The settlement cell rendered a Blade `Code` (a `<code>`) and a default `Text` (a `<p>`). Both are
outside the allowlist, so a click that landed on any actual text was discarded silently — no
error, no warning, nothing in the console. Only the few pixels of cell padding, where the target
is the `<td>` itself, worked. Neither Blade's docs nor its TypeScript types mention this; it is a
behaviour of a transitive dependency.

**Caught by.** Driving the real page over the Chrome DevTools Protocol and dispatching a genuine
`Input.dispatchMouseEvent` at the row's coordinates, then reading the detail panel's text back out
of the DOM. The first attempt used `element.click()`, which is not the same event and taught
nothing; the row element also has `display: contents`, so its bounding box is 0×0 and the click
has to be aimed at a cell. Every unit test in this slice passed throughout — the bug lives
entirely in the gap between a handler being *passed* and a handler being *called*.

**Would have cost.** A demo where the headline interaction — click an exception, see why it was
flagged — does nothing on camera, with a green suite and a clean build saying it was finished.

**Second instance, found by the guard itself.** Blade's `Badge` renders its label as a `<p>` and
exposes no `as` prop, so the coloured category pill — the most clickable-looking thing in an
exception row — was dead in the same way and could not be fixed by choosing a different element.
It is wrapped in `<Box pointerEvents="none">` so the click falls through to the cell, which keeps
the design-system component and the row click both. The table library does the same thing to its
own buttons (`button * { pointer-events: none }`), which is the hint that this is the intended
escape hatch rather than a workaround.

**The guard was wrong twice before it was right.** Worth recording, because it is the same failure
as entry 27 in a new place. Version one clicked the *centre of the cell*, which is empty space: it
passed against a deliberately reintroduced bug, because a click on padding lands on the `<td>` and
is allowlisted whatever the text is wrapped in. Version two clicked the text but always the same
column, so it could only ever have caught a regression in that one cell. Only version three —
click the deepest text-bearing element, and rotate the column across the six verdicts so all six
are covered — actually failed when the bug was put back.

**Permanently changed.** Every element inside a table row is a `span`, a `div` or an `svg`, with a
comment at the cell that says why and points here. `npm run verify:screen` (`scripts/verify-screen.mjs`)
drives a real browser: it asserts 54 rows and 54 distinct record ids, then clicks one row per
verdict — a different column each time — and fails unless the detail panel comes back carrying
that row's id and the right opening. It was confirmed to fail when the bug is reintroduced, which
is the only evidence that a guard guards anything. The rule this generalises to: a click handler
is not verified by a test that calls the handler, only by an event a person could actually
produce — aimed where a person would actually aim it.

---

## 29. The free model could do both halves of the job, but not at the same time

**Believed.** The eval harness could be run for free on Gemini before spending anything on an
Anthropic key. The check that produced that recommendation was that `gemini-2.5-flash` supports
tool calling, and supports structured output. Both facts are true, and the Vercel AI SDK exposes
both through the same `generateText` call the agent already uses, so the swap looked like one line:
`google(...)` in place of `anthropic(...)`.

**Broke.** Google's API refuses the two **together**:

```
AI_APICallError — Function calling with a response mime type:
'application/json' is unsupported
```

`Output.object` sets that response mime type, and `investigate()` passes `tools` in the same call,
so every record failed. It failed *invisibly*: `investigate()` catches its own errors and reports
`verdict: "FAILED"` rather than throwing, so the first run printed sixteen wrong classifications
and zero tokens rather than one error. The provider's documented `structuredOutputs: false` escape
hatch does not lift it — verified, same error with the option set.

The agent cannot give either half up. The Zod enum is what makes a sixth category unrepresentable
(§15.3) and the tools are what make it an investigation rather than a guess. Running it on Gemini
without structured output would have scored *a different agent than the one that ships*, which is
worse than having no free number at all.

**Caught by.** Probing the boundary in layers instead of guessing: a bare `generateText` against
Gemini (worked), then the exact call `investigate()` makes with the error uncaught (the message
above), then tools-alone and `Output.object`-alone as separate requests. Both halves returned the
*correct* category, `PARTIAL_PAYMENT`, which is what pinned the fault on the combination rather
than on the prompt, the schema, the key or the network.

**Would have cost.** The believed version had already been said out loud as a recommendation, and
acted on — a key was created and added to `.env` on the strength of it. Shipped, it would have put
a Gemini agreement number in the pitch that was measured on an agent the product does not run.

**Permanently changed.** Three things.

- `resolveModelChoice` now refuses a non-Anthropic provider *before* any call, and its error states
  the constraint in full, so the next person does not spend a run rediscovering it. Two tests assert
  the message still names the constraint and not merely "unsupported".
- The reasoning is written into `src/lib/eval/model.ts` as a comment, next to the code it explains,
  rather than left only here.
- `runEval` was split out of `scripts/eval.ts` so the entire loop — pacing, retries, token
  accounting — is driven end to end by `MockLanguageModelV4` in `npm test`, with no API key and no
  spend. The reason a free provider was wanted was to exercise the harness; a mock does that
  better, deterministically, and in the suite rather than by hand.

**The general lesson, since it is the second time this shape has appeared.** "X supports A" and
"X supports B" do not compose into "X supports A and B". Both sub-claims verified cleanly and the
conjunction was still false. When a plan depends on two capabilities at once, the thing to verify
is the conjunction — and the cheapest verification is one real call, which here took under a
minute and would have cost nothing to run before recommending the provider.

---

## 30. The screen verification broke the moment the screen got a second place to show a record id

**Believed.** `scripts/verify-screen.mjs` was independent of anything added to the page around
the table. It finds a row by searching the whole document for an element whose text is exactly a
record id, then walks up to that element's `[role="row"]` ancestor and clicks a cell in it.

**Broke.** The Explain panel renders record ids too, as citation links, and it sits *above* the
table. So the document-wide search started matching the citation link instead of the table cell,
`closest('[role="row"]')` returned null, and two of the six row-click checks failed with "no
clickable text in the tax cell of row pay_...". The row was fine; the search was looking in the
wrong place. The same assumption sat in the count of distinct record ids, which read
`document.body.innerText` and so would have counted a cited id as if it were a row.

**Caught by.** Deliberately installing a fixture answers file to exercise the citation branch,
because `data/synthetic/explanations.json` is `[]` until a run with an API key happens and every
citation assertion would otherwise have passed vacuously. `npm run verify:screen` was green
before and after the panel was added — it only failed once there was an answer for the panel to
render.

**Would have cost.** Nothing would have looked wrong until the first real `npm run explain`,
which is scheduled for the day the key is loaded — so the first bake would have turned a
previously green verification red, with the failure message pointing at the table (the thing
BUILD-LOG 28 is about) rather than at the script. That is a bad half hour to spend on the day
before a deadline, chasing a row-click bug that does not exist.

**Permanently changed.** Three things.

- Both searches in `verify-screen.mjs` are now scoped to `[role="row"]` rather than to the
  document, with the reason written at the point of the change.
- The script asserts the Explain panel in **two branches and prints which one it took**: with no
  recorded answers it requires the panel to *say* so, and with answers it requires a citation link
  that opens its record's detail panel. Neither branch can pass vacuously, and a green run can no
  longer be mistaken for coverage it did not have.
- It also asserts, unconditionally, that all 54 rows carry the `row-<recordId>` anchor a citation
  scrolls to. That is the half that fails silently — a citation whose target id does not exist
  scrolls nowhere and looks exactly like one that worked — and it is checkable with zero answers
  recorded.

**It happened again within the hour, same cause.** The check counting example questions read
`panel.querySelectorAll("button").length`. Adding the live "Ask" button to the same panel made it
count 7 where 6 were expected — a red run caused entirely by the assertion, not by the page. Now
scoped to a `[data-testid="explain-questions"]` container. Two instances of one mistake in one
sitting is the argument for the rule rather than for the individual fix: **every DOM query in a
verification script is scoped to the thing it is asserting about, never to the page.**

**A second, unrelated defect the same change surfaced.** The new route check is an `async`
expression, and `Runtime.evaluate` returns a *promise handle* rather than a value unless
`awaitPromise: true` is passed. The assertion read `status: undefined` and failed loudly, which is
the good outcome — but a check written as `if (status === 400) pass` instead of
`if (status !== 400) fail` would have silently passed for the rest of the project's life. The
helper now takes `awaitPromise` explicitly. **Prefer asserting the failure condition over
asserting the success condition, because `undefined` satisfies neither and only one of those two
shapes notices.**

**The general lesson.** A verification script encodes assumptions about the page as surely as the
page encodes assumptions about the data, and "this element's text is a record id" stopped being a
unique identifier the moment a second component had a legitimate reason to print one. Worth
noting that the *only* reason this surfaced now is that the citation branch was exercised with a
fixture rather than left until the data existed; a conditional assertion over an empty file would
have reported success.

---

## 31. The double-entry check only caught one of the two ways a voucher can be wrong

**Believed.** `applyActGate` verified the drafted Tally voucher balanced. Four tests covered the
gate, one of them specifically asserting that an unbalanced voucher is refused, and all passed.

**Broke.** `balances()` compared total debits against total credits with `===`, but nothing in the
suite could tell that apart from `>=`. The one unbalanced fixture had debits **below** credits
(₹24.00 against ₹28.32), so a mutation to `>=` still refused it and every test stayed green. A
voucher posting **more** to the expense side than it took off the bank would have been accepted and
offered for confirmation. The same pass found a second survivor: deleting the
`Number.isSafeInteger` guard in `toPaise` changed nothing any test could see, even though a figure
past 2^53 is reachable — the model can write one — and would have produced a silently wrong paise
value.

**Caught by.** The mutation pass over `figures.ts` and `policy.ts`, run before presenting the
checkpoint. Seven of nine mutants died; these two survived. Both were checked for reachability
first, and both were reachable, so both earned a test rather than a deletion.

**Would have cost.** Nothing visible. An unbalanced voucher is refused by Tally on import, so the
merchant would have found out at the point of posting a correction, with a draft this product told
them was confirmed. The at-risk figure it was drafted from would have been right, which is the
worst version — the number checks out and the entry does not.

**Permanently changed.** `tests/act-policy.test.ts` now asserts the debits-exceed-credits direction
explicitly, and `tests/act-figures.test.ts` asserts that an amount past the safe-integer range comes
back as `paise: null` rather than a number. The general rule this is the second instance of: when a
comparison has two failing directions, a fixture that only exercises one cannot distinguish `===`
from an inequality.

---

## 32. A batch row that claimed 54 records with nothing underneath it

**Believed.** The live Explain route's lazy parent creation was complete: it reused the latest
`batches` row for the period or inserted one, and that was enough of an audit parent for an
`ai_calls` row to attach to.

**Broke.** It inserted the batch row alone. `batches.total_records` is written from the matcher and
says 54, so a fresh database answering one live Explain question was left holding a row describing a
run of 54 records with zero `records` rows under it. Nothing read `records`, so nothing failed and
no test could have noticed. `actions.record_id` is a foreign key into `records`, so the Confirm
button was the first thing that would ever have found out — and it would have found out as a
foreign-key violation at the moment a person clicked, not before.

**Caught by.** Reading the schema while deciding what `actions.record_id` should point at, before
writing the Confirm route. Not by a test, and no test would have: the defect is an absence.

**Would have cost.** The first Confirm on a deployment whose database had only ever served Explain
would have failed with a 500 and no row written. Recoverable, but it fails at the one interaction
the whole Act layer exists for.

**Permanently changed.** `src/lib/audit/persist.ts` — one `ensureBatchWithRecords` helper, shared by
both routes, that writes the batch and all 54 record rows in a single transaction and backfills the
records for a batch that has none. The rule it encodes: a parent row whose own columns describe its
children is not written without them, and the whole batch is written or none of it — a partial batch
reads as a complete run that lost 53 rows.

---

## 33. The Act layer told merchants to edit a row the portal stopped letting them edit

**Believed.** GSTR-3B Table 4's structure was settled by GSTN's 2022 advisory on the Table 4
relabelling. The Act layer's flag was built on it: `INCLUDE` / `EXCLUDE` / `DEFER` against row
`4A5` ("All other ITC"), the row GST on a gateway fee arrives in.

**Broke.** The advisory is genuinely the right source for what the rows *are* — it is the
instrument that restructured the table — but it says nothing about what a taxpayer may still
*do* to them. Since the October 2025 tax period (CBIC Notification 16/2025) row `4A5` has been
auto-populated from GSTR-2B according to the merchant's Invoice Management System actions.
There is nothing there for a person to type over. Credit is given back by REVERSING it in
4(B) — writing a smaller number over the claim only creates a 2B-to-3B mismatch the portal now
validates against. So every one of the three actions was wrong on that row: `EXCLUDE` and
`INCLUDE` describe edits the form does not offer, and `DEFER` describes a row-level hold that
does not exist.

**Caught by.** Nothing in the codebase — a question about research practice. The 2022 date was
mentioned in passing, and the reply was: live web search, Context7 and Exa are all connected, so
why lean on old consensus? Re-running the research turned up the October 2025 auto-population
immediately. The failure was never the age of the source; it was answering *"what made this
true?"* and never separately asking *"is it still true?"*

Worth recording precisely, because a second claim did **not** survive the same check. Phase 2
"hard-locking" of Table 4, widely reported as landing in the July 2026 tax period — which is the
period this project reconciles — has **no traceable authorising instrument.** Phase 1 does:
GSTN Advisory No. 606 of 7 June 2025 locked the outward-liability rows from July 2025. For Table
4, contemporaneous trade sources published *after* the July 2026 return was due still say no
advisory fixing a date could be found. The vocabulary was changed on the auto-population fact,
which is notified and dated. It was **not** changed on the locking claim, which is not.

**Would have cost.** The layer's whole promise is that a person can act on the draft. A merchant
following it would have gone looking for an editable box that is not there, and the one who
found a way to force the figure would have created exactly the mismatch that blocks a return.
Worse, `EXCLUDE` on a `TIMING` record — a credit that simply lands on the following month's
GSTR-2B — is advice to give up money the merchant is still owed.

**Permanently changed.** Three things, in increasing order of durability:

- `4A5` is **gone from the vocabulary**, so a draft naming it does not decode at all. The rows
  that remain (`4B1`, `4B2`, `4D1`, `4D2`) are the ones a person still fills in by hand.
- `NO_ENTRY` with a null row was added, because "nothing belongs on this return" is the correct
  answer for a timing difference and there was previously no way to say it.
- Each row admits exactly one action, and the gate checks the two halves against each other —
  the same redundancy the voucher's debits-equal-credits check relies on. `tests/act-gstr3b.ts`
  states that table independently of the map the code reads, and asserts it covers every row, so
  a row added later without a decision about what may be done on it fails the suite.

And the research rule, which is the one that generalises: **provenance and currency are two
separate questions.** Finding the instrument that established a fact does not tell you whether
it still holds. Run the second search, and say plainly which claims rest on a named instrument
and which rest only on commentary.

---

## 34. The screen verification spent a run grading a build that no longer existed

**Believed.** `npm run verify:screen` reports on the tree as it stands. Rebuild, restart the
server, run the check.

**Broke.** Killing the server by the pid of the `npx` wrapper leaves its `next-server` child
alive and holding port 3000. The replacement then dies with `EADDRINUSE` — into a log file
nobody reads — and the *old* server keeps answering. The check ran happily against a build
compiled before the change being verified.

**Caught by.** Luck, and only because the assertions happened to be sharp enough. The run
reported `expected 3 drafted actions, found 0` while `data/synthetic/drafts.json` plainly held
16. Had the change been one those assertions did not cover, the run would have printed OK.

**Would have cost.** Far more than a wasted run. A green screen verification is the evidence
this project uses to claim the UI works, and one that silently grades a stale build is worse
than no check at all — it converts "not verified" into "verified", which is the one direction
that cannot be recovered from by looking harder.

**Permanently changed.** `scripts/verify-screen.mjs` now reads `.next/BUILD_ID` and asserts it
appears in the page the browser actually loaded, failing with an instruction to stop the server
already on the port. The guard was tested by pointing it at a deliberately wrong build id and
confirming it fires, rather than by assuming it would.
