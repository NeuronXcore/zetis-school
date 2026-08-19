"""Test-verrous de la restauration (ADR-0066, slice 1) — `backup_restore` et son 409.

Les propriétés tenues ici, et qu'aucune retouche ne doit affaiblir :

1. 🔴 **Jamais sans filet** : le ① qui échoue ⇒ AUCUNE étape suivante — le point de greffe du
   swap n'est jamais appelé, et le sidecar dit « filet : échec ».
2. 🔴 **Le réveil est écrit AVANT le swap** — sur le VRAI code de `restaurer_sauvegarde` (faux
   module psycopg, patron de la slice 2 du 0065) : l'ordre exact des ordres SQL est asserté —
   upserts de réveil sur `zetis_restore`, PUIS la clôture des travaux d'une autre époque
   (Amendement 1 : `ai_jobs` et `production_runs` en `queued|running` → `failed`, jamais
   l'histoire accomplie), PUIS terminate PUIS les RENAME, et `zetis_avant` est DROP-é avant le
   premier RENAME.
3. 🔴 **409 fail-closed sur CHAQUE précondition** (§2, paramétré) : AUCUN job créé.
4. **Une restauration ② qui échoue ne swap pas** : `zetis` intacte (aucun terminate, aucun
   RENAME — structurel, faux psycopg).
5. **Le sidecar survit au crash** (§3) : une exception à l'étape N laisse un sidecar avec les
   étapes 1..N-1 franchies — et l'exception sortante est STRUCTURELLE (zéro rejeu, quel que
   soit le type d'origine).
6. **Aucun octet d'archive sur HTTP** (§1) : la réponse du POST ne porte que `{job_id, status}`.

⚠️ La ligne `ai_jobs` du travail MEURT au swap (§3) : le garde de fin de `run_ai_job` est
verrouillé ici aussi — la disparition de la ligne pendant l'exécution rend « introuvable »,
jamais une exception vers RQ.
"""

import json
import sys
import types
from datetime import datetime, timezone
from pathlib import Path

import pytest
from sqlalchemy import delete, func, select

import app.db.models as m
from app.core.config import settings
from app.main import app
from app.modules.ai.travaux import AMORCES_MS, PLANCHER_MS
from app.modules.auth.deps import get_current_user
from app.modules.production import failures
from app.modules.settings import sauvegarde, service
from app.tests.test_sauvegarde_verification import _archive_valide

PAPA = {"username": "papa", "role": "papa"}
API = "/api/settings/donnees/restauration"


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


def _verdict_reussi(TestSession, nom: str) -> None:
    """Le billet d'entrée du §1 : un `backup_verify` réussi dont le verdict couvre CETTE archive."""
    with TestSession() as db:
        db.add(
            m.AIJob(
                job_type=sauvegarde.JOB_TYPE_VERIFY,
                status="succeeded",
                output_json={"archive": nom, "verdict": "reussie", "ecarts": []},
                created_by="file",
                created_at=datetime.now(timezone.utc),
            )
        )
        db.commit()


def _suspendre(TestSession) -> None:
    with TestSession() as db:
        db.add(m.AppSetting(key=service.PRODUCTION_SUSPENDED_KEY, value="true"))
        db.commit()


def _preparer_restaurable(TestSession, cible: Path, media: Path, monkeypatch) -> str:
    """Tout vert : archive réelle vérifiée `reussie`, suspension active, déploiement supervisé,
    tête du manifeste connue du code. Chaque test de refus dégrade UN axe."""
    nom = _archive_valide(TestSession, cible, media, monkeypatch)
    _verdict_reussi(TestSession, nom)
    _suspendre(TestSession)
    monkeypatch.setattr(settings, "production_worker_supervised", True)
    # `_instantane_fige` scelle `tete-de-test` dans le manifeste : on la déclare connue.
    monkeypatch.setattr(sauvegarde, "_tetes_connues", lambda: {"tete-de-test"})
    return nom


def _nb_jobs(TestSession) -> int:
    with TestSession() as db:
        return db.execute(select(func.count(m.AIJob.id))).scalar()


def _etapes(cible: Path, nom: str) -> list[tuple[str, str]]:
    sidecar = json.loads((cible / f"{nom}.restauration.json").read_text(encoding="utf-8"))
    return [(e["etape"], e["statut"]) for e in sidecar["etapes"]]


