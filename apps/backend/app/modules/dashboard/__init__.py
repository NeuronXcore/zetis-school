"""Agrégat unique du dashboard Papa (ADR-0028).

Module **composeur** : il ne possède aucune table et ne décide d'aucun statut pédagogique. Il
assemble ce que `activity`, `progress`, `missions`, `memory` et `rag` savent déjà dire, en UNE
réponse non filtrée couvrant les quatre fenêtres (7 / 30 / 90 / 365 jours).

Pourquoi un module à part plutôt qu'une fonction de plus dans `activity` : l'agrégat traverse cinq
domaines. Le loger dans `activity` ferait de ce module le point de dépendance de tout le backend.
"""
