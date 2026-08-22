"""🧠 La machine (ADR-0062 §2) — les verrous de `GET /api/settings/machine`.

Deux verrous portent tout le reste :

- **aucun secret ne sort** — la clé Anthropic est un booléen de présence, jamais une valeur ni un
  préfixe. C'est le test qui rend l'onglet publiable dans une capture d'écran.
- **aucune écriture n'existe** — pas de `PUT /machine`, pas de `MachineRequest`. Le routage vit en
  variables d'environnement lues au démarrage ; un schéma d'écriture serait la première pierre d'un
  interrupteur sans effet.
"""

from datetime import datetime, timedelta, timezone

import pytest

import app.db.models as m
from app.core.config import settings
from app.main import app
from app.modules.auth.deps import get_current_user
from app.modules.settings import machine

PAPA = {"username": "papa", "role": "papa"}
CHILD = {"username": "massimo", "role": "child"}
API = "/api/settings/machine"


def _as(role: dict) -> None:
    app.dependency_overrides[get_current_user] = lambda: role


@pytest.fixture(autouse=True)
def _papa(client_db) -> None:
    _as(PAPA)


@pytest.fixture(autouse=True)
def _sondes_sans_reseau(monkeypatch) -> None:
    """🔴 **Ces tests frappaient le réseau POUR DE VRAI, et payaient trois délais d'attente.**

    Mesuré le 2026-08-22 : ce fichier prenait **97 s sur les 124 s de toute la suite** — 19 tests à
    **6,05 s**, soit exactement les trois sondes bloquantes (Redis, Ollama à `SONDE_TIMEOUT_S`,
    MinIO ; Postgres est instantané sur la session SQLite). Le reste du dépôt — 1569 tests — tourne
    en 27 s, le plus lent à 0,75 s.

    🔴 **Et c'était une LOTERIE, pas seulement une lenteur.** La même suite, sur le même commit :
    **124 s** avec les services de dev arrêtés, **28 s** avec eux debout. La durée ET le chemin de
    code dépendaient de l'état de Docker sur la machine — la famille exacte du défaut corrigé le
    même jour dans `CouverturePage.test.tsx`. En CI les services ne sont **jamais** joignables :
    chaque PR payait les 96 s.

    ⚠️ **On neutralise le RÉSEAU, pas les sondes** — et la distinction porte tout ce verrou.
    Remplacer `machine.sondes()` par une liste toute faite serait plus court et rendrait
    `test_aucun_mot_de_passe_ne_sort` **aveugle** : les sondes sont précisément le code qui
    manipule les chaînes de connexion (`minio_endpoint`, les identifiants, le DSN). Ici leur corps
    s'exécute en entier, exceptions comprises — on ne fait que rendre l'échec **immédiat** au lieu
    de le faire attendre.

    ⚠️ Chaque `setattr` vise l'endroit où la sonde va CHERCHER le client, et ces endroits
    diffèrent : `httpx` est importé en tête de `machine.py`, tandis que `_redis` et `Minio` sont
    importés **dans** la fonction (import paresseux) — les patcher sur `machine` n'aurait aucun
    effet, il faut les patcher à leur source.
    """

    def _injoignable(*_a, **_k):
        raise ConnectionError("réseau neutralisé par le test")

    monkeypatch.setattr(machine.httpx, "get", _injoignable)
    monkeypatch.setattr("app.core.queue._redis", _injoignable)
    monkeypatch.setattr("minio.Minio", _injoignable)


# --- 🔴 Aucun secret ------------------------------------------------------------------------------


def test_la_cle_anthropic_ne_sort_jamais(client_db, monkeypatch) -> None:
    """Sa PRÉSENCE s'affiche, en booléen. Ni la valeur, ni un préfixe, ni une longueur.

    Un préfixe suffit à identifier une clé dans une fuite, et une longueur suffit à distinguer deux
    comptes. Le seul champ sûr est le booléen.
    """
    client, _ = client_db
    monkeypatch.setattr(settings, "anthropic_api_key", "sk-ant-SECRET-NE-DOIT-PAS-SORTIR")

    brut = client.get(API).text

    assert "SECRET-NE-DOIT-PAS-SORTIR" not in brut
    assert "sk-ant" not in brut
    assert client.get(API).json()["cle_anthropic_presente"] is True


def test_aucun_mot_de_passe_ne_sort(client_db) -> None:
    """Les URL de service portent des identifiants (`postgresql://zetis:motdepasse@…`). Aucune ne
    doit traverser — on rend un ÉTAT, jamais une chaîne de connexion."""
    client, _ = client_db

    brut = client.get(API).text

    assert "zetis_dev_password" not in brut
    assert "zetis_minio_password" not in brut
    assert "postgresql" not in brut


# --- 🔴 Aucune écriture ---------------------------------------------------------------------------


def test_aucune_ecriture_n_existe_sur_cet_onglet(client_db) -> None:
    """Pas de `PUT`, pas de `PATCH`. Le routage vit en `.env`, lu au démarrage : un endpoint
    d'écriture serait mort, ou serait un autre chantier."""
    client, _ = client_db

    assert client.put(API, json={}).status_code == 405
    assert client.patch(API, json={}).status_code == 405


