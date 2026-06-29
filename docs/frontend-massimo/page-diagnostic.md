# Page Massimo — Diagnostic

## Objectif

Évaluer les prérequis et notions fragiles sans donner l’impression d’un examen lourd.

Le diagnostic doit être utilisé :

- avant la rentrée ;
- au début de l’année ;
- après quelques semaines ;
- avant les conseils de classe ;
- quand une matière bloque ;
- après une longue pause.

## Positionnement enfant

Ne pas dire : “test de lacunes”.

Dire : “ZETIS vérifie ce qu’il faut renforcer pour t’aider plus vite.”

## Wireframe

```txt
┌──────────────────────────────────────────────────────────────┐
│ Diagnostic ZETIS                                             │
├──────────────────────────────────────────────────────────────┤
│ ZETIS va te poser quelques questions courtes.                │
│ Objectif : savoir quoi réviser en priorité.                  │
│                                                              │
│ Choisis :                                                     │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐           │
│ │ Toutes       │ │ Une matière  │ │ Rapide 10min │           │
│ │ les matières │ │ seulement    │ │              │           │
│ └──────────────┘ └──────────────┘ └──────────────┘           │
│                                                              │
│ [Commencer]                                                  │
└──────────────────────────────────────────────────────────────┘
```

## Pendant le diagnostic

- Une question à la fois.
- Barre de progression.
- Pas d’affichage de note brute immédiate.
- Feedback léger : “réponse enregistrée”.

## Après le diagnostic

Massimo voit :

- 2 ou 3 forces ;
- 2 ou 3 prochaines missions ;
- pas de tableau anxiogène.

Papa voit le détail dans son interface.

## Données API

- `POST /diagnostics/start`
- `GET /diagnostics/{id}`
- `POST /quiz-attempts/{id}/answers`
- `GET /diagnostics/{id}/results`
