# Mémo — les quinze ADR restés « Proposé »

> Écrit le 2026-08-06, à la fin de la session qui a remis `DECISIONS.md` en ordre.
> **Ce mémo ne tranche rien.** Il rassemble ce que le dépôt permet d'affirmer, pour que
> la décision se prenne sans avoir à tout re-fouiller. Il est écrit pour un lecteur sans
> contexte : il ne suppose pas que la session soit encore en mémoire.

## La question

Quinze ADR portent le statut « Proposé ». Leur code est **mergé sur `main`** — les quinze,
sans exception, preuve par PR plus bas. La question n'est donc pas « est-ce fait ? » mais
**« est-ce ratifié ? »**, et les deux ne sont pas le même acte dans ce projet.

Tout le reste de l'index a été aligné pendant la session : index et fichiers d'ADR disent
désormais la même chose partout (0 divergence sur 70 fichiers). Ces quinze-là sont le seul
endroit où le dépôt ne peut pas répondre à la place de l'humain — précisément parce
qu'index et fichier sont **d'accord entre eux** pour dire « Proposé ». Aucune incohérence
formelle ne les signale plus ; seul ce mémo les garde visibles.

## Pourquoi c'est un jugement et pas une vérification

`MEMORY.md` dit de l'arc d'autonomisation : *« rien n'est armé en dev, c'est volontaire »*.
C'est l'argument qui a retenu ma main. **Mais cette phrase est aujourd'hui imprécise sur
deux points**, vérifiés dans le code le 2026-08-06 :

| ce que dit le code | fichier |
|---|---|
| `VETO_SURFACE_AVAILABLE = True` | `apps/backend/app/modules/settings/service.py:56` |
| `AUTO_TRIGGER_DEFAULT = False` | `service.py:261` |

