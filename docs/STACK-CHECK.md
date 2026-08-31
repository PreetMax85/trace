# Stack check — verifying what PRD §9 assumes

PRD §9 names Inngest, the Vercel AI SDK and Langfuse and describes how they will be used. Those
claims had never been checked against the libraries as they actually ship. This file checks them.
It changes no code and edits no spec: where §9 is wrong, it says so here.

Every claim below is marked **verified**, **wrong**, or **could not confirm**, with what
established it.

## How these were checked, and what that is worth

The project's rule is documentation-first, via Context7. That did not work in this environment and
the fallback was not the documented one either, so read the evidence with that in mind:

- **Context7 was unavailable.** The MCP server connected, dropped, and reconnected during the run;
  `resolve-library-id` failed with `TypeError: fetch failed`. No Context7 lookup succeeded.
- **The vendors' own documentation sites are blocked by this environment's egress proxy.**
  `www.inngest.com`, `ai-sdk.dev` and `langfuse.com` all return `EGRESS_BLOCKED`;
  `npmjs.com` (the website) returns 403. So no first-party doc page could be fetched directly.
- **What was reachable is better than docs for API questions, and worse for pricing.**
  `registry.npmjs.org` is exempt from the proxy, so the packages themselves were installed and
  read: version metadata, declared peer dependencies and engines, the published `.d.ts` type
  definitions, and the READMEs shipped inside the tarballs. A type definition is the primary
  source — it is what the compiler will enforce — so **every API-shape claim below is stronger
  evidence than a docs page would have been.**
- **Pricing and free-tier claims could not be established this way at all.** Those rest on
  `WebSearch` result summaries, which are third-party paraphrases of first-party pages. They are
  marked **could not confirm** regardless of how confident the summary sounded. Anyone quoting a
  free-tier number in the pitch should open the pricing page themselves.

Package versions are as published on 2026-08-31.

---

## Inngest — §9's "durable execution, resumable steps, human-in-the-loop pause"

Current version **4.18.1**, published 2026-08-13. Engines `node >=20`; peer dependencies include
`next >=12.0.0`, `react >=18.0.0`, `typescript >=5.8.0`. This repo runs Node 22.22.2, Next 16.3.3,
React 19.2.8 and TypeScript 5.9.3 — **inside every declared range**.
(Source: `https://registry.npmjs.org/inngest/latest`, and the installed package.)

| §9 claim | Verdict | Evidence |
|---|---|---|
| Pipeline as durable, resumable steps | **verified** | `step.run(idOrOptions, fn, ...input)` is declared in `inngest/components/InngestStepTools.d.ts`. |
| Serving from the Next.js App Router | **verified** | `inngest/next.d.ts` exports `serve` returning `{ GET, POST, PUT }`, with a doc comment stating "Next.js >=13 with the `app` dir must export individual methods". Next 16 is inside the `next >=12.0.0` peer range. |
| Human-in-the-loop pause for credit-note review | **verified, with a condition §9 does not mention** | `step.waitForEvent` exists — but see below. |
| Free tier is enough for a demo | **could not confirm** | inngest.com is egress-blocked. A WebSearch summary of Inngest's own usage-limits and pricing pages reports 50,000 executions/month, concurrency 5, and waits capped at 7 days on the Hobby plan. 54 records is trivially inside that, but nobody has read the page. |

**The condition, and it matters for the demo.** The pause is real, but it is not open-ended:

```ts
waitForEvent: <TOpts extends {
  event: string | EventType<string, any>;
  timeout: number | string | Date | DurationLike | InstantLike | ZonedDateTimeLike;
} & ExclusiveKeys<{ match?: string; if?: string }, "match", "if">>(
  idOrOptions: StepOptionsOrId, opts: TOpts
) => Promise<WaitForEventResult<TOpts>>;
```

`timeout` is **required — not optional**, and the package's own comment says the step "will wait
for the event for a maximum of this time, at which point the signal will be returned as `null`
instead of any signal data". So "`CREDIT_NOTE_REVIEW` → Inngest PAUSE (human-in-the-loop event)"
cannot mean "wait until a human gets to it". It means "wait up to N, then handle `null`", and the
pipeline needs a defined behaviour for the CA who does not answer in time. For a demo any generous
timeout works; the branch still has to exist, and §9's diagram does not show it.

