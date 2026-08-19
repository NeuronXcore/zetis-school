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

À rédiger à la clôture de la slice 1 — son read-before-code peut déplacer des détails. Le
squelette : les six étapes du §6, `POST …/verification` (202), verdict détaillé dans
`output_json`. Test-verrou : **`zetis_verify` détruite MÊME en échec** (drop en `finally`, ménage
d'une vérification interrompue au démarrage de la suivante), et `zetis` jamais touchée.

## Slice 3 — la surface *(après la slice 2)*

`GET …/donnees` (archives via sidecars, certificat, dernière vérification) · l'onglet 💾 rendu :
deux gestes, KPI du serveur, refus motivés, règles transverses `adr-0062` §6. Test-verrou : une
archive jamais vérifiée s'affiche « **export non vérifié** » ; le mot « sauvegarde » n'apparaît
qu'après une restauration à blanc réussie.
