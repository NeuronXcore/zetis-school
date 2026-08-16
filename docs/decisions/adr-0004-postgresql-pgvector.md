---
id: "0004"
titre: "PostgreSQL + pgvector"
type: architecture
statut: accepte
date: null
pr: null
revoque: []        # à remplir à la main — voir annexes/rapport-revocations.md
revoque_par: []
refs: []
---
# ADR-0004 — PostgreSQL + pgvector

## Statut

Accepté

## Contexte

ZETIS a besoin de données relationnelles et de recherche vectorielle.

## Décision

Utiliser PostgreSQL pour la base principale et pgvector pour les embeddings RAG.

## Conséquences

- Moins de services à maintenir.
- Suffisant pour MVP.
- Évolution possible vers Qdrant ou Weaviate si besoin.
