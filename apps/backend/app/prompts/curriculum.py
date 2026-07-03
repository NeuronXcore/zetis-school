"""Prompt versionné de génération du référentiel — passe 1 : chapitres (ADR-0009, v1).

Module **pur** : aucune dépendance runtime (pas de DB, pas de provider), comme
`app/prompts/capsule.py`. Il expose `build_chapters_prompt` qui produit le couple
`(system, prompt)` attendu par `LLMProvider.generate`. La validité est garantie en dur
par `GeneratedChapters` (Pydantic) côté service.

INVARIANT VIE PRIVÉE (ADR-0009 addendum, condition 1) : ce prompt ne reçoit et ne
contient JAMAIS de donnée de Massimo — uniquement matière, niveau, cycle, version de
programme et intitulés de chapitres existants. Testé dans test_curriculum_service.
"""

import json
import unicodedata

CURRICULUM_PROMPT_VERSION = "v1"

# Matières disposant de repères annuels de progression officiels (2019) : pour elles,
# la répartition par classe est exigée conforme (`repartition="officielle"`). Ailleurs,
# la répartition 5e/4e/3e n'est qu'une interprétation à marquer `interpretee`.
ANNUAL_MARKER_SUBJECTS = frozenset({"mathematiques", "francais", "emc", "enseignement moral et civique"})

SYSTEM_PROMPT = (
    "Tu es un expert du programme scolaire officiel français (Bulletin officiel de "
    "l'Éducation nationale). Tu produis la liste des chapitres d'une matière pour un "
    "niveau donné, destinée à un référentiel de travail validé par un parent.\n\n"
    "RÈGLES DE SORTIE (impératif) :\n"
    "- Réponds UNIQUEMENT par un objet JSON valide conforme au schéma demandé "
    "(subject, cycle, program_version, chapters[] avec title, description, themes, "
    "suggested_class, repartition). Aucun texte autour, PAS de balises ```.\n\n"
    "RÈGLES DE CONTENU :\n"
    "- Appuie-toi STRICTEMENT sur la version du programme demandée ; ne mélange jamais "
    "des versions successives (2016 / 2020 / 2026). N'invente aucun intitulé.\n"
    "- Granularité = CHAPITRE DE MANUEL (~5 à 8 chapitres par classe), PAS un "
    "macro-thème du BO. Ex. « Théorème de Pythagore », pas « Espace et géométrie ».\n"
    "- suggested_class = la classe suggérée (ex. \"5e\", \"4e\", \"3e\").\n"
    "- repartition = \"officielle\" UNIQUEMENT si la matière dispose de repères annuels "
    "de progression officiels (2019 : français, mathématiques, EMC) et que la classe "
    "suit ces repères ; sinon \"interpretee\" (répartition indicative, à signaler dans "
    "la description si utile).\n"
    "- Ne duplique JAMAIS un chapitre déjà présent dans la liste des chapitres "
    "existants fournie : complète autour, sans redite ni variante du même intitulé."
)

