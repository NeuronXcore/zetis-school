# IA — Moteur ELI5

## Objectif

Transformer une notion scolaire en explication simple, puis vérifier que Massimo peut la reformuler.

## Entrées

- matière ;
- niveau ;
- notion ;
- question de Massimo ;
- contexte RAG optionnel ;
- historique de lacunes ;
- mode : simple, exemple, exercice, reverse.

## Sortie ELI5

```json
{
  "title": "Comprendre les nombres relatifs",
  "simple_explanation": "...",
  "analogy": "...",
  "example": "...",
  "common_mistake": "...",
  "check_question": "...",
  "next_action": "reverse_explain"
}
```

## Sortie reverse

```json
{
  "understanding_score": 0,
  "strong_points": [],
  "missing_points": [],
  "misconceptions": [],
  "feedback_for_child": "...",
  "recommended_next_step": "..."
}
```

## Règles pédagogiques

- Ne pas trop simplifier au point d’être faux.
- Ne pas humilier.
- Donner un exemple concret.
- Vérifier par une question.
- Favoriser la reformulation.

## Intégrations

- Créer LearningEvent.
- Mettre à jour SkillMastery.
- Créer Gap si incompréhension répétée.
- Créer Mission si nécessaire.
- Créer SpacedReviewCard si notion importante.
