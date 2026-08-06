"""Les travaux unitaires : les enfiler, et dire combien de temps ils prennent (ADR-0041 §4, §9).

## Ce que ce module remplace

Vingt-trois surfaces Papa estimaient chacune dans leur coin. La rédaction d'un cours portait
**cinq** durées différentes selon l'écran (45 / 42 / 50 / 50 / 22 s), l'équipement d'une notion
**quatre** — et **une seule** de ces vingt-trois valeurs avait jamais été mesurée. Le §9 les
condamne toutes ; encore fallait-il que quelque chose les remplace.

🔴 **Ce n'est pas une table de constantes déplacée d'un cran.** Déménager les devinettes du
frontend vers le backend n'aurait rien réparé : elles seraient restées des devinettes, simplement
plus loin de l'écran. Le serveur, lui, a quelque chose que le frontend n'a pas — **l'historique de
ce que chaque travail a réellement duré** (`ai_jobs.duration_ms`, écrit à chaque succès depuis la
création de la table, et désormais indexé par `(job_type, status)`).

Donc : l'estimation d'un type de travail est la **médiane de ses dernières exécutions réussies**,
et la valeur en dur ne sert plus que d'**amorce**, tant qu'il n'y a pas assez d'histoire. ZETIS
apprend ses propres durées. Une amorce fausse se corrige toute seule après quelques exécutions, au
lieu de mentir jusqu'à ce que quelqu'un la remarque — ce qui, mesuré, n'arrivait pas.

⚠️ **La médiane, pas la moyenne.** Un travail qui a attendu Massimo ou tapé dans un `job_timeout`
tire une moyenne vers le haut de façon permanente. La médiane ignore ces queues.

🔵 **Les clés sont celles des TRACES qui existent déjà.** `_run_traced` écrit un `AIJob` à chaque
appel LLM depuis la création de la table : `fiche_generate`, `mindmap_generate`, `quiz_generate`,
`lesson_content`, `diagnostic_generate`, `capsule_generate`, `capsule_voice`, `curriculum_*`,
`srs_cards_generate` et `council_generate` ont donc **déjà** de l'histoire en base. Les médianes
sont réelles dès le premier affichage, **y compris pour les producteurs que la slice C n'a pas
migrés**. ⚠️ Trois amorces divergeaient de ces noms au premier jet (`srs_cards`, `skills_backfill`,
`council_report`) : elles auraient rendu l'amorce éternelle **en silence**, puisqu'aucune ligne
n'aurait jamais porté ces clés-là. Toute amorce ajoutée ici doit être **le `job_type` réel**.

⚠️ **Approximation assumée, à connaître avant d'y toucher** : pour un producteur migré, DEUX lignes
portent le même `job_type` — celle de la file (le travail entier) et celle de la trace (l'appel LLM
qu'elle contient). La médiane les mélange, donc elle sous-estime un peu quand un producteur fait
plusieurs appels. C'est accepté : les deux mesurent le même travail, à un emboîtement près. Si
l'écart devenait visible à l'écran, le remède est un discriminant sur la ligne de file — pas un
réglage à la main, qui rouvrirait la divergence que tout ceci vient de fermer.

## 🔴 Pourquoi ce module vit dans `ai/` et non dans `production/`

Il y a été écrit, et **un test-verrou l'a refusé** :
`test_production_equipment.py::test_les_generateurs_nimportent_pas_production` interdit aux cinq
modules générateurs (`curriculum`, `fiches`, `memory`, `mindmaps`, `quizzes`) d'importer
`modules.production`. Le motif est la **direction de la dépendance** :
`production.equipment.equip_notion` appelle les générateurs, donc les générateurs qui appelleraient
`production` fermeraient le cycle.

Or c'est exactement ce que faisait la première version : quinze routes de générateurs important
`production.travaux`. Le verrou a rougi, et il avait raison.

`ai/` est le bon propriétaire, et pas seulement le refuge commode : ce module possède déjà `AIJob`
(sa route `JobOut`, son provider), il n'importe **aucun** générateur, et les générateurs l'importent
tous depuis toujours (`get_provider`, `get_embedder`). La dépendance va donc dans le sens qui
existait déjà. Aucun cycle, en substance et pas seulement à la lettre.
"""

from statistics import median

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import AIJob

