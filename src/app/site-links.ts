/**
 * The two addresses the chrome links out to.
 *
 * Here rather than inline because the header, the footer and the Open Graph
 * card each need one of them, and three copies of a URL is three places for it
 * to go stale.
 */
export const REPO_URL = "https://github.com/PreetMax85/trace";

/**
 * Where this is served from in production.
 *
 * Written down rather than derived because the derivation can fail silently.
 * Vercel's `VERCEL_PROJECT_PRODUCTION_URL` is the right source and is set on
 * every deployment including previews — but only when "Enable access to System
 * Environment Variables" is on in the project settings. If it is off, the
 * variable is simply absent, and an Open Graph card built from a localhost
 * fallback would point every shared link at the reader's own machine. That is
 * the exact failure the card exists to prevent, and nothing in a build log
 * would say it had happened.
 */
export const PRODUCTION_URL = "https://trace-zeta-three.vercel.app";
export const PRD_URL = `${REPO_URL}/blob/main/docs/PRD.md`;

/**
 * What Trace is, in one line, for a reader who has never heard of it.
 *
 * Exported so the page, the document metadata and the link preview all make the
 * same claim. A description that drifts between them is how a visitor ends up
 * being told two different things about the same product.
 */
export const TAGLINE =
  "Reconciles Razorpay settlement fees against GSTR-2B and finds the GST you cannot claim yet.";
