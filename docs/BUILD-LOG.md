# Build log

Seventeen things that turned out to be wrong while I was building Trace. Most of them were not
crashes. They were code that ran, produced a plausible number, and passed its tests.

That is the whole reason this file exists. In tax software, being confidently wrong is worse than
not existing, because somebody acts on it. So every entry below has the same three parts: what I
thought was true, what was actually true, and the guard that stops it happening again.

---

## 1. Two days written against the wrong government form

**Thought.** The statement schema I had built the fixture and the parser against was GSTR-2B.

**Actually.** It was GSTR-2A. Different statement, different purpose, different field names all
the way down: `flprdr1` instead of `supprd`, nested `itm_det` instead of flat `items`,
`camt`/`samt`/`iamt` instead of `cgst`/`sgst`/`igst`. GSTR-2A is the older running ledger. GSTR-2B
is the static monthly statement that actually decides what a merchant may claim. Two days of work,
discarded.

**Now.** Every domain fact gets checked against the government's own published schema before it
becomes code, and the parser rejects a 2A document rather than quietly reading it as a 2B.

---

## 2. Two rate cells that were impossible to tell apart

**Thought.** Pricing a settlement fee against each published rate card within ₹1 uniquely
identifies which card was billed.

**Actually.** The standard rate is 2% and the corporate rate is 2.15%. They are 0.15 percentage
points apart, so below a transaction value of about ₹572 the two expected fees differ by less than
the ₹1 tolerance and a single fee satisfies both cells at once. Two records resolved to both, and
which one won came down to the iteration order of an object. The headline match rate would have
been nondeterministic: the same data, run twice, could give two different answers.

**Now.** A test asserts no record resolves to more than one rate cell, and the matcher reports
ambiguity instead of taking the first hit.

---

## 3. A category that would have matched zero records

**Thought.** A netted refund can be found by looking for a refund sharing a settlement ID with the
payment it reverses.

**Actually.** A refund is deducted from a **later** settlement cycle than the payment it reverses,
and almost never shares its settlement ID. The rule would have found 0 of the 4 refunds in the
batch, and the category would have looked simply unused rather than broken.

**Now.** Refunds are resolved through the payment id, and a test asserts all four are found.

---

## 4. A zero-value row that matched "exactly"

**Thought.** If the fee is within ₹1 of what a rate predicts, that rate explains it.

**Actually.** 2% of nothing is nothing. A failed-and-retried payment carries an amount of 0 and a
fee of 0, so the standard rate predicts 0 and the difference clears the tolerance with room to
spare. All three of them came back as clean exact matches. The tolerance was asking "is the fee
close to what we expected" when the real question is "is there a fee to explain at all".

**Now.** Zero-value rows are separated before any rate is applied, and a test holds them there.

---

## 5. Rounding that was not rounding

**Thought.** Multiplying an amount by a rate and rounding the result gives the fee.

**Actually.** It gives whatever IEEE-754 does to the product, and then rounds that. ₹2,850 at
2.15% is exactly 6127.5 paise. In floating point it evaluates to 6127.499999999999 and rounds
down to 6127, where every rounding convention says 6128. Scanned across the range, the float
expression disagrees with exact arithmetic 1,320 times, and three of the 54 records sit on it.
The fixture generator used the same expression, so the data and the matcher agreed with each
other by construction and both were wrong.

**Now.** Fees are computed in integer paise throughout, and the test compares against exact
arithmetic rather than against the same expression under a different name.

---

## 6. The month-boundary rule was using the wrong month boundary

**Thought.** A settlement timestamp can be read as UTC to decide which return period it belongs
to.

**Actually.** A GST return period is a calendar month in India, and a Unix timestamp carries no
timezone at all. Reading these instants as UTC mislabels every settlement in the last five and a
half hours of a month. 31 July, 20:00 UTC is 1 August, 01:30 IST. So the one rule whose entire job
is catching month-boundary crossings was itself on the wrong side of the boundary, in exactly the
window that settlements crowd into.

