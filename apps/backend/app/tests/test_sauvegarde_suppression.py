"""Test-verrous du DELETE d'archive (ADR-0066 §6, slice 2) — un geste explicite, jamais une rotation.

Les propriétés tenues ici, et qu'aucune retouche ne doit affaiblir :

1. 🔴 **La dernière archive au verdict `reussie` ne se supprime pas** tant qu'aucune autre
   archive vérifiée n'existe : on ne se met jamais soi-même à zéro filet — 409 motivé, RIEN
   n'est supprimé.
2. **Suppression = le tar + TOUS les sidecars** (`.sha256`, `.manifeste.json`,
   `.restauration.json`, et tout sidecar futur du même nom) — rien d'orphelin, et rien d'AUTRE :
   les fichiers d'une autre archive ne bougent pas.
3. **409 fail-closed** quand un travail de la famille sauvegarde est en `queued|running`
   (création, vérification, restauration) : supprimer sous leurs pieds n'a aucun sens.
4. **La whitelist tient** : `../`, chemin absolu, suffixe étranger — refusés, rien supprimé.
"""

from datetime import datetime, timezone
from pathlib import Path

import pytest
from sqlalchemy import select

import app.db.models as m
from app.core.config import settings
from app.main import app
from app.modules.auth.deps import get_current_user
from app.modules.settings import sauvegarde

PAPA = {"username": "papa", "role": "papa"}
API = "/api/settings/donnees/archives"


@pytest.fixture(autouse=True)
def _papa(client_db) -> None:
    app.dependency_overrides[get_current_user] = lambda: PAPA


@pytest.fixture()
def cible(tmp_path, monkeypatch) -> Path:
    dossier = tmp_path / "cible"
    dossier.mkdir()
    monkeypatch.setattr(settings, "backup_dir", str(dossier))
    return dossier


#: Les sidecars réels du dépôt — plus un INCONNU : le verrou « rien d'orphelin » doit tenir
#: aussi pour un sidecar futur, c'est le point du glob.
_SIDECARS = (".sha256", ".manifeste.json", ".restauration.json", ".futur.json")


def _poser_archive(cible: Path, nom: str, *, sidecars: tuple[str, ...] = _SIDECARS) -> None:
    """Une archive posée à la main : le DELETE ne lit jamais le contenu, des octets factices
    suffisent — c'est le refus de RESTAURATION qui exige un vrai manifeste, pas celui-ci."""
    (cible / nom).write_bytes(b"tar-factice")
    for suffixe in sidecars:
        (cible / f"{nom}{suffixe}").write_text("factice", encoding="utf-8")


def _verdict(TestSession, archive: str, verdict: str) -> None:
    with TestSession() as db:
        db.add(
            m.AIJob(
                job_type=sauvegarde.JOB_TYPE_VERIFY,
                status="succeeded",
                output_json={"archive": archive, "verdict": verdict, "ecarts": []},
                created_by="file",
                created_at=datetime.now(timezone.utc),
            )
        )
        db.commit()


def _fichiers(cible: Path) -> set[str]:
    return {p.name for p in cible.iterdir() if p.is_file()}


# --- 🔴 La dernière archive vérifiée ne se supprime pas (§6) --------------------------------------


def test_la_derniere_archive_verifiee_ne_se_supprime_pas(client_db, cible) -> None:
    """Une seule archive au verdict `reussie` sur la cible : 409 motivé, rien ne bouge — même
    entourée d'exports non vérifiés (ils ne comptent pas comme filet)."""
    client, TestSession = client_db
    nom = "zetis-2026-08-19-1200.tar"
    _poser_archive(cible, nom)
    _poser_archive(cible, "zetis-2026-08-19-1300.tar")  # jamais vérifiée : pas un filet
    _verdict(TestSession, nom, "reussie")
    avant = _fichiers(cible)

    reponse = client.delete(f"{API}/{nom}")

    assert reponse.status_code == 409, reponse.text
    assert "zéro filet" in reponse.json()["detail"]
    assert nom in reponse.json()["detail"]
    assert _fichiers(cible) == avant


def test_une_autre_archive_verifiee_libere_la_suppression(client_db, cible) -> None:
    """Deux archives vérifiées : supprimer l'une des deux passe — l'autre reste le filet."""
    client, TestSession = client_db
    nom = "zetis-2026-08-19-1200.tar"
    autre = "zetis-2026-08-19-1300.tar"
    _poser_archive(cible, nom)
    _poser_archive(cible, autre)
    _verdict(TestSession, nom, "reussie")
    _verdict(TestSession, autre, "reussie")

    reponse = client.delete(f"{API}/{nom}")

    assert reponse.status_code == 200, reponse.text
    assert not (cible / nom).exists()
    # L'autre archive et TOUS ses fichiers sont intacts.
    assert _fichiers(cible) == {autre, *(f"{autre}{s}" for s in _SIDECARS)}


