import { and, desc, eq } from "drizzle-orm";
import { loadAuditRows, MERCHANT_GSTIN, REVIEW_PERIOD } from "@/lib/review/batch";
import { db, schema } from "./client";

/**
 * The `batches` row this period's writes attach to, with its `records` rows
 * underneath it, creating either if they are not there yet.
 *
 * Shared by every route that writes, and that sharing is the point rather than
 * tidiness. A `batches` row is one RUN — it carries `startedAt`, `completedAt`
 * and `processingTimeMs` — and the reconciliation is deterministic, so reusing
 * the latest row for the period is right: a fresh row per request would fill
 * the audit trail with runs nobody performed.
 *
 * Records are written WITH the batch, in the same transaction, and backfilled
 * for a batch that has none. Before this existed the live Explain route could
 * insert a batch row saying `total_records = 54` with zero rows under it, which
 * nothing read and so nothing caught; `actions.record_id` is a foreign key into
 * `records`, so the Confirm button is the first thing that would have found out.
 *
 * The whole batch, never the single record being confirmed. A partial batch is
 * a worse audit trail than an absent one: it reads as a complete run that lost
 * 53 rows.
 */
export async function ensureBatchWithRecords(): Promise<string> {
  const { batch, recordsFor } = loadAuditRows();

  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: schema.batches.id })
      .from(schema.batches)
      .where(
        and(
          eq(schema.batches.merchantGstin, MERCHANT_GSTIN),
          eq(schema.batches.period, REVIEW_PERIOD),
        ),
      )
      .orderBy(desc(schema.batches.startedAt))
      .limit(1);

    const batchId =
      existing[0]?.id ??
      (
        await tx
          .insert(schema.batches)
          .values(batch)
          .returning({ id: schema.batches.id })
      )[0].id;

    // Checked rather than assumed: a batch row may predate this helper, or have
    // been written by the Explain route before records were part of the pair.
    const anyRecord = await tx
      .select({ id: schema.records.id })
      .from(schema.records)
      .where(eq(schema.records.batchId, batchId))
      .limit(1);

    if (anyRecord.length === 0) {
      await tx.insert(schema.records).values(recordsFor(batchId));
    }

    return batchId;
  });
}

/**
 * The `records.id` a settlement record was written under, for a foreign key to
 * point at.
 *
 * `records.record_id` is Razorpay's id (`pay_…`) and `records.id` is the audit
 * trail's own uuid; `actions.record_id` references the latter. Returns null
 * rather than throwing so a caller can answer "that record is not in this
 * batch" as a 404 instead of a 500.
 */
export async function findRecordRowId(
  batchId: string,
  recordId: string,
): Promise<string | null> {
  const found = await db
    .select({ id: schema.records.id })
    .from(schema.records)
    .where(and(eq(schema.records.batchId, batchId), eq(schema.records.recordId, recordId)))
    .limit(1);

  return found[0]?.id ?? null;
}
