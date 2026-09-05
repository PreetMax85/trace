import type { ExceptionCategory } from "@/lib/matching";

/**
 * The five categories, written the way a person says them.
 *
 * The taxonomy is fixed, and the constants are what the database, the prompt
 * and the audit trail all use, so none of that changes. This is the display
 * layer alone: `FEE_DEDUCTION` on a badge is a machine's internal name, and
 * putting it in front of a reader makes the whole table look like a log rather
 * than a finding.
 *
 * A `Record` over the union rather than a `switch`, so a sixth category would
 * fail to compile here instead of rendering blank. In one file rather than two
 * because the table and the derivation panel both show them, and two spellings
 * of the same category is how a reader ends up believing there are more than
 * five.
 */
export const CATEGORY_LABELS: Record<ExceptionCategory, string> = {
  FEE_DEDUCTION: "Fee deduction",
  TIMING: "Timing",
  REFUND_NETTED: "Refund netted",
  PARTIAL_PAYMENT: "Partial payment",
  UNEXPLAINED: "Unexplained",
};
