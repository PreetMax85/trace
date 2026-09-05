# Trace

**Live: https://trace-zeta-three.vercel.app/**

Trace reconciles Razorpay settlement data against GSTR-2B, explains every gap it finds in plain
language, and drafts the next compliance step for a person to confirm.

## The problem

Razorpay deducts a fee from every settlement and charges 18% GST on that fee. That GST is input
tax credit the merchant can claim back, but only for the part Razorpay actually reported to the
tax department, which appears on the merchant's monthly GSTR-2B statement. Credit that is not on
the statement cannot be claimed, and claiming it anyway comes back later with interest.

Checking is not merely tedious, it is structurally hard. The merchant's side is hundreds or
thousands of individual settlements, each with its own fee and its own slice of tax. The
government's side is **one invoice line for the entire month**. There is no per-transaction
reference to join them on, so the two lists cannot be matched against each other at all.

Trace works backwards instead. It prices every settlement fee against the rate card Razorpay
publishes, rolls the period up against that single statement line, and turns the leftover into a
named list rather than a difference. On the demo batch the statement carries ₹1,196.92 of tax,
Trace accounts for ₹855.87, and the ₹341.05 gap resolves exactly into ₹214.69 that needs chasing
and ₹126.36 of refunds. Nothing is left over.

Nothing on the screen is unexplained. Every figure opens the arithmetic behind it, every flagged
record opens the rule that flagged it, and every answer the Explain layer gives names the records
it rests on.

## The four layers

- **Detect.** Deterministic matching of settlement data (`fee` and `tax`, in paise) against
  GSTR-2B. Two tiers: each settlement against Razorpay's published rate card within ₹1, then the
  period against the single GSTR-2B invoice line. **No model is asked anything at this layer,
  ever.** Every number a merchant would act on comes from arithmetic.
- **Investigate.** Takes the records the matcher could not resolve and sorts each into one of five
  fixed categories, showing the evidence and the tool calls behind it.
- **Explain.** Answers plain-language questions about the batch. Every answer cites the records it
  rests on, and each citation opens that row. An answer naming a record the batch does not hold
  loses its link and is reported on screen rather than passing as real.
- **Act.** Drafts the CA email, the GSTR-3B flag and the Tally entry. It holds no tools and cannot
  send. Every draft is checked against its record's own figures before it can be confirmed, and a
  person confirms each one.

Diagrams of the layers, the tool loop and the gates are in [`docs/diagrams/`](./docs/diagrams).
Drag any `.excalidraw` file onto excalidraw.com to open it.

## Running it

```bash
npm install
cp .env.example .env      # DATABASE_URL and ANTHROPIC_API_KEY
npm run dev
```

The screen works with **no API key and no database**. The matching is deterministic, and the
recorded answers and drafts are committed to the repository. A key is needed only to ask a live
question or to re-record them.

```bash
npm test                  # unit tests
npm run typecheck
npm run lint

npm run build             # verify:screen checks the build id, so build first
npm start
TARGET_URL=http://localhost:3000/ npm run verify:screen
```

`verify:screen` drives a real browser. It clicks a row of every verdict, opens each of the four
headline figures, presses Enter on a focused table cell, checks the page says what it is, and
measures the document at 390px. It exists because this screen has already shipped a section that
typechecked, rendered in tests, and did nothing on the page.

## Scope

One merchant, one GSTIN, test mode only. 54 synthetic settlement records and a GSTR-2B file built
to the real GSTN schema. The figures are internally consistent and the matching is genuine; the
merchant is not. The deliberate limits are in [PRD §4 and §12](./docs/PRD.md).

Trace never sends an email and never files a correction. It drafts, and a human confirms.

## Reading further

- [`docs/PRD.md`](./docs/PRD.md), the full specification: architecture, data schemas, the exception
  taxonomy (§7), the synthetic data breakdown (§13)
- [`docs/BUILD-LOG.md`](./docs/BUILD-LOG.md), seventeen things that were wrong while their own
  tests were green, and the guard added after each one

## Stack

Next.js (App Router), PostgreSQL with Drizzle, Vercel AI SDK with Claude, Tailwind with
shadcn/ui, `razorpay-mcp-server`, deployed on Vercel. Newsreader, Inter and JetBrains Mono are
self-hosted through `next/font`. The palette and the five-role type scale are CSS custom
properties in `src/app/globals.css`, so the scheme is a single class on `<html>` and costs no
re-render.
