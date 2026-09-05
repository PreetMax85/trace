# Trace — Product Requirements Document

**Version:** 2.0  
**Track:** AI Finance Controller (Track 04) — Razorpay AI Buildathon 2026  
**Deadline:** September 5, 2026  

---

## 1. Problem

Every merchant using Razorpay pays MDR (Merchant Discount Rate) fees. 18% GST sits on top of every MDR charge. That GST is fully claimable as Input Tax Credit (ITC) — but only if it appears in the merchant's GSTR-2B and matches their own settlement records.

It never matches automatically. Here's why:

Razorpay bills MDR on **one consolidated tax invoice per month** — not per settlement, and not per transaction. Each settlement batches hundreds of transactions, nets out MDR + GST, deducts refunds, and sends a single NEFT credit to the merchant's bank, but the tax invoice backing all of those deductions arrives once a month. GSTR-2B therefore carries a *single* Razorpay line for the period, and the merchant has to reconcile hundreds of individual fee deductions against that one number. Their bookkeeper meanwhile records sales per-transaction in Tally. Three sources, three formats, three levels of granularity — none of them align without manual effort.

**The cost:** practising CAs put manual GSTR-2A/2B reconciliation at **2–4 hours per client per month** in Excel, with firms carrying 100+ clients losing **over 100 staff hours a month** to it ([CAClubIndia thread, 31 March 2026](https://www.caclubindia.com/forum/how-long-does-gstr-2a-reconciliation-take-your-firm-per-client-quick-survey-615053.asp)). That is practitioner testimony from a forum discussion, not a controlled survey, and is cited as such. Every unmatched entry is potential ITC left unclaimed.

**The gap nobody has filled:** generic GST matching tools — ClearTax, OptoTax, IRIS, TallyPrime with an ERP connector, Zoho Books — take CSV or ERP uploads and match a purchase register against GSTR-2B. None take Razorpay's settlement API as input. None classify *why* a mismatch happened. None bridge per-transaction fee deductions to the single consolidated invoice line GSTR-2B actually shows, or surface the Section 34 credit-note obligation a netted refund creates.

[Zoho Payments published an article on exactly this gap](https://www.zoho.com/payments/academy/regulatory-compliance/gst-reconciliation-and-gst-invoice-records.html) on 16 June 2026: *"A settlement report alone does not satisfy that record trail,"* and *"the practical check before each period closes is whether the gateway's tax invoice for that period has appeared in GSTR-2B."* It states the problem precisely and stops there — Zoho's own answer is a Tax Invoices report and a Refund Summary report for a human to read. A competitor has documented the problem in writing and shipped no automation for it.

---

## 2. What Trace Does

Trace is a financial co-pilot that closes the full loop: from "why is my settlement short?" to the specific action the merchant needs to take next.

Three layers, each dependent on the one before:

**Detect:** Batch pipeline matches Razorpay settlement MDR-GST data against GSTR-2B entries. Runs on 50+ records. Produces match rate, ITC claimable, ITC at risk. The backend — merchants never see raw batch output.

**Explain:** Conversational interface over the batch result. Merchant asks "why is my settlement ₹3,000 short this month?" — Trace answers in plain language, referencing the specific records, amounts, and dates from their actual batch. Every question is different. Every batch result is different. No template can answer this.

**Act:** For each explained exception, Trace drafts the next action the merchant needs to take — the CA email with settlement ID and Section 34 credit-note amount prefilled, the GSTR-3B line flagged for correction, the Tally correction entry. Merchant reviews and confirms before anything is sent. Trace never acts without a human gate.

**The USP in one sentence:** Trace finds where your settlement money went, explains it in plain language, and prepares the next action — your CA email, your GSTR-3B correction, your Tally entry — ready for you to confirm and send.

**Where the AI sits, and why:** The Detect layer is deterministic (rules-based matching). The Explain layer requires AI — every merchant's question is different, every batch has different amounts and dates, no template handles this. The Act layer requires AI — drafting a contextually accurate CA email with the correct settlement ID, rupee amounts, and regulatory reference (Section 34, GSTR-3B line) for that specific record is not a fill-in-the-blank problem. The deterministic half could be a spreadsheet; the language half could not.

**Design principles:** Razorpay's own bar language (Track 01: "every money action explainable, bounded and gated") maps directly onto the three layers, not by design intent added after the fact — it's what the architecture already does. Detect is **bounded**: five fixed exception categories, nothing open-ended. Explain is **explainable**: every answer traces back to a specific record, amount, and date in the batch. Act is **gated**: every drafted action waits for human confirmation before anything sends.

---

## 3. User

**Primary:** A merchant-owner who wants to understand what happened to their settlement money without learning GST jargon or opening a spreadsheet.

**Secondary:** A CA or accountant managing GST compliance for 1-10 Razorpay merchants — receives the drafted email/correction entry Trace prepares, reviews and files it.

**What the merchant knows:** Nothing about GSTR-2B, ITC, or MDR. They know their bank balance and their Tally number don't match, and they want to know why in plain language.

**What they're doing today:** Calling their CA, waiting for a callback, getting an explanation days later, still not sure what to do next. 5-20 hours of CA time per month, per the CA Club India survey (Dec 2025), spent on exactly this gap.

---

## 4. Scope

### In scope

- Single merchant (one GSTIN, one Razorpay test account)
- 50+ synthetic transactions across 2 months (July–August 2026)
- **Detect:** Matching Razorpay `fee` + `tax` fields (from `fetch_settlement_recon_details`) against GSTR-2B `txval` + `cgst`/`sgst`/`igst` fields
- **Explain:** Conversational Q&A interface over batch results — merchant asks in plain language, agent answers using that specific batch's data
- **Act:** Drafted next-action per exception — CA email (prefilled settlement ID, amounts, Section 34 reference), GSTR-3B correction flag, Tally correction entry. Draft only — human confirms before send.
- Section 34 credit-note flagging for refund-adjusted settlements, and `itcavl` ineligibility flagging from GSTR-2B
- Batch report: match rate %, ITC matched (₹), ITC at risk (₹), exception breakdown by category
- Audit trail: every decision logged with timestamp, match method, resolved rate cell, source fields

### Out of scope

- Multiple merchants / multi-GSTIN management
- TDS reconciliation (Form 26AS, Section 194-O) — separate compliance domain
- GSTR-3B auto-filing or pre-population — Trace flags the line, never files it
- Actually sending the CA email or pushing the Tally entry — draft and human-confirm only, never auto-send
- Real-time live data (test-mode API only)
- Machine learning or adaptive training loops
- Auth/login — single merchant, single account, demo scope. No login screen. Production version would add merchant-scoped access control.

---

## 5. Data Sources

### Source 1: Razorpay Settlement Recon API

**Endpoint:** `fetch_settlement_recon_details` (via `razorpay-mcp-server`)  
**Mode:** Test mode (`rzp_test_` keys, no KYC required)

Key fields used:

Field list verified against Razorpay's official SDK docs (`razorpay-node/documents/settlement.md`), not assumed:

| Field | Type | Description |
|---|---|---|
| `entity_id` | string | **The actual payment/refund ID** (`pay_…` / `rfnd_…`). This is the per-record identifier — use it as `record_id`. |
| `type` | string | `payment` or `refund`. Refunds are separate line items, not adjustments to a payment row. |
| `settlement_id` | string | Primary batch identifier |
| `order_id` | string | Per-order reference |
| `payment_id` | string | ⚠️ `null` on **payment** rows — the payment's own ID is in `entity_id`. On **refund** rows it *is* populated, pointing at the payment being reversed, which makes it the join key for `REFUND_NETTED`. |
| `fee` | integer | MDR in paise (÷100 = ₹) |
| `tax` | integer | GST on MDR in paise (÷100 = ₹) |
| `amount` | integer | Gross transaction amount in paise |
| `credit` | integer | Amount credited in paise (payments) |
| `debit` | integer | Amount debited in paise (refunds) — 0 on payment rows |
| `method` | string | Payment method (card/upi/netbanking) |
| `created_at` | unix timestamp | Transaction timestamp |
| `settled_at` | unix timestamp | Settlement timestamp — source of the T+2 boundary in `TIMING` |

### Source 2: Synthetic GSTR-2B (B2B Table)

**GSTR-2B is not GSTR-2A, and the two schemas differ in every field name that matters.** Earlier
drafts of this document specified the GSTR-2A shape (`flprdr1`, `fldtr1`, `inv_typ`, `idt`,
`itms`/`itm_det`, `camt`/`samt`/`iamt`) — none of those fields exist in GSTR-2B. The shape below is
GSTR-2B, cross-checked against three independent renderings of GSTN's API: Vayana's GSTN API docs,
Sandbox's Upload GSTR-2B reference, and fyn-gateway's GSTN developer-portal mirror.

One statement is generated **per return period**, so each month is its own file.

```json
{
  "gstin": "27TESTM1234A1Z0",
  "rtnprd": "072026",
  "gendt": "14-08-2026",
  "version": "1.0",
  "docdata": {
    "b2b": [
      {
        "ctin": "27AAGCR4375J1ZY",
        "trdnm": "RAZORPAY SOFTWARE PRIVATE LIMITED",
        "supprd": "072026",
        "supfildt": "11-08-2026",
        "inv": [
          {
            "inum": "RZP/TAX/2026-07/0041882",
            "typ": "R",
            "dt": "31-07-2026",
            "val": 2301,
            "pos": "27",
            "rev": "N",
            "itcavl": "Y",
            "rsn": "",
            "items": [
              {
                "num": 1,
                "rt": 18,
                "txval": 1950,
                "igst": 0,
                "cgst": 175.5,
                "sgst": 175.5,
                "cess": 0
              }
            ]
          }
        ]
      }
    ]
  }
}
```

**GSTINs must pass the check-digit algorithm.** `27AAGCR4375J1ZU`, used in earlier drafts as
"Razorpay's GSTIN", is not a valid GSTIN — it welds Maharashtra's state code to the Karnataka
registration's check digit. Razorpay's real Maharashtra registration is **`27AAGCR4375J1ZY`**; the
Karnataka one is `29AAGCR4375J1ZU`. The seeded merchant is `27TESTM1234A1Z0` — an obviously synthetic
PAN so it cannot collide with a real business, with a correct check digit so it survives validation.
Anyone pasting an invalid GSTIN into the GST portal is a worse failure than any code bug, so this
is asserted in `tests/fixtures.test.ts`.

**Granularity — read this before the mapping table.** One GSTR-2B `inv` entry covers a whole
filing period, because Razorpay issues one consolidated MDR tax invoice per month. There is **one**
Razorpay invoice line per period in the B2B table, not one per transaction, and **no
per-transaction invoice number exists anywhere in Razorpay's data** — the eight Payment Gateway
reports do not carry one. Every 2B field below is therefore a *period-level total*, and maps to a
**sum across recon rows**, never to a single row.

| GSTR-2B field | Razorpay equivalent | Notes |
|---|---|---|
| `ctin` | Razorpay GSTIN | `27AAGCR4375J1ZY` (Maharashtra) |
| `txval` | `SUM(fee - tax)` ÷ 100, over the period | MDR ex-GST in rupees. Razorpay's `fee` is **inclusive of tax**; `tax` is the GST portion inside it |
| `cgst` + `sgst` | `SUM(tax)` ÷ 100, over the period | GST on MDR, intra-state (Maharashtra merchant) |
| `igst` | `SUM(tax)` ÷ 100, over the period | GST on MDR, inter-state. **Always match on `cgst + sgst + igst`, never one field** — a Maharashtra merchant sees CGST+SGST, every other state sees IGST |
| `inum` | Monthly tax invoice number | Period-level. **Not** a per-transaction key — nothing to join a single settlement row to |
| `supprd` | Filing period, `MMYYYY` | Filing lag source (T+2 → next month) |
| `itcavl` / `rsn` | — | **GSTN's own verdict** on whether the credit is claimable, and why not. No Razorpay equivalent; it outranks anything Trace infers |

### Source 3: Razorpay's published rate card

Because no per-transaction invoice number exists, the per-record match target is Razorpay's
**published pricing**, which is a real, citable artifact:

| Rate cell | Fee | Applies to |
|---|---|---|
| `STANDARD` | 2% + 18% GST | Visa/Mastercard/RuPay debit & credit, UPI, netbanking, wallets, pay-later, EMI (domestic standard) |
| `CORPORATE` | 2.15% + 18% GST | Corporate / commercial credit cards |

Source: `https://razorpay.com/pricing/`. Enterprise rates are negotiated and unpublished; the seeded
merchant is on the standard card.

---

## 6. Matching Engine

Matching runs in **two tiers**, because the two sides of the reconciliation are at different
granularities. Tier 1 resolves each settlement row against the published rate card. Tier 2 rolls
the resolved rows up and ties the period total to the single GSTR-2B invoice line.

All comparisons are in **integer paise**. The ₹1 tolerance is exactly `100` paise. Rounding is
deliberately *not* an exception category — it is absorbed by that tolerance.

**Ambiguity is a property of the fee, not of the amount.** Two rate cells 0.15 percentage points
apart produce prices differing by roughly `amount × 0.0015 × 1.18`, and where that difference is
small the ₹1 tolerance cannot tell them apart. Two thresholds follow, and they are not the same
number:

- A **correct** fee, sitting exactly on one cell, can still satisfy the other whenever the two
  prices are within 100 paise of each other — true up to **₹572.32**. (The continuous formula
  gives ₹564.98; both the MDR and the GST on it are rounded to whole paise, and that rounding
  widens the band by ₹7.34. Verified by brute force over every amount from 1 paise to ₹50,000.)
- An **incorrect** fee, sitting between the two cells, satisfies both whenever the prices are
  less than 200 paise apart — true up to **₹1,138.37**. Worked example: on a ₹1,000 payment
  `STANDARD` prices the fee at ₹23.60 and `CORPORATE` at ₹25.37, so a fee of ₹24.49 is within ₹1
  of both.

The matcher therefore **counts how many cells resolve within tolerance and treats more than one
as ambiguous**. It must never compare an amount against a threshold: that test is wrong in both
directions, waving genuinely ambiguous mid-gap fees through as clean matches while flagging
amounts that are fine. An ambiguous fee is reported `EXCEPTION` / `UNEXPLAINED` rather than
resolved by iteration order. The synthetic dataset independently keeps every record resolvable
to at most one cell, so `EXACT` and `FUZZY` stay well-defined.

### Tier 1 — per-record rate-cell resolution

**Step 1: Exact match.** The row's `fee` and `tax` tie to the `STANDARD` rate cell (2% + 18% GST)
within ₹1, **and** `settled_at` falls inside the claimed filing period.

If both hold: record status = `MATCHED`. Log match method = `EXACT`, `rate_cell = STANDARD`.

**Step 2: Fuzzy match (alternate rate cell).** If Step 1 fails, retry against every other published
rate cell — currently `CORPORATE` at 2.15% + 18% GST. A row that ties to one of those within ₹1 is
matched, not an exception: the fee was correct, it was simply billed at a cell the merchant did not
expect.

If a cell matches: record status = `MATCHED`. Log match method = `FUZZY`, `rate_cell` = the cell
that resolved it.

There is deliberately **no separate confidence field**. `match_method` *is* the confidence tier —
`EXACT` means the merchant's expected rate held, `FUZZY` means a different published cell explained
it, `NONE` means nothing did. A second column would be a pure function of the first and could only
ever drift out of step with it.

**Step 3: Exception queue.** Everything unresolved after Steps 1 and 2 enters the exception
classifier in Section 7.

**Mode flag (required, not optional).** The matcher runs in `exact-only` or `exact+fuzzy` mode.
Exact-only reconciles 30/54 = 55.6%; enabling the alternate-cell pass lifts it to 38/54 = 70.4%.
Both modes must be runnable so the lift is demonstrated rather than asserted. Build this in from
the start — it must not be retrofitted.

### Tier 2 — period rollup against GSTR-2B

For each filing period, sum `tax` across the period's matched records and compare that total to the
period's single GSTR-2B invoice line (`cgst + sgst + igst`), within ₹1.

The residual is the reconciliation's actual output: **the delta between the 2B invoice total and the
matched rollup is exactly the tax on the exceptions billed in that same period.** `TIMING` records
are excluded from the delta by construction — they are billed in the *following* period, so they
appear in the next month's invoice rather than this one. A batch is fully explained when those two
numbers agree. This is the claim the product rests on — not "we matched 54 rows to 54 rows", which is
not how Razorpay bills.

---

## 7. Exception Taxonomy

Five categories, rules-based classification (no ML), applied in priority order:

| Category | Detection Rule | Plain-language reason shown to user |
|---|---|---|
| `FEE_DEDUCTION` | `fee` ties to **no** published rate cell within ₹1 — neither `STANDARD` (2%) nor `CORPORATE` (2.15%) explains it | "This transaction was charged X%, which matches none of Razorpay's published rates. Expected ₹Y at the standard 2% rate; you were charged ₹Z. Check your pricing plan." |
| `TIMING` | `settled_at` falls outside the claimed filing period — T+2 pushed the settlement past the month end, so the fee is billed on the *following* month's invoice | "This settlement crossed a month boundary on T+2, so its GST invoice appears in next month's GSTR-2B. Expected, not an error — check the next period." |
| `REFUND_NETTED` | A `type: "refund"` row carries this record's `entity_id` in its `payment_id` field. Refunds are separate rows carrying `debit`, not a reduced `credit`. **Do not join on `settlement_id`** — a refund is netted into a *later* settlement cycle, so it almost never shares one with the payment it reverses | "A refund was netted into this settlement. **Razorpay does not return its MDR on a refunded transaction, so the GST on that fee remains valid ITC — do not reverse it.** Separately, the refund means you owe your customer a credit note under Section 34 of the CGST Act. Deadline: 30 November following the end of the financial year of the original supply." |
| `PARTIAL_PAYMENT` | Multiple `payment_id` entries share one `order_id`, one is zero-value | "A failed-then-retried payment created duplicate entries. Only the successful capture is billable." |
| `UNEXPLAINED` | None of the above rules match | "No automated classification possible. Manual review required. Settlement ref: [id]." |

**The sixth signal: `itcavl`.** GSTR-2B states, per document, whether the credit is available
(`itcavl`, `"Y"` or `"N"`) and why not (`rsn`). This is **GSTN's own verdict, and it outranks
anything Trace infers.** An invoice marked `itcavl: "N"` is ITC at risk on the government's
authority, no matter how cleanly its records matched.

The two grounds that matter here are the **place-of-supply restriction** introduced alongside
GSTR-2B by Notification 82/2020 — where the supplier's state and the place of supply match but the
recipient is registered elsewhere, so the recipient cannot claim — and the **Section 16(4) time
bar**. Both are documented; the literal `rsn` code strings are not. GSTN publishes no enumerated
code list in its schema, and the API examples show only `rsn: ""` against eligible invoices, so
Trace stores the reason as free text and does not constrain it to an enum it cannot verify.

It is a **flag, not a category** — `ITC_INELIGIBLE`. The five-category taxonomy stays locked; a
record can be `MATCHED` and still be ineligible, and collapsing those two facts into one field
would lose the distinction that matters. The flag lives on the **batch**, not the record, for the
same reason the tier-2 rollup does: the verdict is carried by the invoice, and one invoice covers
the period. A record has no 2B counterpart to carry a 2B verdict, so a per-record column would be
the same fact copied 54 times. The UI derives the per-record badge from the batch.

In the synthetic dataset both statements are `itcavl: "Y"`, because a Maharashtra merchant billed by
Razorpay's Maharashtra registration with place of supply in Maharashtra genuinely is eligible —
fabricating an ineligible line would be dishonest data. The code path is exercised by test rather
than by fixture.

**A second cause of timing drift, deliberately not modelled.** A supplier amending an invoice
through **GSTR-1A** also moves the ITC into the following month's GSTR-2B, and this is confirmed by
the GSTN advisory. It is not a detection rule here because it leaves **no per-record trace**: an
amended record is identical to a clean one in the settlement data, so attributing a period shortfall
to specific records would be a subset-sum guess rather than deterministic classification. Trace can
prove *how much* value moved; naming *which* records requires an amendment record (`b2ba`) in the
following period's 2B, which is a candidate enhancement rather than a shipped rule.

**Credit-note flag:** Any record classified `REFUND_NETTED` additionally gets
`CREDIT_NOTE_REVIEW: true` in the output. The system does not auto-resolve this — it surfaces the
flag with a plain-language note and the Section 34 reference. Resolution stays with the CA.

**Why this is a credit-note flag and not an ITC-reversal flag.** Two different credit notes exist in
this story and they must not be conflated:

| | Supplier | Who issues the credit note | What moves |
|---|---|---|---|
| The merchant's sale to a customer | The merchant | **The merchant** | The merchant's **output tax liability** — GSTR-1 CDNR → GSTR-3B Table 3.1 |
| Razorpay's MDR to the merchant | Razorpay | **Razorpay** | The merchant's **ITC** — GSTR-3B Table 4B(2) |

Razorpay does not refund MDR when a merchant refunds a customer, so Razorpay issues no credit note,
so **the merchant's ITC on the GST-on-MDR is never reversed.** The obligation a refund creates is on
the *outward* side: the merchant owes its customer a Section 34 credit note, which reduces the
merchant's output tax liability, not its ITC. Flagging this as an ITC reversal — as earlier drafts of
this document did, citing Section 41 — is wrong twice over. Section 41 was fully substituted with
effect from 1 October 2022 (Finance Act 2022 s.106, Notification 18/2022-CT); it is now
*"Availment of input tax credit"* and its only reversal trigger is the supplier failing to pay tax.
It has nothing to do with refunds.

**Verification status.** Section 34's scope and its 30 November deadline are verified against CBIC's
own text of the CGST Act. Section 41's substitution is likewise verified. That **Razorpay does not
return MDR on refunded transactions** is corroborated only by third-party sources — Razorpay's refund
documentation is silent, and the "₹0 refund processing fee" on its pricing page means no *additional*
charge, not reversal of the original fee. Treat it as industry norm, not established fact, and do not
assert it flatly.

---

## 8. Output

### Per-record output

```json
{
  "record_id": "pay_ABC123",
  "settlement_id": "setl_XYZ789",
  "period": "Jul-26",
  "amount_inr": 1000.00,
  "method": "card",
  "razorpay_fee_inr": 23.60,
  "razorpay_tax_inr": 3.60,
  "rate_cell": "STANDARD",
  "expected_fee_inr": 23.60,
  "expected_tax_inr": 3.60,
  "status": "MATCHED",
  "match_method": "EXACT",
  "exception_category": null,
  "credit_note_review": false,
  "reason": null,
  "logged_at": "2026-08-28T10:23:11Z"
}
```

### Batch report output

```json
{
  "merchant_gstin": "27TESTM1234A1Z0",
  "period": "072026",
  "total_records": 54,
  "matched_exact": 30,
  "matched_fuzzy": 8,
  "exceptions": 16,
  "match_rate_exact_only_pct": 55.6,
  "match_rate_pct": 70.4,
  "projected_match_rate_pct": 79.6,
  "itc_claimable_inr": 855.87,
  "itc_at_risk_inr": 341.05,
  "credit_note_review_count": 4,
  "gstr2b_invoice_txval_inr": 6649.45,
  "gstr2b_invoice_tax_inr": 1196.92,
  "rolled_up_tax_inr": 855.87,
  "rollup_delta_inr": 341.05,
  "gstr2b_itc_available": true,
  "gstr2b_itc_reason": null,
  "exception_breakdown": {
    "FEE_DEDUCTION": 4,
    "TIMING": 5,
    "REFUND_NETTED": 4,
    "PARTIAL_PAYMENT": 3,
    "UNEXPLAINED": 0
  },
  "processing_time_ms": 2100
}
```

Counts are the Section 13 dataset and the money ties to `data/synthetic/`, so this example is the
matcher's expected output, not an illustration. `gstr2b_invoice_tax_inr` is July's invoice line
(₹1196.92); `rolled_up_tax_inr` is the tax on the records that matched (₹855.87); the difference is
`rollup_delta_inr` (₹341.05), and `tests/fixtures.test.ts` asserts that identity.

**A batch is one filing period, not a date range.** GSTR-2B is generated per return period and
GSTR-3B is filed per period, so a run reconciles one period against one statement. The five
`TIMING` records are July transactions whose fee is billed on *August's* invoice — they are neither
claimable nor at risk in July, which is why `itc_claimable_inr` and `itc_at_risk_inr` sum to July's
invoice rather than to all 54 records. The following period's statement is read as evidence for the
`TIMING` rule; it is not a second rollup target.

The three rates are derived, never stored:

- `match_rate_exact_only_pct` — the `STANDARD` rate-cell pass alone (30/54). Establishes the
  baseline the alternate-cell pass improves on, so the lift is demonstrable rather than asserted.
- `match_rate_pct` — after the alternate rate-cell fallback (38/54). The headline figure.
- `projected_match_rate_pct` — headline plus `TIMING` records (43/54). Those settlements
  crossed the month boundary on T+2 and land in the next period's GSTR-2B; they are not
  yet due, so excluding them understates the merchant's true reconciled position.

The four rollup fields are the Tier 2 result:

- `gstr2b_invoice_txval_inr` / `gstr2b_invoice_tax_inr` — the period's **single** Razorpay
  invoice line in GSTR-2B, taken as-is from the 2B JSON.
- `rolled_up_tax_inr` — `SUM(tax)` over the period's matched records.
- `rollup_delta_inr` — `gstr2b_invoice_tax_inr − rolled_up_tax_inr`. **This must equal the tax
  sitting in the exception queue.** When it does, the batch is fully explained; when it doesn't,
  the matcher has a gap it is not accounting for, and that is a bug, not a finding.

Note on `fee` vs `txval`: Razorpay's `fee` is **inclusive of tax**, and `tax` is the GST portion
inside it. So the 2B taxable value is `fee − tax` (₹23.60 − ₹3.60 = ₹20.00 on a ₹1,000 card
payment at the standard 2% cell), and `cgst + sgst + igst` is `tax`. Getting this backwards
inflates every taxable value by 18%.

`itc_claimable_inr` / `itc_at_risk_inr` are placeholders until the dataset in Section 13
is generated; the counts above are exact.

---

## 9. Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                          Trace (Next.js)                             │
│                                                                      │
│  INGESTION                                                           │
│    Razorpay MCP  — dev-time only, to verify response shape           │
│    Synthetic settlements.json + GSTR-2B  — the runtime path          │
│                                  │                                   │
│                                  ▼                                   │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  DETECT  —  deterministic. No LLM here, ever.                  │  │
│  │                                                                │  │
│  │    parse → tier 1 rate-cell match → tier 2 period rollup       │  │
│  │    54 records, pure functions, < 3s, idempotent on re-run.     │  │
│  │    State lives in Postgres, not in a workflow engine.          │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                  │  16 exceptions                    │
│                                  ▼                                   │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  AGENT 1 — INVESTIGATE     may classify · may NOT write        │  │
│  │                                                                │  │
│  │    tools: fetch_all_refunds, order context, batch rows         │  │
│  │    generateText + Output.object → enum of exactly 5 categories │  │
│  │    policy gate: anything else is forced to UNEXPLAINED         │  │
│  │    its tool calls + reasoning are rendered in the UI           │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                  │                                   │
│                                  ▼                                   │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  AUDIT TRAIL  (PostgreSQL / Drizzle)                           │  │
│  │                                                                │  │
│  │    batches · records · actions · ai_calls                      │  │
│  │    every Claude call logged: prompt version, tokens,           │  │
│  │    cost, and the verdict the policy gate returned.             │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                 │                              │                     │
│                 ▼                              ▼                     │
│  ┌───────────────────────────────┐  ┌───────────────────────────────┐│
│  │ AGENT 2 — EXPLAIN             │  │ AGENT 3 — ACT                 ││
│  │ read-only · cannot write      │  │ drafts only · cannot send     ││
│  │                               │  │                               ││
│  │ generateText + Output.object  │  │ Per exception, drafts:        ││
│  │ "why is my settlement         │  │   · the CA email              ││
│  │  ₹3,000 short?"               │  │   · the GSTR-3B flag          ││
│  │                               │  │   · the Tally entry           ││
│  │ Cites the record IDs it       │  │                               ││
│  │ used. Every answer traces     │  │ HUMAN GATE:                   ││
│  │ to a record, amount, date.    │  │ actions.confirmed_at IS NULL  ││
│  │                               │  │ until a person clicks         ││
│  │                               │  │ Confirm. Nothing sends        ││
│  │                               │  │ on its own.                   ││
│  └───────────────────────────────┘  └───────────────────────────────┘│
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  Interface                                                     │  │
│  │    dashboard · reasoning trace · chat panel · action cards     │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

### Stack

| Layer | Choice | Reason |
|---|---|---|
| Framework | Next.js (App Router) | Known stack, API routes + React UI in one repo |
| Pipeline execution | Plain async functions + Postgres | **Inngest cut 1 Sep.** Durable execution earns its cost on long, expensive or fan-out steps. Detect is 54 records through pure functions in under 3 seconds, and a re-run is byte-identical because it is deterministic — so there is nothing to resume. Run state lives in the `batches` row, not in a workflow engine. The human-in-the-loop pause Inngest was chosen for is `actions.confirmed_at`: a nullable column and a Confirm button, which is also the only version of that gate a user can actually see. |
| Agent/AI calls | Vercel AI SDK + Claude (Anthropic API) | Tool calling for MCP context fetches. `generateText` + `Output.object` for **all three** layers, Explain included — see §15.5 for why streaming was dropped there |
| Database | PostgreSQL via Drizzle | Audit trail needs ACID guarantees |
| UI | Tailwind + shadcn/ui | Components are copied into the repo rather than installed, so the project owns them and the look is a design decision rather than a library default. Theming is CSS custom properties, which is what lets the colour scheme switch without re-rendering the page. |
| Data layer | `razorpay-mcp-server` (dev-time) + synthetic fixtures (runtime) | Official tooling, used during development to verify the `fetch_settlement_recon_details` response shape. **Not the runtime path** — it is a stdio subprocess and Vercel is serverless; a fresh test account also returns zero settlements until a settlement cycle runs. Runtime reads the synthetic fixtures. |
| Observability / trace | `ai_calls` table in the same Postgres | **Langfuse cut 1 Sep.** `langfuse-vercel` is deprecated in its own README, and the current SDK drops spans on Vercel unless `exportMode: "immediate"` is set and `forceFlush()` is called — a *silent* failure that looks like "the model made fewer calls" rather than an error, which is the worst thing to be debugging the night before a deadline. For an audit product the trace **is** the audit trail, so it belongs in our own database beside the records it explains. That serves the data-sovereignty narrative better than a third-party SaaS did. Stretch goal only if there is slack on Sep 4. |
| Error tracking | ~~Sentry~~ — cut | No real users and no production traffic in a demo, so error monitoring has almost nothing to catch. Revisit Sep 4 only if there is slack. |
| Deployment | Vercel | Native Next.js, zero config |
| Dev tooling | Claude Code + Claude Pro | `/wayfinder`, `/tdd`, `/handoff`, `mcp-server` skill, `ai-playbook` conventions |

**On cost.** Claude Pro and the Anthropic API are **separate balances** — a Pro subscription
contributes nothing to what Trace's own agent calls cost. The API is billed from a prepaid balance
at `console.anthropic.com`, and this build runs on **$5** with a console spending limit set to the
same figure, so overrun is impossible rather than merely unlikely.

The workload that dominates spend is §15.2's eval, which puts all 54 records through Investigate,
not just the 16 exceptions. At `claude-opus-5` rates ($5/$25 per MTok) a naive implementation costs
about $1.40 per eval run, which does not survive fifteen rounds of prompt tuning. Four measures,
each of which the design wants for its own sake, bring that to roughly **$0.31 per run**:

| Measure | Effect |
|---|---|
| Structured output with a tight schema (§15.3) | ~800 → ~150 output tokens per record, and output is ~77% of the bill |
| Prompt caching on the system prefix | the taxonomy and rate card are byte-identical across all 54 records, so input drops ~90% |
| `effort: "low"` on Investigate | a constrained classification over already-fetched tool results is not hard reasoning |
| Batch API for the eval | nothing waits on a script that prints a number — 50% off |

Model choice is **`claude-opus-5` for all three layers**. Investigate decides a tax classification,
which is the output most expensive to get wrong and so the wrong place to economise; and
one model means one prompt-cache namespace, where a cheap-model cascade would forfeit cache reuse
across models while adding a second failure surface.

---

## 10. Why This Exists (The Gap, Stated Clearly)

Before picking this direction, I mapped Razorpay's entire current AI product surface:

- **Agentic Dashboard** — 2-way reconciliation: upload a bank statement, or a screenshot of one, and the agent extracts UTRs and amounts and cross-references them against Razorpay's settlement records to flag discrepancies. Bank-to-settlement only. It never reads GSTR-2B, never explains *why* a line differs, and never surfaces a compliance obligation.
- **Agent Studio** — a marketplace of prebuilt agents inside the dashboard: Dispute Expert / Dispute Responder, Abandoned Cart Conversion, Subscription Recovery, Cashflow Forecaster. None touch payment-gateway GST reconciliation. The **Cashflow Forecaster** is the reason forward cash forecasting sits on this project's do-not-build list — Razorpay ships it already. (Receivables belongs to RazorpayX Agentic Banking, a different product; no "Bookkeeping Agent" appears in the public listing.)
- **Vulcan** — fraud/routing foundation model. Unrelated.
- **Slash** — internal PR automation. Unrelated.

The Agentic Dashboard's own documented capability is uploading "a bank statement" (singular) for settlement matching. Trace's input is different: Razorpay's own settlement API data + GSTR-2B JSON. Different input, different compliance domain, different user (CA vs merchant), different output (ITC claim report vs matched rows).

This is not building what Razorpay already built. Different input (settlement API + GSTR-2B, not a bank statement), different domain (tax compliance, not cash matching), different user (the CA who signs the return, not the ops lead who chases a missing credit), different output (a defensible ITC position, not a list of matched rows).

---

## 11. Measured Outcomes

| What is claimed | How it is measured |
|---|---|
| 50+ record batch | 54 synthetic records (Jul–Aug 2026, single merchant) |
| Match rate | `match_rate_pct` in batch report — exact + fuzzy breakdown |
| Honest exception list | 5-category taxonomy, UNEXPLAINED used when no rule fits |
| Measured accuracy | Two numbers, not one. **Detect:** per-record `match_method` and `rate_cell` logged in the audit trail; `match_method` is the confidence tier. **Investigate:** the agent is scored against `data/synthetic/expected.json` and the batch report states its agreement rate out of 54, with the disagreements listed. See §15. |
| Throughput | Processing time logged per batch run (target: <3 seconds for 54 records) |

---

## 12. What This Is Not

- Not a GSTR-3B auto-filer — flags the line, never files it
- Not a CA replacement — drafts, CA/merchant confirms and sends
- Not a generic purchase register matching tool
- Not an ML model — Detect layer is rules-based; Explain and Act layers use Claude for genuinely non-templatable, per-record language generation
- Not an autonomous agent that sends emails or files corrections on its own — every action is a draft awaiting human confirmation
- Not a multi-merchant SaaS — single merchant scope for this build

---

## 13. Synthetic Dataset Design

54 records (50+ required), causally broken — not random noise:

| Records | Condition | Expected classification |
|---|---|---|
| 30 | `fee`/`tax` tie to the `STANDARD` cell (2% + 18%) within ₹1, settled inside the period | `MATCHED` / `EXACT` |
| 8 | Ties to no standard cell but resolves against `CORPORATE` (2.15% + 18%) within ₹1 — corporate-card payments | `MATCHED` / `FUZZY` |
| 5 | T+2 pushes settlement past the July/August boundary, so the fee is billed on the Aug-26 invoice | `TIMING` |
| 4 | Refund netted into the settlement; MDR not returned, so ITC stands and a Section 34 credit note is due | `REFUND_NETTED` + `CREDIT_NOTE_REVIEW` |
| 4 | `fee` matches no published rate cell — effective rate is neither 2% nor 2.15% | `FEE_DEDUCTION` |
| 3 | Failed-then-retried UPI, duplicate entry | `PARTIAL_PAYMENT` |
| 0 | Genuine unexplained | `UNEXPLAINED` (kept at 0: the category exists and is reachable, but nothing in this dataset is genuinely unexplainable, and inventing one would be dishonest) |

---

## 14. Repo Structure

```
trace/
├── docs/
│   └── PRD.md                   ← this document
├── src/
│   ├── app/                     ← Next.js App Router
│   │   └── api/explain/         ← Explain layer (live answers, POST)
│   ├── lib/
│   │   ├── ingestion/           ← Razorpay MCP + GSTR-2B parser
│   │   ├── matching/            ← exact + fuzzy matcher (Detect, deterministic)
│   │   ├── agent/               ← Investigate agent (Vercel AI SDK + MCP tools)
│   │   ├── actions/             ← Act layer: email draft, GSTR-3B flag, Tally entry generators
│   │   └── audit/                ← Postgres audit trail + ai_calls logging
│   └── components/              ← interface: dashboard + chat panel + action review cards
├── data/
│   └── synthetic/
│       ├── settlements.json     ← 54 payment records + 4 refund rows
│       ├── gstr2b-072026.json   ← July GSTR-2B: one Razorpay invoice line
│       ├── gstr2b-082026.json   ← August GSTR-2B: where the TIMING records land
│       └── expected.json        ← per-record assertion table the matcher is tested against
├── tests/
└── README.md                    ← repo-facing summary
```


---

## 15. Making the AI Legible

Trace's AI is deliberately narrow: the matching is deterministic, and Claude is used only where
language or judgement is genuinely required (§12).

That narrowness creates an obligation. A CA is personally accountable for what they file, so an
exception classified by a model is worthless to them unless they can see *why* it was classified
that way and check it. An answer they cannot audit is an answer they have to redo by hand — which
is the exact work Trace claims to remove.

So the agent's reasoning is part of the product, not decoration on top of it. This section is
committed scope, not stretch. Each item states what it is and how you know it works.

### 15.1 Investigate renders its reasoning

Every exception row expands to show what the agent actually did: the tools it called, what came
back, and the classification it reached.

> `pay_Nx4kR2` — fee ₹41.30, expected ₹35.40 at STANDARD 2.00%
> → called `fetch_all_refunds(payment_id)` → one refund, ₹1,180.00, 12 Jul 2026
> → **REFUND_NETTED** · the fee is on the original capture; the refund was netted from the settlement

**Done when:** clicking any of the 16 exceptions shows its tool calls and the reasoning that
produced its category, sourced from `ai_calls`, not regenerated on view.

### 15.2 The agent is scored against ground truth

`data/synthetic/expected.json` already carries the correct category for all 54 records, because the
deterministic matcher is tested against it. Running Investigate over the same 54 and comparing gives
a real accuracy number for the AI layer, scored against ground truth rather than asserted.

The disagreements are the interesting output, not the agreements. Each one is either a dataset
ambiguity worth knowing about or a prompt weakness worth fixing. Without this number, "the agent
classifies exceptions" is a claim nobody — including us — can check.

**Done when:** `npm run eval` prints agreement out of 54 and lists every disagreement with both
verdicts and the agent's stated reason. The number goes in the batch report and in the video.

### 15.3 Categories are constrained at generation, not just validated after

Investigate returns structured output through `generateText` with `Output.object` and a Zod enum of
exactly the five categories, so a sixth cannot be decoded at all. The policy gate that forces
anything unrecognised to `UNEXPLAINED` stays in place behind it.

`generateText` + `Output.object`, **not** `generateObject`, and the reason is a constraint rather
than a preference: in AI SDK v7 `generateObject` accepts no `tools`, and an agent that cannot look
anything up cannot investigate. `Output.object` validates the final answer against the same Zod
schema in the same single call, so nothing about this section's guarantee changes — only the
function that carries it. BUILD-LOG 23.

Two independent mechanisms, described honestly as defence in depth: the schema makes the wrong
answer unrepresentable, and the gate catches the case where the schema is ever loosened.

**Done when:** a test forces the model toward a category outside the five and the batch still
records one of the five.

### 15.4 The batch reports its own cost

`ai_calls` logs model, prompt version, input and output tokens, latency and computed cost for every
Claude call. The batch report surfaces the total: *"54 records · 16 investigations · 47,200 tokens ·
₹2.40."*

Cost per reconciled batch is an operating cost of running Trace, so it belongs on the batch report
next to the other figures. A compliance product that cannot account for its own spend is making an
odd argument.

The same table is the reason the build fits in $5 (§9, "On cost"): structured output keeps responses
short, prompt caching makes the repeated system prefix nearly free, `effort: "low"` suits a bounded
classification, and the eval goes through the Batch API. Report the measured figures, not estimates —
`ai_calls` holds the real token counts.

**Done when:** the batch header shows token count and rupee cost for the run that produced it.

### 15.5 Explain cites what it used

Every answer from the Explain layer names the records behind it, and each citation is a link that
scrolls to that row in the table. §2 claims "every answer traces back to a specific record, amount,
and date" — this is what makes that claim checkable rather than asserted.

**Done when:** an answer to "why is my settlement short?" renders citations that navigate to the
rows it counted.

**Two deviations from §9, recorded here rather than left to be rediscovered.**

*No streaming.* §9 named `streamText`. The citation gate cannot check half a record id: a streamed
answer would either render `[pay_ABC` as a citation before knowing whether that record exists, or
hold the stream back until it did — which is a non-streaming call with extra machinery. §15.5's
guarantee is committed scope and §9's streaming was an implementation note, so the guarantee wins.
`generateText` + `Output.object` also keeps Explain identical in shape to Investigate, so both
share one gate discipline rather than two.

*Two surfaces, one agent.* The panel offers six example questions whose answers were produced once
by `npm run explain` and committed to `data/synthetic/explanations.json`, and a free-text box that
calls `POST /api/explain` live. Both go through the same `explain()`, the same read-only tools and
the same citation gate. The recorded half exists so the page renders with no API key, no database
and no network — it keeps the screen static-prerendered, and it means a rate limit or an
unreachable API costs the page nothing. Every answer states which it is: an answer recorded weeks ago must never read as
one just produced, so provenance — the model, the prompt version, and either "recorded <date>" or
"answered live" — sits under every one.

*The live route will not answer off the record.* It declines with a 503 when no database is
configured, rather than answering without writing its `ai_calls` row. "Every Claude call is
logged" (§15.4) is either true or it is marketing, and for an audit product an untraceable answer
is worth less than no answer.

### 15.6 Act checks its own figures, and the gate is what stops a confirmation

Every drafted action states rupee figures a person may act on, so every rupee figure in a draft is
checked against the record it was drafted from. Explain has to make sure every record an answer
names is real; Act has to make sure every amount a draft states is one the record actually carries.

**Done when:** a draft stating an amount the record does not carry is still shown, is annotated with
that amount, and cannot be confirmed.

*The figure gate.* `recordFigures` derives the closed set of amounts a draft about one record may
state — its payment amount, its fee, the GST inside that fee, the fee net of that GST, the expected
fee and tax from the resolved rate cell, and the two excesses. Prose is scanned for `₹` figures and
the structured `amountPaise` fields are checked against the same set, so a gate cannot police the
email while trusting the number that goes onto a return. A rupee amount with anything other than two
decimal places is refused rather than rounded: `₹23.6` silently read as the record's `₹23.60` is
exactly the drift the gate exists to catch. A voucher whose debits and credits disagree is refused
in **both** directions (BUILD-LOG 31).

*The gate is consequential, not decorative.* A refused draft renders, with the offending amounts
named, and every Confirm button on it is disabled. The check runs again on the server on every
confirmation — the disabled button is a courtesy to the person, the server check is the rule.
Verdict `INVALID_FIGURE` is its own value in `ai_call_verdict`, distinct from `FAILED` on the same
reasoning that separates `INVALID_CITATION`: an invented amount is a prompt problem and a call that
returned nothing is an infrastructure one.

**Three deviations from §9, recorded here rather than left to be rediscovered.**

*Act holds no tools at all.* §9's diagram gives Investigate tools and leaves Act's unstated. Act
drafts against ONE already-classified record whose every figure is rendered into its prompt
deterministically, so there is nothing to look up — and holding no tools means "drafts only · cannot
send" stops depending on which tools someone remembered to leave off an allowlist. It also keeps
the gate fair: the prompt is rendered from the same `recordFigures` call the gate checks against, so
the model can never be told it invented a figure its own instructions handed it.

*Recorded only, with no live counterpart.* Unlike Explain, Act does not answer at runtime. Explain
needs a live half because a question nobody anticipated cannot be pre-baked; the set of actions is
closed — one record, three drafts — so recording all of them by `npm run act` into
`data/synthetic/drafts.json` IS complete coverage rather than a sample. More decisively, a draft is
a document a person confirms: the text on screen, the text approved and the text stored in
`actions.draft` have to be the same bytes, and regenerating on view would make one record produce a
different email every time it was opened. A recorded draft carries a fingerprint of the figures the
record held when it was written, so a record that moves underneath a draft drops it rather than
showing a stale amount.

*No `actions` row exists before the click.* §9 describes the gate as `actions.confirmed_at IS NULL
until a person clicks Confirm`. The column is nullable and means that, but nothing is written
before the click: an unconfirmed draft lives in the committed drafts file, not in the database, so
there is no null to write. The audit property is the stronger one either way — every row in
`actions` was approved by a person, and confirming twice returns the existing row rather than
recording a second approval of one decision.

### What is deliberately not being added

Recorded so it is not rediscovered: no vector database (54 records fit in a single prompt — there is
nothing to retrieve), no agent-orchestration framework (three agents with fixed hand-offs is a
function call, not a graph), and no second model provider for comparison (unverifiable in the time
available). Signal here comes from measured results and visible constraints, not from dependency
count.
