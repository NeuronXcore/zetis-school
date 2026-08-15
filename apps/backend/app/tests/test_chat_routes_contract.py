"""Parité serveur ↔ contrat de grammaire des routes (ADR-0059 §A4).

Le dépôt a DEUX fabriques de destinations pour la même question — `chat/actions.py::_notion_route`
et `notionRoutes.ts::notionRouteFor` — et elles ont déjà divergé deux fois. Elles ne peuvent ni
fusionner ni rendre des chaînes identiques (le front décore d'un rétrolien `&from=` que le chat ne
doit pas émettre). Un **oracle extérieur aux deux** est ce qui reste : `notionRouteContract.json`,
écrit à la main, que chaque côté vérifie de son bord.

🔴 **Le contrat ne doit JAMAIS être généré depuis l'une des implémentations.** Dérivé de celle-ci,
il certifierait le bug : ce fichier passerait à jamais, sabotage compris. Il a été posé faux une
fois, exprès, pour voir les deux suites rougir (2026-08-15).
"""

import json
from pathlib import Path

import pytest

from app.modules.chat.actions import (
    NOTION_TOOLS,
    SUBJECT_TOOLS,
    _TOOL_TO_CONTENT_KIND,
    _notion_route,
)

# ⚠️ Le backend ne dépend d'AUCUN paquet du monorepo à l'exécution : ce chemin n'existe que dans le
# test. On assert son existence plutôt que de `skip` — un skip silencieux ferait disparaître le
# verrou le jour où le backend est conteneurisé seul, et personne ne le remarquerait.
_CONTRAT = Path(__file__).resolve().parents[4] / "packages/types/src/notionRouteContract.json"
assert _CONTRAT.exists(), f"contrat de routes introuvable : {_CONTRAT}"
CONTRAT = json.loads(_CONTRAT.read_text(encoding="utf-8"))
FIXTURE = CONTRAT["fixture"]

# `resolve_panoply` sert l'id sous une clé par activité : c'est le seul endroit du test qui sache
# quel id va avec quel outil, et il reflète le vrai payload.
_ID_KEY = {
    "cours": "lesson_id",
    "fiche": "fiche_id",
    "mindmap": "mindmap_id",
    "quiz": "quiz_id",
    "capsule": "capsule_id",
}


def _route(tool: str, action: dict, *, skill_id: int | None = None) -> str | None:
    """Appelle la fabrique comme le font ses vrais appelants.

    ⚠️ `skill_id=0` n'est pas une commodité de test : c'est **exactement** ce que passe
    `_open_subject`, qui part d'une matière et n'a aucune notion sous la main. Passer l'id de la
    fixture dans ce cas ferait croire qu'ELI5 a un repli de matière — il n'en a pas.
    """
    route, _label = _notion_route(
        tool,
        skill_id=FIXTURE["skillId"] if skill_id is None else skill_id,
        name=FIXTURE["name"] if skill_id is None else "",
        slug=FIXTURE["slug"],
        subject_name=FIXTURE["subjectName"],
        action=action,
    )
    return route


@pytest.mark.parametrize("tool", sorted(CONTRAT["byId"]))
def test_route_ciblee_conforme_au_contrat(tool: str) -> None:
    """Id présent ⇒ la route CIBLÉE, au caractère près.

    Sabotage : remettre `cours` ou `fiche` au grain matière ; échanger `fiche_id` et `lesson_id` ;
    écrire `?lecon=` au lieu de `?lesson=`.
    """
    cle = _ID_KEY.get(tool)
    action = {"available": True}
    if cle:
        action[cle] = FIXTURE[
            {"lesson_id": "lessonId", "fiche_id": "ficheId", "mindmap_id": "mindmapId",
             "quiz_id": "quizId", "capsule_id": "capsuleId"}[cle]
        ]
    assert _route(tool, action) == CONTRAT["byId"][tool]


@pytest.mark.parametrize("tool", sorted(CONTRAT["bySubject"]))
def test_repli_matiere_conforme_au_contrat(tool: str) -> None:
    """Aucun id ⇒ la route de MATIÈRE, ou rien du tout.

    C'est exactement l'appel que fait `_open_subject` (`action={}`). Sabotage : lire les ids par
    indexation au lieu de `.get` (KeyError), ou fabriquer un repli pour `capsule`.
    """
    assert _route(tool, {}, skill_id=0) == CONTRAT["bySubject"][tool]


def test_le_chat_n_emet_jamais_de_retrolien() -> None:
    """`&from=` veut dire « reviens à /subjects/<slug> ». Depuis /chat, ce serait un dépaysement.

    C'est la seule différence assumée avec la table front, et le contrat la traite comme une
    DÉCORATION — d'où ce test, qui vérifie que le serveur n'en pose aucune.
    """
    for tool in NOTION_TOOLS:
        for action in ({}, {"available": True, **{k: 1 for k in _ID_KEY.values()}}):
            route = _route(tool, action) or ""
            assert "from=" not in route, f"{tool} : le chat ne pose pas de rétrolien"


def test_le_contrat_couvre_exactement_la_panoplie() -> None:
    """Exhaustivité — une 8ᵉ activité ne peut pas apparaître sans être déclarée.

    Sabotage : ajouter un outil à `NOTION_TOOLS` sans l'ajouter au contrat.
    """
    assert set(NOTION_TOOLS) == set(CONTRAT["byId"])
    assert set(NOTION_TOOLS) == set(CONTRAT["bySubject"])
    # ⚠️ `SUBJECT_TOOLS` = les routes de matière de la panoplie **plus** celles qui n'en sont pas
    # (`subjectOnly` : la galaxie, qui est une vue d'ensemble et non une activité).
    attendues = {k for k, v in CONTRAT["bySubject"].items() if v} | set(CONTRAT["subjectOnly"])
    assert set(SUBJECT_TOOLS) == attendues


def test_les_routes_de_matiere_hors_panoplie_sont_conformes() -> None:
    """La galaxie n'est pas une activité de notion : elle n'a qu'une route de matière.

    Sabotage : rendre `/fiches/svt` pour `galaxy` — c'est exactement ce que faisait le moteur
    faute d'outil, et ce que ce câblage corrige.
    """
    for tool, attendu in CONTRAT["subjectOnly"].items():
        assert _route(tool, {}, skill_id=0) == attendu


def test_le_type_demande_est_conforme_au_contrat() -> None:
    """Seconde table jumelle : activité → type de contenu réclamé à Papa (§16).

    Sabotage : remettre le repli `.get(tool, "cours")` — il rendrait `capsule` et `quiz`
    indistinguables d'un cours pour tout outil hors table.
    """
    # ⚠️ La table du serveur porte AUSSI les outils hors panoplie (`atelier`), que
    # `REQUESTABLE_KIND` côté front n'a pas à connaître — il ne rend que la panoplie.
    assert _TOOL_TO_CONTENT_KIND == {**CONTRAT["requestKind"], **CONTRAT["horsPanoplie"]}


def test_un_outil_inconnu_ne_produit_aucune_route() -> None:
    """Une valeur hallucinée par le moteur ne devient jamais une destination.

    Sabotage : ajouter un repli qui rendrait `/subjects/<slug>` pour tout outil inconnu.
    """
    assert _route("podcast", {"available": True}) is None
