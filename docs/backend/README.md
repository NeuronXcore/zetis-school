# Backend ZETIS — Documentation générale

## Objectif

Le backend est la source de vérité. Il expose l’API, applique les permissions, stocke les données et orchestre les workers IA.

## Structure modules

```txt
modules/
├── auth
├── users
├── school
├── subjects
├── lessons
├── diagnostics
├── quizzes
├── missions
├── progress
├── memory            # révision espacée / SRS (le chantier « spaced_memory » y vit)
├── rag
├── ai
├── capsules
├── mindmaps
└── reports
```

## Règle

Les routes appellent des services. Les services manipulent la logique métier. Les modèles DB restent dans la couche db/modules.

## Tests essentiels

- auth ;
- permissions ;
- calcul XP ;
- mise à jour skill mastery ;
- génération mission depuis lacune ;
- planification spaced review.
