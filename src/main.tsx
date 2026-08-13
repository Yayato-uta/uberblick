import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { ThemeProvider } from "./hooks/useTheme";
import "./index.css";

/* Offline-first: the service worker precaches the whole app on first load and
   swaps in a new build silently on the next start. Nothing is ever fetched
   from a network at runtime. */
registerSW({ immediate: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