**Also worth knowing, not a §9 error.** `step.ai.infer` ships with a built-in `anthropic` model
adapter (`InngestStepTools.d.ts`). The Investigate call could go through Inngest's own AI step
instead of the Vercel AI SDK. That is not a recommendation — routing it through the AI SDK keeps
one call path for Investigate, Explain and Act — but it exists, and it is the kind of thing worth
knowing before writing the step.

---

## Vercel AI SDK — §9's "`streamText` for Explain, tool calling for context fetches"

Current version of `ai` is **7.0.85**, published 2026-08-30 — a **major version 7**. The Anthropic
provider `@ai-sdk/anthropic` is at **4.0.46**, and `@ai-sdk/react` at **4.0.88**.
(Source: `https://registry.npmjs.org/{ai,@ai-sdk/anthropic,@ai-sdk/react}/latest`.)

| §9 claim | Verdict | Evidence |
|---|---|---|
| `streamText` for the Explain conversational layer | **verified** | `declare function streamText<TOOLS extends ToolSet, ...>` in `ai/dist/index.d.ts`. `generateText` likewise, for the non-streaming Investigate/Act calls. |
| Tool calling | **verified** | `streamText` and `generateText` both accept `tools`, `toolChoice`, `activeTools`, `toolOrder`, plus tool-approval and repair hooks. |
| Tool calling specifically for **MCP** context fetches | **could not confirm** | Nothing was read that establishes the MCP client surface in v7. Note this is not on the critical path: §9 itself says `razorpay-mcp-server` is dev-time only and the runtime reads synthetic fixtures. |
| Traceable by an OpenTelemetry-based tracer | **verified** | `streamText` accepts both `experimental_telemetry` and a `telemetry` option (`TelemetryOptions`). This is the hook Langfuse attaches to. |
| Works with React 19 / Next 16 | **verified for this repo, narrowly** | `@ai-sdk/react@4.0.88` declares `peerDependencies.react: "^18 \|\| ~19.0.1 \|\| ~19.1.2 \|\| ^19.2.1"`. This repo's React 19.2.8 satisfies `^19.2.1`. |

**Two sharp edges.**

1. **`ai@7` declares `engines.node >= 22`.** This repo declares `@types/node: "^20"` in
   `devDependencies`. The runtime here is Node 22.22.2 and Vercel's current runtimes are ≥22, so
   nothing breaks today — but the type definitions describe Node 20 while the SDK requires 22.
   Bump `@types/node` to `^22` when the SDK lands, or the mismatch will surface as a confusing
   type error rather than an obvious version error.
2. **That React peer range is a list of pins, not a floor.** `^18 || ~19.0.1 || ~19.1.2 || ^19.2.1`
   admits React 19.2.8 and rejects 19.1.0 and 19.2.0. A downgrade of React that looks harmless
   would break installation.

**The version gap is the real finding here.** §9 was written when the AI SDK's idioms were those of
v3/v4. The SDK is now on v7 with a separately versioned provider at v4, and any code written from
memory of the older API — `ai/react` import paths, the older `experimental_` prefixes, the pre-v5
message and tool shapes — will be wrong in a way that compiles-then-fails. Read the installed
`.d.ts` before writing the first agent call.

---

## Langfuse — §9's "every Claude call traced/versioned, free tier, self-hostable"

This is where §9 is furthest from how the library now ships.

