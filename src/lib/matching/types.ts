import type { RateCell } from "./rate-card";

/** A row from Razorpay's settlement recon report. Money is integer paise. */
export type ReconItem = {
  entity_id: string;
  type: "payment" | "refund";
  amount: number;
  fee: number;
  tax: number;
  debit: number;
  credit: number;
  order_id: string;
  /** Null on payments; on a refund row it points at the payment being reversed. */
  payment_id: string | null;
  settlement_id: string;
  settled_at: number;
};

export type MatchStatus = "MATCHED" | "EXCEPTION";
export type MatchMethod = "EXACT" | "FUZZY" | "NONE";
export type ExceptionCategory =
  | "FEE_DEDUCTION"
  | "TIMING"
  | "REFUND_NETTED"
  | "PARTIAL_PAYMENT"
  | "UNEXPLAINED";

/** One classified settlement row. Maps 1:1 onto the `records` table. */
export type MatchedRecord = {
  recordId: string;
  settlementId: string;
  status: MatchStatus;
  method: MatchMethod;
  rateCell: RateCell | null;
  razorpayFeePaise: number;
  razorpayTaxPaise: number;
  expectedFeePaise: number | null;
  expectedTaxPaise: number | null;
  category: ExceptionCategory | null;
  creditNoteReview: boolean;
  /** The filing period whose GSTR-2B carries this row's fee. */
  billedIn: string;
};

/**
 * `exact-only` considers the STANDARD cell alone; `exact+fuzzy` adds the other
 * published cells. The flag exists so the lift is demonstrated, not asserted.
 */
export type MatchMode = "exact-only" | "exact+fuzzy";

/**
 * A GSTR-2B statement. NOT GSTR-2A — the 2A field names (`flprdr1`, `itm_det`,
 * `camt`) do not exist in 2B, and the two are different documents.
 *
 * `itcavl` is GSTN's own verdict on whether the credit is claimable, and `rsn`
 * its reason. The reason is free text: GSTN documents the grounds (the
 * place-of-supply restriction from Notification 82/2020, the Section 16(4) time
 * bar) but publishes no enumerated code list, so constraining it would be a guess.
 */
export type Gstr2bStatement = {
  gstin: string;
  /** The return period this statement covers, `MMYYYY`. */
  rtnprd: string;
  docdata: {
    b2b: {
      ctin: string;
      inv: {
        inum: string;
        itcavl: "Y" | "N";
        rsn: string;
        items: {
          /** Taxable value in RUPEES — the only place rupees appear. */
          txval: number;
          igst: number;
          cgst: number;
          sgst: number;
        }[];
      }[];
    }[];
  };
};

export type MatchInput = {
  settlements: ReconItem[];
  statement: Gstr2bStatement;
  period: string;
  mode: MatchMode;
};

/**
 * Tier 2 (PRD Section 6). These live on the BATCH, never on a record: GSTR-2B
 * carries one consolidated Razorpay invoice per filing period, so a single
 * record has no 2B counterpart to compare against — only a period does.
 */
export type PeriodRollup = {
  gstr2bInvoiceTxvalPaise: number;
  gstr2bInvoiceTaxPaise: number;
  rolledUpTaxPaise: number;
  /**
   * Invoice tax minus the matched rollup. A batch is fully explained when this
   * equals the tax on the exceptions billed in the same period. TIMING records
   * are excluded by construction — they are billed on the following month's
   * invoice, so they belong to that period's delta, not this one's.
   */
  rollupDeltaPaise: number;
};

/**
 * GSTN's own verdict on the period's invoice — the sixth signal (PRD Section 7).
 * A flag, NOT a sixth exception category: a record can be MATCHED and still be
 * ineligible, and collapsing those two facts into one field would lose the
 * distinction that matters. It sits on the batch for the same reason the rollup
 * does — the verdict is carried by the invoice, and one invoice covers the period.
 */
export type ItcVerdict = {
  available: boolean;
  /** Free text from `rsn`, never an enum: GSTN publishes no code list. */
  reason: string | null;
};

export type BatchResult = {
  records: MatchedRecord[];
  rollup: PeriodRollup;
  itc: ItcVerdict;
};
