# IA — Spaced Memory

## Objectif

Transformer chaque apprentissage fragile en révision planifiée.

## Principe

ZETIS doit revoir une notion avant qu’elle soit oubliée. L’intervalle dépend de la réussite, de la difficulté et de la capacité à expliquer.

## Ratings

- Again : échec, revoir très vite.
- Hard : compris difficilement.
- Good : compris normalement.
- Easy : maîtrisé.

## Intervalles MVP

| Rating | Prochain délai |
|---|---:|
| Again | 1 jour |
| Hard | 3 jours |
| Good | 7 jours |
| Easy | 14 jours |

> Implémenté (2026-07-04) dans le module `memory` : `RATING_INTERVALS` +
> `record_attempt`. `ease_factor` existe en colonne (réserve d'évolution ci-dessous)
> mais n'entre PAS dans le calcul MVP. Un 2e passage le même jour est une
> **consolidation** (détectée côté serveur) : planification inchangée, XP réduit.

## Adaptation

À terme, adapter selon :

- matière ;
- difficulté ;
- nombre d’échecs ;
- résultat quiz ;
- ELI5 reverse ;
- temps de réponse.

## Intégration UX

Les révisions apparaissent dans :

- accueil Massimo ;
- missions ;
- page matière ;
- dashboard Papa.
