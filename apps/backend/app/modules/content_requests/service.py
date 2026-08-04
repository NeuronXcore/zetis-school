"""Liste d'attente de contenus réclamés par l'enfant (addendum ADR-0027).

Flux : dans le chat, Massimo réclame un contenu ABSENT sur une notion qui EXISTE (« ta carte sur
les fractions ») → le chat émet ici une `content_request` **dédupliquée** ; Papa la voit en badge
sur la Couverture et la traite (done/dismissed). Sémantique inverse de `notions/` (notion hors
programme). Patron `create` / `list_requests` / `set_status` du module `notions`.

Deux propriétés clés :
- **Dédup forte** `(student, skill, kind)` (contrainte d'unicité DB) : « fractions × 5 » = une ligne.
- **`create` idempotent et ré-activant** : une ligne déjà `pending` n'est pas recréée ; une ligne
  `done`/`dismissed` **repasse `pending`** quand Massimo redemande (le besoin est revenu).
"""

from collections.abc import Sequence

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import ContentRequest, Skill, Subject
from app.db.models.production import REQUEST_KIND_TO_PIECE

# Vocabulaire fermé, aligné sur les surfaces de contenu de ZETIS. Le chat n'émet que
# cours/fiche/mindmap/card en v1 (ADR-0027 §Périmètre) ; les six sont acceptés pour absorber
# d'autres origines futures sans migration.
CONTENT_KINDS = ("cours", "fiche", "mindmap", "quiz", "capsule", "card")
_ALLOWED_STATUS = ("pending", "done", "dismissed")
# Origine de la demande. Elle distingue le CHOISI du SUBI : dans le chat, l'émission est un effet
# de bord dont Massimo n'a pas conscience ; depuis la page matière, c'est un geste explicite sur
# une pastille grisée. Papa lit la différence, elle change la priorité qu'il accorde à la ligne.
SOURCE_CHAT = "chat_orchestrator"
SOURCE_SUBJECT_PAGE = "subject_page"

# `content_kind` → l'outil de la panoplie qui répond « ce contenu est-il SERVABLE ? » (ADR-0036 §4).
#
# ⚠️ **Six entrées, alors qu'`announce.py` n'en a que quatre — et les deux tables sont justes.**
# Celle d'`announce` traduit vers une DESTINATION (`_notion_route` n'a pas de branche `quiz` ni
# `capsule`, donc pas de carte à taper) ; celle-ci traduit vers une DISPONIBILITÉ, question à
# laquelle `resolve_panoply` répond pour les six. Les fusionner ferait dépendre la fermeture d'une
# demande de l'existence d'un écran de chat — deux questions différentes, deux tables.
CONTENT_KIND_TO_PANOPLY = {
    "cours": "cours",
    "fiche": "fiche",
    "mindmap": "mindmap",
    "quiz": "quiz",
    "capsule": "capsule",
    "card": "revision",
}


def _out(
    req: ContentRequest,
    skill_name: str | None = None,
    subject_id: int | None = None,
    subject_name: str | None = None,
) -> dict:
    return {
        "id": req.id,
        "skill_id": req.skill_id,
        "skill_name": skill_name,
        "subject_id": subject_id,
        "subject_name": subject_name,
        "content_kind": req.content_kind,
        "status": req.status,
        "source": req.source,
        "created_at": req.created_at,
        # ⚠️ **Le verdict est SERVEUR** (ADR-0036 §3). Le front ne détient aucune liste de types
        # productibles — patron des paliers d'autonomie (« l'interface ne fait que rendre lisible
        # ce que le serveur refuse déjà »). Dupliquer la table en TypeScript la ferait diverger au
        # premier générateur ajouté, et l'écran offrirait un bouton qui échoue.
        "producible": req.content_kind in REQUEST_KIND_TO_PIECE,
    }


