# Prompt Claude Code — Moteur ELI5

Lis `docs/ai/eli5-engine.md`, `API_SPEC.md` et `DATA_MODEL.md`.

Implémente :

- endpoint `POST /ai/eli5/explain` ;
- endpoint `POST /ai/eli5/reverse-evaluate` ;
- prompt versionné ;
- schéma JSON de sortie ;
- stockage LearningEvent ;
- mise à jour SkillMastery mockée ou simple ;
- tests avec provider IA mock.

Ne pas exposer la clé IA au frontend.
