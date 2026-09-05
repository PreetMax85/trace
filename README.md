# Trace

**Live: https://trace-zeta-three.vercel.app/**

Razorpay AI Buildathon 2026, Track 04: AI Finance Controller.

Every merchant on Razorpay pays a gateway fee with 18% GST on top. That GST is input tax credit they can claim back, but only for the part their supplier actually reported in GSTR-2B, the monthly statement the tax portal builds from suppliers' filings. Nobody automates that match today. Trace does: it finds the gap, explains it in plain language, and drafts the next action for a person to confirm.

Nothing on the screen is unexplained. Every figure opens the arithmetic behind it, every flagged record opens the rule that flagged it, and every answer the model gives names the records it rests on.

## The four layers

- **Detect.** Deterministic matching of Razorpay settlement data (`fee` / `tax`, in paise) against GSTR-2B. Two tiers: each settlement against Razorpay's published rate card within ₹1, then the period against the single GSTR-2B invoice line. No model is asked anything at this layer, ever. The numbers a merchant would act on come from arithmetic.
- **Investigate.** Takes the records the matcher could not resolve and sorts each into one of five fixed categories, showing the evidence and the tool calls it used.
- **Explain.** Answers plain-language questions about the batch. Every answer cites the records it rests on, and each citation opens that row.
- **Act.** Drafts the CA email, the GSTR-3B flag and the Tally correction entry. It holds no tools and cannot send. A person confirms each draft, and every draft is checked against the record's own figures before it can be confirmed.

## Running it

```bash
npm install
cp .env.example .env      # DATABASE_URL and ANTHROPIC_API_KEY
npm run dev
```

The screen works with no API key and no database. The matching is deterministic, and the recorded answers and drafts are committed. A key is needed only to ask a live question or to re-record them.

```bash
npm test                  # unit tests
npm run typecheck
npm run lint

npm run build             # verify:screen checks the build id, so build first
npm start                 # then point TARGET_URL at whichever port this is on
TARGET_URL=http://localhost:3000/ npm run verify:screen
```

`verify:screen` drives a real browser: it clicks a row of every verdict, opens each of the four headline figures, presses Enter on a focused table cell, and measures the document at 390px. It exists because this screen has already shipped a section that typechecked, rendered in tests, and did nothing on the page.

## Scope

One merchant, one GSTIN, test-mode only. 54 synthetic settlement records and a GSTR-2B file built to the real GSTN schema. The figures are internally consistent and the matching is genuine; the merchant is not. Deliberate limits are in [PRD §4 and §12](./docs/PRD.md).

## Reading further

- [`docs/PRD.md`](./docs/PRD.md), the full specification: architecture, data schemas, the exception taxonomy (§7), the synthetic data breakdown (§13)
- [`docs/BUILD-LOG.md`](./docs/BUILD-LOG.md), every bug that survived its own tests, and the guard added to stop each class recurring

## Stack

Next.js (App Router), PostgreSQL + Drizzle, Vercel AI SDK + Claude, Tailwind with shadcn/ui, `razorpay-mcp-server`, deployed on Vercel. Newsreader, Inter and JetBrains Mono are self-hosted through `next/font`. The palette and the five-role type scale are CSS custom properties in `src/app/globals.css`, which is what makes the light and dark switch a single class on `<html>` rather than a re-render.

Inngest, Langfuse and Sentry were each considered and cut. The reasoning is in the PRD's stack table and in [`docs/BUILD-LOG.md`](./docs/BUILD-LOG.md) entry 21.