# Les AMORCES, en millisecondes — utilisées tant qu'un type de travail n'a pas assez d'historique.
#
# ⚠️ **Ce ne sont pas des vérités, et le seul chiffre mesuré est dit comme tel.** Les autres sont
# les moins mauvaises des valeurs qui traînaient dans les composants ; elles seront remplacées par
# la mesure dès la cinquième exécution réussie de leur type. Ne pas les « affiner » à la main :
# c'est exactement le geste qui a produit cinq durées pour un même cours.
AMORCES_MS: dict[str, int] = {
    # 🔵 MESURÉ : 11 notions en 12 min 35 s le 2026-08-02 (69 s), reconfirmé 77 s le 2026-08-06.
    "equip_notion": 69_000,
    # Les suivantes sont des amorces. Les deux seules qui aient été observées en vrai sont la fiche
    # (~15 s) et la carte mentale (~17 s), relevées le 2026-08-03 — deux fois moins que ce que les
    # composants annonçaient.
    "lesson_content": 45_000,
    "fiche_generate": 20_000,
    "fiche_regenerate": 20_000,
    "mindmap_generate": 20_000,
    "mindmap_regenerate": 20_000,
    "quiz_generate": 30_000,
    "quiz_regenerate": 30_000,
    "srs_cards_generate": 35_000,
    "diagnostic_generate": 45_000,
    "capsule_generate": 40_000,
    "capsule_regenerate": 40_000,
    "capsule_voice": 30_000,
    "curriculum_chapters": 60_000,
    "curriculum_lessons": 60_000,
    "curriculum_skills_backfill": 90_000,
    "council_generate": 18_000,
    "capsule_render_v2": 75_000,
}

# En dessous, la médiane n'est pas une mesure mais un accident : un seul travail lent la fixerait
# pour tout le monde. Au-dessus, elle est plus vraie que n'importe quelle valeur écrite à la main.
MINIMUM_POUR_MESURER = 5

# Fenêtre de l'historique lu. Bornée pour que la lecture reste à coût constant, et **récente** :
# une amélioration du modèle ou du matériel doit se voir dans l'estimation, pas être noyée.
DERNIERS_TRAVAUX = 300

# Ce qu'on répond pour un type de travail inconnu. ⚠️ Jamais `0` — même règle que `pct` (§1) :
# zéro n'est pas une durée courte, c'est une absence de réponse, et une barre qui reçoit zéro
# saute instantanément à 100 %.
DEFAUT_MS = 30_000


def estimations(db: Session) -> dict[str, int]:
    """Durée attendue par `job_type`, mesurée quand c'est possible, amorcée sinon.

    Une seule requête, bornée, servie par l'index `(job_type, status)` — jamais un N+1, et jamais
    une requête par type affiché.
    """
    lignes = db.execute(
        select(AIJob.job_type, AIJob.duration_ms)
        .where(AIJob.status == "succeeded", AIJob.duration_ms.is_not(None))
        .order_by(AIJob.id.desc())
        .limit(DERNIERS_TRAVAUX)
    ).all()

    par_type: dict[str, list[int]] = {}
    for job_type, duree in lignes:
        if duree and duree > 0:
            par_type.setdefault(job_type, []).append(duree)

    out = dict(AMORCES_MS)
    for job_type, durees in par_type.items():
        if len(durees) >= MINIMUM_POUR_MESURER:
            out[job_type] = int(median(durees))
    return out


def estimation_ms(estimations_connues: dict[str, int], job_type: str) -> int:
    """La durée d'UN type, avec son repli. Écrit ici pour que le repli soit le même partout."""
    return estimations_connues.get(job_type) or AMORCES_MS.get(job_type) or DEFAUT_MS


def enfiler(db: Session, *, job_type: str, payload: dict, created_by: str = "parent") -> dict:
    """Crée le travail, le **commite**, l'enfile — et le **supprime** si la file refuse.

    Le patron de la route `equip-notion` (ADR-0041 §3), écrit une seule fois pour les quinze
    producteurs de la slice C. Les recopier aurait produit quinze versions de la compensation du
    §10.1, dont quatorze auraient fini par diverger.

    ⚠️ **L'ordre est imposé** : la ligne existe et est visible AVANT l'enfilement, sinon le worker
    peut la prendre avant qu'une autre connexion puisse la lire. C'est aussi ce qui permet à la
    barre de l'annoncer « en file » dès le retour de la route.

    Rend `{job_id, status}` — le corps du `202`. Lève un `503` si la file est injoignable, et
    **rien ne subsiste** en base.
    """
    from datetime import datetime, timezone

    from fastapi import HTTPException, status as http

    from app.core.queue import MESSAGE_FILE_INJOIGNABLE, QueueUnavailable, enqueue_ai_job

    job = AIJob(
        job_type=job_type,
        status="queued",
        input_json=payload,
        created_by=created_by,
        created_at=datetime.now(timezone.utc),
    )
    db.add(job)
    db.commit()
    try:
        enqueue_ai_job(job.id)
    except QueueUnavailable as exc:
        db.delete(job)
        db.commit()
        raise HTTPException(
            http.HTTP_503_SERVICE_UNAVAILABLE, detail=MESSAGE_FILE_INJOIGNABLE
        ) from exc
    return {"job_id": job.id, "status": job.status}


__all__ = [
    "AMORCES_MS",
    "DEFAUT_MS",
    "enfiler",
    "estimation_ms",
    "estimations",
]
