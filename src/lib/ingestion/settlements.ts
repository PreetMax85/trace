import type { ReconItem } from "@/lib/matching/types";
import {
  parseJsonText,
  requireEpochSeconds,
  requireInteger,
  requireNonEmptyArray,
  requireNonEmptyString,
  requireObject,
} from "./guards";

/** The money fields, all of them integer paise. */
const MONEY_FIELDS = ["amount", "fee", "tax", "debit", "credit"] as const;

/**
 * Razorpay's settlement recon report into exactly the `ReconItem[]` the matcher
 * accepts. Takes raw JSON text (the shape the file and the API both arrive in)
 * or an already-parsed value.
 *
 * Accepts either a bare array of rows or Razorpay's collection envelope
 * (`{ entity, count, items }`). Nothing is coerced and nothing is repaired: a
 * row that does not validate stops the batch, because a settlement batch that
 * silently lost or reshaped a row still produces a confident rollup.
 */
export function parseSettlements(raw: unknown): ReconItem[] {
  const parsed = parseJsonText(raw, "settlement payload");

  const items = Array.isArray(parsed)
    ? parsed
    : extractItems(parsed);

  requireNonEmptyArray(items, "settlement payload");

  return items.map(toReconItem);
}

/**
 * The collection envelope. `count` is checked against the rows actually present
 * because a short read against a paged API is the one failure that yields a
 * perfectly well-formed batch with records missing from it — and a rollup over
 * the survivors looks entirely reasonable.
 */
function extractItems(parsed: unknown): unknown[] {
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(
      "settlement payload must be an array of recon rows, or a collection with an `items` array",
    );
  }

  const envelope = parsed as Record<string, unknown>;
  if (!Array.isArray(envelope.items)) {
    throw new Error(
      "settlement payload must be an array of recon rows, or a collection with an `items` array",
    );
  }

  // An envelope that declares no count cannot be checked against anything, so
  // accepting one gives back exactly the silence this comparison exists to
  // break — a truncated page reads as a complete batch. Razorpay's collection
  // envelope always carries `count`; one that does not is not a short read we
  // can rule out. A bare array is a different shape, not an envelope missing a
  // field, and is still accepted above.
  if (envelope.count === undefined) {
    throw new Error(
      "settlement collection carries no `count`, so a truncated or over-paged read cannot be ruled out — send the envelope Razorpay returns, or a bare array of rows",
    );
  }

  if (envelope.count !== envelope.items.length) {
    throw new Error(
      `settlement collection declares count ${String(envelope.count)} but carries ${envelope.items.length} items — the payload is truncated or over-paged`,
    );
  }

  return envelope.items;
}

function toReconItem(item: unknown, index: number): ReconItem {
  const row = requireObject(item, `settlements[${index}]`);
  // The row's own id in the path, because "fee must be an integer" is not an
  // actionable error 54 rows into a batch.
  const id = typeof row.entity_id === "string" && row.entity_id.length > 0 ? row.entity_id : null;
  const at = id ? `settlements[${index}] (${id})` : `settlements[${index}]`;

  const type = row.type;
  // Anything else is a shape nothing downstream classifies. `adjustment`,
  // `transfer` and friends exist in Razorpay's ledger and are not settlements
  // of a payment, so passing one through would put an unclassifiable row into
  // the rollup rather than in front of a human.
  if (type !== "payment" && type !== "refund") {
    throw new Error(`${at}.type must be "payment" or "refund", got ${JSON.stringify(type)}`);
  }

  const money = Object.fromEntries(
    MONEY_FIELDS.map((field) => [field, requireInteger(row[field], `${at}.${field}`)]),
  ) as Record<(typeof MONEY_FIELDS)[number], number>;

  return {
    entity_id: requireNonEmptyString(row.entity_id, `${at}.entity_id`),
    type,
    ...money,
    order_id: requireNonEmptyString(row.order_id, `${at}.order_id`),
    payment_id: joinKey(row, type, at),
    settlement_id: requireNonEmptyString(row.settlement_id, `${at}.settlement_id`),
    // The T+2 month-boundary rule reads this instant, in IST. An absent,
    // fractional or wrongly-scaled timestamp silently picks a filing period —
    // hence seconds specifically, not merely an integer.
    settled_at: requireEpochSeconds(row.settled_at, `${at}.settled_at`),
    // Read leniently, and deliberately so. Both are for the screen, neither is
    // arithmetic, and refusing a batch because a display string is missing
    // would stop a reconciliation over something that changes no figure.
    payment_method: optionalString(row.method),
    settlement_utr: optionalString(row.settlement_utr),
  };
}

/** A string when there is one to read, null otherwise. Never throws. */
function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * `payment_id` is the ONLY join key for `REFUND_NETTED` — a refund is netted
 * into a later settlement cycle, so joining on `settlement_id` finds nothing
 * and looks correct doing it (BUILD-LOG entry 3). A refund arriving without it
 * silently removes a record from the category, so it is refused.
 *
 * On a payment row the payment's own id lives in `entity_id`, and `payment_id`
 * is null. A populated one would make the payment look like the target of its
 * own reversal.
 */
function joinKey(row: Record<string, unknown>, type: "payment" | "refund", at: string) {
  if (type === "refund") {
    return requireNonEmptyString(
      row.payment_id,
      `${at}.payment_id (the payment a refund reverses)`,
    );
  }

  // Absent is accepted as null: JSON has no way to write "explicitly unset",
  // and this normalises structure rather than a value.
  const value = row.payment_id ?? null;
  if (value !== null) {
    throw new Error(
      `${at}.payment_id must be null on a payment row — the payment's own id belongs in entity_id — got ${JSON.stringify(value)}`,
    );
  }
  return null;
}
