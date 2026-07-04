# Page Papa — Rattrapage « skills-only » (niveau antérieur)

> Maquette **à valider avant implémentation** (méthodologie « maquette d'abord »).
> Backend déjà livré et en prod (ADR-0010, PR #32) : cette slice est **frontend pur**.
> Contrat d'API : `packages/types/src/curriculum.ts` (`SkillsBackfill*`) = source de vérité.

## Objectif

Permettre à Papa d'alimenter le **référentiel de notions** (`Skill`) d'un niveau
**antérieur du même cycle** (ex. français 5e alors que l'année active est 4e), pour
rendre opérationnel le rattrapage (check-up `level=5e`, lacunes, missions, maîtrise) —
**sans créer d'année scolaire rétroactive** et **sans polluer** la page Programme de
l'année active avec des chapitres d'un autre niveau.

C'est une **consommation du référentiel**, pas une nouvelle hiérarchie : rien n'est
persisté sauf les notions confirmées (aucun chapitre, aucune leçon, aucune liaison).

## Où ça vit (déclenchement depuis la page Programme)

Un point d'entrée discret sur la page **Programme**, pour la matière sélectionnée
(pill active) : action tertiaire dans le header, à droite de `Générer` / `Ajouter`.

```txt
┌──────────────────────────────────────────────────────────────────────┐
│ Programme · cycle 4 — 4e     [⚡ Générer] [+ Ajouter]  [🎯 Rattrapage] │
└──────────────────────────────────────────────────────────────────────┘
```

`🎯 Rattrapage` ouvre une **modale** (le flux ne quitte pas la page Programme et ne
touche pas la liste des chapitres de l'année active). La matière est déjà connue
(pill sélectionnée → `subject_id` via `GET /api/school-years/active/subjects`
→ `subjects[].subject_id`).

## Principe UX (issus de l'ADR-0010)

- **Flux en deux temps, stateless** : Générer (prévisualisation) → revue → Confirmer.
  Le serveur ne stocke **aucun brouillon** entre les deux ; c'est le client qui porte
  la liste revue. On peut fermer/rouvrir la modale, mais fermer avant confirmation
  **perd** la proposition (l'avertir).
- **L'échafaudage est jeté** : les « chapitres d'échafaudage » ne servent qu'à
  regrouper/cadrer les notions à l'écran. Ils ne sont **jamais enregistrés** — le dire
  explicitement pour ne pas laisser croire qu'on crée des chapitres 5e.
- **Papa édite avant d'écrire** : retirer une notion hors-sujet, en renommer une, en
  ajouter une (co-construction, ADR-0009 §3). Rien n'atteint la base avant `Confirmer`.
- **Génération longue** : ~6–9 appels LLM séquentiels (cloud, dérogation `curriculum_*`),
  ~1 à 3 min. Barre de progression estimée (réutiliser `useEstimatedProgress`/`ProgressBar`
  des capsules, cible ~90 s) ; bouton désactivé pendant l'appel. 503 sans clé cloud →
  message backend **verbatim** (il explique le repli local). 502 → `detail` verbatim.
- **Échec partiel assumé** : si des chapitres d'échafaudage échouent (`failed_scaffolds`),
  on affiche quand même la **liste partielle** + un bandeau discret « N sections n'ont
  pas abouti — tu peux confirmer ce qui est proposé ou régénérer ».
- **Idempotence visible** : le retour du confirm distingue **créées** vs **déjà
  présentes** (« 12 notions ajoutées · 5 déjà dans le référentiel »).

## Wireframe

### Étape 1 — Choix du niveau (ouverture de la modale)

```txt
┌───────────────────── Rattrapage — Mathématiques ─────────────────────┐
│ Générer les notions d'un niveau antérieur pour alimenter le          │
│ référentiel de rattrapage. Aucun chapitre ni cours n'est créé —      │
│ seules les notions que tu confirmes sont ajoutées.                   │
│                                                                      │
│ Niveau à générer :   ( 5e )  ( 4e )  ( 3e )         ← cycle 4 only   │
│                                                                      │
│ ⓘ ~1 à 3 min (génération cloud, comme les chapitres).               │
│                                                                      │
│                                   [ Annuler ]  [ ⚡ Générer ]        │
└──────────────────────────────────────────────────────────────────────┘
```

- Sélecteur de niveau = les 3 niveaux du **cycle 4** (`5e | 4e | 3e`). Le niveau de
  l'année active peut être masqué ou juste marqué « (année en cours) » — le besoin réel
  est un niveau *antérieur*, mais le backend accepte les 3 (validation 400 hors cycle 4).
- Un seul niveau à la fois (une génération = une matière × un niveau).

### Étape 2 — Prévisualisation (après génération)

```txt
┌───────────── Rattrapage — Mathématiques · 5e (programme 2020) ────────┐
│ Relis et ajuste. Rien n'est enregistré tant que tu ne confirmes pas. │
│ ⚠ 1 section n'a pas abouti (liste partielle).                        │
│                                                                      │
│ ▸ Nombres relatifs : opérations              (échafaudage, non créé) │
│     (Nombres relatifs ×) (Règle des signes ×) (Droite graduée ×)     │
│     [＋ ajouter une notion]                                          │
│                                                                      │
│ ▸ Priorité et distributivité                 (échafaudage, non créé) │
│     (Priorités opératoires ×) (Distributivité ×)                     │
│     [＋ ajouter une notion]                                          │
│                                                                      │
│ …                                                                    │
│                                              27 notions · 6 sections  │
│                     [ ↻ Régénérer ]   [ Annuler ]   [ ✓ Confirmer ]  │
└──────────────────────────────────────────────────────────────────────┘
```

- **Groupe = chapitre d'échafaudage** (`groups[].scaffold_chapter`), rendu comme
  en-tête de section avec la mention « (échafaudage, non créé) » — jamais présenté
  comme un chapitre du référentiel.
- **Chips = notions** (`groups[].notions`), chacune retirable (`×`). Clic sur le
  libellé = renommage inline. `＋ ajouter une notion` = chip vide éditable.
- La **dédup est déjà faite côté serveur** dans un groupe ; entre groupes, deux
  occurrences identiques fusionneront à l'upsert (idempotence) — pas besoin de les
  bloquer à l'écran, mais on peut les signaler discrètement.
- `Régénérer` relance l'étape 1→2 (nouvelle proposition, écrase l'édition en cours →
  confirmation « perdre tes ajustements ? »).

### Étape 3 — Résultat du Confirmer

```txt
┌──────────────────────────── Rattrapage terminé ──────────────────────┐
│ ✓ 22 notions ajoutées au référentiel · 5 déjà présentes.             │
│ Le check-up « Mathématiques · 5e » est maintenant disponible.        │
│                                                        [ Fermer ]     │
└──────────────────────────────────────────────────────────────────────┘
```

- Message dérivé de `{ created, existing }`. Re-confirmer la même liste → « 0 ajoutée ·
  27 déjà présentes » (idempotence, aucun doublon) — rassurant, pas une erreur.

## Données API (contrat : `packages/types/src/curriculum.ts`)

- `GET /api/school-years/active/subjects` — obtient `subject_id` de la matière (déjà
  chargé par la page Programme).
- `POST /api/curriculum/skills-backfill/generate` — corps `{ subject_id, level }`.
  Réponse `SkillsBackfillPreview { subject_id, subject_name, level, cycle,
  program_version, groups: [{ scaffold_chapter, notions: string[] }], failed_scaffolds:
  string[] }`. 400 si `level` hors cycle 4 ; 503 sans clé cloud ; 502 génération.
- `POST /api/curriculum/skills-backfill/confirm` — corps `{ subject_id, level, notions:
  [{ scaffold_chapter, name }] }` (le client aplatit la prévisualisation revue).
  Réponse `SkillsBackfillConfirmResult { created, existing }`. Pas d'appel LLM ici.

Aucun nouveau type n'est nécessaire : les 6 interfaces `SkillsBackfill*` sont déjà
exportées par `@zetis/types`.

## États

- **Idle (modale fermée)** : bouton `🎯 Rattrapage` dans le header Programme.
- **Étape 1** : sélecteur de niveau, `Générer` actif.
- **Génération** : `Générer` en loading + barre estimée + « ~1 à 3 min ».
- **Étape 2** : prévisualisation éditable ; `failed_scaffolds` → bandeau ambre discret.
- **Confirmation** : `Confirmer` en loading (court, pas de LLM).
- **Résultat** : message créées/déjà présentes.
- **Erreur** : 503/502 → `detail` backend verbatim dans la modale, l'édition est conservée.

## Thème & composants (`@zetis/ui`)

Papa émeraude. Réutiliser : `Modal`/`ConfirmDialog`, `Button` (plein/secondaire/tertiaire),
`Badge` (violet « IA » pour rappeler l'origine générée), chips éditables (même style que
les notions de leçon dans page Programme), `ProgressBar` + `useEstimatedProgress`
(pattern capsules). Aucun composant nouveau attendu ; si un « chip éditable » réutilisable
manque, l'extraire dans `@zetis/ui` (comme `Input`/`Select` de la Slice B).

## Hors périmètre de cette slice

- Ancrage RAG des *Attendus de fin d'année* 5e (Slice A-bis, backend) — la génération en
  bénéficiera automatiquement quand il existera ; l'UI n'a rien à faire.
- Réconciliation des skills seed / diagnostics passés avec les notions générées (Lot 3).
- `prerequisite_skill_ids` / chaînage des prérequis (chantier ultérieur).
- Multi-niveaux en une passe, multi-matières en lot : une génération = 1 matière × 1 niveau.
- Toute visualisation des chapitres d'échafaudage comme entités persistantes (ils n'existent pas).
