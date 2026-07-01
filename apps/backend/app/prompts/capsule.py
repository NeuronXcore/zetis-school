"""Prompt versionné de génération d'une capsule (`CapsuleSpec`).

Module **pur** : aucune dépendance runtime (pas de DB, pas de provider). Il expose le rôle
système, des exemples few-shot (qualité pédagogique) et `build_prompt` qui produit le couple
`(system, prompt)` attendu par `LLMProvider.generate` (API réelle : deux chaînes, pas de liste
de messages multi-tour). La validité JSON est garantie côté provider par la sortie structurée
ollama (`fmt`), et la conformité dure par `CapsuleSpec` (Pydantic). Cf. ADR-0007.

Règle CLAUDE.md : un prompt IA vit ici, jamais dans un composant.
"""

import json

CAPSULE_PROMPT_VERSION = "v3"

# Consignes optionnelles choisies par Papa au moment de la génération.
VISUAL_HINTS = {
    "numberline": "Contrainte visuelle : inclus une scène 'numberline' (droite graduée) pertinente.",
    "barmodel": "Contrainte visuelle : inclus une scène 'barmodel' (barre de fractions/proportions).",
}
DURATION_HINTS = {
    "courte": "Durée : capsule COURTE — 4 scènes, durées proches de 75 frames.",
    "moyenne": "Durée : capsule de durée MOYENNE — 5 scènes.",
    "longue": "Durée : capsule LONGUE et détaillée — 6 à 7 scènes.",
}

SYSTEM_PROMPT = (
    "Tu es ZETIS, un concepteur de capsules pédagogiques vidéo pour un enfant d'environ "
    "12 ans. À partir d'une instruction, tu produis UNE capsule courte, claire et "
    "bienveillante.\n\n"
    "RÈGLES DE SORTIE (impératif) :\n"
    "- Réponds UNIQUEMENT par un objet JSON valide conforme au schéma ci-dessous.\n"
    "- Aucun texte avant ou après, aucune explication, aucun commentaire, PAS de balises "
    "```.\n\n"
    "SCHÉMA :\n"
    "{\n"
    '  "title": str, "subject": str, "skill": str (optionnel), "level": str,\n'
    '  "fps": 30, "width": 1280, "height": 720,\n'
    '  "scenes": [ 4 à 7 scènes ]\n'
    "}\n"
    "Chaque scène a un champ \"kind\", un champ \"durationInFrames\" (entier) et un champ "
    "\"narration\" (texte parlé, voir contraintes). Types de scène :\n"
    '- {"kind":"title","title":str,"subtitle":str?,"durationInFrames":int}\n'
    '- {"kind":"bullet","heading":str,"points":[str,...],"durationInFrames":int}\n'
    '- {"kind":"definition","term":str,"body":str,"example":str?,"durationInFrames":int}\n'
    '- {"kind":"numberline","min":int,"max":int,'
    '"marks":[{"value":int,"label":str?,"color":str?}],"durationInFrames":int}\n'
    '- {"kind":"barmodel","heading":str?,"parts":int,"filled":int,"caption":str?,'
    '"durationInFrames":int}\n\n'
    "CONTRAINTES DE CONTENU :\n"
    "- Français simple, phrases courtes, adaptées à ~12 ans.\n"
    "- fps = 30, width = 1280, height = 720 (valeurs fixes).\n"
    "- Entre 4 et 7 scènes ; la PREMIÈRE scène est de kind 'title'.\n"
    "- durationInFrames entre 60 et 180 pour chaque scène.\n"
    "- bullet : 2 à 4 points, chacun ≤ 8 mots.\n"
    "- numberline : uniquement pour les nombres relatifs, la comparaison ou une droite "
    "graduée ; min < max ; marques à valeurs entières.\n"
    "- barmodel : pour les fractions, proportions ou pourcentages ; 2 ≤ parts ≤ 12 ; "
    "0 ≤ filled ≤ parts (ex. 3/4 → parts=4, filled=3).\n"
    "- color : code hexadécimal optionnel (ex. \"#ef4444\").\n"
    "- Ton bienveillant : n'emploie JAMAIS « échec », « lacune », « nul », « faute ». "
    "Préfère « à consolider », « prochaine étape ».\n"
    "- narration : pour CHAQUE scène, écris une phrase parlée (1 à 2 phrases), naturelle et "
    "fluide à l'oral, qui explique la scène — distincte du texte affiché (souvent plus condensé "
    "à l'écran). Ne lis pas les puces mot à mot ; raconte-les. Ne remplis JAMAIS le champ "
    "\"audioUrl\".\n"
    "- La DERNIÈRE scène est un bref encouragement."
)

