import { defineManifest } from "@crxjs/vite-plugin";

import pkg from "../package.json";

// Manifest V3 — ZETIS Clip (outil Papa).
//
// Permissions minimales (cf. ADR-0006) :
//   - storage      : token JWT + URL backend dans chrome.storage.local (jamais localStorage).
//   - contextMenus : entrées « Envoyer la sélection / la page à ZETIS ».
//   - activeTab    : accès ponctuel à l'onglet courant lors d'une action utilisateur.
//   - scripting    : injection de l'extraction Readability à la demande.
// host_permissions par défaut = backend local ; un backend distant est autorisé à la
// volée via optional_host_permissions (demandé depuis la page Options, geste utilisateur).
export default defineManifest({
  manifest_version: 3,
  name: "ZETIS Clip — capture de sources (Papa)",
  version: pkg.version,
  description:
    "Capture une page web, une sélection ou un PDF vers le RAG ZETIS. Tout arrive en attente, à valider côté Papa.",
  action: {
    default_popup: "src/popup/index.html",
    default_title: "Envoyer à ZETIS",
  },
  options_page: "src/options/index.html",
  background: {
    service_worker: "src/background/service-worker.ts",
    type: "module",
  },
  content_scripts: [
    {
      matches: ["http://*/*", "https://*/*"],
      js: ["src/content/content-script.ts"],
      run_at: "document_idle",
    },
  ],
  permissions: ["storage", "contextMenus", "activeTab", "scripting"],
  host_permissions: ["http://localhost:8000/*"],
  optional_host_permissions: ["http://*/*", "https://*/*"],
});
