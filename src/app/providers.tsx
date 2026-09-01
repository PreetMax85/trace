"use client";

import { BladeProvider } from "@razorpay/blade/components";
import { bladeTheme } from "@razorpay/blade/tokens";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <BladeProvider themeTokens={bladeTheme} colorScheme="light">
      {children}
    </BladeProvider>
  );
}
