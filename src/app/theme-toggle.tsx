"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { COLOR_SCHEME_COOKIE, COLOR_SCHEME_MAX_AGE_SECONDS } from "./color-scheme";

/**
 * Switch between light and dark, and remember it.
 *
 * There is no React state here at all, and that is the point. The palette is a
 * set of CSS custom properties selected by one class on `<html>`, so switching
 * is a class toggle and a cascade: the browser repaints, and not one component
 * re-renders. Holding the scheme in React instead means every mounted component
 * has to re-render to change colour, which on a page with a few thousand of them
 * takes seconds and freezes the tab while it happens.
 *
 * Which icon shows is a CSS decision for the same reason. Rendering both and
 * letting the `dark:` variant hide one keeps the button correct on the server,
 * after hydration, and after a toggle, with nothing to keep in sync.
 *
 * The cookie is what makes the NEXT visit start in the right scheme, because the
 * server reads it before rendering anything. `SameSite=Lax` because nothing
 * cross-site needs it, and no `Secure` flag: that would drop the cookie over
 * plain HTTP, so the preference would appear not to save on localhost and would
 * only work once deployed.
 */
export function ThemeToggle() {
  const switchScheme = () => {
    const isDark = document.documentElement.classList.toggle("dark");
    const scheme = isDark ? "dark" : "light";
    document.cookie = `${COLOR_SCHEME_COOKIE}=${scheme}; path=/; max-age=${COLOR_SCHEME_MAX_AGE_SECONDS}; SameSite=Lax`;
  };

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={switchScheme}
            aria-label="Switch between light and dark"
            data-testid="theme-toggle"
          >
            <Sun className="hidden dark:block" aria-hidden />
            <Moon className="dark:hidden" aria-hidden />
          </Button>
        }
      />
      <TooltipContent>Switch between light and dark</TooltipContent>
    </Tooltip>
  );
}
