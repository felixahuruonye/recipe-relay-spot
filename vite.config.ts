import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// Service worker (vite-plugin-pwa) removed. It was the repeated root
// cause of the "blank page after a deploy" incidents: a session whose
// SW hadn't finished switching to the newest deploy yet could end up
// stuck on a stale cached index.html/bundle reference that the latest
// deploy had already replaced, with no visible error — just a blank
// screen. That's a hard failure mode to fully eliminate while keeping
// a caching service worker at all. The app now behaves like a normal
// always-fresh SPA: every load fetches current content from the
// server, same as the vast majority of web apps. "Add to home screen"
// install capability (the manifest) is kept — only the offline/stale
// caching layer is gone. If real offline support matters later, this
// is worth revisiting with a much more conservative caching strategy
// (network-first for navigations, never precache html/js).
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
