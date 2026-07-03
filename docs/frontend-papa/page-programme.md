# Page Papa — Programme (éditeur du référentiel)

## Objectif

Éditer le référentiel de programme de l'année active : générer les chapitres d'une
matière par IA, en ajouter à la main, valider/rejeter/éditer/réordonner — selon les
règles de co-construction de l'ADR-0009 §3. La page rend visibles la **source** de
chaque chapitre (IA / Manuel) et son **statut de validation**, indépendamment de son
statut de progression.

Maquettes de référence validées le 2026-07-03 (session Claude) : page Programme,
état chapitre déplié, formulaire d'ajout inline.

## Principes UX (issus de l'ADR-0009)

- **Pas de mode global** : Générer (IA) et Ajouter (manuel) coexistent toujours,
  côte à côte dans le header. Générer = bouton plein (chemin majoritaire),
  Ajouter = secondaire.
- **Deux badges par ligne, jamais plus** : source (`IA` violet / `Manuel` émeraude)
  + validation (`Validé` émeraude / `À valider` ambre / `Rejeté` rouge).
- **Les actions dépendent de l'état** : « Valider » et « Rejeter » uniquement sur
  `pending` ; « Régénérer » uniquement sur `rejected` ; édition inline et suppression
  partout (confirmation avant suppression) ; les chapitres `manual` ne sont jamais
  affectés par une régénération (le backend le garantit, l'UI le rappelle).
- **La génération est longue** (~10-30 s, appel cloud synchrone) : bouton désactivé +
  spinner + message d'attente pendant l'appel ; en cas de 503 (clé absente), afficher
  le message backend tel quel (il explique le repli possible).

## Wireframe

```txt
┌──────────────────────────────────────────────────────────────────┐
│ Programme · cycle 4 — 4e            [⚡ Générer] [+ Ajouter]     │
│ Version 2020 · référentiel co-construit                          │
├──────────────────────────────────────────────────────────────────┤
│ (Maths) (Français) (Histoire-géo) (SVT) (Physique-chimie) (+3)   │  ← pills matière
├──────────────────────────────────────────────────────────────────┤
│ ↕ Nombres relatifs et calcul          [IA] [Validé]        ▼    │
│ ↕ Théorème de Pythagore               [IA] [À valider]           │
│     « Proposé par ZETIS »            [Valider] [Rejeter] ✎ 🗑    │
│ ↕ Programmation Scratch               [Manuel] [Validé]   ✎ 🗑   │
│     « intouchable par la régénération »                          │
│ ↕ Proportionnalité (grisé)            [IA] [Rejeté]  [Régénérer] │
├──────────────────────────────────────────────────────────────────┤
│ ⓘ La régénération ne touche jamais les chapitres manuels ni      │
│   validés. Chaque génération est tracée (cahier de bord IA).     │
└──────────────────────────────────────────────────────────────────┘
```

### État déplié (chevron ▼ sur une ligne)

Affiche, depuis les champs dépliés de l'API (`themes`, `suggested_class`,
`repartition`) : la liste des thèmes du chapitre, la classe suggérée, et le badge
de répartition (`officielle` = repères annuels / `interpretee` = indicative).
La description (texte humain) s'affiche sous le titre.
*(Les leçons viendront au Lot 2 — pas d'accordéon leçons dans cette version.)*

### Formulaire d'ajout inline (clic « Ajouter un chapitre »)

Carte insérée en tête de liste, bordure émeraude :

- Badge `Manuel` affiché d'emblée + rappel « validé d'office, intouchable par la
  régénération » ;
- Champs : Titre (requis), Position (select : à la fin / après <chapitre> / au début),
  Description (optionnelle, visible par Massimo) ;
- Boutons : Créer (plein) / Annuler.

### Réordonnancement

Boutons monter/descendre par ligne (pas de drag & drop en V1) → appel `reorder`
avec la liste complète ordonnée des ids.

## États de page

- **Chargement** : Spinner partagé (`@zetis/ui`).
- **Vide** (matière sans chapitre) : EmptyState avec les deux CTA (Générer / Ajouter).
- **Erreur** : message + bouton réessayer ; 503 génération = message backend verbatim.
- **Pendant génération** : liste inchangée, bouton Générer en état loading.

## Données API (contrat : `packages/types/src/curriculum.ts` — source de vérité)

- `GET /api/subjects` — pills de matières (croisé avec l'année active pour obtenir
  le `school_year_subject_id` de chaque matière).
- Liste des chapitres d'une matière de l'année active (endpoint de lecture du module
  curriculum — vérifier le chemin réel dans `router.py`).
- `POST .../generate-chapters` — passe 1.
- `POST` chapitre manuel · `PATCH` (nom/description/période + validate/reject) ·
  `DELETE` · `POST .../reorder`.

## Thème

Papa émeraude (`@zetis/ui`, tokens sémantiques). Badges : IA = violet clair,
Manuel/Validé = émeraude clair, À valider = ambre clair, Rejeté = rouge clair —
texte foncé de la même famille que le fond (jamais noir pur).

## Hors périmètre de cette page (Lot 2+)

Accordéon leçons/notions ; bandeau d'ancrage RAG ; case « proposer des leçons par
IA juste après » du formulaire d'ajout ; drag & drop ; édition des métadonnées
(`themes`/`suggested_class`) — la génération les produit, Papa ne les édite pas.
