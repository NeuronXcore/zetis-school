# Frontend Papa — Documentation générale

## Objectif

Le frontend Papa est le cockpit de pilotage pédagogique. Il doit permettre de comprendre rapidement la situation de Massimo et de décider quoi faire.

## Navigation principale

1. Dashboard
2. Progression
3. Lacunes
4. Missions
5. Diagnostics
6. Conseil de classe IA
7. Cahier de bord IA
8. Années scolaires
9. Matières (hiérarchie persistante matière → thème → chapitre ; le référentiel annuel avec leçons vit dans « Programme »)
10. Sources de cours (upload + validation RAG)
11. Capsules IA
12. Mode focus
13. Paramètres

## Ton UX

- Synthétique.
- Orienté décision.
- Actionnable.
- Graphiques simples.
- Détail au clic.

## Layout

```txt
┌──────────────────────────────────────────────────────────────┐
│ Sidebar Papa │ Header : période / enfant / actions          │
│              ├───────────────────────────────────────────────┤
│              │ Dashboard analytique                          │
│              │ Cartes KPI + alertes + recommandations        │
└──────────────┴───────────────────────────────────────────────┘
```

## Règles

- Les alertes doivent proposer une action.
- Les données doivent être explicables.
- Papa peut valider ou corriger l’IA.
- L’interface ne doit pas être mélangée avec celle de Massimo.
