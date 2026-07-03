# Page Papa — Pilotage Capsules IA

## Objectif

Papa **génère, prévisualise, valide, édite et rend** les capsules IA (spec typé Remotion,
cf. ADR-0007). Rien n'atteint Massimo avant validation **et** rendu MP4.

## Deux statuts distincts

- **Validation éditoriale** (`validation_status`) : `pending` → `validated` / `rejected`.
- **Rendu MP4** (`status`) : `draft` → `rendering` → `published` (ou `failed`).

Massimo ne voit que les capsules **`validated` + `published`** (MP4 disponible).

## Parcours

1. **Créer** (badge « ✨ capsule-AI » → modale) : matière, chapitre (facultatif), instruction,
   **visuel pédagogique**, **durée** (courte → ≈ 1 min), **difficulté** (⭐ / ⭐⭐ / ⭐⭐⭐).
   Génération LLM (barre de progression live). À la **réussite**, une petite **célébration**
   « Capsule créée ! » (surgissement + carillon doux, brique partagée `@zetis/ui`) confirme.
2. **Prévisualiser** : aperçu in-browser via `@remotion/player` (aucun rendu, pas de Chromium).
3. **Voix** : synthèse Piper par scène (barre de progression) ; la durée se cale sur la voix.
4. **Éditer** : modale d'**édition JSON brute** du spec (revalidée → repasse `pending`).
5. **Classer** : rattacher à un chapitre (regroupement matière → chapitre).
6. **Valider** : passe `validated` **et lance le rendu MP4 automatiquement** si la voix est
   prête (bouton « Valider (+ rendu) »). Sinon rendu manuel via « Rendre la vidéo ».
7. **Rendu** : `rendering` (worker-media, barre de progression estimée) → aperçu MP4 dès
   `published`. Sondage d'état automatique (~4 s).

La liste est **groupée par matière → chapitre**, avec recherche par nom, icône de matière,
badge de difficulté, badge de statut, et compteur « 👁️ vue N fois par Massimo » par capsule.
En tête de page, un badge **« 🎬 N visionnages de Massimo »** agrège le total (répétitions
incluses). Un **bouton son** (🔊/🔇) dans l'en-tête coupe/active le carillon des célébrations
(réglage persistant, partagé avec l'interface Massimo).

## Endpoints (Papa, `require_parent`)

- `POST /api/capsules/generate` — `{subject_id, instruction, level?, skill_id?, chapter_id?, visual, duration, difficulty}`
- `GET /api/capsules` · `GET /api/capsules/{id}`
- `POST /api/capsules/{id}/regenerate` — `{instruction?, visual, duration, difficulty?}`
- `PUT /api/capsules/{id}/spec` — `{spec}` (revalidé → `pending`)
- `POST /api/capsules/{id}/classify` — `{chapter_id}`
- `POST /api/capsules/{id}/voice` — synthèse voix Piper
- `POST /api/capsules/{id}/validate` — valide (+ rendu auto si voix prête)
- `POST /api/capsules/{id}/reject`
- `POST /api/capsules/{id}/render` — rendu MP4 asynchrone (202)
- `DELETE /api/capsules/{id}`
- Audio d'une scène : `GET /api/capsules/{id}/audio/{i}?token=`