# Few-shot court : montre la granularité « chapitre de manuel » et les deux registres
# de répartition (maths = repères annuels → officielle ; SVT = sans repères →
# interpretee). Dicts Python sérialisés au build — chaque exemple DOIT rester valide
# au regard de `GeneratedChapters` (3 chapitres = borne basse du schéma, garanti par test).
FEW_SHOTS: list[dict] = [
    {
        "context": (
            "Matière : Mathématiques · Niveau : 4e · Cycle : cycle 4 · "
            "Version du programme : 2020 · Chapitres existants : aucun"
        ),
        "output": {
            "subject": "Mathématiques",
            "cycle": "cycle 4",
            "program_version": "2020",
            "chapters": [
                {
                    "title": "Nombres relatifs : opérations",
                    "description": "Additionner, soustraire, multiplier et diviser des nombres relatifs.",
                    "themes": ["Nombres et calculs"],
                    "suggested_class": "4e",
                    "repartition": "officielle",
                },
                {
                    "title": "Théorème de Pythagore",
                    "description": "Calculer une longueur dans un triangle rectangle ; réciproque.",
                    "themes": ["Espace et géométrie"],
                    "suggested_class": "4e",
                    "repartition": "officielle",
                },
                {
                    "title": "Proportionnalité et pourcentages",
                    "description": "Reconnaître et traiter des situations de proportionnalité, appliquer un pourcentage.",
                    "themes": ["Organisation et gestion de données, fonctions"],
                    "suggested_class": "4e",
                    "repartition": "officielle",
                },
            ],
        },
    },
    {
        "context": (
            "Matière : SVT · Niveau : 4e · Cycle : cycle 4 · "
            "Version du programme : 2020 · Chapitres existants : aucun"
        ),
        "output": {
            "subject": "SVT",
            "cycle": "cycle 4",
            "program_version": "2020",
            "chapters": [
                {
                    "title": "Dynamique interne de la Terre : séismes et volcans",
                    "description": "Expliquer séismes et éruptions par la tectonique des plaques. Répartition par classe indicative (pas de repères annuels officiels).",
                    "themes": ["La planète Terre, l'environnement et l'action humaine"],
                    "suggested_class": "4e",
                    "repartition": "interpretee",
                },
                {
                    "title": "La reproduction humaine",
                    "description": "Puberté, fonctionnement des appareils reproducteurs, contraception. Répartition indicative.",
                    "themes": ["Le corps humain et la santé"],
                    "suggested_class": "4e",
                    "repartition": "interpretee",
                },
                {
                    "title": "Nutrition et organisation des êtres vivants",
                    "description": "Besoins nutritifs et approvisionnement des organes. Répartition indicative.",
                    "themes": ["Le vivant et son évolution"],
                    "suggested_class": "5e",
                    "repartition": "interpretee",
                },
            ],
        },
    },
]

# Réinjectée en réparation ; le service y ajoute l'erreur de validation concrète.
REPAIR_INSTRUCTION = (
    "Ta réponse précédente n'est pas un objet GeneratedChapters valide. Corrige-la en "
    "respectant EXACTEMENT le schéma (3 à 25 chapitres). Réponds UNIQUEMENT par l'objet "
    "JSON corrigé, sans aucun texte ni balise. Erreur détectée : "
)


def _normalize(name: str) -> str:
    """nom de matière → forme ASCII minuscule (comparaison insensible aux accents)."""
    ascii_only = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    return ascii_only.lower().strip()


def has_annual_markers(subject: str) -> bool:
    """La matière dispose-t-elle de repères annuels de progression officiels (2019) ?"""
    return _normalize(subject) in ANNUAL_MARKER_SUBJECTS


def build_chapters_prompt(
    subject: str,
    level: str,
    cycle: str,
    program_version: str,
    existing_manual_chapters: list[str],
) -> tuple[str, str]:
    """Construit le couple `(system, prompt)` de la passe 1 (chapitres d'une matière).

    `existing_manual_chapters` = intitulés des chapitres conservés (manuels ou déjà
    validés) injectés avec la consigne « complète sans dupliquer » (ADR-0009 §3).
    """
    blocks: list[str] = []
    for shot in FEW_SHOTS:
        blocks.append(
            f"EXEMPLE (extrait — la vraie liste couvre toute la classe)\n"
            f"Contexte : {shot['context']}\n"
            "Chapitres attendus :\n"
            f"{json.dumps(shot['output'], ensure_ascii=False, indent=2)}"
        )

    existing = (
        "\n".join(f"- {title}" for title in existing_manual_chapters)
        if existing_manual_chapters
        else "aucun"
    )
    if has_annual_markers(subject):
        repartition_rule = (
            "Cette matière dispose de repères annuels de progression officiels (2019) : "
            "la répartition par classe doit y être STRICTEMENT conforme "
            '(repartition="officielle").'
        )
    else:
        repartition_rule = (
            "Cette matière ne dispose PAS de repères annuels officiels : la répartition "
            'par classe est indicative (repartition="interpretee"), ne l\'affirme jamais '
            "comme officielle."
        )

    target = [
        "À TOI MAINTENANT",
        f"Matière : {subject}",
        f"Niveau : {level} · Cycle : {cycle}",
        f"Version du programme : {program_version}"
        + (" (BO du 30 juillet 2020)" if program_version == "2020" else ""),
        repartition_rule,
        "Chapitres existants (à ne JAMAIS dupliquer, complète autour) :",
        existing,
        "Liste complète des chapitres pour ce niveau (objet JSON uniquement) :",
    ]
    blocks.append("\n".join(target))

    return SYSTEM_PROMPT, "\n\n".join(blocks)
