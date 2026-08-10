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
from app.modules.chat.schemas import ChatAction, ChatMenuItem
from app.modules.galaxy.service import notion_panel

DATA_KINDS = ("agenda", "reviews", "missions")
# Outils que l'orchestrateur sait router en v1. `quiz` est volontairement absent : la session de
# quiz passe par `location.state` (pas d'URL par id) — hors v1 (ADR-0027 §Périmètre).
NOTION_TOOLS = ("eli5", "cours", "fiche", "mindmap", "revision")
SUBJECT_TOOLS = ("cours", "fiche", "mindmap", "revision")
# Contenus DURABLES d'une notion (≠ ELI5, génératif à la volée et toujours offert). Leur absence
# totale = « notion vide » → on réclame le cours à Papa (addendum ADR-0027, déclencheur b).
DURABLE_NOTION_TOOLS = ("cours", "fiche", "mindmap", "revision")

# Outil demandé → type de contenu à réclamer à Papa (addendum ADR-0027). `eli5` se dérive du cours
# canonique : pas d'ELI5 ⇒ pas de cours validé ⇒ la vraie demande est le cours. `revision` = carte
# SRS. `quiz` non émis en v1 (hors routage). Alignés sur `content_requests.service.CONTENT_KINDS`.
_TOOL_TO_CONTENT_KIND = {
    "eli5": "cours",
    "cours": "cours",
    "fiche": "fiche",
    "mindmap": "mindmap",
    "revision": "card",
}

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


# Libellés du MENU de notion (Q1) — bienveillants, patron des libellés de `NotionActionPanel`.
_MENU_LABEL = {
    "cours": "📖 Voir le cours",
    "eli5": "💡 Fais-moi comprendre",
    "fiche": "🗒️ Lire la fiche",
    "mindmap": "🧠 Reconstruire la carte",
    "revision": "🗂️ Réviser mes cartes",
}


def _notion_menu(db: Session, skill_id: int) -> ActionResult:
    """Q1 : la LISTE de ce qui EXISTE pour une notion (quand Massimo la nomme sans préciser d'outil).

    Construit depuis `notion_panel(skill_id).actions` filtrées `available`, chaque entrée via
    `_notion_route` (SEULE source de routes). 1 seul contenu → carte simple ; ≥2 → menu. Offre
    implicite → `confirm=True` (carte à taper, jamais d'auto-nav vocale)."""
    try:
        panel = notion_panel(db, skill_id)
    except HTTPException:
        return ActionResult(
            note="Ça, je ne le trouve pas encore dans ton programme.",
            meta={"intent": "notion_menu", "skill_id": skill_id, "visible": False},
        )
    name, slug, subject_name = panel["name"], panel["subject_slug"], panel["subject_name"]
    # ⚠️ Le filtre « ELI5 seulement si un cours validé existe » vivait ICI (correctif live du
    # 2026-07-30). Il a été SUPPRIMÉ le 2026-08-01, non pas abandonné : la règle est descendue
    # dans `galaxy.resolve_panoply`, qui rend désormais `eli5.available = False` sans cours. Le
    # filtre `available` ci-dessous la porte donc déjà. La garder ici en aurait fait une règle
    # écrite à deux endroits — exactement ce que l'addendum ADR-0024 interdit.
    items: list[ChatMenuItem] = []
    for act in panel["actions"]:
        kind = act["kind"]
        if kind not in NOTION_TOOLS or not act.get("available"):
            continue
        route, _label = _notion_route(
            kind, skill_id=skill_id, name=name, slug=slug, subject_name=subject_name, action=act
        )
        if route:
            items.append(ChatMenuItem(kind=kind, route=route, label=_MENU_LABEL.get(kind, kind)))

    # Notion « vide » = aucun contenu DURABLE (cours/fiche/carte/révision) — ELI5 ne compte pas :
    # il se génère à la volée, il n'est jamais la preuve qu'un contenu existe. Sans contenu durable →
    # réclamer le COURS à Papa (la porte des dérivés). Signal best-effort, aveugle au contenu (§1c),
    # émis par le service (addendum ADR-0027, déclencheur b).
    has_durable = any(i.kind != "eli5" for i in items)
    meta: dict = {"intent": "notion_menu", "skill_id": skill_id}
    if not has_durable:
        meta["content_request"] = {"skill_id": skill_id, "content_kind": "cours"}

    if not items:
        # Rien de validé à offrir → honnêteté (ZETIS ne fabrique pas, il oriente vers l'existant).
        return ActionResult(
            # §16 — l'adulte ne se nomme pas dans l'espace de Massimo. ZETIS parle déjà à la
            # première personne ici : « je le note » suffit, et ne fait de personne un tiers.
            note=f"Je n'ai pas encore de contenu validé sur « {name} » — je le note.",
            meta={**meta, "items": 0},
        )
    if len(items) == 1:
        only = items[0]
        return ActionResult(
            action=ChatAction(kind="navigate", label=only.label, route=only.route, confirm=True),
            meta={**meta, "tool": only.kind, "route": only.route},
        )
    return ActionResult(
        action=ChatAction(
            kind="notion_menu", label=f"Sur « {name} », tu peux :", name=name, items=items, confirm=True
        ),
        meta={**meta, "items": [i.kind for i in items]},
    )