# --- Ce que la charge porte -----------------------------------------------------------------------


def test_la_carte_des_moteurs_dit_ou_va_chaque_tache(client_db) -> None:
    """Chaque ligne dit `local` ou `cloud`, et ce qui part. Une ligne muette sur ce point serait
    pire qu'absente : elle laisserait supposer que rien ne sort."""
    client, _ = client_db

    moteurs = client.get(API).json()["moteurs"]

    assert moteurs, "la carte des moteurs ne doit jamais être vide"
    for ligne in moteurs:
        assert ligne["ou"] in {"local", "cloud"}
        assert ligne["ce_qui_part"]


def test_la_dictee_et_les_embeddings_sont_verrouilles_AVEC_leur_motif(client_db) -> None:
    """Un cadenas muet se lit comme une panne. Toute ligne verrouillée porte son motif."""
    client, _ = client_db

    par_tache = {l["tache"]: l for l in client.get(API).json()["moteurs"]}

    assert par_tache["Embeddings RAG"]["motif"]
    assert par_tache["Dictée (ELI5)"]["motif"]


def test_les_prompts_sont_lus_des_modules_et_pas_d_une_liste(client_db) -> None:
    """⚠️ La maquette annonçait `packages/prompts` — qui ne contient qu'un README. Les prompts sont
    des modules de `apps/backend/app/prompts/`, et ce test échoue si on revient à une liste écrite
    à la main : il compte ce que le PAQUET contient réellement."""
    client, _ = client_db

    trouves = client.get(API).json()["prompts"]

    assert len(trouves) >= 12
    assert {p["module"] for p in trouves} >= {"capsule", "eli5", "fiche", "quiz"}
    assert all(p["version"] for p in trouves)


def test_les_reglages_env_portent_tous_leur_motif(client_db) -> None:
    """Les afficher est le point, pas les régler — donc chacun dit pourquoi il n'est pas un champ."""
    client, _ = client_db

    for r in client.get(API).json()["reglages_env"]:
        assert r["motif"], r["nom"]


# --- Les échecs et les statistiques ---------------------------------------------------------------


def _job(db, **kw) -> m.AIJob:
    defauts = {
        "job_type": "equip_notion",
        "status": "succeeded",
        "created_by": "file",
        "created_at": datetime.now(timezone.utc),
        "duration_ms": 60_000,
    }
    job = m.AIJob(**{**defauts, **kw})
    db.add(job)
    db.commit()
    return job


def test_un_echec_remonte_AVEC_le_message_du_serveur(client_db) -> None:
    """C'est la vraie demande derrière « les logs » : le motif existe en base depuis toujours, et
    un travail `failed` était muet côté client."""
    client, Session = client_db
    with Session() as db:
        _job(db, status="failed", error_message='Aucun exécutant pour "srs_cards_generate"')

    echecs = client.get(API).json()["echecs"]

    assert echecs["total"] == 1
    assert echecs["non_acquittes"] == 1
    assert "srs_cards_generate" in echecs["lignes"][0]["message"]
    assert echecs["lignes"][0]["acquitte"] is False


def test_l_acquittement_est_serveur_et_se_lit_dans_la_charge(client_db) -> None:
    """Jamais un `localStorage` : un acquittement par navigateur reviendrait au prochain appareil."""
    client, Session = client_db
    with Session() as db:
        _job(db, status="failed", error_message="boum", acknowledged_at=datetime.now(timezone.utc))

    charge = client.get(API).json()["echecs"]
    assert charge["lignes"][0]["acquitte"] is True
    assert charge["non_acquittes"] == 0


def test_les_traces_synchrones_ne_polluent_pas_les_statistiques(client_db) -> None:
    """🔴 Le filtre `created_by="file"` n'est pas un détail : sans lui, l'estimation annonçait
    **7,2 s pour un travail de 53,6 s**. Les traces d'appels (~143 par travail) noient la mesure."""
    client, Session = client_db
    with Session() as db:
        _job(db, duration_ms=60_000)
        _job(db, duration_ms=60_000)
        # Une TRACE : même table, autre nature. Elle ne doit compter nulle part ici.
        _job(db, created_by="child", duration_ms=200)

    stats = {s["job_type"]: s for s in client.get(API).json()["sept_derniers_jours"]}

    assert stats["equip_notion"]["reussis"] == 2
    assert stats["equip_notion"]["mediane_ms"] == 60_000


def test_un_travail_hors_fenetre_ne_compte_pas(client_db) -> None:
    """Le tableau s'intitule « 7 derniers jours ». Il doit donc lire 7 jours, pas « les N derniers
    travaux » — sinon il ment sur son propre titre."""
    client, Session = client_db
    with Session() as db:
        _job(db, created_at=datetime.now(timezone.utc) - timedelta(days=30))

    assert client.get(API).json()["sept_derniers_jours"] == []


