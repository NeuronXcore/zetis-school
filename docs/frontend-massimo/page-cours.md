# Page Massimo — Cours (lecture des cours validés)

## Objectif

Depuis une matière, Massimo lit les **cours des leçons validées** du référentiel de
l'année active : chapitres validés → leçons validées → cours (markdown rédigé en local,
relu par Papa dans la page Programme). C'est le débouché élève du référentiel
(ADR-0009 §9 : **rien n'atteint Massimo avant validation** — le filtrage est fait
côté serveur, jamais côté client).

Route : `/subjects/:slug/cours` — branchée sur le bouton « 📘 Cours » de la page
matière dédiée (`/subjects/:slug`).

## Règles UX (CLAUDE.md — interface enfant)

- Simple, visuel, style verre Massimo (GlassPanel / NeonBackdrop, tokens `zetis-*`).
- AUCUN vocabulaire d'atelier : pas de badges `IA`/`Manuel`, pas de statuts de
  validation, pas d'actions d'édition — Massimo voit des cours, point.
- Une leçon validée **sans cours rédigé** apparaît grisée : « bientôt disponible »
  (jamais « manquant » ni « en échec »).
- Lecture : carte pleine largeur, texte généreux, markdown rendu (titres, listes,
  gras) ; bouton retour clair. Pas de gamification V1 (XP à la lecture = itération
  ultérieure).

## Wireframe

```txt
┌──────────────────────────────────────────────────────────┐
│ ← Retour à la matière      📘 Cours — Français           │
├──────────────────────────────────────────────────────────┤
│ ▼ Lecture et compréhension                               │
│    📄 Lire et comprendre un texte narratif      [Lire →] │
│    📄 Repérer les points de vue narratifs       [Lire →] │
│    📄 Résumer un texte lu            (bientôt disponible)│
│ ▶ Grammaire                                              │
├──────────────────────────────────────────────────────────┤
│ (mode lecture : carte plein cadre, markdown, ← Retour)   │
└──────────────────────────────────────────────────────────┘
```

## Données API (contrat : `packages/types/src/curriculum.ts`)

Routes élève, lecture seule, `get_current_user` (tout utilisateur authentifié — le
rôle `child` passe, contrairement aux routes Papa `require_parent`) :

- `GET /api/student/cours/{subject_slug}` → matière + chapitres **validés** de
  l'année active, chacun avec ses leçons **validées** (`{id, title, summary,
  has_content}`) — jamais le markdown complet dans la liste (payload léger).
- `GET /api/student/lessons/{lesson_id}/cours` → `{id, title, summary, content}` —
  **404** si la leçon n'existe pas, n'est pas validée OU n'a pas de cours (aucune
  fuite d'existence des brouillons).

## Hors périmètre V1

XP/streak à la lecture ; quiz de fin de cours ; mindmaps ; recherche ; mode hors
ligne ; réécriture ELI5 du cours (le bouton ELI5 existe déjà ailleurs).
