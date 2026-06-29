# IA ZETIS — Vue générale

## Objectif

L’IA de ZETIS n’est pas un gadget. Elle doit aider à diagnostiquer, expliquer, entraîner, reformuler, générer des supports et planifier les révisions.

## Modules IA

- ELI5.
- ELI5 reverse.
- Génération quiz.
- Diagnostic.
- RAG.
- Spaced memory.
- Génération missions.
- Cahier de bord.
- Conseil de classe IA.
- Capsules IA.
- Mindmaps.

## Règle fondamentale

Toute sortie IA importante doit être :

- traçable ;
- versionnée ;
- éventuellement validable ;
- reliée à une notion ;
- reliée à une matière ;
- stockée si elle influence la progression.

## Providers

Créer une abstraction pour ne pas enfermer le projet dans un provider.

## Prompts

Les prompts doivent être stockés dans `packages/prompts` ou `prompts/runtime`, pas dispersés dans le code.
