# Addendum ADR-0059 — §18 · La production était déjà propre

## Statut

**Accepté (2026-08-15)** — constat d'exécution, pas cadrage.

> ⚠️ Écart assumé avec la convention du dépôt, où un addendum naît **Proposé**, « cadré sur `main`,
> sans une ligne de code ». Celui-ci ne propose rien à construire : il **acte une vérification déjà
> faite**, sur une base réelle. Le naître « Proposé » suggérerait un travail à venir qui n'existe
> pas.

> **Ne révoque rien.** Le §18 reste entier : la règle *« aucun `ai_jobs` ne porte un TEXTE de
> Massimo »*, la reformulation de l'`adr-0026` §1c, le choix d'effacer **la clé et non la ligne**,
> et le test-verrou n°1 du §Suivi tiennent tous sans changement. Cet addendum ne modifie pas une
> décision : il **clôt une réserve d'exécution** que le §18 avait laissée ouverte faute de pouvoir
> l'exercer, et consigne ce que l'exercice a appris.

## Ce que le §18 laissait ouvert

Le §18 se termine par :

> ⚠️ **La production reste à traiter** — le script est fait pour ça, bilan par défaut et écriture
> sur `--apply` seulement.

Cette phrase était vraie le jour où elle a été écrite : aucune pile de production n'était joignable
pendant la session de livraison. Elle est **fausse depuis le 2026-08-15 au soir**.

## Ce qui a été mesuré

Bilan passé sur la base de production (`docker-compose.prod.yml`, projet compose `zetis-prod`,
volume `zetis-prod_postgres_data`), en lecture seule, sans `--apply` :

```
Base    : postgres:5432/zetis
Mode    : bilan seul (ajoutez --apply pour écrire)
Clé     : 'transcript', dans output_json et input_json

✅ Rien à effacer : aucune ligne d'`ai_jobs` ne porte de texte de Massimo.
```

**Aucun `--apply` n'a été nécessaire.** La production n'a jamais porté de verbatim.

### Pourquoi — la raison est vérifiée, pas supposée

`eli5_transcribe` **n'existe pas** dans les `ai_jobs` de la production. Ses 113 lignes se
répartissent sur 10 `job_type` :

| `job_type` | lignes |
|---|---|
| `lesson_content` | 37 |
| `curriculum_lessons` · `curriculum_chapters` · `curriculum_skills_backfill` | 21 · 9 · 4 |
| `capsule_voice` · `capsule_render` · `capsule_generate` | 17 · 4 · 4 |
| `eli5_explain` | 12 |
| `diagnostic_generate` | 4 |
| `eli5_reverse` | 1 |

La dictée n'a jamais été exercée contre cette pile. La fuite décrite au §18 **n'y a jamais eu
lieu** — elle n'y a pas été réparée, elle n'a pas existé.

### 🔴 Le vert a été corroboré, pas cru sur parole

« Rien à effacer » et « table vide » produisent le **même message**. La table a donc été comptée
séparément : **113 lignes, dont 103 avec un `output_json` non nul**. Le bilan a inspecté une table
peuplée. Sans ce contrôle, le résultat aurait eu exactement la forme d'un faux-vert — le motif que
le §Suivi de l'ADR-0059 nomme lui-même en tête (« le dépôt recense plusieurs verrous verts sur un
sabotage »).

## 🔴 Ce que cette réserve apprend, au-delà d'elle-même

La dette avait été consignée en **🔴** dans `MEMORY.md` sous le titre « LE VERBATIM EST TOUJOURS EN
PRODUCTION ». Elle n'a jamais été vraie. Elle est née d'une **prod injoignable**, pas d'une prod
sale : *« non vérifié »* y avait été écrit comme s'il valait *« fuite avérée »*.

Les deux méritent une alerte, mais **pas la même**, et pas la même urgence — l'un demande de
regarder, l'autre d'agir. Confondre les deux coûte double : on traite en panique ce qui n'est
qu'inconnu, et on émousse le rouge pour les fois où il désigne un vrai dégât.

## Le bénéfice second : la commande de production est vérifiée

`scripts/README.md` portait, depuis la livraison, un avertissement explicite : la commande de prod
était **dérivée** du `docker-compose.prod.yml` et du `backend.Dockerfile` — tous deux lus — mais
**jamais exécutée**. Le §18 recommandait le bilan d'abord pour cette raison : *il vaut vérification
de la commande autant que de la base.*

Elle fonctionne telle qu'écrite. Deux préalables, appris en la lançant, sont désormais consignés
dans `scripts/README.md` :

1. **Monter `postgres` seul** (`docker compose -f docker-compose.prod.yml up -d postgres`), jamais
   la pile. `--no-deps` ne démarre pas la base ; et lever la pile entière ferait tourner
   l'entrypoint du backend, donc `alembic upgrade head` **sur la production** — un effet de bord
   que le bilan ne demande pas.
2. **Ne rien accoler à la commande.** Une queue composée (`; echo $?`) casse le préfixe des règles
   de permission, renvoie l'appel au classifieur, qui y voit `prod` et refuse. Le code de sortie se
   lit sans l'aide d'un `echo`.

**Discriminant de base, obligatoire** : la 1ʳᵉ ligne de sortie doit dire `postgres:5432/zetis`. Si
elle dit `localhost:5432`, le repli silencieux de `ZETIS_DATABASE_URL` s'est déclenché et le bilan
porte sur la mauvaise base. Contrôle par la négation, hérité de la migration du 2026-08-10.

## Ce que cet addendum ne promet pas

- **La « production » de ZETIS est prod-like et locale** — compose `zetis-prod`, sur la même
  machine que le dev, avec son propre contenu. Le jour où une production **distante** existera, le
  bilan sera dû à nouveau sur elle : ce résultat ne se transporte pas d'une base à l'autre.
- **Le script reste dû sur toute base non encore inspectée.** Il est idempotent ; le repasser ne
  coûte rien.
- **Rien ici ne remplace le correctif structurel**, qui est le §18 lui-même : la route de dictée
  dédiée au chat rend la trace aveugle au contenu. La purge solde un existant, elle n'empêche
  aucune écriture future — c'est le code qui le fait.

## Suivi

Aucun test-verrou nouveau. Le n°1 du §Suivi de l'ADR-0059 (*aucun `ai_jobs`, quel qu'en soit le
`job_type`, ne porte un texte de Massimo*) couvre déjà la règle, et il vaut pour toutes les bases.

Contrôle de clôture, **passé** : `scripts/purge_chat_verbatim.py` sans `--apply` sort en `0` sur la
production, et le compte d'`ai_jobs` y est non nul.

## Ligne à ajouter dans `DECISIONS.md` sous ADR-0059

```md
- + addendum §18 — la production était déjà propre (bilan 2026-08-15, aucun `--apply` requis ;
  commande de prod vérifiée à l'usage)
```
