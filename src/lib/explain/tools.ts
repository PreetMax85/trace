import { tool } from "ai";
import { z } from "zod";
import { formatIstDateTime } from "@/lib/format/date";
import { exceptionCategory } from "@/lib/audit/schema";
import type { ReviewBatch } from "@/lib/review/batch";

/**
 * The tools Explain is allowed to hold, by name.
 *
 * This list is the machine-readable half of "read-only · cannot write"
 * (PRD §9), and it is a STRICTER boundary than Investigate's: Explain may not
 * classify, so it holds none of the tools that gather classification evidence.
 * Every entry reads an already-computed batch held in memory and returns a
 * plain object — nothing here touches Postgres, the network, or Razorpay.
 */
export const READ_ONLY_EXPLAIN_TOOL_NAMES = [
  "batchTotals",
  "listRecords",
  "getRecord",
  "taxByCategory",
] as const;

export type ExplainToolName = (typeof READ_ONLY_EXPLAIN_TOOL_NAMES)[number];

/**
 * How many records one listing returns before it truncates.
 *
 * A cap is needed because an unfiltered list is all 54 rows on every call. The
 * number matters less than the fact that truncation is REPORTED: a model handed
 * a silently shortened list would count 25 records and state that as the total,
 * which is the failure mode a reconciliation product can least afford. The
 * exact aggregates live in `batchTotals` and `taxByCategory`, so listing is for
 * finding records to cite, never for arithmetic.
 */
export const LIST_LIMIT = 25;

/**
 * Explain's tools, closed over one already-reconciled batch.
 *
 * They read the SAME `ReviewBatch` the screen renders — they do not re-derive a
 * single figure. Two derivations of "ITC at risk" is how an answer ends up
 * quoting a number the table beside it disagrees with, and here the answer and
 * the pixels are provably the same arithmetic.
 */
export function createExplainTools(batch: ReviewBatch) {
  const { header, rows } = batch;

  return {
    batchTotals: tool({
      description:
        "The reconciled totals for the filing period: the tax on Razorpay's GSTR-2B invoice, how much input tax credit is claimable, how much is at risk, and how many records matched. Use these figures for any arithmetic rather than adding up records yourself.",
      inputSchema: z.object({}),
      execute: () => ({
        period: header.period,
        merchantGstin: header.merchantGstin,
        invoiceTaxPaise: header.invoiceTaxPaise,
        rolledUpTaxPaise: header.rolledUpTaxPaise,
        rollupDeltaPaise: header.rollupDeltaPaise,
        itcClaimablePaise: header.itcClaimablePaise,
        itcAtRiskPaise: header.itcAtRiskPaise,
        totalRecords: header.totalRecords,
        matchedCount: header.matchedCount,
        exceptionCount: header.exceptionCount,
        itcAvailableOnInvoice: header.itcAvailable,
      }),
    }),

    listRecords: tool({
      description:
        "List settlement records, optionally narrowed to matched or flagged rows or to one exception category. Returns the record ids to cite. Truncates, and says so, when more records match than it can return.",
      inputSchema: z.object({
        status: z
          .enum(["MATCHED", "EXCEPTION"])
          .optional()
          .describe("Only matched rows, or only flagged ones. Omit for both."),
        category: z
          .enum(exceptionCategory.enumValues)
          .optional()
          .describe("Only rows carrying this exception category."),
      }),
      execute: ({ status, category }) => {
        const matching = rows.filter(
          (row) =>
            (status === undefined || row.status === status) &&
            (category === undefined || row.category === category),
        );

        return {
          records: matching.slice(0, LIST_LIMIT).map((row) => ({
            recordId: row.recordId,
            amountPaise: row.amountPaise,
            feePaise: row.feePaise,
            taxPaise: row.taxPaise,
            status: row.status,
            category: row.category,
            billedIn: row.billedIn,
            settledAtIst: formatIstDateTime(row.settledAt),
          })),
          matching: matching.length,
          returned: Math.min(matching.length, LIST_LIMIT),
          truncated: matching.length > LIST_LIMIT,
        };
      },
    }),

    getRecord: tool({
      description:
        "Every figure held about one settlement record, by its record id. Use it before citing a record, to check that the record exists and that the numbers are what you are about to say they are.",
      inputSchema: z.object({
        recordId: z.string().describe("The record id, e.g. pay_ABC123."),
      }),
      execute: ({ recordId }) => {
        const row = rows.find((candidate) => candidate.recordId === recordId);
        // `found: false` rather than an error or an empty record. An absent
        // record is an ANSWER — "this batch does not contain that" — and it is
        // the one the model needs in order not to cite something imaginary.
        if (!row) return { found: false as const, recordId };

        return {
          found: true as const,
          recordId: row.recordId,
          settlementId: row.settlementId,
          orderId: row.orderId,
          amountPaise: row.amountPaise,
          feePaise: row.feePaise,
          taxPaise: row.taxPaise,
          expectedFeePaise: row.expectedFeePaise,
          status: row.status,
          matchMethod: row.method,
          rateCell: row.rateCell,
          category: row.category,
          billedIn: row.billedIn,
          settledAtIst: formatIstDateTime(row.settledAt),
          creditNoteReview: row.creditNoteReview,
        };
      },
    }),

    taxByCategory: tool({
      description:
        "The GST inside Razorpay's fees, totalled per exception category, with the matched rows as their own group. This is the breakdown behind the claimable and at-risk figures.",
      inputSchema: z.object({}),
      execute: () => {
        const groups = new Map<string, { records: number; taxPaise: number; feePaise: number }>();
        for (const row of rows) {
          const key = row.category ?? "MATCHED";
          const group = groups.get(key) ?? { records: 0, taxPaise: 0, feePaise: 0 };
          group.records += 1;
          group.taxPaise += row.taxPaise;
          group.feePaise += row.feePaise;
          groups.set(key, group);
        }

        return {
          groups: [...groups]
            .map(([category, totals]) => ({ category, ...totals }))
            .sort((a, b) => b.taxPaise - a.taxPaise),
        };
      },
    }),
  };
}

export type ExplainTools = ReturnType<typeof createExplainTools>;
