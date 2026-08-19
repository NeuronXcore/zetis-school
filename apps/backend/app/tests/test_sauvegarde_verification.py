"""Test-verrous de la vérification (ADR-0065 §6, slice 2) — `backup_verify` et son 409.

Les propriétés tenues ici, et qu'aucune retouche ne doit affaiblir :

1. 🔴 **`zetis_verify` est détruite MÊME en échec** — le `DROP … WITH (FORCE)` du `finally` est
   verrouillé sur le VRAI code de `_restaurer_a_blanc` (faux module psycopg injecté, pas une
   version simplifiée) ; et le ménage d'une vérification interrompue (`DROP IF EXISTS` AVANT le
   `CREATE`) est le premier ordre exécuté.
2. 🔴 **La base `zetis` n'est jamais touchée** : la connexion admin n'exécute RIEN d'autre que le
   couple DROP/CREATE de `zetis_verify` — l'assertion est sur la liste EXACTE des ordres.
3. **Un écart = un verdict d'échec MOTIVÉ, dans `output_json`** (ADR §6 : le verdict y vit) — et
   le travail est `succeeded` : le chemin d'échec de `run_ai_job` n'écrit pas `output_json`, y
   mettre le verdict le perdrait.
4. **409 fail-closed AVANT d'enfiler** : nom hors whitelist (traversée de répertoire), archive ou
   sidecar absents, doublon (`backup_create` COMME `backup_verify`) ⇒ AUCUN job créé.
5. **Le manifeste de référence est celui DU TAR** : un sidecar `.manifeste.json` falsifié ne
   change pas le verdict ; le sidecar `.sha256`, lui, est ce qu'on confronte (étape ①).

⚠️ `_restaurer_a_blanc` est REMPLACÉ dans les tests fonctionnels (SQLite n'a pas de
`CREATE DATABASE`) — même point de greffe que `_instantane` en slice 1. Tout le reste — empreinte,
manifeste scellé, membres, comparaisons, verdict — est le vrai code, joué par le VRAI `run_ai_job`.
"""

import hashlib
import io
import json
import sys
import tarfile
import types
from datetime import datetime, timezone
from pathlib import Path

import pytest
from sqlalchemy import func, select

import app.db.models as m
from app.core.config import settings
from app.main import app
from app.modules.ai.travaux import AMORCES_MS, PLANCHER_MS
from app.modules.auth.deps import get_current_user
from app.modules.settings import sauvegarde
from app.tests.test_sauvegarde import _capsule, _certifier, _instantane_fige

PAPA = {"username": "papa", "role": "papa"}
API = "/api/settings/donnees/verification"


@pytest.fixture(autouse=True)
def _papa(client_db) -> None:
    app.dependency_overrides[get_current_user] = lambda: PAPA


@pytest.fixture()
def cible(tmp_path, monkeypatch) -> Path:
    dossier = tmp_path / "cible"
    dossier.mkdir()
    monkeypatch.setattr(settings, "backup_dir", str(dossier))
    return dossier


@pytest.fixture()
def media(tmp_path, monkeypatch) -> Path:
    dossier = tmp_path / "audio"
    dossier.mkdir()
    monkeypatch.setattr(settings, "audio_storage_dir", str(dossier))
    monkeypatch.setattr(settings, "storage_backend", "disk")
    return dossier


def _archive_valide(TestSession, cible: Path, media: Path, monkeypatch) -> str:
    """Fabrique une VRAIE archive par le code de la slice 1 (couple fermé) ; rend son nom."""
    _certifier(cible)
    capsule_id = _capsule(TestSession, video=True, audio=True)
    dossier = media / "capsules" / str(capsule_id)
    dossier.mkdir(parents=True)
    (dossier / "scene_0.wav").write_bytes(b"WAV-factice")
    (dossier / "video.mp4").write_bytes(b"MP4-factice")
    monkeypatch.setattr(sauvegarde, "_instantane", _instantane_fige(TestSession, {"capsules": 1}))
    return sauvegarde.creer_sauvegarde()["archive"]