# --- Le faux module psycopg : la LISTE GLOBALE ORDONNÉE des ordres, toutes connexions ------------
#
# Patron de `test_sauvegarde_verification`, avec deux différences voulues : `execute` accepte des
# paramètres (les upserts du réveil en passent), et les ordres de TOUTES les connexions tombent
# dans une seule liste — c'est l'ORDRE GLOBAL (réveil PUIS terminate PUIS RENAME) qu'on verrouille.


class _FauxCurseur:
    def fetchall(self):
        return []

    def fetchone(self):
        return None


class _FausseConnexion:
    def __init__(self, dsn: str, autocommit: bool, ordres: list):
        self.dsn = dsn
        self.autocommit = autocommit
        self._ordres = ordres

    def execute(self, sql: str, params=None):
        self._ordres.append((self.dsn.rpartition("/")[2], sql, params))
        return _FauxCurseur()

    def close(self) -> None:
        pass

    def __enter__(self):
        return self

    def __exit__(self, *_exc):
        self.close()
        return False


def _faux_psycopg(ordres: list) -> types.ModuleType:
    module = types.ModuleType("psycopg")
    module.Error = type("Error", (Exception,), {})

    def connect(dsn: str, autocommit: bool = False):
        return _FausseConnexion(dsn, autocommit, ordres)

    module.connect = connect
    return module


def _subprocess_factice(returncode: int):
    def _run(*_args, **_kwargs):
        return types.SimpleNamespace(returncode=returncode, stderr="", stdout="")

    return _run


def _filet_factice(**metadonnees):
    def _fake():
        return {"archive": "zetis-2026-01-01-0001.tar", "lignes": 1, "tables": 1, **metadonnees}

    return _fake


def _greffer_geste(monkeypatch, ordres: list, *, psql_code: int = 0) -> dict[str, list]:
    """Le vrai `restaurer_sauvegarde`, tout le monde extérieur remplacé : psycopg, psql/alembic,
    médias, Redis, worker. Rend les sentinelles pour les assertions d'appel."""
    sentinelles: dict[str, list] = {"medias": [], "purge": [], "arret": [], "pool": []}
    monkeypatch.setitem(sys.modules, "psycopg", _faux_psycopg(ordres))
    monkeypatch.setattr(sauvegarde.subprocess, "run", _subprocess_factice(psql_code))
    monkeypatch.setattr(sauvegarde, "creer_sauvegarde", _filet_factice())
    monkeypatch.setattr(
        sauvegarde,
        "_remplacer_medias",
        lambda chemin: sentinelles["medias"].append(chemin)
        or {"objets_minio": 0, "fichiers_audio": 0},
    )
    monkeypatch.setattr(
        sauvegarde, "_purger_files_redis", lambda: sentinelles["purge"].append(True) or {}
    )
    monkeypatch.setattr(
        sauvegarde, "_arret_worker", lambda: sentinelles["arret"].append(True) or True
    )
    monkeypatch.setattr(
        sauvegarde, "_neutraliser_pool", lambda: sentinelles["pool"].append(True)
    )
    return sentinelles


# --- 🔴 Jamais sans filet (§2.①) ------------------------------------------------------------------


def test_jamais_sans_filet(client_db, cible, media, monkeypatch, executer_travail) -> None:
    """Le ① qui refuse ⇒ RIEN n'est remplacé : ni restauration, ni swap — et le sidecar dit
    « filet : échec »."""
    client, TestSession = client_db
    nom = _preparer_restaurable(TestSession, cible, media, monkeypatch)

    def _filet_qui_leve():
        raise sauvegarde.SauvegardeRefusee("cible débranchée (voulu par le test)")

    monkeypatch.setattr(sauvegarde, "creer_sauvegarde", _filet_qui_leve)
    appels: list[str] = []
    monkeypatch.setattr(
        sauvegarde, "_restaurer_dans", lambda *a: appels.append("restauration")
    )
    monkeypatch.setattr(sauvegarde, "_swap", lambda: appels.append("swap"))

    reponse = client.post(API, json={"archive": nom})
    assert reponse.status_code == 202, reponse.text
    sortie = executer_travail(TestSession, reponse.json()["job_id"])

    assert "cible débranchée" in sortie.get("error", "")
    assert appels == []
    with TestSession() as db:
        job = db.get(m.AIJob, reponse.json()["job_id"])
        assert job.status == "failed"  # structurel : zéro rejeu, l'échec s'affiche tout de suite
        assert "cible débranchée" in job.error_message
    assert _etapes(cible, nom) == [("filet", "echec")]


