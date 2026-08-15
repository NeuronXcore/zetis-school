#!/usr/bin/env python3
"""Mesure l'écart entre la révision d'une base et la tête du dépôt.

## Ce qu'il ferme

**La production dérivait du dépôt sans que rien ne le mesure.** Le 2026-08-15, on est allé poser
les deux migrations d'un chantier ; il y en avait **cinq** en attente. Trois venaient de chantiers
mergés des jours plus tôt et jamais appliqués — `fiche_author_massimo`,
`un_seul_brouillon_par_lecon`, `cle_de_carte_a_trois_colonnes`. Rien nulle part ne le disait :
ni un test, ni un écran, ni un journal. Il a fallu le demander à `alembic history`, et il a fallu
penser à le demander.

Ce script rend la question posable en une commande, et **exploitable par un code de sortie**.

⚠️ **Il ne remplace pas l'entrypoint.** `infra/docker/backend-entrypoint.sh` fait déjà
`alembic upgrade head` au démarrage : une prod qui redémarre après un merge se met à jour toute
seule. La fenêtre de dérive est exactement *entre le merge et le redémarrage suivant* — et c'est
une fenêtre qu'aucun contrôle au démarrage ne peut voir, puisqu'au démarrage il est déjà trop tard
pour la constater. D'où un contrôle **hors du démarrage**.

## Ce qu'il regarde, et les trois façons de diverger

| Sortie | Cas | Ce que ça veut dire |
|---|---|---|
| `0` | aligné | la base est à la tête du dépôt |
| `1` | **en retard** | des migrations mergées ne sont pas posées — la dérive ordinaire |
| `2` | 🔴 **révision INCONNUE du dépôt** | la base porte une révision qui n'existe pas ici : quelqu'un a posé une branche non mergée. Au prochain redémarrage, l'entrypoint échouera sur *« Can't locate revision »* et le backend **ne remontera pas** |
| `3` | 🔴 **deux têtes dans le dépôt** | défaut structurel, sans rapport avec la base — deux migrations sœurs sur le même parent. `upgrade head` devient ambigu. Ce cas est aussi verrouillé par `app/tests/test_migrations_graph.py`, qui n'a besoin d'aucune base |

Le cas `3` est vérifié **avant** toute connexion : il n'a pas besoin de base, et une base saine ne
le corrigerait pas.

## Usage

Sur la base que lit l'application (dev, par défaut) :

    python scripts/check_migration_drift.py

Sur la production — elle n'est joignable que depuis le réseau du compose, et son
`ZETIS_DATABASE_URL` y est déjà posée :

    docker compose -f docker-compose.prod.yml up -d postgres
    docker compose -f docker-compose.prod.yml run --rm --no-deps \\
      -v "$PWD/apps/backend/alembic:/repo/apps/backend/alembic:ro" \\
      -v "$PWD/scripts:/scripts:ro" \\
      --entrypoint python backend /scripts/check_migration_drift.py

🔴 **Le montage de `alembic/` n'est pas un confort.** L'image fige les migrations du jour de son
build (`COPY apps/backend`) : sans lui, ce script comparerait la base à une tête **périmée** et
annoncerait « aligné » sur une base en retard. Il refuse d'ailleurs de se taire là-dessus — voir
`--tete-attendue`.

Sur une base explicite :

    python scripts/check_migration_drift.py --database-url postgresql+psycopg://…

⚠️ **La variable est `ZETIS_DATABASE_URL`, et `DATABASE_URL` est ignorée EN SILENCE** par
l'application. Le script le dit plutôt que d'opérer sur la mauvaise base.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine, make_url

RACINE = Path(__file__).resolve().parent.parent
BACKEND = RACINE / "apps" / "backend"

ALIGNE, EN_RETARD, INCONNUE, DEUX_TETES = 0, 1, 2, 3


def _script_directory() -> ScriptDirectory:
    """Le graphe des migrations **du dépôt** — la référence à laquelle on compare."""
    config = Config(str(BACKEND / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND / "alembic"))
    return ScriptDirectory.from_config(config)


def _cible(url: str) -> str:
    """Où l'on regarde, sans jamais afficher le mot de passe."""
    u = make_url(url)
    return f"{u.host or 'local'}:{u.port or ''}/{u.database}"


