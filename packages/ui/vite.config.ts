/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `@zetis/ui` — le paquet partagé n'est PAS une app : il n'a ni serveur, ni Tailwind, ni build
// propre (les apps le compilent depuis les sources). Ce fichier n'existe QUE pour lui donner un
// runner de tests (ADR-0053).
//
// ── Pourquoi ce paquet a désormais ses propres tests ────────────────────────────────────────
// Le 2026-08-12, une zone morte temporelle dans `MindmapWorkspace` a rendu la mindmap
// **totalement inmontable** — écran vide — avec `tsc -b` VERT et 668 tests Massimo + 814 Papa
// VERTS. Le défaut a été trouvé par l'œil du commanditaire sur un simulateur iPhone.
//
// La couverture indirecte était un mirage : sur les six tests d'app qui touchent `@zetis/ui`,
// **quatre le MOQUENT** — dont le seul qui approchait `MindmapWorkspace`.
//
// ⚠️ Le bloc `test` ci-dessous est **RECOPIÉ à l'identique** de celui des deux apps, et c'est
// délibéré (ADR-0053 Décision 1, alternative C écartée) : factoriser trois fichiers de dix lignes
// pour en créer un quatrième plus un mécanisme d'héritage coûterait plus qu'il ne rapporte
// (`CLAUDE.md` n° 7). **À rouvrir le jour où les trois divergent** — pas avant.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
    // Imports CSS non traités en test : inutile et plus rapide (même setup que les deux apps).
    css: false,
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
