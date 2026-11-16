import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@fontsource-variable/fredoka";
import "@fontsource-variable/nunito";
import "./styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { api } from "../convex/_generated/api";
import { App } from "./App";

const queryClient = new QueryClient();
const convex = new ConvexReactClient(import.meta.env.CONVEX_URL);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexAuthProvider client={convex} api={api.auth}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ConvexAuthProvider>
  </StrictMode>,
);
