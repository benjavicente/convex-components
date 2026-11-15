import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [react()],
  // `convex dev` writes the deployment URL as CONVEX_URL to .env.local.
  envPrefix: ["VITE_", "CONVEX_URL"],
  test: {
    // convex-test runs functions in the runtime Convex emulates.
    environment: "edge-runtime",
    // Convex Auth checks token issuers against the deployment URL.
    env: { CONVEX_CLOUD_URL: "https://test.convex.cloud" },
    server: { deps: { inline: ["convex-test"] } },
  },
});
