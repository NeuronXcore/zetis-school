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

⚠️ **Cette commande n'a PAS été exécutée** : elle est dérivée du `docker-compose.prod.yml` et du
`backend.Dockerfile`, tous deux lus, mais aucune pile de production n'était joignable le
2026-08-15. Le bilan étant sans effet de bord, lancez-le **d'abord** : il vaut vérification de la
commande autant que de la base.

Passé en dev le 2026-08-15 (78 lignes, 4 juillet → 14 août). **Reste à passer en production.**