# --- 🔴 Le réveil est écrit AVANT le swap (§2.③-④) — l'ordre exact, sur le vrai code --------------


def test_le_reveil_est_ecrit_avant_le_swap(client_db, cible, media, monkeypatch) -> None:
    client, TestSession = client_db
    nom = _preparer_restaurable(TestSession, cible, media, monkeypatch)
    ordres: list[tuple] = []
    sentinelles = _greffer_geste(monkeypatch, ordres)

    sortie = sauvegarde.restaurer_sauvegarde(nom)

    bases = [base for base, _sql, _params in ordres]
    sqls = [sql for _base, sql, _params in ordres]

    # ② DROP/CREATE de la cible, connexion admin sur `postgres` (jamais sur la base courante —
    # elle ferait échouer son propre RENAME au ④).
    assert ordres[0] == (
        "postgres", f"DROP DATABASE IF EXISTS {sauvegarde.RESTORE_DB} WITH (FORCE)", None
    )
    assert ordres[1] == ("postgres", f"CREATE DATABASE {sauvegarde.RESTORE_DB}", None)

    # ③ Les upserts du réveil, DANS `zetis_restore`, avec les clés du régime : suspendu,
    # déclencheur désarmé, paliers MANUAL — dérivées de `service`, jamais recopiées.
    upserts = [
        (base, params) for base, sql, params in ordres if sql.startswith("INSERT INTO app_settings")
    ]
    assert [base for base, _ in upserts] == [sauvegarde.RESTORE_DB] * 4
    assert [params[0] for _, params in upserts] == [
        service.PRODUCTION_SUSPENDED_KEY,
        service.AUTO_TRIGGER_KEY,
        service.A0A,
        service.A1,
    ]
    assert [params[1] for _, params in upserts] == ["true", "false", "2", "2"]

    # ③ bis — la clôture des travaux d'une autre époque (Amendement 1) : DANS `zetis_restore`,
    # APRÈS les upserts du réveil, AVANT le terminate — et le WHERE ne vise que `queued|running`
    # (l'histoire accomplie ne se réécrit JAMAIS). Le motif nomme l'archive restaurée.
    i_reveil = max(i for i, sql in enumerate(sqls) if sql.startswith("INSERT INTO app_settings"))
    i_clot_travaux = next(i for i, sql in enumerate(sqls) if sql.startswith("UPDATE ai_jobs"))
    i_clot_lots = next(i for i, sql in enumerate(sqls) if sql.startswith("UPDATE production_runs"))
    assert bases[i_clot_travaux] == sauvegarde.RESTORE_DB
    assert bases[i_clot_lots] == sauvegarde.RESTORE_DB
    for i in (i_clot_travaux, i_clot_lots):
        assert "SET status = 'failed'" in sqls[i]
        assert "WHERE status IN ('queued', 'running')" in sqls[i]
        assert "succeeded" not in sqls[i] and "done" not in sqls[i]
    assert nom in ordres[i_clot_travaux][2][0]  # le motif nomme l'archive
    assert i_reveil < i_clot_travaux < i_clot_lots

    # ④ Le swap : terminate PUIS drop de `zetis_avant` PUIS les deux RENAME — et TOUS après le
    # dernier upsert du réveil ET la clôture (la base restaurée se réveille suspendue et sans
    # fantôme, jamais l'inverse).
    i_terminate = next(i for i, sql in enumerate(sqls) if "pg_terminate_backend" in sql)
    assert i_clot_lots < i_terminate
    i_drop_avant = sqls.index(f"DROP DATABASE IF EXISTS {sauvegarde.AVANT_DB} WITH (FORCE)")
    i_rename_avant = sqls.index(f"ALTER DATABASE zetis RENAME TO {sauvegarde.AVANT_DB}")
    i_rename_cible = sqls.index(f"ALTER DATABASE {sauvegarde.RESTORE_DB} RENAME TO zetis")
    assert i_reveil < i_terminate < i_drop_avant < i_rename_avant < i_rename_cible
    assert ordres[i_terminate][2] == ("zetis",)
    assert {bases[i] for i in (i_terminate, i_drop_avant, i_rename_avant, i_rename_cible)} == {
        "postgres"
    }

    # Le pool du worker est neutralisé, les étapes ⑤-⑧ ont été appelées, le sidecar est complet.
    assert sentinelles["pool"] and sentinelles["medias"] and sentinelles["purge"]
    assert sentinelles["arret"]
    assert sortie["archive"] == nom
    assert sortie["base_avant"] == sauvegarde.AVANT_DB
    assert _etapes(cible, nom) == [(e, "franchie") for e in sauvegarde.ETAPES_RESTAURATION]
    sidecar = json.loads((cible / f"{nom}.restauration.json").read_text(encoding="utf-8"))
    assert sidecar["termine_le"] is not None


