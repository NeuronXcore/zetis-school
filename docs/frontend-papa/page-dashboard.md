# Page Papa — Dashboard

## Objectif

Afficher en une page l’état pédagogique actuel.

## Wireframe

```txt
┌──────────────────────────────────────────────────────────────┐
│ Dashboard Papa                      Semaine du 29/06/2026    │
├──────────────────────────────────────────────────────────────┤
│ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ │
│ │ Sessions   │ │ XP semaine │ │ Lacunes    │ │ Missions   │ │
│ │ 4          │ │ +180       │ │ 5 ouvertes │ │ 3 terminées│ │
│ └────────────┘ └────────────┘ └────────────┘ └────────────┘ │
│                                                              │
│ Alertes prioritaires                                         │
│ - Maths : nombres relatifs à renforcer                       │
│ - Français : temps du récit à revoir                         │
│                                                              │
│ Recommandations ZETIS                                        │
│ [Créer mission] [Générer capsule] [Lancer diagnostic court]   │
└──────────────────────────────────────────────────────────────┘
```

## KPI

- sessions semaine ;
- temps actif ;
- missions terminées ;
- XP ;
- lacunes ouvertes ;
- notions consolidées ;
- prochaine révision.

## Données API

- `GET /parent/dashboard`
- `GET /progress/summary`
- `GET /gaps?status=open`
- `GET /missions?status=active`
