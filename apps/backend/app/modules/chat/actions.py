"""Résolveur d'action d'orchestration (ADR-0027) — le LLM PROPOSE, le serveur ANCRE.

Un intent brut du moteur (`{kind, notion_query?, subject_query?, tool?, data?}`) devient une
`ChatAction` **construite depuis un id validé**, ou rien. Jamais de route hallucinée : la seule
source de destinations réelles est `galaxy.notion_panel` (le pont notion → matière + contenus
`available`, ADR-0024) et les slugs de matière de l'année active. Transpose le patron
`reports._anchor()` : ce que le LLM invente qui n'est pas ancrable est jeté.

Garde-fous (ADR-0027) : orienter vers l'EXISTANT VALIDÉ uniquement (router seulement vers un
contenu `available`) ; contenu absent → **honnêteté** (+ demande à Papa, décision figée dont le
MÉCANISME est différé — Point ouvert n°4, non implémenté ici) ; cibles `location.state` (quiz par
notion, mission précise) hors v1 → pas d'action.
"""

from dataclasses import dataclass, field
from urllib.parse import quote

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Subject
from app.modules.ai.provider import EmbeddingProvider
from app.modules.ai.skill_resolution import resolve_skill
from app.modules.chat.schemas import ChatAction
from app.modules.galaxy.service import notion_panel

DATA_KINDS = ("agenda", "reviews", "missions")
# Outils que l'orchestrateur sait router en v1. `quiz` est volontairement absent : la session de
# quiz passe par `location.state` (pas d'URL par id) — hors v1 (ADR-0027 §Périmètre).
NOTION_TOOLS = ("eli5", "cours", "fiche", "mindmap", "revision")
SUBJECT_TOOLS = ("cours", "fiche", "mindmap", "revision")

_TOOL_WORD = {
    "eli5": "explication",
    "cours": "cours",
    "fiche": "fiche",
    "mindmap": "carte",
    "revision": "révision",
    "quiz": "quiz",
}
_DATA_LABEL = {
    "agenda": "Ouvrir ton agenda",
    "reviews": "Voir tes révisions",
    "missions": "Voir tes missions",
}


@dataclass
class ActionResult:
    """Résultat de la résolution. `action` = destination ancrée (ou None). `note` = phrase honnête
    à ajouter au `reply` quand rien n'est ancrable (§3). `meta` = métadonnées de trace (ai_jobs),
    JAMAIS de texte de message."""

    action: ChatAction | None = None
    note: str | None = None
    meta: dict = field(default_factory=dict)


def _resolve_subject(db: Session, query: str) -> tuple[str, str] | None:
    """Nom/slug libre → (slug, nom) d'une matière, ou None. Correspondance exacte puis par radical
    (les 4 premières lettres : « maths » → « Mathématiques »)."""
    q = (query or "").strip().casefold()
    if not q:
        return None
    subjects = db.scalars(select(Subject)).all()
    for s in subjects:
        if s.slug.casefold() == q or s.name.casefold() == q:
            return (s.slug, s.name)
    stem = q[:4]
    for s in subjects:
        name = s.name.casefold()
        if stem and (name.startswith(stem) or q.startswith(name[:4]) or q in name or name in q):
            return (s.slug, s.name)
    return None


def _notion_route(
    tool: str, *, skill_id: int, name: str, slug: str, subject_name: str, action: dict
) -> tuple[str | None, str]:
    """Route ANCRÉE la plus ciblée pour (notion, outil). None si l'outil n'est pas routable en v1."""
    if tool == "eli5":
        return f"/eli5?skill_id={skill_id}&name={quote(name)}", f"T'expliquer {name}"
    if tool == "cours":
        return f"/subjects/{slug}/cours", f"Ton cours de {subject_name}"
    if tool == "fiche":
        return f"/fiches/{slug}", f"Tes fiches de {subject_name}"
    if tool == "revision":
        return f"/revision?subject={slug}", f"Réviser {subject_name}"
    if tool == "mindmap":
        mindmap_id = action.get("mindmap_id")
        if mindmap_id:  # carte précise → reconstruction ciblée par id
            return f"/mindmaps/reconstruire/{mindmap_id}", f"Ta carte sur {name}"
        return f"/mindmaps/{slug}", f"Tes cartes de {subject_name}"
    return None, ""  # quiz & autres : hors v1


