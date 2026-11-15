import { defineConfig } from "vite-plus";

export default defineConfig({
  // `convex dev` writes the deployment URL as CONVEX_URL to .env.local.
  envPrefix: ["VITE_", "CONVEX_URL"],
  test: {
    // convex-test runs functions in the runtime Convex emulates.
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
  },
});
