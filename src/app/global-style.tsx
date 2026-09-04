"use client";

import { createGlobalStyle } from "styled-components";
import { bladeTheme } from "@razorpay/blade/tokens";

/**
 * The page background, read from the same token the shell paints with.
 *
 * Taken from the theme rather than written as a hex so the document and the
 * shell cannot drift apart into two nearly-identical greys. `onLight` because
 * `BladeProvider` is fixed to `colorScheme="light"` — if that ever becomes a
 * choice, this has to follow it.
 */
const pageBackground = bladeTheme.colors.onLight.surface.background.gray.subtle;

/**
 * The two rules the document needs before Blade's own styles mean anything.
 *
 * Blade styles components, not the document, so the browser's defaults were
 * still in force: `body` kept its 8px user-agent margin, which left a pale
 * gutter down both edges of a page whose header and footer are meant to run
 * full-bleed, and — because the shell asks for `min-height: 100vh` — added 16px
 * of margin to a full-viewport box, so every page scrolled a little with no
 * content to scroll to.
 *
 * The background is set on the document as well as the shell so the colour
 * survives overscroll, where a browser paints the root element's background
 * past the end of the page.
 *
 * Declared with `createGlobalStyle` rather than as a stylesheet so it goes
 * through the same registry as everything else and ships inside the server's
 * HTML — a reset that arrived with the client bundle would be its own flash.
 */
export const GlobalStyle = createGlobalStyle`
  body {
    margin: 0;
  }

  html {
    background: ${pageBackground};
  }
`;
