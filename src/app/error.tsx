"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Body, Caption, PageTitle, RecordId } from "./ui/type";

/**
 * What a visitor sees when something on the page throws.
 *
 * Error boundaries have to be client components. This is Next's documented
 * `error.js` convention, and `retry` is its prop name as of 16.3.0, not the
 * older `reset`.
 *
 * The digest is shown deliberately. React replaces a server error's message with
 * an opaque hash in production precisely so the message cannot leak, and that
 * hash is the only handle anyone has for finding the failure in the deployment
 * logs. Hiding it leaves a reporter with nothing to report.
 */
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // No error service is wired up (PRD §9), so the platform's own function logs
    // are where this lands.
    console.error(error);
  }, [error]);

  return (
    <div
      className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col items-start justify-center gap-5 px-4 py-20 sm:px-6"
      data-testid="error-boundary"
    >
      <PageTitle className="max-w-[18ch]">This screen failed to load.</PageTitle>
      <Body className="max-w-[60ch]">
        Nothing was changed, sent or filed. Trace only drafts, and a draft needs a person to confirm
        it. Reloading is safe.
      </Body>
      <Button onClick={() => retry()}>Try again</Button>
      {error.digest !== undefined && (
        <Caption>
          Reference <RecordId>{error.digest}</RecordId>
        </Caption>
      )}
    </div>
  );
}
