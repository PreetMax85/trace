import type { Metadata } from "next";
import { TooltipProvider } from "@/components/ui/tooltip";
import { mono, sans, serif } from "./fonts";
import { SiteShell } from "./site-shell";
import { PRODUCTION_URL, TAGLINE } from "./site-links";
import "./globals.css";

/**
 * Where the site is served from, which Open Graph needs as an absolute URL.
 *
 * Vercel sets `VERCEL_PROJECT_PRODUCTION_URL` to the production hostname on
 * every deployment including previews, so a preview's card still points at the
 * production image rather than at whichever preview built it. It carries no
 * scheme, hence the prefix.
 *
 * The order of the fallbacks is the point. That variable exists only when
 * "Enable access to System Environment Variables" is on in the project
 * settings, and if it is off it is absent rather than wrong, so falling
 * straight through to localhost would put `http://localhost:3000` in the
 * `og:image` of a live page and break every shared link, silently. Localhost is
 * therefore reachable ONLY when this is not a production build.
 */
const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : process.env.NODE_ENV === "production"
    ? PRODUCTION_URL
    : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  // `template` so a future route can set its own title without losing the
  // product name, which is the half a browser tab actually shows.
  title: { default: "Trace: GST reconciliation for Razorpay settlements", template: "%s · Trace" },
  description: TAGLINE,
  applicationName: "Trace",
  openGraph: {
    title: "Trace: GST reconciliation for Razorpay settlements",
    description: TAGLINE,
    siteName: "Trace",
    type: "website",
    url: siteUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: "Trace: GST reconciliation for Razorpay settlements",
    description: TAGLINE,
  },
};

/**
 * The frame, and nothing that varies per request.
 *
 * Trace has one set of colours. It carried two for a while, chosen by a cookie
 * the reader set, and reading that cookie is what forced this route to render
 * dynamically: the fixture was parsed, matched and classified again on every
 * request in order to decide a palette. One scheme puts the whole page back to
 * static, which is faster and is one fewer thing that can be wrong on the first
 * paint.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The font classes declare the family custom properties that `globals.css`
    // points its type roles at. On <html> rather than on <body> so anything
    // portalled outside the app still resolves them.
    <html lang="en" className={[sans.variable, serif.variable, mono.variable].join(" ")}>
      <body className="antialiased">
        <TooltipProvider delay={250}>
          <SiteShell>{children}</SiteShell>
        </TooltipProvider>
      </body>
    </html>
  );
}
