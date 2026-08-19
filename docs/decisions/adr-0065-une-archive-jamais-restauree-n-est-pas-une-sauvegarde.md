---
id: "0065"
titre: "Une archive jamais restaurée n'est pas une sauvegarde"
type: surface
statut: propose
date: 2026-08-19
pr: null
revoque: []        # à remplir à la main — voir annexes/rapport-revocations.md
revoque_par: []
refs: ["0012", "0023", "0034", "0041", "0046", "0060", "0062", "0063"]
---
# ADR-0065 — Une archive jamais restaurée n'est pas une sauvegarde

## Statut

**Proposé — 2026-08-19.** Phase **B** du `BACKLOG.md` §*Route des paramètres* : « la sauvegarde qui
se mérite » — **sauvegarder + vérifier par restauration à blanc, et rien d'autre**. Restaurer,
purger, remettre à zéro : phase E, autre ADR.

Cadré en **cas 3 de l'`adr-0060`** : deux `job_type` neufs dans un vocabulaire fermé, trois routes,
une image Docker modifiée, un montage de volume nouveau et un script hôte — l'annulation coûterait
bien plus d'un commit.

N'amende rien : les règles transverses de la page (`adr-0062` §6) s'appliquent telles quelles à
l'onglet 💾 Données, et « Suspendre ZETIS » (`adr-0063`) n'est **pas** consommé ici — le §8 dit
pourquoi.

## Contexte

### Ce que la maquette affirmait, et ce que la mesure a rendu

La maquette v2 (section « 3. DONNÉES ») annonce elle-même ses valeurs comme inventées. Chaque
affirmation a donc été vérifiée par une commande le 2026-08-19, sur les deux piles vivantes
(`zetis-*` dev et `zetis-prod-*`). Cinq étaient fausses, et deux changent le dessin.

| La maquette dit | Mesuré |
|---|---|
| « La donnée vit dans **trois** endroits : Postgres, MinIO, le `.env` » | 🔴 **Quatre.** Elle oublie le volume **`capsule_audio`** (`/shared/audio`, partagé backend · worker · worker-media) : les WAV Piper par scène, que `capsules/storage.py` écrit **sur disque**, jamais dans MinIO. En dev : **46 Mo** sous `apps/backend/storage/generated/`. |
| KPI : « 1,86 Go · 41 812 lignes · 37 tables · 1 204 objets » | 🔴 **Inventés, de deux ordres de grandeur.** PROD : **12 Mo · 219 lignes · 48 tables · 0 objet MinIO · 0 fichier audio**. DEV : **16 Mo · 9 161 lignes · 48 tables · 1 objet MinIO · 46 Mo d'audio/vidéo disque**. |
| « Le seul poste irremplaçable : les **PDF importés — 96 Mo** » | 🔴 **Le poste n'existe pas.** `rag/router.py::upload` **extrait le texte** (`extract_text`) et l'ingère en base (`RagDocument` + chunks + embeddings pgvector) ; le fichier PDF n'est **jamais persisté**. Le dump Postgres emporte donc déjà les cours importés — il n'y a aucun fichier à traiter à part. |
| Disques « `ZETIS-SSD` » et « `LLM-SSD` » | 🔴 **Noms inventés.** Réel : **`NX-Projects`** (UUID `C11283B0-FAF2-4D5B-A4FE-16438C8A2CF4`, disque physique externe `disk6`) et **`NX-Models`** (UUID `0C07D1DA-48F1-4A62-BEF6-DFC9964F8EAF`, disque physique externe `disk7`). Deux disques physiques distincts : la parade de la maquette est **possible** sur cette machine. |
| « Docker Desktop.raw → volumes pgdata, minio, sur le SSD projets » | ✅ **Vrai, et mesuré** : `Docker.raw` vit dans `/Volumes/NX-Projects/_docker/DockerDesktop/` (926 Go apparents, **15 Go réels** — fichier creux), sur le **même volume que le dépôt**. Les quatre volumes nommés de la prod (`zetis-prod_postgres_data`, `redis_data`, `minio_data`, `capsule_audio`) vivent **dedans**. Une cible de sauvegarde posée sur `NX-Projects` copierait bien le disque sur lui-même. |
| « La page compare les **UUID de volume** et refuse s'ils sont identiques » | 🔴 **Illisibles depuis le conteneur** (`diskutil` absent, volume hôte inaccessible — `TROUBLESHOOTING.md`, mesuré le 2026-08-19). ✅ **Lisibles depuis l'hôte** : `diskutil info /Volumes/<X>` rend le `Volume UUID` — mesuré ci-dessus. La règle est tenable, mais **pas depuis là où la maquette la posait**. D'où le §3. |
| « le mot sauvegarde se mérite […] restauration à blanc dans `zetis_verify` » | ✅ **Faisable, et prouvé sur les vraies données** — voir le cycle complet ci-dessous. |

