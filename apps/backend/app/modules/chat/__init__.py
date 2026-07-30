"""Module chat ZETIS (ADR-0026) — substrat de mémoire éphémère.

Le verbatim vit dans Redis (`store.py`), jamais en base. Le chat n'a pas de mémoire propre : il
écrit trois `learning_events` typés dans le journal commun (`service.py`). Zéro table, zéro
migration.
"""