**Now.** Period resolution converts to IST first, and there are tests on both sides of the
boundary.

---

## 7. A timestamp in the wrong unit, and a filing period that does not exist

**Thought.** The input guards would catch a malformed timestamp.

**Actually.** Milliseconds are a perfectly good integer, so a payload carrying the same instant
times a thousand passed every guard. The period resolver then read it as a date roughly 54,000
years out. That is not an error, just a different filing period, so the record was measured
against a statement that does not exist and could never match. One such row silently took the
batch from 38 matched to 37 and moved the reconciliation gap by ₹5.40, with nothing anywhere
saying so.

**Now.** The guards check the plausible range of a settlement date, not just the type.

---

## 8. Every supplier on the statement summed into one invoice

**Thought.** The statement is the payment gateway's invoice, possibly split across a few lines.

**Actually.** A merchant's GSTR-2B carries every supplier who filed against their GSTIN. The
landlord, the software vendor, the courier. It is the whole month of purchases, and the gateway is
one row of it. Adding a single unrelated vendor to the fixture took the invoice tax from ₹1,196.92
to ₹19,196.92. Worse, the eligibility check had the same scope, so any other supplier marking
their line ineligible would have written off every rupee of the gateway's credit.

**Now.** Everything is filtered by the supplier's GSTIN first, and a test adds an unrelated
supplier to the fixture and asserts nothing moves.

---

## 9. Credit reported at risk that I had already decided was safe

**Thought.** The reconciliation gap is the amount of credit at risk.

**Actually.** The gap is not one thing. It decomposes into ₹126.36 of refund tax and ₹214.69 of
unexplained fee tax. The refund half contradicts a decision made much earlier in the project: a
gateway does not return its fee when a transaction is refunded, so the tax on that fee is still a
real input tax the merchant paid and the credit on it is untouched. Those rows are exceptions for
a reason that has nothing to do with whether the credit is good. Sweeping them into "at risk"
overstated the loss by more than half.

**Now.** The two halves are computed and displayed separately, and a test asserts they still sum
to the gap.

---

## 10. A detector that would have rejected a real statement

**Thought.** Six field names appear only in GSTR-2A, so finding any of them proves the document is
a 2A.

**Actually.** Only three of them are exclusive. The other three are 2A's names for the tax heads
inside a line item, and a genuine GSTR-2B uses those same names elsewhere: the import-of-goods
section carries one of them, and the credit summary totals all three. So a real GSTR-2B belonging
to a merchant who imports anything would have been rejected as the wrong form. A false rejection
is the most confusing possible way to be wrong, because the person would go hunting for a
document mix-up that never happened.

**Now.** The detector only looks at the three genuinely exclusive names, and there is a test with
an import section in it.

---

## 11. The wrong section of the Act, and the obligation pointing backwards

**Thought.** A netted refund creates a credit reversal obligation under Section 41, and the record
should be flagged for reversal review.

**Actually.** Two errors stacked. Section 41 was substituted in October 2022 and no longer carries
the reversal machinery at all. And more seriously, the obligation runs the other way. Since the
gateway keeps its fee on a refunded transaction, the tax on that fee stays claimable and there is
nothing to reverse. What the merchant actually owes is a credit note to their own customer under
Section 34, due by 30 November after the end of that financial year. The tool would have told a CA
to give back credit they are legally entitled to keep.

**Now.** The column is named for what it means, the deadline is written beside it, and a test
asserts exactly the four refunded records carry the flag and nothing else does.

---

## 12. Telling merchants to edit a row the portal stopped letting them edit

**Thought.** A correction goes in row 4A5 of the return, which is where claimed credit sits.

**Actually.** Since the October 2025 tax period that row is auto-populated from the statement
according to what the merchant did in the Invoice Management System. There is nothing there to
type over. Credit is given back by reversing it in row 4B, and writing a smaller number over the
claim only creates a mismatch the portal now validates against. All three of the actions the
drafting layer could suggest were wrong for that row.