def _restauration_fidele(comptes: dict[str, int] | None = None, tete: str = "tete-de-test"):
    """Un `_restaurer_a_blanc` factice qui rend ce que l'archive de `_archive_valide` promet."""

    def _fake(_dump_path: Path) -> sauvegarde.RestaurationABlanc:
        return sauvegarde.RestaurationABlanc(
            comptes=comptes if comptes is not None else {"capsules": 1}, tete_alembic=tete
        )

    return _fake


def _nb_jobs(TestSession) -> int:
    with TestSession() as db:
        return db.execute(select(func.count(m.AIJob.id))).scalar()


def _verifier(client, TestSession, executer_travail, nom: str) -> dict:
    reponse = client.post(API, json={"archive": nom})
    assert reponse.status_code == 202, reponse.text
    sortie = executer_travail(TestSession, reponse.json()["job_id"])
    assert "error" not in sortie, sortie
    return sortie


# --- Le verdict vit dans output_json (§6) ----------------------------------------------------------


def test_le_verdict_reussie_sur_une_archive_saine(
    client_db, cible, media, monkeypatch, executer_travail
) -> None:
    client, TestSession = client_db
    nom = _archive_valide(TestSession, cible, media, monkeypatch)
    monkeypatch.setattr(sauvegarde, "_restaurer_a_blanc", _restauration_fidele())

    sortie = _verifier(client, TestSession, executer_travail, nom)

    assert sortie["verdict"] == "reussie"
    assert sortie["ecarts"] == []
    assert sortie["archive"] == nom
    assert sortie["lignes_restaurees"] == 1
    assert sortie["tables_restaurees"] == 1


def test_un_ecart_de_compte_rend_un_verdict_echec_motive_et_un_travail_succeeded(
    client_db, cible, media, monkeypatch, executer_travail
) -> None:
    """La table qui diverge est NOMMÉE — et le travail est `succeeded` : le verdict vit dans
    `output_json` (ADR §6), le chemin d'échec de `run_ai_job` l'aurait perdu."""
    client, TestSession = client_db
    nom = _archive_valide(TestSession, cible, media, monkeypatch)
    monkeypatch.setattr(
        sauvegarde, "_restaurer_a_blanc", _restauration_fidele(comptes={"capsules": 0})
    )

    reponse = client.post(API, json={"archive": nom})
    assert reponse.status_code == 202, reponse.text
    sortie = executer_travail(TestSession, reponse.json()["job_id"])

    assert sortie["verdict"] == "echec"
    assert any("capsules" in e for e in sortie["ecarts"])
    with TestSession() as db:
        job = db.get(m.AIJob, reponse.json()["job_id"])
        assert job.status == "succeeded"
        assert job.output_json["verdict"] == "echec"


def test_une_tete_alembic_divergente_est_un_ecart(
    client_db, cible, media, monkeypatch, executer_travail
) -> None:
    client, TestSession = client_db
    nom = _archive_valide(TestSession, cible, media, monkeypatch)
    monkeypatch.setattr(sauvegarde, "_restaurer_a_blanc", _restauration_fidele(tete="autre-tete"))

    sortie = _verifier(client, TestSession, executer_travail, nom)

    assert sortie["verdict"] == "echec"
    assert any("alembic" in e for e in sortie["ecarts"])


def test_une_restauration_qui_echoue_est_un_verdict_pas_un_crash(
    client_db, cible, media, monkeypatch, executer_travail
) -> None:
    """`psql` sous ON_ERROR_STOP qui tombe = un verdict sur l'ARCHIVE (le dump ne se rejoue pas),
    pas une panne du dispositif."""
    client, TestSession = client_db
    nom = _archive_valide(TestSession, cible, media, monkeypatch)

    def _restauration_ratee(_dump_path: Path) -> sauvegarde.RestaurationABlanc:
        return sauvegarde.RestaurationABlanc(
            erreurs=["restauration : psql a échoué sous ON_ERROR_STOP (code 3) — erreur SQL"]
        )

    monkeypatch.setattr(sauvegarde, "_restaurer_a_blanc", _restauration_ratee)

    sortie = _verifier(client, TestSession, executer_travail, nom)

    assert sortie["verdict"] == "echec"
    assert any("restauration" in e for e in sortie["ecarts"])


