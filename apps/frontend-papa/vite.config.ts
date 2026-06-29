import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Frontend Papa (cockpit de pilotage parental) — Vite + React + TypeScript + Tailwind.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
  },
});
