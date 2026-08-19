"""Test-verrous de la sauvegarde (ADR-0065, slice 1) — `backup_create` et son 409.

Les cinq propriétés que ce fichier tient, et qu'aucune retouche ne doit affaiblir :

1. 🔴 **Une archive au couple incomplet n'existe pas** (§5) : une capsule à `video_url` non nul
   sans octets correspondants ⇒ échec MOTIVÉ et archive partielle SUPPRIMÉE du disque. Le cas est
   réel — en dev, 8 vidéos référencées pour 1 objet présent (mesuré au cadrage) ; la fixture le
   reconstruit.
2. 🔴 **409 fail-closed AVANT d'enfiler** (§3) : certificat absent / illisible / UUID égaux ⇒ 409
   avec son motif, et AUCUN job créé — ni en base, ni dans la file.
3. **Le `.env` n'entre jamais dans l'archive**, et l'exclusion est ÉCRITE dans le manifeste avec
   son motif (`.env`, Redis, modèles).
4. **Aucun octet d'archive ne sort par HTTP** (§1) : la réponse du POST ne porte que des
   métadonnées de travail.
5. **Le manifeste est compté sur l'instantané du dump** (§5) : les comptes viennent de
   `_instantane`, jamais d'une relecture de la base vivante.

⚠️ `_instantane` est REMPLACÉ ici (SQLite n'a ni `pg_export_snapshot` ni `pg_dump`) — c'est le
point de greffe, comme `get_provider` pour le LLM. Tout le reste — archive, couple, manifeste,
empreinte, suppression — est le vrai code, joué par le VRAI `run_ai_job` (`executer_travail`).
"""

import hashlib
import json
import tarfile
from pathlib import Path

import pytest
from sqlalchemy import func, select

import app.db.models as m
from app.core.config import settings
from app.main import app
from app.modules.ai.travaux import AMORCES_MS, PLANCHER_MS
from app.modules.auth.deps import get_current_user
from app.modules.settings import sauvegarde

PAPA = {"username": "papa", "role": "papa"}
API = "/api/settings/donnees/sauvegarde"


@pytest.fixture(autouse=True)
def _papa(client_db) -> None:
    app.dependency_overrides[get_current_user] = lambda: PAPA


@pytest.fixture()
def cible(tmp_path, monkeypatch) -> Path:
    """Une cible de sauvegarde isolée — SANS certificat : c'est l'état de la première fois."""
    dossier = tmp_path / "cible"
    dossier.mkdir()
    monkeypatch.setattr(settings, "backup_dir", str(dossier))
    return dossier


@pytest.fixture()
def media(tmp_path, monkeypatch) -> Path:
    """Le répertoire audio des capsules (backend `disk`), vide au départ."""
    dossier = tmp_path / "audio"
    dossier.mkdir()
    monkeypatch.setattr(settings, "audio_storage_dir", str(dossier))
    monkeypatch.setattr(settings, "storage_backend", "disk")
    return dossier


def _certifier(dossier: Path, *, uuid_cible: str = "UUID-CIBLE", uuid_donnees: str = "UUID-DONNEES") -> None:
    (dossier / sauvegarde.CERTIFICAT).write_text(
        json.dumps({"uuid_cible": uuid_cible, "uuid_donnees": uuid_donnees}), encoding="utf-8"
    )


def _instantane_fige(session_factory, comptes: dict[str, int]):
    """Un `_instantane` de test : dump factice, comptes FIGÉS (la vérité du snapshot), références
    lues en base — le couple, lui, se vérifie sur le vrai code."""

    def _fake(dossier: Path) -> sauvegarde.Instantane:
        dump = dossier / "dump.sql"
        dump.write_text("-- dump factice (instantané)\n", encoding="utf-8")
        with session_factory() as db:
            references = [
                sauvegarde.ReferenceMedia(capsule_id=cid, audio=bool(audio), video=bool(video))
                for cid, audio, video in db.execute(
                    select(m.Capsule.id, m.Capsule.audio_url, m.Capsule.video_url)
                )
            ]
        return sauvegarde.Instantane(
            dump_path=dump,
            comptes=comptes,
            tete_alembic="tete-de-test",
            version_serveur="16.15",
            references=references,
        )

    return _fake


def _capsule(session_factory, *, video: bool, audio: bool) -> int:
    with session_factory() as db:
        subject_id = db.execute(select(m.Subject.id)).scalars().first()
        capsule = m.Capsule(subject_id=subject_id, title="Fractions — capsule de test")
        db.add(capsule)
        db.flush()
        if video:
            capsule.video_url = f"/api/capsules/{capsule.id}/video"
        if audio:
            capsule.audio_url = f"/api/capsules/{capsule.id}/audio/scene_0.wav"
        db.commit()
        return capsule.id


def _nb_jobs(session_factory) -> int:
    with session_factory() as db:
        return db.execute(select(func.count(m.AIJob.id))).scalar()


# --- 🔴 Le 409 fail-closed, AVANT d'enfiler (§3) ---------------------------------------------------


