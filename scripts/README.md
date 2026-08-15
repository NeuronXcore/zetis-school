# scripts/

Scripts utilitaires (setup, seed DB, backups).

| Script | Rôle |
|---|---|
| `dev.sh` | lance la pile de développement |
| `with-worker.sh` | enveloppe une commande en garantissant le worker RQ |
| `bench_llm.py` | compare vitesse et qualité des moteurs sur les vrais prompts (ADR-0008) |
| `reorder_decisions.py` | remet `DECISIONS.md` en ordre |
| `purge_chat_verbatim.py` | efface les mots dictés restés dans `ai_jobs` (ADR-0059 §18) |
| `check_migration_drift.py` | mesure l'écart entre la révision d'une base et la tête du dépôt |

## `purge_chat_verbatim.py` — à passer sur chaque base

La dictée du chat écrivait `output_json = {"transcript": …}` dans `ai_jobs`, **durablement, hors
TTL**, alors que l'ADR-0026 §1 promettait une « impossibilité structurelle ». Le code est corrigé ;
ce script solde l'existant, base par base.

**Le bilan est le défaut** — rien n'est écrit sans `--apply` :

```bash
python scripts/purge_chat_verbatim.py            # bilan seul, sort en 1 s'il reste du verbatim
python scripts/purge_chat_verbatim.py --apply    # efface, puis re-vérifie
```

Il **retire la seule clé `transcript`** : la ligne survit avec son `job_type`, sa durée et la
taille de l'audio — la trace d'exécution que `CLAUDE.md` §Règles IA exige. Idempotent.

⚠️ **La variable est `ZETIS_DATABASE_URL`** ; `DATABASE_URL` est ignorée **en silence** par
l'application. Le script refuse de tourner (code 2) quand il voit l'une sans l'autre, plutôt que
d'opérer sur la mauvaise base — le piège s'est déclenché en vrai le 2026-08-10.

| État | Code |
|---|---|
| rien à effacer, ou effacement vérifié | `0` |
| il reste du verbatim (bilan sans `--apply`) | `1` |
| base cible ambiguë ou configuration illisible | `2` |
| effacement **incomplet** après `--apply` | `3` |

### En PRODUCTION — deux obstacles, une commande

Le geste n'est pas le même qu'en dev, pour deux raisons **vérifiées dans le dépôt** :

1. **Postgres n'est joignable que depuis le réseau du compose** — `docker-compose.prod.yml` le pose
   sur le seul réseau `interne`, sans port publié. On ne l'atteint pas depuis l'hôte.
2. **`scripts/` n'est pas dans l'image backend** — `infra/docker/backend.Dockerfile` ne copie que
   `apps/backend`. Il faut donc **monter** le script au moment de l'exécuter.

D'où la forme : on tourne **dans** le réseau, avec le script monté, et en court-circuitant
l'entrypoint (il applique les migrations puis lance uvicorn — on ne veut ni l'un ni l'autre).

```bash
docker compose -f docker-compose.prod.yml run --rm --no-deps \
  -v "$PWD/scripts:/scripts:ro" --entrypoint python \
  backend /scripts/purge_chat_verbatim.py
```

Puis, une fois le bilan lu, la même commande avec `--apply` à la fin.

`ZETIS_DATABASE_URL` est déjà dans l'environnement du service `backend` : le script la reprend via
la configuration de l'app, sans qu'on ait à la retaper. `POSTGRES_PASSWORD` doit être dans le
`.env` de la racine — le compose s'arrête tout seul sinon (`:?`).

✅ **Commande vérifiée à l'usage le 2026-08-15** — elle était jusque-là seulement *dérivée* du
`docker-compose.prod.yml` et du `backend.Dockerfile`, jamais exécutée. Elle fonctionne telle
qu'écrite. Deux préalables, appris en la lançant :

- monter **`postgres` seul** (`docker compose -f docker-compose.prod.yml up -d postgres`) et non la
  pile : `--no-deps` ne démarre pas la base, et lever la pile entière ferait tourner l'entrypoint du
  backend, donc `alembic upgrade head` **sur la prod** — un effet de bord que le bilan ne demande
  pas ;
- ne rien accoler à la commande (`; echo $?` et consorts) : la queue composée casse le préfixe des
  règles de permission et renvoie tout au classifieur, qui voit `prod` et refuse.

**Discriminant de base** : la 1ʳᵉ ligne de sortie doit dire `postgres:5432/zetis`. Si elle dit
`localhost:5432`, le repli silencieux de `ZETIS_DATABASE_URL` s'est déclenché et le bilan porte sur
la mauvaise base.

## État par base

