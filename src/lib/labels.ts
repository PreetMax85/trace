import type { ExceptionCategory } from "@/lib/matching";

/**
 * The five categories, written the way a person says them.
 *
 * The taxonomy is fixed, and the constants are what the database, the matcher
 * and the audit trail all use, so none of that changes. This is the wording
 * layer alone: `FEE_DEDUCTION` in front of a reader makes a finding look like a
 * log line.
 *
 * It lives in `lib` rather than beside the screen because the screen is no
 * longer the only reader. The Explain layer's tools hand these labels to the
 * model alongside the constant, so that an answer typed by a person is worded
 * the same way the recorded ones are. One map, so the badge on a row and the
 * sentence about that row cannot drift into two spellings of one category.
 *
 * A `Record` over the union rather than a `switch`, so a sixth category would
 * fail to compile here instead of rendering blank.
 */
export const CATEGORY_LABELS: Record<ExceptionCategory, string> = {
  FEE_DEDUCTION: "Fee deduction",
  TIMING: "Timing",
  REFUND_NETTED: "Refund netted",
  PARTIAL_PAYMENT: "Partial payment",
  UNEXPLAINED: "Unexplained",
};

/** The label for a row's category, or null for a matched row, which has none. */
export function categoryLabel(category: ExceptionCategory | null): string | null {
  return category === null ? null : CATEGORY_LABELS[category];
}