# --- La clôture des fantômes rend les ids, et ne touche QUE le vol (Amendement 1) -----------------


def test_la_cloture_rend_les_ids_et_le_motif_nomme_l_archive(monkeypatch) -> None:
    """Unité de `_ecrire_reveil` : les `RETURNING id` remontent dans le détail du sidecar
    (travaux ET lots), et le motif écrit nomme l'archive — un faux psycopg dont le curseur
    rend des lignes, contrairement au faux global (fetchall vide)."""
    ordres: list[tuple[str, tuple | None]] = []

    class _Curseur:
        def __init__(self, sql: str):
            self._sql = sql

        def fetchall(self):
            if self._sql.startswith("UPDATE ai_jobs"):
                return [(896,), (901,)]
            if self._sql.startswith("UPDATE production_runs"):
                return [(7,)]
            return []

    class _Connexion:
        def __init__(self, dsn, autocommit=False):
            pass

        def execute(self, sql, params=None):
            ordres.append((sql, params))
            return _Curseur(sql)

        def close(self):
            pass

    module = types.ModuleType("psycopg")
    module.Error = type("Error", (Exception,), {})
    module.connect = _Connexion
    monkeypatch.setitem(sys.modules, "psycopg", module)

    detail = sauvegarde._ecrire_reveil("zetis_restore", "zetis-2026-01-01-0000.tar")

    assert detail["travaux_clos"] == [896, 901]
    assert detail["lots_clos"] == [7]
    assert len(detail["cles"]) == 4  # les upserts du réveil n'ont pas bougé
    motif = next(p[0] for s, p in ordres if s.startswith("UPDATE ai_jobs"))
    assert "zetis-2026-01-01-0000.tar" in motif
    assert "ne reprendra pas" in motif


# --- 🔴 409 fail-closed sur CHAQUE précondition (§2) ----------------------------------------------


@pytest.mark.parametrize(
    "cas, fragment",
    [
        ("non_verifiee", "jamais vérifiée"),
        ("verdict_echec", "en échec"),
        ("suspension_inactive", "Suspendre ZETIS"),
        ("non_supervise", "Rien ne supervise"),
        ("travail_en_vol", "travail est en cours"),
        ("lot_en_vol", "lot de production est en cours"),
        ("compat_defavorable", "inconnue du code"),
    ],
)
def test_409_fail_closed_sur_chaque_precondition(
    client_db, cible, media, monkeypatch, file_rq_factice, cas, fragment
) -> None:
    """Chaque précondition du §2, dégradée SEULE depuis l'état tout-vert : 409 motivé, AUCUN
    job créé, rien dans la file."""
    client, TestSession = client_db
    nom = _archive_valide(TestSession, cible, media, monkeypatch)
    monkeypatch.setattr(settings, "production_worker_supervised", True)
    if cas != "compat_defavorable":
        monkeypatch.setattr(sauvegarde, "_tetes_connues", lambda: {"tete-de-test"})
        # Sinon, le VRAI `_tetes_connues` répond : `tete-de-test` est inconnue du code (§5).

    if cas != "non_verifiee":
        if cas == "verdict_echec":
            with TestSession() as db:
                db.add(
                    m.AIJob(
                        job_type=sauvegarde.JOB_TYPE_VERIFY,
                        status="succeeded",
                        output_json={"archive": nom, "verdict": "echec", "ecarts": ["x"]},
                        created_by="file",
                        created_at=datetime.now(timezone.utc),
                    )
                )
                db.commit()
        else:
            _verdict_reussi(TestSession, nom)
    if cas != "suspension_inactive":
        _suspendre(TestSession)
    if cas == "non_supervise":
        monkeypatch.setattr(settings, "production_worker_supervised", False)
    if cas == "travail_en_vol":
        with TestSession() as db:
            db.add(
                m.AIJob(
                    job_type="fiche_generate",
                    status="running",
                    created_by="file",
                    created_at=datetime.now(timezone.utc),
                )
            )
            db.commit()
    if cas == "lot_en_vol":
        with TestSession() as db:
            db.add(
                m.ProductionRun(
                    student_id=1,
                    trigger="manual",
                    authorized_by="parent",
                    status="running",
                    scope_skill_id=1,
                    scope_kind="fiche",
                    created_at=datetime.now(timezone.utc),
                )
            )
            db.commit()
    avant = _nb_jobs(TestSession)
    reponse = client.post(API, json={"archive": nom})

    assert reponse.status_code == 409, reponse.text
    assert fragment in reponse.json()["detail"]
    assert _nb_jobs(TestSession) == avant
    assert file_rq_factice.enqueued == []


