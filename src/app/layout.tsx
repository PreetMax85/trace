import type { Metadata } from "next";
import { Providers } from "./providers";
import { SiteShell } from "./site-shell";
import { StyledComponentsRegistry } from "./styled-components-registry";
import { PRODUCTION_URL, TAGLINE } from "./site-links";

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
 * settings, and if it is off it is absent rather than wrong — so falling
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
  title: { default: "Trace — GST reconciliation for Razorpay settlements", template: "%s · Trace" },
  description: TAGLINE,
  applicationName: "Trace",
  openGraph: {
    title: "Trace — GST reconciliation for Razorpay settlements",
    description: TAGLINE,
    siteName: "Trace",
    type: "website",
    url: siteUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: "Trace — GST reconciliation for Razorpay settlements",
    description: TAGLINE,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        {/* The registry must sit OUTSIDE the Blade provider: it collects the
            styles Blade's components generate, so anything it is meant to
            capture has to render inside it. */}
        <StyledComponentsRegistry>
          <Providers>
            <SiteShell>{children}</SiteShell>
          </Providers>
        </StyledComponentsRegistry>
      </body>
    </html>
  );
}