Le **veto est branché** — c'était la condition d'ouverture que l'ADR-0032 s'était posée
(« le palier 3 n'existe pas sans veto branché »), et l'ADR-0034 l'a livrée. Ce qui reste
désarmé, c'est le **déclencheur automatique**, pas le dispositif.

Et les six classes d'autonomie ne sont pas toutes au repos (`service.py:85-146`) :

| classe | défaut | lecture |
|---|---|---|
| A0a dérivés | `SERVE` | **palier 3 — autonome** |
| A0b cartes SRS | `SERVE` | **palier 3 — autonome** |
| A1 cours | `VALIDATE` | palier 2 — le dernier gate humain, tenu |
| A2 référentiel | `PROPOSE` | palier 1 |
| A3 missions | `VALIDATE` | palier 2 |
| A4 terminal | `NEVER` | palier 0 |

C'est exactement le constat que l'ADR-0032 formulait sur elle-même : *« il est au palier 3
pour les dérivés sans l'avoir choisi »*. Autrement dit : **le dispositif tourne déjà, en
régime intermédiaire, avec son garde-fou en place et son démarrage automatique coupé.**

Voilà pourquoi c'est un jugement. « Proposé » peut vouloir dire deux choses ici, et le
dépôt ne dit pas laquelle :

- **« pas encore ratifié »** → les quinze passent Accepté, et l'index cesse de faire croire
  que quinze décisions livrées sont réouvrables ;
- **« ratifié quand ce sera armé »** → ils restent Proposé, et le statut devient le
  marqueur du moment où le déclencheur s'allumera.

La seconde lecture a un coût qu'il vaut mieux nommer : elle fait porter au champ « statut »
une information (*l'armement*) qu'il n'a jamais portée ailleurs dans le dépôt, où il ne
signifie que *la décision est-elle figée*. Deux réponses à une seule question — le mal que
le §G.1 a évité en refusant une colonne `authority`, et que le §2 de l'ADR-0032 a évité en
refusant de stocker le préréglage.

## Les quinze, et leur preuve

Toutes vérifiées le 2026-08-06 : fichier ADR et entrée d'index disent « Proposé », code
présent et suivi par git sur `main`.

### Arc d'autonomisation — douze

| ADR | PR | commit | date |
|---|---|---|---|
| `adr-0011-contexte-canonique-partage` (Amendement 3) (§G) | cadrage seul | `5441af7` | 2026-08-02 |
| `adr-0031-production-en-lot-et-journal` | #68 | `731394b` | 2026-08-02 |
| `adr-0031-production-en-lot-et-journal` (Amendement 1) | #68 | `731394b` | 2026-08-02 |
| `adr-0032-paliers-autonomie-zetis` | #69 | `b8f2a02` | 2026-08-02 |
| `adr-0034-journal-production-et-veto` | #70 | `4d3fc99` | 2026-08-03 |
| `adr-0034-journal-production-et-veto` (Amendement 1) | #80 | `294d0d5` | 2026-08-04 |
| `adr-0034-journal-production-et-veto` (Amendement 2) | #81 | `e940ba3` | 2026-08-04 |
| `adr-0035-declencheur-automatique-production` | #71 | `c4f5e31` | 2026-08-03 |
| `adr-0035-declencheur-automatique-production` (Amendement 1) | #71 | `c4f5e31` | 2026-08-03 |
| `adr-0036-demande-vers-production` | #72 | `eff83cb` | 2026-08-03 |
| `adr-0036-demande-vers-production` (Amendement 1) | #80 | `294d0d5` | 2026-08-04 |
| `adr-0037-lecon-canonique-d-une-notion` | #73 | `8447382` | 2026-08-04 |

⚠️ Deux attributions sont **inférées du sujet du commit, pas écrites dedans** :
`regime-et-destination` et `verdict-de-situation`, tous deux rattachés à la PR #80 (« la
production dit ce qu'elle a fait, et pourquoi elle ne l'a pas fait » — son corps mentionne
l'addendum ADR-0034 §1bis). Le code des deux est bien sur `main` ; c'est le numéro de PR
qui mériterait confirmation, pas le fait du merge.

Artefacts de code vérifiés pour cet arc : module `production`, `ProductionRun`,
`PRODUCTION_MAX_PENDING`, `select_notions`, `parent_rule`, `authority_for`, les six clés
et `/api/settings/autonomy`, `production_events`, `lesson_views`, `VetoRemoval`,
`journalFilters`, `scan_triggers`, `zetis_auto_trigger_enabled`, `eligible_items`,
`TRIGGERING_KINDS`, `scope_skill_id`, `ZETIS_REQUEST_MAX_RUNS`,
`modules/lesson_resolution.py` (dont le docstring nomme l'ADR-0037).

### Hors arc — trois

Ces trois-là n'ont **rien à voir avec l'autonomisation**. L'argument « rien n'est armé » ne
les couvre pas, et le recensement de la session de cadrage les avait manquées — c'est
pour elles que la décision est la plus simple.

| ADR | PR | commit | date | remarque |
|---|---|---|---|---|
| `adr-0026-chat-zetis-memoire` | — | `468dae7` | — | module `chat` complet sur `main` |
| `adr-0026-chat-zetis-memoire` (Amendement 1) | #66 | `e1d1b06` | 2026-08-02 | `MEMORY.md` le dit mergé |
| `adr-0028-dashboard-papa-agregat-unique` (Amendement 2) | #90 | `392b075` | 2026-08-05 | 5ᵉ KPI livré ; frère des quatre addenda ADR-0028 déjà passés Accepté cette session |

`adr-0028-dashboard-papa-agregat-unique` (Amendement 2) est le cas le plus net : ses quatre frères
(`analyse-par-matiere`, `memoire-quatre-vues`, `cartes-focalisables`, plus l'ADR-0028
elle-même) sont désormais Accepté, mergés dans la même série de PR #83→#91. Seul lui reste
Proposé, et rien ne l'en distingue sinon d'avoir été oublié par le recensement.

## Ce qui tombe avec la décision

**L'incohérence `adr-0032`.** Elle est « Proposé » pendant que ses **deux addenda** (§7
sidebar et §8 ZETIS LEVELS) sont « Accepté » depuis le 2026-08-04. Un parent moins avancé
que ses enfants est intenable dans les deux lectures ci-dessus : si l'arc n'est pas
ratifié, les addenda n'auraient pas dû l'être ; s'il l'est, le parent doit suivre. Cette
incohérence-là ne demande pas d'arbitrage sur le fond — seulement que le fond soit tranché.

## Pour appliquer, le moment venu

Le geste est le même que celui joué douze fois pendant la session : **deux endroits par
ADR**, jamais un seul.

1. l'entrée dans `DECISIONS.md` — remplacer `— Proposé (date)` en fin de prose d'entrée
   (⚠️ *fin de prose*, pas fin de bloc : `adr-0017` a montré qu'une sous-puce finale
   trompe la détection, et plusieurs entrées coupent leur statut sur deux lignes) ;
2. la déclaration dans `docs/decisions/<slug>.md` — section `## Statut` pour 63 fichiers,
   ligne `> Statut : **…**` en entête pour les 7 addenda destinés à être concaténés à leur
   parent (leur y mettre un titre de niveau 2 serait une faute : après concaténation il se
   lirait comme une redéfinition du statut du parent).

Puis revérifier :

```bash
python3 scripts/reorder_decisions.py DECISIONS.md
```

Il doit rapporter `déplacées 0` et `0 addenda restés au premier niveau`.

## État de l'index au moment où ce mémo est écrit

71 entrées · trié par numéro · 672 lignes · 70/70 fichiers référencés, aucun lien cassé,
aucun orphelin · **54 Accepté · 16 Proposé · 1 Remplacé · 0 sans statut** · 0 divergence
index ↔ fichier.

Les 16 « Proposé » sont les quinze de ce mémo **plus l'ADR-0040**, qui est légitimement
Proposé : cadrée le 2026-08-06, pas encore implémentée.
