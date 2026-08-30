# Trace — Product Requirements Document

**Version:** 2.0  
**Track:** AI Finance Controller (Track 04) — Razorpay AI Buildathon 2026  
**Deadline:** September 5, 2026  

---

## 1. Problem

Every merchant using Razorpay pays MDR (Merchant Discount Rate) fees. 18% GST sits on top of every MDR charge. That GST is fully claimable as Input Tax Credit (ITC) — but only if it appears in the merchant's GSTR-2B and matches their own settlement records.

It never matches automatically. Here's why:

Razorpay bills MDR on **one consolidated tax invoice per month** — not per settlement, and not per transaction. Each settlement batches hundreds of transactions, nets out MDR + GST, deducts refunds, and sends a single NEFT credit to the merchant's bank, but the tax invoice backing all of those deductions arrives once a month. GSTR-2B therefore carries a *single* Razorpay line for the period, and the merchant has to reconcile hundreds of individual fee deductions against that one number. Their bookkeeper meanwhile records sales per-transaction in Tally. Three sources, three formats, three levels of granularity — none of them align without manual effort.

**The result:** A CA Club India survey (Dec 2025) found GSTR-2B reconciliation takes 5-20 hours per merchant per month. Manual VLOOKUP matching achieves 51% accuracy. Every unmatched entry is potential ITC left unclaimed — real money, real compliance risk.

**The gap nobody has filled:** Generic GST matching tools (Taxilla, Optotax, GST Reconcile) take CSV uploads and match purchase registers against GSTR-2B. None of them take Razorpay's settlement API as input. None of them classify WHY a mismatch happened. None of them bridge Razorpay's per-transaction fee deductions to the single consolidated invoice line that GSTR-2B actually shows, or surface the Section 34 credit-note obligation a netted refund creates. Zoho published a dedicated article on this specific gap in June 2026 — the problem is documented, the solution doesn't exist yet.

---

## 2. What Trace Does

Trace is a financial co-pilot that closes the full loop: from "why is my settlement short?" to the specific action the merchant needs to take next.

Three layers, each dependent on the one before:

**Detect:** Batch pipeline matches Razorpay settlement MDR-GST data against GSTR-2B entries. Runs on 50+ records. Produces match rate, ITC claimable, ITC at risk. The backend — merchants never see raw batch output.

**Explain:** Conversational interface over the batch result. Merchant asks "why is my settlement ₹3,000 short this month?" — Trace answers in plain language, referencing the specific records, amounts, and dates from their actual batch. Every question is different. Every batch result is different. No template can answer this.

**Act:** For each explained exception, Trace drafts the next action the merchant needs to take — the CA email with settlement ID and Section 34 credit-note amount prefilled, the GSTR-3B line flagged for correction, the Tally correction entry. Merchant reviews and confirms before anything is sent. Trace never acts without a human gate.

**The USP in one sentence:** Trace finds where your settlement money went, explains it in plain language, and prepares the next action — your CA email, your GSTR-3B correction, your Tally entry — ready for you to confirm and send.

**Why AI is not optional here:** The Detect layer is deterministic (rules-based matching). The Explain layer requires AI — every merchant's question is different, every batch has different amounts and dates, no template handles this. The Act layer requires AI — drafting a contextually accurate CA email with the correct settlement ID, rupee amounts, and regulatory reference (Section 34, GSTR-3B line) for that specific record is not a fill-in-the-blank problem. Remove the AI and you have a spreadsheet with better formatting.

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
- Audit trail: every decision logged with timestamp, match method, confidence tier, source fields

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
Karnataka one is `29AAGCR4375J1ZU`. The demo merchant is `27TESTM1234A1Z0` — an obviously synthetic
PAN so it cannot collide with a real business, with a correct check digit so it survives validation.
A judge pasting an invalid GSTIN into the GST portal is a worse failure than any code bug, so this
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

Source: `https://razorpay.com/pricing/`. Enterprise rates are negotiated and unpublished; the demo
merchant is on the standard card.

---

## 6. Matching Engine

Matching runs in **two tiers**, because the two sides of the reconciliation are at different
granularities. Tier 1 resolves each settlement row against the published rate card. Tier 2 rolls
the resolved rows up and ties the period total to the single GSTR-2B invoice line.

All comparisons are in **integer paise**. The ₹1 tolerance is exactly `100` paise. Rounding is
deliberately *not* an exception category — it is absorbed by that tolerance.

