"""Test-verrous de « ce qui prend de la place » (ADR-0069) — les quatre postes de `GET /donnees`.

Les propriétés tenues, et chacune a coûté quelque chose :

1. 🔴 **Le backend de stockage INACTIF n'est jamais interrogé** (§3). Un contrôle qui devinait le
   backend a produit un « 0 fichier » alarmant sur des données intactes le 2026-08-18.
2. 🔴 **Les modèles ne sont JAMAIS dans le total** (§2) — ils dominent tout le reste et sont
   régénérables ; les compter dirait que ZETIS grossit alors que c'est un téléchargement figé.
3. 🔴 **Aucun chemin en dur** (§4) : tout suit la configuration. `audio_storage_dir` est
   **relatif**, et deux `storage/` coexistent dans le dépôt — une constante y désignerait le
   mauvais et rendrait un total silencieusement faux.
4. **Aucun espace libre** n'est servi (§1) : ni octets libres, ni pourcentage, ni plafond.
5. **Non mesurable ≠ vide** : `pg_database_size` n'existe pas sous SQLite (tout ce fichier), et
   la base rend `None` — le total avec elle, plutôt qu'un nombre amputé sans le dire.
"""

import pytest

from app.core.config import settings
from app.main import app
from app.modules.auth.deps import get_current_user
from app.modules.capsules import storage
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
    """Un `audio_storage_dir` À NOUS — c'est le verrou du §4 en action : si la mesure lisait un
    chemin en dur, elle ignorerait ce répertoire et ces tests seraient verts pour rien."""
    dossier = tmp_path / "audio"
    (dossier / "capsules" / "9").mkdir(parents=True)
    (dossier / "capsules" / "9" / "scene_0.wav").write_bytes(b"x" * 1000)
    monkeypatch.setattr(settings, "audio_storage_dir", str(dossier))
    monkeypatch.setattr(settings, "storage_backend", "disk")
    return dossier


@pytest.fixture()
def modeles(tmp_path, monkeypatch):
    """Le répertoire des modèles, lu du `piper_voice_model` de la CONFIG (un fichier : c'est son
    parent qui se mesure). Écrire `storage/models` dans le code serait le §4 violé."""
    dossier = tmp_path / "modeles"
    dossier.mkdir()
    (dossier / "voix.onnx").write_bytes(b"m" * 500)
    monkeypatch.setattr(settings, "piper_voice_model", str(dossier / "voix.onnx"))
    return dossier


# --- 🔴 §3 — le backend inactif n'apparaît jamais -------------------------------------------------


def test_le_backend_inactif_n_est_jamais_interroge(client_db, cible, media, modeles, monkeypatch):
    """🔴 Le cœur du §3. Sous `disk`, MinIO n'est pas contacté — pas même pour en lire un zéro.

    ⚠️ Ce test ne vérifie pas un affichage : il vérifie qu'AUCUN APPEL ne part. Un « MinIO :
    0 Mo » exact et rassurant serait déjà la faute — c'est ce chiffre-là, juste et hors contexte,
    qui a fait conclure à une perte de contenu le 2026-08-18.
    """
    appels = []
    monkeypatch.setattr(storage, "taille_videos", lambda: appels.append(1))

    corps = client_db[0].get(API).json()

    assert appels == [], "le backend inactif a été interrogé — c'est le faux positif du §3"
    assert corps["occupation"]["medias"] == 1000


def test_sous_minio_la_video_s_ajoute_a_l_audio_du_disque(
    client_db, cible, media, modeles, monkeypatch
):
    """🔴 L'audio n'est JAMAIS dans MinIO — la correction que le read-before-code a imposée.

    `storage_backend` ne gouverne que le MP4 (`capsules/storage.py`). Mesurer « le backend actif
    et lui seul » tairait 100 % des pistes voix dès la bascule : ici, les 1000 octets d'audio
    doivent survivre au passage à MinIO.
    """
    monkeypatch.setattr(settings, "storage_backend", "minio")
    monkeypatch.setattr(storage, "taille_videos", lambda: 7000)

    corps = client_db[0].get(API).json()

    assert corps["occupation"]["medias"] == 8000


def test_un_minio_injoignable_rend_non_mesurable_jamais_zero(
    client_db, cible, media, modeles, monkeypatch
):
    """« Je ne sais pas » n'est pas « c'est vide » — et le total ne devine pas à sa place."""
    monkeypatch.setattr(settings, "storage_backend", "minio")
    monkeypatch.setattr(storage, "taille_videos", lambda: None)

    occ = client_db[0].get(API).json()["occupation"]

    assert occ["medias"] is None
    assert occ["total"] is None


def test_sous_disque_le_mp4_n_est_pas_compte_deux_fois(client_db, cible, media, modeles):
    """⚠️ Le MP4 vit DANS le répertoire audio : la marche l'a déjà compté.

    Sans ce verrou, ajouter `taille_videos()` sous `disk` doublerait chaque vidéo — et le total
    grossirait d'un poste entier sans qu'aucune donnée n'ait été produite.
    """
    (media / "capsules" / "9" / "video.mp4").write_bytes(b"v" * 4000)

    assert client_db[0].get(API).json()["occupation"]["medias"] == 5000


