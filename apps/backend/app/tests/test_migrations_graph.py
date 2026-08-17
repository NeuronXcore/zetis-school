"""Test-verrous du GRAPHE des migrations — sans aucune base de données.

Ce fichier existe parce que le 2026-08-15, on a découvert que **la production dérivait du dépôt
sans que rien ne le mesure** : cinq migrations en attente pour un chantier qui en apportait deux,
dont trois mergées des jours plus tôt. La dérive elle-même se mesure contre une base
(`scripts/check_migration_drift.py`) ; ce qui se vérifie **ici**, c'est ce qui ne demande aucune
base et se casse au moment du commit :

- le graphe a-t-il **une seule tête** ?
- chaque fichier de migration est-il **atteignable** depuis la base ?

Deux têtes, c'est le piège nommé dans les deux migrations de ce jour-là : deux migrations sœurs
posées sur le même parent passent tous les tests, se mergent sans conflit git — et rendent
`alembic upgrade head` **ambigu**. L'entrypoint de production le fait au démarrage.

⚠️ **Aucun test ici ne remplace le contrôle contre une base.** Un graphe parfait ne dit rien sur
ce qui est posé en prod. Les deux sont complémentaires, et c'est écrit pour qu'on ne prenne pas
l'un pour l'autre.
"""

from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

#: `app/tests/x.py` → parents : tests, app, BACKEND.
BACKEND = Path(__file__).resolve().parents[2]


def _script() -> ScriptDirectory:
    config = Config(str(BACKEND / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND / "alembic"))
    return ScriptDirectory.from_config(config)


def test_le_graphe_des_migrations_a_UNE_SEULE_tete() -> None:
    """🔴 Deux têtes rendent `alembic upgrade head` ambigu, et rien d'autre ne le voit.

    Le cas se fabrique tout seul : deux chantiers partent du même `main`, chacun écrit une
    migration avec le même `down_revision`, les deux branches se mergent sans conflit git (les
    fichiers sont différents). La suite de tests reste verte — elle tourne sur un SQLite créé par
    `Base.metadata.create_all`, qui ne traverse jamais alembic.

    Le défaut n'apparaît qu'au **démarrage de la production**, où l'entrypoint fait
    `alembic upgrade head` : *« The script directory has multiple heads »*.

    Réparation : rebaser le `down_revision` de la seconde sur la première. Jamais supprimer une
    migration déjà posée quelque part.
    """
    tetes = _script().get_heads()
    assert len(tetes) == 1, (
        f"{len(tetes)} têtes de migration : {sorted(tetes)}. `upgrade head` est ambigu — "
        "rebaser le `down_revision` de l'une sur l'autre."
    )


def test_chaque_FICHIER_de_versions_est_une_revision_de_la_chaine() -> None:
    """Autant de révisions dans la chaîne que de fichiers dans `alembic/versions/`.

    ⚠️ **Ce test ne cherche PAS le `down_revision` cassé** — je l'ai écrit pour ça, puis mesuré :
    alembic **refuse de construire son graphe** si un `down_revision` pointe dans le vide
    (`ResolutionError`), donc `_script()` lèverait avant toute assertion. Ce cas-là ne peut pas
    être silencieux, et un test qui prétendrait le couvrir se donnerait un mérite qu'il n'a pas.

    Ce qui EST silencieux : un fichier qu'alembic **ignore**. Une copie de sauvegarde
    (`x_migration.py.bak` renommée en `.py`), un fichier sans attribut `revision`, un brouillon
    laissé là — alembic ne les charge pas, ne dit rien, et le compte diverge. On croit avoir posé
    une migration ; elle n'existe pour personne.
    """
    script = _script()
    dans_la_chaine = {revision.revision for revision in script.walk_revisions("base", "heads")}
    fichiers = [
        chemin
        for chemin in (BACKEND / "alembic" / "versions").glob("*.py")
        if chemin.name != "__init__.py"
    ]
    assert len(fichiers) == len(dans_la_chaine), (
        f"{len(fichiers)} fichiers dans `alembic/versions/` pour {len(dans_la_chaine)} révisions "
        "dans la chaîne. Un fichier est ignoré par alembic — vérifier qu'il déclare bien "
        "`revision` et `down_revision`, ou le retirer s'il n'a rien à faire là."
    )


def test_la_tete_du_depot_est_celle_que_le_chantier_a_posee() -> None:
    """Ancre la tête courante, pour qu'un rebase accidentel se voie.

    ⚠️ **Ce test est fait pour être mis à jour** — à chaque migration ajoutée, d'une ligne. Ce
    n'est pas un verrou de doctrine, c'est un **témoin** : il transforme « la tête a bougé » d'un
    fait invisible en une ligne de diff qu'on relit. Une migration qu'on ajoute sans toucher cette
    ligne est une migration qui n'est pas la nouvelle tête — c'est-à-dire, presque toujours, une
    seconde tête.
    """
    assert list(_script().get_heads()) == ["a86333999bf0"], (
        "La tête des migrations a changé. Si c'est voulu (nouvelle migration), mettre cette "
        "ligne à jour dans le même commit. Sinon, une seconde tête vient d'apparaître."
    )
