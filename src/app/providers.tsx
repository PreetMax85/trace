"use client";

import { BladeProvider } from "@razorpay/blade/components";
import { bladeTheme } from "@razorpay/blade/tokens";
import { GlobalStyle } from "./global-style";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <BladeProvider themeTokens={bladeTheme} colorScheme="light">
      <GlobalStyle />
      {children}
    </BladeProvider>
  );
}
