/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Frontend Papa (cockpit de pilotage parental) — Vite + React + TypeScript + Tailwind.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
    // Imports CSS non traités en test : inutile et plus rapide (même setup que Massimo).
    css: false,
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
