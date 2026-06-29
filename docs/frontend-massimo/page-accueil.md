# Page Massimo — Accueil

## Objectif

Donner à Massimo un point d’entrée simple : quoi faire maintenant, pourquoi, et quelle récompense il peut obtenir.

## Wireframe

```txt
┌──────────────────────────────────────────────────────────────┐
│ ZETIS        Bonjour Massimo 👋       Niveau 7 · 1240 XP     │
├────────────┬─────────────────────────────────────────────────┤
│ Accueil    │ ┌─────────────────────────────────────────────┐ │
│ Matières   │ │ Mission du jour                            │ │
│ Cours      │ │ Renforcer les nombres relatifs              │ │
│ Diagnostic │ │ 15 min · +60 XP · Mathématiques             │ │
│ ELI5       │ │ [Commencer]                                 │ │
│ Capsules   │ └─────────────────────────────────────────────┘ │
│ Missions   │                                                 │
│ Quiz       │ ┌─────────────┐ ┌─────────────┐ ┌────────────┐ │
│ Progression│ │ Révision    │ │ Capsule IA  │ │ ELI5 rapide│ │
│ Mindmaps   │ │ 3 cartes    │ │ SVT 4 min   │ │ Une notion │ │
│ Chat       │ └─────────────┘ └─────────────┘ └────────────┘ │
│            │                                                 │
│            │ ┌─────────────────────────────────────────────┐ │
│            │ │ Message ZETIS                               │ │
│            │ │ Aujourd’hui, on fait court mais efficace.   │ │
│            │ └─────────────────────────────────────────────┘ │
└────────────┴─────────────────────────────────────────────────┘
```

## Sections

### Header

- Bonjour Massimo.
- Niveau global.
- XP.
- Avatar ZETIS.

### Mission du jour

Carte principale avec :

- titre ;
- matière ;
- durée estimée ;
- XP ;
- bouton commencer ;
- raison simple : “parce que cette notion revient bientôt”.

### Raccourcis

- Révision rapide.
- Capsule IA.
- ELI5.
- Continuer un cours.

### Message ZETIS

Message court, bienveillant, contextualisé.

## États

### Aucune mission

Afficher : “Tu n’as rien d’obligatoire maintenant. Tu peux choisir une matière ou faire une révision rapide.”

### Mission en retard

Ne pas culpabiliser. Dire : “On reprend tranquillement.”

### Très bonne progression

Valoriser : “Tu as consolidé 3 notions cette semaine.”

## Données API

- `GET /missions/today`
- `GET /progress/summary`
- `GET /progress/xp`
- `GET /spaced-reviews/due`