| Base | Date | Résultat |
|---|---|---|
| dev | 2026-08-15 | **78 lignes** purgées (4 juillet → 14 août) |
| production | 2026-08-15 | ✅ **rien à effacer** — aucun `--apply` requis |

La prod est propre pour une raison vérifiée, pas par chance : **`eli5_transcribe` n'y figure pas**.
Ses 113 lignes d'`ai_jobs` se répartissent sur 10 `job_type` (`lesson_content` 37, `curriculum_*`
34, `capsule_*` 25, `eli5_explain` 12, `diagnostic_generate` 4, `eli5_reverse` 1) — la dictée n'a
jamais été exercée contre cette pile, donc la fuite n'y a jamais eu lieu.

⚠️ Le vert a été **corroboré** : la table est peuplée (113 lignes, dont 103 avec `output_json`).
« Rien à effacer » et « table vide » se ressemblent trop pour se contenter du message du script.

> Décision : `docs/decisions/adr-0059-addendum-la-production-etait-deja-propre.md`. La « production »
> de ZETIS est **prod-like et locale** (compose `zetis-prod`) — le jour où une prod distante
> existera, le bilan sera dû à nouveau sur elle : ce résultat ne se transporte pas d'une base à
> l'autre.

## Appliquer les migrations Alembic en production

✅ **Procédure vérifiée à l'usage le 2026-08-15** (prod portée de `b2c3d4e5f9a1` à `f9a0b1c2d3e4`).
Elle réutilise la forme du bilan ci-dessus — tourner **dans** le réseau du compose, en
court-circuitant l'entrypoint — et n'a besoin **d'aucune publication de port** : `ZETIS_DATABASE_URL`
est déjà dans l'environnement du service `backend`, pointant sur `postgres:5432`.

```bash
docker compose -f docker-compose.prod.yml up -d postgres

docker compose -f docker-compose.prod.yml run --rm --no-deps \
  -v "$PWD/apps/backend/alembic:/repo/apps/backend/alembic:ro" \
  --entrypoint alembic backend current

docker compose -f docker-compose.prod.yml run --rm --no-deps \
  -v "$PWD/apps/backend/alembic:/repo/apps/backend/alembic:ro" \
  --entrypoint alembic backend upgrade head

docker compose -f docker-compose.prod.yml down
```

🔴 **Le montage de `alembic/` n'est pas un confort, c'est la condition.** L'image
`zetis-prod-backend` est construite par `COPY apps/backend` : elle fige les migrations **du jour de
son build**. Au 2026-08-15 elle en portait **46** quand `main` en avait **54** — sans le montage,
`upgrade head` s'arrête à la tête que l'image connaît et **répond fièrement `head`**. C'est un
faux-vert parfait : la commande réussit, la révision affichée est cohérente, et il manque huit
migrations.

🔴 **Compter les migrations en attente AVANT d'écrire, et ne pas croire le décompte du chantier
en cours.** Le 2026-08-15, le chantier apportait deux migrations ; il y en avait **cinq** en
attente. Trois venaient de chantiers mergés et jamais appliqués — **la prod dérivait du dépôt et
rien ne le mesurait**, les migrations étant chaînées on ne peut pas poser les siennes sans poser
les autres.

**C'est ce que `check_migration_drift.py` mesure désormais** (voir la section suivante) :

```bash
python scripts/check_migration_drift.py
```

⚠️ **Lire chaque migration héritée avant de la laisser passer.** Deux des trois de ce jour
supprimaient des lignes en `upgrade()` (dédoublonnage avant contrainte d'unicité). Elles se sont
révélées **sans effet ici — mesuré, pas supposé** : `fiches` était vide et la table SRS ne portait
qu'une ligne sans doublon. Le contrôle coûte une requête ; le supposer coûte des données.

**Préalables**, tous appris à l'usage :

- monter **`postgres` seul**, jamais la pile : l'entrypoint du backend ferait `alembic upgrade head`
  **avant** la sauvegarde ;
- `pg_dump` d'abord, **par le conteneur** (celui de l'hôte est en 14.x, le serveur en 16.x → refus,
  et il laisse un fichier de 0 octet qui ressemble à une sauvegarde). Chercher `grep -c "dump
  complete"`, **pas** `tail -3` : pg_dump 16 écrit une ligne après le marqueur. Repère : ~620 K ;
- `down` **sans `-v`** — les volumes nommés doivent survivre ;
- ne rien accoler aux commandes (`; echo $?` et consorts) : la queue composée casse le préfixe des
  règles de permission et renvoie tout au classifieur, qui voit `prod` et refuse.