# --- L'empreinte et le manifeste scellé (①, ⑤) -----------------------------------------------------


def test_une_empreinte_divergente_ne_restaure_meme_pas(
    client_db, cible, media, monkeypatch, executer_travail
) -> None:
    """Étape ① : un tar qui ne se prouve pas ne se restaure pas — le point de greffe n'est
    jamais appelé."""
    client, TestSession = client_db
    nom = _archive_valide(TestSession, cible, media, monkeypatch)
    (cible / f"{nom}.sha256").write_text(f"{'0' * 64}  {nom}\n", encoding="utf-8")
    appels: list[Path] = []

    def _sentinelle(dump_path: Path) -> sauvegarde.RestaurationABlanc:
        appels.append(dump_path)
        return sauvegarde.RestaurationABlanc()

    monkeypatch.setattr(sauvegarde, "_restaurer_a_blanc", _sentinelle)

    sortie = _verifier(client, TestSession, executer_travail, nom)

    assert sortie["verdict"] == "echec"
    assert any("empreinte" in e for e in sortie["ecarts"])
    assert appels == []


def test_un_membre_altere_est_nomme(cible, monkeypatch, client_db, executer_travail) -> None:
    """Étape ⑤ : le manifeste scellé déclare une empreinte, l'octet réel en porte une autre —
    l'écart nomme le membre. Archive fabriquée à la main pour contrôler la divergence."""
    client, TestSession = client_db
    nom = "zetis-2026-01-01-0000.tar"
    manifeste = {
        "membres": [
            {
                "chemin": "dump.sql",
                "taille": 5,
                "sha256": hashlib.sha256(b"AUTRE").hexdigest(),  # ≠ des octets réels
            }
        ],
        "base": {"comptes_par_table": {"capsules": 0}, "tete_alembic": None},
    }
    chemin_tar = cible / nom
    with tarfile.open(chemin_tar, "w") as tar:
        for arcnom, octets in (
            ("dump.sql", b"REELS"),
            ("manifeste.json", json.dumps(manifeste).encode()),
        ):
            info = tarfile.TarInfo(name=arcnom)
            info.size = len(octets)
            tar.addfile(info, io.BytesIO(octets))
    empreinte = hashlib.sha256(chemin_tar.read_bytes()).hexdigest()
    (cible / f"{nom}.sha256").write_text(f"{empreinte}  {nom}\n", encoding="utf-8")
    monkeypatch.setattr(
        sauvegarde, "_restaurer_a_blanc", _restauration_fidele(comptes={"capsules": 0}, tete=None)
    )

    sortie = _verifier(client, TestSession, executer_travail, nom)

    assert sortie["verdict"] == "echec"
    assert any("dump.sql" in e and "membre" in e for e in sortie["ecarts"])


def test_le_sidecar_manifeste_falsifie_ne_change_pas_le_verdict(
    client_db, cible, media, monkeypatch, executer_travail
) -> None:
    """La vérité scellée est CELLE DU TAR (§5) : le sidecar `.manifeste.json` n'est qu'une copie
    de lecture — le réécrire ne doit rien changer."""
    client, TestSession = client_db
    nom = _archive_valide(TestSession, cible, media, monkeypatch)
    (cible / f"{nom}.manifeste.json").write_text(
        json.dumps({"base": {"comptes_par_table": {"capsules": 999}}}), encoding="utf-8"
    )
    monkeypatch.setattr(sauvegarde, "_restaurer_a_blanc", _restauration_fidele())

    sortie = _verifier(client, TestSession, executer_travail, nom)

    assert sortie["verdict"] == "reussie"


# --- 🔴 Le 409 fail-closed, AVANT d'enfiler ---------------------------------------------------------


