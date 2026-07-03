"""Prompts versionnés de génération du référentiel (ADR-0009) — passe 1 : chapitres (v1)
et passe 2 : leçons + notions (v1, Lot 2 Slice A).

Module **pur** : aucune dépendance runtime (pas de DB, pas de provider), comme
`app/prompts/capsule.py`. Il expose `build_chapters_prompt` et `build_lessons_prompt`
qui produisent le couple `(system, prompt)` attendu par `LLMProvider.generate`. La
validité est garantie en dur par `GeneratedChapters` / `GeneratedLessons` (Pydantic)
côté service.

INVARIANT VIE PRIVÉE (ADR-0009 addendum, condition 1) : ces prompts ne reçoivent et ne
contiennent JAMAIS de donnée de Massimo — uniquement matière, niveau, cycle, version de
programme, chapitre cadré et intitulés existants. Testé dans test_curriculum_service et
test_curriculum_lessons_service.
"""

import json
import unicodedata

CURRICULUM_PROMPT_VERSION = "v1"
LESSONS_PROMPT_VERSION = "v1"

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


# ---------------------------------------------------------------------------
# Passe 2 : leçons + notions d'un chapitre (Lot 2 Slice A, v1).
# ---------------------------------------------------------------------------

SYSTEM_PROMPT_LESSONS = (
    "Tu es un expert du programme scolaire officiel français (Bulletin officiel de "
    "l'Éducation nationale). À partir d'un chapitre donné d'une matière et d'un niveau, "
    "tu produis les leçons de ce chapitre et leurs notions, destinées à un référentiel "
    "de travail validé par un parent.\n\n"
    "RÈGLES DE SORTIE (impératif) :\n"
    "- Réponds UNIQUEMENT par un objet JSON valide conforme au schéma demandé "
    "(lessons[] avec title, summary, notions). Aucun texte autour, PAS de balises ```.\n\n"
    "RÈGLES DE CONTENU :\n"
    "- Appuie-toi STRICTEMENT sur la version du programme demandée ; ne mélange jamais "
    "des versions successives (2016 / 2020 / 2026). N'invente aucun contenu hors "
    "programme.\n"
    "- Granularité = LEÇON DE MANUEL : environ 2 à 8 leçons par chapitre. Ni "
    "macro-section (le chapitre entier en une leçon), ni micro-item (une leçon par "
    "exercice type).\n"
    "- summary = 1 à 2 phrases décrivant ce que la leçon couvre.\n"
    "- notions = 1 à 4 intitulés COURTS et FACTUELS par leçon (ex. « Théorème de "
    "Pythagore », « Règle des signes ») : chaque notion doit pouvoir servir de "
    "compétence réutilisable dans d'autres leçons, quiz ou diagnostics. Pas de phrase, "
    "pas de verbe conjugué.\n"
    "- Ne duplique JAMAIS une leçon déjà présente dans la liste des leçons existantes "
    "fournie : complète autour, sans redite ni variante du même intitulé."
)

# Few-shot court : montre la granularité « leçon de manuel » et des notions courtes,
# factuelles, réutilisables comme `Skill`. Chaque exemple DOIT rester valide au regard
# de `GeneratedLessons` (garanti par test).
LESSONS_FEW_SHOTS: list[dict] = [
    {
        "context": (
            "Matière : Mathématiques · Niveau : 4e · Cycle : cycle 4 · "
            "Version du programme : 2020 · Chapitre : « Théorème de Pythagore » — "
            "Calculer une longueur dans un triangle rectangle ; réciproque. · "
            "Thèmes : Espace et géométrie · Leçons existantes : aucune"
        ),
        "output": {
            "lessons": [
                {
                    "title": "Vocabulaire du triangle rectangle et racine carrée",
                    "summary": "Hypoténuse et côtés de l'angle droit ; racine carrée d'un nombre positif pour préparer les calculs de longueurs.",
                    "notions": ["Hypoténuse", "Racine carrée"],
                },
                {
                    "title": "Le théorème de Pythagore",
                    "summary": "Énoncé du théorème et calcul de la longueur d'un côté d'un triangle rectangle.",
                    "notions": ["Théorème de Pythagore", "Calcul de longueur"],
                },
                {
                    "title": "Réciproque du théorème de Pythagore",
                    "summary": "Utiliser l'égalité de Pythagore pour prouver qu'un triangle est rectangle ou non.",
                    "notions": ["Réciproque de Pythagore"],
                },
            ]
        },
    },
]

# Réinjectée en réparation ; le service y ajoute l'erreur de validation concrète.
LESSONS_REPAIR_INSTRUCTION = (
    "Ta réponse précédente n'est pas un objet GeneratedLessons valide. Corrige-la en "
    "respectant EXACTEMENT le schéma (2 à 12 leçons, 1 à 6 notions par leçon). Réponds "
    "UNIQUEMENT par l'objet JSON corrigé, sans aucun texte ni balise. Erreur détectée : "
)


def build_lessons_prompt(
    subject: str,
    level: str,
    cycle: str,
    chapter: dict,
    program_version: str,
    existing_manual_lessons: list[str],
) -> tuple[str, str]:
    """Construit le couple `(system, prompt)` de la passe 2 (leçons d'un chapitre).

    `chapter` = cadrage du chapitre validé/manuel : {"name", "description", "themes"}
    (description et themes optionnels). `existing_manual_lessons` = intitulés des leçons
    conservées (manuelles ou déjà validées) injectés avec la consigne « complète sans
    dupliquer » (ADR-0009 §3).
    """
    blocks: list[str] = []
    for shot in LESSONS_FEW_SHOTS:
        blocks.append(
            "EXEMPLE\n"
            f"Contexte : {shot['context']}\n"
            "Leçons attendues :\n"
            f"{json.dumps(shot['output'], ensure_ascii=False, indent=2)}"
        )

    chapter_line = f"Chapitre : « {chapter['name']} »"
    if chapter.get("description"):
        chapter_line += f" — {chapter['description']}"
    themes = chapter.get("themes") or []
    existing = (
        "\n".join(f"- {title}" for title in existing_manual_lessons)
        if existing_manual_lessons
        else "aucune"
    )

    target = [
        "À TOI MAINTENANT",
        f"Matière : {subject}",
        f"Niveau : {level} · Cycle : {cycle}",
        f"Version du programme : {program_version}"
        + (" (BO du 30 juillet 2020)" if program_version == "2020" else ""),
        chapter_line,
    ]
    if themes:
        target.append(f"Thèmes du programme : {', '.join(themes)}")
    target += [
        "Leçons existantes (à ne JAMAIS dupliquer, complète autour) :",
        existing,
        "Leçons de ce chapitre pour ce niveau (objet JSON uniquement) :",
    ]
    blocks.append("\n".join(target))

    return SYSTEM_PROMPT_LESSONS, "\n\n".join(blocks)
