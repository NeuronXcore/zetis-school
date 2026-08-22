"""La sauvegarde qui se mérite — `backup_create` (ADR-0065 §1-§5).

## Pourquoi ce module vit dans `settings/`, et pas dans `production/`

Les entrées de `production/jobs.py::_EXECUTANTS` sont des **adaptateurs** : chacun appelle un
service possédé par son domaine (`fiches.service`, `quizzes.service`…), jamais une implémentation
locale. Le domaine de la sauvegarde est la page Réglages ▸ Données : ses routes vivent sur le
routeur `/api/settings` (§7), son onglet 💾 arrive en slice 3. La direction d'import
`production → settings` existe déjà (`production/journal.py`), en lazy — aucun cycle nouveau.

## Les invariants que ce fichier tient (et que les tests verrouillent)

- **Aucun octet d'archive ne passe par HTTP** (§1) : rien ici ne rend un contenu — `refus()` rend
  un motif, `creer_sauvegarde()` rend des **métadonnées** (l'`output_json` du travail).
- **Une archive incomplète n'existe pas** (§5) : toute capsule dont `video_url` / `audio_url` est
  non nul doit avoir ses octets DANS l'archive, sinon le travail échoue avec son motif et
  l'archive partielle est **supprimée du disque**. Le cas est réel : en dev, 8 vidéos référencées
  pour 1 objet présent (mesuré au cadrage).
- **Le manifeste est compté sur l'instantané du dump** (§5) : `pg_export_snapshot()` puis
  `pg_dump --snapshot`, comptes et références lus sur la MÊME connexion. Compter la base vivante
  après coup rendrait la vérification (slice 2) fausse dès qu'une ligne bouge entre les deux.
- **Fail-closed** (§3) : certificat absent, illisible ou UUID égaux ⇒ la route refuse en 409,
  AVANT d'enfiler. Le worker revérifie (défense en profondeur — la file peut porter un travail
  enfilé avant un débranchement de disque).

## La dérivation `video_url` / `audio_url` → octets (read-before-code, §Suivi 4)

Les colonnes portent des **chemins d'API** (`/api/capsules/{id}/video`), jamais une clé S3 : la
dérivation se fait par l'**id de capsule**, via les conventions de `capsules/storage.py` —
vidéo = `capsules/{id}/video.mp4` (clé MinIO, ou même chemin sous le répertoire audio en backend
`disk`), audio = `capsules/{id}/scene_0.wav` (l'URL nomme cette scène-là — même contrat que
`scripts/check_media_integrity.py`).
"""

from __future__ import annotations

import hashlib
import io
import json
import logging
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import AIJob
from app.modules.settings import occupation

logger = logging.getLogger(__name__)

#: Le certificat que le script HÔTE écrit DANS le répertoire cible (§3). Les UUID de volume sont
#: illisibles depuis le conteneur (`diskutil` absent) et lisibles depuis l'hôte — mesuré au
#: cadrage : la règle « refuser si cible et données partagent un volume » est tenue par l'hôte.
CERTIFICAT = ".zetis-cible.json"

#: Nommé dans les motifs de refus : un cadenas dit pourquoi ET quoi faire (adr-0062 §6).
SCRIPT_CERTIFICATION = "scripts/certifier-cible-sauvegarde.sh"

#: Les deux `job_type` de la file (ADR-0065 §4 et §6), et le troisième (ADR-0066 §2).
JOB_TYPE = "backup_create"
JOB_TYPE_VERIFY = "backup_verify"
JOB_TYPE_RESTORE = "backup_restore"

#: Le nom d'archive tel que `creer_sauvegarde` le fabrique — et RIEN d'autre. Le nom de la route
#: de vérification vient du CLIENT : sans cette whitelist, `../` ou un chemin absolu ferait lire
#: n'importe quel fichier du conteneur (traversée de répertoire). Aucun séparateur ne peut passer.
_NOM_ARCHIVE = re.compile(r"^zetis-\d{4}-\d{2}-\d{2}-\d{4}\.tar$")

#: La base jetable de la restauration à blanc (§6) — le nom vient du BACKLOG, repris par l'ADR.
VERIFY_DB = "zetis_verify"

#: Les deux bases du swap (ADR-0066 §2.④ et §4) : la cible où le dump se rejoue, et le repli à
#: chaud que le swap laisse derrière lui — UNE seule `zetis_avant`, écrasée au geste suivant.
RESTORE_DB = "zetis_restore"
AVANT_DB = "zetis_avant"

#: `apps/backend` — où vivent `alembic.ini` et `alembic/`. Depuis `__file__` et jamais depuis le
#: cwd : uvicorn et le worker ne sont pas lancés du même endroit selon le déploiement.
_BACKEND_DIR = Path(__file__).resolve().parents[3]

#: Les exclusions du §2, écrites DANS le manifeste pour que Papa ne croie jamais sa restauration
#: complète. La liste vit ici, pas dans une f-string du pipeline : la slice 3 l'affichera telle
#: quelle, et deux copies auraient divergé au premier motif reformulé.
EXCLUSIONS = [
    {
        "quoi": ".env",
        "motif": "secrets — se remettent à la main, jamais dans une archive ni sur HTTP",
    },
    {
        "quoi": "redis",
        "motif": (
            "état de file transitoire ; la mémoire durable de ce qui a été produit, "
            "ce sont les ai_jobs et le journal — déjà dans le dump Postgres"
        ),
    },
    {
        "quoi": "modèles (Piper, Whisper, Ollama)",
        "motif": "régénérables — bakés dans l'image ou `ollama pull` (~21 Go hors archive)",
    },
]


class SauvegardeRefusee(RuntimeError):
    """La sauvegarde ne peut pas partir — et le motif est la seule chose qui compte.

    Non classée par `failures.is_transient`, donc **structurelle : zéro rejeu**. Un certificat
    absent ou un disque débranché ne reviendront pas dans une minute — rejouer ne produirait que
    du retard dans la file (un seul worker, ADR-0065 §4).
    """


class SauvegardeIncomplete(SauvegardeRefusee):
    """Le couple dump/médias ne ferme pas (§5) : un référencé n'a pas ses octets.

    Distinguée de `SauvegardeRefusee` pour les tests et la slice 3 (le libellé du refus) ; même
    verdict de rejeu : structurel, l'objet manquant ne repoussera pas tout seul.
    """


class RestaurationInterrompue(SauvegardeRefusee):
    """Une restauration (ADR-0066) s'est arrêtée en route — et elle ne se REJOUE JAMAIS.

    🔴 **C'est un verrou, pas une politesse de typage.** `enqueue_ai_job` pose un `Retry`, et
    `failures.is_transient` classe `ConnectionError` / `TimeoutError` natifs comme transitoires :
    une exception de ce type née d'une étape du geste ferait REJOUER toute la séquence — un
    second swap par-dessus un état à moitié remplacé. `restaurer_sauvegarde` enveloppe donc toute
    exception inattendue dans cette classe (héritière de `SauvegardeRefusee`, donc structurelle) :
    quoi qu'il arrive, zéro rejeu. Le sidecar `.restauration.json` dit où ça s'est arrêté (§3) ;
    la reprise est un geste HUMAIN (relancer, ou le runbook `zetis_avant` du §4).
    """


# --- Le refus AVANT d'enfiler (§3 + read-before-code : rien n'empêche deux `backup_create`) ------


def _certificat_refus(dossier: Path) -> str | None:
    """Le motif de refus du certificat, ou `None` s'il autorise.

    Fail-closed, et c'est le point (§3) : le premier geste après l'installation échoue AVEC son
    motif et le nom du script à lancer — il ne dégrade rien en silence.
    """
    chemin = dossier / CERTIFICAT
    try:
        brut = chemin.read_text(encoding="utf-8")
    except FileNotFoundError:
        return (
            f"Cible non certifiée : aucun certificat `{CERTIFICAT}` dans {dossier}. "
            f"Sur le Mac (hôte), lancez `{SCRIPT_CERTIFICATION} <répertoire cible>`, "
            "puis relancez la sauvegarde."
        )
    except OSError as exc:
        return (
            f"Certificat de cible illisible ({type(exc).__name__}) : re-certifiez la cible "
            f"avec `{SCRIPT_CERTIFICATION}`."
        )
    try:
        certificat = json.loads(brut)
        uuid_cible = certificat["uuid_cible"]
        uuid_donnees = certificat["uuid_donnees"]
    except (ValueError, TypeError, KeyError):
        return (
            f"Certificat de cible illisible ou incomplet (`{CERTIFICAT}`) : re-certifiez la "
            f"cible avec `{SCRIPT_CERTIFICATION}`."
        )
    if not uuid_cible or not uuid_donnees:
        return (
            f"Certificat de cible incomplet (UUID vide dans `{CERTIFICAT}`) : re-certifiez la "
            f"cible avec `{SCRIPT_CERTIFICATION}`."
        )
    if uuid_cible == uuid_donnees:
        return (
            "La cible de sauvegarde et les données vivent sur le MÊME volume "
            f"(UUID {uuid_cible}) : sauvegarder copierait le disque sur lui-même. "
            f"Choisissez une cible sur un autre disque physique et re-certifiez avec "
            f"`{SCRIPT_CERTIFICATION}`."
        )
    return None


def _en_file_ou_en_cours(db: Session, types: tuple[str, ...]):
    """La ligne `(id, job_type)` d'un travail de sauvegarde en `queued|running`, ou `None`.

    🔴 Read-before-code (§Suivi 4) : **rien d'autre ne l'empêche.** Le régulateur `duplicate` vit
    sur `create_run` (les LOTS) ; `travaux.enfiler` crée et enfile sans regarder les doublons.
    C'est donc la route qui refuse — un doublon de sauvegarde est inoffensif mais bête, et il
    tiendrait la file (concurrence 1) pour ne rien produire de plus.
    """
    return db.execute(
        select(AIJob.id, AIJob.job_type)
        .where(AIJob.job_type.in_(types), AIJob.status.in_(("queued", "running")))
        .limit(1)
    ).first()


