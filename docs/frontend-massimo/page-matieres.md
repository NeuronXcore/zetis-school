# Page Massimo — Matières

## Objectif

Permettre à Massimo de choisir une matière et de comprendre rapidement où il en est.

## Matières affichées

- Français
- Mathématiques
- Histoire-Géo
- SVT
- Anglais
- Espagnol
- Physique-Chimie
- Technologie

## Wireframe

```txt
┌──────────────────────────────────────────────────────────────┐
│ Matières                                                     │
├──────────────────────────────────────────────────────────────┤
│ Choisis une matière pour continuer.                          │
│                                                              │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐           │
│ │ Français     │ │ Maths        │ │ Histoire-Géo │           │
│ │ Niveau 5     │ │ Niveau 4     │ │ Niveau 3     │           │
│ │ 2 missions   │ │ 1 mission    │ │ OK           │           │
│ └──────────────┘ └──────────────┘ └──────────────┘           │
│                                                              │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐           │
│ │ SVT          │ │ Anglais      │ │ Espagnol     │           │
│ │ Capsule dispo│ │ Révision     │ │ Mission      │           │
│ └──────────────┘ └──────────────┘ └──────────────┘           │
│                                                              │
│ ┌──────────────┐ ┌──────────────┐                            │
│ │ Phys-Chimie  │ │ Technologie  │                            │
│ └──────────────┘ └──────────────┘                            │
└──────────────────────────────────────────────────────────────┘
```

## Carte matière

Chaque carte affiche :

- nom ;
- icône ;
- couleur ;
- niveau XP matière ;
- missions actives ;
- prochaine révision ;
- progression simplifiée.

## Clic sur une matière

Ouvre une page dédiée : `/subjects/:slug`.

## Données API

- `GET /subjects`
- `GET /progress/subjects`
- `GET /missions?group_by=subject`