> ⚠️ Deux faits de plus, que la maquette ne posait pas et qui contraignent le dessin :
>
> - **`pg_dump` n'est PAS dans l'image backend.** `which pg_dump psql pg_restore` dans
>   `zetis-prod-backend-1` → rien (l'image n'installe que `curl` ; `psycopg[binary]` embarque
>   libpq, pas les binaires clients). Le serveur, lui, est un `pgvector/pgvector:pg16`
>   (`pg_dump` 16.15 dedans).
> - **MinIO ne se copie pas par `/data`** : le magasin est au format interne (`xl.meta`,
>   parts) — mesuré sur le bucket dev. Les objets se lisent **par l'API S3**, avec le client
>   `minio` que l'image embarque déjà (`capsules/storage.py`).

### Le cycle complet, exécuté en vrai AVANT d'être décidé

Règle du `/cadrage` §4 : la vraie fonction sur les vraies données. Fait le 2026-08-19, sur
l'instance **dev** :

| Étape | Mesure |
|---|---|
| `pg_dump` (dev, 16 Mo, 9 161 lignes) | **0,17 s** → dump SQL de **2,6 Mo** |
| `pg_dump` (prod, 12 Mo, 219 lignes) | **0,13 s** → **151 Ko** |
| `CREATE DATABASE zetis_verify` + restauration (`psql -v ON_ERROR_STOP=1`) | **0,29 s**, sortie 0 |
| Comptage restauré | **9 161 / 9 161 lignes**, **48 / 48 tables** |
| Tête Alembic restaurée | `a8a71c84f86e` = la tête vivante |
| Extension `vector` dans la base restaurée | présente |
| `DROP DATABASE zetis_verify` | propre |

Le cycle entier tient **sous la seconde** à l'échelle actuelle. Et le rôle `zetis` est superuser
sur ses instances (mesuré, `rolsuper = t` en dev comme en prod) : `CREATE`/`DROP DATABASE` ne
demandent aucun compte supplémentaire.

### La preuve que le contrôle de complétude a un travail réel

En dev, **8 capsules portent un `video_url`** — et le bucket MinIO dev contient **1 objet**
(capsule 18), le disque en porte d'autres (capsules 18 et 27) : la donnée est éparpillée entre
deux backends (`STORAGE_BACKEND` a changé au fil du temps). Une sauvegarde dev honnête devrait
**refuser** aujourd'hui. C'est exactement le cas que le manifeste du §5 attrape — mesuré, pas
hypothétique.

### Ce qui existe déjà, et qu'on ne réinvente pas

- **Le patron du travail de file** : `ai/travaux.py::enfiler` (ligne commitée avant l'enfilement,
  suppression si la file refuse, `created_by="file"`), `production/jobs.py::_EXECUTANTS` +
  `run_ai_job` (passage en `running` commité à part, échec qualifié par `failures.doit_rejouer`),
  barre du header, échecs acquittables (`adr-0041`).
