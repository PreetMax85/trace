import { ImageResponse } from "next/og";
import { BRAND_COLOR, BRAND_INK, BRAND_ON_COLOR } from "./brand";
import { TAGLINE } from "./site-links";

/**
 * The card that appears when the link is shared.
 *
 * Without this a pasted URL unfurls as bare text, which is how a link to a
 * finished product ends up looking like a dead one. Generated rather than
 * checked in as a PNG so the wording cannot drift from `TAGLINE`: the header,
 * the page metadata and this image all read from the same constant.
 *
 * Rendered by satori, which is not a browser: only inline styles, and every
 * element holding more than one child needs an explicit `display: flex`.
 */
export const alt = "Trace: GST reconciliation for Razorpay settlements";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: BRAND_INK,
          padding: 80,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <svg width="72" height="72" viewBox="0 0 32 32">
            {/* The same mark as the header's and as `icon.svg`. Change one and
                change all three. */}
            <rect width="32" height="32" rx="7" fill={BRAND_COLOR} />
            <path d="M8 11h16" stroke={BRAND_ON_COLOR} strokeWidth="3" strokeLinecap="round" />
            <path d="M16 11v13" stroke={BRAND_ON_COLOR} strokeWidth="3" strokeLinecap="round" />
          </svg>
          <div style={{ fontSize: 72, color: BRAND_ON_COLOR, fontWeight: 700 }}>Trace</div>
        </div>

        <div style={{ display: "flex", fontSize: 44, color: "#C7D2FE", lineHeight: 1.3 }}>
          {TAGLINE}
        </div>

        {/* The card says it runs on test data. A shared link is read by people
            who will never scroll the page, and a screenshot of real-looking GST
            positions with nothing qualifying them is the one place this product
            could mislead without anybody noticing. */}
        <div style={{ display: "flex", fontSize: 28, color: "#A5B4FC" }}>
          Detect · Investigate · Explain · Act · Runs on test data
        </div>
      </div>
    ),
    size,
  );
}
