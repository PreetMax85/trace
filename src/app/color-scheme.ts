/**
 * Which colour scheme the reader has chosen, and how it survives a reload.
 *
 * A cookie rather than `localStorage`, and that is the whole design. A value
 * kept in the browser is only readable once the client has run, so the server
 * would render light, the client would correct it a frame later, and a returning
 * dark mode reader would meet a flash of the wrong page every single time. A
 * cookie is sent with the document request, so the server renders the right
 * scheme first time and there is nothing to correct.
 *
 * The cost is that reading it opts the route into dynamic rendering. Worth it:
 * this page computes its batch from a fixture in single-digit milliseconds, so
 * there was never much of a prerender to lose.
 */
export const COLOR_SCHEME_COOKIE = "trace-color-scheme";

export type ColorScheme = "light" | "dark";

/** A year. The choice is a preference, not a session. */
export const COLOR_SCHEME_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * Whether a cookie value is one of the two schemes.
 *
 * A cookie is reader-supplied text and can hold anything at all, so this is a
 * narrowing check and not a cast. Anything unrecognised falls back to light.
 */
export function isColorScheme(value: string | undefined): value is ColorScheme {
  return value === "light" || value === "dark";
}

/** The one the toggle switches to. */
export function otherScheme(scheme: ColorScheme): ColorScheme {
  return scheme === "dark" ? "light" : "dark";
}