**Now.** The row vocabulary matches what the current form actually offers, each exception admits
exactly one action, and a test checks the pairing.

---

## 13. Sixteen drafts that said "nothing is due", and a check that agreed with all of them

**Thought.** The drafting layer was finished. Its vocabulary had been rebuilt, every case had a
test, and a browser run on a fixture covering all four shapes behaved correctly.

**Actually.** The first real run returned "no entry required" on all sixteen flagged records,
including the four carrying the entire ₹214.69 at risk. The instructions described the usable rows
abstractly and only ever gave a worked example for the do-nothing case, with a warning attached,
so that is the one case that got learned. And the check sitting after it could not see the
problem, because it only asked whether each draft was consistent with itself. A draft saying
nothing is due, beside an empty row, is perfectly consistent with itself. Sixteen wrong answers
were self-consistent, and self-consistency was the entire test.

**Now.** The check compares the draft against the record it is about, not against itself, and a
draft quoting a figure its record does not carry cannot be confirmed at all.

---

## 14. Clicking a row did nothing, and no test could have seen it

**Thought.** The table rows were interactive because the component said they were and the
handlers were wired.

**Actually.** Clicking a row did nothing at all. The table was built on a component whose row only
forwards a click when the thing you clicked is one of five tag names. The settlement cell rendered
its id inside a `<code>` and its text inside a `<p>`, neither of which is on that list, so any
click that landed on actual text was discarded silently. No error, no warning, nothing in the
console. Only the few pixels of cell padding worked. It was not in the documentation or the
types; it was behaviour of a dependency two levels down.

**Now.** The rows are ordinary elements with their own handler, and a browser check clicks a row
of every verdict on every run.

---

## 15. A test that named its own subject wrongly and passed anyway

**Thought.** There was a test proving the system handles a tool that fails.

**Actually.** The failing tool in that test had a name the permission boundary rejects, so the
call was refused before it ever ran. The test was exercising the permission boundary, not tool
failure. It passed because both paths end at the same category and the assertion only checked the
category. Mutation testing cannot catch this, because it proves a test fails when the code breaks,
not that the test is aimed at the right thing.

**Now.** Where two paths share an outcome, the assertion is on the field that separates them, not
on the outcome.

---

## 16. Everything graded the numbers, nothing asked what the page said it was

**Thought.** The screen was finished. Every figure was correct and every check was green.

**Actually.** Somebody seeing it for the first time could not tell what it was. The product's name
appeared nowhere on the page, only in the browser tab. There was no statement of what was being
reconciled or against what, no mention that the data is synthetic, and no link to the source. Four
more problems came out of the same look, none of which any test could see: the server was sending
class names with no stylesheet to match them, so every load painted unstyled for a second; on a
phone the document was wider than the screen and the whole body scrolled sideways; an unknown URL
got the framework's bare default; and a client-side error fell through to a crash screen.

**Now.** The browser check grades whether the page says what it is, not only whether the figures
are right, and it measures the document width at 390px on every run.

---

## 17. Confirm buttons that painted their label black on indigo

**Thought.** Moving the button's font size onto the project's own type scale was a cosmetic change
with no other effect.

**Actually.** The class merger does not read CSS, it reads names, and it has to decide which of two
`text-*` classes wins by working out whether each one is a size or a colour. The new name is
neither a standard size nor a raw length, so it was filed as a colour. The button composes its
text colour from its variant and its size from its scale, in that order, so the real colour was
dropped as the loser of a conflict that did not exist. The label fell back to the page's ordinary
ink: near black on indigo, about 2:1, well under the 4.5:1 a label needs. The class it replaced
had always been recognised as a length, which is why nothing had gone wrong before.

**Now.** The merger is configured with the project's own size names, and a test asserts a size and
a colour survive being combined.
