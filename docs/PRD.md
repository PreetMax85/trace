# Trace — Product Requirements Document

**Version:** 2.0  
**Track:** AI Finance Controller (Track 04) — Razorpay AI Buildathon 2026  
**Deadline:** September 5, 2026  

---

## 1. Problem

Every merchant using Razorpay pays MDR (Merchant Discount Rate) fees. 18% GST sits on top of every MDR charge. That GST is fully claimable as Input Tax Credit (ITC) — but only if it appears in the merchant's GSTR-2B and matches their own settlement records.

It never matches automatically. Here's why:

Razorpay issues one GST invoice per settlement cycle. Each settlement batches hundreds of transactions, nets out MDR + GST, deducts refunds, and sends a single NEFT credit to the merchant's bank. The merchant's bookkeeper records sales per-transaction in Tally. Their CA downloads GSTR-2B monthly from the GST portal. Three sources, three formats, three timelines — none of them align without manual effort.

**The result:** A CA Club India survey (Dec 2025) found GSTR-2B reconciliation takes 5-20 hours per merchant per month. Manual VLOOKUP matching achieves 51% accuracy. Every unmatched entry is potential ITC left unclaimed — real money, real compliance risk.

**The gap nobody has filled:** Generic GST matching tools (Taxilla, Optotax, GST Reconcile) take CSV uploads and match purchase registers against GSTR-2B. None of them take Razorpay's settlement API as input. None of them classify WHY a mismatch happened. None of them handle the refund-ITC reversal compliance requirement. Zoho published a dedicated article on this specific gap in June 2026 — the problem is documented, the solution doesn't exist yet.

---

## 2. What Trace Does

Trace is a financial co-pilot that closes the full loop: from "why is my settlement short?" to the specific action the merchant needs to take next.

Three layers, each dependent on the one before:

**Detect:** Batch pipeline matches Razorpay settlement MDR-GST data against GSTR-2B entries. Runs on 50+ records. Produces match rate, ITC claimable, ITC at risk. The backend — merchants never see raw batch output.

**Explain:** Conversational interface over the batch result. Merchant asks "why is my settlement ₹3,000 short this month?" — Trace answers in plain language, referencing the specific records, amounts, and dates from their actual batch. Every question is different. Every batch result is different. No template can answer this.

**Act:** For each explained exception, Trace drafts the next action the merchant needs to take — the CA email with settlement ID and ITC reversal amount prefilled, the GSTR-3B line flagged for correction, the Tally correction entry. Merchant reviews and confirms before anything is sent. Trace never acts without a human gate.

**The USP in one sentence:** Trace finds where your settlement money went, explains it in plain language, and prepares the next action — your CA email, your GSTR-3B correction, your Tally entry — ready for you to confirm and send.

**Why AI is not optional here:** The Detect layer is deterministic (rules-based matching). The Explain layer requires AI — every merchant's question is different, every batch has different amounts and dates, no template handles this. The Act layer requires AI — drafting a contextually accurate CA email with the correct settlement ID, rupee amounts, and regulatory reference (Section 41, GSTR-3B line) for that specific record is not a fill-in-the-blank problem. Remove the AI and you have a spreadsheet with better formatting.

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
- **Detect:** Matching Razorpay `fee` + `tax` fields (from `fetch_settlement_recon_details`) against GSTR-2B `txval` + `camt`/`samt`/`iamt` fields
- **Explain:** Conversational Q&A interface over batch results — merchant asks in plain language, agent answers using that specific batch's data
- **Act:** Drafted next-action per exception — CA email (prefilled settlement ID, amounts, Section 41 reference), GSTR-3B correction flag, Tally correction entry. Draft only — human confirms before send.
- ITC reversal flagging for refund-adjusted settlements
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
| `payment_id` | string | ⚠️ Returns `null` in recon items. Do not use — the payment ID is in `entity_id`. |
| `fee` | integer | MDR in paise (÷100 = ₹) |
| `tax` | integer | GST on MDR in paise (÷100 = ₹) |
| `amount` | integer | Gross transaction amount in paise |
| `credit` | integer | Amount credited in paise (payments) |
| `debit` | integer | Amount debited in paise (refunds) — 0 on payment rows |
| `method` | string | Payment method (card/upi/netbanking) |
| `created_at` | unix timestamp | Transaction timestamp |
| `settled_at` | unix timestamp | Settlement timestamp — source of the T+2 boundary in `TIMING` |

### Source 2: Synthetic GSTR-2B (B2B Table)

Schema matches GSTN's official JSON format (confirmed from Sandbox.co.in GST API docs):

```json
{
  "b2b": [
    {
      "ctin": "27AAGCR4375J1ZU",
      "fldtr1": "11-Aug-26",
      "flprdr1": "Jul-26",
      "inv": [
        {
          "inum": "RZP/TAX/2026-07/001234",
          "idt": "31-07-2026",
          "inv_typ": "R",
          "val": 2301,
          "pos": "27",
          "rchrg": "N",
          "itms": [
            {
              "num": 1,
              "itm_det": {
                "rt": 18,
                "txval": 1950,
                "camt": 175.5,
                "samt": 175.5,
                "iamt": 0,
                "csamt": 0
              }
            }
          ]
        }
      ]
    }
  ]
}
```

**Key mapping to Razorpay fields:**

| GSTR-2B field | Razorpay equivalent | Notes |
|---|---|---|
| `ctin` | Razorpay GSTIN | Always `27AAGCR4375J1ZU` for Maharashtra |
| `txval` | `fee` ÷ 100 | MDR in rupees |
| `camt` + `samt` | `tax` ÷ 100 | GST on MDR, intra-state |
| `iamt` | `tax` ÷ 100 | GST on MDR, inter-state (IGST) |
| `inum` | Settlement invoice number | Fuzzy match required |
| `flprdr1` | Settlement period | Filing lag source (T+2 → next month) |