def _open_notion(
    db, embedder, *, student_id, intent, fallback_skill_id, fallback_skill, fallback_text=None
) -> ActionResult:
    tool = str(intent.get("tool") or "").strip().lower()
    # Notion : `notion_query` si fournie (résolution dédiée), sinon la notion déjà résolue du message.
    query = str(intent.get("notion_query") or "").strip()
    skill_id = fallback_skill_id
    if query:
        res = resolve_skill(db, embedder, student_id=student_id, text=query)
        if res.skill_id is not None:
            skill_id = res.skill_id
    if skill_id is None:
        # Notion HORS PROGRAMME (rien ne résout) → carte OPT-IN « Demander à Papa d'ajouter » (le tap
        # crée un notion_request, précédent ELI5). Libellé = la notion nommée (notion_query), sinon le
        # message. Sans libellé exploitable → note seule (rien à proposer d'ajouter).
        label_text = (query or str(fallback_text or "").strip())[:160]
        if label_text:
            return ActionResult(
                action=ChatAction(
                    kind="request_notion",
                    label=f"Ajouter « {label_text} » à mon programme",
                    text=label_text,
                    confirm=True,
                ),
                note="Ça, je ne le trouve pas encore dans ton programme.",
                meta={"intent": "open_notion", "skill_id": None, "request_notion": True},
            )
        return ActionResult(
            note="Ça, je ne le trouve pas encore dans ton programme.",
            meta={"intent": "open_notion", "skill_id": None},
        )
    # Pas d'outil précis → MENU de ce qui existe pour la notion (Q1).
    if not tool:
        return _notion_menu(db, skill_id)
    try:
        panel = notion_panel(db, skill_id)  # ancrage : matière + contenus `available`
    except HTTPException:
        return ActionResult(
            note="Ça, je ne le trouve pas encore dans ton programme.",
            meta={"intent": "open_notion", "skill_id": skill_id},
        )

    name, slug, subject_name = panel["name"], panel["subject_slug"], panel["subject_name"]
    actions = {a["kind"]: a for a in panel["actions"]}
    # ELI5 sans cours validé → il inventerait (ADR-0011) : on NE route pas vers lui (ADR-0027 §3).
    # On délègue au menu, qui offre l'existant validé (fiche/carte…) ou reste honnête + demande Papa.
    # ⚠️ La condition lit `eli5.available` — le prédicat partagé — et non plus `cours.available`
    # qu'elle redérivait. Ce branchement n'est PAS la règle de disponibilité (elle est portée par
    # `resolve_panoply`) : c'est un choix de ROUTAGE, qui préfère montrer les alternatives réelles
    # plutôt que la branche « contenu absent ». Comportement éprouvé live, conservé tel quel.
    if tool == "eli5" and not bool(actions.get("eli5", {}).get("available")):
        return _notion_menu(db, skill_id)
    entry = actions.get(tool)
    if entry is None or not entry.get("available"):
        # Contenu absent → honnêteté + DEMANDE À PAPA (ADR-0027 §3, mécanisme tranché par l'addendum
        # content_requests). Le signal `content_request` (métadonnée pure, aveugle au contenu §1c)
        # est émis par le service ; ici on l'expose seulement.
        # Repli `cours` OBLIGATOIRE pour un outil hors mapping (quiz/capsule — que `notion_panel`
        # expose bel et bien — ou une valeur hallucinée par le LLM) : sans lui la note promettait
        # « je le note pour Papa » SANS rien enregistrer. La promesse doit toujours être tenue, et le
        # cours est la porte des dérivés (même raison que le déclencheur b « notion vide »).
        content_kind = _TOOL_TO_CONTENT_KIND.get(tool, "cours")
        meta = {
            "intent": "open_notion",
            "skill_id": skill_id,
            "tool": tool,
            "available": False,
            "content_request": {"skill_id": skill_id, "content_kind": content_kind},
        }
        return ActionResult(
            note=f"Je n'ai pas encore de {_TOOL_WORD.get(tool, 'contenu')} sur « {name} » — je le note.",
            meta=meta,
        )
    route, label = _notion_route(
        tool, skill_id=skill_id, name=name, slug=slug, subject_name=subject_name, action=entry
    )
    if route is None:
        return ActionResult(
            note="Ça, je ne peux pas encore te l'ouvrir directement — mais on peut en parler !",
            meta={"intent": "open_notion", "skill_id": skill_id, "tool": tool, "route": None},
        )
    result_meta = {"intent": "open_notion", "skill_id": skill_id, "tool": tool, "route": route}
    # « Notion vide » (déclencheur b) : on route (souvent vers ELI5, toujours dispo), mais AUCUN
    # contenu DURABLE n'existe (cours/fiche/carte/révision) → on réclame le COURS à Papa. ELI5 seul
    # ne prouve rien (génératif à la volée). Vaut sur TOUS les chemins, pas seulement le menu :
    # sinon un intent `tool=eli5` sur une notion sans cours n'enregistrerait jamais la demande.
    if not any(actions.get(k, {}).get("available") for k in DURABLE_NOTION_TOOLS):
        result_meta["content_request"] = {"skill_id": skill_id, "content_kind": "cours"}
    return ActionResult(
        action=ChatAction(kind="navigate", route=route, label=label),
        meta=result_meta,
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
    fallback_text: str | None = None,
) -> ActionResult:
    """Ancre l'intent proposé par le LLM en une `ChatAction` réelle, ou rien. Ne lève jamais.

    `fallback_text` (= le message de Massimo) sert de libellé à l'offre `request_notion` quand la
    notion est hors-programme et que le LLM n'a pas isolé de `notion_query`."""
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
            fallback_text=fallback_text,
        )

    if kind == "open_subject":
        return _open_subject(db, intent=intent)

    return ActionResult(meta={"intent": kind or "none"})
