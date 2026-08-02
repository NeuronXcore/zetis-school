"""Le retour de demande, à l'ouverture d'une session de chat (addendum ADR-0026).

`content_requests` et `notion_requests` sont les deux seuls endroits où Massimo parle en son nom
propre. Ce module est ce qui empêche « je le note pour Papa » d'être un cul-de-sac.

Trois règles, et elles sont toutes des refus :

1. **Le gate est la DISPONIBILITÉ, jamais le statut.** Dans l'inbox Papa, « Fait » ne fait que
   changer une colonne — il ne prouve pas que le contenu existe. On passe donc par
   `galaxy.notion_panel` (donc `resolve_panoply`, prédicat unique du dépôt) : une demande `done`
   dont le contenu n'est pas servable **ne s'annonce pas ET n'est pas tamponnée**. Annoncer sur le
   statut reconstruirait exactement le mensonge tué le 2026-07-30.
2. **Aucune route n'est construite ici.** `_notion_route` est la seule fabrique de destinations du
   chat. `quiz` et `capsule` n'y ont pas de branche → pas de route → pas de carte → pas d'annonce
   → **pas de tampon** : ils redeviendront annonçables le jour où la branche existera.
3. **Nommer 2, tamponner TOUT.** Tamponner seulement ce qu'on nomme ferait s'empiler le reliquat,
   qui redeviendrait une pression annonce après annonce.

Le texte est composé ICI, en Python, déterministe — jamais par le LLM. C'est un fait, pas une
génération (ADR-0026 §4 : deux voix de ZETIS sur le même état, dont une hallucinée, détruiraient
la confiance). Et il ne nomme **aucun auteur** : le contenu scolaire atteint Massimo dans la voix
de ZETIS, quel que soit son producteur réel.

Coût assumé : un `notion_panel` par notion distincte éligible (typiquement 1 à 3, une fois par
ouverture de session). L'alternative — rebâtir ici une lecture batch de noms/slugs à côté de
`resolve_panoply` — économiserait deux requêtes en dédoublant le chemin que `_notion_menu`
emprunte déjà. On paie les requêtes, pas la divergence.
"""

from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import ContentRequest, NotionRequest
from app.modules.ai.provider import EmbeddingProvider
from app.modules.ai.skill_resolution import resolve_skill
from app.modules.chat.actions import _notion_route
from app.modules.chat.schemas import ChatAction, ChatAnnouncement
from app.modules.galaxy.service import is_notion_visible, notion_panel

# `content_kind` (file de Papa) → outil de la panoplie (`resolve_panoply` / `_notion_route`).
# `quiz` et `capsule` sont ABSENTS **volontairement** : `_notion_route` n'a pas leur branche
# (« hors v1 »). Les ajouter ici sans l'y ajouter là-bas fabriquerait une annonce sans destination.
_CONTENT_KIND_TO_TOOL = {
    "cours": "cours",
    "fiche": "fiche",
    "mindmap": "mindmap",
    "card": "revision",
}

# Ce que ZETIS dit du contenu, à la deuxième personne et sans auteur (§2 du cadrage).
_KIND_PHRASE = {
    "cours": "ton cours sur {name}",
    "fiche": "ta fiche sur {name}",
    "mindmap": "ta carte sur {name}",
    "revision": "tes cartes de révision sur {name}",
}

# Règle « ≤ 2 propositions » (ADR-0027). Ce qui dépasse est tamponné SANS être nommé — jamais
# annoncé comme un reliquat (« et 3 autres » serait le compteur que le §1 interdit).
MAX_NAMED = 2

# Chaque `notion_request` examinée coûte un embedding (`resolve_skill`). Sans plafond, une demande
# qui ne résout jamais serait ré-embeddée à CHAQUE ouverture de chat, indéfiniment. Le plafond
# borne un coût récurrent ; il ne perd rien (les lignes non examinées restent éligibles).
MAX_NOTION_REQUESTS_SCANNED = 3


@dataclass
class _Ready:
    """Une demande dont la réponse est un FAIT vérifié (pas un statut)."""

    row: object  # ContentRequest | NotionRequest — tamponné en bloc
    fragment: str  # « ta fiche sur les fractions » / « « pythagore » »
    action: ChatAction | None  # None = rien à ouvrir encore (notion ajoutée, contenu à venir)
    is_notion: bool


def _panel_or_none(db: Session, cache: dict[int, dict | None], skill_id: int) -> dict | None:
    """`notion_panel` mémoïsé. `None` si la notion n'est pas visible dans l'année active."""
    if skill_id not in cache:
        try:
            cache[skill_id] = notion_panel(db, skill_id)
        except HTTPException:
            cache[skill_id] = None
    return cache[skill_id]


def _navigate(panel: dict, tool: str, skill_id: int) -> ChatAction | None:
    """Carte-action ancrée pour (notion, outil), ou `None` si l'outil n'est pas routable."""
    action = next((a for a in panel["actions"] if a["kind"] == tool), {})
    route, label = _notion_route(
        tool,
        skill_id=skill_id,
        name=panel["name"],
        slug=panel["subject_slug"],
        subject_name=panel["subject_name"],
        action=action,
    )
    if not route:
        return None
    # `confirm=True` : c'est une offre, pas un ordre — toujours une carte à taper, jamais une
    # auto-navigation, même quand la session est vocale (correctif ADR-0027 du 2026-07-30).
    # `skill_id` : la trace du tap doit désigner CETTE notion. Un tap d'annonce est souvent le
    # PREMIER acte de la session — sans lui, le journal retombe sur un vieux `chat_topic`.
    return ChatAction(
        kind="navigate", label=label, route=route, confirm=True, skill_id=skill_id
    )


