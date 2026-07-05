# Design System ZETIS

## Identité

ZETIS doit avoir une identité moderne, légèrement futuriste, mais lisible pour un enfant.

## Style

- interface sombre ou neutre ;
- accents lumineux ;
- cartes arrondies ;
- icônes simples ;
- avatar ZETIS ;
- onde vocale ;
- animations courtes.

## Massimo

- plus visuel ;
- plus gaming ;
- gros boutons ;
- feedback immédiat ;
- peu de tableaux.

## Papa

- plus analytique ;
- cartes KPI ;
- tableaux ;
- filtres ;
- graphiques sobres.

## Composants

- Button
- Card
- Sidebar
- PageHeader
- XPBadge
- ProgressRing
- SubjectTile
- SubjectDeckGrid
- MissionCard
- AlertCard
- ZetisAvatar
- VoiceWave
- DataTable
- Timeline
- ContentLifecycleActions
- GenerationProgress
- ConfirmDialog

## Sons

Sons autorisés :

- mission start ;
- réussite ;
- XP gain ;
- ZETIS parle ;
- erreur douce.

Toujours prévoir mute.

---

# Conventions UI partagées

> Règles **transverses** (plusieurs pages) : elles vivent ici, **pas** dans un ADR. Les specs
> de page (`page-fiches.md`, `page-mindmaps.md`, `page-capsules-pilotage.md`…) les
> **référencent** au lieu de les redéfinir.

## Pictogrammes de matière (Massimo)

- Toujours résolus via **`lib/subjectIcons.ts`** (`import.meta.glob` sur **`src/assets/subjects/`**,
  PNG par **slug**, **repli emoji** si l'asset manque). **Jamais** d'emoji ni de chemin d'asset
  codé en dur dans une page.
- Rendus par **`SubjectTile`** (cadre teinté par la couleur de la matière) et les **decks
  circulaires** de `SubjectDeckGrid` (anneau conique + pictogramme), communs à ELI5, Révision,
  Quiz, Fiches, Mindmaps.

## Badges (Massimo)

- **Badge compteur** — pastille haut-droite du pictogramme / deck, dégradé `primary → cyan`
  (`@zetis/ui`), nombre d'items disponibles (fiches, cartes SRS, capsules non vues…). Masquée si
  `0` (le deck passe en état grisé « bientôt »).
- **Badge « Nouveau »** — sur tout item jamais ouvert par Massimo (déjà en place capsules :
  étagères + « Nouveau » + difficulté). **Se retire au premier accès** (compté serveur, ex.
  `capsule_views`). Réutiliser la **même brique de badge** — pas de variante par page.

## Pilotage — cycle de vie du contenu généré (Papa)

Chaque item produit par l'IA (fiche, mindmap, capsule, SRS…) expose le **même quatuor**, quelle
que soit la page : **Générer · Régénérer · Éditer · Supprimer**.

- **Supprimer** et **Régénérer** (régénérer **écrase** l'existant → destructif) : **popup de
  confirmation obligatoire** (`ConfirmDialog`) avant l'action irréversible, avec libellé
  explicite.
- **Éditer** : modale d'édition du **spec** ; toute modification **revalide** → repasse
  `pending`.
- **Générer** : trace `ai_jobs`, sortie `pending` (jamais servie à Massimo avant `validated`).
- **Indicateur de génération** : **barre _ou_ cercle + %** (`GenerationProgress`,
  `variant="bar" | "ring"`) pendant la génération et ses sous-étapes (voix, rendu…) ;
  **célébration douce** à la réussite.

### Briques partagées (extraction — cf. `SubjectDeckGrid`)

Le patron existe déjà pour les capsules (`page-capsules-pilotage.md`). Plutôt que le
re-spécifier, il est **extrait en briques `@zetis/ui`** réutilisées par fiche / mindmap / SRS :

```tsx
<ContentLifecycleActions
  onGenerate={…} onRegenerate={…} onEdit={…} onDelete={…}
  status="pending" | "validated" | "rejected"  // Régénérer/Supprimer → ConfirmDialog
/>
<GenerationProgress variant="bar" | "ring" value={pct} label="Génération…" />
```
