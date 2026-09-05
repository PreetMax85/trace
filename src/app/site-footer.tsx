import { Button } from "@/components/ui/button";
import { REPO_URL } from "./site-links";
import { GithubMark } from "./ui/icons";

/**
 * The bottom of every page: what this is, and where to read the code.
 *
 * The disclaimer is not boilerplate. Trace states GST positions and drafts an
 * entry against a real return, and a reader who mistakes that for filed advice
 * has been misled by the product rather than by anything they did. Saying it
 * once, plainly, at the end of the page is the cheapest place to be honest about
 * it.
 *
 * There is no link out to a specification any more. Sending a reader elsewhere
 * to find out what the product does was an admission that the product did not
 * say; it says so on the page now.
 */
export function SiteFooter() {
  return (
    <footer data-testid="site-footer" className="mt-2 border-t border-border bg-card">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <p className="max-w-[70ch] text-caption text-muted-foreground">
          Trace reconciles Razorpay settlements against GSTR-2B. Test data, one merchant. Every draft
          is prepared for a person to review. Nothing here is filed advice, and nothing is ever sent
          automatically.
        </p>
        <Button
          variant="ghost"
          size="icon-sm"
          render={<a href={REPO_URL} target="_blank" rel="noreferrer noopener" />}
          aria-label="Source on GitHub"
        >
          <GithubMark className="size-4" />
        </Button>
      </div>
    </footer>
  );
}