def _available(panel: dict, tool: str) -> bool:
    return any(a["kind"] == tool and a.get("available") for a in panel["actions"])


def _content_request_items(db: Session, cache: dict, *, student_id: int) -> list[_Ready]:
    """Demandes de contenu dont le contenu EXISTE VRAIMENT et sait s'ouvrir."""
    rows = db.scalars(
        select(ContentRequest)
        .where(
            ContentRequest.student_id == student_id,
            ContentRequest.status == "done",
            ContentRequest.announced_at.is_(None),
        )
        .order_by(ContentRequest.updated_at.desc(), ContentRequest.id.desc())
    ).all()

    items: list[_Ready] = []
    for row in rows:
        tool = _CONTENT_KIND_TO_TOOL.get(row.content_kind)
        if tool is None:
            continue  # quiz / capsule : pas de route, donc pas d'annonce et pas de tampon
        panel = _panel_or_none(db, cache, row.skill_id)
        if panel is None or not _available(panel, tool):
            continue  # LE test du §2 : le statut disait oui, le fait dit non
        action = _navigate(panel, tool, row.skill_id)
        if action is None:
            continue
        items.append(
            _Ready(
                row=row,
                fragment=_KIND_PHRASE[tool].format(name=panel["name"]),
                action=action,
                is_notion=False,
            )
        )
    return items


def _notion_request_items(
    db: Session, embedder: EmbeddingProvider, cache: dict, *, student_id: int
) -> list[_Ready]:
    """Demandes de notion hors programme réellement entrées au programme.

    `notion_requests` n'a **pas de `skill_id`** (le modèle le dit : « la notion n'existe pas
    encore »), donc `added` est invérifiable. On rejoue `resolve_skill` sur le texte : **il avait
    échoué à la création — c'est précisément pourquoi cette ligne existe. Qu'il réussisse
    maintenant est la preuve que la notion est entrée au programme.** Échec = ni annonce ni
    tampon, la ligne reste éligible.
    """
    rows = db.scalars(
        select(NotionRequest)
        .where(
            NotionRequest.student_id == student_id,
            NotionRequest.status == "added",
            NotionRequest.announced_at.is_(None),
        )
        .order_by(NotionRequest.updated_at.desc(), NotionRequest.id.desc())
        .limit(MAX_NOTION_REQUESTS_SCANNED)
    ).all()

    items: list[_Ready] = []
    for row in rows:
        resolution = resolve_skill(db, embedder, student_id=student_id, text=row.text)
        skill_id = resolution.skill_id
        if skill_id is None or not is_notion_visible(db, skill_id):
            continue
        panel = _panel_or_none(db, cache, skill_id)
        if panel is None:
            continue
        # La notion est là ; son contenu peut ne pas l'être encore (Papa ajoute souvent la notion
        # avant de produire). On annonce l'arrivée — c'est bien ce que Massimo avait demandé — et
        # on n'attache une carte que s'il y a réellement quelque chose à ouvrir.
        action = next(
            (
                a
                for tool in ("cours", "fiche", "mindmap", "revision")
                if _available(panel, tool)
                for a in [_navigate(panel, tool, skill_id)]
                if a is not None
            ),
            None,
        )
        items.append(
            _Ready(row=row, fragment=f"« {panel['name']} »", action=action, is_notion=True)
        )
    return items


def _compose_text(named: list[_Ready]) -> str:
    """Une phrase, déterministe, sans auteur. Ce qui n'est pas nommé n'est pas compté."""
    fragments = " et ".join(item.fragment for item in named)
    closing = (
        "C'est dans ton programme maintenant."
        if all(item.is_notion for item in named)
        else "C'est prêt."
    )
    return f"Tu m'avais demandé {fragments}. {closing}"


def compose_announcement(
    db: Session, embedder: EmbeddingProvider, *, student_id: int
) -> ChatAnnouncement | None:
    """Le contexte d'ouverture porte la réponse aux demandes de Massimo, ou rien.

    Pull strict : n'existe qu'à l'intérieur d'une session que Massimo vient d'ouvrir. Rien n'est
    calculé, stocké ni poussé entre deux sessions (ADR-0026 §4, appliqué et non amendé).

    ⚠️ Le tampon se pose ICI, à la composition, pas à l'affichage : une annonce composée puis
    jamais regardée est perdue. C'est le prix de « aucune file qui grossit » — un accusé de
    lecture rouvrirait la file par la fenêtre.
    """
    cache: dict[int, dict | None] = {}
    items = _content_request_items(db, cache, student_id=student_id)
    items += _notion_request_items(db, embedder, cache, student_id=student_id)
    if not items:
        return None

    now = datetime.now(timezone.utc)
    for item in items:
        item.row.announced_at = now  # TOUT le lot, pas seulement ce qui est nommé
    db.commit()

    named = items[:MAX_NAMED]
    actions = [item.action for item in named if item.action is not None]
    return ChatAnnouncement(text=_compose_text(named), actions=actions)