- **Le worker de production supervisé**, concurrence **1** — un seul Ollama, un seul GPU
  (`adr-0046`, `docker-compose.prod.yml`).
- **Le routeur `/api/settings`**, `require_parent` d'office, et les règles transverses de la page
  (`adr-0062` §6) — y compris « le verrou vient du serveur, avec son motif » et le précédent du
  **409 motivé** (`workers_router.py`, A1).
- **La lecture de la tête Alembic** : `settings/machine.py:434`
  (`SELECT version_num FROM alembic_version`).
- **La doctrine des secrets** (`SECURITY.md`) : la voix, les résultats, les lacunes de Massimo
  sont des données sensibles ; les logs ne portent jamais un secret. ✅ Vérifié au passage :
  **la voix de Massimo n'est jamais persistée** (`stt/service.py` — fichier temporaire, seules
  des métadonnées restent, `adr-0012`) ; la voix des capsules est la voix **synthétique** Piper.
  L'archive ne contiendra donc aucun enregistrement de l'enfant — mais elle contient tout le
  reste de sa vie scolaire, et le §1 en tire la conséquence.

## Décision

### §1 — L'archive naît sur un disque et y reste : **aucun octet d'archive ne passe par HTTP**

La sauvegarde s'écrit directement sur la cible montée (§2). Aucune route ne sert le contenu d'une
archive, ni en entier, ni par morceau. Les routes du §7 ne rendent que des **métadonnées** :
listes, tailles, empreintes, verdicts.

> La maquette demandait « le `.env` ne passe jamais par un téléchargement HTTP ». C'est vrai, et
> c'est **trop petit** : le dump contient les hash de mots de passe et toute la vie scolaire de
> Massimo. Un téléchargement navigateur ne mettrait d'ailleurs pas l'archive sur un autre disque
> physique — il la mettrait dans `~/Downloads`, c'est-à-dire sur le disque interne, sans manifeste
> et sans empreinte. Le geste « sauvegarder » et le geste « télécharger » ne font pas la même
> chose ; seule la première mérite le mot.

### §2 — L'archive couvre le **quatuor mesuré**, pas le trio annoncé — et ses exclusions sont écrites dedans

Un fichier `tar` : `zetis-AAAA-MM-JJ-hhmm.tar`, posé dans `ZETIS_BACKUP_DIR`, contenant :

1. le **dump SQL** Postgres (`pg_dump`, texte) ;
2. les **objets MinIO**, lus par l'**API S3** (jamais une copie de `/data` — format interne) ;
3. les **fichiers du volume audio** des capsules (`/shared/audio` — les WAV Piper que la maquette
   oubliait) ;
4. le **manifeste** (§5).

**Exclusions, écrites dans le manifeste** pour que Papa ne croie jamais sa restauration complète :

| Exclu | Motif écrit |
|---|---|
| `.env` | secrets — se remettent à la main, jamais dans une archive ni sur HTTP |
| Redis | état de file transitoire ; la mémoire durable, ce sont les `ai_jobs` et le journal (Postgres) |
| modèles (Piper, Whisper, Ollama) | régénérables — bakés dans l'image ou `ollama pull` (~21 Go hors archive, comme la maquette le voulait) |

La cible vit dans **`ZETIS_BACKUP_DIR`** (préfixe `ZETIS_` de `config.py`) : en prod, un **bind
mount** `${ZETIS_BACKUP_DIR:?}` → `/backups` sur `backend` **et** `worker` (le worker écrit,
le backend liste) — `:?` et non `:-`, doctrine du compose de prod : une prod sans cible de
sauvegarde ne démarre pas en silence. En dev, le backend natif lit la même variable.

### §3 — Le refus « même volume » vient d'un **certificat écrit par l'hôte** — et il est fail-closed

Les UUID de volume sont illisibles du conteneur et lisibles de l'hôte (mesuré, §Contexte). La
règle du backlog — *refuser si la cible et les données partagent un UUID de volume* — est donc
**tenue**, mais par l'hôte :

