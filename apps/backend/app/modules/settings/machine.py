"""🧠 La machine (ADR-0062 §2) — qui fait quoi, et est-ce que ça tourne.

## Pourquoi UN objet et pas deux

La maquette séparait *Moteurs* (qui fait quoi) et *Santé* (est-ce que ça marche). Ce sont deux
panneaux de **lecture pure** qui répondent à une seule question de Papa : quand une génération
échoue, il lui faut « Ollama est-il joignable ? » **et** « quel modèle ? » dans la même seconde.
Deux surfaces obligeraient à tenir un écran en mémoire pendant qu'on regarde l'autre.

## Ce module LIT, il ne règle pas — et pas par prudence, par vérité technique

Le routage vit dans des variables d'environnement lues au **démarrage** (`LLM_PROVIDER`,
`EMBED_PROVIDER`, `WHISPER_MODEL`), pas en base. Un menu déroulant serait soit mort, soit un
chantier `app_settings` + re-résolution des providers. « Aucun interrupteur sans effet »
s'applique ici en premier.

## Trois règles que le code tient

1. 🔴 **Aucun secret ne sort.** La clé Anthropic est rendue en **booléen de présence** — jamais sa
   valeur, jamais un préfixe. Les URL de service sont rendues sans identifiants.
2. 🔴 **Trois états pour Ollama, jamais un « ❌ » muet** : injoignable / joignable mais modèle
   absent / présent. C'est le piège du lien symbolique : si le SSD des modèles n'est pas monté,
   Ollama démarre avec **zéro modèle** et répond « model not found » — message identique à celui
   d'un modèle mal nommé.
3. **Chaque sonde a un délai maximal.** Un instantané cohérent vaut mieux que six appels qui
   divergent, mais il ne doit pas pouvoir pendre : le pire cas est borné.
"""

from __future__ import annotations

import importlib
import pkgutil
import statistics
import time
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import AIJob
from app.modules.ai import travaux
from app.modules.ai.provider import LLMProvider

# Le pire cas d'une sonde. Court à dessein : cette page se lit pendant qu'on cherche une panne,
# et une page qui pend pendant qu'on cherche une panne EST une panne de plus.
SONDE_TIMEOUT_S = 1.5

# Fenêtre du tableau « 7 derniers jours ». ⚠️ On ne réutilise pas `travaux.estimations()` ici : sa
# fenêtre est un COMPTE (`DERNIERS_TRAVAUX = 300`), pas une durée. Un tableau intitulé « 7 derniers
# jours » qui lirait les 300 derniers travaux mentirait sur son propre titre.
FENETRE_JOURS = 7

# --- Sondes -------------------------------------------------------------------------------------
#
# Vocabulaire commun aux quatre : `ok` / `degrade` / `ko`. **`degrade` n'est pas un demi-`ko`** :
# c'est « le service répond, mais pas ce qu'on attend de lui » — et c'est l'état qui distingue un
# volume non monté d'un modèle mal nommé.


def _sonde(nom: str, etat: str, detail: str, latence_ms: int | None) -> dict:
    return {"nom": nom, "etat": etat, "detail": detail, "latence_ms": latence_ms}


def _chrono() -> tuple[float, callable]:
    debut = time.perf_counter()
    return debut, lambda: int((time.perf_counter() - debut) * 1000)


def _sonde_postgres(db: Session) -> dict:
    _, ms = _chrono()
    try:
        db.execute(text("SELECT 1"))
        return _sonde("Postgres", "ok", "SELECT 1", ms())
    except Exception as exc:  # noqa: BLE001
        return _sonde("Postgres", "ko", f"injoignable : {type(exc).__name__}", None)


def _sonde_redis() -> dict:
    _, ms = _chrono()
    try:
        from app.core.queue import _redis

        _redis().ping()
        return _sonde("Redis", "ok", "PING", ms())
    except Exception as exc:  # noqa: BLE001
        return _sonde("Redis", "ko", f"injoignable : {type(exc).__name__}", None)


