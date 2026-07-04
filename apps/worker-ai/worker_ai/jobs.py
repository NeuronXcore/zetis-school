"""Tâche RQ `generate_lesson_cards` : (re)génération des cartes SRS d'une leçon (ADR-0013).

Enfilée par le backend via `enqueue("worker_ai.jobs.generate_lesson_cards", lesson_id)` à la
validation d'une leçon. Le backend ne fait que la mettre en file ; l'appel LLM local
(Ollama) et l'upsert des cartes vivent ici, via le point d'entrée backend
`run_lesson_card_generation` (qui ouvre sa propre session + ses providers). La traçabilité
fine — un `ai_jobs` `srs_cards_generate` par notion — est déjà posée côté backend.
"""

from app.modules.memory import generation


def generate_lesson_cards(lesson_id: int) -> dict:
    """Génère/rafraîchit les cartes de la leçon ; renvoie le compte-rendu (logs RQ).

    Une exception (LLM/DB indisponible) remonte volontairement : RQ marque le job échoué,
    sans jamais affecter la validation de leçon déjà committée côté backend (découplage §1).
    """
    result = generation.run_lesson_card_generation(lesson_id)
    return {"lesson_id": lesson_id, **result}