def test_une_archive_en_echec_ou_jamais_verifiee_se_supprime(client_db, cible) -> None:
    """Le verrou ne protège que le filet : un export non vérifié — ou en échec — se supprime,
    même quand c'est la seule archive de la cible."""
    client, TestSession = client_db
    nom = "zetis-2026-08-19-1200.tar"
    _poser_archive(cible, nom)
    _verdict(TestSession, nom, "echec")

    reponse = client.delete(f"{API}/{nom}")

    assert reponse.status_code == 200, reponse.text
    assert _fichiers(cible) == set()


# --- Suppression = tar + TOUS les sidecars, rien d'orphelin (§6) ----------------------------------


def test_la_suppression_retire_le_tar_et_tous_les_sidecars(client_db, cible) -> None:
    """Y compris un sidecar d'un type INCONNU du code : le contrat est « rien d'orphelin »,
    pas « la liste que je connais ». Et la réponse ne porte que des NOMS — jamais un contenu."""
    client, _ = client_db
    nom = "zetis-2026-08-19-1200.tar"
    _poser_archive(cible, nom)

    reponse = client.delete(f"{API}/{nom}")

    assert reponse.status_code == 200, reponse.text
    corps = reponse.json()
    assert set(corps.keys()) == {"archive", "supprimes"}
    assert corps["archive"] == nom
    assert set(corps["supprimes"]) == {nom, *(f"{nom}{s}" for s in _SIDECARS)}
    assert _fichiers(cible) == set()


# --- 409 fail-closed : un travail de la famille sauvegarde est en vol -----------------------------


@pytest.mark.parametrize(
    "job_type, statut",
    [
        (sauvegarde.JOB_TYPE, "queued"),
        (sauvegarde.JOB_TYPE_VERIFY, "running"),
        (sauvegarde.JOB_TYPE_RESTORE, "queued"),
    ],
)
def test_409_si_un_travail_de_sauvegarde_est_en_vol(
    client_db, cible, job_type, statut
) -> None:
    client, TestSession = client_db
    nom = "zetis-2026-08-19-1200.tar"
    _poser_archive(cible, nom)
    with TestSession() as db:
        db.add(
            m.AIJob(
                job_type=job_type,
                status=statut,
                created_by="file",
                created_at=datetime.now(timezone.utc),
            )
        )
        db.commit()
    avant = _fichiers(cible)

    reponse = client.delete(f"{API}/{nom}")

    assert reponse.status_code == 409, reponse.text
    assert job_type in reponse.json()["detail"]
    assert _fichiers(cible) == avant


# --- La whitelist tient — le nom vient du client ---------------------------------------------------


def test_un_suffixe_etranger_est_refuse_en_409_sur_la_route(client_db, cible) -> None:
    client, _ = client_db
    _poser_archive(cible, "zetis-2026-08-19-1200.tar")

    reponse = client.delete(f"{API}/zetis-2026-08-19-1200.tar.evil")

    assert reponse.status_code == 409, reponse.text
    assert "invalide" in reponse.json()["detail"]
    assert len(_fichiers(cible)) == 5  # rien n'a bougé


@pytest.mark.parametrize("nom", ["../zetis-2026-01-01-0000.tar", "/etc/passwd", "zetis.tar"])
def test_la_whitelist_refuse_toute_traversee(client_db, cible, nom) -> None:
    """Sur la fonction elle-même : un chemin relatif ou absolu ne passe JAMAIS la whitelist —
    le test HTTP ne suffit pas ici, le routeur peut réécrire un chemin avant la route."""
    _, TestSession = client_db

    with TestSession() as db:
        motif = sauvegarde.refus_suppression(db, nom)

    assert motif is not None and "invalide" in motif


def test_une_archive_introuvable_est_refusee_en_409(client_db, cible) -> None:
    client, _ = client_db

    reponse = client.delete(f"{API}/zetis-2026-08-19-1200.tar")

    assert reponse.status_code == 409, reponse.text
    assert "introuvable" in reponse.json()["detail"]


def test_supprimer_sauvegarde_reverifie_la_whitelist() -> None:
    """Défense en profondeur (patron `verifier_sauvegarde`) : même appelée directement, la
    fonction refuse un nom hors whitelist — le glob n'est sûr que derrière elle."""
    with pytest.raises(sauvegarde.SauvegardeRefusee, match="invalide"):
        sauvegarde.supprimer_sauvegarde("../zetis-2026-01-01-0000.tar")


# --- Aucun état sauvegarde ne fuit ailleurs --------------------------------------------------------


def test_le_delete_ne_touche_pas_les_travaux(client_db, cible) -> None:
    """Le DELETE retire des fichiers, jamais l'histoire : les lignes `ai_jobs` (verdicts de
    vérification compris) restent — c'est l'archive qui part, pas sa trace."""
    client, TestSession = client_db
    nom = "zetis-2026-08-19-1200.tar"
    autre = "zetis-2026-08-19-1300.tar"
    _poser_archive(cible, nom)
    _poser_archive(cible, autre)
    _verdict(TestSession, nom, "reussie")
    _verdict(TestSession, autre, "reussie")

    assert client.delete(f"{API}/{nom}").status_code == 200

    with TestSession() as db:
        restants = db.execute(select(m.AIJob.id)).scalars().all()
    assert len(restants) == 2