def _sonde_ollama() -> dict:
    """🔴 **Trois états, et le milieu est le plus important.**

    « Joignable mais modèle absent » est exactement ce que produit un SSD de modèles non monté :
    Ollama démarre, répond, et n'a rien. Un seul `❌` ferait chercher une panne réseau là où il
    n'y a qu'un disque débranché.
    """
    _, ms = _chrono()
    attendu = settings.ollama_model
    try:
        r = httpx.get(f"{settings.ollama_base_url}/api/tags", timeout=SONDE_TIMEOUT_S)
        r.raise_for_status()
        noms = [m.get("name", "") for m in r.json().get("models", [])]
    except Exception as exc:  # noqa: BLE001
        return _sonde("Ollama", "ko", f"injoignable : {type(exc).__name__}", None)

    if not noms:
        return _sonde(
            "Ollama",
            "degrade",
            "joignable, mais AUCUN modèle — le volume des modèles est-il monté ?",
            ms(),
        )
    # `startswith` : Ollama suffixe souvent le tag (`modele:tag`), et un test d'égalité stricte
    # ferait passer un modèle présent pour absent.
    if not any(n == attendu or n.startswith(f"{attendu}:") for n in noms):
        return _sonde(
            "Ollama",
            "degrade",
            f"joignable, {len(noms)} modèle(s), mais « {attendu} » n'y est pas",
            ms(),
        )
    return _sonde("Ollama", "ok", f"« {attendu} » présent", ms())


def _sonde_minio() -> dict:
    _, ms = _chrono()
    try:
        from minio import Minio

        client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure,
        )
        seau = settings.minio_bucket_capsules
        if not client.bucket_exists(seau):
            return _sonde("MinIO", "degrade", f"joignable, seau « {seau} » absent", ms())
        return _sonde("MinIO", "ok", f"seau « {seau} »", ms())
    except Exception as exc:  # noqa: BLE001
        return _sonde("MinIO", "ko", f"injoignable : {type(exc).__name__}", None)


def sondes(db: Session) -> list[dict]:
    return [_sonde_postgres(db), _sonde_redis(), _sonde_ollama(), _sonde_minio()]


# --- Qui fait quoi ------------------------------------------------------------------------------


def moteurs() -> list[dict]:
    """La carte tâche → moteur → modèle → local/cloud, avec le motif de chaque verrou.

    🔴 **Le local/cloud par tâche n'est pas un réglage, c'est de la doctrine.** Un déroulant
    permettrait d'expédier les données de Massimo chez un tiers d'un clic. On l'affiche, on le
    verrouille, et on **dit pourquoi** — un cadenas muet se lit comme une panne.
    """
    return [
        {
            "tache": "Cours, fiches, quiz, mindmaps, capsules, ELI5",
            "moteur": settings.llm_provider,
            "modele": settings.ollama_model,
            "ou": "local",
            "ce_qui_part": "rien ne sort de la maison",
            "motif": None,
        },
        {
            "tache": "Embeddings RAG",
            "moteur": settings.embed_provider,
            "modele": settings.ollama_embed_model,
            "ou": "local",
            "ce_qui_part": "rien ne sort de la maison",
            "motif": (
                "Verrouillé : en changer impose une migration Alembic, un réindex ivfflat et le "
                "ré-embed de tout le corpus."
            ),
        },
        {
            "tache": "Programme — chapitres et leçons",
            "moteur": settings.curriculum_llm_provider,
            "modele": settings.anthropic_model,
            "ou": "cloud" if settings.curriculum_llm_provider == "anthropic" else "local",
            "ce_qui_part": "niveau, matière, version de programme — aucune donnée de Massimo",
            "motif": "Dérogation étroite de l'ADR-0009, bornée et testée. Tâche one-shot de Papa.",
        },
        {
            "tache": "Dictée (ELI5)",
            "moteur": settings.stt_provider,
            "modele": f"{settings.whisper_model} · {settings.whisper_device} "
            f"{settings.whisper_compute_type}",
            "ou": "local",
            "ce_qui_part": "la voix de Massimo ne sort jamais — c'est la raison d'être de l'ADR-0012",
            "motif": "Local par doctrine.",
        },
    ]


def cle_anthropic_presente() -> bool:
    """🔴 Un BOOLÉEN. Jamais la valeur, jamais un préfixe, jamais une longueur."""
    return bool(settings.anthropic_api_key)


