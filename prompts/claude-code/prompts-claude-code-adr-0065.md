# Prompts d'exécution — ADR-0065 « Une archive jamais restaurée n'est pas une sauvegarde »

Trois slices (budget backlog : sauvegarder = 2 · vérifier = 1). Chaque prompt se colle après
`/slice`. Les quatre points d'ouverture ont été validés le 2026-08-19.

---

## Slice 1 — le socle : `backup_create`, du certificat au manifeste scellé

Chantier : la slice 1 de l'ADR-0065, sur la branche EXISTANTE `feat/sauvegarde-qui-se-merite`
(ne pas la recréer — vérifier qu'on est dessus, arbre propre). L'ADR
`docs/decisions/adr-0065-une-archive-jamais-restauree-n-est-pas-une-sauvegarde.md` est LA
référence : relire §1 à §5, §Périmètre et §Suivi avant toute ligne. Les décisions y sont figées —
les relire, jamais les rouvrir.

### Livrables

1. `infra/docker/backend.Dockerfile` : `postgresql-client-16` (PGDG, majeure ÉPINGLÉE sur le
   serveur `pgvector/pgvector:pg16`) — avec un test-verrou du Dockerfile, patron de
   `test_dockerfile_backend_extras.py`.
2. `core/config.py` : `ZETIS_BACKUP_DIR` ; `docker-compose.prod.yml` : bind mount `:?` sur
   `backend` ET `worker` (l'ancre `generation-env` ne porte que l'environnement — les volumes se
   déclarent par service).
3. Le script HÔTE de certification de la cible (`scripts/`) : `diskutil` + localisation RÉELLE de
   `Docker.raw` → écrit `.zetis-cible.json` (UUID cible, UUID données, date) DANS le répertoire
   cible. Bash 3.2 compatible (macOS).
4. Le module de sauvegarde (`modules/settings/` ou `modules/production/` — trancher au
   read-before-code, dire pourquoi) : `backup_create` enregistré dans `_EXECUTANTS`
   (`production/jobs.py`), `created_by="file"`. Ordre IMPOSÉ (§4) : dump Postgres sur instantané
   exporté → objets MinIO par l'API S3 → WAV de `/shared/audio` → manifeste scellé → sha256 +
   sidecar `.manifeste.json`. Archive : `zetis-AAAA-MM-JJ-hhmm.tar` dans `ZETIS_BACKUP_DIR`.
5. `POST /api/settings/donnees/sauvegarde` sur le routeur settings existant : 202 (métadonnées du
   job) ou 409 fail-closed. Amorce de durée dans `travaux.AMORCES_MS` (`"backup_create"`).

### Test-verrous (chacun un test nommé, aucun affaibli)

- 🔴 **Une archive au couple incomplet n'existe pas** : une capsule à `video_url` non nul sans
  objet correspondant ⇒ échec motivé ET archive partielle SUPPRIMÉE du disque. Le cas existe en
  vrai (dev : 8 référencées / 1 présente) — le test le reconstruit en fixture.
- 🔴 **409 fail-closed AVANT d'enfiler** : certificat absent / illisible / UUID égaux ⇒ 409 avec
  son motif, et AUCUN job créé.
- **Le `.env` n'entre jamais dans l'archive**, et l'exclusion est ÉCRITE dans le manifeste avec
  son motif (`.env`, Redis, modèles).
- **Aucun octet d'archive ne sort par HTTP** : la réponse du POST ne porte que des métadonnées.
- **Le manifeste est compté sur l'instantané du dump** (mêmes comptes que le SQL restauré), pas
  sur une lecture séparée.

### Read-before-code à rendre en RAPPORT (ce qui était faux ou flou, §Suivi 4 de l'ADR)

- Le nom EXACT du paquet PGDG pour bookworm/pg16, vérifié dans un conteneur d'essai.
- La dérivation `video_url` / `audio_url` → clé S3 / chemin `/shared/audio` (lire
  `capsules/storage.py` et le modèle) — c'est elle qui fonde le contrôle de complétude.
- 🔴 **Ce qui empêche DEUX `backup_create` simultanés** : le régulateur `duplicate` vit sur
  `create_run` (les LOTS), pas sur `ai_jobs` — vérifier ce que `travaux.enfiler` fait d'un
  doublon, et si rien ne l'empêche, le POST doit refuser lui-même (409) sur un `backup_create`
  `queued|running`.
- 🔴 **`pg_export_snapshot()` exige que la transaction qui l'a créé reste OUVERTE pendant tout le
  `pg_dump --snapshot`** — vérifier comment tenir la session (connexion dédiée, hors pool de
  l'app) sans le piège `idle in transaction` documenté dans TROUBLESHOOTING.md.

### Hors-périmètre de CETTE slice

`backup_verify` (slice 2) · `GET /donnees` et l'onglet 💾 (slice 3) · tout le hors-périmètre de
l'ADR (restaurer, purges, RGPD, planification, chiffrement, hors-site). Les trois critères qui
bornent : aucune écriture dans `zetis` ni migration · aucun octet d'archive sur HTTP · rien de
destructif.

### Fin de slice

Suites complètes backend + les deux frontends, `bash scripts/ci-like.sh 3 frontend-papa` si le
front a bougé (il ne devrait PAS bouger dans cette slice), `graphify update .`, puis `/cloture` —
sans commit : l'humain relit et committe.

---

## Slice 2 — la preuve : `backup_verify` *(à coller après le merge de la slice 1)*

*(Rédigé à la clôture de la slice 1, le 2026-08-19, comme prévu.)*

Chantier : la slice 2 de l'ADR-0065, même branche (ou sa suivante si la slice 1 a été mergée —
vérifier l'état réel, arbre propre). L'ADR reste LA référence : relire §6, §Périmètre, §Suivi 2.
La slice 1 a posé les patrons — **les réutiliser, pas les réinventer** :
`modules/settings/sauvegarde.py` (le module), `_instantane` (le point de greffe patchable en
test — `backup_verify` aura l'équivalent pour la restauration), `refus()` avant `enfiler`,
l'exécutant sans db/llm dans `production/jobs.py`.

### Livrables

1. `sauvegarde.verifier_sauvegarde(nom_archive)` : les six étapes du §6, dans l'ordre —
   ① sha256 du tar **vs** sidecar `.sha256` · ② `DROP DATABASE IF EXISTS zetis_verify` (le ménage
   d'une vérification interrompue) puis `CREATE DATABASE zetis_verify` · ③ restauration du dump
   (`psql -v ON_ERROR_STOP=1`) · ④ comptage par table + tête Alembic **vs le manifeste lu DANS le
   tar** (la vérité scellée — jamais le sidecar `.manifeste.json`, qui n'est qu'une copie de
   lecture) · ⑤ sha256 de chaque objet/fichier média de l'archive vs manifeste · ⑥ `DROP DATABASE
   zetis_verify` en **`finally`** — succès ou échec.
2. Exécutant `backup_verify` dans `_EXECUTANTS` + amorce `AMORCES_MS["backup_verify"]`
   (au-dessus de `PLANCHER_MS`, même motif que `backup_create`).
3. `POST /api/settings/donnees/verification` (202 `{job_id, status}`) : payload `{"archive": nom}`.
   409 AVANT d'enfiler si : nom d'archive invalide (🔴 **whitelist `zetis-*.tar`, aucun
   séparateur de chemin** — le nom vient du client, c'est une traversée de répertoire sinon) ·
   archive ou sidecar `.sha256` absents de `ZETIS_BACKUP_DIR` · un `backup_verify` OU un
   `backup_create` déjà `queued|running` (le trou du doublon vaut pour les deux types, et une
   vérification pendant une création lirait un tar en cours d'écriture).
4. Verdict détaillé dans `output_json` : ce qui a été comparé, ce qui diverge (liste d'écarts
   nommés), et le mot de la fin — jamais un booléen sec.

### Test-verrous (chacun un test nommé, aucun affaibli)

- 🔴 **`zetis_verify` détruite MÊME en échec** : une restauration qui lève au milieu ⇒ le `DROP`
  du `finally` est passé. Et le ménage du ② : une `zetis_verify` laissée par une vérification
  interrompue n'empêche pas la suivante.
- 🔴 **La base `zetis` n'est jamais touchée** : aucune écriture — le verrou l'affirme sur le vrai
  code (la connexion de vérification ne vise que `zetis_verify`).
- **Un écart = un échec motivé** : un compte qui diverge du manifeste ⇒ verdict d'échec avec la
  table nommée ; un sha256 de média qui diverge ⇒ l'objet nommé.
- **409 sur nom d'archive hors whitelist** (traversée de chemin) et sur doublon — AUCUN job créé.
- **Le manifeste de référence est celui DU TAR**, pas le sidecar : un sidecar falsifié ne change
  pas le verdict.

### Read-before-code à rendre en RAPPORT

- 🔴 **`CREATE DATABASE` ne s'exécute PAS dans une transaction** : la connexion psycopg du ② doit
  être en **autocommit** — l'inverse exact de `_instantane` (REPEATABLE READ tenue ouverte).
  Vérifier la façon psycopg3 de le poser, et que la concurrence 1 de la file suffit face au
  verrou de template de `CREATE DATABASE`.
- La connexion de comptage du ④ vise `zetis_verify` : vérifier la dérivation du DSN (remplacer le
  nom de base dans `settings.database_url`) et ce que `psql` attend exactement
  (`-f dump.sql` + URI, sortie 0 — le cycle mesuré au cadrage l'a fait, le refaire dans le
  conteneur d'essai si le doute existe).
- Le point de greffe test : quelle(s) fonction(s) remplacer pour jouer les six étapes sur SQLite
  sans Postgres — même esprit que `_instantane`, dire lesquelles et pourquoi.

### Hors-périmètre de CETTE slice

`GET /donnees` et l'onglet 💾 (slice 3) · tout le hors-périmètre de l'ADR. Les trois critères du
§Périmètre mordent toujours : `backup_verify` n'écrit que dans `zetis_verify`, qu'il détruit ·
aucun octet d'archive sur HTTP · rien de destructif hors `zetis_verify`.

### Fin de slice

Suites complètes backend + les deux frontends (le front ne doit PAS bouger), `graphify update .`,
puis `/cloture` — sans commit.

## Slice 3 — la surface *(après la slice 2)*

`GET …/donnees` (archives via sidecars, certificat, dernière vérification) · l'onglet 💾 rendu :
deux gestes, KPI du serveur, refus motivés, règles transverses `adr-0062` §6. Test-verrou : une
archive jamais vérifiée s'affiche « **export non vérifié** » ; le mot « sauvegarde » n'apparaît
qu'après une restauration à blanc réussie.
