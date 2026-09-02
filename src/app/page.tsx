import { loadReviewBatch } from "@/lib/review/batch";
import { ExceptionReview } from "./exception-review";

/**
 * The exception review screen.
 *
 * A server component: the fixture is parsed, matched and classified here, on
 * the server, and only the finished verdict crosses to the browser. Nothing on
 * this page reads the database — `matchBatch` runs against the fixture directly
 * (see `src/lib/review/batch.ts` for why the audit trail must not sit between
 * the two). Blade needs the browser, so the rendering itself lives in a client
 * component that receives plain data and holds nothing but which row is open.
 */
export default function Home() {
  return <ExceptionReview batch={loadReviewBatch()} />;
}