def prompts() -> list[dict]:
    """Les prompts actifs et leur version, lus des modules eux-mêmes.

    ⚠️ **Balayage du paquet plutôt qu'une liste écrite ici.** Une liste vieillirait en silence au
    premier prompt ajouté — et « quelle version a produit quoi » est précisément la question à
    laquelle une liste périmée répond faux.

    ⚠️ Ce sont bien `apps/backend/app/prompts/` — **pas** `packages/prompts/`, qui ne contient
    qu'un README. La maquette se trompait d'endroit (read-before-code du 2026-08-19).
    """
    from app import prompts as paquet

    trouves: list[dict] = []
    for info in pkgutil.iter_modules(paquet.__path__):
        module = importlib.import_module(f"{paquet.__name__}.{info.name}")
        for attribut in dir(module):
            if attribut.endswith("PROMPT_VERSION"):
                trouves.append(
                    {
                        "module": info.name,
                        "constante": attribut,
                        "version": str(getattr(module, attribut)),
                    }
                )
    return sorted(trouves, key=lambda p: (p["module"], p["constante"]))


# --- Est-ce que ça tourne -----------------------------------------------------------------------


def workers() -> list[dict]:
    """Vivants **et** à jour.

    🔴 « Vivant » ne veut pas dire « à jour », et c'est le piège qui a coûté le plus cher : un
    `SimpleWorker` RQ ne recharge **jamais** le code. Un worker de 163 minutes a répondu « Aucun
    exécutant pour srs_cards_generate » — un message qui se lit comme un bug du code. La colonne
    utile n'est donc pas une pastille verte, c'est l'**âge**.
    """
    from rq import Worker

    from app.core.queue import production_queues, render_queue

    vus: dict[str, dict] = {}
    maintenant = datetime.now(timezone.utc)
    try:
        for file in [*production_queues(), render_queue()]:
            for w in Worker.all(queue=file):
                naissance = getattr(w, "birth_date", None)
                if naissance is not None and naissance.tzinfo is None:
                    naissance = naissance.replace(tzinfo=timezone.utc)
                vus[w.name] = {
                    "nom": w.name,
                    "file": file.name,
                    "age_minutes": (
                        int((maintenant - naissance).total_seconds() // 60)
                        if naissance is not None
                        else None
                    ),
                }
    except Exception:  # noqa: BLE001
        # Best-effort, comme `production_worker_alive` : on préfère annoncer un doute qu'affirmer
        # une santé. Redis injoignable a déjà sa sonde, juste au-dessus.
        return []
    return sorted(vus.values(), key=lambda w: w["nom"])


def echecs(db: Session, limite: int = 20) -> dict:
    """Les travaux `failed`, acquittés ou non — avec **le message du serveur**.

    C'est la vraie demande derrière « les logs » : le motif existe en base
    (`ai_jobs.error_message`) depuis toujours. L'acquittement est serveur (`acknowledged_at`),
    jamais un `localStorage` — sinon l'échec réapparaît sur l'autre appareil.

    🔴 **`non_acquittes` est COMPTÉ en base, jamais déduit de la liste.** La liste est plafonnée ;
    en tirer un compte ferait dire « 20 non acquittés » à une base qui en porte 200 — une
    troncature silencieuse déguisée en mesure. Défaut trouvé le 2026-08-19 en interrogeant la
    vraie base, pas les tests : elle porte 20 échecs, exactement le plafond.
    """
    lignes = db.scalars(
        select(AIJob).where(AIJob.status == "failed").order_by(AIJob.created_at.desc()).limit(limite)
    ).all()
    total = db.scalar(select(func.count()).select_from(AIJob).where(AIJob.status == "failed")) or 0
    non_acquittes = (
        db.scalar(
            select(func.count())
            .select_from(AIJob)
            .where(AIJob.status == "failed", AIJob.acknowledged_at.is_(None))
        )
        or 0
    )
    return {
        "total": total,
        "non_acquittes": non_acquittes,
        "lignes": [
            {
                "id": j.id,
                "job_type": j.job_type,
                "message": j.error_message,
                "quand": j.created_at,
                "acquitte": j.acknowledged_at is not None,
            }
            for j in lignes
        ],
    }


def sept_derniers_jours(db: Session) -> list[dict]:
    """Réussis, échoués, durée médiane — par type de travail de FILE.

    🔴 **Le filtre `created_by="file"` n'est pas un détail.** Sans lui, l'estimation annonçait
    **7,2 s pour un travail de 53,6 s** : les traces d'appels synchrones (~143 par travail) noient
    les travaux qu'on mesure.

    ⚠️ Ce tableau règle un défaut existant : 23 surfaces déclaraient chacune leur durée en dur — la
    rédaction d'un cours en portait **cinq** valeurs différentes, dont une seule mesurée.
    """
    depuis = datetime.now(timezone.utc) - timedelta(days=FENETRE_JOURS)
    lignes = db.execute(
        select(AIJob.job_type, AIJob.status, AIJob.duration_ms).where(
            AIJob.created_by == travaux.ACTEUR_FILE,
            AIJob.created_at >= depuis,
        )
    ).all()

    par_type: dict[str, dict] = {}
    for job_type, statut, duree in lignes:
        e = par_type.setdefault(job_type, {"job_type": job_type, "reussis": 0, "echoues": 0, "_d": []})
        if statut == "succeeded":
            e["reussis"] += 1
            # Même plancher que `travaux` : un travail plus court que la période de sondage n'a
            # jamais rien mesuré, et les no-op écrasaient la statistique de ceux qui produisent.
            if duree and duree >= travaux.PLANCHER_MS:
                e["_d"].append(duree)
        elif statut == "failed":
            e["echoues"] += 1

    resultat = []
    for e in par_type.values():
        durees = e.pop("_d")
        # `None` et jamais `0` : zéro n'est pas une durée courte, c'est une absence de réponse.
        e["mediane_ms"] = int(statistics.median(durees)) if durees else None
        resultat.append(e)
    return sorted(resultat, key=lambda e: e["job_type"])


def sorties_reseau(db: Session, limite: int = 20) -> dict:
    """Le journal de CONFIDENTIALITÉ — pas un tableau de coût.

    🔴 **Dérivé, jamais lu** : `ai_jobs` n'a **aucune colonne de provider** (read-before-code du
    2026-08-19). Une sortie réseau se reconnaît donc au `job_type` (`curriculum_*`) croisé avec la
    configuration. C'est honnête tant que la dérogation de l'ADR-0009 reste la **seule** sortie —
    et l'ADR-0062 en a fait son premier signal d'erreur : le jour où une deuxième tâche part au
    cloud sans passer par `curriculum_*`, ce bloc ment en silence.

    ⚠️ Ne jamais laisser ce bloc dériver vers « combien Papa a délégué » : on compte des **sorties
    réseau**, pas de la délégation. Un compteur de délégation est interdit par « un régime, jamais
    un score ».
    """
    au_cloud = settings.curriculum_llm_provider == "anthropic"
    if not au_cloud:
        return {"actif": False, "destinataire": None, "total": 0, "appels": []}

    depuis = datetime.now(timezone.utc) - timedelta(days=30)
    filtre = (AIJob.job_type.like("curriculum_%"), AIJob.created_at >= depuis)
    lignes = db.scalars(
        select(AIJob).where(*filtre).order_by(AIJob.created_at.desc()).limit(limite)
    ).all()
    # 🔴 Compté, jamais déduit de la liste plafonnée : « 20 appels sur 30 jours » serait faux dès
    # le 21ᵉ, et cet écran est un journal de CONFIDENTIALITÉ — il ne peut pas sous-compter.
    total = db.scalar(select(func.count()).select_from(AIJob).where(*filtre)) or 0
    return {
        "actif": True,
        "destinataire": "anthropic",
        "total": total,
        "appels": [
            {
                "quand": j.created_at,
                "tache": j.job_type,
                "classe_de_donnees": "niveau · matière · version de programme — aucune donnée de Massimo",
            }
            for j in lignes
        ],
    }


# --- Ce qui se règle en .env, visible et jamais éditable ----------------------------------------


def reglages_env() -> list[dict]:
    """Les afficher est le point, pas les régler.

    « Rien ne s'est passé depuis deux heures » s'explique par l'intervalle de scan ; un refus de
    lot s'explique par un plafond. Ces valeurs répondent à des questions qu'on se pose **devant un
    comportement**, pas devant un formulaire.
    """
    return [
        {
            "nom": "Lots en attente — plafond",
            "variable": "PRODUCTION_MAX_PENDING",
            "valeur": str(settings.production_max_pending),
            "motif": "Un champ offrirait de désarmer le garde-fou pour « débloquer » un refus.",
        },
        {
            "nom": "Durée max d'un travail",
            "variable": "PRODUCTION_JOB_TIMEOUT",
            "valeur": f"{settings.production_job_timeout} s",
            "motif": "Borne le balayage des zombies — la déplacer fait mentir une lecture.",
        },
        {
            "nom": "Intervalle de scan",
            "variable": "PRODUCTION_SCAN_INTERVAL_MINUTES",
            "valeur": f"{settings.production_scan_interval_minutes} min",
            "motif": "Seul réveil périodique du dépôt : le raccourcir coûte du GPU.",
        },
    ]


def installation(db: Session) -> dict:
    """Version installée et sécurité de l'installation.

    ⚠️ **Le commit git n'est PAS disponible** : `settings.version` est une constante et l'image ne
    porte pas de `ARG ZETIS_COMMIT`. On rend ce qu'on sait — la tête Alembic — plutôt qu'un champ
    qui aurait l'air d'un commit sans en être un.

    ⚠️ **Le mot de passe de développement est comparé ICI, et nulle part ailleurs.** La maquette
    annonçait « le précédent existe déjà : l'assertion qui refuse de booter sur un mot de passe de
    dev hors dev ». **Cette assertion n'existe pas** (vérifié le 2026-08-19) : ce bandeau est le
    premier endroit du dépôt qui pose la question.
    """
    try:
        tete = db.execute(text("SELECT version_num FROM alembic_version")).scalar()
    except Exception:  # noqa: BLE001
        # SQLite des tests, ou table absente : on dit qu'on ne sait pas, on n'invente pas.
        tete = None
    return {
        "version": settings.version,
        "alembic_head": tete,
        "mot_de_passe_dev_en_place": "zetis_dev_password" in settings.database_url,
    }


# --- L'instantané -------------------------------------------------------------------------------


def lire(db: Session) -> dict:
    """Un seul appel, un instantané cohérent (ADR-0062 §5 — aucun sondage, un bouton explicite)."""
    from app.modules.production import activity

    etat = activity.read(db)
    return {
        "sondes": sondes(db),
        "moteurs": moteurs(),
        "cle_anthropic_presente": cle_anthropic_presente(),
        "prompts": prompts(),
        "file": {
            "en_attente": len(etat.get("queued", [])),
            "en_cours": 1 if etat.get("current") else 0,
        },
        "workers": workers(),
        "echecs": echecs(db),
        "sept_derniers_jours": sept_derniers_jours(db),
        "sorties_reseau": sorties_reseau(db),
        "reglages_env": reglages_env(),
        "installation": installation(db),
    }


# --- Vérifier, plutôt que déclarer --------------------------------------------------------------


# Court à dessein : on prouve que le moteur RÉPOND et rend du JSON, pas qu'il rédige bien. Un
# prompt long mesurerait surtout la longueur du prompt.
PROMPT_SONDE = 'Réponds exactement {"ok": true} et rien d\'autre.'


def tester_moteur(provider: LLMProvider) -> dict:
    """Un vrai appel au moteur de génération. **Ne persiste rien.**

    ⚠️ **Aucune trace `ai_jobs`, et c'est délibéré** : ce n'est pas un travail, c'est une sonde.
    L'y écrire gonflerait les statistiques du tableau « 7 derniers jours » qui vit sur le même
    écran — une mesure qui se fausse elle-même en étant lue.

    Le verdict porte sur les deux choses qui cassent en vrai : le moteur répond-il, et rend-il du
    **JSON valide** ? Un modèle joignable qui rend de la prose casse toute la chaîne de génération,
    et c'est un mode de panne réel (`qwen3*` sans `think:false`).

    ⚠️ **Le provider est INJECTÉ, pas appelé par `get_provider()`.** Un appel direct
    court-circuiterait `app.dependency_overrides` — la sonde taperait le vrai Ollama dans les
    tests, et le harnais n'en a aucun.
    """
    import json

    from app.modules.ai.provider import LLMRequest

    _, ms = _chrono()
    try:
        reponse = provider.generate(LLMRequest(prompt=PROMPT_SONDE, json_output=True))
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "latence_ms": ms(),
            "modele": settings.ollama_model,
            "detail": f"le moteur n'a pas répondu : {type(exc).__name__}",
        }

    try:
        json.loads(reponse.text)
    except (ValueError, TypeError):
        return {
            "ok": False,
            "latence_ms": reponse.duration_ms or ms(),
            "modele": reponse.model,
            "detail": "le moteur a répondu, mais pas en JSON valide",
        }
    return {
        "ok": True,
        "latence_ms": reponse.duration_ms or ms(),
        "modele": reponse.model,
        "detail": "JSON valide",
    }
