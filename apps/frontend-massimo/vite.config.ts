/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Frontend Massimo (interface enfant) — Vite + React + TypeScript + Tailwind.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
    // Imports CSS (police, brand.css) non traités en test : inutile et plus rapide.
    css: false,
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
