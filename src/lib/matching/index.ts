import { priceAt, RATE_CELLS, TOLERANCE_PAISE } from "./rate-card";
import type { RateCell } from "./rate-card";
import type {
  BatchResult,
  ExceptionCategory,
  Gstr2bStatement,
  ItcVerdict,
  MatchInput,
  MatchedRecord,
  MatchMode,
  ReconItem,
} from "./types";

export * from "./types";
export * from "./rate-card";

/**
 * The Detect layer. Deterministic by design — no LLM call ever happens here.
 */
export function matchBatch(input: MatchInput): BatchResult {
  // A statement covers one filing period and carries which one it is. Silently
  // reconciling against another month's invoice produces a confident,
  // meaningless delta, so the mismatch is fatal rather than inferred away.
  if (input.statement?.rtnprd !== input.period) {
    throw new Error(
      `GSTR-2B statement is for period ${input.statement?.rtnprd ?? "unknown"}, but the batch claims ${input.period}`,
    );
  }

  const records: MatchedRecord[] = [];
  const payments = input.settlements.filter((i) => i.type === "payment");

  // Duplicates would each be classified and each counted in the tier-2 rollup,
  // inflating claimed ITC. Refused outright: de-duplicating silently would hide
  // an ingestion bug behind a plausible-looking number.
  const seen = new Set<string>();
  for (const p of payments) {
    if (seen.has(p.entity_id)) {
      throw new Error(`Settlement record ${p.entity_id} appears more than once in the batch`);
    }
    seen.add(p.entity_id);
  }

  /**
   * Orders that captured money. A failed-then-retried payment leaves two rows
   * under one `order_id`, and only the captured leg is billable.
   */
  const capturedOrders = new Set(
    payments.filter((p) => p.amount > 0).map((p) => p.order_id),
  );

  /**
   * Payments that a refund row reverses. Keyed on `payment_id` and NEVER on
   * `settlement_id`: a refund is netted into a later settlement cycle, so it
   * almost never shares one with the payment it reverses. Joining the other way
   * finds nothing and looks correct doing it.
   */
  const reversedPayments = new Set(
    input.settlements
      .filter((i) => i.type === "refund" && i.payment_id !== null)
      .map((i) => i.payment_id as string),
  );

  for (const item of payments) {
    // The period whose GSTR-2B carries this row's fee — which is the period the
    // settlement landed in, not the one being reconciled. They differ exactly
    // when T+2 pushed the settlement past a month end.
    const billedIn = periodOf(item.settled_at);
    const resolved = resolveCells(item, input.mode);
    // More than one published cell explains this fee, so nothing but iteration
    // order could choose between them. Report the ambiguity instead of guessing.
    const ambiguous = resolved.length > 1;
    const hit = ambiguous ? null : (resolved[0] ?? null);

    const category = classify(item, {
      hit,
      ambiguous,
      capturedOrders,
      reversedPayments,
      billedIn,
      period: input.period,
    });
    // A record can be priced correctly and still be an exception — a netted
    // refund resolves cleanly to STANDARD and is an exception for a reason that
    // has nothing to do with its fee. The cell is kept; the verdict is not.
    const matched = hit !== null && category === null;

    records.push({
      recordId: item.entity_id,
      settlementId: item.settlement_id,
      status: matched ? "MATCHED" : "EXCEPTION",
      // The rate cell IS the confidence tier: the merchant's expected rate held
      // (EXACT), another published cell explained it (FUZZY), or nothing did.
      method: matched ? (hit!.cell === "STANDARD" ? "EXACT" : "FUZZY") : "NONE",
      rateCell: hit?.cell ?? null,
      razorpayFeePaise: item.fee,
      razorpayTaxPaise: item.tax,
      expectedFeePaise: hit?.fee ?? null,
      expectedTaxPaise: hit?.tax ?? null,
      category,
      creditNoteReview: category === "REFUND_NETTED",
      billedIn,
    });
  }

  const invoice = invoiceTotals(input.statement);
  // Only records this period's invoice actually bills, and only the ones a rate
  // cell explained. Everything else is, by definition, the delta.
  const rolledUpTaxPaise = records
    .filter((r) => r.status === "MATCHED" && r.billedIn === input.period)
    .reduce((total, r) => total + r.razorpayTaxPaise, 0);

  return {
    records,
    rollup: {
      ...invoice,
      rolledUpTaxPaise,
      rollupDeltaPaise: invoice.gstr2bInvoiceTaxPaise - rolledUpTaxPaise,
    },
    itc: itcVerdict(input.statement),
  };
}

/**
 * GSTN's verdict for the period. Ineligible if ANY document on the statement
 * says so — the conservative direction, because claiming credit the government
 * has marked unavailable is the error that costs the merchant, not the one that
 * costs them a question.
 */
function itcVerdict(statement: Gstr2bStatement): ItcVerdict {
  const invoices = statement.docdata.b2b.flatMap((supplier) => supplier.inv);
  const blocked = invoices.filter((inv) => inv.itcavl !== "Y");
  const reason = blocked.map((inv) => inv.rsn).find((r) => r.trim().length > 0);

  return { available: blocked.length === 0, reason: reason ?? null };
}

/** Rupees in the statement, paise everywhere else. Converted once, here. */
const rupeesToPaise = (rupees: number) => Math.round(rupees * 100);