# --- 🔴 §2 — les modèles ne sont jamais dans le total ---------------------------------------------


def test_les_modeles_sont_affiches_mais_hors_du_total(client_db, cible, media, modeles):
    """🔴 Les deux moitiés de la décision, et il faut les deux.

    Les compter ferait croire que ZETIS grossit alors que c'est un téléchargement figé. Les
    TAIRE ferait de 194 Mo un mystère sur le disque. Ils s'affichent, hors total.
    """
    occ = client_db[0].get(API).json()["occupation"]

    assert occ["modeles"] == 500, "les modèles ont disparu de l'écran"
    assert occ["total"] is None, "sous SQLite la base manque : le total ne peut pas se rendre"


def test_les_modeles_restent_hors_du_total_meme_quand_il_se_calcule(
    client_db, cible, media, modeles, monkeypatch
):
    """Le même verrou, mais sur un total RÉELLEMENT calculé — sinon `None` le rendrait vert
    pour la mauvaise raison. On simule une base mesurable."""
    from app.modules.settings import occupation as occ_mod

    monkeypatch.setattr(occ_mod, "_base", lambda db: 300)

    occ = client_db[0].get(API).json()["occupation"]

    assert occ["modeles"] == 500, "sans modèles à l'écran, ce test ne prouve rien"
    assert occ["total"] == occ["medias"] + occ["base"] + occ["archives"]
    assert occ["total"] == 1000 + 300 + 0, "les 500 octets de modèles se sont invités"


# --- 🔴 §4 — aucun chemin en dur ------------------------------------------------------------------


def test_les_postes_suivent_la_configuration(
    client_db, cible, media, modeles, monkeypatch, tmp_path
):
    """🔴 Déplacer les répertoires DÉPLACE la mesure. Un chemin en dur rendrait ce test rouge —
    ou pire, vert sur les octets d'un autre `storage/`."""
    ailleurs = tmp_path / "ailleurs"
    (ailleurs / "capsules").mkdir(parents=True)
    (ailleurs / "capsules" / "autre.wav").write_bytes(b"y" * 42)
    monkeypatch.setattr(settings, "audio_storage_dir", str(ailleurs))

    assert client_db[0].get(API).json()["occupation"]["medias"] == 42


def test_un_repertoire_absent_rend_zero_jamais_une_erreur(
    client_db, cible, modeles, monkeypatch, tmp_path
):
    """Le déploiement neuf : aucun média n'a encore été produit, le répertoire n'existe pas.

    Le panneau rend 0 — il ne tombe pas, et il ne rend pas « non mesurable » non plus : un
    répertoire vide est un fait connu, pas une ignorance.
    """
    monkeypatch.setattr(settings, "audio_storage_dir", str(tmp_path / "jamais-cree"))
    monkeypatch.setattr(settings, "storage_backend", "disk")

    reponse = client_db[0].get(API)

    assert reponse.status_code == 200
    assert reponse.json()["occupation"]["medias"] == 0


# --- Les archives, sommées sur la liste déjà construite -------------------------------------------


def test_le_total_des_archives_est_la_somme_de_celles_qui_sont_listees(
    client_db, cible, media, modeles, monkeypatch
):
    """⚠️ La somme se fait sur les `stat` DÉJÀ posés par `etat_donnees`, pas sur un second
    `glob` : deux parcours du même dossier divergeraient le jour où l'un filtre un nom que
    l'autre garde."""
    client, TestSession = client_db
    _archive_valide(TestSession, cible, media, monkeypatch)

    corps = client.get(API).json()

    assert corps["archives"], "ce test ne prouve rien sans archive sur la cible"
    assert corps["occupation"]["archives"] == sum(a["taille"] for a in corps["archives"])


# --- §1 — aucun espace libre, et la base non mesurable --------------------------------------------


def test_aucun_espace_libre_ne_sort_de_la_route(client_db, cible, media, modeles):
    """🔴 Le critère 1 du §Périmètre, tenu au niveau du CONTRAT et pas de l'écran : ce qui n'est
    pas servi ne peut pas être affiché par mégarde plus tard."""
    occ = client_db[0].get(API).json()["occupation"]

    assert set(occ) == {"medias", "base", "archives", "total", "modeles"}


def test_sous_sqlite_la_base_est_non_mesurable_et_le_total_avec_elle(
    client_db, cible, media, modeles
):
    """`pg_database_size` n'existe pas hors Postgres — toute cette suite tourne sur SQLite.

    🔴 Le total refuse alors de se rendre : sommer les postes connus donnerait un nombre plus
    petit que la réalité, sans rien à l'écran pour le dire. C'est le « chiffre faux le jour où
    il compte » du §1.
    """
    occ = client_db[0].get(API).json()["occupation"]

    assert occ["base"] is None
    assert occ["total"] is None
    assert occ["medias"] is not None, "seule la base est non mesurable ici"


def test_la_session_reste_utilisable_apres_une_mesure_impossible(client_db, cible, media, modeles):
    """⚠️ Le `rollback` de `_base` : sous Postgres, une erreur SQL avorte la transaction et tout
    ce qui réutilise la session échoue ensuite. Deux appels de suite le prouvent."""
    assert client_db[0].get(API).status_code == 200
    assert client_db[0].get(API).status_code == 200
