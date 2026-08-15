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

Passé en dev le 2026-08-15 (78 lignes, 4 juillet → 14 août). **Reste à passer en production.**
