import path from "node:path";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  plugins: [
    react(),
    VitePWA({
      // Switched from the default generateSW to injectManifest for chunk 8
      // (Web Push): generateSW auto-generates the service worker via
      // Workbox and gives no hook for a custom `push`/`notificationclick`
      // listener. src/sw.ts is hand-written and calls precacheAndRoute
      // itself (same precaching generateSW gave us for free).
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png"],
      manifest: {
        name: "KidCom",
        short_name: "KidCom",
        description:
          "A well-being and communication app for separated parents and families.",
        theme_color: "#326943",
        background_color: "#f8faf4",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      injectManifest: {
        // woff2 added for the self-hosted Material Symbols font
        // (material-symbols/outlined.css, imported from index.css) — cached
        // offline like every other build asset instead of depending on a
        // third-party CDN request at runtime. It's the full variable font
        // (~4MB, over the 2MB default) rather than a hand-picked icon
        // subset deliberately: a missed icon in a manual subset fails
        // silently (a blank glyph, easy to not notice until a user hits
        // it) — not a tradeoff worth making right after two small-oversight
        // production incidents in the same session. One-time cached
        // download, not repeated per visit.
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  server: {
    port: 5173,
  },
});
