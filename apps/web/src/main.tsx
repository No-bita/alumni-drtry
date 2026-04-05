import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import "@fontsource-variable/dm-sans/index.css";
import "@fontsource-variable/dm-sans/wght-italic.css";
import "./index.css";
import App from "./App.tsx";
import { scheduleNonCriticalFontCss } from "./lib/scheduleNonCriticalAssets";
import { queryClient } from "./queryClient";

scheduleNonCriticalFontCss();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
);
