import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// One-time cache buster: force any stale PWA service worker + caches to drop
// so users immediately receive the new UI shell instead of the old bundle.
const CACHE_BUSTER_KEY = "lenory_cache_buster_v3";
if (typeof window !== "undefined" && !localStorage.getItem(CACHE_BUSTER_KEY)) {
  localStorage.setItem(CACHE_BUSTER_KEY, "1");
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
    } catch {}
    window.location.reload();
  })();
} else {
  // For subsequent loads, auto-reload as soon as a new SW takes control.
  if (typeof window !== "undefined" && "serviceWorker" in navigator) {
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
