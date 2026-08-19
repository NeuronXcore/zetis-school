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

🔴 **Le TROISIÈME quartile, pas la médiane — et surtout pas la moyenne.** Corrigé le 2026-08-06 en
regardant la vraie base, avant même l'écran. Trois raisons, dans cet ordre :

1. **La médiane a donné 7 s pour `equip_notion`, dont la durée réelle est 69-77 s** (mesurée deux
   fois). La population est **multimodale** : sur 18 exécutions, huit avaient duré ~0 s (la notion
   était déjà équipée, rien à produire), cinq ~7 s (kit partiel), cinq 31 à 86 s (kit complet).
   Une médiane sur une telle population ne décrit aucun cas réel. Le p75 rend **76,9 s**.
2. **Sous-estimer est le pire des deux sens.** Une barre trop courte atteint 100 % puis *traîne*
   pendant que le travail continue — c'est le défaut nommé dans `SCOPE_MS` bien avant ce chantier :
   « sur-estimer fait terminer la barre en avance ; elle ne traîne jamais après la fin ».
3. **La moyenne reste exclue** : un travail qui a attendu Massimo ou tapé dans son `job_timeout` la
   tirerait vers le haut de façon permanente. Le p75 ignore cette queue-là comme la médiane.

⚠️ **Et un PLANCHER de 2 s.** Un travail plus court que la période de sondage n'a jamais eu de
barre — il ne peut donc rien apprendre à une barre. Sans ce plancher, les équipements no-op
comptaient dans la statistique de ceux qui produisent vraiment.

🔵 **Les clés sont celles des TRACES qui existent déjà.** `_run_traced` écrit un `AIJob` à chaque
appel LLM depuis la création de la table : `fiche_generate`, `mindmap_generate`, `quiz_generate`,
`lesson_content`, `diagnostic_generate`, `capsule_generate`, `capsule_voice`, `curriculum_*`,
`srs_cards_generate` et `council_generate` ont donc **déjà** de l'histoire en base. Les médianes
sont réelles dès le premier affichage, **y compris pour les producteurs que la slice C n'a pas
migrés**. ⚠️ Trois amorces divergeaient de ces noms au premier jet (`srs_cards`, `skills_backfill`,
`council_report`) : elles auraient rendu l'amorce éternelle **en silence**, puisqu'aucune ligne
n'aurait jamais porté ces clés-là. Toute amorce ajoutée ici doit être **le `job_type` réel**.

🔴 **On ne compte QUE les lignes de FILE (`created_by="file"`), et c'est un correctif payé À
L'ÉCRAN le 2026-08-06.** Une version antérieure comptait toutes les lignes d'un `job_type`. Or pour
un producteur migré il y en a de **deux natures** : celle de la file (le travail entier) et les
traces que le service écrit à chaque appel LLM qu'il contient. Elles portent le même `job_type` et
les traces sont **beaucoup plus nombreuses**.

Mesuré en vrai sur une génération de cartes d'une matière : le travail de file a duré **53,6 s**,
ses quatre traces imbriquées **5 à 6 s chacune**. La statistique, dominée par les traces, servait
**7,2 s** — la barre a donc atteint 100 % au bout de sept secondes et **traîné quarante-six
secondes**. C'est très exactement le défaut que le §9 nommait avant ce chantier :
« sur-estimer fait terminer la barre en avance ; elle ne traîne jamais après la fin ».

⚠️ **Conséquence à connaître** : un type qui n'a pas encore cinq exécutions **de file** sert son
amorce, même si la table contient des centaines de traces. C'est voulu — une trace mesure un appel,
pas le travail que la barre montre.

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

from statistics import quantiles

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
    # 🔴 `capsule_render`, PAS `capsule_render_v2` : la clé `_v2` n'a jamais été écrite par
    # personne (addendum 2 §22). L'amorce ne s'appliquait donc à rien, et les rendus réels — qui
    # existent en base depuis des semaines — n'avaient ni libellé ni durée attendue.
    "capsule_render": 75_000,
    # ⚠️ Au-dessus du PLANCHER_MS, et c'est voulu (ADR-0065 §Conséquences) : le cycle réel mesuré
    # tient sous la seconde aujourd'hui — un travail sous 2 s n'apprend rien à la barre, donc
    # ces amorces resteront les valeurs servies tant que l'archive reste petite. Très bien ainsi.
    "backup_create": 10_000,
    "backup_verify": 10_000,
}

# En dessous, la statistique n'est pas une mesure mais un accident : un seul travail lent la
# fixerait pour tout le monde. Au-dessus, elle est plus vraie que n'importe quelle valeur écrite à
# la main.
MINIMUM_POUR_MESURER = 5

# 🔴 Plancher : un travail plus court que la période de sondage de la barre (2 à 4 s) n'a jamais eu
# de barre — il ne peut donc rien lui apprendre. Sans lui, les huit équipements **no-op** relevés
# en base (~0 s, la notion était déjà équipée) écrasaient la statistique de ceux qui produisent
# vraiment : 7 s annoncées pour un travail de 69 s.
PLANCHER_MS = 2_000

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
        .where(
            AIJob.status == "succeeded",
            AIJob.duration_ms.is_not(None),
            # 🔴 Les lignes de FILE seulement — voir l'en-tête : compter les traces imbriquées
            # faisait annoncer 7 s pour un travail de 54 s.
            AIJob.created_by == ACTEUR_FILE,
        )
        .order_by(AIJob.id.desc())
        .limit(DERNIERS_TRAVAUX)
    ).all()

    par_type: dict[str, list[int]] = {}
    for job_type, duree in lignes:
        if duree and duree >= PLANCHER_MS:
            par_type.setdefault(job_type, []).append(duree)

    out = dict(AMORCES_MS)
    for job_type, durees in par_type.items():
        if len(durees) >= MINIMUM_POUR_MESURER:
            # `quantiles(n=4)` rend les trois quartiles ; `[2]` est le p75.
            out[job_type] = int(quantiles(sorted(durees), n=4)[2])
    return out


def estimation_ms(estimations_connues: dict[str, int], job_type: str) -> int:
    """La durée d'UN type, avec son repli. Écrit ici pour que le repli soit le même partout."""
    return estimations_connues.get(job_type) or AMORCES_MS.get(job_type) or DEFAUT_MS


# 🔴 Le marqueur qui distingue une ligne de FILE d'une trace (voir l'en-tête). `created_by` porte
# l'ACTEUR : celui d'un travail de file est le **worker de production**, pas la requête HTTP qui l'a
# demandé — exactement comme `"worker-media"` pour le rendu vidéo. Ce n'est donc pas un détournement
# du champ, c'est son usage.
#
# ⚠️ Tout créateur de ligne de file doit poser cette valeur, sinon son travail sera compté comme une
# trace et son estimation restera bloquée sur l'amorce, **en silence**.
ACTEUR_FILE = "file"


def enfiler(
    db: Session, *, job_type: str, payload: dict, created_by: str = ACTEUR_FILE
) -> dict:
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
