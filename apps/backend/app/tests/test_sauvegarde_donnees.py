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


# --- Le verdict de restauration vient du sidecar `.restauration.json` (ADR-0067 §2) --------------
#
# ⚠️ **Deux tests de ce bloc ont CHANGÉ DE COMPORTEMENT le 2026-08-21, et c'est voulu** — ce ne
# sont pas des verrous desserrés pour passer au vert. Ils assertaient `restauree_le`, un champ que
# l'ADR-0067 §2 REMPLACE. Surtout, le second figeait le défaut que ce chantier répare : il exigeait
# qu'un geste interrompu réponde comme une archive jamais restaurée (sa docstring disait « et sans
# sidecar du tout, même réponse »). C'est exactement cette confusion qui est cassée ici.
#
# Mesure du changement : 1564 tests verts, **2 rouges — ces deux-là et aucun autre**.


def test_le_verdict_de_restauration_est_lu_du_sidecar(
    client_db, cible, media, monkeypatch
) -> None:
    """Le seul survivant du geste : la ligne `ai_jobs` meurt au swap — c'est le sidecar qui dit
    ce qui s'est passé, et le GET le relaie."""
    import json as json_lib

    client, TestSession = client_db
    nom = _archive_valide(TestSession, cible, media, monkeypatch)
    (cible / f"{nom}.restauration.json").write_text(
        json_lib.dumps({"archive": nom, "termine_le": "2026-08-19T21:12:00+00:00"}),
        encoding="utf-8",
    )

    corps = client.get(API).json()

    (archive,) = corps["archives"]
    assert archive["restauration"]["termine_le"] == "2026-08-19T21:12:00+00:00"
    assert archive["restauration"]["verdict"] == "reussie"
    assert archive["restauration"]["etape_arretee"] is None
    assert archive["restauration"]["ecarts"] == 0


def test_un_geste_interrompu_rend_son_etape_ET_son_motif(
    client_db, cible, media, monkeypatch
) -> None:
    """🔴 LE test du chantier — et il assert l'INVERSE de ce qu'il assertait avant.

    Jusqu'au 2026-08-21, une restauration arrêtée en route rendait `None` : à l'écran, elle était
    **indiscernable d'une archive jamais restaurée**. Le sidecar portait pourtant l'étape fautive
    et son motif, écrits par `_JournalRestauration.echouer()` avant que l'exception ne remonte.
    L'information existait ; personne ne la demandait (ADR-0067 §Contexte).
    """
    import json as json_lib

    client, TestSession = client_db
    nom = _archive_valide(TestSession, cible, media, monkeypatch)
    (cible / f"{nom}.restauration.json").write_text(
        json_lib.dumps(
            {
                "archive": nom,
                "termine_le": None,
                "etapes": [
                    {"etape": "filet", "statut": "franchie"},
                    {"etape": "medias", "statut": "echec", "motif": "bucket injoignable"},
                ],
                "ecarts": ["recyclage ⑧ non demandé"],
            }
        ),
        encoding="utf-8",
    )

    corps = client.get(API).json()

    (archive,) = corps["archives"]
    assert archive["restauration"]["verdict"] == "interrompue"
    assert archive["restauration"]["termine_le"] is None
    assert archive["restauration"]["etape_arretee"] == "medias"
    # Rendu TEL QUEL — aucune table « motif technique → phrase douce » (ADR-0041 §8).
    assert archive["restauration"]["motif"] == "bucket injoignable"
    assert archive["restauration"]["ecarts"] == 1


def test_une_archive_jamais_restauree_rend_null(
    client_db, cible, media, monkeypatch
) -> None:
    """Aucun sidecar = jamais restaurée. C'est le SEUL cas qui rend `null` — et il ne se confond
    plus avec un geste interrompu, ce qui est tout l'objet du chantier."""
    client, TestSession = client_db
    _archive_valide(TestSession, cible, media, monkeypatch)

    corps = client.get(API).json()

    (archive,) = corps["archives"]
    assert archive["restauration"] is None


def test_un_sidecar_illisible_n_empeche_pas_l_archive_de_s_afficher(
    client_db, cible, media, monkeypatch
) -> None:
    """Même règle que le `.sha256` : cacher un fichier présent sur la cible serait un mensonge."""
    client, TestSession = client_db
    nom = _archive_valide(TestSession, cible, media, monkeypatch)
    (cible / f"{nom}.restauration.json").write_text("{ pas du JSON", encoding="utf-8")

    corps = client.get(API).json()

    (archive,) = corps["archives"]
    assert archive["restauration"] is None
    assert archive["nom"] == nom  # l'archive est là, et le reste de ses métadonnées aussi
    assert archive["sha256"] is not None