def _resoudre_url(argument: str | None) -> str:
    if argument:
        return argument
    if os.getenv("DATABASE_URL") and not os.getenv("ZETIS_DATABASE_URL"):
        print(
            "⚠️  `DATABASE_URL` est définie mais `ZETIS_DATABASE_URL` ne l'est pas.\n"
            "    L'application lit `ZETIS_DATABASE_URL` et IGNORE l'autre en silence : sans\n"
            "    correction, ce script mesurerait une base différente de celle de ZETIS.\n"
            "    Définissez `ZETIS_DATABASE_URL`, ou passez --database-url explicitement.",
            file=sys.stderr,
        )
        return ""
    sys.path.insert(0, str(BACKEND))
    try:
        from app.core.config import settings  # noqa: PLC0415 — import tardif, hors chemin par défaut
    except ImportError as erreur:
        print(
            f"Impossible de lire la configuration du backend ({erreur}).\n"
            "Lancez le script depuis le dépôt avec le venv d'`apps/backend`, ou passez\n"
            "--database-url.",
            file=sys.stderr,
        )
        return ""
    return settings.database_url


def _revision_en_base(moteur: Engine) -> str | None:
    """`None` = base vierge : pas de table `alembic_version`, ou table vide.

    Les deux se traitent pareil (« tout est en attente ») et se distinguent mal — une base
    fraîchement créée passe par les deux états. On ne les sépare pas.
    """
    if "alembic_version" not in inspect(moteur).get_table_names():
        return None
    with moteur.connect() as cx:
        return cx.execute(text("select version_num from alembic_version")).scalar()


def main() -> int:
    parseur = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parseur.add_argument("--database-url", dest="url", default=None)
    parseur.add_argument(
        "--tete-attendue",
        default=None,
        help=(
            "Révision que le dépôt DEVRAIT porter. Si elle diffère de la tête lue, le script "
            "s'arrête : c'est le garde-fou contre une image dont les migrations sont périmées, "
            "qui annoncerait « aligné » sur une base en retard."
        ),
    )
    args = parseur.parse_args()

    script = _script_directory()
    tetes = script.get_heads()

    # --- Cas 3 : structurel, vérifié AVANT toute connexion ------------------------------------
    if len(tetes) != 1:
        print(f"🔴 Le dépôt porte {len(tetes)} têtes : {', '.join(sorted(tetes))}")
        print("   `alembic upgrade head` devient ambigu. Deux migrations sœurs partagent un")
        print("   parent — l'une doit être rebasée sur l'autre (`down_revision`).")
        return DEUX_TETES

    tete = tetes[0]
    if args.tete_attendue and args.tete_attendue != tete:
        print(f"🔴 Tête lue « {tete} », tête attendue « {args.tete_attendue} ».")
        print("   Les migrations visibles ne sont pas celles du dépôt — image périmée, ou")
        print("   montage de `alembic/` manquant. Comparaison ABANDONNÉE : elle mentirait.")
        return INCONNUE

    url = _resoudre_url(args.url)
    if not url:
        return INCONNUE

    moteur = create_engine(url)
    print(f"Base    : {_cible(url)}")
    courante = _revision_en_base(moteur)
    print(f"Révision: {courante or '(aucune — base vierge)'}")
    print(f"Tête    : {tete}")

    if courante == tete:
        print("\n✅ Aligné.")
        return ALIGNE

    # --- Cas 2 : la base connaît une révision que le dépôt ignore ------------------------------
    if courante is not None:
        try:
            script.get_revision(courante)
        except Exception:
            print(
                f"\n🔴 La révision « {courante} » n'existe PAS dans ce dépôt.\n"
                "   Une branche non mergée a été posée sur cette base. Au prochain redémarrage,\n"
                "   l'entrypoint fera `alembic upgrade head` et échouera sur « Can't locate\n"
                "   revision » : le backend ne remontera pas.\n"
                "   → revenir à une révision mergée, ou merger la branche qui la porte."
            )
            return INCONNUE

    # --- Cas 1 : en retard ---------------------------------------------------------------------
    en_attente = list(script.iterate_revisions(tete, courante or "base"))
    en_attente.reverse()  # `iterate_revisions` descend ; on veut l'ordre d'application
    if courante is not None:
        en_attente = [r for r in en_attente if r.revision != courante]

    print(f"\n🔴 {len(en_attente)} migration(s) en attente, dans l'ordre d'application :\n")
    for revision in en_attente:
        titre = (revision.doc or "").split("\n")[0]
        print(f"   {revision.revision}  {titre}")

    print(
        "\n⚠️  Lire chaque migration avant de l'appliquer — certaines SUPPRIMENT des lignes en\n"
        "   `upgrade()` (dédoublonnage précédant une contrainte d'unicité). Mesurer ce qu'elles\n"
        "   retireraient sur CETTE base, ne pas le supposer.\n"
        "   Procédure et pièges : `scripts/README.md`."
    )
    return EN_RETARD


if __name__ == "__main__":
    sys.exit(main())
