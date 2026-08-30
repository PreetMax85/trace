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
claim about "matching against GSTR-2B" would have been false, and any judge who works in GST
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

**Would have cost.** The single most quotable line in the pitch, unsourced, delivered to judges
who work in this domain daily. "Where's the survey?" has no good answer.

**Permanently changed.** Replaced with what the thread actually says, linked, and explicitly
labelled *practitioner testimony from a forum discussion, not a controlled survey*. The Zoho
Payments article (16 June 2026) was verified and promoted to carry the argument instead — a
competitor documenting the exact gap in writing is stronger evidence than a statistic anyway.
Commit `bfb3662`.

---

## 6. A field claimed in three places that never existed

**Believed.** PRD §4, §6 and §11 all described a per-record **confidence tier** logged in the
audit trail. §11 listed it in the table of how the project meets the track's bar.

**Broke.** No `confidence` column had ever existed in the schema. The claim had propagated
across three sections without anything checking it against the code.

**Caught by.** Grepping the PRD's claims against the actual schema during a full audit.

**Would have cost.** A falsifiable claim in the "how we meet the requirements" table — the one
table a judge is most likely to verify, and the cheapest possible thing to catch us on.

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
  reaching a judge is worse than a code bug.
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