def _sauvegarde_en_cours(db: Session) -> int | None:
    """L'id d'un `backup_create` en `queued|running`, ou `None` — le refus de la route de CRÉATION
    ne regarde que son propre type : une vérification en file ne bloque pas une sauvegarde (elles
    lisent des tars différents, et la concurrence 1 les sérialise de toute façon)."""
    ligne = _en_file_ou_en_cours(db, (JOB_TYPE,))
    return ligne.id if ligne is not None else None


def refus(db: Session) -> str | None:
    """Le motif du 409, ou `None` si la sauvegarde peut être enfilée. Appelé par la route,
    AVANT `travaux.enfiler` : quand il rend un motif, AUCUN job n'existe."""
    motif = _certificat_refus(Path(settings.backup_dir))
    if motif:
        return motif
    en_cours = _sauvegarde_en_cours(db)
    if en_cours is not None:
        return (
            f"Une sauvegarde est déjà en file ou en cours (travail #{en_cours}) : "
            "attendez sa fin avant d'en lancer une autre."
        )
    return None


# --- L'instantané : dump + comptes + références, sur le MÊME snapshot (§5) -----------------------


@dataclass
class ReferenceMedia:
    """Une capsule et ce qu'elle promet — lue sur l'instantané, jamais sur la base vivante."""

    capsule_id: int
    audio: bool
    video: bool


@dataclass
class Instantane:
    """Ce que le dump a vu, et RIEN d'autre : la vérité du manifeste (§5)."""

    dump_path: Path
    comptes: dict[str, int]
    tete_alembic: str | None
    version_serveur: str
    references: list[ReferenceMedia] = field(default_factory=list)


def _dsn_libpq() -> str:
    """`postgresql+psycopg://…` (SQLAlchemy) → `postgresql://…` (libpq / psycopg / pg_dump)."""
    return settings.database_url.replace("postgresql+psycopg://", "postgresql://", 1)


def _instantane(dossier_travail: Path) -> Instantane:
    """Exporte un snapshot, dumpe DESSUS, compte DESSUS — une seule vérité (§5).

    ⚠️ **Connexion psycopg DÉDIÉE, hors pool de l'app** : `pg_export_snapshot()` exige que la
    transaction qui l'a créé reste OUVERTE pendant tout le `pg_dump --snapshot`. La tenir sur une
    session du pool laisserait un `idle in transaction` gelant toute migration (incident déjà payé
    par le dépôt — ADR-0063 §Suivi 3). Ici : transaction `REPEATABLE READ` ouverte le temps du
    dump (< 1 s à l'échelle mesurée), fermée en `finally`, connexion jetée.

    ⚠️ Fonction REMPLACÉE dans les tests (SQLite n'a ni snapshot ni pg_dump) : c'est le point de
    greffe, comme `get_provider` pour le LLM. Tout ce qui suit — archive, couple, manifeste,
    empreinte — est testé sur le vrai code.
    """
    import psycopg

    dsn = _dsn_libpq()
    dump_path = dossier_travail / "dump.sql"
    conn = psycopg.connect(dsn)
    try:
        conn.isolation_level = psycopg.IsolationLevel.REPEATABLE_READ
        with conn.cursor() as cur:
            cur.execute("SELECT pg_export_snapshot()")
            snapshot_id = cur.fetchone()[0]

            cur.execute("SHOW server_version")
            version_serveur = cur.fetchone()[0]
            try:
                # Même lecture que `settings/machine.py::installation` — la tête vivante.
                cur.execute("SELECT version_num FROM alembic_version")
                ligne = cur.fetchone()
                tete_alembic = ligne[0] if ligne else None
            except psycopg.Error:
                tete_alembic = None

            cur.execute(
                "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
            )
            tables = [t for (t,) in cur.fetchall()]
            comptes: dict[str, int] = {}
            for table in tables:
                # Nom venu de pg_tables, pas d'une entrée utilisateur ; cité quand même.
                cur.execute(f'SELECT count(*) FROM "{table}"')
                comptes[table] = cur.fetchone()[0]

            cur.execute("SELECT id, audio_url, video_url FROM capsules ORDER BY id")
            references = [
                ReferenceMedia(capsule_id=cid, audio=bool(audio), video=bool(video))
                for cid, audio, video in cur.fetchall()
            ]

            # Le dump, SUR le snapshot exporté — pendant que la transaction le tient ouvert.
            resultat = subprocess.run(
                [
                    "pg_dump",
                    f"--snapshot={snapshot_id}",
                    "--format=plain",
                    f"--file={dump_path}",
                    dsn,
                ],
                capture_output=True,
                text=True,
            )
            if resultat.returncode != 0:
                raise SauvegardeRefusee(
                    f"pg_dump a échoué (code {resultat.returncode}) : "
                    f"{resultat.stderr.strip()[:500]}"
                )
    finally:
        conn.close()

    return Instantane(
        dump_path=dump_path,
        comptes=comptes,
        tete_alembic=tete_alembic,
        version_serveur=version_serveur,
        references=references,
    )


# --- L'archive : dump → objets → audio → manifeste scellé (ordre IMPOSÉ, §4) ---------------------


def _sha256_fichier(chemin: Path) -> str:
    empreinte = hashlib.sha256()
    with chemin.open("rb") as flux:
        for bloc in iter(lambda: flux.read(1024 * 1024), b""):
            empreinte.update(bloc)
    return empreinte.hexdigest()


def _ajouter_fichier(tar: tarfile.TarFile, arcnom: str, chemin: Path, membres: list[dict]) -> None:
    tar.add(chemin, arcname=arcnom, recursive=False)
    membres.append(
        {"chemin": arcnom, "taille": chemin.stat().st_size, "sha256": _sha256_fichier(chemin)}
    )


def _ajouter_octets(tar: tarfile.TarFile, arcnom: str, octets: bytes, membres: list[dict] | None) -> None:
    info = tarfile.TarInfo(name=arcnom)
    info.size = len(octets)
    tar.addfile(info, io.BytesIO(octets))
    if membres is not None:
        membres.append(
            {"chemin": arcnom, "taille": len(octets), "sha256": hashlib.sha256(octets).hexdigest()}
        )


def _archiver_objets(tar: tarfile.TarFile, membres: list[dict]) -> set[str]:
    """Les objets MinIO, lus par l'**API S3** — jamais une copie de `/data` (format interne
    `xl.meta`, mesuré au cadrage). Rend l'ensemble des clés archivées, pour le couple (§5).

    Backend `disk` : rien à faire ici — les MP4 vivent sous le répertoire audio, que
    `_archiver_audio` emporte. Un objet créé APRÈS le dump est un orphelin inoffensif dans
    l'archive (§4) ; un objet référencé par le dump et absent est un couple incomplet, refusé.
    """
    if settings.storage_backend != "minio":
        return set()

    from minio import Minio

    client = Minio(
        settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_secure,
    )
    bucket = settings.minio_bucket_capsules
    cles: set[str] = set()
    if not client.bucket_exists(bucket):
        return cles
    for objet in client.list_objects(bucket, recursive=True):
        cle = objet.object_name
        reponse = client.get_object(bucket, cle)
        try:
            octets = reponse.read()
        finally:
            reponse.close()
            reponse.release_conn()
        _ajouter_octets(tar, f"minio/{cle}", octets, membres)
        cles.add(cle)
    return cles


def _archiver_audio(tar: tarfile.TarFile, membres: list[dict]) -> set[str]:
    """Le volume audio des capsules (`/shared/audio`) — les WAV Piper que la maquette oubliait,
    et les MP4 du backend `disk`. Rend les chemins relatifs archivés, pour le couple (§5).

    Même vue que `capsules/storage.py` : `Path(settings.audio_storage_dir)` tel quel — c'est ce
    que l'application lit, donc ce que l'archive doit emporter. Un répertoire absent n'est pas
    une erreur : la prod mesurée porte 0 fichier audio, et c'est un état légitime.
    """
    racine = Path(settings.audio_storage_dir)
    archives: set[str] = set()
    if not racine.is_dir():
        return archives
    for chemin in sorted(p for p in racine.rglob("*") if p.is_file()):
        relatif = chemin.relative_to(racine).as_posix()
        _ajouter_fichier(tar, f"audio/{relatif}", chemin, membres)
        archives.add(relatif)
    return archives


def _couples_incomplets(
    references: list[ReferenceMedia], cles_objets: set[str], fichiers_audio: set[str]
) -> list[str]:
    """Ce que le dump promet et que l'archive n'a pas — la liste qui fait échouer (§5)."""
    manquants: list[str] = []
    backend_minio = settings.storage_backend == "minio"
    for ref in references:
        if ref.video:
            attendu = f"capsules/{ref.capsule_id}/video.mp4"
            present = attendu in cles_objets if backend_minio else attendu in fichiers_audio
            if not present:
                ou = "objet MinIO" if backend_minio else "fichier disque"
                manquants.append(f"capsule #{ref.capsule_id} — vidéo référencée sans {ou} ({attendu})")
        if ref.audio:
            attendu = f"capsules/{ref.capsule_id}/scene_0.wav"
            if attendu not in fichiers_audio:
                manquants.append(f"capsule #{ref.capsule_id} — audio référencé sans fichier ({attendu})")
    return manquants


