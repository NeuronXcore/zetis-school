import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { crx } from "@crxjs/vite-plugin";

import manifest from "./src/manifest.config";

// Extension navigateur ZETIS Clip (Papa) — Manifest V3 via @crxjs/vite-plugin.
// Réutilise React + Tailwind v4 comme les frontends Massimo/Papa (cf. ADR-0006).
export default defineConfig({
  plugins: [react(), tailwindcss(), crx({ manifest })],
  server: {
    port: 5175,
    // Le HMR de l'extension a besoin d'un port WebSocket fixe.
    strictPort: true,
    hmr: { port: 5176 },
  },
});
