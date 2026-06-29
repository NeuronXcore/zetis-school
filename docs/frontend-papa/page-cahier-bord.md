# Page Papa — Cahier de bord IA

## Objectif

Conserver une trace lisible de ce qui s’est passé : apprentissages, difficultés, décisions, contenus générés.

## Événements

- session terminée ;
- quiz réussi/échoué ;
- lacune détectée ;
- lacune résolue ;
- mission créée ;
- capsule générée ;
- contenu validé ;
- note parent.

## Wireframe

```txt
┌──────────────────────────────────────────────────────────────┐
│ Cahier de bord IA                                            │
├──────────────────────────────────────────────────────────────┤
│ Filtres : [Matière] [Période] [Type événement]               │
│                                                              │
│ 29/06 — Maths                                                │
│ Diagnostic court : difficulté sur comparaison de négatifs.   │
│ Action proposée : mission + ELI5 reverse.                    │
│                                                              │
│ 28/06 — Français                                             │
│ Mission terminée : temps du récit. Score 72%.                │
└──────────────────────────────────────────────────────────────┘
```

## Données API

- `GET /learning-events`
- `POST /parent/notes`
- `POST /ai/reports/journal-summary`
