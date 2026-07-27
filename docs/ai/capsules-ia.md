# IA — Capsules IA

## Objectif

Générer des mini-supports pédagogiques pour expliquer une notion difficile.

## MVP capsule

Une capsule = un **`CapsuleSpec` typé** (JSON), pas du code ni des slides libres. Le LLM
(qwen2.5 local) remplit un spec conforme à un **vocabulaire de scènes fermé** (9 `kind` : title,
bullet, definition, numberline, barmodel, geometry, steps, timeline, diagram), joué par des
composants **Remotion** que nous écrivons (cf. ADR-0007). Une capsule comprend :

- un titre, une matière, un niveau, une **difficulté** (`facile` / `moyen` / `difficile`) ;
- 4 à 9 scènes animées (la 1ʳᵉ est un titre), la durée de chaque scène calée sur sa narration ;
- une **voix off** (Piper, TTS par scène) ;
- un rendu **MP4** (Lot 2) pour la lecture par Massimo ;
- (à venir) un quiz post-capsule.

À la génération, Papa choisit le **visuel pédagogique**, la **durée** (courte → ≈ 1 min) et la
**difficulté**. Toute capsule passe par une **validation Papa** avant d'atteindre Massimo.

## Génération

Déclencheurs :

- Papa demande une capsule ;
- ZETIS détecte une lacune persistante ;
- Massimo demande une explication vidéo.

## Pipeline

```txt
Skill/GAP
  ↓
Script ELI5
  ↓
Storyboard
  ↓
Validation Papa
  ↓
Audio TTS
  ↓
Slides / images
  ↓
Publication
  ↓
Quiz post-capsule
```

## Règles

- Capsule courte : 2 à 5 minutes.
- Une seule notion principale.
- Exemple concret.
- Sous-titres si vidéo.
- Quiz obligatoire après capsule pour mesurer l’effet.

## Statuts

- draft ;
- waiting_validation ;
- validated ;
- published ;
- archived.

## Lot 2 — Rendu MP4 (implémenté, ADR-0007 §7)

Une fois une capsule **validée** et sa **voix synthétisée** (Piper, Lot 1), Papa lance le
rendu MP4 depuis le pilotage. Le rendu est **sandboxé et asynchrone** — jamais dans le
backend.

### Flux

```txt
Papa: POST /api/capsules/{id}/validate  →  RENDU AUTO : si la voix est présente, enfile
                                            aussitôt le rendu (Massimo l'a sans clic manuel)
   ou POST /api/capsules/{id}/render     (préconditions: validated + voix présente)
  ↓  status → "rendering", enqueue RQ (queue "media")
worker-media (process séparé, Redis/RQ)
  ↓  charge spec_json + WAV de scènes → publicDir temporaire
  ↓  node apps/frontend-papa/src/remotion/render.mjs  (bundle → selectComposition → renderMedia)
  ↓  Chromium headless + ffmpeg (Remotion), licenseKey "free-license"
  ↓  MP4 → stockage objet (MinIO, disque en fallback dev)
  ↓  status → "published", video_url = /api/capsules/{id}/video ; trace ai_jobs (capsule_render)
Massimo: GET /api/capsules/library  →  <video src=/api/capsules/{id}/video?token=…>
```

### Cycle de rendu (`status`)

`draft` → `rendering` → `published` (ou `failed`). Distinct de `validation_status`
(`pending`/`validated`/`rejected`, la relecture éditoriale de Papa).

**Rendu auto à la validation** (`service.validate_capsule`) : valider une capsule dont la
voix est déjà synthétisée enfile aussitôt le rendu MP4 — plus besoin du clic « Rendre ».
Si l'enfilement échoue (Redis/RQ indisponible), la validation tient et la capsule retombe
en `draft` (rendu manuel possible) : la robustesse locale prime sur l'automatisme.

### Composants

- **Composition** : `apps/frontend-papa/src/remotion/CapsuleVideo.tsx` (réutilisée telle
  quelle Lot 1 → Lot 2). Rendu serveur via `Root.tsx` + `CapsuleVideoRender.tsx` (résout les
  `audioUrl` en `staticFile`) + `render.mjs` (CLI Node, `@remotion/renderer`).
- **worker-media** : `apps/worker-media/` (Python RQ). `jobs.render_capsule` orchestre
  DB + rendu + upload ; `render.build_render_input` (pur, testé) prépare le spec.
- **Stockage** : `apps/backend/app/modules/capsules/storage.py` — interface `VideoBackend`
  (`DiskVideoBackend` / `MinioVideoBackend`), choisie par `STORAGE_BACKEND`. L'**audio reste
  sur disque** au Lot 2 (migration MinIO différée).
- **API enfant** : `GET /api/capsules/library` + `GET /api/capsules/{id}/video?token=`
  (JWT en query, comme l'audio ; capsule validée uniquement).

### Différé (prochaines itérations)

- Inserts **Manim** (`<OffthreadVideo>`, ADR §4).
- Migration du stockage **audio** vers MinIO.
- Conteneurisation complète (backend + worker) sur réseau `internal` — cf.
  `infra/docker/worker-media.Dockerfile` + service `worker-media` (profil `render`).
