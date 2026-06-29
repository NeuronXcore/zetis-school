# CONTRIBUTING.md — Règles de contribution

## Objectif

Maintenir le projet ZETIS lisible, stable et cohérent avec la vision pédagogique.

## Avant de coder

Lire :

1. `CLAUDE.md` ;
2. le fichier racine concerné ;
3. le document `docs/` correspondant ;
4. le prompt Claude Code si utilisé.

## Style frontend

- TypeScript strict.
- Composants petits.
- Props typées.
- Pas de duplication de logique API.
- Hooks dédiés.
- UI responsive.
- Accessibilité minimale.

## Style backend

- Routes fines.
- Services métier séparés.
- Pydantic pour schemas.
- Tests avec pytest.
- Erreurs explicites.
- Logs structurés.

## Commits

Format recommandé :

```txt
feat(massimo): add ELI5 page skeleton
fix(api): protect parent routes
refactor(ai): move prompts to package
```

## Tests

Avant de considérer une tâche terminée :

- typecheck frontend ;
- lint ;
- tests backend ;
- au moins test manuel du parcours touché.

## Documentation

Toute fonctionnalité structurante doit mettre à jour :

- documentation module ;
- API spec si route modifiée ;
- data model si table modifiée ;
- backlog si statut changé.

## Décisions importantes

Créer un ADR dans `docs/decisions/` pour :

- changement de stack ;
- ajout gros service ;
- modification architecture ;
- choix provider IA ;
- stratégie accès distant.

## Définition de terminé

Une tâche est terminée si :

- le code fonctionne ;
- les tests essentiels passent ;
- l’UI est cohérente ;
- les données persistent si nécessaire ;
- les permissions sont respectées ;
- la documentation est à jour ;
- les limites connues sont listées.
