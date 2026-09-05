import { loadReviewBatch } from "@/lib/review/batch";
import { ExceptionReview } from "./exception-review";

/**
 * The exception review screen.
 *
 * A server component: the fixture is parsed, matched and classified here, on
 * the server, and only the finished verdict crosses to the browser. Nothing on
 * this page reads the database: `matchBatch` runs against the fixture directly
 * (see `src/lib/review/batch.ts` for why the audit trail must not sit between
 * the two). The rendering lives in a client component because the screen holds
 * one piece of state, which record or figure is open, and nothing else.
 */
export default function Home() {
  return <ExceptionReview batch={loadReviewBatch()} />;
}