/**
 * The period's Razorpay invoice, totalled. Summed across every document rather
 * than read from `[0]`: the fixture carries exactly one line, but indexing the
 * first would silently discard anything else a real statement contained.
 *
 * Tax is always the SUM of the three heads. A Maharashtra merchant billed by
 * Razorpay's Maharashtra registration sees CGST+SGST; every other state sees
 * IGST. Keying on one field silently breaks for the other population.
 */
function invoiceTotals(statement: Gstr2bStatement) {
  let gstr2bInvoiceTxvalPaise = 0;
  let gstr2bInvoiceTaxPaise = 0;

  for (const supplier of statement.docdata.b2b) {
    for (const inv of supplier.inv) {
      for (const line of inv.items) {
        gstr2bInvoiceTxvalPaise += rupeesToPaise(line.txval);
        gstr2bInvoiceTaxPaise +=
          rupeesToPaise(line.cgst) + rupeesToPaise(line.sgst) + rupeesToPaise(line.igst);
      }
    }
  }

  return { gstr2bInvoiceTxvalPaise, gstr2bInvoiceTaxPaise };
}

/**
 * Which of the five locked categories explains an unmatched row. Rules only —
 * the Detect layer never calls a model.
 */
function classify(
  item: ReconItem,
  ctx: {
    hit: { cell: RateCell } | null;
    ambiguous: boolean;
    capturedOrders: Set<string>;
    reversedPayments: Set<string>;
    billedIn: string;
    period: string;
  },
): ExceptionCategory | null {
  // A zero-value row is the failed leg of a retry, not a mispriced fee. It is
  // checked before anything rate-related because there is no fee to explain.
  if (item.amount === 0) {
    // PARTIAL_PAYMENT tells the user "only the successful capture is billable".
    // A zero-value row that was nonetheless charged a fee makes that statement
    // false, and there is no honest rule for it — so it says so.
    const billedNothing = item.fee === 0;
    return billedNothing && ctx.capturedOrders.has(item.order_id)
      ? "PARTIAL_PAYMENT"
      : "UNEXPLAINED";
  }

  // Checked ahead of the fee rules because the fee is not what is wrong here.
  if (ctx.reversedPayments.has(item.entity_id)) return "REFUND_NETTED";

  // Billed on a different month's invoice, so the fee is correct and simply
  // appears in the next period's statement. Ranked below REFUND_NETTED: a
  // refunded row that also settled late is a refund first — the credit-note
  // obligation is the one with a statutory deadline attached.
  if (ctx.billedIn !== ctx.period) return "TIMING";

  if (ctx.hit) return null;

  // Nothing published explains the fee. Ambiguity is its own answer: two cells
  // explaining it is not the same failure as none explaining it, and saying
  // "you were charged a rate that does not exist" about a fee that matches two
  // published rates would be a false statement to a CA.
  return ctx.ambiguous ? "UNEXPLAINED" : "FEE_DEDUCTION";
}

/**
 * IST is UTC+05:30 with no daylight saving — it has not changed since 1945 —
 * so a fixed offset is exact here and needs no timezone database.
 */
export const IST_OFFSET_SECONDS = 5 * 3600 + 30 * 60;

/**
 * A settlement timestamp as a GSTR-2B return period, `MMYYYY`.
 *
 * Read in IST, not UTC and not the host's local time. A Unix timestamp carries
 * no timezone; the timezone belongs to the reading, and a GST return period is
 * a calendar month in India. Reading these instants as UTC pushes everything
 * settled in the last 5½ hours of a month into the wrong period — the exact
 * window T+2 settlements crowd into, and the exact thing TIMING exists to
 * detect. Reading them in local time would make the verdict depend on where the
 * server happens to run. BUILD-LOG entry 13.
 */
export function periodOf(settledAt: number): string {
  const ist = new Date((settledAt + IST_OFFSET_SECONDS) * 1000);
  return `${String(ist.getUTCMonth() + 1).padStart(2, "0")}${ist.getUTCFullYear()}`;
}

/**
 * EVERY published cell whose price explains this fee within the tolerance —
 * all of them, not the first hit. Ambiguity is a property of the fee, not of
 * the amount: two cells 0.15pp apart produce prices under 200 paise apart for
 * any payment below ₹1138.37, and a fee landing between them satisfies both.
 * Returning the first match would make the verdict depend on key order.
 *
 * `exact-only` considers STANDARD alone. That is not a crippled mode — it is
 * the merchant's own expectation, and the records it fails to explain are
 * exactly the lift the alternate-cell pass provides. It follows that a fee the
 * full pass calls ambiguous can still read as EXACT in exact-only, because
 * exact-only never asks whether another cell would have explained it. That is
 * the mode's meaning, not a defect in it.
 */
function resolveCells(item: ReconItem, mode: MatchMode) {
  // Nothing was captured, so nothing was billed. Without this guard every cell
  // "explains" the fee — 2% and 2.15% of nothing are both nothing — which reads
  // as a clean EXACT match in exact-only mode and as ambiguity in exact+fuzzy.
  // Both are wrong, and wrong in the flattering direction. BUILD-LOG entry 9.
  if (item.amount === 0) return [];

  const cells: RateCell[] =
    mode === "exact-only"
      ? ["STANDARD"]
      : (Object.keys(RATE_CELLS) as RateCell[]);

  return cells
    .map((cell) => ({ cell, ...priceAt(item.amount, cell) }))
    .filter((priced) => Math.abs(priced.fee - item.fee) <= TOLERANCE_PAISE);
}
