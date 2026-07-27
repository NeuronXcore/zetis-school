# @zetis/extension-zetis-clip

Extension navigateur **Papa** (Manifest V3) pour capturer des sources de cours vers le
RAG ZETIS. Étape 19 — Lot 1 : **page web**, **sélection**, **PDF**.

> Tout ce qui est capturé arrive en statut **`pending`** : invisible de l’IA de Massimo
> tant que Papa ne l’a pas validé dans « Sources de cours » (règle `CLAUDE.md`).

## Ce que ça fait

- **Popup** : type détecté (page / sélection / PDF), aperçu éditable du texte, titre,
  sélecteur de matière + chapitre (texte libre, autocomplété), niveau optionnel, envoi.
- **Menus contextuels** : « Envoyer la sélection à ZETIS » / « Envoyer la page à ZETIS »
  (envoi rapide en un clic, métadonnées à compléter ensuite côté Papa).
- **Page Options** : URL du backend + connexion Papa (`@zetis/auth`).

Le texte est extrait **côté client** (Mozilla Readability) — le backend ne fetch jamais
d’URL arbitraire (anti-SSRF). Le PDF est envoyé tel quel à `/api/rag/upload` (extraction
serveur via pypdf). Le texte passe par `/api/rag/clip`.

Le token JWT est stocké dans `chrome.storage.local` (jamais `localStorage`).

## Développer / construire

Depuis la racine du monorepo :

```bash
pnpm install
pnpm --filter @zetis/extension-zetis-clip build   # → dist/
# ou en dev (HMR) :
pnpm --filter @zetis/extension-zetis-clip dev
```

## Charger dans Chrome

1. `chrome://extensions` → activer le **Mode développeur**.
2. **Charger l’extension non empaquetée** → choisir le dossier `dist/`
   (ou la racine de l’app en mode `dev`).
3. Ouvrir les **Options** de l’extension → régler l’URL du backend (def. `http://localhost:8000`)
   → se connecter avec le compte **Papa**.
4. Lancer le backend ZETIS (`uvicorn app.main:app --reload` dans `apps/backend`).

Pour un backend autre que `localhost:8000`, l’extension demande la permission d’accès à
cet hôte à la volée (au moment d’enregistrer l’URL / d’envoyer un PDF).

## Hors périmètre (étape 20+)

Transcript vidéo, OCR image, audio/podcast, file d’attente offline, import multi-onglets.