| §9 claim | Verdict | Evidence |
|---|---|---|
| Langfuse traces AI SDK calls | **verified — but by a different package than the obvious one** | See below. |
| The `langfuse-vercel` / `LangfuseExporter` integration that every older tutorial shows | **wrong — deprecated** | `langfuse-vercel@3.38.20`'s own README: *"**This SDK is deprecated.** The Langfuse TypeScript SDK was completely rewritten and released as v4 in August 2025."* Its peer range is `ai >= 3.2.44`, written for an SDK three majors ago. |
| Tracing works on Vercel without extra work | **wrong — it silently loses traces** | See below. |
| Free tier is enough for a demo | **could not confirm** | langfuse.com is egress-blocked. Third-party summaries report a Hobby tier of 50,000 units/month with 30-day retention and 2 users, where a "unit" is any trace, observation or score — so one Claude call is several units. Plausible for 54 records; unverified. |
| Self-hostable | **could not confirm** | Widely stated, not confirmed from a first-party source here. Separately, several third-party pages assert Langfuse was **acquired by ClickHouse in January 2026**. That is unverified and directly relevant to §9's data-sovereignty argument, so check it before that argument goes in the pitch. |

**The current integration path.** `@langfuse/tracing` and `@langfuse/otel` are at **5.11.0**, and
`@langfuse/otel` exports a `LangfuseSpanProcessor` — an OpenTelemetry span processor, registered
against the OTel SDK, that picks up spans emitted by the AI SDK's telemetry option. There is also
**`@langfuse/vercel-ai-sdk@5.11.0`, described as "Telemetry integration for Vercel AI SDK v7", with
peer `ai: ">=7.0.0 <8"`** — so the current Langfuse line is aligned with the current AI SDK line.
Use those. Do not install `langfuse-vercel`.

**The serverless trap, stated in the package's own README.** `@langfuse/otel`:

> **Serverless / short-lived environments** (Vercel, AWS Lambda, Cloudflare Workers, edge): pass
> `exportMode: "immediate"` so spans are not held in a batch, and
> `await langfuseSpanProcessor.forceFlush()` before the function instance is frozen or terminated
> (e.g. inside Vercel's `after()` or the platform's `waitUntil()`). **Spans still buffered when the
> process exits are lost.**

`@langfuse/tracing`'s README carries the same instruction in its serverless checklist and its
Next.js quickstart (`after(async () => await langfuseSpanProcessor.forceFlush())`).

This is the finding with teeth. §9 treats tracing as ambient — wire it up and every Claude call is
traced. On Vercel it is not: without `exportMode: "immediate"` and an explicit `forceFlush()` in
`after()`, spans are batched into a function instance that gets frozen, and the traces are **lost
without an error**. The failure looks exactly like "we didn't call the model much", which is the
worst possible shape for an observability claim in a pitch about verifiability. Whoever writes the
Explain/Act call sites owns this line of code, not a later observability pass.

---

## Also checked, because it is the stack's largest unverified risk

Not one of the three named libraries, and no §9 claim is being contradicted — but it is worth one
paragraph while the packages are open.

`@razorpay/blade@12.121.0` declares `peerDependencies` including `react: ">=18"`,
`react-dom: ">=18"` and **`styled-components: "^5"`**, plus `framer-motion`, `@gorhom/portal`,
`react-hot-toast@2.4.1` and a set of `react-native` peers.
(Source: `https://registry.npmjs.org/@razorpay/blade/latest`.)

React 19 satisfies `>=18` nominally. **Whether styled-components v5 behaves under React 19 inside
Next 16's App Router was not verified** — it is a runtime-and-SSR question that a peer range cannot
answer, and it is the single thing in this stack most likely to cost an afternoon. Install Blade
into a scratch branch and render one component before committing the UI to it.

---

## What a later session should take from this

1. **Nothing in §9 needs rewriting for Inngest.** It works as described; the pause just needs a
   timeout and a defined behaviour when the timeout fires.
2. **The AI SDK section of §9 is right in intent and stale in detail.** v7 + provider v4, Node ≥22.
   Read the shipped types, not a remembered API — this is the project's own first rule and the
   version gap is exactly what it exists to catch.
3. **The Langfuse section of §9 is wrong in mechanism.** The integration it implies is deprecated,
   and the current one loses traces on Vercel unless flushed explicitly. Both are cheap to get
   right if known in advance and expensive to debug if not.
4. **Every pricing number in §9's cost argument is unverified.** Not disputed — unverified. The
   pricing pages could not be reached from this environment.
