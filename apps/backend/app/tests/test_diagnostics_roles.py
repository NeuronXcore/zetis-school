"""Les routes de `diagnostics` portent toutes un rôle — le verrou, et ses exceptions écrites.

Pourquoi ce fichier existe : le module `diagnostics` est le seul qui **écrit une mesure au nom
de Massimo**. Une soumission servie au mauvais rôle ne produit pas une fuite de lecture, elle
produit une **fausse mesure** — et l'ADR-0048 fait reposer sur ces mesures tout ce que Papa lit
de la fiabilité d'une passation.

Le patron d'énumération vient de `test_galaxy.py::test_aucune_route_galaxy_nexige_le_role_parent` :
on inspecte les dépendances **réelles** du router, jamais le texte du fichier — un commentaire
citant `require_parent` ne doit ni faire passer ni faire échouer un verrou.

⚠️ Différence avec le patron d'origine : `galaxy` déclare ses gardes au niveau du router
(`APIRouter(dependencies=[...])`), donc `route.dependencies` suffit. `diagnostics` les déclare en
**paramètres** (`_: dict = Depends(require_parent)`), qui n'atterrissent PAS là : ils vivent dans
`route.dependant`. Il faut descendre l'arbre, sinon le verrou est vert sur un router entièrement
ouvert — le pire cas possible pour un test de sécurité.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.routing import APIRoute

from app.main import app
from app.modules.auth.deps import get_current_user, require_child, require_parent
from app.modules.diagnostics.router import router as diagnostics_router

# ==================================================================================================
# Les exceptions, nommées et datées — cet ensemble doit RÉTRÉCIR, jamais grossir
# ==================================================================================================

# Trois routes de LECTURE servies à tout compte authentifié, relevées le 2026-08-16.
# Elles sont ici parce qu'une règle qu'on enfreint sans le dire cesse d'être une règle.
#
# Chacune attend un arbitrage explicite :
#   · GET /subjects        — liste de matières, sans donnée de Massimo. Probablement légitime.
#   · GET /quizzes         — liste des diagnostics. Sert les deux espaces avec la même forme.
#   · GET /quizzes/{id}    — 🔴 celle qui interroge. C'est la route de PASSATION : la route sœur
#                            `/quizzes/{id}/relecture` est déjà `require_parent`, et son docstring
#                            dit que ce sont deux routes pour deux rôles. Celle-ci devrait donc
#                            être `require_child`.
#
# Retirer une ligne d'ici = poser la dépendance dans le router. Le test le vérifie tout seul.
SANS_ROLE_ASSUME: set[tuple[str, str]] = {
    ("GET", "/api/diagnostics/subjects"),
    ("GET", "/api/diagnostics/quizzes"),
    ("GET", "/api/diagnostics/quizzes/{quiz_id}"),
}


def _gardes(route: APIRoute) -> set:
    """Toutes les dépendances réelles d'une route, en descendant l'arbre.

    `require_child` dépend lui-même de `get_current_user` : la présence de ce dernier ne dit
    donc RIEN. Seule la présence d'un `require_*` compte.
    """
    vues: set = set()
    pile = list(getattr(route.dependant, "dependencies", []))
    pile += [d for d in getattr(route, "dependencies", [])]
    while pile:
        d = pile.pop()
        appel = getattr(d, "call", None) or getattr(d, "dependency", None)
        if appel is not None:
            vues.add(appel)
        pile.extend(getattr(d, "dependencies", []))
    return vues


def _routes_diagnostics(application: FastAPI) -> list[tuple[str, str, APIRoute]]:
    trouvees = []
    for route in application.routes:
        if not isinstance(route, APIRoute):
            continue
        if not route.path.startswith("/api/diagnostics"):
            continue
        for methode in sorted(route.methods - {"HEAD", "OPTIONS"}):
            trouvees.append((methode, route.path, route))
    return sorted(trouvees, key=lambda t: (t[1], t[0]))


# ==================================================================================================
# Le verrou
# ==================================================================================================


def test_le_router_est_bien_celui_qu_on_croit() -> None:
    """Anti-test-à-vide. Un verrou qui parcourt une liste vide est vert pour rien."""
    routes = _routes_diagnostics(app)
    assert len(routes) >= 12, f"seulement {len(routes)} routes trouvées — le préfixe a changé ?"
    assert diagnostics_router.prefix == "/api/diagnostics"


def test_toute_route_diagnostics_porte_un_role() -> None:
    """🔴 LE VERROU. Une route ajoutée sans `require_child` ni `require_parent` fait rougir ici,
    le jour où elle est écrite — pas le jour où quelqu'un s'en sert."""
    ouvertes = []
    for methode, chemin, route in _routes_diagnostics(app):
        gardes = _gardes(route)
        if require_child in gardes or require_parent in gardes:
            continue
        if (methode, chemin) in SANS_ROLE_ASSUME:
            continue
        ouvertes.append(f"{methode} {chemin}")

    assert not ouvertes, (
        "Ces routes de `diagnostics` n'exigent aucun rôle :\n  "
        + "\n  ".join(ouvertes)
        + "\n\nPose `require_child` ou `require_parent` dans le router. Si l'ouverture est "
        "VOULUE, ajoute la route à SANS_ROLE_ASSUME avec son motif écrit — mais sache que "
        "c'est ce module qui écrit une mesure au nom de Massimo."
    )


def test_les_exceptions_existent_encore(_=None) -> None:
    """L'ensemble d'exceptions ne doit pas pourrir. Une route corrigée — ou renommée — doit
    disparaître d'ici, sinon la liste protège un fantôme et masque la suivante."""
    reelles = {(m, c) for m, c, _r in _routes_diagnostics(app)}
    fantomes = SANS_ROLE_ASSUME - reelles
    assert not fantomes, (
        f"SANS_ROLE_ASSUME cite des routes qui n'existent plus : {sorted(fantomes)}. "
        "Retire-les : une exception qui ne correspond à rien fait passer la prochaine."
    )

    corrigees = []
    for methode, chemin, route in _routes_diagnostics(app):
        if (methode, chemin) not in SANS_ROLE_ASSUME:
            continue
        gardes = _gardes(route)
        if require_child in gardes or require_parent in gardes:
            corrigees.append(f"{methode} {chemin}")
    assert not corrigees, (
        "Ces routes portent désormais un rôle et n'ont plus à figurer dans SANS_ROLE_ASSUME :\n  "
        + "\n  ".join(corrigees)
        + "\n\nRetire-les de l'ensemble — il doit rétrécir."
    )


