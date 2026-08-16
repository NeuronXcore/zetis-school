---
id: "0033"
titre: "Indicateur d'autonomie de Massimo"
type: mesure
statut: abandonne
date: 2026-08-16
pr: null
revoque: []        # à remplir à la main — voir annexes/rapport-revocations.md
revoque_par: []
refs: ["0011", "0031", "0032", "0034", "0035", "0041"]
---
# ADR-0033 — Indicateur d'autonomie de Massimo

## Statut

**Abandonné — 2026-08-16.** Le sujet a été rendu illégal par quatre décisions postérieures, avant
d'avoir été écrit. **Le numéro 0033 reste réservé et ne sera jamais réattribué.**

> Ce document n'a jamais existé comme décision. Il est écrit aujourd'hui pour une seule raison :
> **cinq documents du registre le citent**, et un numéro cité sans fichier est un trou qui se
> relit indéfiniment. Il ferme le trou en disant ce qui a été décidé *à la place*, et pourquoi
> le sujet ne se rouvre pas.

## Contexte

Le numéro 0033 avait été réservé pour un indicateur, chez Massimo, de l'autonomie avec laquelle
ZETIS travaille. Il apparaît dans le **hors-périmètre** de cinq documents, jamais dans leur
décision :

| Document | Ligne |
|---|---|
| [`adr-0011`](adr-0011-contexte-canonique-partage.md) | *« … missions (ADR-0032) ; l'indicateur d'autonomie de Massimo (ADR-0033). »* |
| [`adr-0031`](adr-0031-production-en-lot-et-journal.md) | *« … événementiel) ; l'indicateur d'autonomie de Massimo (ADR-0033). »* |
| [`adr-0032`](adr-0032-paliers-autonomie-zetis.md) | *« … toujours due) ; l'indicateur d'autonomie de Massimo (ADR-0033) ; A2 et A3, qui ne bougent pas. »* |
| [`adr-0034`](adr-0034-journal-production-et-veto.md) | *« … `trigger='request'` ; l'indicateur d'autonomie de Massimo (ADR-0033) ; toute notification. »* |
| [`adr-0035`](adr-0035-declencheur-automatique-production.md) | *« … l'indicateur d'autonomie de Massimo (ADR-0033) ; les scopes autres que le chapitre. »* |

Le sujet a donc été **repoussé cinq fois de suite**, jamais tranché. Entre-temps, l'arc
d'autonomisation a écrit sa doctrine — et cette doctrine l'a fermé.

## Décision

**Le sujet est abandonné. Aucun ADR-0033 ne sera écrit.**

Quatre décisions, toutes postérieures aux réservations ci-dessus, l'interdisent — non pas par
oubli, mais chacune par une clause explicite :

| Source | Ce qu'elle interdit |
|---|---|
| [`adr-0032` §6](adr-0032-paliers-autonomie-zetis.md) — *Ce que le panneau ne fera jamais* | *« **Aucune surface côté Massimo.** Lui montrer le palier, ce serait lui apprendre qu'un contenu peut disparaître — et rendre l'invariant V1 impossible. »* |
| [`adr-0034` §9](adr-0034-journal-production-et-veto.md) — *Ce que le Journal ne fera jamais* | *« **Aucune surface côté Massimo**, et aucun signal quand une pièce disparaît (V1). »* |
| [`adr-0035` §8](adr-0035-declencheur-automatique-production.md) — *Ce que ce chantier ne fera jamais* | *« **Aucune surface côté Massimo.** Il ne doit pas apprendre que du contenu apparaît tout seul — même invariant V1 que l'ADR-0032 §6. »* |
| [`adr-0041` §12](adr-0041-tout-ce-qui-produit-se-voit.md) — *Massimo ne voit rien, et ce n'est pas une omission* | *« Une production déclenchée par une demande de Massimo s'affiche **chez Papa uniquement**… lui montrer que du contenu se prépare serait une PROMESSE, donc une relance. »* |

Les quatre convergent sur le même invariant — **V1 : Massimo n'apprend pas que du contenu apparaît
ou disparaît tout seul.** Un indicateur d'autonomie *est* précisément cette révélation : il n'y a
pas de version atténuée qui survive aux quatre clauses. Le sujet n'est pas « reporté encore une
fois », il est **sans objet**.

### Le numéro reste réservé

`0033` n'est jamais réattribué à une autre décision. Les cinq renvois ci-dessus continuent de
résoudre vers ce fichier, et y lisent pourquoi ce qu'ils écartaient a cessé d'exister. Réutiliser
le numéro ferait pointer cinq hors-périmètre vers un sujet qui n'a rien à voir avec eux.

## Périmètre

**Ce document ne décide rien de neuf.** Il enregistre un abandon et cite quatre décisions déjà
prises. Il ne rouvre ni l'invariant V1, ni aucune clause des ADR-0032, ADR-0034, ADR-0035 et
ADR-0041. Les réservations de l'ADR-0011 et de l'ADR-0031 restent lettre pour lettre : ce qu'elles
écartaient est désormais écarté pour de bon.

**Hors périmètre** : la lisibilité de l'autonomie **chez Papa**, qui est traitée et vivante — voir
l'[`adr-0032` **Amendement 1**](adr-0032-paliers-autonomie-zetis.md) (l'état de ZETIS en sidebar) et
l'[`adr-0034`](adr-0034-journal-production-et-veto.md) (le Journal). Rien de ce qui est abandonné
ici ne concerne l'interface adulte.

## Conséquences

### Positives

- Un numéro cité par cinq documents cesse d'être un trou. `check_adr_refs.sh` passe au vert sans
  qu'on ait retiré la citation d'un seul document.
- L'invariant V1 gagne un point de lecture unique : quatre clauses éparses sont réunies ici.

### Négatives / coûts assumés

- **Un ADR écrit uniquement pour refermer un trou.** C'est un coût réel, et il est accepté : la
  seule autre issue était de retirer `ADR-0033` des cinq documents, ce qui aurait effacé la trace
  qu'un sujet avait été envisagé cinq fois puis rendu impossible.
- Le fichier porte `type: mesure`, classification préparée dans `scripts/gen_frontmatter.py`
  **avant** que le sort du sujet soit connu. Elle est conservée telle quelle : la reclasser
  maintenant reviendrait à ranger a posteriori une décision qui n'a jamais eu lieu.

## Suivi

Aucun. Un abandon ne se suit pas — il se relit si quelqu'un rouvre la question, et les quatre
clauses ci-dessus sont la réponse.
