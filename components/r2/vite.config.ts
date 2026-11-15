import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      // Vite+ can't see what tsc (a native binary) writes, so a cache hit
      // would restore nothing without an explicit output.
      build: { command: "tsc -p tsconfig.build.json", cache: { output: ["dist/**"] } },
    },
  },
  test: {
    // convex-test runs functions in the runtime Convex emulates.
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
  },
});
