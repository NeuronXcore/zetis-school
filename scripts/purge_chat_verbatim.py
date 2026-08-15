#!/usr/bin/env python3
"""Efface les mots dictés par Massimo restés dans `ai_jobs` (ADR-0059 §18).

## Ce qu'il répare

Jusqu'au 2026-08-15, la dictée du chat passait par `eli5_transcribe`, qui écrivait
`output_json = {"transcript": "…"}` — **durablement, hors TTL**. L'ADR-0026 §1 promettait une
« impossibilité structurelle » et la docstring du module STT affirmait « rien de durable côté
serveur » : les deux étaient démentis. Le code est corrigé ; ce script solde l'existant.

Mesuré en base de dev le 2026-08-15 : **78 lignes**, du 4 juillet au 14 août.

## Ce qu'il fait, et ce qu'il ne fait PAS

Il **retire la seule clé `transcript`**. La ligne survit avec son `job_type`, son statut, sa
durée, la taille et le format de l'audio — la trace d'exécution que `CLAUDE.md` §Règles IA exige.
Supprimer la ligne entière effacerait aussi le fait qu'une dictée a eu lieu, ce que l'ADR ne
demande pas : la règle est *« aucun `ai_jobs` ne porte un TEXTE de Massimo »*.

🔴 **Seule la clé `transcript` est visée**, et c'est délibéré. Une liste large (`text`, `message`,
`content`…) emporterait des métadonnées légitimes — un `kind` de difficulté déclarée, un libellé
d'action — que le §1c autorise nommément. Si une autre fuite est un jour constatée, on ajoute la
clé **après l'avoir mesurée**, pas par précaution.

Il balaie `output_json` **et** `input_json`, sur **tous** les `job_types`. Le verrou historique
ne regardait que `job_type == "chat_turn"` et c'est précisément pour cela que la fuite est passée
à côté : un filtre étroit ne prouve rien sur le reste de la table.

## Usage

Bilan seul, rien n'est écrit — **c'est le défaut** :

    python scripts/purge_chat_verbatim.py

Effacement réel :

    python scripts/purge_chat_verbatim.py --apply

Sur une base explicite (sans passer par la configuration de l'app) :

    python scripts/purge_chat_verbatim.py --database-url postgresql+psycopg://… --apply

⚠️ **La variable est `ZETIS_DATABASE_URL`, et `DATABASE_URL` est ignorée EN SILENCE.** Le piège
s'est déclenché en vrai le 2026-08-10 pendant une migration de production. Le script le dit
explicitement quand il le voit, plutôt que d'opérer sur la mauvaise base.

Idempotent : une seconde exécution ne trouve plus rien et sort en 0.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine, make_url

#: La seule clé effacée. Voir la docstring : la liste est courte EXPRÈS.
CLE_VERBATIM = "transcript"

#: Les deux colonnes JSON d'`ai_jobs`. `input_json` n'en portait aucune le 2026-08-15 — on la
#: balaie quand même : c'est le filtre étroit qui avait laissé passer la fuite.
COLONNES = ("output_json", "input_json")


def _condition(colonne: str) -> str:
    # ⚠️ Les colonnes sont de type `json`, pas `jsonb` : sans le cast, l'opérateur `?` n'existe pas
    # et Postgres rend « operator does not exist: json ? unknown ».
    return f"{colonne} is not null and {colonne}::jsonb ? '{CLE_VERBATIM}'"


def _cible(url: str) -> str:
    """Où l'on va écrire, sans jamais afficher le mot de passe."""
    u = make_url(url)
    return f"{u.host or 'local'}:{u.port or ''}/{u.database}"


def _resoudre_url(argument: str | None) -> str:
    if argument:
        return argument
    if os.getenv("DATABASE_URL") and not os.getenv("ZETIS_DATABASE_URL"):
        print(
            "⚠️  `DATABASE_URL` est définie mais `ZETIS_DATABASE_URL` ne l'est pas.\n"
            "    L'application lit `ZETIS_DATABASE_URL` et IGNORE l'autre en silence : sans\n"
            "    correction, ce script opérerait sur une base différente de celle de ZETIS.\n"
            "    Définissez `ZETIS_DATABASE_URL`, ou passez --database-url explicitement.",
            file=sys.stderr,
        )
        return ""
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "apps" / "backend"))
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


def _bilan(moteur: Engine) -> list[tuple[str, str, int, str, str]]:
    """Ce qui reste à effacer, par colonne et par `job_type`. Aucun contenu n'est lu ni affiché."""
    lignes: list[tuple[str, str, int, str, str]] = []
    with moteur.connect() as cx:
        for colonne in COLONNES:
            for r in cx.execute(
                text(
                    f"""select job_type, count(*) n,
                               coalesce(min(created_at)::date::text, '—') d1,
                               coalesce(max(created_at)::date::text, '—') d2
                          from ai_jobs where {_condition(colonne)}
                         group by job_type order by n desc"""
                )
            ).all():
                lignes.append((colonne, r.job_type, r.n, r.d1, r.d2))
    return lignes


def main() -> int:
    parseur = argparse.ArgumentParser(
        description="Efface les mots dictés restés dans ai_jobs (ADR-0059 §18).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parseur.add_argument(
        "--apply",
        action="store_true",
        help="écrit réellement. Sans ce drapeau, le script ne fait qu'un bilan.",
    )
    parseur.add_argument(
        "--database-url",
        default=None,
        help="base cible. Par défaut : celle de la configuration du backend.",
    )
    args = parseur.parse_args()

    url = _resoudre_url(args.database_url)
    if not url:
        return 2

    moteur = create_engine(url)
    print(f"Base    : {_cible(url)}")
    print(f"Mode    : {'ÉCRITURE' if args.apply else 'bilan seul (ajoutez --apply pour écrire)'}")
    print(f"Clé     : {CLE_VERBATIM!r}, dans {' et '.join(COLONNES)}\n")

    lignes = _bilan(moteur)
    if not lignes:
        print("✅ Rien à effacer : aucune ligne d'`ai_jobs` ne porte de texte de Massimo.")
        return 0

    total = sum(n for _, _, n, _, _ in lignes)
    for colonne, job_type, n, d1, d2 in lignes:
        print(f"  {colonne:12} {job_type:24} {n:5}  {d1} → {d2}")
    print(f"\n  TOTAL : {total} ligne(s) à nettoyer.")

    if not args.apply:
        print("\nRien n'a été écrit. Relancez avec --apply pour effacer.")
        return 1

    touchees = 0
    with moteur.begin() as cx:
        for colonne in COLONNES:
            resultat = cx.execute(
                text(
                    f"""update ai_jobs
                           set {colonne} = ({colonne}::jsonb - '{CLE_VERBATIM}')::json
                         where {_condition(colonne)}"""
                )
            )
            touchees += resultat.rowcount

    # ⚠️ On RE-VÉRIFIE après coup, sur une connexion neuve. Un `rowcount` conforme dit que l'ordre
    # est passé, pas que la table est propre : c'est la lecture d'après qui le prouve.
    reste = _bilan(moteur)
    print(f"\n  {touchees} ligne(s) mise(s) à jour.")
    if reste:
        print("🔴 Il reste des lignes porteuses — l'effacement est INCOMPLET :", file=sys.stderr)
        for colonne, job_type, n, _, _ in reste:
            print(f"     {colonne} / {job_type} : {n}", file=sys.stderr)
        return 3
    print("✅ Vérifié : plus aucune ligne d'`ai_jobs` ne porte de texte de Massimo.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