def creer_sauvegarde() -> dict:
    """Le travail `backup_create` (§4-§5) : dump → objets → audio → manifeste → empreinte.

    ⚠️ **Ne prend PAS la session du worker** : les comptes et références viennent d'une connexion
    dédiée sur l'instantané exporté (§5) — lire la base vivante ici compterait faux dès qu'une
    ligne bouge entre le dump et le manifeste.

    L'ordre est IMPOSÉ (§4) : le dump d'abord, les médias ensuite. Un média créé après le dump est
    un orphelin inoffensif dans l'archive ; un média référencé par le dump et disparu avant la
    copie est un couple incomplet, et l'archive est SUPPRIMÉE — il ne reste rien qui ressemble à
    une sauvegarde sans en être une.

    Rend les métadonnées de l'archive (l'`output_json` du travail) — jamais un contenu (§1).
    """
    dossier = Path(settings.backup_dir)
    motif = refus_hors_file()
    if motif:
        raise SauvegardeRefusee(motif)

    horodatage = datetime.now()
    nom = f"zetis-{horodatage:%Y-%m-%d-%H%M}.tar"
    chemin_tar = dossier / nom
    if chemin_tar.exists():
        # Le périmètre interdit toute suppression d'archive — donc aussi un écrasement.
        raise SauvegardeRefusee(
            f"Une archive `{nom}` existe déjà sur la cible : attendez la minute suivante."
        )
    sidecar_sha = dossier / f"{nom}.sha256"
    sidecar_manifeste = dossier / f"{nom}.manifeste.json"

    membres: list[dict] = []
    try:
        with tempfile.TemporaryDirectory(prefix="zetis-sauvegarde-") as travail:
            inst = _instantane(Path(travail))
            with tarfile.open(chemin_tar, "w") as tar:
                _ajouter_fichier(tar, "dump.sql", inst.dump_path, membres)
                cles_objets = _archiver_objets(tar, membres)
                fichiers_audio = _archiver_audio(tar, membres)

                manquants = _couples_incomplets(inst.references, cles_objets, fichiers_audio)
                if manquants:
                    raise SauvegardeIncomplete(
                        "Archive refusée — le couple base/médias ne ferme pas : "
                        + " ; ".join(manquants[:20])
                        + (f" ; … ({len(manquants)} au total)" if len(manquants) > 20 else "")
                    )

                manifeste = {
                    "version": 1,
                    "archive": nom,
                    "cree_le": datetime.now(timezone.utc).isoformat(),
                    "base": {
                        "comptes_par_table": inst.comptes,
                        "lignes": sum(inst.comptes.values()),
                        "tables": len(inst.comptes),
                        "tete_alembic": inst.tete_alembic,
                        "version_serveur": inst.version_serveur,
                    },
                    "stockage_video": settings.storage_backend,
                    "membres": membres,
                    "exclusions": EXCLUSIONS,
                }
                octets_manifeste = json.dumps(manifeste, ensure_ascii=False, indent=2).encode()
                # Scellé : DANS l'archive (donc sous l'empreinte), membres=None — il ne se liste
                # pas lui-même.
                _ajouter_octets(tar, "manifeste.json", octets_manifeste, membres=None)

        empreinte = _sha256_fichier(chemin_tar)
        # `shasum -a 256 --check`-compatible : "<hex>  <nom>".
        sidecar_sha.write_text(f"{empreinte}  {nom}\n", encoding="utf-8")
        # Copie de LECTURE pour la page (slice 3) ; la vérité scellée reste celle de l'intérieur.
        sidecar_manifeste.write_bytes(octets_manifeste)
    except BaseException:
        # Une archive au couple incomplet — ou interrompue — N'EXISTE PAS (§5).
        chemin_tar.unlink(missing_ok=True)
        sidecar_sha.unlink(missing_ok=True)
        sidecar_manifeste.unlink(missing_ok=True)
        raise

    logger.info("sauvegarde: archive %s écrite (%s octets)", nom, chemin_tar.stat().st_size)
    return {
        "archive": nom,
        "taille": chemin_tar.stat().st_size,
        "sha256": empreinte,
        "lignes": sum(inst.comptes.values()),
        "tables": len(inst.comptes),
        "objets_minio": len(cles_objets),
        "fichiers_audio": len(fichiers_audio),
        "tete_alembic": inst.tete_alembic,
    }


def refus_hors_file() -> str | None:
    """La part du refus que le WORKER peut revérifier sans session (défense en profondeur) :
    le certificat seul — le doublon, lui, n'a de sens qu'avant l'enfilement."""
    return _certificat_refus(Path(settings.backup_dir))


# --- La vérification : restauration à blanc dans `zetis_verify` (§6) -----------------------------
#
# 🔴 **Verdict ≠ échec de job, et c'est l'ADR §6 qui tranche** : « le verdict (date, archive,
# résultat, détail des écarts) vit dans l'output_json du travail ». Une vérification qui a COURU
# jusqu'au bout rend donc un travail `succeeded` portant son verdict — y compris un verdict
# d'échec, écarts nommés. Le chemin d'échec de `run_ai_job` n'écrit pas `output_json` : y mettre
# les écarts les perdrait. `failed` reste réservé au dispositif cassé (archive disparue entre la
# route et le worker, Postgres injoignable).


def refus_verification(db: Session, nom: str) -> str | None:
    """Le motif du 409 de `POST /donnees/verification`, ou `None`. AVANT `enfiler` : quand il
    rend un motif, AUCUN job n'existe."""
    if not _NOM_ARCHIVE.match(nom):
        return (
            f"Nom d'archive invalide : « {nom} » — une archive ZETIS s'appelle "
            "zetis-AAAA-MM-JJ-hhmm.tar, sans chemin. Prenez le nom tel que la liste le rend."
        )
    dossier = Path(settings.backup_dir)
    if not (dossier / nom).is_file():
        return f"Archive « {nom} » introuvable sur la cible ({dossier})."
    if not (dossier / f"{nom}.sha256").is_file():
        return (
            f"Sidecar « {nom}.sha256 » absent : sans empreinte de référence, la vérification "
            "ne prouverait rien. Une archive de la slice 1 en a toujours un."
        )
    # Les DEUX types se bloquent ici : vérifier pendant une création lirait un tar en cours
    # d'écriture, et deux vérifications se disputeraient `zetis_verify`.
    en_cours = _en_file_ou_en_cours(db, (JOB_TYPE, JOB_TYPE_VERIFY))
    if en_cours is not None:
        return (
            f"Un travail de sauvegarde est déjà en file ou en cours "
            f"(travail #{en_cours.id}, {en_cours.job_type}) : attendez sa fin."
        )
    return None


@dataclass
class RestaurationABlanc:
    """Ce que la restauration à blanc a rendu — ou pourquoi elle n'a rien rendu."""

    comptes: dict[str, int] = field(default_factory=dict)
    tete_alembic: str | None = None
    #: Non vide = la restauration elle-même a échoué (psql sous ON_ERROR_STOP). C'est un VERDICT
    #: sur l'archive, pas une panne du dispositif : le dump ne se rejoue pas.
    erreurs: list[str] = field(default_factory=list)


def _dsn_pour(base: str) -> str:
    """Le DSN libpq de `settings.database_url`, pointé sur une AUTRE base du même serveur.

    Le dernier segment du chemin est le nom de base — vrai pour les DSN de ce dépôt
    (`…:5432/zetis`, sans query string). Vérifié au read-before-code sur le conteneur d'essai.
    """
    racine, _, _ = _dsn_libpq().rpartition("/")
    return f"{racine}/{base}"


def _restaurer_a_blanc(dump_path: Path) -> RestaurationABlanc:
    """②③④ du §6 : `zetis_verify` créée, le dump rejoué, les comptes relus — et la base DÉTRUITE
    en `finally`, succès ou échec.

    ⚠️ **Connexion admin en `autocommit=True`, et ce n'est pas un style** : `CREATE DATABASE`
    refuse un bloc de transaction (`ActiveSqlTransaction`, mesuré au read-before-code) — et
    psycopg3 ouvre une transaction implicite au premier ordre. C'est l'INVERSE de `_instantane`,
    qui tient exprès une transaction REPEATABLE READ.

    ⚠️ **`WITH (FORCE)` sur les deux DROP** (pg13+, vérifié sur pg16) : le premier est le ménage
    d'une vérification interrompue (§6 ②), le second tue toute connexion qui traînerait — mesuré :
    une connexion tenue meurt en `AdminShutdown`, le DROP passe.

    ⚠️ La seule base touchée en écriture est `zetis_verify` : la connexion admin vise `zetis`
    parce que `CREATE DATABASE` doit bien s'exécuter quelque part, mais n'y exécute RIEN d'autre
    que le couple DROP/CREATE — le périmètre de l'ADR en dépend, et un test le verrouille.

    Fonction REMPLACÉE dans les tests fonctionnels (SQLite n'a pas de `CREATE DATABASE`) — même
    point de greffe que `_instantane`. Sa structure (DROP en `finally`) est, elle, verrouillée
    sur le vrai code avec un faux module psycopg.
    """
    import psycopg

    admin = psycopg.connect(_dsn_libpq(), autocommit=True)
    try:
        admin.execute(f"DROP DATABASE IF EXISTS {VERIFY_DB} WITH (FORCE)")
        admin.execute(f"CREATE DATABASE {VERIFY_DB}")

        resultat = subprocess.run(
            ["psql", "-q", "-v", "ON_ERROR_STOP=1", "-f", str(dump_path), _dsn_pour(VERIFY_DB)],
            capture_output=True,
            text=True,
        )
        if resultat.returncode != 0:
            return RestaurationABlanc(
                erreurs=[
                    "restauration : psql a échoué sous ON_ERROR_STOP "
                    f"(code {resultat.returncode}) — {resultat.stderr.strip()[:500]}"
                ]
            )

        with psycopg.connect(_dsn_pour(VERIFY_DB)) as verify:
            lignes = verify.execute(
                "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
            ).fetchall()
            comptes: dict[str, int] = {}
            for (table,) in lignes:
                comptes[table] = verify.execute(f'SELECT count(*) FROM "{table}"').fetchone()[0]
            try:
                ligne = verify.execute("SELECT version_num FROM alembic_version").fetchone()
                tete = ligne[0] if ligne else None
            except psycopg.Error:
                tete = None
        return RestaurationABlanc(comptes=comptes, tete_alembic=tete)
    finally:
        try:
            admin.execute(f"DROP DATABASE IF EXISTS {VERIFY_DB} WITH (FORCE)")  # ⑥ TOUJOURS
        finally:
            admin.close()


