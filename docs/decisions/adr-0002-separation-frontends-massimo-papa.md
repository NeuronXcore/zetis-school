---
id: "0002"
titre: "Séparation frontends Massimo et Papa"
type: architecture
statut: accepte
date: null
pr: null
revoque: []        # à remplir à la main — voir annexes/rapport-revocations.md
revoque_par: []
refs: []
---
# ADR-0002 — Séparation frontends Massimo et Papa

## Statut

Accepté

## Contexte

Massimo a besoin d’une interface enfant orientée apprentissage. Papa a besoin d’une interface de pilotage.

## Décision

Créer deux apps frontend séparées : `apps/frontend-massimo` et `apps/frontend-papa`.

## Conséquences

- UX plus claire.
- Permissions plus simples.
- Développement mieux organisé.
- Possibilité d’adapter Massimo mobile plus facilement.
