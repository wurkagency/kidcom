import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig({
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
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
      },
    }),
  ],
  server: {
    port: 5173,
  },
});
