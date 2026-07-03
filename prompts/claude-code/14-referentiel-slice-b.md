# Prompt Claude Code — Référentiel de programme · Étape 14, Slice B (page Papa « Programme »)

> Suite directe des étapes 13 et 13-bis (backend livré, 119 tests verts, contrat
> `metadata_json` déplié). Périmètre : **frontend Papa uniquement**, plus, si et
> seulement si nécessaire, des endpoints de **lecture** minimaux.

---

Lance d'abord `graphify update .`, puis lis, dans cet ordre, avant toute ligne de code :

1. `CLAUDE.md` (règles frontend : hooks dédiés, types partagés, pas de logique métier
   dans les composants) ;
2. `docs/frontend-papa/page-programme.md` — c'est la spécification de cette page,
   wireframe et règles UX compris. Elle fait foi sur le prompt en cas d'ambiguïté visuelle ;
3. `docs/decisions/adr-0009-referentiel-programme-scolaire.md` §3 et §9 (règles de
   co-construction que l'UI doit refléter) ;
4. **Le contrat réel** : `packages/types/src/curriculum.ts` (source de vérité des types)
   et `apps/backend/app/modules/curriculum/router.py` (chemins exacts des routes —
   ne suppose JAMAIS un chemin, lis-le) ;
5. Une page Papa existante branchée sur l'API comme patron d'architecture (par ex.
   la page Sources de cours ou Missions refondues) : structure hook + page,
   composants `@zetis/ui`, gestion Loading/Error/Empty ;
6. Le thème Papa (`@theme` de `apps/frontend-papa`) et les composants disponibles
   dans `packages/ui` (Button/Card/Badge/Spinner/EmptyState — étendre au fil de
   l'eau si un manque, jamais dupliquer du Tailwind brut).

## Objectif

La page « Programme » du frontend Papa, conforme à `page-programme.md` : pills de
matières, liste des chapitres avec badges source + validation, génération IA avec
état d'attente, ajout manuel inline, édition, validation/rejet, suppression,
réordonnancement par boutons, état déplié montrant thèmes/classe/répartition.

## Travail demandé

### 1. Vérification de contrat (AVANT le code UI)

Confronte `page-programme.md` § Données API aux routes réelles du `router.py` :

- S'il n'existe **pas d'endpoint listant les chapitres** d'une matière de l'année
  active, ou **pas de moyen d'obtenir les `school_year_subject_id`** de l'année
  active avec leurs matières : ajoute le ou les endpoints de **lecture seule**
  minimaux (garde parent, schémas dans `packages/types`), avec un test chacun.
  C'est la seule extension backend autorisée dans cette slice.
- Toute autre divergence (chemin, champ, verbe) : ARRÊTE-TOI et signale avant de coder.

### 2. Hook + page

- `useCurriculum` (ou équivalent, suivant la convention des hooks existants) :
  appels API typés via le client `@zetis/auth`, états loading/error, invalidation
  après mutation (re-fetch de la liste).
- `ProgrammePage` dans `apps/frontend-papa` + entrée de navigation sidebar.
- Composants courts : ligne de chapitre, badges, formulaire d'ajout inline, état
  déplié — découpés en fichiers, sans logique métier (les règles « quelles actions
  pour quel état » viennent d'une petite fonction pure testable, pas du JSX).

### 3. Comportements clés (spec § Principes UX — les répéter ici serait les diverger)

Points d'attention d'implémentation seulement :

- Génération : requête longue (~10-30 s) → bouton loading + désactivé, la liste
  reste affichée ; à la réponse, re-fetch ; sur 503, afficher le `detail` backend
  verbatim (il contient l'explication du repli).
- Reorder : optimiste côté UI (la ligne bouge tout de suite), rollback si l'appel
  échoue.
- Suppression : confirmation (pattern existant du projet s'il y en a un, sinon
  confirm minimal) — un chapitre validé supprimé ne se régénère pas tout seul.
- Sélection de matière : la première matière active par défaut ; la sélection
  survit au re-fetch.

### 4. Tests

- Fonction pure « actions disponibles selon (source, validation_status) » : testée
  exhaustivement (c'est la règle §3 rendue visible — le test-verrou de l'UI).
- Un test de rendu par état de page (liste, vide, erreur) avec l'API mockée,
  suivant le setup Vitest/Testing Library existant (étape 18).
- `tsc --noEmit` et build de `frontend-papa` verts.

## Hors périmètre strict (ne pas commencer)

Accordéon leçons, bandeau RAG, case « proposer des leçons », drag & drop, édition
des métadonnées, page Années scolaires (étape ultérieure — endpoints school-years
inexistants), tout endpoint d'écriture backend, toute modification du service ou
du prompt curriculum.

## Si tu es bloqué

Écarts probables : conventions de hooks différentes de ce que suppose ce prompt ;
absence des endpoints de lecture (§1 — autorisé) ; composant `@zetis/ui` manquant
(Input/Select prévus « au fil de l'eau » depuis l'étape 17 — les créer dans
`packages/ui`, pas en local). Dans les autres cas : propose l'ajustement minimal
et attends validation.

## À la fin, réponds avec la checklist standard (9 points)

Commit conseillé : `feat(curriculum): Papa program editor page (chapters slice B)`
