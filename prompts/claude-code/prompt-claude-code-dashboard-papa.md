# Prompt Claude Code — Chantier « Dashboard Papa v2 »

Branche : `feat/dashboard-papa-v2` · Specs committées en premier commit.

---

## Contexte

Refonte complète du dashboard Papa. La maquette historique contredisait sept décisions déjà prises
(Obsidian, XP en KPI, récompenses, radar non alimentable, générateur de quiz hors contrat, taux
global, palette Massimo). Le chantier applique `adr-0028` et la réécriture de
`docs/frontend-papa/page-dashboard.md`.

**Documents à lire avant toute ligne de code** :

1. `docs/decisions/adr-0028-dashboard-papa-agregat-unique.md` — décision structurante
2. `docs/frontend-papa/page-dashboard.md` — spec de page (contrat API inclus)
3. `docs/frontend-papa/mockup/mockup-dashboard-papa-v3.html` — maquette de référence (interactions,
   non le code)
4. `CLAUDE.md` — garde-fous

---

## Étape 0 — Read-before-code : **faite le 2026-07-31**

Les quatre points sont répondus dans `adr-0028 §Vérifications`, avec les fichiers et les lignes.
Résumé : **1 ✅** (la heatmap n'a aucun consommateur hors dashboard → supprimée) · **2 ✅**
(horodatage `TIMESTAMPTZ` et index `ix_learning_events_student_created` existent) · **3 ❌**
(`generated_at` n'existe pas, la route est `/conseil`, la page ne lit aucun param → §7 amendé,
extension bornée retenue plutôt que CTA inerte) · **4 ✅** (`SubjectFilterChips` et `subjectIconFor`
sont déjà dans `@zetis/ui`).

Six écarts supplémentaires ont été trouvés et intégrés à l'ADR et à la spec — **lis-les avant de
coder**, ils changent le travail : §3 bis (définition réelle de « consolidée » / « fragile »),
§3 ter (table d'historique de maîtrise, **une migration**), §Conséquences n°6 (la route
`/api/parent/dashboard` **existe déjà** : réécriture cassante), la file « À décider » (quiz exclus,
5ᵉ `kind="demande"`), et l'absence de react-query comme de toute lib de graphes.

Continue à lire les définitions réelles avant de t'en servir : `LearningEvent`, `SkillMastery`
(**pas `Skill`** — la maîtrise n'est pas sur `Skill`), `SpacedReviewCard`, `Gap`, `Mission`, et les
schémas Pydantic du module `activity`. **N'invente aucune forme d'API.**

---

## Slice 0 bis — Backend : historique de maîtrise

Prérequis de la courbe « fragiles » (`adr-0028 §3 ter`).

- Modèle `SkillMasteryHistory` (`student_id`, `skill_id`, `status`, `mastery_score`, `changed_at`)
  + index `(student_id, changed_at)`.
- **Un seul point d'écriture** : `progress/mastery.py::set_mastery_status`. N'en ajoute pas d'autre.
- Migration Alembic + backfill des bascules `mastered` déductibles de `SkillMastery.mastered_at`.
- Tests : une bascule = une ligne · pas de doublon si le statut ne change pas · backfill idempotent.

---

## Slice 1 — Backend : agrégat unique

`GET /api/parent/dashboard` (`require_parent`), contrat complet dans `page-dashboard.md §Contrat API`.
**Cette route existe déjà** — c'est une réécriture cassante, pas une création. Ne crée pas une
seconde URL.

- **Aucune migration** dans cette slice (celle de l'historique est en slice 0 bis).
- Séries **par matière**, jamais pré-agrégées : pas de ligne « toutes matières » côté serveur.
- Les trois fenêtres (7 / 30 / 90) dans la même réponse ; `calendar` reste sur 26 semaines,
  indépendant de la période.
- Réutilise l'existant — **ne le réimplémente pas, ne le duplique pas** : `event_minutes` /
  `active_minutes` / `bucket_days` et `timeutils` (`activity/service.py`), `OPEN_GAP_STATUSES` /
  `consolidated_count` (`progress/service.py`), `_has_active_remediation` (`missions/service.py`),
  `INACTIVE_CARD_STATUSES` + `_due_conditions` (`memory/service.py`).
- `learning_events` seul pour l'activité. **Jamais d'UNION avec `xp_events`.** Et n'oublie pas
  d'exclure `NON_ACTIVITY_EVENTS` (agenda) — piège déjà tombé trois fois.
- Nouvelles fonctions **pures**, testées sans DB, dans la section 1 de `activity/service.py` :
  `bucket_slots` (8 × 7, 8 h → 24 h, + `slots_outside_minutes`), `notions_breakdown` (mapping des
  statuts du §3 bis), `review_load_14d`, `content_chain`, `inbox` (5 kinds), `reading`.
- `reading[]` : un constat **sans `evidence` n'est pas émis**.
- Tests : un test par invariant (séries par matière, jours vides omis, bucketing créneaux + minutes
  hors plage, mapping des 6 statuts, absence de constat sans preuve, `has_referentiel: false`
  conservé dans la liste, quiz absents du `kind=validation`).
- Au passage : la docstring de `dashboard_kpis()` est **périmée** (elle nie l'existence de
  `resolved_at` et `mastered_at`, ajoutés depuis par `f1a2b3c4d5e6`) — corrige-la.

Commit unique en fin de slice. **Stop** : tu me montres la réponse JSON réelle sur la base avant de
passer au front.

---

## Slice 2 — Frontend : structure, KPI actifs, file de décisions

- `packages/types/src/dashboard.ts` — types dérivés du **JSON réel** servi en fin de slice 1, pas
  devinés. À ré-exporter depuis `packages/types/src/index.ts`, sinon les apps ne les voient pas.
- **Un seul appel au montage.** ⚠️ Il n'y a **ni react-query ni swr** dans le dépôt : suis le patron
  maison `lib/dashboard.ts` + `hooks/useDashboard.ts` (référence : `hooks/useCouncilClass.ts`).
  Ajouter une lib de data-fetching serait un ADR. **Aucun refetch** sur période / matière / focus.
- Dérivations client bornées à la présentation (sommes, empilements, paliers de couleur). **La
  première fois qu'un composant calcule un statut pédagogique, l'ADR est violé** — remonte-le.
- KPI cliquables : `role="button"`, `aria-pressed`, clavier. Focus → `data-scope~="<focus>"`.
- État sérialisé dans l'URL (`?period=&subject=&focus=`), via `useSearchParams`.
- File « À décider » : regroupement par **5** `kind` (dont `demande`), ordre fixe, état vide
  explicite. **Les quiz n'y sont pas** (pas de `validation_status`) et `lessons` s'interroge sur
  `status`, pas `validation_status`.
- `SubjectFilterChips` réutilisé, **pas recodé**.
- Suppressions attendues (le focus remplace le dépliage) : `isCompleteKpis` + le repli mock de
  `DashboardPage`, `KpiBreakdown.tsx`, `lib/kpiBreakdown.ts`, les entrées mortes de `data/mock.ts`,
  et leurs tests.

---

## Slice 3 — Visualisations

Huit cartes, dans l'ordre de la spec. **Aucune dépendance graphique nouvelle** : SVG + React, comme
la maquette. Si tu penses qu'une lib est nécessaire → **stop-on-blocker**, c'est un ADR
(principe de sobriété).

Points de vigilance :

- Heatmap : **une carte, deux vues** (Calendrier / Créneaux), échelle émeraude unique, **pas de
  rouge**. Réutilise `ActivityHeatmap` + `lib/heatmap.ts` (déjà émeraude, déjà testés) pour la vue
  Calendrier ; seule la source de données change. Créneaux : **8 h → 24 h**, et affiche
  `slots_outside_minutes` en note plutôt que de l'escamoter.
- **Re-monte `DayDetailPanel`** sous la nouvelle heatmap : c'est son seul point de montage, et le
  drill-down jour reste paresseux — seule exception au « zéro spinner ».
- Sparkline : **extrais `ProgressSparkline`** (aujourd'hui dans `frontend-massimo`) vers
  `@zetis/ui` en export racine, plutôt que d'en écrire une seconde.
- Nuage « Où agir » : CTA à deux états, pictogramme `grayscale(1)` quand aucune matière n'est
  sélectionnée, **jamais d'emoji codé en dur** (n'utilise pas `lib/subjectEmoji.ts`, qui viole déjà
  la règle ailleurs). Cible : **`/conseil`**.
- Couleur par matière : `Subject.color` vient du payload, le repli est **déterministe et côté
  client** (présentation).
- Chaque carte porte son `data-scope`.
- `prefers-reduced-motion` : transitions d'atténuation neutralisées.

---

## Slice 4 — Conseil de classe : lecture des query params (bornée)

Seule incursion hors dashboard, **arbitrée** (`adr-0028 §7`). **Commit séparé, révocable seul.**

`ConseilClasseIAPage` lit `?subject=&period=` via `useSearchParams` et présélectionne. Périmètre
strict : lecture de l'URL et présélection. **Ni la génération, ni le cycle de vie, ni les routes
backend ne sont touchés — `adr-0020` n'est pas rouvert.** Le bandeau de fraîcheur est hors v1.

---

## Garde-fous du chantier

- **Mono-chantier** : ne touche pas aux missions ni au SRS. La seule incursion autorisée est la
  slice 4 ci-dessus, et elle est bornée à la lecture de deux query params.
- **Ne corrige pas le bug d'échelle `mastery_score`** (0–100 traité comme 0–1) : il est antérieur,
  hors périmètre, et le §3 bis fait que cette page ne l'hérite pas.
- **Rien de cette page ne remonte dans l'interface de Massimo.** Aucune notification push.
- **Jamais « Claude »** dans l'UI pour le pédagogique : `moteur local` (`adr-0008`).
- Vocabulaire figé : « temps actif » (heuristique de présence), « consolidée », « fragile »,
  « lacune ouverte ». Pas de « taux de réussite », pas de « score ».
- Un commit par slice, message conventionnel, `pnpm lint && pnpm typecheck` verts avant commit.

## Checklist de fin de session (9 points)

1. `DECISIONS.md` : entrée `adr-0028` ajoutée — ✅ **fait**, statut passé à **Accepté** (2026-07-31)
2. `page-dashboard.md` : écarts du read-before-code reportés — ✅ **fait**
3. `API_SPEC.md` : `GET /api/parent/dashboard` **réécrit** ; `/activity/heatmap` supprimée ;
   `/activity/sessions` conservée **avec son consommateur nommé** (Cahier de bord) ;
   `/progress/summary` marquée « documentée mais jamais implémentée »
4. `DATA_MODEL.md` : **une table ajoutée**, `skill_mastery_history` (`adr-0028 §3 ter`) —
   l'attente « inchangé » de la version initiale ne tient plus
5. `CHANGELOG.md` : entrée de version
6. Tests backend verts + un scénario front vérifié à la main (filtre matière = zéro requête réseau,
   à contrôler dans l'onglet Réseau)
7. Routes mortes supprimées ou explicitement conservées avec leur consommateur nommé
8. Aucune dépendance ajoutée (ou ADR ouvert)
9. Questions ouvertes remontées : génération asynchrone du Conseil de classe (hors v1), bandeau de
   fraîcheur (hors v1), bug d'échelle `mastery_score` (hors périmètre, à traiter à part), pages
   `/lacunes` et `/progression` encore 100 % mockées alors que `/api/parent/progress/gaps` existe,
   et tout écart entre la maquette et ce que le code permet réellement
