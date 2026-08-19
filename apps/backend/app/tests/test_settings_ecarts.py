"""« N réglages s'écartent du défaut » (ADR-0062 §4) — les verrous de `GET /api/settings/ecarts`.

Le verrou qui compte est `test_la_route_ne_connait_aucun_defaut` : **cette route ignore les
défauts**, et c'est ce qui la rend juste pour toujours. Le jour où un défaut change dans
`AUTONOMY_CLASSES` ou dans `core/config.py`, elle continue de dire vrai sans qu'on y touche. Une
route qui comparerait aux défauts en tiendrait une copie — et la copie qui ment est toujours celle
qu'on lit.
"""

import pytest

import app.db.models as m
from app.main import app
from app.modules.auth.deps import get_current_user

PAPA = {"username": "papa", "role": "papa"}
CHILD = {"username": "massimo", "role": "child"}
API = "/api/settings/ecarts"
AUTONOMY = "/api/settings/autonomy"

A0A = "zetis_autonomy_a0a_derives"


def _as(role: dict) -> None:
    app.dependency_overrides[get_current_user] = lambda: role


@pytest.fixture(autouse=True)
def _papa(client_db) -> None:
    """⚠️ Dépend de `client_db` À DESSEIN — même motif que `test_settings_autonomy.py` : sans ça
    l'autouse passe AVANT lui, et le fixture de base réécrit l'override en rôle enfant."""
    _as(PAPA)


# --- Ce que la route répond ---------------------------------------------------------------------


def test_une_base_neuve_ne_montre_aucun_ecart(client_db) -> None:
    """Aucune ligne → aucun écart. La page dira « rien n'a été changé », et ce sera vrai.

    ⚠️ C'est le cas qui distingue cette route d'un compteur de réglages : elle ne compte pas ce
    qui EXISTE, elle compte ce qui a été DÉCIDÉ.
    """
    client, _ = client_db

    assert client.get(API).json() == {"keys": []}


def test_ecrire_un_palier_cree_l_ecart(client_db) -> None:
    """Une bascule depuis l'UI crée la ligne — donc l'écart apparaît, sans rien d'autre à écrire.

    ⚠️ `write_autonomy` écrit les SIX clés d'un coup (il relit tout puis persiste la cible), pas
    seulement celle qu'on change. On n'assert donc pas un compte, on assert une présence — sinon
    le test dirait « 6 » sans que personne sache pourquoi.
    """
    client, _ = client_db
    assert client.put(AUTONOMY, json={"values": {A0A: 2}}).status_code == 200

    assert A0A in client.get(API).json()["keys"]


def test_le_declencheur_compte_comme_un_ecart(client_db) -> None:
    """La 7ᵉ clé n'est pas un palier, mais c'est bien un geste de Papa — donc il se souvient."""
    client, _ = client_db
    client.put(AUTONOMY, json={"values": {}, "auto_trigger_enabled": True})

    assert "zetis_auto_trigger_enabled" in client.get(API).json()["keys"]


def test_les_cles_sont_triees(client_db) -> None:
    """Deux lectures rendent le même ordre : un écran qui réordonne ses lignes sans raison se lit
    comme un changement."""
    client, _ = client_db
    client.put(AUTONOMY, json={"values": {A0A: 2}, "auto_trigger_enabled": True})

    keys = client.get(API).json()["keys"]
    assert keys == sorted(keys)


def test_les_valeurs_ne_sortent_jamais(client_db) -> None:
    """🔴 Les CLÉS, jamais les valeurs. La question posée est « qu'est-ce qui n'est plus au
    défaut ? » — une valeur n'y répond pas, et chaque champ qui sort est un champ à protéger."""
    client, _ = client_db
    client.put(AUTONOMY, json={"values": {A0A: 2}})

    charge = client.get(API).json()
    assert set(charge) == {"keys"}
    assert all(isinstance(k, str) for k in charge["keys"])


# --- Les deux verrous de doctrine ----------------------------------------------------------------


def test_la_route_ne_connait_aucun_defaut(client_db) -> None:
    """🔴 **Écrire la valeur PAR DÉFAUT crée quand même l'écart** — et c'est voulu.

    On pourrait le lire comme un bug : Papa a « remis comme avant », et la page dit encore
    « modifié ». C'est pourtant la propriété qu'on protège. La table pose que *l'absence de ligne
    EST le défaut* ; une ligne existe donc parce qu'un **geste** l'a créée, et c'est exactement ce
    que Papa cherche quand il demande « qu'est-ce que j'ai bricolé ? ».

    Le refuser obligerait cette route à connaître le défaut de chaque clé — donc à en tenir une
    copie, qui divergerait au premier ADR. La route reste ignorante, et reste juste.
    """
    client, _ = client_db
    defaut = client.get(AUTONOMY).json()
    valeur_par_defaut = next(c["value"] for c in defaut["classes"] if c["key"] == A0A)

    client.put(AUTONOMY, json={"values": {A0A: valeur_par_defaut}})

    assert A0A in client.get(API).json()["keys"]


def test_la_route_lit_la_table_et_ne_recite_pas_une_liste(client_db) -> None:
    """Sans ce verrou, une liste en dur passerait tous les autres tests.

    On écrit une clé que le code applicatif ne pose jamais, et on exige de la voir ressortir :
    seule une lecture réelle de `app_settings` peut la rendre.
    """
    client, Session = client_db
    with Session() as db:
        db.add(m.AppSetting(key="zzz_cle_inconnue_du_code", value="1"))
        db.commit()

    assert "zzz_cle_inconnue_du_code" in client.get(API).json()["keys"]


# --- Portée ---------------------------------------------------------------------------------------


def test_le_role_enfant_est_refuse(client_db) -> None:
    """`require_parent` est porté par le routeur. Montrer à Massimo ce que Papa a réglé, ce serait
    lui apprendre que ses réglages se règlent."""
    client, _ = client_db
    _as(CHILD)

    assert client.get(API).status_code == 403
