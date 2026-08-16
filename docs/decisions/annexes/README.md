# `docs/decisions/annexes/` — les pièces à conviction

## Ce qui a le droit de vivre ici

**Une pièce à conviction rattachée à une décision, et rien d'autre.**

Une pièce à conviction, c'est une **mesure** qui a tranché un ADR et que l'ADR ne peut pas
absorber sans devenir illisible : un rapport de banc, un relevé de base, un export d'audit. Elle
répond à une question et à une seule — *sur quoi la décision reposait-elle ?*

Trois conditions cumulatives :

1. **Elle est citée par un ADR**, nommément, avec son chemin.
2. **Elle est figée.** On ne la régénère pas par-dessus : un nouveau relevé est un nouveau
   fichier daté. Une pièce qu'on réécrit cesse de prouver ce qu'elle prouvait.
3. **Elle porte sa date dans son nom.**

## Ce qui n'a PAS le droit d'y vivre

- ❌ **Un ADR.** Les décisions vivent dans `docs/decisions/`. Un fichier d'annexe ne porte
  **jamais** le préfixe `adr-` — il se lirait comme une décision de plus, et il fausserait le
  compte du registre. *(C'est arrivé : le rapport de banc T4 a porté ce préfixe du 2026-07-27 au
  2026-08-16.)*
- ❌ **Un brouillon, une note de session, un reste de chantier.** Ça vit dans `MEMORY.md` tant
  que c'est actif, et ça disparaît quand ça ne l'est plus.
- ❌ **Ce qu'on ne sait pas où ranger.** C'est le seul vrai danger de ce dossier.

> ⚠️ **Le motif à ne pas rejouer.** `WORKFLOW.md` §5 raconte comment `MEMORY.md` s'est mis à
> servir de cimetière à dettes : *« ce qu'on ne savait pas où ranger y tombait, et devenait
> invisible à la reprise suivante »* — 2 227 lignes d'historique pour 122 lignes d'actif. Un
> dossier sans critère d'entrée finit toujours ainsi. C'est pourquoi ce fichier existe.

## Contenu actuel

| Fichier | Nature | Rattaché à | Sort |
|---|---|---|---|
| `bench-t4-curriculum-2026-07-03.md` | Rapport de `bench_llm.py --curriculum --repeats 3`, commit `b40cb9b`. A tranché le §7 (local / cloud / hybride) et fondé la dérogation `curriculum_*` | ADR-0009 (addendum du 2026-07-03) | **Permanent.** Ne pas régénérer par-dessus : tout re-run utilise un `--out` daté |
| `statuts-en-attente-2026-08-06.md` | Mémo sur les ADR restés « Proposé » alors que leur code est mergé. Pose la distinction **livré ≠ ratifié** | le registre entier | **Temporaire.** Se supprime quand le front-matter portera `livre_le` et `pr` — les faits seront dans les fichiers, seule la ratification restera un geste humain |

⚠️ Le mémo des statuts **est déjà partiellement périmé** : écrit le 2026-08-06, il annonce 16
« Proposé » ; il y en a 27 au 2026-08-16. Il garde toute sa valeur d'argument, aucune de compte.