@pytest.mark.parametrize(
    "nom",
    ["../zetis-2026-01-01-0000.tar", "/etc/passwd", "zetis-2026-01-01-0000.tar.evil"],
)
def test_un_nom_hors_whitelist_est_refuse_en_409(client_db, cible, file_rq_factice, nom) -> None:
    client, TestSession = client_db

    reponse = client.post(API, json={"archive": nom})

    assert reponse.status_code == 409, reponse.text
    assert "invalide" in reponse.json()["detail"]
    assert _nb_jobs(TestSession) == 0
    assert file_rq_factice.enqueued == []


def test_un_sidecar_manifeste_absent_est_refuse_en_409(
    client_db, cible, file_rq_factice
) -> None:
    """Sans `.manifeste.json`, pas de verdict de compatibilité (§5) — fail-closed AVANT tout."""
    client, TestSession = client_db
    nom = "zetis-2026-01-01-0000.tar"
    (cible / nom).write_bytes(b"tar")
    (cible / f"{nom}.sha256").write_text("x", encoding="utf-8")

    reponse = client.post(API, json={"archive": nom})

    assert reponse.status_code == 409, reponse.text
    assert ".manifeste.json" in reponse.json()["detail"]
    assert _nb_jobs(TestSession) == 0
    assert file_rq_factice.enqueued == []


# --- Une restauration ② qui échoue ne swap pas (§2.②) ---------------------------------------------


def test_une_restauration_qui_echoue_ne_swap_pas(client_db, cible, media, monkeypatch) -> None:
    """`psql` sous ON_ERROR_STOP qui tombe : `zetis` n'a reçu AUCUN ordre — pas de terminate,
    pas de RENAME. Les seuls ordres partis sont le DROP/CREATE de la cible jetable."""
    client, TestSession = client_db
    nom = _preparer_restaurable(TestSession, cible, media, monkeypatch)
    ordres: list[tuple] = []
    _greffer_geste(monkeypatch, ordres, psql_code=3)

    with pytest.raises(sauvegarde.SauvegardeRefusee, match="psql"):
        sauvegarde.restaurer_sauvegarde(nom)

    assert [sql for _b, sql, _p in ordres] == [
        f"DROP DATABASE IF EXISTS {sauvegarde.RESTORE_DB} WITH (FORCE)",
        f"CREATE DATABASE {sauvegarde.RESTORE_DB}",
    ]
    assert _etapes(cible, nom) == [("filet", "franchie"), ("restauration", "echec")]


# --- Le sidecar survit au crash (§3) — et l'exception sortante est STRUCTURELLE -------------------


def test_le_sidecar_survit_au_crash(client_db, cible, media, monkeypatch) -> None:
    """Une exception à l'étape ⑤ laisse un sidecar qui dit : ①-④ franchies, ⑤ en échec — et
    l'exception qui sort est `RestaurationInterrompue` (zéro rejeu), même née d'un
    `ConnectionError` que `failures.is_transient` aurait fait rejouer."""
    client, TestSession = client_db
    nom = _preparer_restaurable(TestSession, cible, media, monkeypatch)
    ordres: list[tuple] = []
    _greffer_geste(monkeypatch, ordres)

    def _medias_qui_levent(_chemin):
        raise ConnectionError("MinIO injoignable (voulu par le test)")

    monkeypatch.setattr(sauvegarde, "_remplacer_medias", _medias_qui_levent)

    with pytest.raises(sauvegarde.RestaurationInterrompue) as excinfo:
        sauvegarde.restaurer_sauvegarde(nom)

    assert not failures.is_transient(excinfo.value)  # le verrou : RQ ne rejouera JAMAIS un swap
    assert _etapes(cible, nom) == [
        ("filet", "franchie"),
        ("restauration", "franchie"),
        ("reveil", "franchie"),
        ("swap", "franchie"),
        ("medias", "echec"),
    ]
    sidecar = json.loads((cible / f"{nom}.restauration.json").read_text(encoding="utf-8"))
    assert sidecar["termine_le"] is None
    assert "MinIO injoignable" in sidecar["etapes"][-1]["motif"]


