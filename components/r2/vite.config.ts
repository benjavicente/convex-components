import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    // convex-test runs functions in the runtime Convex emulates.
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
  },
});
