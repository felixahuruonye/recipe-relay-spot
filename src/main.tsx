import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// This app no longer ships a service worker (see vite.config.ts for
// why — it was the repeated cause of blank-page-after-deploy
// incidents). This runs unconditionally, every load, forever: it's a
// harmless no-op for anyone who never had one, and it's the only way
// to actually rescue someone whose browser already has an OLD service
// worker registered from a prior build. Without this running
// unconditionally, that old worker just keeps controlling the page
// and serving its stale cache indefinitely, since no new one will
// ever arrive to replace it via the normal update flow.
if (typeof window !== "undefined") {
  (async () => {
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {
      // Nothing to clean up, or the APIs aren't available — fine either way.
    }
  })();
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