**The tolerance has a discrimination floor.** Two rate cells 0.15 percentage points apart produce
fees differing by `amount × 0.0015 × 1.18`, which stays under ₹1 for any transaction below roughly
**₹565**. Beneath that threshold a fee satisfies both the 2% and 2.15% cells and the match becomes
order-dependent rather than deterministic. The matcher must treat a fee resolving to more than one
cell as ambiguous rather than silently taking the first hit, and the synthetic dataset keeps every
amount above the floor so `EXACT` and `FUZZY` stay well-defined.

### Tier 1 — per-record rate-cell resolution

**Step 1: Exact match.** The row's `fee` and `tax` tie to the `STANDARD` rate cell (2% + 18% GST)
within ₹1, **and** `settled_at` falls inside the claimed filing period.

If both hold: record status = `MATCHED`. Log match method = `EXACT`, `rate_cell = STANDARD`.

**Step 2: Fuzzy match (alternate rate cell).** If Step 1 fails, retry against every other published
rate cell — currently `CORPORATE` at 2.15% + 18% GST. A row that ties to one of those within ₹1 is
matched, not an exception: the fee was correct, it was simply billed at a cell the merchant did not
expect.

If a cell matches: record status = `MATCHED`. Log match method = `FUZZY`, `rate_cell` = the cell
that resolved it. Confidence = `MEDIUM`.

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
numbers agree. This is the claim the demo rests on — not "we matched 54 rows to 54 rows", which is
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
than by demo fixture.

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
assert it flatly in the pitch.

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
┌───────────────────────────────────────────────────────────────┐
│                      Trace (Next.js)                          │
│                                                                │
│  ┌──────────────┐   ┌─────────────────────────────────────┐   │
│  │  Ingestion   │   │   DETECT — Inngest durable pipeline │   │
│  │              │   │                                     │   │
│  │  Razorpay    │──▶│   Step: fetch settlement record     │   │
│  │  MCP Server  │   │   Step: exact match (deterministic) │   │
│  │              │   │   Step: fuzzy match (deterministic) │   │
│  │  Synthetic   │──▶│   Step: if exception → Investigate  │   │
│  │  GSTR-2B     │   └──────────────┬──────────────────────┘   │
│  └──────────────┘                  │                          │
│                       ┌────────────▼──────────────────────┐   │
│                       │  Investigation Agent (Vercel AI SDK)│  │
│                       │  fetch_all_refunds / order context  │  │
│                       │  classifies + explains THIS record  │  │
│                       │  Policy gate: must be 1 of 5 cats    │  │
│                       │  CREDIT_NOTE_REVIEW → Inngest PAUSE │  │
│                       │  (human-in-the-loop event)           │  │
│                       └────────────┬──────────────────────┘   │
│                                    │                           │
│                       ┌────────────▼──────────────────────┐   │
│                       │  Audit Trail (Postgres/Drizzle)    │   │
│                       │  Langfuse traces every Claude call │   │
│                       └────────────┬──────────────────────┘   │
│                                    │                           │
│         ┌──────────────────────────┴─────────────────────┐   │
│         ▼                                                  ▼   │
│  ┌─────────────────────┐                    ┌──────────────────┐│
│  │  EXPLAIN             │                    │  ACT             ││
│  │  Q&A over batch data │                    │  Drafts per       ││
│  │  "why is my          │                    │  exception:       ││
│  │  settlement short?"  │                    │  - CA email       ││
│  │  streamText, Claude  │                    │  - GSTR-3B flag   ││
│  │                      │                    │  - Tally entry    ││
│  └─────────────────────┘                    │  Human confirms   ││
│                                              │  before send      ││
│                                              └──────────────────┘│
│                       ┌─────────────────────────────────────┐   │
│                       │   Blade UI — dashboard + chat panel │   │
│                       └─────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────┘
```

### Stack

| Layer | Choice | Reason |
|---|---|---|
| Framework | Next.js (App Router) | Known stack, API routes + React UI in one repo |
| Durable execution | Inngest | Already used it before (PR reviewer project) — batch pipeline as resumable steps, human-in-the-loop pause for ITC review. Same architectural principle (durable execution + audit trail) Razorpay applies in its own internal tooling, not a claim of identical implementation. |
| Agent/AI calls | Vercel AI SDK + Claude (Anthropic API) | Tool calling for MCP context fetches, `streamText` for the Explain conversational layer |
| Database | PostgreSQL via Drizzle | Audit trail needs ACID guarantees |
| UI | `@razorpay/blade` | Looks Razorpay-native, signals stack familiarity |
| Data layer | `razorpay-mcp-server` (dev-time) + synthetic fixtures (runtime) | Official tooling, used during development to verify the `fetch_settlement_recon_details` response shape. **Not the runtime path** — it is a stdio subprocess and Vercel is serverless; a fresh test account also returns zero settlements until a settlement cycle runs. Runtime reads the synthetic fixtures. |
| Observability | Langfuse (free tier, self-hostable) | Every Claude call traced/versioned — fintech data-sovereignty narrative. Wired Sep 2 as the Explain/Act call sites are written, not retrofitted later. |
| Error tracking | ~~Sentry~~ — cut | No real users and no production traffic in a demo, so error monitoring has almost nothing to catch. Revisit Sep 4 only if there is slack. |
| Deployment | Vercel | Native Next.js, zero config |
| Dev tooling | Claude Code + Claude Pro | `/wayfinder`, `/tdd`, `/handoff`, `mcp-server` skill, `ai-playbook` conventions |

**On cost:** Anthropic's $5 free signup credit covers the whole build — 54 records, maybe 15-20 trigger an investigation call at ~800 tokens each, plus the Explain/Act conversational calls. No extra spend beyond Claude Pro.

---

## 10. Why This Exists (The Gap, Stated Clearly)

Before picking this direction, I mapped Razorpay's entire current AI product surface:

- **Agentic Dashboard** — does 2-way reconciliation (bank statement vs settlement). Does not handle GSTR-2B. Does not explain mismatches. Does not flag ITC reversal requirements.
- **Agent Studio** — Dispute Expert, Subscription Recovery Agent, Cart Abandonment Recovery Agent, Receivables Agent, Bookkeeping Agent. None touch payment-gateway-specific GST reconciliation.
- **Vulcan** — fraud/routing foundation model. Unrelated.
- **Slash** — internal PR automation. Unrelated.

The Agentic Dashboard's own documented capability is uploading "a bank statement" (singular) for settlement matching. Trace's input is different: Razorpay's own settlement API data + GSTR-2B JSON. Different input, different compliance domain, different user (CA vs merchant), different output (ITC claim report vs matched rows).

This is not building what Razorpay already built. This is building what they explicitly said "the 2026 builder consensus" identified: verification capacity, not generation speed, is the bottleneck.

---

## 11. The Bar, Met Explicitly

| Track requirement | How Trace delivers |
|---|---|
| 50+ record batch | 54 synthetic records (Jul–Aug 2026, single merchant) |
| Match rate | `match_rate_pct` in batch report — exact + fuzzy breakdown |
| Honest exception list | 5-category taxonomy, UNEXPLAINED used when no rule fits |
| Measured accuracy | Per-record `match_method` + `confidence` logged in audit trail |
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
| 0 | Genuine unexplained | `UNEXPLAINED` (kept at 0 for a clean dataset — judges see the category exists, no cherry-picked exceptions) |

---

## 14. Repo Structure

```
trace/
├── docs/
│   └── PRD.md                   ← this document
├── src/
│   ├── app/                     ← Next.js App Router
│   │   └── api/chat/            ← Explain layer (streamText endpoint)
│   ├── lib/
│   │   ├── ingestion/           ← Razorpay MCP + GSTR-2B parser
│   │   ├── matching/            ← exact + fuzzy matcher (Detect, deterministic)
│   │   ├── inngest/             ← durable pipeline functions + human-in-loop pause
│   │   ├── agent/               ← Investigation agent (Vercel AI SDK + MCP tools)
│   │   ├── actions/             ← Act layer: email draft, GSTR-3B flag, Tally entry generators
│   │   └── audit/                ← Postgres logging + Langfuse tracing
│   └── components/              ← Blade UI: dashboard + chat panel + action review cards
├── data/
│   └── synthetic/
│       ├── settlements.json     ← 54 payment records + 4 refund rows
│       ├── gstr2b-072026.json   ← July GSTR-2B: one Razorpay invoice line
│       ├── gstr2b-082026.json   ← August GSTR-2B: where the TIMING records land
│       └── expected.json        ← per-record assertion table the matcher is tested against
├── tests/
└── README.md                    ← repo-facing summary
```