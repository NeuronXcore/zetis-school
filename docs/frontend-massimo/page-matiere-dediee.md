# Page Massimo — Matière dédiée

## Objectif

Quand Massimo clique sur Français, Mathématiques ou une autre matière, il doit arriver sur un espace dédié à cette matière uniquement.

## Exemple : Français

```txt
┌──────────────────────────────────────────────────────────────┐
│ Français                         Niveau 5 · 320 XP           │
├──────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Prochaine étape                                          │ │
│ │ Revoir : les temps du récit                              │ │
│ │ [Lancer ELI5] [Faire quiz]                               │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ │
│ │ Cours      │ │ Quiz       │ │ Mindmap    │ │ Capsule IA │ │
│ └────────────┘ └────────────┘ └────────────┘ └────────────┘ │
│                                                              │
│ Chapitres                                                    │
│ - Lecture et compréhension                                   │
│ - Grammaire                                                  │
│ - Orthographe                                                │
│ - Expression écrite                                          │
└──────────────────────────────────────────────────────────────┘
```

## Sections

### Prochaine étape

Action recommandée par ZETIS pour cette matière.

### Actions rapides

- Lire cours.
- Faire quiz.
- Demander ELI5.
- Voir mindmap.
- Voir capsule.

### Chapitres

Liste de chapitres avec statut :

- prévu ;
- en cours ;
- à renforcer ;
- maîtrisé.

### Notions à renforcer

Liste courte, non culpabilisante.

## Routes

- `/subjects/francais`
- `/subjects/mathematiques`
- `/subjects/histoire-geo`
- `/subjects/svt`
- `/subjects/anglais`
- `/subjects/espagnol`
- `/subjects/physique-chimie`
- `/subjects/technologie`

## Données API

- `GET /subjects/{slug}/overview`
- `GET /subjects/{slug}/chapters`
- `GET /progress/skills?subject_id=`