def _sha256_membre(tar: tarfile.TarFile, membre: tarfile.TarInfo) -> str:
    empreinte = hashlib.sha256()
    flux = tar.extractfile(membre)
    for bloc in iter(lambda: flux.read(1024 * 1024), b""):
        empreinte.update(bloc)
    return empreinte.hexdigest()


def verifier_sauvegarde(nom: str) -> dict:
    """Le travail `backup_verify` (§6) : les six étapes, verdict détaillé en sortie.

    L'autorité des comparaisons est le **manifeste scellé DANS le tar** (§5 : « la vérité scellée
    reste celle de l'intérieur ») — jamais le sidecar `.manifeste.json`, simple copie de lecture.
    Un sidecar falsifié ne change pas le verdict ; le sidecar `.sha256`, lui, est justement ce
    qu'on confronte à l'archive (étape ①).
    """
    if not _NOM_ARCHIVE.match(nom):
        raise SauvegardeRefusee(f"Nom d'archive invalide : « {nom} ».")
    dossier = Path(settings.backup_dir)
    chemin_tar = dossier / nom
    sidecar_sha = dossier / f"{nom}.sha256"
    if not chemin_tar.is_file() or not sidecar_sha.is_file():
        # Vérifié par la route, mais le monde a pu bouger entre l'enfilement et l'exécution.
        raise SauvegardeRefusee(f"Archive « {nom} » ou son sidecar .sha256 introuvables sur la cible.")

    ecarts: list[str] = []
    restauration: RestaurationABlanc | None = None

    def _verdict(empreinte: str) -> dict:
        sortie = {
            "archive": nom,
            "sha256": empreinte,
            "verdict": "reussie" if not ecarts else "echec",
            "ecarts": ecarts,
            "verifie_le": datetime.now(timezone.utc).isoformat(),
        }
        if restauration is not None and not restauration.erreurs:
            sortie["lignes_restaurees"] = sum(restauration.comptes.values())
            sortie["tables_restaurees"] = len(restauration.comptes)
            sortie["tete_alembic"] = restauration.tete_alembic
        return sortie

    # ① L'empreinte du tar vs le sidecar — on ne restaure JAMAIS un tar qui ne se prouve pas.
    empreinte = _sha256_fichier(chemin_tar)
    attendue = sidecar_sha.read_text(encoding="utf-8").split()
    if not attendue or attendue[0] != empreinte:
        ecarts.append(
            "empreinte : le sha256 du tar ne correspond pas au sidecar .sha256 "
            "(archive corrompue, ou sidecar réécrit)"
        )
        return _verdict(empreinte)

    with tarfile.open(chemin_tar) as tar:
        try:
            manifeste = json.load(tar.extractfile("manifeste.json"))
            attendus = {
                membre["chemin"]: (membre["sha256"], membre["taille"])
                for membre in manifeste["membres"]
            }
            comptes_attendus = dict(manifeste["base"]["comptes_par_table"])
            tete_attendue = manifeste["base"]["tete_alembic"]
        except (KeyError, ValueError, TypeError):
            ecarts.append("manifeste : absent ou illisible dans l'archive — rien à quoi comparer")
            return _verdict(empreinte)

        # ⑤ Chaque membre vs le manifeste — dans les DEUX sens : un membre altéré, disparu ou
        # surnuméraire est un écart. (Fait avant la restauration : lire le tar est bon marché.)
        reels: dict[str, tuple[str, int]] = {}
        for membre in tar.getmembers():
            if membre.name == "manifeste.json" or not membre.isfile():
                continue
            reels[membre.name] = (_sha256_membre(tar, membre), membre.size)
        for chemin, (sha, _taille) in sorted(reels.items()):
            if chemin not in attendus:
                ecarts.append(f"membre : « {chemin} » présent dans l'archive mais absent du manifeste")
            elif attendus[chemin][0] != sha:
                ecarts.append(f"membre : « {chemin} » ne correspond pas à son empreinte du manifeste")
        for chemin in sorted(set(attendus) - set(reels)):
            ecarts.append(f"membre : « {chemin} » déclaré au manifeste mais absent de l'archive")

        # ②③④ La restauration à blanc, sur le dump extrait de l'archive (jamais un dump externe).
        with tempfile.TemporaryDirectory(prefix="zetis-verification-") as travail:
            dump_path = Path(travail) / "dump.sql"
            flux = tar.extractfile("dump.sql")
            if flux is None:
                ecarts.append("dump : « dump.sql » absent de l'archive")
                return _verdict(empreinte)
            with dump_path.open("wb") as sortie_dump:
                for bloc in iter(lambda: flux.read(1024 * 1024), b""):
                    sortie_dump.write(bloc)
            restauration = _restaurer_a_blanc(dump_path)

    if restauration.erreurs:
        ecarts.extend(restauration.erreurs)
    else:
        # ④ Comptage par table vs manifeste — les DEUX sens, table par table.
        for table in sorted(set(comptes_attendus) | set(restauration.comptes)):
            attendu = comptes_attendus.get(table)
            restaure = restauration.comptes.get(table)
            if attendu != restaure:
                ecarts.append(
                    f"comptes : table « {table} » — {attendu if attendu is not None else 'absente'} "
                    f"au manifeste, {restaure if restaure is not None else 'absente'} restaurée"
                )
        if restauration.tete_alembic != tete_attendue:
            ecarts.append(
                f"alembic : tête restaurée « {restauration.tete_alembic} » ≠ manifeste "
                f"« {tete_attendue} »"
            )

    verdict = _verdict(empreinte)
    logger.info("sauvegarde: vérification de %s — %s (%d écart(s))", nom, verdict["verdict"], len(ecarts))
    return verdict


# --- La restauration : un swap à réveil suspendu (ADR-0066 §1-§5) --------------------------------
#
# 🔴 **La ligne `ai_jobs` du travail MEURT au swap, et c'est structurel** (§3) : elle vit dans la
# base que le geste remplace — après le ④ elle est dans `zetis_avant`, pas dans `zetis`. Aucune
# ligne n'est recréée dans la base restaurée (y insérer une trace falsifierait l'histoire qu'on
# vient de restaurer) ; la fin de `run_ai_job` rend « introuvable » sans casser (garde dédié), la
# barre voit le travail s'évanouir, et c'est le sidecar `.restauration.json` qui raconte le geste.
#
# ⚠️ **Zéro rejeu, quelle que soit l'exception** : tout le corps de `restaurer_sauvegarde` est
# enveloppé en `RestaurationInterrompue` (structurelle). Voir la docstring de la classe.


# --- Le verdict de compatibilité (§5) : le manifeste contre le code, JAMAIS contre la base --------


def _tetes_connues() -> set[str]:
    """Les révisions Alembic que le code installé connaît — les ancêtres de head, head compris.

    `ScriptDirectory` sur `apps/backend/alembic` (les fichiers du code, pas la base vivante) :
    c'est la question du §5 — « le code sait-il servir ce schéma ? » — et elle se répond sans
    aucune connexion. Mesuré au read-before-code : head `a8a71c84f86e`, celui de l'ADR.
    """
    from alembic.script import ScriptDirectory

    scripts = ScriptDirectory(str(_BACKEND_DIR / "alembic"))
    return {r.revision for r in scripts.iterate_revisions("heads", None)}


def _compatibilite(tete_manifeste: str | None, connues: set[str]) -> tuple[bool, str | None]:
    """Les trois verdicts du §5 : `(restaurable, motif)`. Fail-closed sur tout ce qui manque."""
    if not tete_manifeste:
        return False, (
            "Le manifeste ne porte pas de tête Alembic : impossible de savoir quel schéma "
            "cette archive contient — elle ne se restaure pas."
        )
    if tete_manifeste in connues:
        # = head → l'upgrade du ⑦ sera un no-op (mesuré) ; plus ancienne → il rejoue les
        # migrations manquantes. ⚠️ Ce second chemin reste NON MESURÉ en vrai (§5) : aucune
        # archive d'une tête antérieure n'existe encore.
        return True, None
    return False, (
        f"Tête Alembic « {tete_manifeste} » inconnue du code installé (archive plus récente "
        "que le code, ou étrangère) : le code ne sait pas servir ce schéma — déployez d'abord "
        "une version qui le connaît."
    )


def _compat_archive(dossier: Path, nom: str, connues: set[str]) -> tuple[bool, str | None]:
    """Le verdict d'UNE archive, lu de son sidecar `.manifeste.json` — la copie de lecture (§5),
    jamais le tar (§1 : une lecture d'état n'ouvre aucun tar). Sidecar absent ⇒ fail-closed."""
    sidecar = dossier / f"{nom}.manifeste.json"
    try:
        tete = json.loads(sidecar.read_text(encoding="utf-8"))["base"].get("tete_alembic")
    except (OSError, ValueError, TypeError, KeyError):
        return False, (
            f"Sidecar « {nom}.manifeste.json » absent ou illisible : sans manifeste, aucun "
            "verdict de compatibilité — cette archive ne se restaure pas."
        )
    return _compatibilite(tete, connues)