def test_get_current_user_seul_ne_vaut_pas_un_role() -> None:
    """Anti-régression sur le verrou lui-même. `require_child` DÉPEND de `get_current_user` :
    si quelqu'un réécrit `_gardes` en cherchant l'absence de `get_current_user`, le verrou
    deviendrait vert sur un router ouvert. Ce test fige la sémantique."""
    for _m, chemin, route in _routes_diagnostics(app):
        gardes = _gardes(route)
        if require_child in gardes or require_parent in gardes:
            assert get_current_user in gardes, (
                f"{chemin} : `require_*` sans `get_current_user` dans l'arbre — "
                "la dépendance a changé de forme, `_gardes` doit être relu."
            )
            return
    raise AssertionError("aucune route gardée trouvée — le verrou ne prouve rien")


# ==================================================================================================
# Le comportement — 403 réels, pas seulement des dépendances déclarées
# ==================================================================================================


def _as_papa() -> None:
    app.dependency_overrides[get_current_user] = lambda: {"username": "papa", "role": "papa"}


# Le rôle est refusé AVANT que le gestionnaire ne touche la base : un identifiant inexistant
# suffit donc, et le test n'a rien à semer.
ROUTES_PAPA = [
    ("post", "/api/diagnostics/generate"),
    ("get", "/api/diagnostics/quizzes/999/relecture"),
    ("post", "/api/diagnostics/quizzes/999/validate"),
    ("post", "/api/diagnostics/quizzes/999/reject"),
    ("get", "/api/diagnostics/apercu"),
    ("get", "/api/diagnostics/results"),
    ("get", "/api/diagnostics/results/999"),
    ("get", "/api/diagnostics/portee"),
]

ROUTES_MASSIMO = [
    ("post", "/api/diagnostics/quizzes/999/submit"),
    ("get", "/api/diagnostics/mes-resultats/999"),
    ("post", "/api/diagnostics/mes-resultats/999/explication"),
]


def test_massimo_ne_peut_pas_atteindre_les_routes_de_papa(client_db) -> None:
    """`client_db` authentifie Massimo. Aucune route de pilotage ne doit lui répondre."""
    client, _ = client_db
    for methode, chemin in ROUTES_PAPA:
        reponse = getattr(client, methode)(chemin, json={})
        assert reponse.status_code == 403, (
            f"{methode.upper()} {chemin} rend {reponse.status_code} à l'enfant, pas 403"
        )


def test_papa_ne_peut_pas_soumettre_a_la_place_de_massimo(client_db) -> None:
    """🔴 Le cas qui justifie tout le fichier. Une soumission par un autre compte que Massimo
    ne fuite rien — elle FABRIQUE une mesure, que l'ADR-0048 traitera ensuite comme un fait."""
    client, _ = client_db
    _as_papa()
    for methode, chemin in ROUTES_MASSIMO:
        reponse = getattr(client, methode)(chemin, json={})
        assert reponse.status_code == 403, (
            f"{methode.upper()} {chemin} rend {reponse.status_code} à Papa, pas 403"
        )
