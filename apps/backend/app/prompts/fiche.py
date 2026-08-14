"""Prompt versionné de génération d'une fiche de révision (`FicheSpec`, ADR-0015).

Module **pur** : aucune dépendance runtime (pas de DB, pas de provider). Il expose le rôle
système, un exemple few-shot et `build_prompt` qui produit le couple `(system, prompt)` attendu
par `LLMProvider.generate`. La validité JSON est garantie côté provider par la sortie structurée
ollama (`fmt`), la conformité dure par `FicheSpec` (Pydantic, `extra="forbid"` + budgets).

Invariant vie privée (ADR-0015 §3) : la fiche dérive du COURS canonique validé, JAMAIS de
données de Massimo. `build_prompt` ne reçoit que le contexte canonique (cours + extraits RAG) et
les métadonnées de leçon (matière/niveau/chapitre/titre) — aucun champ de l'enfant n'y entre.

Règle CLAUDE.md : un prompt IA vit ici, jamais dans un composant.
"""

import json

from app.modules.fiches.schemas import (
    MAX_DEFINITIONS,
    MAX_ERREURS,
    MAX_POINTS_CLES,
)

# v2 (2026-08-14, ADR-0055) : `mnemonique` entre au `FicheSpec`, donc au schéma qui part au modèle
# — et il ne pouvait PAS y entrer seul. Le §10 de l'addendum ADR-0015 exige trois garde-fous, dont
# deux vivent ici : la consigne explicite (« que s'il y a une liste ou un ordre arbitraire »), et
# **au moins un few-shot où le champ est nul**.
#
# 🔴 **Le few-shot unique ci-dessous omet `mnemonique` VOLONTAIREMENT.** Ne pas « compléter »
# l'exemple : c'est lui qui enseigne au modèle que l'absence est le cas normal, pendant que le
# schéma JSON lui enseigne la forme. Un modèle qui voit un champ se croit tenu de le remplir —
# et produirait des acronymes forcés sur peut-être 4 leçons sur 5.
FICHE_PROMPT_VERSION = "v2"

SYSTEM_PROMPT = (
    "Tu es ZETIS, un concepteur de fiches de révision pour un enfant d'environ 12 ans. À partir "
    "d'un COURS validé, tu produis UNE fiche de révision d'UNE seule leçon : dense, claire, tenant "
    "sur une page.\n\n"
    "RÈGLES DE SORTIE (impératif) :\n"
    "- Réponds UNIQUEMENT par un objet JSON valide conforme au schéma ci-dessous.\n"
    "- Aucun texte avant ou après, aucune explication, aucun commentaire, PAS de balises ```.\n\n"
    "SCHÉMA :\n"
    "{\n"
    '  "title": str, "subject": str, "level": str, "chapter": str (optionnel),\n'
    '  "essentiel": str (2 à 3 phrases : l\'idée centrale de la leçon),\n'
    f'  "definitions": [ {{"terme": str, "definition": str}} ]  (0 à {MAX_DEFINITIONS}),\n'
    f'  "points_cles": [ str ]        (0 à {MAX_POINTS_CLES}, chacun très court),\n'
    f'  "erreurs_a_eviter": [ str ]   (0 à {MAX_ERREURS}, chacune très courte),\n'
    '  "mini_exemple": str (optionnel : UN exemple concret, court),\n'
    '  "mnemonique": {"moyen": str, "sert_a": str} (optionnel, SOUVENT ABSENT)\n'
    "}\n\n"
    "CONTRAINTES DE CONTENU :\n"
    "- Le COURS VALIDÉ fait foi : n'invente rien qu'il ne contienne (mêmes notations, mêmes "
    "définitions). Résume et hiérarchise, n'ajoute pas de notion hors cours.\n"
    "- Français simple, phrases courtes, adaptées à ~12 ans.\n"
    "- `essentiel` : 2 à 3 phrases MAXIMUM, l'idée centrale à retenir.\n"
    f"- `definitions` : au plus {MAX_DEFINITIONS} termes clés, définis en une phrase.\n"
    f"- `points_cles` : au plus {MAX_POINTS_CLES} puces, chacune ≤ 12 mots.\n"
    f"- `erreurs_a_eviter` : au plus {MAX_ERREURS} pièges fréquents, formulés positivement.\n"
    "- `mini_exemple` : facultatif, UN exemple concret résolu en une ou deux phrases.\n"
    "- `mnemonique` : n'en propose un QUE s'il y a une LISTE ou un ORDRE ARBITRAIRE à retenir "
    "(les conjonctions de coordination, l'ordre des planètes). Sur un concept, il n'y en a pas : "
    "LAISSE LE CHAMP ABSENT. L'absence est le cas normal et attendu — un mnémonique forcé est "
    "plus dur à retenir que la chose elle-même. `moyen` et `sert_a` tiennent chacun sur UNE "
    "ligne.\n"
    "- Ton bienveillant : n'emploie JAMAIS « échec », « lacune », « nul », « faute ». Préfère "
    "« à consolider », « point de vigilance », « prochaine étape ».\n"
    "- Reste dans le périmètre d'UNE leçon : ne couvre pas tout le chapitre."
)

