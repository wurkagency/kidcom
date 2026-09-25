import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

import { SECURITY_HEADERS } from "./security-headers";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      injectRegister: false,
      manifest: {
        name: "Kinnd",
        short_name: "Kinnd",
        description: "A well-being and communication app for separated parents and families.",
        // Aura surface. The active theme also updates <meta name="theme-color">
        // at runtime (theme-kit ThemeProvider).
        theme_color: "#f8faf9",
        background_color: "#f8faf9",
        display: "standalone",
        orientation: "portrait",
        id: "/",
        start_url: "/",
        scope: "/",
        lang: "en-US",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      injectManifest: {
        // woff2 for the self-hosted Plus Jakarta Sans and Material Symbols
        // fonts; the full Material Symbols variable font is ~4MB (a subset
        // was tried in v2 and silently broke ligatures), hence the raised cap.
        globPatterns: ["**/*.{js,css,html,svg,png,jpg,ico,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  server: {
    port: 5173,
    // Same-origin API in dev, so the session cookie also rides along on
    // plain <img>/<video> media requests.
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  // `vite preview` serves the production build with the production security
  // headers (nginx sends the same — security-headers.ts), so CSP problems
  // show up locally. Not on the dev server: HMR needs inline scripts.
  preview: {
    port: 4173,
    headers: SECURITY_HEADERS,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