# Exemples few-shot stockés en dicts Python (jamais du JSON écrit à la main) — sérialisés au
# moment du build. Chaque `spec` DOIT rester valide au regard de `CapsuleSpec` (garanti par
# test_capsule_prompt). Deux registres : (a) maths avec numberline, (b) SVT sans numberline
# (apprend au modèle que numberline est optionnel).
FEW_SHOTS: list[dict] = [
    {
        "instruction": "Explique les nombres relatifs, avec la droite graduée.",
        "subject": "Mathématiques",
        "level": "4e",
        "skill": "Nombres relatifs",
        "spec": {
            "title": "Les nombres relatifs",
            "subject": "Mathématiques",
            "skill": "Nombres relatifs",
            "level": "4e",
            "fps": 30,
            "width": 1280,
            "height": 720,
            "scenes": [
                {
                    "kind": "title",
                    "title": "Les nombres relatifs",
                    "subtitle": "Positifs, négatifs et zéro",
                    "narration": "Bienvenue ! Aujourd'hui, on découvre les nombres relatifs : les positifs, les négatifs, et le zéro.",
                    "durationInFrames": 90,
                },
                {
                    "kind": "definition",
                    "term": "Nombre relatif",
                    "body": "Un nombre qui peut être positif, négatif ou nul.",
                    "example": "+3, 0 et -4 sont des nombres relatifs.",
                    "narration": "Un nombre relatif, c'est un nombre qui peut être positif, négatif, ou bien nul.",
                    "durationInFrames": 150,
                },
                {
                    "kind": "numberline",
                    "min": -5,
                    "max": 5,
                    "marks": [
                        {"value": -4, "label": "-4", "color": "#ef4444"},
                        {"value": 0, "label": "0"},
                        {"value": 3, "label": "+3", "color": "#22c55e"},
                    ],
                    "narration": "Sur la droite graduée, chaque nombre a sa place. Plus on va vers la droite, plus le nombre est grand.",
                    "durationInFrames": 150,
                },
                {
                    "kind": "bullet",
                    "heading": "Comparer les relatifs",
                    "points": [
                        "Plus à droite = plus grand",
                        "-2 est plus grand que -5",
                        "0 sépare positifs et négatifs",
                    ],
                    "narration": "Pour comparer deux relatifs, celui qui est le plus à droite est le plus grand. Et le zéro sépare les positifs des négatifs.",
                    "durationInFrames": 120,
                },
                {
                    "kind": "title",
                    "title": "Bien joué !",
                    "subtitle": "Tu sais placer les relatifs",
                    "narration": "Bien joué ! Tu sais maintenant placer les nombres relatifs.",
                    "durationInFrames": 75,
                },
            ],
        },
    },
    {
        "instruction": "Explique comment les plantes se nourrissent.",
        "subject": "SVT",
        "level": "5e",
        "skill": "Nutrition des plantes",
        "spec": {
            "title": "La nutrition des plantes",
            "subject": "SVT",
            "skill": "Nutrition des plantes",
            "level": "5e",
            "fps": 30,
            "width": 1280,
            "height": 720,
            "scenes": [
                {
                    "kind": "title",
                    "title": "La nutrition des plantes",
                    "subtitle": "Comment se nourrissent-elles ?",
                    "narration": "Aujourd'hui, on va comprendre comment les plantes se nourrissent.",
                    "durationInFrames": 90,
                },
                {
                    "kind": "definition",
                    "term": "Photosynthèse",
                    "body": "La plante fabrique sa nourriture grâce à la lumière.",
                    "example": "Les feuilles captent la lumière du soleil.",
                    "narration": "Grâce à la photosynthèse, la plante fabrique elle-même sa nourriture en captant la lumière du soleil.",
                    "durationInFrames": 150,
                },
                {
                    "kind": "bullet",
                    "heading": "Ce qu'il faut à la plante",
                    "points": [
                        "De la lumière",
                        "De l'eau",
                        "Du dioxyde de carbone",
                        "Des sels minéraux",
                    ],
                    "narration": "Pour cela, il lui faut de la lumière, de l'eau, du dioxyde de carbone, et des sels minéraux.",
                    "durationInFrames": 120,
                },
                {
                    "kind": "definition",
                    "term": "Sels minéraux",
                    "body": "Des éléments puisés dans le sol par les racines.",
                    "narration": "Les sels minéraux, ce sont de petits éléments que les racines puisent dans le sol.",
                    "durationInFrames": 120,
                },
                {
                    "kind": "title",
                    "title": "Bravo !",
                    "subtitle": "Tu sais comment la plante se nourrit",
                    "narration": "Bravo ! Tu sais maintenant comment une plante se nourrit.",
                    "durationInFrames": 75,
                },
            ],
        },
    },
    {
        "instruction": "Explique les fractions avec une barre.",
        "subject": "Mathématiques",
        "level": "6e",
        "skill": "Fractions",
        "spec": {
            "title": "Les fractions",
            "subject": "Mathématiques",
            "skill": "Fractions",
            "level": "6e",
            "fps": 30,
            "width": 1280,
            "height": 720,
            "scenes": [
                {
                    "kind": "title",
                    "title": "Les fractions",
                    "subtitle": "Une part d'un tout",
                    "narration": "On va découvrir les fractions : une part d'un tout.",
                    "durationInFrames": 90,
                },
                {
                    "kind": "definition",
                    "term": "Fraction",
                    "body": "Un nombre qui décrit une part d'un tout.",
                    "example": "3/4 = trois parts sur quatre.",
                    "narration": "Une fraction décrit une part d'un tout. Par exemple, trois quarts, c'est trois parts sur quatre.",
                    "durationInFrames": 150,
                },
                {
                    "kind": "barmodel",
                    "heading": "Trois quarts",
                    "parts": 4,
                    "filled": 3,
                    "caption": "3 parts sur 4, soit 75 %.",
                    "narration": "Regarde cette barre partagée en quatre : trois parts sont coloriées, ça fait trois quarts, soit soixante-quinze pour cent.",
                    "durationInFrames": 150,
                },
                {
                    "kind": "bullet",
                    "heading": "Lire une fraction",
                    "points": [
                        "Le bas = nombre de parts",
                        "Le haut = parts prises",
                        "Plus le haut est grand, plus c'est grand",
                    ],
                    "narration": "Le nombre du bas indique en combien de parts on partage, et celui du haut, combien de parts on prend.",
                    "durationInFrames": 120,
                },
                {
                    "kind": "title",
                    "title": "Bravo !",
                    "subtitle": "Tu sais lire une fraction",
                    "narration": "Bravo ! Tu sais maintenant lire une fraction.",
                    "durationInFrames": 75,
                },
            ],
        },
    },
]