@pytest.mark.parametrize(
    "nom",
    [
        "../zetis-2026-01-01-0000.tar",
        "/etc/passwd",
        "dump.sql",
        "zetis-2026-1-1-0000.tar",
        "zetis-2026-01-01-0000.tar.evil",
    ],
)
def test_un_nom_hors_whitelist_est_refuse_en_409(client_db, cible, file_rq_factice, nom) -> None:
    client, TestSession = client_db

    reponse = client.post(API, json={"archive": nom})

    assert reponse.status_code == 409, reponse.text
    assert "invalide" in reponse.json()["detail"]
    assert _nb_jobs(TestSession) == 0
    assert file_rq_factice.enqueued == []


def test_une_archive_absente_est_refusee_en_409(client_db, cible, file_rq_factice) -> None:
    client, TestSession = client_db

    reponse = client.post(API, json={"archive": "zetis-2026-01-01-0000.tar"})

    assert reponse.status_code == 409, reponse.text
    assert "introuvable" in reponse.json()["detail"]
    assert _nb_jobs(TestSession) == 0
    assert file_rq_factice.enqueued == []


def test_un_sidecar_sha_absent_est_refuse_en_409(client_db, cible, file_rq_factice) -> None:
    client, TestSession = client_db
    nom = "zetis-2026-01-01-0000.tar"
    (cible / nom).write_bytes(b"tar sans sidecar")

    reponse = client.post(API, json={"archive": nom})

    assert reponse.status_code == 409, reponse.text
    assert ".sha256" in reponse.json()["detail"]
    assert _nb_jobs(TestSession) == 0
    assert file_rq_factice.enqueued == []


@pytest.mark.parametrize("type_en_cours", [sauvegarde.JOB_TYPE, sauvegarde.JOB_TYPE_VERIFY])
def test_un_travail_de_sauvegarde_en_cours_refuse_en_409(
    client_db, cible, file_rq_factice, type_en_cours
) -> None:
    """`backup_create` COMME `backup_verify` : vérifier pendant une création lirait un tar en
    cours d'écriture, et deux vérifications se disputeraient `zetis_verify`."""
    client, TestSession = client_db
    nom = "zetis-2026-01-01-0000.tar"
    (cible / nom).write_bytes(b"tar")
    (cible / f"{nom}.sha256").write_text("x", encoding="utf-8")
    with TestSession() as db:
        db.add(
            m.AIJob(
                job_type=type_en_cours,
                status="queued",
                created_by="file",
                created_at=datetime.now(timezone.utc),
            )
        )
        db.commit()

    reponse = client.post(API, json={"archive": nom})

    assert reponse.status_code == 409, reponse.text
    assert type_en_cours in reponse.json()["detail"]
    assert _nb_jobs(TestSession) == 1
    assert file_rq_factice.enqueued == []


def test_la_reponse_du_post_ne_porte_que_des_metadonnees(
    client_db, cible, media, monkeypatch, file_rq_factice
) -> None:
    client, TestSession = client_db
    nom = _archive_valide(TestSession, cible, media, monkeypatch)

    reponse = client.post(API, json={"archive": nom})

    assert reponse.status_code == 202, reponse.text
    assert set(reponse.json().keys()) == {"job_id", "status"}
    assert len(file_rq_factice.enqueued) == 1


# --- 🔴 `zetis_verify` détruite MÊME en échec — verrouillé sur le VRAI `_restaurer_a_blanc` --------


class _FauxCurseur:
    def fetchall(self):
        return []

    def fetchone(self):
        return None


class _FausseConnexion:
    def __init__(self, dsn: str, autocommit: bool, *, execute_leve: bool):
        self.dsn = dsn
        self.autocommit = autocommit
        self.executed: list[str] = []
        self.fermee = False
        self._execute_leve = execute_leve

    def execute(self, sql: str):
        self.executed.append(sql)
        if self._execute_leve:
            raise RuntimeError("comptage cassé (voulu par le test)")
        return _FauxCurseur()

    def close(self) -> None:
        self.fermee = True

    def __enter__(self):
        return self

    def __exit__(self, *_exc):
        self.close()
        return False


