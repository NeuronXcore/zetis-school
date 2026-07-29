# Frontend Papa — Documentation générale

## Objectif

Le frontend Papa est le cockpit de pilotage pédagogique. Il doit permettre de comprendre rapidement la situation de Massimo et de décider quoi faire.

## Navigation principale

1. Dashboard
2. Agenda (ADR-0025 — surface de **saisie**, placée près du Dashboard : en phase 0 Papa est la
   seule source d'items et vient y écrire de façon répétée. Ni dans le Dashboard, ni dans le
   Cahier de bord. **Aucune case à cocher** : seul Massimo coche)
3. Progression
4. Lacunes
5. Missions
6. Diagnostics
7. Conseil de classe IA
8. Cahier de bord IA
9. Années scolaires
10. Matières (hiérarchie persistante matière → thème → chapitre ; le référentiel annuel avec leçons vit dans « Programme »)
11. Sources de cours (upload + validation RAG)
12. Capsules IA
13. Mode focus
14. Paramètres

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
