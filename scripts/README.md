# scripts/

Scripts utilitaires (setup, seed DB, backups).

| Script | Rôle |
|---|---|
| `dev.sh` | lance la pile de développement |
| `with-worker.sh` | enveloppe une commande en garantissant le worker RQ |
| `bench_llm.py` | compare vitesse et qualité des moteurs sur les vrais prompts (ADR-0008) |
| `reorder_decisions.py` | remet `DECISIONS.md` en ordre |
| `purge_chat_verbatim.py` | efface les mots dictés restés dans `ai_jobs` (ADR-0059 §18) |

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
