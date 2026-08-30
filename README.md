# Trace

**Razorpay AI Buildathon 2026 — Track 04: AI Finance Controller**

Every merchant on Razorpay pays MDR fees with 18% GST on top — fully claimable as ITC, but only if it matches their GSTR-2B. Nobody automates this match today. Trace does: it finds the gap, explains it in plain language, and drafts the next action — the CA email, the GSTR-3B correction, the Tally entry — ready to confirm and send.

## What it does

- **Detect** — deterministic batch matching of Razorpay settlement data (`fee`/`tax` fields) against GSTR-2B entries
- **Explain** — ask "why is my settlement short this month?" in plain language, get an answer grounded in your actual batch data
- **Act** — drafted CA email / GSTR-3B flag / Tally correction per exception, human confirms before anything sends

## Why

Full research and reasoning: [`docs/PRD.md`](./docs/PRD.md)

## Demo

5-minute pitch video: *[link once recorded]*

## Stack

Next.js, PostgreSQL + Drizzle, Inngest, Vercel AI SDK + Claude, `@razorpay/blade`, `razorpay-mcp-server`, Langfuse, Sentry. Full breakdown in the PRD.

## Status

Single-merchant demo, test-mode data, 54 synthetic records. Built for the buildathon submission — scope limitations documented in `docs/PRD.md` Section 4 and 12.