import { tool } from "ai";
import { z } from "zod";
import { RATE_CELLS, TOLERANCE_PAISE, periodOf, priceAt } from "@/lib/matching";
import type { RateCell } from "@/lib/matching/rate-card";
import type { ReconItem } from "@/lib/matching/types";

/**
 * The tools Investigate is allowed to hold, by name.
 *
 * This list is the machine-readable half of "may classify, may not write"
 * (PRD §9). The prompt states the boundary; this enforces it. Every entry reads
 * from an in-memory copy of the batch and returns a plain object — none of them
 * touches Postgres, the network, or Razorpay's API, so there is no write path
 * for the model to find however it is prompted.
 *
 * The runner checks the tool set it was handed against this list before calling
 * the model. That check is the point: a future change that hands Investigate a
 * tool which mutates anything is refused at the boundary rather than discovered
 * in an audit.
 */
export const READ_ONLY_TOOL_NAMES = [
  "priceAtPublishedRates",
  "findRefundsForPayment",
  "findOrderSiblings",
  "resolveFilingPeriod",
] as const;

export type ReadOnlyToolName = (typeof READ_ONLY_TOOL_NAMES)[number];

/**
 * Investigate's tools, closed over one batch of settlement rows.
 *
 * The DEFINITIONS — names, descriptions, schemas — are constant, which matters
 * for cost: Anthropic renders tools ahead of the system prompt, so they sit
 * inside the cached prefix (PRD §9). Only the closed-over data varies, and the
 * model never sees that except as tool results.
 */
export function createInvestigateTools(items: readonly ReconItem[]) {
  return {
    priceAtPublishedRates: tool({
      description:
        "Price a captured amount against every published Razorpay rate cell and report which cells, if any, explain the fee that was actually charged within the 1 rupee tolerance.",
      inputSchema: z.object({
        amountPaise: z.number().int().describe("The captured amount, in paise."),
        feePaise: z.number().int().describe("The fee actually charged, in paise, inclusive of GST."),
      }),
      execute: ({ amountPaise, feePaise }) => {
        // Nothing captured means nothing billed, and without this guard every
        // cell "explains" the fee — 2% and 2.15% of zero are both zero. That
        // reads as a clean match on a failed retry, which is wrong in the
        // flattering direction.
        if (amountPaise === 0) {
          return {
            cells: [],
            tiedCells: [],
            note: "Nothing was captured, so no fee is expected and no rate cell can explain one.",
          };
        }

        const cells = (Object.keys(RATE_CELLS) as RateCell[]).map((cell) => {
          const { fee, tax } = priceAt(amountPaise, cell);
          return {
            cell,
            ratePercent: RATE_CELLS[cell] / 100,
            expectedFeePaise: fee,
            expectedTaxPaise: tax,
            differencePaise: feePaise - fee,
            tiesWithinTolerance: Math.abs(fee - feePaise) <= TOLERANCE_PAISE,
          };
        });

        return {
          cells,
          // EVERY cell that ties, never just the first. Two cells 0.15pp apart
          // price within 1 rupee of each other on small payments, so a fee can
          // genuinely satisfy both; returning one would make the answer depend
          // on key order. Ambiguity is a property of the fee.
          tiedCells: cells.filter((c) => c.tiesWithinTolerance).map((c) => c.cell),
          note: null,
        };
      },
    }),

    findRefundsForPayment: tool({
      description:
        "Find refund rows that reverse a given payment. Refunds are separate rows carrying a debit, joined to the payment by payment_id.",
      inputSchema: z.object({
        paymentId: z
          .string()
          .describe("The entity_id of the payment to look for refunds against, e.g. pay_ABC123."),
      }),
      execute: ({ paymentId }) => {
        // Joined on payment_id, NEVER settlement_id. A refund is netted into a
        // LATER settlement cycle than the payment it reverses, so the two
        // almost never share a settlement id and a settlement join would find
        // nothing while looking like it worked. PRD §7.
        const refunds = items.filter((i) => i.type === "refund" && i.payment_id === paymentId);
        return {
          refunds: refunds.map((r) => ({
            entityId: r.entity_id,
            amountPaise: r.amount,
            debitPaise: r.debit,
            settlementId: r.settlement_id,
            settledOn: new Date(r.settled_at * 1000).toISOString().slice(0, 10),
          })),
          count: refunds.length,
        };
      },
    }),

    findOrderSiblings: tool({
      description:
        "Find every settlement row sharing an order id, including the row asked about. Used to spot a failed-then-retried payment, where one of the rows captured nothing.",
      inputSchema: z.object({
        orderId: z.string().describe("The order_id to group rows by, e.g. order_ABC123."),
      }),
      execute: ({ orderId }) => {
        const siblings = items.filter((i) => i.order_id === orderId);
        return {
          siblings: siblings.map((s) => ({
            entityId: s.entity_id,
            type: s.type,
            amountPaise: s.amount,
            feePaise: s.fee,
          })),
          count: siblings.length,
          zeroValueCount: siblings.filter((s) => s.amount === 0).length,
        };
      },
    }),

    resolveFilingPeriod: tool({
      description:
        "Resolve which GSTR-2B filing period a settlement timestamp falls into. Returns MMYYYY.",
      inputSchema: z.object({
        settledAtUnixSeconds: z
          .number()
          .int()
          .describe("The settled_at timestamp as Unix seconds."),
      }),
      execute: ({ settledAtUnixSeconds }) => ({
        // Delegated to the matcher's own `periodOf` rather than reimplemented,
        // so the agent and the deterministic layer can never place the same
        // settlement in different months. It reads the instant in IST; UTC
        // would push anything settled in the last 5 and a half hours of a month
        // into the wrong period, which is the exact window T+2 crowds into.
        period: periodOf(settledAtUnixSeconds),
      }),
    }),
  };
}

export type InvestigateTools = ReturnType<typeof createInvestigateTools>;
