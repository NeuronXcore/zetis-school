# Prompts d'exécution — ADR-0066 « Restaurer est un swap à réveil suspendu »

Deux slices (budget backlog : restaurer = 2, le DELETE s'y ajoute). Chaque prompt se colle après
`/slice`. Les mesures du cadrage (2026-08-19) font foi : restauration réelle 0,234 s / 48 tables,
**SWAP 8 ms**, réveil suspendu prouvé, `alembic upgrade head` no-op — conteneur d'essai, VRAI dump.

---

## Slice 1 — le geste : `backup_restore`, du 409 au sidecar

Chantier : la slice 1 de l'ADR-0066, sur la branche EXISTANTE `feat/restaurer-une-sauvegarde`
(ne pas la recréer — vérifier qu'on est dessus, arbre propre). L'ADR
`docs/decisions/adr-0066-restaurer-est-un-swap-au-reveil-suspendu.md` est LA référence : relire
§1 à §5, §Périmètre et §Suivi avant toute ligne. Les décisions y sont figées — les relire,
jamais les rouvrir. Les patrons du 0065 se RÉUTILISENT : `modules/settings/sauvegarde.py`
(le module), les points de greffe patchables (`_instantane`, `_restaurer_a_blanc`), `refus_*()`
avant `enfiler`, l'exécutant sans db/llm, le faux module psycopg des tests structurels.

### Livrables

1. `sauvegarde.refus_restauration(db, nom)` — les préconditions du §2, TOUTES en 409 motivé
   AVANT d'enfiler : nom hors whitelist · archive/sidecars absents · dernier verdict
   `backup_verify` ≠ `reussie` (§1 — le mot se mérite dans les deux sens) · suspension INACTIVE
   (le motif nomme le bouton « Suspendre ZETIS » — `service.production_suspended`, adr-0063) ·
   déploiement non supervisé (`settings.production_worker_supervised`, même motif que le 409
   d'adr-0064) · un lot OU un travail `running` · verdict de compatibilité défavorable (§5).
2. `sauvegarde.restaurer_sauvegarde(nom)` — les 8 étapes du §2, dans l'ordre :
   ① filet `backup_create` (appel direct de `creer_sauvegarde()` — s'il lève, RIEN n'est
   remplacé) · ② restauration du dump dans `zetis_restore` (mécanique `_restaurer_a_blanc`,
   SANS le DROP final — nouvelle fonction ou paramètre, trancher au read-before-code) ·
   ③ écritures de réveil DANS `zetis_restore` : `zetis_production_suspended=true`, paliers du
   régime MANUAL, déclencheur désarmé (clés `app_settings` de `settings/service.py` — upsert
   key/value, mesuré au cadrage) · ④ SWAP : `pg_terminate_backend` sur `zetis` + `DROP DATABASE
   IF EXISTS zetis_avant WITH (FORCE)` + `RENAME zetis → zetis_avant` + `RENAME zetis_restore →
   zetis` (8 ms mesurés) · ⑤ médias remplacés depuis l'archive (bucket vidé/réécrit par l'API
   S3, `/shared/audio` vidé/réécrit) · ⑥ purge des files Redis de production · ⑦ `alembic
   upgrade head` (subprocess, cwd `apps/backend`) · ⑧ arrêt gracieux du worker (warm shutdown
   de soi-même — read-before-code).
3. **Le sidecar `.restauration.json`** (§3) : archive, horodatages, étapes franchies, comptes,
   écarts — écrit sur la CIBLE, étape par étape (un crash au milieu doit laisser un sidecar qui
   dit où ça s'est arrêté). La ligne `ai_jobs` du travail MEURT au swap : assumé, documenté dans
   le module, et le `run_ai_job` post-swap rendra « introuvable » — vérifier que ce chemin ne
   casse rien (read-before-code).
4. Le verdict de compatibilité (§5) servi par `GET /donnees` (par archive : `restaurable:
   bool, motif: str|null`) — tête du manifeste vs les révisions du code (`alembic
   ScriptDirectory`, read-before-code).
5. `POST /api/settings/donnees/restauration` (202 métadonnées / 409 motivé) — payload
   `{"archive": nom}`, whitelist stricte, patron exact de `/verification`. Exécutant
   `backup_restore` dans `_EXECUTANTS` + amorce (> `PLANCHER_MS`).

### Test-verrous (chacun un test nommé, aucun affaibli)

- 🔴 **Jamais sans filet** : le ① qui échoue ⇒ AUCUNE étape suivante (fake `creer_sauvegarde`
  qui lève ⇒ le point de greffe du swap n'est jamais appelé, sidecar dit « filet: échec »).
- 🔴 **Le réveil est écrit AVANT le swap** : sur le vrai code, faux module psycopg (patron
  slice 2 du 0065) — l'ordre exact des ordres SQL est asserté : upserts de réveil sur
  `zetis_restore` PUIS terminate PUIS les RENAME. Et `zetis_avant` est DROP-é avant le RENAME.
- 🔴 **409 fail-closed** sur CHAQUE précondition (paramétré) — archive non vérifiée, suspension
  inactive, non supervisé, travail en vol, compat défavorable : AUCUN job créé.
- **Une restauration ② qui échoue ne swap pas** : `zetis` intacte (structurel, faux psycopg).
- **Le sidecar survit au crash** : une exception à l'étape N laisse un sidecar avec les étapes
  1..N-1 franchies.
- **Aucun octet d'archive sur HTTP** — la réponse du POST ne porte que `{job_id, status}`.

### Read-before-code à rendre en RAPPORT (§Suivi 3 de l'ADR)

- 🔴 **Le seed de l'entrypoint est-il IDEMPOTENT sur une base restaurée PLEINE ?**
  (`backend-entrypoint.sh` rejoue `python -m app.db.seed` à chaque boot — lire `app/db/seed.py` :
  un seed qui insère sans garde doublerait des lignes au premier redémarrage post-restauration.)
- 🔴 **Le warm shutdown de SOI-MÊME** depuis un travail RQ : `send_shutdown_command` sur son
  propre worker — le travail en cours se termine-t-il proprement (statut écrit) avant l'arrêt ?
  Sinon, quel mécanisme (le `finally` du travail ? un flag ?). Vérifier sur le vrai RQ.
- 🔴 **La session du travail vit dans `zetis`** : l'exécutant doit la fermer/neutraliser AVANT le
  terminate du ④ (sinon il se tue lui-même) — vérifier ce que `run_ai_job` fait quand la ligne a
  disparu après coup (lecture du code : il log « introuvable » et rend une erreur — confirmer
  qu'aucune exception ne remonte à RQ).
- Les clés Redis exactes à purger (⑥) : les files RQ (`production`, `production-priority`) ET
  leurs registres (scheduled — le réveil du scan y vit : le purger ? le scan se réamorce au
  redémarrage du worker, vérifier `production_worker.py`).
- `ScriptDirectory` d'Alembic pour le §5 : la tête du manifeste est-elle une révision CONNUE du
  code, et est-elle un ancêtre de head ?
- `remove_objects` MinIO (vider un bucket par l'API) — et le chemin « tête plus ancienne » du §5
  reste NON MESURÉ (aucune archive antérieure n'existe) : le dire si c'est toujours vrai.

### Hors-périmètre de CETTE slice

Le DELETE d'archive et TOUTE la surface (slice 2) · tout le hors-périmètre de l'ADR (remises à
zéro, export RGPD, rotation, bouton « annuler », downgrade). Les trois critères du §Périmètre
mordent : aucune migration ni colonne · aucun octet d'archive sur HTTP · le destructif est
ÉNUMÉRÉ (§Périmètre 3), rien d'autre.

### Fin de slice

Suites complètes backend + les deux frontends (le front ne doit PAS bouger dans cette slice),
`graphify update .`, puis `/cloture` — sans commit.

---

## Slice 2 — l'administration : DELETE, la surface, le runbook *(après le merge de la slice 1)*

À affiner à la clôture de la slice 1 (son read-before-code peut déplacer des détails). Le
squelette :

- **`DELETE /api/settings/donnees/archives/{nom}`** (nom en chemin, whitelist stricte) : supprime
  le tar ET tous ses sidecars. 409 motivés : travail de sauvegarde en `queued|running` · 🔴 **la
  dernière archive au verdict `reussie` ne se supprime pas** tant qu'aucune autre archive
  vérifiée n'existe (§6).
- **La surface** (§7, règles `adr-0062` §6) : « Restaurer » n'apparaît que sur les archives
  vérifiées (verdict du GET) — dialogue qui nomme l'archive, énonce la séquence (filet compris)
  et exige une **saisie de confirmation** ; « Supprimer » — dialogue nommant l'archive, sans
  saisie ; toasts = retour d'action SEULEMENT ; l'état « restaurée le … » lu du sidecar
  `.restauration.json` dans `GET /donnees`.
- **Le runbook du re-swap `zetis_avant`** (§4) dans `TROUBLESHOOTING.md` — les commandes
  exactes, testées en conteneur d'essai.
- Test-verrous : la dernière vérifiée refuse la suppression (409, motif) · suppression = tar +
  TOUS les sidecars (rien d'orphelin) · « Restaurer » absent des archives non vérifiées (test
  composant) · la saisie de confirmation est EXIGÉE (un clic seul ne part pas) · l'entrée
  CHANGELOG du chantier part avec cette slice.
