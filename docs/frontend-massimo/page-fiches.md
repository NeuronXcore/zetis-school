# Page Massimo — Fiches de révision

## Objectif

Chaque **leçon** tient sur **une page** (« fiche ») que Massimo relit avant un contrôle ; il se
constitue un **deck de fiches par matière**. Lecture seule : le serveur ne sert que du contenu
`validated` (ADR-0015). La fiche est un **dérivé du cours canonique** (ADR-0011).

> Une fiche ≠ une flashcard SRS : la fiche synthétise **une leçon entière** (relire) ; la carte
> SRS porte **une notion** (se tester).

## Trois écrans

### 1. Decks par matière (`/fiches`)

Grille `SubjectDeckGrid` (partagée avec ELI5 / Révision) : un deck par matière de l'année active,
**compteur** de fiches validées, badge **« ✨ nouveau »** si une fiche n'a jamais été ouverte,
matière sans fiche → deck grisé « bientôt ». Source : `GET /api/student/fiches/summary`.

### 2. Liste des fiches d'une matière (`/fiches/:slug`)

Une tuile par fiche (chapitre + titre + « ✨ nouveau » si non vue). Source :
`GET /api/student/subjects/{slug}/fiches`. Matière sans fiche → « arrivent bientôt ».

### 3. La fiche

`FicheCard` — rendu **fermé** du `FicheSpec`, sections dans cet ordre (seules celles remplies
s'affichent) :

- ⭐ **L'essentiel** (2–3 phrases)
- 📖 **Les mots à connaître** (définitions, ≤ 4)
- 🔑 **À retenir** (points-clés, ≤ 5)
- ⚠️ **Pièges à éviter** (≤ 3)
- 💡 **Un exemple** (facultatif)

Feuilletage **‹ / ›** entre les fiches de la matière ; ouverture → `POST /seen` (retrait du badge
« nouveau »). Pied : badge de provenance **« 📚 D'après ton cours »** (statique). En haut à droite
de la fiche : bouton **« 📖 Voir le cours »**.

## Cours à côté de la fiche

« 📖 Voir le cours » ouvre le **cours source de la leçon** dans une colonne **à droite, sur la
même page** (`CoursPanel` — pas de superposition ; fiche à gauche / cours à droite en desktop,
empilé en mobile). Réutilise `GET /api/student/lessons/{id}/cours` + `react-markdown`.

## Export A5 (image + impression)

L'app vit dans un shell à scroll interne → l'impression CSS du navigateur donne une page blanche.
On génère donc un **rendu clair A5 dédié** (`FicheA5`), capturé en PNG (`html-to-image`) :

- **🖼️ Image A5** → télécharge `fiche-<titre>.png` (à enregistrer / partager — idéal iPhone).
- **🖨️ Imprimer** → document A5 autonome (`@page size A5`), prêt à imprimer ou « Enregistrer en PDF ».

## Pont SRS

Pied : bouton **« 🃏 Ajouter à mes cartes »** — **stub désactivé** (chantier SRS séparé ; couplage
faible, ADR-0015 §6).

## Wireframe (écran 3, cours ouvert)

```txt
┌─ 🗂️ <Matière> ───────────── Fiche 2/5 · [📖 Voir le cours] [‹] [›] ┐
│ ┌────────── Fiche (gauche) ─────────┐  ┌──── Cours (droite) ─────┐ │
│ │ <Chapitre> · <Titre> · 4ᵉ         │  │ 📚 Ton cours            │ │
│ │ ⭐ L'essentiel                     │  │ # <Titre>               │ │
│ │ 📖 Les mots à connaître            │  │ … markdown du cours …   │ │
│ │ 🔑 À retenir                       │  │                         │ │
│ │ ⚠️ Pièges à éviter                 │  │                         │ │
│ │ 💡 Un exemple                      │  │                         │ │
│ │ 📚 D'après ton cours               │  │                         │ │
│ │ [🃏] [🖼️ Image A5] [🖨️ Imprimer]  │  │                   [✕]   │ │
│ └───────────────────────────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

## Données API (élève, gate `validated`)

- `GET /api/student/fiches/summary` — decks (compteur + `new_count`).
- `GET /api/student/subjects/{slug}/fiches` — deck d'une matière.
- `GET /api/student/fiches/{id}` — la fiche (404 si non validée).
- `POST /api/student/fiches/{id}/seen` — marque vue.
- `GET /api/student/lessons/{id}/cours` — cours source (réutilisé par « Voir le cours »).

Pilotage Papa (génération, éditeur structuré) : voir `API_SPEC.md` § Fiches et
`docs/design/design-system.md` § Pilotage.