def _faux_psycopg(connexions: list[_FausseConnexion], *, comptage_leve: bool) -> types.ModuleType:
    """Un module `psycopg` factice : la 1re connexion est l'admin, les suivantes le comptage."""
    module = types.ModuleType("psycopg")
    module.Error = type("Error", (Exception,), {})

    def connect(dsn: str, autocommit: bool = False):
        connexion = _FausseConnexion(
            dsn, autocommit, execute_leve=comptage_leve and bool(connexions)
        )
        connexions.append(connexion)
        return connexion

    module.connect = connect
    return module


def _psql_factice(returncode: int):
    def _run(*_args, **_kwargs):
        return types.SimpleNamespace(returncode=returncode, stderr="", stdout="")

    return _run


def test_zetis_verify_detruite_meme_en_echec_et_zetis_jamais_touchee(
    tmp_path, monkeypatch
) -> None:
    """Le comptage explose APRÈS la restauration : le `DROP … WITH (FORCE)` du `finally` doit
    quand même partir — et la connexion admin n'a rien exécuté d'autre que le couple DROP/CREATE
    de `zetis_verify` (la base `zetis` n'est jamais touchée)."""
    connexions: list[_FausseConnexion] = []
    monkeypatch.setitem(sys.modules, "psycopg", _faux_psycopg(connexions, comptage_leve=True))
    monkeypatch.setattr(sauvegarde.subprocess, "run", _psql_factice(0))
    dump = tmp_path / "dump.sql"
    dump.write_text("-- dump", encoding="utf-8")

    with pytest.raises(RuntimeError, match="comptage cassé"):
        sauvegarde._restaurer_a_blanc(dump)

    admin, comptage = connexions
    assert admin.autocommit is True  # CREATE DATABASE refuse un bloc de transaction (mesuré)
    assert admin.dsn.endswith("/zetis")
    assert comptage.dsn.endswith(f"/{sauvegarde.VERIFY_DB}")
    assert admin.executed == [
        f"DROP DATABASE IF EXISTS {sauvegarde.VERIFY_DB} WITH (FORCE)",  # le ménage du ②
        f"CREATE DATABASE {sauvegarde.VERIFY_DB}",
        f"DROP DATABASE IF EXISTS {sauvegarde.VERIFY_DB} WITH (FORCE)",  # le ⑥, MALGRÉ l'échec
    ]
    assert admin.fermee is True


def test_le_drop_du_finally_part_aussi_quand_psql_echoue(tmp_path, monkeypatch) -> None:
    """L'autre chemin d'échec (psql ≠ 0, pas d'exception) : mêmes trois ordres, et le verdict
    remonte en `erreurs` au lieu de lever."""
    connexions: list[_FausseConnexion] = []
    monkeypatch.setitem(sys.modules, "psycopg", _faux_psycopg(connexions, comptage_leve=False))
    monkeypatch.setattr(sauvegarde.subprocess, "run", _psql_factice(3))
    dump = tmp_path / "dump.sql"
    dump.write_text("-- dump", encoding="utf-8")

    restauration = sauvegarde._restaurer_a_blanc(dump)

    assert restauration.erreurs and "psql" in restauration.erreurs[0]
    (admin,) = connexions  # psql a échoué AVANT toute connexion de comptage
    assert admin.executed == [
        f"DROP DATABASE IF EXISTS {sauvegarde.VERIFY_DB} WITH (FORCE)",
        f"CREATE DATABASE {sauvegarde.VERIFY_DB}",
        f"DROP DATABASE IF EXISTS {sauvegarde.VERIFY_DB} WITH (FORCE)",
    ]


# --- Le vocabulaire de la file ----------------------------------------------------------------------


def test_l_amorce_backup_verify_existe_et_depasse_le_plancher() -> None:
    assert AMORCES_MS["backup_verify"] >= PLANCHER_MS