# Exemple few-shot en dict Python (jamais du JSON écrit à la main) — sérialisé au build. Ce spec
# DOIT rester valide au regard de `FicheSpec` (vérifié par test_fiche_service).
FEW_SHOTS: list[dict] = [
    {
        "title": "Les nombres relatifs",
        "subject": "Mathématiques",
        "level": "4e",
        "chapter": "Nombres relatifs",
        "essentiel": (
            "Un nombre relatif est un nombre précédé d'un signe + ou -. La droite graduée permet "
            "de les placer et de les comparer : plus on va vers la droite, plus le nombre est grand."
        ),
        "definitions": [
            {
                "terme": "Nombre relatif",
                "definition": "Un nombre positif, négatif ou nul, écrit avec son signe.",
            },
            {
                "terme": "Opposé",
                "definition": "Le même nombre avec le signe contraire (l'opposé de -3 est +3).",
            },
        ],
        "points_cles": [
            "Plus à droite sur la droite graduée = plus grand",
            "0 sépare les positifs des négatifs",
            "Deux opposés sont à la même distance de 0",
        ],
        "erreurs_a_eviter": [
            "Penser que -5 est plus grand que -1",
            "Oublier d'écrire le signe devant le nombre",
        ],
        "mini_exemple": "Comparer -3 et 2 : -3 est à gauche de 2 sur la droite, donc -3 < 2.",
    }
]

# Réinjectée en réparation ; le service y ajoute l'erreur de validation concrète.
REPAIR_INSTRUCTION = (
    "Ta réponse précédente n'est pas une FicheSpec valide. Corrige-la en respectant EXACTEMENT le "
    "schéma et les budgets (tailles de listes, longueurs). Réponds UNIQUEMENT par l'objet JSON "
    "corrigé, sans aucun texte ni balise. Erreur détectée : "
)


def _context_line(subject: str, level: str, chapter: str | None, title: str) -> str:
    parts = [f"Matière : {subject}", f"Niveau : {level}"]
    if chapter:
        parts.append(f"Chapitre : {chapter}")
    parts.append(f"Leçon : {title}")
    return " · ".join(parts)


def build_prompt(
    *,
    sections: str,
    subject: str,
    level: str,
    chapter: str | None,
    title: str,
) -> tuple[str, str]:
    """Construit le couple `(system, prompt)` pour `LLMProvider.generate`.

    `sections` = bloc de contexte canonique (`build_canonical_sections` : cours validé forcé +
    extraits RAG + règle « le cours fait foi »). Le few-shot est intégré avant la cible.
    """
    blocks: list[str] = [
        "EXEMPLE DE FICHE ATTENDUE :\n" + json.dumps(shot, ensure_ascii=False, indent=2)
        for shot in FEW_SHOTS
    ]

    target = [
        "À TOI MAINTENANT",
        _context_line(subject, level, chapter, title),
        "CONTEXTE (le cours validé fait foi) :",
        sections,
        "Produis la fiche de révision de CETTE leçon (objet JSON uniquement) :",
    ]
    blocks.append("\n\n".join(target))

    return SYSTEM_PROMPT, "\n\n".join(blocks)