def test_l_etape_arretee_appartient_aux_etapes_du_journal(
    client_db, cible, media, monkeypatch
) -> None:
    """🔒 La valeur est liée à la CONSTANTE du journal, pas à une chaîne recopiée.

    Une assertion sur `"medias"` en dur resterait verte le jour où quelqu'un renomme une étape
    dans `ETAPES_RESTAURATION` — le dépôt a déjà payé ce patron ailleurs. Ici, le test rougit.
    """
    import json as json_lib

    from app.modules.settings.sauvegarde import ETAPES_RESTAURATION

    client, TestSession = client_db
    nom = _archive_valide(TestSession, cible, media, monkeypatch)
    for etape in ETAPES_RESTAURATION:
        (cible / f"{nom}.restauration.json").write_text(
            json_lib.dumps(
                {"archive": nom, "termine_le": None, "etapes": [{"etape": etape, "statut": "echec"}]}
            ),
            encoding="utf-8",
        )
        (archive,) = client.get(API).json()["archives"]
        assert archive["restauration"]["etape_arretee"] in ETAPES_RESTAURATION


def test_le_champ_restauree_le_ne_revient_pas(client_db, cible, media, monkeypatch) -> None:
    """🔒 Cliquet — le champ REMPLACÉ par l'ADR-0067 §2 ne se réintroduit pas « pour
    compatibilité ». Deux formulations d'un même fait finissent par diverger."""
    client, TestSession = client_db
    _archive_valide(TestSession, cible, media, monkeypatch)

    (archive,) = client.get(API).json()["archives"]

    assert "restauree_le" not in archive, (
        "Le champ retiré est revenu : le §2 tranche pour UNE seule formulation."
    )


# --- Le contrat avec le front (ADR-0067) ---------------------------------------------------------
#
# ⚠️ **Ces deux tests sont la SEULE chose qui empêche un renommage de clé de passer inaperçu.**
# Le reste de ce fichier teste le backend contre lui-même, et le front mocke `fetchDonnees` :
# renommez une clé d'un seul côté et **les deux suites restent vertes**. C'est arrivé le
# 2026-08-04 sur `preset` → `niveau`, et seul un appel réel l'a montré. Le remplacement du champ
# de restauration (ADR-0067 §2) est exactement le même genre de renommage.
#
# Point de contact : `packages/types/contracts/donnees.example.json`, CAPTURÉ le 2026-08-21
# depuis le backend réel (port 8005, cible de dev — la seule qui porte une archive réellement
# restaurée). Relu ICI (la réponse a-t-elle ces clés ?) et LÀ-BAS (l'écran sait-il les lire ?).
#
# ⚠️ Le contrat se CAPTURE, il ne s'écrit pas — cf. le README du dossier.


def _contrat_donnees() -> dict:
    import json as json_lib
    from pathlib import Path as P

    racine = P(__file__).resolve().parents[4]
    return json_lib.loads(
        (racine / "packages/types/contracts/donnees.example.json").read_text(encoding="utf-8")
    )


def test_la_reponse_a_exactement_les_cles_du_contrat(
    client_db, cible, media, monkeypatch
) -> None:
    """Une clé en plus est aussi grave qu'une clé en moins : la première dit qu'on a livré sans
    mettre le contrat à jour, la seconde qu'on a cassé le front."""
    import json as json_lib

    client, TestSession = client_db
    nom = _archive_valide(TestSession, cible, media, monkeypatch)
    (cible / f"{nom}.restauration.json").write_text(
        json_lib.dumps({"archive": nom, "termine_le": "2026-08-19T16:46:16.708438+00:00"}),
        encoding="utf-8",
    )

    corps = client.get(API).json()
    contrat = _contrat_donnees()

    assert sorted(corps) == sorted(contrat), (
        "La racine de la réponse ne correspond plus au contrat capturé. "
        "Si c'est voulu : RE-CAPTURER le fichier ET adapter le front."
    )
    assert sorted(corps["archives"][0]) == sorted(contrat["archives"][0])

    # 🔴 Et les clés IMBRIQUÉES, sinon le test ne mord pas là où le chantier a changé quelque
    # chose : renommer un champ DANS `restauration` ne bouge aucune clé au niveau de l'archive.
    # Relevé en écrivant la contre-épreuve — la première version de ce test passait au vert avec
    # `motif` renommé côté serveur.
    reponse = corps["archives"][0]["restauration"]
    attendu = next(a["restauration"] for a in contrat["archives"] if a["restauration"] is not None)
    assert reponse is not None, "l'archive de ce test porte un sidecar : elle doit rendre l'objet"
    assert sorted(reponse) == sorted(attendu), (
        "Les clés de `restauration` ne correspondent plus au contrat capturé."
    )


def test_le_contrat_porte_les_cinq_cles_de_la_restauration(client_db) -> None:
    """🔴 Le cœur de l'ADR-0067 §2. ⚠️ Les VALEURS n'engagent rien — seules les clés font foi :
    figer un horodatage rendrait ce test rouge au premier geste rejoué en dev, pour une raison
    qui n'est pas une régression."""
    contrat = _contrat_donnees()

    restaurees = [a for a in contrat["archives"] if a["restauration"] is not None]
    assert restaurees, (
        "Le contrat capturé ne porte AUCUNE archive restaurée : il ne garde donc rien des "
        "sous-clés du verdict. Re-capturer depuis une cible qui en a une."
    )
    assert sorted(restaurees[0]["restauration"]) == [
        "ecarts",
        "etape_arretee",
        "motif",
        "termine_le",
        "verdict",
    ]
    # Le champ REMPLACÉ ne traîne nulle part dans la réponse capturée.
    assert all("restauree_le" not in a for a in contrat["archives"])
