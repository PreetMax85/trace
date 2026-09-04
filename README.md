# Trace

**Live: https://trace-zeta-three.vercel.app/**

Razorpay AI Buildathon 2026 — Track 04: AI Finance Controller.

Every merchant on Razorpay pays a gateway fee with 18% GST on top. That GST is input tax credit they can claim back — but only for the part their supplier actually reported in GSTR-2B, the monthly statement the tax portal builds from suppliers' filings. Nobody automates that match today. Trace does: it finds the gap, explains it in plain language, and drafts the next action for a person to confirm.

## The four layers

- **Detect** — deterministic matching of Razorpay settlement data (`fee` / `tax`, in paise) against GSTR-2B. Two tiers: each settlement against Razorpay's published rate card within ₹1, then the period against the single GSTR-2B invoice line. No model is asked anything at this layer, ever — the numbers a merchant would act on come from arithmetic.
- **Investigate** — takes the records the matcher could not resolve and sorts each into one of five fixed categories, showing the evidence and the tool calls it used.
- **Explain** — answers plain-language questions about the batch. Every answer cites the records it rests on, and each citation opens that row.
- **Act** — drafts the CA email, the GSTR-3B flag and the Tally correction entry. It holds no tools and cannot send: a person confirms each draft, and every draft is checked against the record's own figures before it can be confirmed.

## Running it

```bash
npm install
cp .env.example .env      # DATABASE_URL and ANTHROPIC_API_KEY
npm run dev
```

The screen works with no API key and no database — the matching is deterministic and the recorded answers and drafts are committed. A key is needed only to ask a live question or to re-record them.

```bash
npm test          # unit tests
npm run typecheck
npm run verify:screen   # drives a real browser against a running dev server
```

## Scope

One merchant, one GSTIN, test-mode only. 54 synthetic settlement records and a GSTR-2B file built to the real GSTN schema — the figures are internally consistent and the matching is genuine; the merchant is not. Deliberate limits are in [PRD §4 and §12](./docs/PRD.md).

## Reading further

- [`docs/PRD.md`](./docs/PRD.md) — the full specification: architecture, data schemas, the exception taxonomy (§7), the synthetic data breakdown (§13)
- [`docs/BUILD-LOG.md`](./docs/BUILD-LOG.md) — every bug that survived its own tests, and the guard added to stop each class recurring

## Stack

Next.js (App Router), PostgreSQL + Drizzle, Vercel AI SDK + Claude, `@razorpay/blade`, `razorpay-mcp-server`, deployed on Vercel.

Inngest, Langfuse and Sentry were each considered and cut — the reasoning is in the PRD's stack table and in [`docs/BUILD-LOG.md`](./docs/BUILD-LOG.md) entry 21.