# --- Le refus AVANT d'enfiler (§2 : toutes les préconditions en 409 motivé) -----------------------


def _verdicts_par_archive(db: Session) -> dict[str, str | None]:
    """Le dernier verdict `backup_verify` par archive — même lecture que `etat_donnees` : les
    travaux réussis du plus récent au plus ancien, le premier verdict vu par archive gagne
    (le verdict vit dans `output_json`, ADR-0065 §6)."""
    verdicts: dict[str, str | None] = {}
    sorties = db.execute(
        select(AIJob.output_json)
        .where(AIJob.job_type == JOB_TYPE_VERIFY, AIJob.status == "succeeded")
        .order_by(AIJob.id.desc())
        .limit(200)
    ).scalars()
    for sortie in sorties:
        if isinstance(sortie, dict) and sortie.get("archive"):
            verdicts.setdefault(sortie["archive"], sortie.get("verdict"))
    return verdicts


def _dernier_verdict(db: Session, nom: str) -> str | None:
    """Le verdict de la vérification la plus récente de CETTE archive, ou `None` si jamais
    vérifiée."""
    return _verdicts_par_archive(db).get(nom)


def refus_restauration(db: Session, nom: str) -> str | None:
    """Le motif du 409 de `POST /donnees/restauration`, ou `None`. AVANT `enfiler` : quand il
    rend un motif, AUCUN job n'existe (patron des refus du 0065).

    L'ordre des vérifications va du moins cher au plus cher, et chaque refus dit quoi faire :
    le geste est de classe A4 — tout ce qui n'est pas prouvé restaurable est refusé (§1, §2, §5).
    """
    if not _NOM_ARCHIVE.match(nom):
        return (
            f"Nom d'archive invalide : « {nom} » — une archive ZETIS s'appelle "
            "zetis-AAAA-MM-JJ-hhmm.tar, sans chemin. Prenez le nom tel que la liste le rend."
        )
    dossier = Path(settings.backup_dir)
    if not (dossier / nom).is_file():
        return f"Archive « {nom} » introuvable sur la cible ({dossier})."
    for sidecar in (f"{nom}.sha256", f"{nom}.manifeste.json"):
        if not (dossier / sidecar).is_file():
            return (
                f"Sidecar « {sidecar} » absent : sans lui, l'archive ne se prouve pas — "
                "elle ne se restaure pas."
            )

    # §1 — le mot se mérite dans les deux sens : seul le dernier verdict `reussie` ouvre le geste.
    verdict = _dernier_verdict(db, nom)
    if verdict != "reussie":
        etat = "en échec" if verdict == "echec" else "jamais vérifiée"
        return (
            f"Archive « {nom} » {etat} : restaurer ne s'offre qu'à une sauvegarde dont la "
            "dernière vérification est réussie (le mot se mérite dans les deux sens). "
            "Lancez d'abord « Vérifier » sur cette archive."
        )

    # §2 — le geste ne suspend pas à la place de Papa : il exige que le monde soit DÉJÀ arrêté.
    from app.modules.settings import service

    if not service.production_suspended(db):
        return (
            "ZETIS n'est pas suspendu : la restauration remplace l'état vivant et exige que "
            "le monde soit déjà arrêté. Suspendez d'abord avec le bouton « Suspendre ZETIS » "
            "(page Réglages), puis relancez."
        )

    # §2.⑧ — l'arrêt du worker EST le redémarrage seulement si quelque chose le relance.
    if not settings.production_worker_supervised:
        from app.modules.production.workers import MOTIF_NON_SUPERVISE

        return MOTIF_NON_SUPERVISE

    # §2 — aucun lot ni travail en vol : pendant une restauration, rien n'écrit, rien n'attend
    # son tour dans la famille sauvegarde (patron 0065 : deux gestes de sauvegarde ne se
    # chevauchent jamais, `queued` compris).
    en_cours = _en_file_ou_en_cours(db, (JOB_TYPE, JOB_TYPE_VERIFY, JOB_TYPE_RESTORE))
    if en_cours is not None:
        return (
            f"Un travail de sauvegarde est déjà en file ou en cours "
            f"(travail #{en_cours.id}, {en_cours.job_type}) : attendez sa fin."
        )
    travail = db.execute(
        select(AIJob.id, AIJob.job_type).where(AIJob.status == "running").limit(1)
    ).first()
    if travail is not None:
        return (
            f"Un travail est en cours (travail #{travail.id}, {travail.job_type}) : "
            "attendez sa fin — pendant une restauration, rien ne doit écrire."
        )
    from app.db.models import ProductionRun

    lot = db.execute(
        select(ProductionRun.id).where(ProductionRun.status == "running").limit(1)
    ).first()
    if lot is not None:
        return (
            f"Un lot de production est en cours (lot #{lot.id}) : attendez sa fin — "
            "pendant une restauration, rien ne doit écrire."
        )

    # §5 — le verdict de compatibilité, rendu AVANT le geste.
    try:
        connues = _tetes_connues()
    except Exception as exc:  # noqa: BLE001 — fail-closed : sans réponse, pas de geste A4
        return f"Impossible de lire les migrations du code ({type(exc).__name__}) : refus."
    restaurable, motif = _compat_archive(dossier, nom, connues)
    if not restaurable:
        return motif
    return None


# --- Le sidecar `.restauration.json` (§3) : le journal du geste, écrit ÉTAPE PAR ÉTAPE ------------


#: Les huit étapes du §2, dans l'ordre — les noms que le sidecar et la slice 2 emploient.
ETAPES_RESTAURATION = (
    "filet",
    "restauration",
    "reveil",
    "swap",
    "medias",
    "purge_files",
    "migrations",
    "recyclage",
)


