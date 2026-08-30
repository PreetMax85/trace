import { defineConfig } from "vitest/config";

export default defineConfig({
  // Vite resolves the `@/*` alias from tsconfig.json natively, so the
  // vite-tsconfig-paths plugin is not needed.
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
