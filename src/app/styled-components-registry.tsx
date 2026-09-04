"use client";

import { useState } from "react";
import { useServerInsertedHTML } from "next/navigation";
import { ServerStyleSheet, StyleSheetManager } from "styled-components";

/**
 * Collects styled-components' CSS during the server render and injects it into
 * the `<head>` before any markup that uses it.
 *
 * Without this the first paint is unstyled for a second or two. `next.config.ts`
 * already sets `compiler.styledComponents`, which is easy to mistake for the
 * whole setup, but that flag only enables the SWC transform for consistent class
 * names — it does not extract anything. So the server sent HTML carrying `sc-`
 * class names and no rules to match them, and the page stayed unstyled until the
 * client bundle booted and styled-components injected the rules itself. Every
 * Blade component is styled this way, so that is the entire screen.
 *
 * Blade is the reason this matters here rather than being a nicety: it has no
 * stylesheet of its own to fall back on.
 *
 * This is Next's documented three-step setup for styled-components, taken from
 * `node_modules/next/dist/docs/01-app/02-guides/css-in-js.md` — a registry, the
 * `useServerInsertedHTML` hook, and a client component wrapping the tree. The
 * doc is written against styled-components 6; we are on 5.3.11, where
 * `ServerStyleSheet`, `StyleSheetManager` and `instance.clearTag()` all exist
 * with the same signatures, checked against the installed package rather than
 * assumed.
 */
export function StyledComponentsRegistry({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  // Lazy initial state: one sheet per render pass, never one per re-render.
  const [styledComponentsStyleSheet] = useState(() => new ServerStyleSheet());

  useServerInsertedHTML(() => {
    const styles = styledComponentsStyleSheet.getStyleElement();
    // Cleared after each flush so a streamed chunk emits only its own rules
    // rather than re-sending everything collected so far.
    styledComponentsStyleSheet.instance.clearTag();
    return <>{styles}</>;
  });

  // In the browser styled-components manages its own sheet. Wrapping the tree
  // in a StyleSheetManager here would hand it a server sheet that never mounts.
  if (typeof window !== "undefined") return <>{children}</>;

  return (
    <StyleSheetManager sheet={styledComponentsStyleSheet.instance}>{children}</StyleSheetManager>
  );
}
