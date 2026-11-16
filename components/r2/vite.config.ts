import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      // Vite+ can't see what tsc (a native binary) reads or writes, so the
      // cache needs both declared: otherwise a source change replays a stale
      // build, and a hit restores nothing.
      build: {
        command: "tsc -p tsconfig.build.json",
        cache: {
          input: [
            "src/**",
            "tsconfig*.json",
            "package.json",
            { pattern: "pnpm-lock.yaml", base: "workspace" },
          ],
          output: ["dist/**"],
        },
      },
    },
  },
  test: {
    // convex-test runs functions in the runtime Convex emulates.
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
  },
});