def test_certificat_absent_refuse_en_409_et_aucun_job(client_db, cible, file_rq_factice) -> None:
    """Le premier geste après l'installation échoue AVEC son motif et le nom du script — et rien
    n'est créé : ni ligne `ai_jobs`, ni job dans la file."""
    client, TestSession = client_db

    reponse = client.post(API)

    assert reponse.status_code == 409, reponse.text
    detail = reponse.json()["detail"]
    assert sauvegarde.CERTIFICAT in detail
    assert sauvegarde.SCRIPT_CERTIFICATION in detail
    assert _nb_jobs(TestSession) == 0
    assert file_rq_factice.enqueued == []


def test_certificat_illisible_refuse_en_409_et_aucun_job(client_db, cible, file_rq_factice) -> None:
    client, TestSession = client_db
    (cible / sauvegarde.CERTIFICAT).write_text("{pas du json", encoding="utf-8")

    reponse = client.post(API)

    assert reponse.status_code == 409, reponse.text
    assert "illisible" in reponse.json()["detail"]
    assert _nb_jobs(TestSession) == 0
    assert file_rq_factice.enqueued == []


def test_uuid_identiques_refuses_en_409_et_aucun_job(client_db, cible, file_rq_factice) -> None:
    """La parade du backlog : cible et données sur le même volume ⇒ sauvegarder copierait le
    disque sur lui-même. Le refus vient du serveur, avec son motif."""
    client, TestSession = client_db
    _certifier(cible, uuid_cible="MEME-UUID", uuid_donnees="MEME-UUID")

    reponse = client.post(API)

    assert reponse.status_code == 409, reponse.text
    detail = reponse.json()["detail"]
    assert "volume" in detail
    assert "MEME-UUID" in detail
    assert _nb_jobs(TestSession) == 0
    assert file_rq_factice.enqueued == []


def test_un_deuxieme_backup_create_est_refuse_en_409(client_db, cible, file_rq_factice) -> None:
    """Read-before-code (§Suivi 4) : RIEN d'autre ne l'empêche — le régulateur `duplicate` vit sur
    les LOTS, `travaux.enfiler` ne regarde pas les doublons. C'est donc la route qui refuse."""
    from datetime import datetime, timezone

    client, TestSession = client_db
    _certifier(cible)
    with TestSession() as db:
        db.add(
            m.AIJob(
                job_type=sauvegarde.JOB_TYPE,
                status="queued",
                created_by="file",
                created_at=datetime.now(timezone.utc),
            )
        )
        db.commit()

    reponse = client.post(API)

    assert reponse.status_code == 409, reponse.text
    assert "déjà en file ou en cours" in reponse.json()["detail"]
    assert _nb_jobs(TestSession) == 1  # celle qui existait — aucune nouvelle
    assert file_rq_factice.enqueued == []


# --- Aucun octet d'archive sur HTTP (§1) -----------------------------------------------------------


def test_la_reponse_du_post_ne_porte_que_des_metadonnees(client_db, cible, file_rq_factice) -> None:
    """202 = `{job_id, status}`, rien d'autre. Un champ de contenu qui apparaîtrait ici est une
    violation du §1 — l'archive naît sur un disque et y reste."""
    client, TestSession = client_db
    _certifier(cible)

    reponse = client.post(API)

    assert reponse.status_code == 202, reponse.text
    corps = reponse.json()
    assert set(corps.keys()) == {"job_id", "status"}
    assert corps["status"] == "queued"
    assert len(file_rq_factice.enqueued) == 1  # le travail est bien parti dans la file


# --- 🔴 Une archive au couple incomplet n'existe pas (§5) ------------------------------------------


def test_une_archive_au_couple_incomplet_n_existe_pas(
    client_db, cible, media, monkeypatch, executer_travail
) -> None:
    """Le cas dev reconstruit : la base référence une vidéo et un audio dont AUCUN octet n'existe.
    Le travail échoue avec son motif, et il ne reste RIEN sur la cible qui ressemble à une
    sauvegarde sans en être une."""
    client, TestSession = client_db
    _certifier(cible)
    capsule_id = _capsule(TestSession, video=True, audio=True)  # référencée, zéro fichier
    monkeypatch.setattr(sauvegarde, "_instantane", _instantane_fige(TestSession, {"capsules": 1}))

    reponse = client.post(API)
    assert reponse.status_code == 202, reponse.text
    sortie = executer_travail(TestSession, reponse.json()["job_id"])

    assert "error" in sortie
    with TestSession() as db:
        job = db.get(m.AIJob, reponse.json()["job_id"])
        assert job.status == "failed"  # échec STRUCTUREL : zéro rejeu, motif visible
        assert f"capsule #{capsule_id}" in job.error_message
        assert "couple" in job.error_message
    assert list(cible.glob("zetis-*")) == []  # ni tar, ni sidecar — l'archive N'EXISTE PAS


# --- Le chemin nominal : archive scellée, exclusions écrites, empreinte ----------------------------


