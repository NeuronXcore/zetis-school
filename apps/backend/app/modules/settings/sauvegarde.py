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
import subprocess
import tarfile
import tempfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import AIJob

logger = logging.getLogger(__name__)

#: Le certificat que le script HÔTE écrit DANS le répertoire cible (§3). Les UUID de volume sont
#: illisibles depuis le conteneur (`diskutil` absent) et lisibles depuis l'hôte — mesuré au
#: cadrage : la règle « refuser si cible et données partagent un volume » est tenue par l'hôte.
CERTIFICAT = ".zetis-cible.json"

#: Nommé dans les motifs de refus : un cadenas dit pourquoi ET quoi faire (adr-0062 §6).
SCRIPT_CERTIFICATION = "scripts/certifier-cible-sauvegarde.sh"

#: Le `job_type` de la file (ADR-0065 §4). Slice 2 ajoutera `backup_verify`.
JOB_TYPE = "backup_create"

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


def _sauvegarde_en_cours(db: Session) -> int | None:
    """L'id d'un `backup_create` en `queued|running`, ou `None`.

    🔴 Read-before-code (§Suivi 4) : **rien d'autre ne l'empêche.** Le régulateur `duplicate` vit
    sur `create_run` (les LOTS) ; `travaux.enfiler` crée et enfile sans regarder les doublons.
    C'est donc la route qui refuse — un doublon de sauvegarde est inoffensif mais bête, et il
    tiendrait la file (concurrence 1) pour ne rien produire de plus.
    """
    return db.execute(
        select(AIJob.id)
        .where(AIJob.job_type == JOB_TYPE, AIJob.status.in_(("queued", "running")))
        .limit(1)
    ).scalar()


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
