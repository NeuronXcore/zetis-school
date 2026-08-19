"""Test-verrous de `GET /api/settings/donnees` (ADR-0065 §7, slice 3) — l'état, jamais un contenu.

Les propriétés tenues :

1. 🔴 **Aucun tar n'est ouvert** — structurel : la route répond juste même quand `tarfile.open`
   explose. Tailles par `stat`, empreintes et comptes par les SIDECARS (la copie de lecture que
   le §5 a créée pour ça).
2. **Le certificat voyage avec son motif** (adr-0062 §6 : un cadenas muet se lit comme une panne).
3. **« Vérifiée ou non » vient des travaux `backup_verify` réussis** : le verdict le plus récent
   par archive gagne ; une archive jamais vérifiée rend `verification: null` — c'est elle que la
   page appelle « export non vérifié ».
4. **Un sidecar illisible n'efface pas l'archive** : cacher un fichier présent sur la cible
   serait un mensonge — elle s'affiche sans ses comptes.
"""

from datetime import datetime, timezone

import pytest

import app.db.models as m
from app.core.config import settings
from app.main import app
from app.modules.auth.deps import get_current_user
from app.modules.settings import sauvegarde
from app.tests.test_sauvegarde import _certifier
from app.tests.test_sauvegarde_verification import _archive_valide

PAPA = {"username": "papa", "role": "papa"}
API = "/api/settings/donnees"


@pytest.fixture(autouse=True)
def _papa(client_db) -> None:
    app.dependency_overrides[get_current_user] = lambda: PAPA


@pytest.fixture()
def cible(tmp_path, monkeypatch):
    dossier = tmp_path / "cible"
    dossier.mkdir()
    monkeypatch.setattr(settings, "backup_dir", str(dossier))
    return dossier


@pytest.fixture()
def media(tmp_path, monkeypatch):
    dossier = tmp_path / "audio"
    dossier.mkdir()
    monkeypatch.setattr(settings, "audio_storage_dir", str(dossier))
    monkeypatch.setattr(settings, "storage_backend", "disk")
    return dossier


def _verdict_en_base(TestSession, archive: str, *, verdict: str, ecarts: int = 0) -> None:
    with TestSession() as db:
        db.add(
            m.AIJob(
                job_type=sauvegarde.JOB_TYPE_VERIFY,
                status="succeeded",
                created_by="file",
                created_at=datetime.now(timezone.utc),
                output_json={
                    "archive": archive,
                    "verdict": verdict,
                    "verifie_le": "2026-08-19T12:00:00+00:00",
                    "ecarts": ["x"] * ecarts,
                },
            )
        )
        db.commit()


def test_le_certificat_absent_rend_valable_false_avec_son_motif(client_db, cible) -> None:
    client, _ = client_db

    corps = client.get(API).json()

    assert corps["certificat"]["valable"] is False
    assert sauvegarde.SCRIPT_CERTIFICATION in corps["certificat"]["motif"]
    assert corps["certificat"]["cible"] is None  # pas de chemin tant que rien n'est certifié
    assert corps["archives"] == []
    assert corps["derniere_verification"] is None


def test_le_certificat_dit_ou_la_sauvegarde_s_ecrit(client_db, cible) -> None:
    """Le chemin HÔTE consigné par le certificat est rendu — « certifiée » sans dire où obligeait
    Papa à demander (relevé à la relecture d'écran du 2026-08-19)."""
    import json as json_lib

    client, _ = client_db
    (cible / sauvegarde.CERTIFICAT).write_text(
        json_lib.dumps(
            {
                "uuid_cible": "AAA",
                "uuid_donnees": "BBB",
                "chemin_cible": "/Volumes/NX-Models/zetis-sauvegardes",
            }
        ),
        encoding="utf-8",
    )

    corps = client.get(API).json()

    assert corps["certificat"]["valable"] is True
    assert corps["certificat"]["cible"] == "/Volumes/NX-Models/zetis-sauvegardes"


def test_les_archives_sont_listees_par_les_sidecars(
    client_db, cible, media, monkeypatch
) -> None:
    client, TestSession = client_db
    nom = _archive_valide(TestSession, cible, media, monkeypatch)

    corps = client.get(API).json()

    assert corps["certificat"]["valable"] is True
    (archive,) = corps["archives"]
    assert archive["nom"] == nom
    assert archive["taille"] > 0
    # L'horodatage vient du NOM (zetis-AAAA-MM-JJ-hhmm.tar), pas du mtime.
    assert archive["cree_le"] == f"{nom[6:16]}T{nom[17:19]}:{nom[19:21]}"
    assert archive["sha256"] == (cible / f"{nom}.sha256").read_text().split()[0]
    assert archive["lignes"] == 1 and archive["tables"] == 1  # du sidecar .manifeste.json
    assert archive["verification"] is None  # jamais vérifiée — « export non vérifié » à l'écran


def test_aucun_tar_n_est_ouvert(client_db, cible, media, monkeypatch) -> None:
    """Structurel (§1 + coût de lecture) : la route répond MÊME quand ouvrir un tar explose —
    preuve qu'elle n'essaie jamais."""
    client, TestSession = client_db
    _archive_valide(TestSession, cible, media, monkeypatch)

    def _interdit(*_a, **_k):
        raise AssertionError("GET /donnees a ouvert un tar — interdit (§1, sidecars seulement)")

    monkeypatch.setattr(sauvegarde.tarfile, "open", _interdit)

    reponse = client.get(API)

    assert reponse.status_code == 200, reponse.text
    assert len(reponse.json()["archives"]) == 1


def test_le_verdict_le_plus_recent_par_archive_gagne(
    client_db, cible, media, monkeypatch
) -> None:
    client, TestSession = client_db
    nom = _archive_valide(TestSession, cible, media, monkeypatch)
    _verdict_en_base(TestSession, nom, verdict="echec", ecarts=2)  # ancien
    _verdict_en_base(TestSession, nom, verdict="reussie")  # le plus récent

    corps = client.get(API).json()

    (archive,) = corps["archives"]
    assert archive["verification"]["verdict"] == "reussie"
    assert corps["derniere_verification"]["archive"] == nom
    assert corps["derniere_verification"]["verdict"] == "reussie"


def test_une_archive_jamais_verifiee_rend_verification_null(
    client_db, cible, media, monkeypatch
) -> None:
    """Le verdict d'une AUTRE archive ne déteint pas : celle-ci reste un export non vérifié."""
    client, TestSession = client_db
    nom = _archive_valide(TestSession, cible, media, monkeypatch)
    _verdict_en_base(TestSession, "zetis-2020-01-01-0000.tar", verdict="reussie")

    corps = client.get(API).json()

    (archive,) = corps["archives"]
    assert archive["nom"] == nom
    assert archive["verification"] is None


def test_un_sidecar_manifeste_illisible_n_efface_pas_l_archive(
    client_db, cible, media, monkeypatch
) -> None:
    client, TestSession = client_db
    nom = _archive_valide(TestSession, cible, media, monkeypatch)
    (cible / f"{nom}.manifeste.json").write_text("{pas du json", encoding="utf-8")

    corps = client.get(API).json()

    (archive,) = corps["archives"]
    assert archive["nom"] == nom
    assert archive["lignes"] is None and archive["tables"] is None
    assert archive["sha256"] is not None  # l'autre sidecar, lui, est intact
