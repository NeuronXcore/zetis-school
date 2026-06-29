# Page Massimo — Mindmaps

## Objectif

Utiliser les cartes mentales comme outil de compréhension et de restitution.

## Deux usages

### Mindmap remplie

ZETIS affiche une carte complète pour comprendre la notion.

### Training restitution

Massimo doit reproduire la carte point par point.

## Méthode pédagogique

La mindmap est pertinente si elle oblige Massimo à organiser l’information :

- idée centrale ;
- branches principales ;
- exemples ;
- erreurs à éviter ;
- liens entre notions.

## Wireframe

```txt
┌──────────────────────────────────────────────────────────────┐
│ Mindmaps                                                     │
├──────────────────────────────────────────────────────────────┤
│ Notion : Nutrition végétale                                  │
│ [Voir carte complète] [Mode entraînement]                    │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │                    Nutrition végétale                    │ │
│ │                 /       |        \                       │ │
│ │             Eau     Lumière     CO2                      │ │
│ │              |          |        |                       │ │
│ │           racines   énergie   feuilles                   │ │
│ └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

## Données API

- `POST /mindmaps/generate`
- `GET /mindmaps/{id}`
- `POST /mindmaps/{id}/attempts`
- `POST /mindmaps/{id}/evaluate`