---

## 6. Matching Engine

### Step 1: Exact match
Join on: `ctin` (Razorpay's GSTIN) + `inum` normalized (strip hyphens, slashes, spaces) + `flprdr1` period + `txval` within ₹1 rounding tolerance.

If all four match: record status = `MATCHED`. Log match method = `EXACT`.

### Step 2: Fuzzy match (for invoice number format variations)
If exact match fails, retry with: `ctin` + period + `txval` within ₹1 + date within 3-day window (T+2 tolerance).

If match found: record status = `MATCHED`. Log match method = `FUZZY`. Confidence = `MEDIUM`.

### Step 3: Exception queue
Everything that doesn't match after Steps 1 and 2 enters the exception classifier.

---

## 7. Exception Taxonomy

Five categories, rules-based classification (no ML), applied in priority order:

| Category | Detection Rule | Plain-language reason shown to user |
|---|---|---|
| `FEE_DEDUCTION` | `txval` differs from expected MDR by >₹1, rate mismatch vs contracted MDR% | "MDR rate in GSTR-2B (X%) differs from Razorpay settlement (Y%). Check your pricing plan." |
| `TIMING` | `flprdr1` is one month ahead of settlement date (T+2 crosses month boundary) | "This settlement crossed a month boundary. The GST invoice appears in next month's GSTR-2B. Expected — check next period." |
| `REFUND_NETTED` | A `type: "refund"` item shares this record's `settlement_id` (refunds are separate rows carrying `debit`, not a reduced `credit` on the payment row) | "A refund was netted into this settlement. Original ITC may require partial reversal under Section 41 — verify with your CA." |
| `PARTIAL_PAYMENT` | Multiple `payment_id` entries share one `order_id`, one is zero-value | "A failed-then-retried payment created duplicate entries. Only the successful capture is billable." |
| `UNEXPLAINED` | None of the above rules match | "No automated classification possible. Manual review required. Settlement ref: [id]." |

**ITC Reversal flag:** Any record classified `REFUND_NETTED` additionally gets `ITC_REVERSAL_REVIEW: true` in the output. The system does not auto-resolve this — it surfaces the flag with a plain-language note and the specific Section 41 reference. Resolution stays with the CA.

---

## 8. Output

### Per-record output

```json
{
  "record_id": "pay_ABC123",
  "settlement_id": "setl_XYZ789",
  "period": "Jul-26",
  "razorpay_fee_inr": 19.50,
  "razorpay_tax_inr": 3.51,
  "gstr2b_txval": 19.50,
  "gstr2b_tax": 3.51,
  "status": "MATCHED",
  "match_method": "EXACT",
  "exception_category": null,
  "itc_reversal_review": false,
  "reason": null,
  "logged_at": "2026-08-28T10:23:11Z"
}
```

### Batch report output

```json
{
  "merchant_gstin": "27XXXXXXXXXXXX",
  "period": "Jul-Aug 2026",
  "total_records": 54,
  "matched_exact": 38,
  "matched_fuzzy": 7,
  "exceptions": 9,
  "match_rate_pct": 83.3,
  "itc_claimable_inr": 4821.50,
  "itc_at_risk_inr": 612.00,
  "itc_reversal_review_count": 3,
  "exception_breakdown": {
    "FEE_DEDUCTION": 2,
    "TIMING": 4,
    "REFUND_NETTED": 3,
    "PARTIAL_PAYMENT": 0,
    "UNEXPLAINED": 0
  },
  "processing_time_ms": 2100
}
```

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
│                       │  ITC_REVERSAL_REVIEW → Inngest PAUSE│  │
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
| 30 | Clean match, exact invoice number format | `MATCHED` / `EXACT` |
| 8 | Invoice number format varies (slashes vs hyphens) | `MATCHED` / `FUZZY` |
| 5 | Settlement crosses July/August boundary (T+2 lag) | `TIMING` |
| 4 | Refund netted before settlement, ITC reversal needed | `REFUND_NETTED` + `ITC_REVERSAL_REVIEW` |
| 4 | MDR rate differs (2% card vs 0.5% UPI, misrecorded) | `FEE_DEDUCTION` |
| 3 | Failed-then-retried UPI, duplicate entry | `PARTIAL_PAYMENT` |
| 0 | Genuine unexplained | `UNEXPLAINED` (kept at 0 for a clean dataset — judges see the category exists, no cherry-picked exceptions) |

---

## 14. Repo Structure

```
trace/
├── docs/
│   ├── PRD.md                   ← this document
│   ├── PITCH.md                 ← pitch video script + content plan
│   └── README.md                ← repo-facing summary
├── src/
│   ├── app/                     ← Next.js App Router
│   │   └── api/chat/            ← Explain layer (streamText endpoint)
│   ├── lib/
│   │   ├── ingestion/           ← Razorpay MCP + GSTR-2B parser
│   │   ├── matching/            ← exact + fuzzy matcher (Detect, deterministic)
│   │   ├── inngest/              ← durable pipeline functions + human-in-loop pause
│   │   ├── agent/                ← Investigation agent (Vercel AI SDK + MCP tools)
│   │   ├── actions/               ← Act layer: email draft, GSTR-3B flag, Tally entry generators
│   │   └── audit/                ← Postgres logging + Langfuse tracing
│   └── components/              ← Blade UI: dashboard + chat panel + action review cards
├── data/
│   └── synthetic/
│       ├── settlements.json     ← 54 Razorpay-format records
│       └── gstr2b.json          ← matching GSTR-2B synthetic data
├── tests/                       ← TDD via /tdd Claude Code skill
└── README.md
```