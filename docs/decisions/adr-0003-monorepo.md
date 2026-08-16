---
id: "0003"
titre: "Monorepo"
type: architecture
statut: accepte
date: null
pr: null
revoque: []        # à remplir à la main — voir annexes/rapport-revocations.md
revoque_par: []
refs: []
---
# ADR-0003 — Monorepo

## Statut

Accepté

## Contexte

Le projet contient deux frontends, un backend, des workers et des packages partagés.

## Décision

Utiliser un monorepo.

## Conséquences

- Documentation centralisée.
- Types partagés.
- Prompts partagés.
- Plus simple pour Claude Code.
