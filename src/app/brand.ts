/**
 * The brand's fixed colours, with no dependencies, so anything can import them.
 *
 * The mark appears in three places that cannot share a component: the header
 * (React), the favicon (a static `icon.svg` file Next serves by convention) and
 * the link preview (satori, which is not a browser). Keeping the values here
 * means at least the colours cannot drift; the shape has to be kept in step by
 * hand, and each of the three says so.
 *
 * Deliberately clear of the two hues that already carry meaning on this screen:
 * red is "credit at risk" and green is "claimable". A brand colour near either
 * would make a button look like a verdict.
 */
export const BRAND_COLOR = "#4338CA";

/** The glyph inside the mark, and the text on the link preview. */
export const BRAND_ON_COLOR = "#FFFFFF";

/** The ground the link preview is drawn on. Darker than the brand, not it. */
export const BRAND_INK = "#1E1B4B";
