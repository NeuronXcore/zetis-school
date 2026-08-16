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

🔴 **On énumère le ROUTER, jamais `app.routes` — et c'est une correction, pas un goût.** La
première version de ce fichier filtrait `app.routes` sur `isinstance(route, APIRoute)` et rendait
**zéro route** : depuis FastAPI 0.139, `include_router` ne met plus les routes à plat dans l'app,
il y range des `fastapi.routing._IncludedRouter` (46 ici, aucun `APIRoute`). Le verrou principal
était donc VERT sur une liste vide — exactement le pire cas annoncé au paragraphe précédent, et
seul `test_le_router_est_bien_celui_qu_on_croit` l'a vu. Le router nu, lui, porte toujours ses
`APIRoute`, et ses chemins incluent déjà le préfixe. Ce que le router ne prouve pas — qu'il soit
réellement MONTÉ dans l'app — est vérifié à part, via `app.openapi()`, qui est de l'API publique.
"""

from __future__ import annotations

from fastapi.routing import APIRoute

from app.main import app
from app.modules.auth.deps import get_current_user, require_child, require_parent
from app.modules.diagnostics.router import router as diagnostics_router

# ==================================================================================================
# Les exceptions, nommées et datées — cet ensemble doit RÉTRÉCIR, jamais grossir
# ==================================================================================================

# 🔴 **VIDE, et c'est le but atteint — pas un oubli.** Cet ensemble a porté trois routes de lecture
# servies à tout compte authentifié, relevées le 2026-08-16 : `GET /subjects`, `GET /quizzes`,
# `GET /quizzes/{quiz_id}`. Les trois ont été fermées le jour même, chacune vers le rôle de son
# SEUL appelant réel — le motif est écrit sur chaque route dans le router.
#
# L'arbitrage annoncé pour `/quizzes` (« sert les deux espaces ») était FAUX, et c'est la mesure qui
# l'a dit : Papa ne l'appelle jamais, il passe par `/apercu` et `/relecture`.
#
# Ajouter une ligne ici est une DÉROGATION, pas un raccourci : elle demande un motif écrit et une
# date, et ce module est celui qui écrit une mesure au nom de Massimo. Cet ensemble doit rétrécir,
# jamais grossir — il est à zéro, donc il ne doit plus bouger.
SANS_ROLE_ASSUME: set[tuple[str, str]] = set()


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


def _routes_diagnostics() -> list[tuple[str, str, APIRoute]]:
    """Les routes du router `diagnostics`, méthode par méthode.

    Le chemin porté par `route.path` inclut déjà le préfixe du router (`/api/diagnostics/...`) :
    il est comparable tel quel à ce que sert l'app.
    """
    trouvees = []
    for route in diagnostics_router.routes:
        if not isinstance(route, APIRoute):
            continue
        for methode in sorted(route.methods - {"HEAD", "OPTIONS"}):
            trouvees.append((methode, route.path, route))
    return sorted(trouvees, key=lambda t: (t[1], t[0]))


# ==================================================================================================
# Le verrou
# ==================================================================================================


def test_le_router_est_bien_celui_qu_on_croit() -> None:
    """Anti-test-à-vide. Un verrou qui parcourt une liste vide est vert pour rien.

    🔴 Ce test a déjà servi une fois : c'est lui, et lui seul, qui a rattrapé l'énumération à zéro
    du 2026-08-16 (cf. l'en-tête du fichier). Il ne se supprime pas.
    """
    routes = _routes_diagnostics()
    assert len(routes) >= 12, f"seulement {len(routes)} routes trouvées — le préfixe a changé ?"
    assert diagnostics_router.prefix == "/api/diagnostics"


def test_le_router_est_reellement_monte_dans_l_app() -> None:
    """Ce que l'énumération par le router ne peut PAS prouver : que l'app serve ces routes.

    Sans ce test, un `include_router` supprimé de `main.py` laisserait tous les autres verts — ils
    inspectent un objet qui existe en mémoire, pas un service rendu. `app.openapi()` est de l'API
    publique, contrairement aux classes internes de `app.routes` qui ont déjà changé sous nous.
    """
    servis = {
        (methode.upper(), chemin)
        for chemin, operations in app.openapi()["paths"].items()
        if chemin.startswith("/api/diagnostics")
        for methode in operations
    }
    declarees = {(m, c) for m, c, _r in _routes_diagnostics()}
    assert declarees <= servis, (
        "Ces routes sont déclarées par le router mais NON servies par l'app — "
        f"`include_router` manque-t-il ? {sorted(declarees - servis)}"
    )


def test_toute_route_diagnostics_porte_un_role() -> None:
    """🔴 LE VERROU. Une route ajoutée sans `require_child` ni `require_parent` fait rougir ici,
    le jour où elle est écrite — pas le jour où quelqu'un s'en sert."""
    ouvertes = []
    for methode, chemin, route in _routes_diagnostics():
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
    reelles = {(m, c) for m, c, _r in _routes_diagnostics()}
    fantomes = SANS_ROLE_ASSUME - reelles
    assert not fantomes, (
        f"SANS_ROLE_ASSUME cite des routes qui n'existent plus : {sorted(fantomes)}. "
        "Retire-les : une exception qui ne correspond à rien fait passer la prochaine."
    )

    corrigees = []
    for methode, chemin, route in _routes_diagnostics():
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
    for _m, chemin, route in _routes_diagnostics():
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
#
# ⚠️ `httpx` REFUSE un corps sur `GET` (`TypeError: got an unexpected keyword argument 'json'`) —
# la première version passait `json={}` à tout le monde et les deux tests de comportement
# n'atteignaient jamais une assertion. D'où `_appeler`, qui n'envoie un corps que sur `POST`.
ROUTES_PAPA = [
    ("post", "/api/diagnostics/generate"),
    ("get", "/api/diagnostics/quizzes/999/relecture"),
    ("post", "/api/diagnostics/quizzes/999/validate"),
    ("post", "/api/diagnostics/quizzes/999/reject"),
    ("get", "/api/diagnostics/apercu"),
    ("get", "/api/diagnostics/results"),
    ("get", "/api/diagnostics/results/999"),
    ("get", "/api/diagnostics/portee"),
    # Fermée le 2026-08-16 — elle ouvrait le sélecteur d'un geste déjà `require_parent`.
    ("get", "/api/diagnostics/subjects"),
]

ROUTES_MASSIMO = [
    ("post", "/api/diagnostics/quizzes/999/submit"),
    ("get", "/api/diagnostics/mes-resultats/999"),
    ("post", "/api/diagnostics/mes-resultats/999/explication"),
    # Fermées le 2026-08-16 — les deux routes de passation, servies au seul espace Massimo.
    ("get", "/api/diagnostics/quizzes"),
    ("get", "/api/diagnostics/quizzes/999"),
]


def _appeler(client, methode: str, chemin: str):
    if methode == "get":
        return client.get(chemin)
    return getattr(client, methode)(chemin, json={})


def test_massimo_ne_peut_pas_atteindre_les_routes_de_papa(client_db) -> None:
    """`client_db` authentifie Massimo. Aucune route de pilotage ne doit lui répondre."""
    client, _ = client_db
    for methode, chemin in ROUTES_PAPA:
        reponse = _appeler(client, methode, chemin)
        assert reponse.status_code == 403, (
            f"{methode.upper()} {chemin} rend {reponse.status_code} à l'enfant, pas 403"
        )


def test_papa_ne_peut_pas_soumettre_a_la_place_de_massimo(client_db) -> None:
    """🔴 Le cas qui justifie tout le fichier. Une soumission par un autre compte que Massimo
    ne fuite rien — elle FABRIQUE une mesure, que l'ADR-0048 traitera ensuite comme un fait."""
    client, _ = client_db
    _as_papa()
    for methode, chemin in ROUTES_MASSIMO:
        reponse = _appeler(client, methode, chemin)
        assert reponse.status_code == 403, (
            f"{methode.upper()} {chemin} rend {reponse.status_code} à Papa, pas 403"
        )