- un script `scripts/` (hôte, macOS) **certifie la cible** : il lit le `Volume UUID` de la cible
  (`diskutil`), localise `Docker.raw` (le `DataFolder` de Docker Desktop, **vérifié par la
  présence réelle du fichier** — pas cru sur parole : `settings-store.json` a déjà menti sur
  `AutoStart`), lit le `Volume UUID` du volume qui le porte, et écrit un fichier
  `.zetis-cible.json` **dans le répertoire cible** : les deux UUID, les deux chemins, la date ;
- le backend **refuse la sauvegarde** — 409 motivé sur la route, avant d'enfiler — si le
  certificat **manque**, est **illisible**, ou si les deux UUID sont **égaux**.

> **Fail-closed, et c'est le point.** Une cible non certifiée refuse — le premier geste après
> l'installation échoue donc **avec son motif et le nom du script à lancer**, et c'est voulu :
> c'est la doctrine de la page (*un cadenas dit pourquoi*, `adr-0062`). La limite est écrite en
> face : le certificat prouve l'état **au moment de la certification** ; des disques réarrangés
> ensuite ne se voient pas depuis le conteneur. Le signal du §Signaux surveille précisément ça.

### §4 — La sauvegarde est un travail de la **file existante** — et cette place achète la cohérence

`backup_create` est un `job_type` de `_EXECUTANTS`, enfilé par `travaux.enfiler`
(`created_by="file"`) : file prioritaire, worker de production, **concurrence 1**. Rien à
inventer pour l'affichage — la barre du header montre déjà les travaux de file, les échecs
s'acquittent déjà (`adr-0041`).

**Pourquoi cette file, alors qu'elle est partagée avec le GPU** — parce que la concurrence 1 est
un **achat**, pas un coût :

- pendant la sauvegarde, **aucun générateur n'écrit** (ils passent tous par ce worker) : le
  couple dump/objets ne peut diverger que par les gestes hors-file ;
- ce qui reste vivant pendant la sauvegarde : le **worker-media** (il *ajoute* des MP4, ne
  supprime jamais) et les **routes** (Papa peut supprimer une capsule). D'où l'**ordre imposé** :
  **le dump d'abord, les objets ensuite** — un objet créé après le dump est un orphelin
  inoffensif dans l'archive ; un objet référencé par le dump et disparu avant la copie est un
  couple incomplet, et le §5 **refuse** l'archive ;
- ce que la sauvegarde bloque, mesuré : le plus long lot réel terminé fait **146 s** ; le cycle
  complet dump + restauration tient **sous la seconde** aujourd'hui, loin du `job_timeout` de
  3 600 s. À l'échelle actuelle, le partage ne coûte rien de perceptible.

### §5 — Une archive incomplète **n'existe pas** : le manifeste compte, la création refuse

Le manifeste est écrit **dans** l'archive (scellé par l'empreinte) et porte :

- le **compte de lignes par table** (48 tables), pris **sur le même instantané que le dump** —
  `pg_export_snapshot()` puis `pg_dump --snapshot` : compter la base vivante après coup rendrait
  la vérification fausse dès qu'une ligne bouge entre les deux ;
- la **tête Alembic** et la version du serveur Postgres ;
- la **liste des objets et fichiers média archivés**, chacun avec taille et **sha256** ;
- les **exclusions** du §2, avec leur motif.

À la création, le travail vérifie le **couple** : toute capsule dont `video_url` /
`audio_url` est non nul doit avoir ses octets **dans l'archive**. Un référencé manquant ⇒ le
travail **échoue avec son motif**, l'archive partielle est supprimée — il ne reste rien qui
ressemble à une sauvegarde sans en être une. (Le cas existe : en dev, 8 vidéos référencées pour
1 objet présent — mesuré.)

