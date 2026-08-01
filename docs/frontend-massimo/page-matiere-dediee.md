# Page Massimo — Matière dédiée (index de notions)

> **Réécriture complète du 2026-08-01.** La version précédente datait de la Phase 1 : un launcher au
> grain matière (en-tête « Niveau 5 · 320 XP », quatre tuiles, « Notions à renforcer »). Elle était
> **antérieure à la doctrine ADR-0024 §5** et la contredisait sur trois points. Rien n'en est repris
> sauf la route.
>
> Décisions de fond : **addendum ADR-0024 — page matière index de notions** (modèle partagé avec la
> constellation, route de disponibilité en lot, recherche locale, rétrolien dérivé, amendement
> ADR-0017) et **addendum ADR-0027 — demandes depuis une surface élève** (route enfant en écriture).
> Maquette de référence : `mockup/mockup-page-matiere-v1.html`.
> Style : glassmorphique / néon Massimo (`GlassPanel` / `NeonBackdrop`, tokens `zetis-*`).

## Objectif

Donner à Massimo **la surface de travail d'une matière** : voir toutes ses notions, chercher, et
ouvrir n'importe quel outil ZETIS sur n'importe laquelle — en un tap, sans repasser par sept decks
séparés.

La page répond à trois questions, dans cet ordre : *où j'en étais ?*, *où est la notion que je
cherche ?*, *qu'est-ce que ZETIS sait faire de celle-là ?*

Route : `/subjects/:slug`.

## Ce qu'elle N'EST PAS

- **Pas un launcher d'outils.** Les sept surfaces par matière (`/fiches/:slug`, `/mindmaps/:slug`,
  `/subjects/:slug/cours`, `/revision?subject=`, …) existent déjà et gardent leurs entrées propres.
  Reproduire leurs tuiles ici en ferait un doublon appauvri — c'est ce qui rendait la page inerte.
- **Pas une page de progression.** Aucun niveau, aucun XP, aucun pourcentage, aucun classement de
  matières. La progression, c'est la Galaxy.
- **Pas une seconde constellation.** Elle rend le **même modèle**, en liste — elle **est** le repli
  sans WebGL promis par `zetis-galaxy.md §11`. Contrainte dure : **aucun chunk 3D**, ni en import
  statique ni en `import()`.

## Structure

```txt
┌──────────────────────────────────────────────────────────┐
│ ← Matières                                    Z E T I S  │
├──────────────────────────────────────────────────────────┤
│ [picto]  SVT                        [ Voir en galaxie → ]│
│          3 chapitres · 9 notions                         │
├──────────────────────────────────────────────────────────┤
│ 🔍 Cherche une notion…            3 notions trouvées  esc│
├──────────────────────────────────────────────────────────┤
│ ┌ REPRENDRE ───────────┐ ┌ PRÊT À REVOIR ──────────────┐ │
│ │ Nutrition végétale   │ │ 4 cartes en SVT             │ │
│ │ — le cours           │ │                             │ │
│ └──────────────────────┘ └─────────────────────────────┘ │
├──────────────────────────────────────────────────────────┤
│ CHAPITRES                                                │
│ ▼ La cellule                                  3 notions  │
│   ● Mitose            En construction   ▣▣□□▣□▣          │
│   ○ Membrane          On commence       ▣▣□□□□□          │
│   ● Noyau et ADN      Bien acquis       ▣▣▣▣▣▣▣          │
│ ▶ Nutrition végétale                          3 notions  │
│ ▶ Reproduction sexuée                         3 notions  │
└──────────────────────────────────────────────────────────┘
```

### 1. En-tête matière