def test_une_mediane_sans_mesure_est_nulle_jamais_zero(client_db) -> None:
    """Zéro n'est pas une durée courte, c'est une absence de réponse — et une barre qui reçoit zéro
    saute instantanément à 100 %."""
    client, Session = client_db
    with Session() as db:
        # Sous le plancher : un no-op n'a jamais rien mesuré (8 relevés en base réelle).
        _job(db, duration_ms=100)

    assert client.get(API).json()["sept_derniers_jours"][0]["mediane_ms"] is None


# --- Le journal de confidentialité ----------------------------------------------------------------


def test_les_sorties_reseau_sont_derivees_du_type_de_travail(client_db) -> None:
    """🔴 `ai_jobs` n'a AUCUNE colonne de provider (read-before-code du 2026-08-19). Une sortie se
    reconnaît au `job_type`, croisé avec la configuration — et c'est écrit, pas caché."""
    client, Session = client_db
    with Session() as db:
        _job(db, job_type="curriculum_chapters")
        _job(db, job_type="equip_notion")

    sorties = client.get(API).json()["sorties_reseau"]

    assert sorties["actif"] is True
    assert sorties["destinataire"] == "anthropic"
    assert sorties["total"] == 1
    assert [a["tache"] for a in sorties["appels"]] == ["curriculum_chapters"]


def test_aucune_donnee_de_massimo_n_est_annoncee_comme_sortie(client_db) -> None:
    """L'invariant de l'ADR-0009 se lit à l'écran, il ne se suppose pas."""
    client, Session = client_db
    with Session() as db:
        _job(db, job_type="curriculum_lessons")

    appel = client.get(API).json()["sorties_reseau"]["appels"][0]

    assert "aucune donnée de Massimo" in appel["classe_de_donnees"]


def test_le_repli_local_eteint_le_bloc_au_lieu_de_mentir(client_db, monkeypatch) -> None:
    """`CURRICULUM_LLM_PROVIDER=ollama` est un repli documenté. Le bloc doit s'éteindre — un
    journal de sorties qui listerait des appels locaux serait faux."""
    client, Session = client_db
    monkeypatch.setattr(settings, "curriculum_llm_provider", "ollama")
    with Session() as db:
        _job(db, job_type="curriculum_chapters")

    sorties = client.get(API).json()["sorties_reseau"]

    assert sorties["actif"] is False
    assert sorties["appels"] == []
    assert sorties["total"] == 0


# --- Tester le moteur -----------------------------------------------------------------------------


def test_tester_le_moteur_rend_un_verdict_et_n_ecrit_rien(client_db) -> None:
    """🔴 **Aucune trace `ai_jobs`** : ce n'est pas un travail, c'est une sonde. L'y écrire
    gonflerait les statistiques du tableau qui vit sur le même écran — une mesure qui se fausse
    elle-même en étant lue."""
    client, Session = client_db

    reponse = client.post(f"{API}/test")

    assert reponse.status_code == 200
    assert set(reponse.json()) == {"ok", "latence_ms", "modele", "detail"}
    with Session() as db:
        assert db.query(m.AIJob).count() == 0


def test_un_moteur_qui_ne_rend_pas_de_json_est_un_echec_dit(client_db) -> None:
    """Un modèle joignable qui rend de la prose casse toute la chaîne de génération — c'est un mode
    de panne réel (`qwen3*` sans `think:false`), pas une hypothèse."""

    class ProseProvider:
        def generate(self, request):  # noqa: ANN001, ANN202
            from app.modules.ai.provider import LLMResponse

            return LLMResponse(text="bien sûr, voici :", model="faux", duration_ms=12)

    assert machine.tester_moteur(ProseProvider()) == {
        "ok": False,
        "latence_ms": 12,
        "modele": "faux",
        "detail": "le moteur a répondu, mais pas en JSON valide",
    }


# --- Portée ---------------------------------------------------------------------------------------


def test_le_role_enfant_est_refuse(client_db) -> None:
    client, _ = client_db
    _as(CHILD)

    assert client.get(API).status_code == 403
    assert client.post(f"{API}/test").status_code == 403


# --- 🔴 Aucun plafond muet -------------------------------------------------------------------------


def test_les_compteurs_sont_comptes_en_base_jamais_deduits_de_la_liste(client_db) -> None:
    """🔴 **Défaut trouvé en interrogeant la VRAIE base, pas les tests** (2026-08-19) : elle portait
    exactement 20 échecs — le plafond de la requête. `len(liste)` aurait donc rendu « 20 » quel que
    soit le contenu réel, et l'écran l'aurait affiché comme une mesure.

    Ici on dépasse le plafond de 5, et on exige que les compteurs disent la vérité.
    """
    client, Session = client_db
    with Session() as db:
        for i in range(25):
            _job(db, status="failed", error_message=f"boum {i}")
            _job(db, job_type="curriculum_chapters")

    charge = client.get(API).json()

    assert charge["echecs"]["total"] == 25
    assert charge["echecs"]["non_acquittes"] == 25
    assert len(charge["echecs"]["lignes"]) == 20  # la liste, elle, reste bornée
    assert charge["sorties_reseau"]["total"] == 25
    assert len(charge["sorties_reseau"]["appels"]) == 20
