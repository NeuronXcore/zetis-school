# Page Papa — Conseil de classe IA

## Objectif

Produire une synthèse périodique par matière, comme un mini conseil de classe personnalisé.

## Sections

- Résumé global.
- Synthèse par matière.
- Points forts.
- Points fragiles.
- Évolution récente.
- Recommandations.
- Plan d’action.

## Wireframe

```txt
┌──────────────────────────────────────────────────────────────┐
│ Conseil de classe IA                                         │
├──────────────────────────────────────────────────────────────┤
│ Période : Trimestre 1                                        │
│ [Générer synthèse] [Exporter Markdown]                       │
│                                                              │
│ Français                                                     │
│ Points forts : lecture plus régulière                        │
│ À renforcer : temps du récit, justification des réponses     │
│ Action : 2 missions courtes + 1 ELI5 reverse                 │
│                                                              │
│ Mathématiques                                                │
│ Points forts : calcul mental en progrès                      │
│ À renforcer : nombres relatifs                               │
└──────────────────────────────────────────────────────────────┘
```

## Données API

- `POST /ai/reports/class-council`
- `GET /reports/class-council?period=`