L'**empreinte sha256 de l'archive** est écrite en sidecar (`.sha256`) et dans l'`output_json` du
travail. Un sidecar `.manifeste.json` (copie de lecture) permet à la page de lister sans ouvrir
les tars ; la **vérité scellée** reste celle de l'intérieur.

### §6 — « Vérifier » est le second travail de file : restauration à blanc dans `zetis_verify`, toujours détruite

`backup_verify`, sur une archive désignée :

1. empreinte du tar **vs** sidecar `.sha256` ;
2. `DROP DATABASE IF EXISTS zetis_verify` (le ménage d'une vérification interrompue), puis
   `CREATE DATABASE zetis_verify` ;
3. restauration du dump (`psql -v ON_ERROR_STOP=1`) ;
4. **comptage par table** vs manifeste · **tête Alembic** restaurée vs manifeste ;
5. **sha256 de chaque objet et fichier média** de l'archive vs manifeste ;
6. `DROP DATABASE zetis_verify` — **toujours**, succès ou échec.

Le verdict (date, archive, résultat, détail des écarts) vit dans l'`output_json` du travail ; la
page lit « dernière vérification » et l'affiche à côté de chaque archive. **La base `zetis` n'est
jamais touchée** : c'est ce qui rend le geste jouable un dimanche matin sans y penser. Prouvé sur
les vraies données : 0,29 s, 9 161/9 161, même tête, extension `vector` présente.

> Le nom `zetis_verify` est celui que le `BACKLOG.md` pose. La restauration se fait sur le **même
> serveur** que la base vivante — même version, même extension `vector`, zéro infrastructure
> neuve — et c'est aussi sa limite, écrite au §Conséquences.

### §7 — La surface : l'onglet 💾 s'ouvre avec **deux gestes**, des KPI **mesurés**, et les règles de la page

Trois routes, sur le routeur `/api/settings` existant (donc `require_parent` d'office) :

- `GET /api/settings/donnees` — l'état : archives (nom, date, taille, empreinte, vérifiée ou
  non), certificat de cible (présent · UUID distincts ou non), dernière vérification ;
- `POST /api/settings/donnees/sauvegarde` — 202 `{job_id}` (enfile `backup_create`) ; **409
  motivé** si le certificat manque ou refuse ;
- `POST /api/settings/donnees/verification` — 202 `{job_id}` (enfile `backup_verify` sur
  l'archive désignée).

L'onglet 💾 Données passe de « déclaré dans la carte » à **rendu**, avec ces seuls blocs — c'est
la condition du `adr-0062` §3 (un onglet n'existe que s'il a du contenu). Les KPI affichés sont
ceux du serveur (taille de la dernière archive, comptes du manifeste) — jamais les valeurs
inventées de la maquette. Une archive jamais vérifiée s'affiche pour ce qu'elle est : la page
l'appelle **« export non vérifié »**, le mot « sauvegarde » n'apparaît qu'après une restauration
à blanc réussie. C'est la phrase de la maquette qui méritait d'être gardée.

### §8 — Ce que la sauvegarde ne consomme PAS : « Suspendre ZETIS »

La sauvegarde est **additive** : elle ne remplace rien, `pg_dump` lit un instantané MVCC cohérent
par construction, et la place dans la file (§4) sérialise les écritures des générateurs. Exiger la
suspension ferait dépendre un geste mensuel d'un interrupteur que Papa devrait penser à lever —
le contraire d'un geste qu'on veut voir se faire.

La **restauration** (phase E), elle, suspendra avant de remplacer — c'est déjà écrit dans
l'`adr-0063` (« ce que la restauration en fera […] la séquence est à elle »). Rien ici ne
l'anticipe.

### §9 — L'export RGPD n'est **pas** cette archive : deux gestes, le second en phase E

La question laissée ouverte par la maquette (« un geste ou deux ? ») est tranchée : **deux**.
L'archive technique (illisible, complète, jamais téléchargée) et l'export « les données de
Massimo » (lisible, portable, remis en main — le RGPD personnel de `SECURITY.md`) n'ont ni le
même contenu, ni le même public, ni le même canal. La phase B livre la première ; le second reste
en phase E, où le `BACKLOG.md` le place déjà. **Signal de réouverture** : le jour où une donnée
de Massimo doit sortir de la maison sous forme lisible (changement d'outil, demande de l'école,
Massimo devenu grand) — ce jour-là, c'est l'export qu'on construit, pas l'archive qu'on tord.

## Alternatives considérées

| Alternative | Pourquoi écartée |
|---|---|
| **`pg_dump` par `docker exec`, cron côté hôte** | Sort du produit : pas de bouton, pas de barre, pas de manifeste-couple, pas de refus motivé. Et un script hôte de plus à superviser — la leçon de l'`adr-0046` est qu'un dispositif lancé à la main finit par ne plus tourner. L'hôte garde **un** rôle : certifier la cible (§3), ce que lui seul peut faire. |
| **Copier les volumes Docker à froid** (`postgres_data`, `minio_data`) | Exige d'éteindre la pile (une sauvegarde qui commence par arrêter ZETIS), copie des formats internes non portables (cluster PG lié à sa version majeure, `xl.meta` MinIO), et ne se laisse pas vérifier par restauration à blanc sans un second serveur. Le dump logique se restaure avec `psql` seul — prouvé. |
| **`st_dev`/`f_fsid` depuis le conteneur** pour le refus même-volume | La cible bind-montée (virtiofs) et les données (ext4 dans la VM) présentent **toujours** des systèmes de fichiers différents vus du conteneur, même posés sur le même disque physique. Un contrôle qui ne refuse jamais est pire qu'aucun contrôle. |
| **Une file ou un worker dédiés à la sauvegarde** | Un neuvième service pour un travail mensuel qui dure des secondes — et la parallélisation ferait **perdre** la sérialisation qui rend le couple cohérent (§4). |
| **Sauvegarder Redis** | État de file transitoire. La mémoire durable de ce qui a été produit, c'est le journal et les `ai_jobs` (Postgres, `adr-0034`). Un lot perdu se relance ; une ligne de journal perdue est perdue — et elle est dans le dump. |
| **Télécharger l'archive par le navigateur** | Les données de l'enfant et les hash de mots de passe par HTTP, vers le disque interne, sans empreinte ni manifeste (§1). |
| **Le manifeste en table** | Une migration pour décrire un fichier — et une archive doit rester lisible **sans** la base qu'elle sert à reconstruire. Le manifeste voyage dans l'archive, pas à côté d'elle. |
| **`pg_dump -Fc` + `pg_restore`** | Le format custom apporte parallélisme et restauration sélective — utiles à l'échelle du Go, rien à l'échelle mesurée (Mo). Le SQL texte se relit à l'œil, se restaure avec `psql` seul, et se diffe. À réévaluer le jour du signal de taille. |
| **Vérifier automatiquement après chaque sauvegarde** (un geste au lieu de deux) | Tentant à l'échelle actuelle (< 1 s). Mais la vérification consomme le serveur de prod (§Conséquences) et son coût croît avec la base ; enchaîner en silence transformerait un geste choisi en coût caché. Les deux gestes restent distincts — le §Signaux surveille si Papa ne fait jamais le second. |

## Périmètre

🔴 **Trois critères qui bornent, et ils mordent dès le premier jour :**

1. **Aucune écriture dans la base `zetis`, aucune migration Alembic.** `backup_create` ne fait
   que lire (et tenir son `AIJob`) ; `backup_verify` n'écrit que dans `zetis_verify`, qu'il
   détruit. Le manifeste vit en fichier. Le jour où ce chantier veut une colonne ou écrire dans
   `zetis`, il est sorti de son périmètre.
2. **Aucun octet d'archive sur HTTP.** Les routes rendent des métadonnées et des 202/409 — jamais
   un contenu, jamais un dump, jamais un objet.
3. **Rien de destructif hors `zetis_verify`.** Aucune suppression d'archive, aucune rotation,
   aucune purge, aucune remise à zéro — pas même « pour faire de la place ».

**Livré** : `postgresql-client-16` (dépôt PGDG, majeure **épinglée sur celle du serveur**
`pgvector/pgvector:pg16`) dans `backend.Dockerfile` · le script hôte de certification et son
certificat (§3) · `ZETIS_BACKUP_DIR` + bind mount prod (`backend` + `worker`) · le module de
sauvegarde, ses deux exécutants dans `_EXECUTANTS`, leurs amorces · les trois routes (§7) ·
l'onglet 💾 avec ses deux gestes et ses refus motivés · les tests (dont : archive refusée sur
couple incomplet, `zetis_verify` détruite même en échec, aucun octet d'archive servi par HTTP).

## Hors périmètre — nommé

- **Restaurer.** Phase E, classe A4, son propre ADR — c'est lui qui consommera l'`adr-0063` et
  l'étape ① de la maquette (« sauvegarde de l'état actuel avant remplacement »). L'écran
  « Importer une sauvegarde » de la maquette (verdict de compatibilité, simulation) appartient à
  ce chantier-là.
- **Purges, rétention, rotation des archives, remises à zéro, zone rouge** — phase E. Les
  archives s'accumulent sur la cible ; c'est accepté et visible (la page liste tout).
- **Export RGPD lisible** — §9, phase E, signal de réouverture écrit.
- **Planification automatique** (sauvegarde périodique). Le dépôt n'a qu'un réveil
  (`scan_triggers`, l'`adr-0023` en interdit un second) ; y brancher une sauvegarde mensuelle est
  une décision à part — avec sa vraie question : que vaut une sauvegarde qui échoue quand
  personne ne regarde ? Écrite ici pour ne pas se perdre.
- **Chiffrement de l'archive.** Assumé **non chiffré**, et écrit dans le manifeste : la clé de
  chiffrement devrait vivre dans le `.env` — que l'archive exclut — et une archive chiffrée dont
  la clé a brûlé avec le disque d'origine est une perte totale déguisée en prudence. La
  protection est physique et locale : un disque à la maison, jamais de HTTP. À rouvrir le jour où
  une archive quitte la maison.
- **Copie hors-site** (cloud, clé USB, e-mail à soi). La maquette la recommandait pour « les
  96 Mo de PDF » — un poste qui n'existe pas (mesuré). La question hors-site reste entière pour
  l'archive complète, mais c'est un geste humain sur un fichier, pas une route.
- **La cohabitation dev** : en dev le backend est natif et `ZETIS_BACKUP_DIR` pointe où on veut ;
  aucun aménagement spécifique n'est construit pour dev.

## Conséquences

**Ce que ça donne.** Le seul risque irréversible du projet est couvert : une année de travail de
Massimo tient dans un fichier daté, empreinté, **dont on a prouvé qu'il se rejoue**. La phase E
devient possible — on n'ose remplacer un état que parce qu'une archive vérifiée existe. Et le mot
« sauvegarde » cesse d'être un vœu : la page ne l'emploie qu'après une restauration à blanc
réussie.

**Ce que ça coûte.**

- **L'image backend grossit** (~30 Mo, client PostgreSQL + dépôt PGDG) et gagne une **contrainte
  d'alignement** : la majeure du client suit celle du serveur. Le jour où `pgvector/pgvector`
  passe en pg17, l'image doit suivre — un `pg_dump` plus vieux que son serveur refuse de servir.
- **Une étape d'installation nouvelle** : certifier la cible (script hôte) avant la première
  sauvegarde. Fail-closed — l'oublier bloque le geste avec son motif, il ne dégrade rien en
  silence.
- **La vérification consomme le serveur de prod** (CREATE + restauration + DROP sur la même
  instance). Négligeable aujourd'hui (< 1 s) ; le jour où la base pèse des Go, la restauration à
  blanc pèsera aussi — c'est un signal, pas une surprise.
- **Deux mots de plus dans le vocabulaire des travaux** (`backup_create`, `backup_verify`) :
  libellés et amorces à poser, comme pour tout type de file. ⚠️ Amorce au-dessus du
  `PLANCHER_MS` : un travail sous 2 s n'apprend rien à la barre (`travaux.py`) — les durées
  mesurées d'aujourd'hui sont dessous, et c'est très bien ainsi.
- **La sauvegarde attend derrière un lot en cours** (jusqu'à ~2,5 min mesurés sur les lots
  réels ; borne dure : le `job_timeout` de 3 600 s). Accepté : c'est le prix de la sérialisation
  qui rend le couple cohérent.

## Le signal qui dirait qu'on s'est trompé

- 🔴 **Une archive vérifiée échoue à la vraie restauration** (phase E). Alors la restauration à
  blanc ne prouvait pas ce qu'on croyait — le manifeste compte mal, ou le couple n'était pas le
  bon périmètre. C'est le signal le plus grave : il invalide le mot que cette page s'est donné.
- **Le certificat ment** — les disques ont été réarrangés après la certification et la sauvegarde
  écrit sur le volume des données sans qu'aucun refus ne parte. Alors le §3 ne suffit plus : il
  faut re-certifier à chaque sauvegarde (le script dans la boucle, pas seulement à
  l'installation), ou trouver une preuve plus vivante.
- **Papa sauvegarde et ne vérifie jamais.** Alors les deux gestes étaient un geste de trop, et
  l'alternative « vérifier automatiquement après chaque sauvegarde » doit être rouverte — pour la
  chaîne, pas pour le silence : un échec de vérification doit rester un événement qu'on voit.
- **La sauvegarde attend systématiquement derrière des lots longs**, ou un lot attend derrière
  une sauvegarde devenue lente. Alors la file partagée (§4) a cessé d'être un achat, et la file
  dédiée écartée redevient une option.
- **L'archive dépasse ce qu'un tar mensuel supporte** (des Go, des minutes). Alors le format
  texte + tar et l'absence de rotation cessent d'être tenables ensemble — `-Fc`, l'incrémental ou
  la rotation deviennent le prochain cadrage, avant la phase E s'il le faut.

## Suivi

1. **Slice 1 — le socle** : `postgresql-client-16` dans l'image · `ZETIS_BACKUP_DIR` + montages ·
   script hôte de certification · module + `backup_create` (dump sur instantané exporté, objets
   par l'API, audio, manifeste, empreinte, refus sur couple incomplet) · route de sauvegarde et
   son 409. Branche `feat/sauvegarde-qui-se-merite`.
2. **Slice 2 — la preuve** : `backup_verify` (les six étapes du §6, `zetis_verify` détruite en
   `finally`) · route de vérification · verdicts lisibles.
3. **Slice 3 — la surface** : l'onglet 💾 Données (deux gestes, KPI du serveur, refus motivés,
   « export non vérifié » tant que la restauration à blanc n'a pas réussi), sous les règles
   transverses de l'`adr-0062` §6.
4. **Read-before-code dus dans les slices** : le paquet PGDG exact pour bookworm/pg16 · la
   dérivation précise des médias référencés (`video_url`, `audio_url` → clés/chemins) · le
   comportement de `enfiler` face à un deuxième `backup_create` déjà en file (un doublon de
   sauvegarde est inoffensif mais bête — voir si le régulateur `duplicate` des lots a un
   équivalent à offrir ici, sans l'inventer).
5. La phase E (restaurer) **relira** cet ADR — le manifeste, l'empreinte et `zetis_verify` sont
   ses préconditions ; elle ne les redécide pas.