Pictogramme de marque (`subjectIconFor`, **jamais d'emoji** — `design-system.md §Pictogrammes`),
nom de la matière, et un décompte **du catalogue** : « 3 chapitres · 9 notions ».

**Interdits, par héritage ADR-0024 §5** : niveau, XP, pourcentage, barre de progression, badge de
maîtrise, « meilleure matière ». Le décompte décrit ce qui existe, pas ce que vaut Massimo.

Un bouton fantôme **« Voir en galaxie → »** vers `/galaxy?subject=<slug>` : les deux rendus du même
modèle se pointent l'un l'autre.

### 2. Recherche

Champ au-dessus de l'arbre. **Locale, lexicale, client-side** sur l'index déjà chargé : aucune
requête, réponse à la frappe.

- Insensible à la casse **et aux accents** — Massimo tape « photosynthese », pas « photosynthèse »
  (`NFD` + suppression des diacritiques, même helper que la recherche de constellation).
- Les correspondances sont **surlignées** dans le nom de la notion.
- Un chapitre **s'ouvre** s'il contient une trouvaille, **se replie et disparaît** sinon.
- Compteur discret : « 3 notions trouvées ».
- `Échap` efface et restaure l'arbre dans son état par défaut.
- **Sans résultat** : « Rien avec ce mot-là en SVT. Essaie un autre mot, ou demande à ZETIS dans le
  chat. » Jamais un échec, et le renvoi est vrai — le chat *est* la recherche en langage naturel.

**Ce qui n'est pas fait ici** : la recherche sémantique. `resolve_skill` reste au chat seul
(addendum ADR-0024 §3).

### 3. Reprendre

Deux cartes au plus, jamais rendues à vide :

- **Reprendre** — le dernier contenu ouvert dans cette matière.
- **Prêt à revoir** — les cartes dues pour cette matière, en **plafond de session** (patron
  `flash_size` de l'Accueil). **Jamais `total_due`** : un compteur de retard est la pression
  quotidienne interdite par `CLAUDE.md`.

C'est du *pull* : Massimo est déjà entré dans la matière. Aucune notification, aucun décompte de
jours, aucun capital perdable.

### 4. Chapitres → notions

Accordéon par chapitre. Chaque ligne de notion porte, de gauche à droite :

- **la pastille d'état** — 5 états, libellés d'enfant, **aucun rouge** : `À découvrir` ·
  `On commence` · `En construction` · `Bien acquis` · `Maîtrisé`. `mastery_score` n'est jamais
  affiché ni sérialisé ;
- **le nom** de la notion ;
- **la panoplie** : sept pastilles, une par activité, **pleine = disponible / creuse = bientôt**.

La panoplie est l'élément signature de la page : d'un regard, Massimo voit ce que ZETIS sait faire de
cette notion. Elle est **masquée sous 620 px** (le panneau la remplace).

Ordre pédagogique **stable** — comprendre → mémoriser → se tester :
`cours · eli5 · fiche · capsule · mindmap · revision · quiz`.

### 5. Panneau de notion

Le tap sur une ligne déplie les **sept activités** en boutons.

- Une activité disponible ouvre sa surface **en pleine page** (`navigate`, amendement ADR-0017 —
  jamais de modale ici).
- **L'accent va à la première activité réellement faisable**, pas à la première de la liste. Une
  action mise en avant doit pouvoir être faite.
- Une activité indisponible est **grisée, non cliquable, libellée « bientôt »** — **jamais**
  « manquant » ni « raté ». C'est l'état du catalogue de Papa, pas un échec de Massimo.

**Granularité, formulée sans mentir** : `quiz` et `revision` ne sont pas adressables par notion (hors
v1 ADR-0027, cibles `location.state`). Depuis la panoplie, ces deux-là ouvrent la surface **matière**
— le libellé le dit (« Réviser la matière »), il ne promet pas la notion.

**ELI5 est grisée si aucun cours validé n'existe** pour la notion (règle de l'orchestrateur : ELI5
dégrade vers le modèle sans cours et inventerait). Sa demande porte alors sur `cours`. ELI5 ouverte
depuis son propre deck reste inchangée.

### 6. Demander à Papa

Sur une pastille grisée, un bouton discret **« demander »**. En pied de panneau, **« Demander à Papa
tout ce qui manque (n) »** — un seul appel, `n` jamais nul (le bouton disparaît sinon).

- Retour : **« C'est noté pour Papa »**. Jamais « je te le prépare » — ZETIS transmet, il ne fabrique
  rien.
- Sous le bouton, une phrase fixe : « ZETIS transmet la demande. Il ne fabrique rien tout seul. »
- **Aucun statut, aucun délai, aucun rappel.** Massimo ne lit pas la file de Papa.
- **Aucun XP, aucun événement.** Demander n'est pas apprendre ; la ligne de file est la trace.

Contrat : `POST /api/student/content-requests` (addendum ADR-0027).

### 7. Rétrolien

« ← Matières » sur cette page ; **« ← SVT »** sur toutes les surfaces filles de la matière.

Le lien est **dérivé du `:slug` présent dans l'URL**, via une brique partagée — **aucun
`location.state`, aucune pile de navigation maintenue**. Robuste au refresh, au partage d'URL et au
retour physique iPhone.

## Données API

- `GET /api/student/subjects/{slug}/panoply` — **nouvelle** (addendum ADR-0024 §2). Matière →
  chapitres validés → notions, chacune avec `status` et sa panoplie `[{kind, available, …ids}]`.
  Adossée au **prédicat de disponibilité extrait de `galaxy.notion_panel`** — un seul prédicat, deux
  consommateurs. 404 matière inconnue ou hors année active ; `chapters: []` si rien n'est validé.
- `GET /api/student/reviews/summary` — filtré matière, pour la carte « Prêt à revoir ».
- `POST /api/student/content-requests` — **nouvelle** (addendum ADR-0027), `require_child`, écriture
  seule.

Aucune donnée pédagogique durable stockée côté front. Toute la logique vit dans un hook
(`useSubjectPanoply`) ; le composant ne calcule aucune règle métier.

## Règles UX (CLAUDE.md — interface enfant)

- Une action principale par écran ; vocabulaire d'enfant, jamais d'atelier (pas de statut de
  validation, pas de badge `IA`/`Manuel`, pas d'action d'édition).
- **Aucun rouge, aucun vocabulaire d'échec**, nulle part.
- **L'or `#ffcf47` n'apparaît pas** : il est réservé à l'état « ZETIS parle » dans toute l'interface
  Massimo.
- `prefers-reduced-motion` : accordéon et surlignage restent lisibles sans mouvement.
- Cibles de touche ≥ 44 px ; rien d'essentiel ne dépend du survol (il n'existe pas au tactile).
- `aria-label` sur chaque pastille d'état (« nom de la notion — libellé d'état ») et sur chaque
  pastille de panoplie (« La fiche — bientôt »).

## Hors périmètre

Session quiz ou révision **ciblée par notion** (cibles `location.state`, hors v1 ADR-0027) ;
recherche sémantique ; lecture de la file de demandes ; pictogramme animé (point ouvert n°1 de
l'addendum) ; réconciliation de `navigation.md`.