class _JournalRestauration:
    """Le sidecar, réécrit sur la CIBLE à chaque étape : un crash au milieu laisse un fichier
    qui dit où ça s'est arrêté (§3). Même famille que `.sha256` et `.manifeste.json` — lisible
    sans la base qu'il raconte."""

    def __init__(self, chemin: Path, archive: str) -> None:
        self._chemin = chemin
        self.donnees: dict = {
            "version": 1,
            "archive": archive,
            "commence_le": datetime.now(timezone.utc).isoformat(),
            "termine_le": None,
            "etapes": [],
            "ecarts": [],
        }
        self._ecrire()

    def _ecrire(self) -> None:
        self._chemin.write_text(
            json.dumps(self.donnees, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    def franchir(self, etape: str, **detail) -> None:
        entree = {"etape": etape, "statut": "franchie", "le": datetime.now(timezone.utc).isoformat()}
        if detail:
            entree["detail"] = detail
        self.donnees["etapes"].append(entree)
        self._ecrire()

    def echouer(self, etape: str, motif: str) -> None:
        self.donnees["etapes"].append(
            {
                "etape": etape,
                "statut": "echec",
                "le": datetime.now(timezone.utc).isoformat(),
                "motif": motif[:1000],
            }
        )
        self._ecrire()

    def ecart(self, motif: str) -> None:
        self.donnees["ecarts"].append(motif)
        self._ecrire()

    def terminer(self) -> None:
        self.donnees["termine_le"] = datetime.now(timezone.utc).isoformat()
        self._ecrire()


@contextmanager
def _etape(journal: _JournalRestauration, nom: str):
    """L'échec d'une étape s'écrit AVANT de lever : le sidecar survit au crash (§3)."""
    try:
        yield
    except BaseException as exc:
        journal.echouer(nom, str(exc) or type(exc).__name__)
        raise


# --- Les étapes ② à ⑧ — chacune est un point de greffe patchable (patron `_instantane`) -----------


def _restaurer_dans(base: str, dump_path: Path) -> None:
    """② : la mécanique prouvée de `zetis_verify` (ADR-0065 §6) — DROP/CREATE puis `psql -v
    ON_ERROR_STOP=1` — SANS destruction finale : cette base-là est la CIBLE du swap.

    Fonction DISTINCTE de `_restaurer_a_blanc`, et c'est tranché au read-before-code : un
    paramètre « ne détruis pas à la fin » aurait mélangé deux sémantiques (jetable vs cible) et
    affaibli le test-verrou qui asserte la liste exacte des ordres de la vérification.

    ⚠️ **Connexion admin sur `postgres`, pas sur `zetis`** — l'inverse de `_restaurer_a_blanc`.
    Le geste enchaîne sur le swap (④), qui termine toutes les connexions de la base courante puis
    la renomme : une connexion admin qui y vivrait ferait échouer son propre RENAME.

    Un `psql` qui tombe est un refus structurel : RIEN n'a été remplacé, `zetis` est intacte.
    """
    import psycopg

    admin = psycopg.connect(_dsn_pour("postgres"), autocommit=True)
    try:
        admin.execute(f"DROP DATABASE IF EXISTS {base} WITH (FORCE)")  # ménage d'un essai interrompu
        admin.execute(f"CREATE DATABASE {base}")
    finally:
        admin.close()

    resultat = subprocess.run(
        ["psql", "-q", "-v", "ON_ERROR_STOP=1", "-f", str(dump_path), _dsn_pour(base)],
        capture_output=True,
        text=True,
    )
    if resultat.returncode != 0:
        raise SauvegardeRefusee(
            f"restauration : psql a échoué sous ON_ERROR_STOP (code {resultat.returncode}) "
            f"— {resultat.stderr.strip()[:500]} ; rien n'a été remplacé."
        )


def _cles_reveil() -> list[tuple[str, str]]:
    """③ : ce que la base restaurée doit porter AVANT de devenir `zetis` — suspendue (adr-0063 :
    elle ne se relève jamais seule), régime MANUAL, déclencheur désarmé (une archive AUTONOM ne
    réarme pas AUTONOM en silence). Les paliers sont DÉRIVÉS de `service.NIVEAUX` — une copie
    locale aurait divergé au premier réglage renommé."""
    from app.modules.settings import service

    cles = [(service.PRODUCTION_SUSPENDED_KEY, "true"), (service.AUTO_TRIGGER_KEY, "false")]
    cles += [(cle, str(palier)) for cle, palier in sorted(service.NIVEAUX["manuel"].items())]
    return cles


def _ecrire_reveil(base: str, archive: str) -> dict:
    """③ : upserts `app_settings` DANS la base restaurée, avant le swap (mesuré au cadrage) —
    puis la **clôture des travaux d'une autre époque** (ADR-0066 Amendement 1) : les `ai_jobs`
    et `production_runs` restaurés en `queued|running` passent à `failed`, motivés et datés.

    🔴 **Clore n'est pas falsifier** (frontière du §3, précisée par l'amendement) : aucune ligne
    n'est insérée, et l'histoire accomplie (`succeeded`/`done`/`failed`) n'est jamais réécrite —
    le WHERE le garantit. Sans cette clôture, toute archive fait revivre son propre créateur en
    éternel « en cours » (le dump est pris PENDANT le travail qui le crée) : barre fantôme, et
    TOUTE la famille sauvegarde refuse en 409 au motif menteur « attendez sa fin » — mesuré le
    2026-08-19 : l'état post-restauration ne pouvait même plus se sauvegarder.

    Les lignes closes tombent dans **Échecs** tel qu'il existe (`status='failed'` +
    `error_message`, acquittement adr-0041 §8) : aucune surface neuve.

    Rend le détail du sidecar : clés écrites, ids des travaux et des lots clos.
    """
    import psycopg

    motif = (
        f"Interrompu par la restauration de « {archive} » : ce travail vivait dans l'archive "
        "restaurée — une autre époque ; il ne reprendra pas."
    )
    ecrit: list[str] = []
    conn = psycopg.connect(_dsn_pour(base), autocommit=True)
    try:
        for cle, valeur in _cles_reveil():
            conn.execute(
                "INSERT INTO app_settings (key, value, created_at, updated_at) "
                "VALUES (%s, %s, now(), now()) "
                "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()",
                (cle, valeur),
            )
            ecrit.append(cle)
        travaux = conn.execute(
            "UPDATE ai_jobs SET status = 'failed', error_message = %s, finished_at = now() "
            "WHERE status IN ('queued', 'running') RETURNING id",
            (motif,),
        ).fetchall()
        lots = conn.execute(
            "UPDATE production_runs SET status = 'failed', finished_at = now() "
            "WHERE status IN ('queued', 'running') RETURNING id"
        ).fetchall()
    finally:
        conn.close()
    return {
        "cles": ecrit,
        "travaux_clos": [ligne[0] for ligne in travaux],
        "lots_clos": [ligne[0] for ligne in lots],
    }


def _neutraliser_pool() -> None:
    """④ (préambule) : le pool SQLAlchemy du worker porte des connexions vers la base que le
    swap va terminer — les fermer AVANT, sinon le geste tue les connexions de son propre
    processus et la fin de `run_ai_job` tomberait sur une connexion morte. Le pool se
    reconstruit tout seul à la demande — sur la NOUVELLE base (mesuré au cadrage)."""
    from app.db import base

    base.engine.dispose()


def _base_courante() -> str:
    """Le nom de la base de production, DÉRIVÉ du DSN (`…/zetis`) — jamais écrit en dur."""
    return _dsn_libpq().rpartition("/")[2]


def _swap() -> None:
    """④ : terminer toutes les connexions de la base courante, écraser `zetis_avant`, puis le
    double RENAME — 8 ms mesurés, la fenêtre d'indisponibilité de l'ADR.

    Connexion admin sur `postgres` (voir `_restaurer_dans`) : une connexion à la base courante
    ne pourrait pas la renommer. L'ordre est VERROUILLÉ par test : le DROP de `zetis_avant`
    part avant le premier RENAME, sinon le RENAME échoue sur un nom déjà pris.
    """
    import psycopg

    courante = _base_courante()
    admin = psycopg.connect(_dsn_pour("postgres"), autocommit=True)
    try:
        admin.execute(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = %s",
            (courante,),
        )
        admin.execute(f"DROP DATABASE IF EXISTS {AVANT_DB} WITH (FORCE)")
        admin.execute(f"ALTER DATABASE {courante} RENAME TO {AVANT_DB}")
        admin.execute(f"ALTER DATABASE {RESTORE_DB} RENAME TO {courante}")
    finally:
        admin.close()


def _membre_sain(nom_membre: str, prefixe: str) -> str:
    """Le chemin relatif d'un membre d'archive, ou un refus : `..` et les chemins absolus ne
    sortent JAMAIS du tar — même fail-closed que la whitelist du nom d'archive."""
    relatif = nom_membre[len(prefixe):]
    if not relatif or relatif.startswith("/") or ".." in Path(relatif).parts:
        raise SauvegardeRefusee(f"membre d'archive suspect : « {nom_membre} » — restauration refusée.")
    return relatif


def _remplacer_medias(chemin_tar: Path) -> dict:
    """⑤ : le bucket et `/shared/audio` REMPLACÉS depuis l'archive — vidés puis réécrits, en
    couple ou rien (une base sans son bucket, c'est chaque capsule qui casse). Le filet du ①
    couvre l'état d'avant.

    ⚠️ `remove_objects` rend un itérateur PARESSEUX : il faut le consommer, sinon rien ne part
    (vérifié dans la lib au read-before-code).
    """
    objets = fichiers = 0
    with tarfile.open(chemin_tar) as tar:
        membres = [m for m in tar.getmembers() if m.isfile()]

        if settings.storage_backend == "minio":
            from minio import Minio
            from minio.deleteobjects import DeleteObject

            client = Minio(
                settings.minio_endpoint,
                access_key=settings.minio_access_key,
                secret_key=settings.minio_secret_key,
                secure=settings.minio_secure,
            )
            bucket = settings.minio_bucket_capsules
            if client.bucket_exists(bucket):
                a_supprimer = [
                    DeleteObject(o.object_name)
                    for o in client.list_objects(bucket, recursive=True)
                ]
                erreurs = list(client.remove_objects(bucket, a_supprimer))
                if erreurs:
                    raise SauvegardeRefusee(
                        f"purge du bucket « {bucket} » : {len(erreurs)} erreur(s) — "
                        f"{erreurs[0]}"
                    )
            else:
                client.make_bucket(bucket)
            for membre in membres:
                if not membre.name.startswith("minio/"):
                    continue
                cle = _membre_sain(membre.name, "minio/")
                flux = tar.extractfile(membre)
                client.put_object(bucket, cle, flux, length=membre.size)
                objets += 1

        racine = Path(settings.audio_storage_dir)
        racine.mkdir(parents=True, exist_ok=True)
        for enfant in racine.iterdir():
            shutil.rmtree(enfant) if enfant.is_dir() else enfant.unlink()
        for membre in membres:
            if not membre.name.startswith("audio/"):
                continue
            relatif = _membre_sain(membre.name, "audio/")
            destination = racine / relatif
            destination.parent.mkdir(parents=True, exist_ok=True)
            flux = tar.extractfile(membre)
            with destination.open("wb") as sortie:
                shutil.copyfileobj(flux, sortie)
            fichiers += 1
    return {"objets_minio": objets, "fichiers_audio": fichiers}


def _purger_files_redis() -> dict:
    """⑥ : les files de production ET leurs registres planifiés — le transitoire d'avant-swap
    pointe des ids d'une autre histoire. Le réveil du scan purgé n'est pas perdu : le worker
    recyclé au ⑧ le réamorce (`production_worker.py` : `scan_already_planned` → amorçage).
    La file `media` n'est PAS touchée : le destructif est ÉNUMÉRÉ (§Périmètre 3)."""
    from rq.registry import ScheduledJobRegistry

    from app.core.queue import production_queues

    purges = planifies = 0
    for file in production_queues():
        purges += len(file.get_job_ids()) if hasattr(file, "get_job_ids") else 0
        file.empty()
        registre = ScheduledJobRegistry(queue=file)
        for job_id in registre.get_job_ids():
            registre.remove(job_id, delete_job=True)
            planifies += 1
    return {"jobs_purges": purges, "reveils_purges": planifies}


def _alembic_upgrade() -> None:
    """⑦ : `alembic upgrade head` sur la base restaurée — no-op si la tête est celle du code
    (mesuré), rejoue les migrations manquantes sinon (§5). En subprocess et cwd `apps/backend`,
    comme l'entrypoint : le même geste, depuis le même endroit."""
    resultat = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=str(_BACKEND_DIR),
        capture_output=True,
        text=True,
    )
    if resultat.returncode != 0:
        raise SauvegardeRefusee(
            f"alembic upgrade head a échoué (code {resultat.returncode}) — "
            f"{resultat.stderr.strip()[:500]}"
        )


def _arret_worker() -> bool:
    """⑧ : warm shutdown de SOI-MÊME. Vérifié dans la lib (rq 2.11) au read-before-code :
    `send_shutdown_command` publie sur le canal du worker → SIGINT → état BUSY → RQ pose un
    drapeau et **laisse la pièce en cours se terminer** (le statut du travail s'écrit), puis le
    worker sort et le superviseur le relance (adr-0064 : l'arrêt EST le redémarrage).

    Rend `False` hors worker (tests, appel direct) : le recyclage est alors l'affaire de qui a
    appelé — jamais une erreur.
    """
    from rq import get_current_job

    try:
        job = get_current_job()
    except Exception:  # noqa: BLE001 — pas de worker courant : la question n'a pas de sens
        job = None
    nom_worker = getattr(job, "worker_name", None) if job is not None else None
    if not nom_worker:
        logger.warning("restauration: aucun worker courant — recyclage ⑧ sauté (appel hors file)")
        return False

    from rq.command import send_shutdown_command

    from app.core.queue import _redis

    send_shutdown_command(_redis(), nom_worker)
    return True


# --- Le geste (§2) : les huit étapes, dans l'ordre, sous journal ----------------------------------


def restaurer_sauvegarde(nom: str) -> dict:
    """Le travail `backup_restore` (ADR-0066 §2) : filet ① · restore ② · réveil ③ · swap ④ ·
    médias ⑤ · purge ⑥ · upgrade ⑦ · recyclage ⑧ — et le sidecar écrit étape par étape (§3).

    ⚠️ **Ne prend NI session NI LLM** (patron `_backup_create`) : les préconditions à session
    (verdict `reussie`, suspension, travaux en vol) vivent sur la route — le worker revérifie ce
    qui se revérifie sans base (nom, fichiers, compatibilité, supervision).

    🔴 **Jamais sans filet** : si le ① refuse, RIEN n'est remplacé — la restauration s'arrête là.

    Rend les métadonnées du geste (l'`output_json` du travail… qui mourra au swap, §3 — le
    sidecar est la trace qui survit).
    """
    if not _NOM_ARCHIVE.match(nom):
        raise SauvegardeRefusee(f"Nom d'archive invalide : « {nom} ».")
    dossier = Path(settings.backup_dir)
    chemin_tar = dossier / nom
    if (
        not chemin_tar.is_file()
        or not (dossier / f"{nom}.sha256").is_file()
        or not (dossier / f"{nom}.manifeste.json").is_file()
    ):
        # Vérifié par la route, mais le monde a pu bouger entre l'enfilement et l'exécution.
        raise SauvegardeRefusee(f"Archive « {nom} » ou ses sidecars introuvables sur la cible.")
    if not settings.production_worker_supervised:
        from app.modules.production.workers import MOTIF_NON_SUPERVISE

        raise SauvegardeRefusee(MOTIF_NON_SUPERVISE)
    restaurable, motif = _compat_archive(dossier, nom, _tetes_connues())
    if not restaurable:
        raise SauvegardeRefusee(motif)

    journal = _JournalRestauration(dossier / f"{nom}.restauration.json", archive=nom)
    try:
        # ① La sauvegarde-filet, non négociable : s'il refuse, RIEN n'est remplacé.
        with _etape(journal, "filet"):
            filet = creer_sauvegarde()
        journal.franchir(
            "filet",
            archive=filet["archive"],
            lignes=filet["lignes"],
            tables=filet["tables"],
        )

        # ② Le dump de l'archive, rejoué dans `zetis_restore`.
        with _etape(journal, "restauration"):
            with tempfile.TemporaryDirectory(prefix="zetis-restauration-") as travail:
                dump_path = Path(travail) / "dump.sql"
                with tarfile.open(chemin_tar) as tar:
                    flux = tar.extractfile("dump.sql")
                    if flux is None:
                        raise SauvegardeRefusee(f"« dump.sql » absent de l'archive « {nom} ».")
                    with dump_path.open("wb") as sortie:
                        shutil.copyfileobj(flux, sortie)
                _restaurer_dans(RESTORE_DB, dump_path)
        journal.franchir("restauration", base=RESTORE_DB)

        # ③ Le réveil, écrit DANS la base restaurée AVANT le swap — suspension, régime,
        # déclencheur, ET la clôture des travaux d'une autre époque (Amendement 1).
        with _etape(journal, "reveil"):
            reveil = _ecrire_reveil(RESTORE_DB, nom)
        journal.franchir("reveil", **reveil)

        # ④ Le swap — 8 ms mesurés. Le pool du worker est neutralisé d'abord (voir la fonction).
        with _etape(journal, "swap"):
            _neutraliser_pool()
            _swap()
        journal.franchir("swap", avant=AVANT_DB)

        # ⑤ Les médias, en couple ou rien.
        with _etape(journal, "medias"):
            medias = _remplacer_medias(chemin_tar)
        journal.franchir("medias", **medias)

        # ⑥ Le transitoire d'avant-swap pointe des ids d'une autre histoire.
        with _etape(journal, "purge_files"):
            purge = _purger_files_redis()
        journal.franchir("purge_files", **purge)

        # ⑦ Le schéma attendu par le code, garanti.
        with _etape(journal, "migrations"):
            _alembic_upgrade()
        journal.franchir("migrations")

        # ⑧ Le worker se recycle — un SimpleWorker ne recharge ni code ni schéma.
        with _etape(journal, "recyclage"):
            demande = _arret_worker()
        journal.franchir("recyclage", demande=demande)
        if not demande:
            journal.ecart("recyclage ⑧ non demandé : aucun worker courant (appel hors file)")

        journal.terminer()
    except SauvegardeRefusee:
        raise
    except Exception as exc:
        # 🔴 Zéro rejeu, quelle que soit l'exception — voir `RestaurationInterrompue`.
        raise RestaurationInterrompue(
            f"restauration de « {nom} » interrompue : {exc}"
        ) from exc

    logger.info("restauration: %s restaurée — l'état d'avant vit dans %s", nom, AVANT_DB)
    return {
        "archive": nom,
        "filet": filet["archive"],
        "base_avant": AVANT_DB,
        **medias,
        **purge,
        "recyclage_demande": demande,
    }


# --- La suppression d'archive (ADR-0066 §6) : un geste explicite, jamais une rotation -------------


def refus_suppression(db: Session, nom: str) -> str | None:
    """Le motif du 409 de `DELETE /donnees/archives/{nom}`, ou `None`. Quand il rend un motif,
    RIEN n'est supprimé (fail-closed, patron des refus du module).

    🔴 **La dernière archive au verdict `reussie` ne se supprime pas** tant qu'aucune AUTRE
    archive vérifiée n'existe sur la cible (§6) : on ne se met jamais soi-même à zéro filet.
    Une archive non vérifiée ou en échec, elle, se supprime dès que rien ne la lit.
    """
    if not _NOM_ARCHIVE.match(nom):
        return (
            f"Nom d'archive invalide : « {nom} » — une archive ZETIS s'appelle "
            "zetis-AAAA-MM-JJ-hhmm.tar, sans chemin. Prenez le nom tel que la liste le rend."
        )
    dossier = Path(settings.backup_dir)
    if not (dossier / nom).is_file():
        return f"Archive « {nom} » introuvable sur la cible ({dossier})."
    # Toute la famille bloque : une création écrit peut-être CE tar, une vérification ou une
    # restauration le lit peut-être — supprimer sous leurs pieds n'a aucun sens.
    en_cours = _en_file_ou_en_cours(db, (JOB_TYPE, JOB_TYPE_VERIFY, JOB_TYPE_RESTORE))
    if en_cours is not None:
        return (
            f"Un travail de sauvegarde est déjà en file ou en cours "
            f"(travail #{en_cours.id}, {en_cours.job_type}) : attendez sa fin."
        )
    verdicts = _verdicts_par_archive(db)
    if verdicts.get(nom) == "reussie":
        autres_verifiees = [
            autre.name
            for autre in dossier.glob("zetis-*.tar")
            if autre.name != nom
            and _NOM_ARCHIVE.match(autre.name)
            and verdicts.get(autre.name) == "reussie"
        ]
        if not autres_verifiees:
            return (
                f"« {nom} » est la dernière archive au verdict « réussie » : la supprimer "
                "laisserait ZETIS sans aucune sauvegarde prouvée (on ne se met jamais soi-même "
                "à zéro filet). Vérifiez d'abord une autre archive, puis revenez."
            )
    return None


def supprimer_sauvegarde(nom: str) -> dict:
    """Le tar ET tous ses sidecars (`.sha256`, `.manifeste.json`, `.restauration.json`, et tout
    sidecar futur du même nom) — rien d'orphelin (§6). Rend les NOMS retirés, jamais un contenu.

    La whitelist est revérifiée ici (défense en profondeur, patron `verifier_sauvegarde`), et
    c'est elle qui rend le glob `{nom}.*` sûr : un nom validé ne porte aucun métacaractère.
    """
    if not _NOM_ARCHIVE.match(nom):
        raise SauvegardeRefusee(f"Nom d'archive invalide : « {nom} ».")
    dossier = Path(settings.backup_dir)
    supprimes: list[str] = []
    for chemin in [dossier / nom, *sorted(dossier.glob(f"{nom}.*"))]:
        if chemin.is_file():
            chemin.unlink()
            supprimes.append(chemin.name)
    logger.info("sauvegarde: archive %s supprimée (%d fichier(s))", nom, len(supprimes))
    return {"archive": nom, "supprimes": supprimes}


# --- L'état de l'onglet 💾 (§7) : des MÉTADONNÉES, sans ouvrir un seul tar ------------------------


def _resume_verdict(sortie: dict) -> dict:
    """Ce que la page affiche d'un verdict — jamais le détail complet des écarts (il reste dans
    l'`output_json` du travail, la barre et les échecs le portent déjà)."""
    return {
        "archive": sortie["archive"],
        "verdict": sortie.get("verdict"),
        "verifie_le": sortie.get("verifie_le"),
        "ecarts": len(sortie.get("ecarts") or []),
    }


def _resume_restauration(sidecar: Path) -> dict | None:
    """Ce que la page dit du DERNIER geste de restauration visant cette archive — lu du sidecar
    `.restauration.json` (ADR-0066 §3), le seul survivant : la ligne `ai_jobs` meurt au swap.

    🔴 **Un geste interrompu cesse d'être muet** (ADR-0067 §2). Jusqu'au 2026-08-21 seul
    `termine_le` était lu : une restauration arrêtée en route rendait `None`, donc s'affichait
    exactement comme une archive **jamais restaurée** — alors que le sidecar portait déjà l'étape
    fautive et son motif, écrits par `_JournalRestauration.echouer()` AVANT que l'exception ne
    remonte. L'information existait sur le disque ; aucune ligne de code ne la demandait.

    `None` = aucun sidecar (jamais restaurée) **ou** sidecar illisible : l'archive s'affiche
    quand même — cacher un fichier présent sur la cible serait un mensonge (même règle que le
    `.sha256`).

    ⚠️ `etape_arretee` est le nom BRUT du journal (`ETAPES_RESTAURATION`), jamais un libellé
    réécrit ici ; `motif` est rendu TEL QUEL — une table « motif technique → phrase douce » est
    exactement ce que l'ADR-0041 §8 a écarté.
    """
    if not sidecar.is_file():
        return None
    try:
        donnees = json.loads(sidecar.read_text(encoding="utf-8"))
        etapes = donnees.get("etapes") or []
        # Le DERNIER pas en échec : un journal réécrit à chaque étape peut en porter plusieurs
        # si quelqu'un a rejoué le geste, et c'est le plus récent qui raconte l'arrêt courant.
        echec = next(
            (e for e in reversed(etapes) if isinstance(e, dict) and e.get("statut") == "echec"),
            None,
        )
        termine_le = donnees.get("termine_le")
        ecarts = len(donnees.get("ecarts") or [])
        return {
            "termine_le": termine_le,
            # 🔴 TROIS valeurs (ADR-0067 Amendement 1) — et `reussie` a ici le sens qu'il a
            # PARTOUT AILLEURS sur cette page : « zéro écart ». C'est celui du verdict de
            # vérification (`_verdict_verification` : `"reussie" if not ecarts else "echec"`),
            # celui-là même qui fait qu'une archive mérite le mot « sauvegarde » (ADR-0065 §7).
            #
            # La v1 de la slice 1 adossait ce verdict au SEUL `termine_le` : le même mot portait
            # alors deux sens sur le même écran, et le premier écart réel se serait rendu
            # « réussie ». Mesuré au moment de trancher : `journal.ecart()` n'a qu'un site
            # d'appel, et une seule restauration réelle existe (`ecarts: 0`) — le cas ne s'était
            # jamais produit, ce qui le rendait d'autant plus facile à bénir par erreur.
            #
            # ⚠️ `avec_ecarts` n'est PAS un échec : la base est remplacée, les médias sont en
            # place, le monde s'est réveillé suspendu. C'est un succès qui se dit avec sa
            # réserve — le rendre comme une panne enverrait Papa relancer un second swap.
            "verdict": ("reussie" if not ecarts else "avec_ecarts") if termine_le else "interrompue",
            "etape_arretee": (echec or {}).get("etape"),
            "motif": (echec or {}).get("motif"),
            "ecarts": ecarts,
        }
    except (OSError, ValueError, TypeError, AttributeError):
        return None


def etat_donnees(db: Session) -> dict:
    """`GET /donnees` (§7) : archives, certificat, dernière vérification.

    🔴 **Aucun tar n'est ouvert ici, et c'est structurel** (§1 : aucun octet d'archive ne sort ;
    et une lecture d'état doit rester bon marché quel que soit le poids des archives) : la taille
    vient de `stat`, l'empreinte du sidecar `.sha256`, les comptes du sidecar `.manifeste.json` —
    la copie de LECTURE que le §5 a créée exactement pour ça. La vérité scellée reste celle de
    l'intérieur, et c'est `backup_verify` qui la confronte, pas cette route.

    « Vérifiée ou non » vient des travaux `backup_verify` réussis (leur verdict vit dans
    `output_json`, §6) — la plus récente vérification par archive. Une archive sans verdict rend
    `verification: null` : c'est elle que la page appelle « export non vérifié ».
    """
    dossier = Path(settings.backup_dir)
    motif = _certificat_refus(dossier)
    # OÙ la sauvegarde s'écrit — le chemin HÔTE que le certificat a consigné (§3), pas le chemin
    # conteneur (`/backups` ne dit rien à Papa). Relevé à la relecture d'écran du 2026-08-19 :
    # « certifiée » sans dire où obligeait à demander.
    cible = None
    if motif is None:
        try:
            cible = json.loads((dossier / CERTIFICAT).read_text(encoding="utf-8")).get(
                "chemin_cible"
            )
        except (OSError, ValueError, TypeError):  # déjà qualifié par _certificat_refus
            cible = None

    verdicts: dict[str, dict] = {}
    derniere: dict | None = None
    sorties = db.execute(
        select(AIJob.output_json)
        .where(AIJob.job_type == JOB_TYPE_VERIFY, AIJob.status == "succeeded")
        .order_by(AIJob.id.desc())
        .limit(200)
    ).scalars()
    for sortie in sorties:
        if not isinstance(sortie, dict) or not sortie.get("archive"):
            continue
        resume = _resume_verdict(sortie)
        if derniere is None:
            derniere = resume
        # Lecture du plus récent au plus ancien : le premier verdict vu par archive est le bon.
        verdicts.setdefault(resume["archive"], resume)

    # Le verdict de compatibilité (ADR-0066 §5) — les têtes du CODE, lues UNE fois pour toutes
    # les archives. Fail-closed : sans réponse, aucune archive ne s'annonce restaurable.
    connues: set[str] | None
    try:
        connues = _tetes_connues()
    except Exception:  # noqa: BLE001 — un état ne tombe pas ; il dit « non » et pourquoi
        connues = None

    archives: list[dict] = []
    if dossier.is_dir():
        # Le nom porte l'horodatage : trier les noms en ordre inverse = la plus récente d'abord.
        for chemin in sorted(dossier.glob("zetis-*.tar"), reverse=True):
            nom = chemin.name
            if not _NOM_ARCHIVE.match(nom):
                continue
            empreinte = None
            sidecar_sha = dossier / f"{nom}.sha256"
            if sidecar_sha.is_file():
                morceaux = sidecar_sha.read_text(encoding="utf-8").split()
                empreinte = morceaux[0] if morceaux else None
            lignes = tables = None
            sidecar_manifeste = dossier / f"{nom}.manifeste.json"
            if sidecar_manifeste.is_file():
                try:
                    base = json.loads(sidecar_manifeste.read_text(encoding="utf-8"))["base"]
                    lignes, tables = base.get("lignes"), base.get("tables")
                except (ValueError, TypeError, KeyError):
                    # Sidecar illisible : l'archive s'affiche quand même, sans ses comptes —
                    # la page ne cache jamais un fichier qui existe sur la cible.
                    pass
            # L'état du dernier geste de restauration (ADR-0067 §2) — le sidecar en entier,
            # plus seulement `termine_le`. Voir `_resume_restauration`.
            restauration = _resume_restauration(dossier / f"{nom}.restauration.json")
            # ⚠️ Pas `motif` tout court : ce nom porte déjà le refus du CERTIFICAT plus haut,
            # et le `return` le relit — l'écraser ici ferait dire au certificat le verdict de
            # la dernière archive (payé une fois : suite rouge du 2026-08-19).
            if connues is None:
                restaurable, motif_compat = (
                    False,
                    "Impossible de lire les migrations du code : refus.",
                )
            else:
                restaurable, motif_compat = _compat_archive(dossier, nom, connues)
            archives.append(
                {
                    "nom": nom,
                    "taille": chemin.stat().st_size,
                    # Du NOM (zetis-AAAA-MM-JJ-hhmm.tar), pas du mtime : c'est l'horodatage que
                    # `creer_sauvegarde` a posé, un `cp` de l'archive ne doit pas le changer.
                    "cree_le": f"{nom[6:16]}T{nom[17:19]}:{nom[19:21]}",
                    "sha256": empreinte,
                    "lignes": lignes,
                    "tables": tables,
                    "verification": verdicts.get(nom),
                    "restaurable": restaurable,
                    "motif": motif_compat,
                    "restauration": restauration,
                }
            )

    return {
        "certificat": {"valable": motif is None, "motif": motif, "cible": cible},
        "archives": archives,
        "derniere_verification": derniere,
        # ⚠️ Ce qui prend de la place (ADR-0069 §5) entre dans CETTE réponse, pas dans une route
        # à elle : l'onglet 💾 a déjà UN appel qui rend un instantané cohérent, un second en
        # ferait deux instants. La mesure est synchrone et sans cache — parcourir les 76 fichiers
        # audio prend 1 ms (mesuré le 2026-08-22). Le jour où elle dépasse la centaine de
        # millisecondes, c'est le NOMBRE DE FICHIERS qui a changé d'ordre de grandeur, et c'est
        # cette information-là qui compte : remesurer le volume réel avant de songer à un cache.
        #
        # 🔴 `archives` lui est passée DÉJÀ CONSTRUITE : le total se somme sur les `stat` que la
        # boucle ci-dessus vient de poser, il ne se recalcule pas sur un second `glob`.
        "occupation": occupation.mesurer(db, archives),
    }