def create_request(
    db: Session,
    *,
    student_id: int,
    skill_id: int,
    content_kind: str,
    source: str = SOURCE_CHAT,
) -> dict | None:
    """Crée (ou ré-active) une demande dédupliquée. Idempotent. Best-effort côté chat.

    `content_kind` hors vocabulaire → **ignoré silencieusement** (renvoie None) : l'émission est
    best-effort, elle ne doit jamais faire échouer le tour de chat qui l'appelle.
    """
    kind = (content_kind or "").strip().lower()
    if kind not in CONTENT_KINDS:
        return None
    existing = db.scalar(
        select(ContentRequest).where(
            ContentRequest.student_id == student_id,
            ContentRequest.skill_id == skill_id,
            ContentRequest.content_kind == kind,
        )
    )
    if existing is not None:
        # Massimo redemande un contenu déjà trié → le besoin est revenu, on le remonte en file.
        if existing.status != "pending":
            existing.status = "pending"  # updated_at via onupdate=func.now()
            db.flush()
        return _out(existing)
    req = ContentRequest(
        student_id=student_id, skill_id=skill_id, content_kind=kind, status="pending", source=source
    )
    db.add(req)
    db.flush()
    return _out(req)


def create_student_requests(
    db: Session, *, student_id: int, skill_id: int, content_kinds: Sequence[str]
) -> list[str]:
    """Demandes émises par Massimo depuis une surface élève (addendum ADR-0027).

    **Trois garde-fous**, dans cet ordre :

    1. *vocabulaire fermé* — porté par le schéma (`ContentKind`), donc déjà appliqué en `422`
       quand on arrive ici ;
    2. *plafond* `CONTENT_REQUEST_MAX_KINDS` — au-delà de la panoplie, il n'y a rien de plus à
       demander sur une notion ; un appel plus gros est un abus, pas un besoin ;
    3. *visibilité* — la notion doit être visible de l'élève. **Sans ce contrôle, la route
       devient un oracle d'existence sur les brouillons de Papa** : un `skill_id` au hasard
       répondrait « créé » ou « pas créé », révélant ce qui existe en base sans être publié.

    Un `skill_id` invisible rend **404 et ne crée AUCUNE ligne** — la vérification précède
    strictement la première écriture.

    Aucun XP, aucun `event_type`, aucune trace d'événement : demander n'est pas apprendre, et la
    **ligne de file EST la trace**. `create_request` n'est pas modifié — son idempotence borne
    structurellement la répétition.
    """
    from app.modules.galaxy.service import is_notion_visible

    max_kinds = settings.content_request_max_kinds
    # ⚠️ Le plafond se mesure sur la liste BRUTE, avant déduplication — sinon il ne bornerait
    # rien : le vocabulaire fermé ne compte que SIX types demandables (`eli5` se demande comme
    # `cours`, `revision` comme `card`), donc une liste dédupliquée ne peut pas atteindre 7. Ce
    # que le plafond borne, c'est la TAILLE de la charge utile ; ce que le vocabulaire borne,
    # c'est son contenu. Les deux garde-fous ne protègent pas de la même chose.
    if len(content_kinds) > max_kinds:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Trop de contenus demandés en une fois (maximum {max_kinds}).",
        )
    # Dédup en préservant l'ordre : « tout ce qui manque » peut arriver avec des répétitions,
    # elles ne doivent pas créer de lignes en double (la contrainte DB les refuserait de toute
    # façon — autant ne pas les tenter).
    kinds = list(dict.fromkeys(content_kinds))
    if not is_notion_visible(db, skill_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notion introuvable.",
        )

    requested: list[str] = []
    for kind in kinds:
        if create_request(
            db,
            student_id=student_id,
            skill_id=skill_id,
            content_kind=kind,
            source=SOURCE_SUBJECT_PAGE,
        ):
            requested.append(kind)
    db.commit()
    return requested


def list_requests(db: Session, status_filter: str | None = "pending") -> list[dict]:
    """Liste les demandes (les plus FRAÎCHES d'abord), enrichies du nom de notion + matière.

    Le nom de notion et la matière rendent le badge Papa lisible sans re-fetch : « ⭐ Fractions —
    carte ». `subject_id` sert à la fusion côté client avec la Couverture.

    Tri par `updated_at` et NON `created_at` : une demande triée puis **redemandée** est réactivée
    (`create_request`) sans changer sa date de création — la trier par `created_at` la laisserait
    enterrée sous des demandes plus récentes, alors que le besoin vient de revenir. Le filtre par
    défaut (`pending`) écarte les lignes que Papa vient de trier, dont `updated_at` bouge aussi."""
    query = (
        select(ContentRequest, Skill.name, Skill.subject_id, Subject.name)
        .outerjoin(Skill, Skill.id == ContentRequest.skill_id)
        .outerjoin(Subject, Subject.id == Skill.subject_id)
        .order_by(ContentRequest.updated_at.desc(), ContentRequest.id.desc())
    )
    if status_filter:
        query = query.where(ContentRequest.status == status_filter)
    return [
        _out(req, skill_name, subject_id, subject_name)
        for req, skill_name, subject_id, subject_name in db.execute(query)
    ]