def _sauvegarde_reussie(client, TestSession, cible, media, monkeypatch, executer_travail) -> dict:
    """Monte un monde COMPLET (couple fermé), joue le travail, rend son `output_json`."""
    _certifier(cible)
    capsule_id = _capsule(TestSession, video=True, audio=True)
    dossier = media / "capsules" / str(capsule_id)
    dossier.mkdir(parents=True)
    (dossier / "scene_0.wav").write_bytes(b"WAV-factice")
    (dossier / "video.mp4").write_bytes(b"MP4-factice")
    monkeypatch.setattr(sauvegarde, "_instantane", _instantane_fige(TestSession, {"capsules": 1}))

    reponse = client.post(API)
    assert reponse.status_code == 202, reponse.text
    sortie = executer_travail(TestSession, reponse.json()["job_id"])
    assert "error" not in sortie, sortie
    return sortie


def test_le_env_n_entre_jamais_dans_l_archive_et_l_exclusion_est_ecrite(
    client_db, cible, media, monkeypatch, executer_travail
) -> None:
    client, TestSession = client_db
    sortie = _sauvegarde_reussie(client, TestSession, cible, media, monkeypatch, executer_travail)

    with tarfile.open(cible / sortie["archive"]) as tar:
        noms = tar.getnames()
        manifeste = json.load(tar.extractfile("manifeste.json"))

    assert all(".env" not in nom for nom in noms)
    exclusions = {e["quoi"]: e["motif"] for e in manifeste["exclusions"]}
    assert ".env" in exclusions and "secrets" in exclusions[".env"]
    assert "redis" in exclusions
    assert any("modèles" in quoi for quoi in exclusions)
    assert all(motif for motif in exclusions.values())  # une exclusion sans motif ne dit rien


def test_l_empreinte_scelle_l_archive_et_les_sidecars_disent_la_meme_chose(
    client_db, cible, media, monkeypatch, executer_travail
) -> None:
    """`output_json`, sidecar `.sha256` et empreinte réelle du tar : UNE seule vérité. Et le
    sidecar `.manifeste.json` est la copie de lecture du manifeste SCELLÉ à l'intérieur."""
    client, TestSession = client_db
    sortie = _sauvegarde_reussie(client, TestSession, cible, media, monkeypatch, executer_travail)

    chemin_tar = cible / sortie["archive"]
    empreinte_reelle = hashlib.sha256(chemin_tar.read_bytes()).hexdigest()
    sidecar_sha = (cible / f"{sortie['archive']}.sha256").read_text(encoding="utf-8").split()[0]
    assert sortie["sha256"] == empreinte_reelle == sidecar_sha

    with tarfile.open(chemin_tar) as tar:
        scelle = json.load(tar.extractfile("manifeste.json"))
    sidecar_manifeste = json.loads(
        (cible / f"{sortie['archive']}.manifeste.json").read_text(encoding="utf-8")
    )
    assert scelle == sidecar_manifeste
    # Le dump et les deux médias sont dedans, chacun avec taille et sha256 (§5).
    chemins = {membre["chemin"] for membre in scelle["membres"]}
    assert "dump.sql" in chemins
    assert any(c.endswith("scene_0.wav") for c in chemins)
    assert any(c.endswith("video.mp4") for c in chemins)
    assert all(membre["sha256"] and membre["taille"] >= 0 for membre in scelle["membres"])


def test_le_manifeste_est_compte_sur_l_instantane_du_dump(
    client_db, cible, media, monkeypatch, executer_travail
) -> None:
    """Les comptes du manifeste sont CEUX DU SNAPSHOT (les mêmes que le SQL restauré rendra en
    slice 2), pas une relecture de la base vivante : des lignes ajoutées APRÈS l'instantané ne
    doivent pas y apparaître. Recompter en direct rendrait la vérification fausse dès qu'une
    ligne bouge entre le dump et le manifeste."""
    client, TestSession = client_db
    _certifier(cible)
    monkeypatch.setattr(
        sauvegarde, "_instantane", _instantane_fige(TestSession, {"capsules": 1, "users": 1})
    )
    # La base VIVANTE bouge après l'instantané figé : trois capsules de plus, sans médias.
    for _ in range(3):
        _capsule(TestSession, video=False, audio=False)

    reponse = client.post(API)
    assert reponse.status_code == 202, reponse.text
    sortie = executer_travail(TestSession, reponse.json()["job_id"])
    assert "error" not in sortie, sortie

    with tarfile.open(cible / sortie["archive"]) as tar:
        manifeste = json.load(tar.extractfile("manifeste.json"))
    assert manifeste["base"]["comptes_par_table"] == {"capsules": 1, "users": 1}
    assert manifeste["base"]["lignes"] == 2
    assert sortie["lignes"] == 2  # l'output_json dit la même vérité que le manifeste


# --- Le vocabulaire de la file (ADR-0065 §Conséquences) --------------------------------------------


def test_l_amorce_backup_create_existe_et_depasse_le_plancher() -> None:
    """Une amorce sous `PLANCHER_MS` n'apprendrait jamais rien à la barre — et une amorce absente
    servirait le défaut générique en silence."""
    assert AMORCES_MS["backup_create"] >= PLANCHER_MS
