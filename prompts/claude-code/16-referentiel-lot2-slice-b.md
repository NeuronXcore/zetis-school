# Prompt Claude Code — Référentiel · Étape 16, Lot 2 Slice B (UI leçons dans la page Programme)

> Suite de l'étape 15 (passe 2 backend, 138 tests verts). Périmètre : **frontend Papa
> uniquement** — étendre la page Programme existante avec l'étage leçons. Aucune
> extension backend n'est attendue : `GET /chapters/{id}/lessons` existe déjà
> (ajouté par la Slice A du Lot 2 précisément pour cette slice).

---

Lance d'abord `graphify update .`, puis lis, dans cet ordre, avant toute ligne de code :

1. `CLAUDE.md` ;
2. `docs/frontend-papa/page-programme.md` — la section « État déplié » vient d'être
   amendée pour cette étape : elle est la spécification (wireframe, mapping des
   statuts, règles d'affichage des `archived`). Elle fait foi en cas d'ambiguïté ;
3. **Le code réel de la page Programme livrée à l'étape 14** : structure des
   composants, hook existant, fonction pure « actions par état » des chapitres —
   c'est le patron à étendre, pas à réinventer ;
4. **Le contrat réel** : `packages/types/src/curriculum.ts` (types leçons/notions
   dépliées) et `apps/backend/app/modules/curriculum/router.py` (chemins exacts —
   ne suppose jamais, lis) ;
5. Le composant de progression estimée utilisé pour la génération de chapitres
   (et, en amont, le pilotage capsules) — à réutiliser tel quel pour la génération
   de leçons ;
6. Les composants `@zetis/ui` disponibles (chips/badges existants avant d'en créer).

## Objectif

L'état déplié d'un chapitre affiche ses leçons (chargées à la demande) avec badges,
notions en chips, actions par état ; Papa peut proposer des leçons par IA (chapitre
validé ou manuel uniquement), en ajouter à la main, valider/rejeter/éditer/
supprimer/réordonner — conformément à la spec amendée.

## Points d'implémentation (le reste est dans la spec — ne pas la paraphraser ici)

- **Chargement paresseux** : fetch des leçons au premier dépliage, cache par
  chapitre dans le hook, invalidation après toute mutation de ce chapitre. Jamais
  de fetch global au chargement de la page.
- **Mapping des statuts** : implémenté dans la même fonction pure « actions/badges
  par état » que les chapitres (étendue, pas dupliquée) — c'est elle qui encode
  « `archived` = invisible » et « Rejeter sur `draft` seulement ». Testée
  exhaustivement (test-verrou de l'UI, comme à l'étape 14).
- **« Proposer des leçons »** : le bouton n'apparaît que si
  `validation_status === 'validated' || source === 'manual'` — la même condition
  que le 409 backend, calculée par la fonction pure. Pendant l'appel : composant
  de progression réutilisé, panneau non fermé, re-fetch à la réponse ; sur 503,
  `detail` backend verbatim.
- **Ajout manuel inline** : dans le panneau déplié, patron exact du formulaire
  d'ajout de chapitre (composant réutilisé/adapté si possible).
- **Notions** : chips lecture seule depuis les données dépliées — ne jamais
  refetcher les skills, ne rien rendre cliquable.

## Tests

- Extension de la fonction pure : tous les couples (created_by, status) × actions,
  y compris l'invisibilité des `archived` et la condition d'affichage de
  « Proposer des leçons ».
- Un test de rendu : dépliage → leçons affichées (API mockée) ; un test : chapitre
  `pending` → pas de bouton Proposer.
- `tsc --noEmit` et build de `frontend-papa` verts.

## Hors périmètre strict

Tout backend (service, prompts, migrations, endpoints) ; bandeau RAG ; leçons
archivées visibles ; édition des notions ; frontend-massimo ; page Années
scolaires ; drag & drop.

## Si tu es bloqué

Écarts probables : le composant de progression des chapitres est couplé à son
contexte (→ extraire dans `packages/ui` plutôt que dupliquer) ; la fonction pure
des chapitres n'est pas factorisée pour accueillir les leçons (→ refactor minimal
autorisé, avec ses tests). Toute autre divergence : signale avant de coder.

## À la fin, réponds avec la checklist standard (9 points)

Commit conseillé : `feat(curriculum): lessons tier in Papa program editor (lot 2 slice B)`