**Discriminant obligatoire** : la révision de la prod doit **différer de celle du dev**, et les
volumétries aussi (au 2026-08-15 : 476 notions / 119 leçons / 4 quiz en prod, contre 457 / 157 / 57
en dev). `ZETIS_DATABASE_URL` est la seule variable lue — `DATABASE_URL` est ignorée **en silence**,
et alembic répond alors la révision du **dev** sans que rien ne le signale.

**Preuve de bout en bout**, une fois migré : faire calculer la réponse par le code de `main` contre
la base de prod, plutôt que se contenter du `head` d'alembic.

```bash
docker compose -f docker-compose.prod.yml run --rm --no-deps \
  -v "$PWD/apps/backend/app:/repo/apps/backend/app:ro" \
  --entrypoint python backend -c "from app.db.base import SessionLocal; ..."
```

| Base | Date | Révision | Points zéro posés |
|---|---|---|---|
| dev | 2026-08-15 | `f9a0b1c2d3e4` | `eli5_views` 267 · `quiz_views` 37 |
| production | 2026-08-15 | `f9a0b1c2d3e4` | `eli5_views` **90** · `quiz_views` **0** (aucun quiz jouable) |

Les deux bases ne portent pas les mêmes lignes, et c'est l'intention : un point zéro marque vu ce
qui existe **au moment où il tourne**.

## `check_migration_drift.py` — mesurer l'écart entre une base et le dépôt

**Ce qu'il ferme** : jusqu'au 2026-08-15, **la production dérivait du dépôt sans que rien ne le
mesure**. Trois migrations mergées y attendaient depuis des jours ; il a fallu le demander à
`alembic history`, et il a fallu *penser* à le demander. Ce script rend la question posable en une
commande, avec un code de sortie exploitable.

```bash
python scripts/check_migration_drift.py                    # la base que lit l'app (dev)
python scripts/check_migration_drift.py --database-url …   # une base explicite
```

Sur la production — joignable seulement depuis le réseau du compose, où `ZETIS_DATABASE_URL` est
déjà posée :

```bash
docker compose -f docker-compose.prod.yml up -d postgres

docker compose -f docker-compose.prod.yml run --rm --no-deps \
  -v "$PWD/apps/backend/alembic:/repo/apps/backend/alembic:ro" \
  -v "$PWD/scripts:/scripts:ro" \
  --entrypoint python backend /scripts/check_migration_drift.py
```

| Sortie | Cas | Ce que ça veut dire |
|---|---|---|
| `0` | aligné | la base est à la tête du dépôt |
| `1` | **en retard** | des migrations mergées ne sont pas posées — la dérive ordinaire, celle du 2026-08-15 |
| `2` | 🔴 **révision inconnue** | la base porte une révision absente du dépôt : une branche non mergée y a été posée. Au prochain redémarrage l'entrypoint échouera sur *« Can't locate revision »* et **le backend ne remontera pas** |
| `3` | 🔴 **deux têtes** | défaut structurel du dépôt, sans rapport avec la base — vérifié **avant** toute connexion |

🔴 **`--tete-attendue <revision>` est le garde-fou contre l'image périmée.** Sans montage de
`alembic/`, le script comparerait la base à une tête figée au jour du build et annoncerait
« aligné » sur une base en retard — le faux-vert le plus coûteux du lot. Passer la tête qu'on
attend le fait s'arrêter au lieu de mentir.

⚠️ **Ce script ne remplace pas l'entrypoint**, qui fait déjà `alembic upgrade head` au démarrage.
La fenêtre de dérive est *entre le merge et le redémarrage suivant* — et aucun contrôle **au**
démarrage ne peut la voir, puisqu'à ce moment-là il est déjà trop tard pour la constater. D'où un
contrôle **hors** du démarrage. À passer à la clôture d'un chantier qui touche au schéma.

**Le pendant sans base** : `apps/backend/app/tests/test_migrations_graph.py` verrouille ce qui ne
demande aucune connexion — une seule tête, et autant de révisions dans la chaîne que de fichiers
dans `alembic/versions/`. Il tourne dans la suite ordinaire, donc à chaque `pytest`. Les deux sont
**complémentaires** : un graphe parfait ne dit rien sur ce qui est posé en prod, et une prod à jour
ne dit rien sur une seconde tête qui vient d'arriver sur `main`.

> ⚠️ Il n'y a **aucune CI dans ce dépôt** (`.github/workflows/` n'existe pas). « Mettre ça en CI »
> n'était pas une option : le verrou vit donc dans la suite de tests, que l'humain lance, et le
> script se lance à la main. Le jour où une CI existera, les deux s'y branchent tels quels.
