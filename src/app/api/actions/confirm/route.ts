import { and, eq } from "drizzle-orm";
import { confirmable, draftForKind, parseConfirmRequest } from "@/lib/act/confirm";
import { loadReviewBatch } from "@/lib/review/batch";

/**
 * The human gate (PRD §9, agent 3).
 *
 * Act drafts; this is the only thing in Trace that records a person's decision
 * to act on one. It writes an `actions` row with `confirmed_at` set, and that
 * is the whole of what "confirmed" means: an `actions` row exists if and only
 * if somebody clicked Confirm. Nothing is sent, nothing is filed, and nothing
 * is posted to the merchant's books — the row is a record of approval, and the
 * sending is theirs to do.
 *
 * §9 describes the gate as `confirmed_at IS NULL until a person clicks
 * Confirm`. The column is nullable and means exactly that, but no row is
 * written before the click: an unconfirmed draft lives in the committed drafts
 * file, not in the database, so there is nothing to write a null against. The
 * audit property is the stronger one either way — every row in `actions` was
 * approved by a person, and a query for unapproved actions returns nothing
 * because none were ever taken.
 *
 * POST only. Route Handlers are uncached for every method except GET.
 */

const failure = (status: number, message: string) =>
  Response.json({ error: message }, { status });

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return failure(400, "That request was not JSON.");
  }

  let confirmation;
  try {
    confirmation = parseConfirmRequest(body);
  } catch (error) {
    return failure(400, error instanceof Error ? error.message : "That is not an action.");
  }

  if (!process.env.DATABASE_URL) {
    return failure(
      503,
      "Confirming an action records it in the audit trail, and no database is configured. Nothing is confirmed off the record.",
    );
  }

  const row = loadReviewBatch().rows.find(
    (candidate) => candidate.recordId === confirmation.recordId,
  );
  if (!row) {
    return failure(404, "That record is not in this batch.");
  }

  // The gate, checked on the SERVER on every confirmation. The disabled button
  // is a courtesy to the person; this is the rule. A draft that states a figure
  // the record does not carry must not become something the merchant approved.
  const allowed = confirmable(row.draft);
  if (!allowed.ok) {
    return failure(409, allowed.reason);
  }

  try {
    const { db, schema } = await import("@/lib/audit/client");
    const { ensureBatchWithRecords, findRecordRowId } = await import("@/lib/audit/persist");

    const batchId = await ensureBatchWithRecords();
    const recordRowId = await findRecordRowId(batchId, confirmation.recordId);
    if (recordRowId === null) {
      return failure(404, "That record is not in this batch's audit trail.");
    }

    // Confirming twice is the same decision, not two of them. Returned as it
    // stands rather than inserted again, so a double click does not put two
    // approvals of one action into the audit trail.
    const already = await db
      .select({ id: schema.actions.id, confirmedAt: schema.actions.confirmedAt })
      .from(schema.actions)
      .where(
        and(
          eq(schema.actions.recordId, recordRowId),
          eq(schema.actions.kind, confirmation.kind),
        ),
      )
      .limit(1);

    if (already[0]) {
      return Response.json({
        id: already[0].id,
        kind: confirmation.kind,
        confirmedAt: already[0].confirmedAt?.toISOString() ?? null,
        alreadyConfirmed: true,
      });
    }

    const [inserted] = await db
      .insert(schema.actions)
      .values({
        recordId: recordRowId,
        kind: confirmation.kind,
        // The ONE action that was approved, byte for byte as it was shown. The
        // draft on screen, the draft confirmed and the draft stored have to be
        // the same thing, which is why drafts are recorded ahead of time rather
        // than regenerated on view.
        draft: draftForKind(allowed.draft, confirmation.kind),
        confirmedAt: new Date(),
      })
      .returning({ id: schema.actions.id, confirmedAt: schema.actions.confirmedAt });

    return Response.json({
      id: inserted.id,
      kind: confirmation.kind,
      confirmedAt: inserted.confirmedAt?.toISOString() ?? null,
      alreadyConfirmed: false,
    });
  } catch (error) {
    // The message is not echoed back. It can carry a connection string, and
    // this route is public.
    console.error("confirm route failed", error);
    return failure(500, "That action could not be confirmed. Nothing was recorded.");
  }
}