def _open_notion(db, embedder, *, student_id, intent, fallback_skill_id, fallback_skill) -> ActionResult:
    tool = str(intent.get("tool") or "").strip().lower() or "eli5"
    # Notion : `notion_query` si fournie (résolution dédiée), sinon la notion déjà résolue du message.
    query = str(intent.get("notion_query") or "").strip()
    skill_id = fallback_skill_id
    if query:
        res = resolve_skill(db, embedder, student_id=student_id, text=query)
        if res.skill_id is not None:
            skill_id = res.skill_id
    if skill_id is None:
        return ActionResult(
            note="Ça, je ne le trouve pas encore dans ton programme.",
            meta={"intent": "open_notion", "skill_id": None},
        )
    try:
        panel = notion_panel(db, skill_id)  # ancrage : matière + contenus `available`
    except HTTPException:
        return ActionResult(
            note="Ça, je ne le trouve pas encore dans ton programme.",
            meta={"intent": "open_notion", "skill_id": skill_id},
        )

    name, slug, subject_name = panel["name"], panel["subject_slug"], panel["subject_name"]
    actions = {a["kind"]: a for a in panel["actions"]}
    entry = actions.get(tool)
    if entry is None or not entry.get("available"):
        # Contenu absent → honnêteté. La DEMANDE À PAPA est une décision figée (ADR-0027 §3) dont le
        # mécanisme est différé (Point ouvert n°4) : non enregistrée ici, seulement annoncée.
        return ActionResult(
            note=f"Je n'ai pas encore de {_TOOL_WORD.get(tool, 'contenu')} sur « {name} » — je le note pour Papa.",
            meta={"intent": "open_notion", "skill_id": skill_id, "tool": tool, "available": False},
        )
    route, label = _notion_route(
        tool, skill_id=skill_id, name=name, slug=slug, subject_name=subject_name, action=entry
    )
    if route is None:
        return ActionResult(
            note="Ça, je ne peux pas encore te l'ouvrir directement — mais on peut en parler !",
            meta={"intent": "open_notion", "skill_id": skill_id, "tool": tool, "route": None},
        )
    return ActionResult(
        action=ChatAction(kind="navigate", route=route, label=label),
        meta={"intent": "open_notion", "skill_id": skill_id, "tool": tool, "route": route},
    )


def _open_subject(db, *, intent) -> ActionResult:
    resolved = _resolve_subject(db, str(intent.get("subject_query") or ""))
    if resolved is None:
        return ActionResult(
            note="Je ne vois pas de quelle matière tu parles.",
            meta={"intent": "open_subject", "slug": None},
        )
    slug, subject_name = resolved
    tool = str(intent.get("tool") or "").strip().lower()
    if tool in SUBJECT_TOOLS:
        route, _ = _notion_route(
            tool, skill_id=0, name="", slug=slug, subject_name=subject_name, action={}
        )
        label = f"{_TOOL_WORD[tool].capitalize()} de {subject_name}"
    else:
        route, label = f"/subjects/{slug}", f"Ouvrir {subject_name}"
    return ActionResult(
        action=ChatAction(kind="navigate", route=route, label=label),
        meta={"intent": "open_subject", "slug": slug, "tool": tool or None, "route": route},
    )


def resolve_action(
    db: Session,
    embedder: EmbeddingProvider,
    *,
    student_id: int,
    intent: dict | None,
    fallback_skill_id: int | None = None,
    fallback_skill=None,
) -> ActionResult:
    """Ancre l'intent proposé par le LLM en une `ChatAction` réelle, ou rien. Ne lève jamais."""
    if not intent:
        return ActionResult()
    kind = str(intent.get("kind") or "").strip().lower()

    if kind == "show_data":
        data = str(intent.get("data") or "").strip().lower()
        if data in DATA_KINDS:
            return ActionResult(
                action=ChatAction(kind="show_data", data=data, label=_DATA_LABEL[data]),
                meta={"intent": "show_data", "data": data},
            )
        return ActionResult(meta={"intent": "show_data", "data": None})

    if kind == "open_notion":
        return _open_notion(
            db,
            embedder,
            student_id=student_id,
            intent=intent,
            fallback_skill_id=fallback_skill_id,
            fallback_skill=fallback_skill,
        )

    if kind == "open_subject":
        return _open_subject(db, intent=intent)

    return ActionResult(meta={"intent": kind or "none"})
