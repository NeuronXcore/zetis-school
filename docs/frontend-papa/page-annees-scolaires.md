# Page Papa — Années scolaires

## Objectif

Permettre de gérer les années de scolarité : créer une année, paramétrer les matières, choisir le mode IA.

## Modes

### Full IA

ZETIS propose une structure complète d’année : matières, chapitres, diagnostics, missions initiales. Papa valide.

### Hybride

ZETIS propose, Papa ajuste.

### Manuel

Papa configure directement.

## Wireframe

```txt
┌──────────────────────────────────────────────────────────────┐
│ Années scolaires                                             │
├──────────────────────────────────────────────────────────────┤
│ Année active : 2026-2027 · 4e                                │
│ Mode : Hybride                                               │
│                                                              │
│ [Créer année] [Importer programme] [Générer avec IA]          │
│                                                              │
│ Paramètres généraux                                          │
│ - Dates                                                      │
│ - Niveau                                                     │
│ - Objectifs                                                  │
│ - Rythme                                                     │
│                                                              │
│ Matières                                                     │
│ Français, Maths, Histoire-Géo, SVT...                        │
└──────────────────────────────────────────────────────────────┘
```

## Données API

- `GET /school-years`
- `POST /school-years`
- `PATCH /school-years/{id}`
- `POST /school-years/{id}/ai-generate-plan`
