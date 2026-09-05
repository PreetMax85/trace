/**
 * Validation primitives for the ingestion layer.
 *
 * Every one of these THROWS naming the field it rejected, and none of them
 * coerces. That is the whole point: the failure this project is built against
 * is a bad input quietly becoming a plausible number, which then reconciles to
 * something a CA is asked to trust. An error that names `settlements[41]
 * (pay_…).fee` is recoverable; a silently coerced 35.38 is not.
 */

/** Raw JSON text, or an already-parsed value, into a value. */
export function parseJsonText(raw: unknown, what: string): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch (cause) {
    throw new Error(
      `${what} is not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
}

/** Arrays are objects to `typeof`, and never what these callers mean. */
export function requireObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object, got ${describe(value)}`);
  }
  return value as Record<string, unknown>;
}

export function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array, got ${describe(value)}`);
  }
  return value;
}

/**
 * An array that must carry at least one element. Emptiness is rejected rather
 * than summed to zero: a statement with no invoice line totals to a zero
 * invoice, and the tier-2 delta then reports the government as having billed
 * nothing while the merchant claims credit — well-formed input, nonsense output.
 */
export function requireNonEmptyArray(value: unknown, path: string): unknown[] {
  const array = requireArray(value, path);
  if (array.length === 0) throw new Error(`${path} is empty, and there is nothing to reconcile`);
  return array;
}

export function requireNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${path} must be a non-empty string, got ${describe(value)}`);
  }
  return value;
}

/**
 * Integer paise. Razorpay returns money as integers; a fractional value means
 * somebody divided by 100 upstream, and the matcher's tolerance is exactly 100
 * paise — so a rupee figure passes every comparison looking like a fee two
 * orders of magnitude too small. Multiplying it back would be a guess about
 * which unit arrived, so it is refused instead.
 *
 * SAFE integer, not merely integer: `Number.isInteger(1e21)` is true and
 * `1e21 + 1 === 1e21`, so paise past 2^53 stop being countable and the tier-2
 * rollup would sum them into a total that is quietly wrong rather than
 * obviously absurd.
 */
export function requireInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`${path} must be an integer number of paise, got ${describe(value)}`);
  }
  return value;
}

/**
 * GST commenced on 1 July 2017, so no settlement predating it can appear on any
 * GSTR-2B; and no real settlement lands in the 22nd century. The window is
 * deliberately domain-shaped rather than arbitrary, and it is what makes the
 * unit detectable at all.
 */
const GST_COMMENCEMENT_SECONDS = 1_498_847_400; // 00:00 IST, 1 Jul 2017
const FAR_FUTURE_SECONDS = 4_102_444_800; // 00:00 UTC, 1 Jan 2100

/**
 * A settlement instant, in Unix SECONDS.
 *
 * Razorpay returns seconds, but a millisecond value is a perfectly good safe
 * integer, so `requireInteger` passes it straight through. Nothing then fails:
 * `periodOf` reads it as a date tens of thousands of years out, which is simply
 * a different filing period, and the row is billed against a GSTR-2B that does
 * not exist. One such row takes the July batch from 38 matched to 37 and the
 * rollup delta from 34105 to 34645, silently.
 *
 * Milliseconds (~1.8e12), microseconds and nanoseconds all sit far above the
 * ceiling, and seconds-since-1970 values from before GST sit below the floor.
 */
export function requireEpochSeconds(value: unknown, path: string): number {
  const seconds = requireInteger(value, path);
  if (seconds < GST_COMMENCEMENT_SECONDS || seconds > FAR_FUTURE_SECONDS) {
    // The hint is worth naming: milliseconds is the way this actually happens,
    // and "out of range" alone sends the reader looking at the data instead of
    // at the unit.
    const hint =
      seconds > FAR_FUTURE_SECONDS
        ? " — a value this large is the same instant in milliseconds (or finer), not seconds"
        : "";
    throw new Error(
      `${path} must be a settlement instant in Unix seconds between 1 Jul 2017 and 1 Jan 2100, got ${seconds}${hint}`,
    );
  }
  return seconds;
}

/**
 * A finite number that may be fractional — statement money is in RUPEES. The
 * asymmetry with the recon side is real, not a bug; the matcher converts once.
 */
export function requireFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number of rupees, got ${describe(value)}`);
  }
  return value;
}

/**
 * A GSTIN's STRUCTURE — two-digit state code, ten-character PAN, entity code,
 * the literal `Z`, check digit. This is the same pattern `tests/fixtures.test.ts`
 * gates its mod-36 checksum behind, deliberately: an entity code of `0` and a
 * 14th character other than `Z` are shapes the dataset's own assertion rejects,
 * and ingestion accepting them would admit an identifier the repo elsewhere
 * calls invalid.
 *
 * The check digit itself is not verified here. `tests/fixtures.test.ts` already
 * asserts it over the dataset, and a wrong checksum implementation would reject
 * valid identifiers — the more expensive failure.
 */
const GSTIN_SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function requireGstin(value: unknown, path: string): string {
  const gstin = requireNonEmptyString(value, path);
  if (!GSTIN_SHAPE.test(gstin)) {
    throw new Error(`${path} is not shaped like a GSTIN: ${JSON.stringify(gstin)}`);
  }
  return gstin;
}

/** A GST return period, `MMYYYY`. Month 13 is shaped like one until you read it. */
const PERIOD_SHAPE = /^(0[1-9]|1[0-2])\d{4}$/;

export function requirePeriod(value: unknown, path: string): string {
  const period = requireNonEmptyString(value, path);
  if (!PERIOD_SHAPE.test(period)) {
    throw new Error(`${path} must be a filing period shaped MMYYYY, got ${JSON.stringify(period)}`);
  }
  return period;
}

/** Enough of the offending value to identify it, never enough to dump a payload. */
function describe(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return JSON.stringify(value.slice(0, 40));
  if (Array.isArray(value)) return `an array of ${value.length}`;
  return typeof value;
}
