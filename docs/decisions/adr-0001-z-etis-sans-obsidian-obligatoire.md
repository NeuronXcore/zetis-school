---
id: "0001"
titre: "ZETIS sans Obsidian obligatoire"
type: architecture
statut: accepte
date: null
pr: null
revoque: []        # à remplir à la main — voir annexes/rapport-revocations.md
revoque_par: []
refs: []
---
# ADR-0001 — ZETIS sans Obsidian obligatoire

## Statut

Accepté

## Contexte

Obsidian est utile pour la pensée, les notes et les MOC, mais il ne doit pas être une dépendance fonctionnelle de l’application.

## Décision

ZETIS utilise PostgreSQL comme source de vérité, MinIO pour les fichiers et pgvector pour le RAG. Obsidian peut être utilisé en export/import optionnel.

## Conséquences

- L’app est autonome.
- Les données sont structurées.
- Les exports Markdown restent possibles.
- Le développement est plus propre pour Claude Code.
