import { ImageResponse } from "next/og";
import { TAGLINE } from "./site-links";

/**
 * The card that appears when the link is shared.
 *
 * Without this a pasted URL unfurls as bare text, which is how a link to a
 * finished product ends up looking like a dead one. Generated rather than
 * checked in as a PNG so the wording cannot drift from `TAGLINE` — the header,
 * the page metadata and this image all read from the same constant.
 *
 * Rendered by satori, which is not a browser: only inline styles, and every
 * element holding more than one child needs an explicit `display: flex`.
 */
export const alt = "Trace — GST reconciliation for Razorpay settlements";
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
          background: "#0F172A",
          padding: 80,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <svg width="72" height="72" viewBox="0 0 32 32">
            <rect width="32" height="32" rx="7" fill="#38BDF8" />
            <path d="M8 11h16" stroke="#0F172A" strokeWidth="3" strokeLinecap="round" />
            <path d="M16 11v13" stroke="#0F172A" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <div style={{ fontSize: 72, color: "#F8FAFC", fontWeight: 700 }}>Trace</div>
        </div>

        <div style={{ display: "flex", fontSize: 44, color: "#E2E8F0", lineHeight: 1.3 }}>
          {TAGLINE}
        </div>

        <div style={{ display: "flex", fontSize: 28, color: "#38BDF8" }}>
          Detect · Investigate · Explain · Act
        </div>
      </div>
    ),
    size,
  );
}
