/**
 * The one merchant this instance reconciles for.
 *
 * Written down here because the chrome needs it before any batch has been
 * loaded: the header names whose books are on screen, and it renders on the 404
 * and the error page too, where there is no batch at all. `review-batch.test.ts`
 * pins it to the fixture's own GSTIN, so the two cannot drift apart without a
 * test saying so.
 */
export const MERCHANT_GSTIN = "27TESTM1234A1Z0";