# Réinjectée en réparation ; le service y ajoute l'erreur de validation concrète.
REPAIR_INSTRUCTION = (
    "Ta réponse précédente n'est pas un CapsuleSpec valide. Corrige-la en respectant "
    "EXACTEMENT le schéma et les contraintes. Réponds UNIQUEMENT par l'objet JSON corrigé, "
    "sans aucun texte ni balise. Erreur détectée : "
)


def _context_line(subject: str, level: str, skill: str | None) -> str:
    parts = [f"Matière : {subject}", f"Niveau : {level}"]
    if skill:
        parts.append(f"Notion : {skill}")
    return " · ".join(parts)


def build_prompt(
    instruction: str,
    subject: str,
    level: str,
    skill: str | None = None,
    visual: str = "auto",
    duration: str = "moyenne",
) -> tuple[str, str]:
    """Construit le couple `(system, prompt)` pour `LLMProvider.generate`.

    Le few-shot est intégré dans la chaîne `prompt`, juste avant l'instruction cible. Les
    exemples sont sérialisés avec `json.dumps(..., ensure_ascii=False, indent=2)` : JSON
    valide + accents UTF-8 réels, exactement le format attendu en sortie. `visual` et
    `duration` (choix Papa) ajoutent des consignes ciblées ; « auto » n'ajoute rien.
    """
    blocks: list[str] = []
    for shot in FEW_SHOTS:
        blocks.append(
            f"EXEMPLE\nInstruction : {shot['instruction']}\n"
            f"Contexte : {_context_line(shot['subject'], shot['level'], shot.get('skill'))}\n"
            "Capsule attendue :\n"
            f"{json.dumps(shot['spec'], ensure_ascii=False, indent=2)}"
        )

    target = [
        "À TOI MAINTENANT",
        f"Instruction : {instruction}",
        f"Contexte : {_context_line(subject, level, skill)}",
    ]
    if visual in VISUAL_HINTS:
        target.append(VISUAL_HINTS[visual])
    if duration in DURATION_HINTS:
        target.append(DURATION_HINTS[duration])
    target.append("Capsule attendue (objet JSON uniquement) :")
    blocks.append("\n".join(target))

    return SYSTEM_PROMPT, "\n\n".join(blocks)