def set_status(db: Session, req_id: int, new_status: str) -> dict:
    """Triage : done (contenu produit) | dismissed (ignorée) | pending.

    **Seul écrivain du statut**, et il en a désormais deux appelants : le geste de Papa (route
    PATCH) et l'auto-fermeture de `close_available_requests` (ADR-0036 §4). Le statut ne change
    pas de sens selon l'appelant — `done` dit « il n'y a plus rien à faire pour cette demande ».
    """
    if new_status not in _ALLOWED_STATUS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Statut invalide (attendu {', '.join(_ALLOWED_STATUS)}).",
        )
    req = db.get(ContentRequest, req_id)
    if req is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Demande introuvable.")
    req.status = new_status  # updated_at via onupdate=func.now()
    db.commit()
    db.refresh(req)
    subject_id = db.scalar(select(Skill.subject_id).where(Skill.id == req.skill_id))
    skill_name = db.scalar(select(Skill.name).where(Skill.id == req.skill_id))
    return _out(req, skill_name, subject_id)


def close_available_requests(db: Session) -> list[int]:
    """Ferme les demandes dont le contenu EXISTE VRAIMENT et est SERVABLE (ADR-0036 §4).

    ## Le gate est la DISPONIBILITÉ, jamais le statut — appliqué cette fois à l'ÉCRITURE

    `announce.py` porte déjà cette règle en LECTURE : *« dans l'inbox Papa, "Fait" ne fait que
    changer une colonne — il ne prouve pas que le contenu existe »*. Une demande fermée par ce
    chemin-ci ne peut pas mentir : elle ne se ferme que sur la réponse de `resolve_panoply`, **le
    prédicat unique du dépôt**. Réimplémenter ici une seconde lecture « qui donne le même
    résultat » rejouerait la porte ouverte sur du vide du 2026-07-30.

    ⚠️ **Aucun statut nouveau.** `done` garde son sens ; qu'il vienne d'un clic de Papa ou d'une
    production réussie ne change pas ce qu'il dit. Et `announce.py` **n'est pas modifié** : il
    revérifie la disponibilité de son côté, ce qui est très bien — deux vérifications valent mieux
    qu'une confiance.

    ⚠️ **On balaie TOUTES les demandes en attente, pas seulement celles du lot qui vient de
    finir**, et c'est le sens de la décision : ce qui ferme une demande est que le contenu soit là,
    pas qu'un lot particulier l'ait produit. Papa qui produit un chapitre à la main referme donc
    aussi les demandes qu'il satisfait au passage — sans avoir à cliquer « Fait ».

    Coût : une passe de `resolve_panoply` par élève, à nombre de requêtes CONSTANT quel que soit le
    nombre de demandes. La file de Papa est petite par construction (dédup forte `(student, skill,
    kind)`).
    """
    from app.modules.galaxy.service import resolve_panoply

    rows = db.scalars(
        select(ContentRequest).where(ContentRequest.status == "pending")
    ).all()
    if not rows:
        return []

    by_student: dict[int, list[ContentRequest]] = {}
    for row in rows:
        by_student.setdefault(row.student_id, []).append(row)

    closed: list[int] = []
    for student_id, group in by_student.items():
        panoply = resolve_panoply(
            db, student_id=student_id, skill_ids=[r.skill_id for r in group]
        )
        for row in group:
            tool = CONTENT_KIND_TO_PANOPLY.get(row.content_kind)
            actions = panoply.get(row.skill_id) or []
            if any(a["kind"] == tool and a.get("available") for a in actions):
                set_status(db, row.id, "done")
                closed.append(row.id)
    return closed


def pending_count(db: Session) -> int:
    """Nombre de demandes en attente (pastille éventuelle)."""
    from sqlalchemy import func

    return db.scalar(
        select(func.count(ContentRequest.id)).where(ContentRequest.status == "pending")
    ) or 0