# --- Aucun octet d'archive sur HTTP (§1) ----------------------------------------------------------


def test_la_reponse_du_post_ne_porte_que_des_metadonnees(
    client_db, cible, media, monkeypatch, file_rq_factice
) -> None:
    client, TestSession = client_db
    nom = _preparer_restaurable(TestSession, cible, media, monkeypatch)

    reponse = client.post(API, json={"archive": nom})

    assert reponse.status_code == 202, reponse.text
    assert set(reponse.json().keys()) == {"job_id", "status"}
    assert len(file_rq_factice.enqueued) == 1


# --- La ligne du travail meurt au swap (§3) : le garde de `run_ai_job` ----------------------------


def test_run_ai_job_survit_a_la_disparition_de_sa_ligne(
    client_db, monkeypatch, executer_travail
) -> None:
    """Un exécutant dont la ligne disparaît PENDANT l'exécution (c'est le swap, §3) : la fin de
    `run_ai_job` rend « introuvable » — aucune exception ne remonte à RQ."""
    client, TestSession = client_db
    from app.modules.ai import travaux
    from app.modules.production import jobs as jobs_mod

    def _executant_dont_la_ligne_meurt(db, _payload, _llm, _embedder) -> dict:
        db.execute(delete(m.AIJob))
        db.commit()
        return {"geste": "fait"}

    monkeypatch.setitem(jobs_mod._EXECUTANTS, "swap_de_test", _executant_dont_la_ligne_meurt)
    with TestSession() as db:
        sortie_route = travaux.enfiler(db, job_type="swap_de_test", payload={})

    sortie = executer_travail(TestSession, sortie_route["job_id"])

    assert sortie == {"error": "introuvable"}
    assert _nb_jobs(TestSession) == 0  # rien n'est recréé : la trace du geste vit en sidecar


# --- Le verdict de compatibilité dans `GET /donnees` (§5) -----------------------------------------


def test_compatibilite_tete_connue_rend_restaurable(client_db, cible, media, monkeypatch) -> None:
    client, TestSession = client_db
    nom = _archive_valide(TestSession, cible, media, monkeypatch)
    monkeypatch.setattr(sauvegarde, "_tetes_connues", lambda: {"tete-de-test"})

    reponse = client.get("/api/settings/donnees")

    archive = next(a for a in reponse.json()["archives"] if a["nom"] == nom)
    assert archive["restaurable"] is True
    assert archive["motif"] is None


def test_compatibilite_tete_inconnue_est_refusee_avec_son_motif(
    client_db, cible, media, monkeypatch
) -> None:
    """`tete-de-test` n'existe pas dans les migrations du VRAI code : le verdict la refuse et
    la nomme (archive plus récente que le code, ou étrangère — §5, troisième cas)."""
    client, TestSession = client_db
    nom = _archive_valide(TestSession, cible, media, monkeypatch)

    reponse = client.get("/api/settings/donnees")

    archive = next(a for a in reponse.json()["archives"] if a["nom"] == nom)
    assert archive["restaurable"] is False
    assert "tete-de-test" in archive["motif"]


def test_compatibilite_sans_manifeste_est_refusee(client_db, cible, monkeypatch) -> None:
    """Une archive sans sidecar `.manifeste.json` : fail-closed, motif rendu (§5)."""
    client, TestSession = client_db
    nom = "zetis-2026-01-01-0000.tar"
    (cible / nom).write_bytes(b"tar nu")

    reponse = client.get("/api/settings/donnees")

    archive = next(a for a in reponse.json()["archives"] if a["nom"] == nom)
    assert archive["restaurable"] is False
    assert "manifeste" in archive["motif"]


# --- Le vocabulaire de la file --------------------------------------------------------------------


def test_l_amorce_backup_restore_existe_et_depasse_le_plancher() -> None:
    assert AMORCES_MS["backup_restore"] >= PLANCHER_MS
