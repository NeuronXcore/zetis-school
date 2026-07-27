"""Prompt versionné de génération d'une carte mentale (`MindmapJson`, ADR-0016).

Module **pur** : aucune dépendance runtime (pas de DB, pas de provider). Il expose le rôle
système, un exemple few-shot et `build_prompt` qui produit le couple `(system, prompt)` attendu
par `LLMProvider.generate`. La validité JSON est garantie côté provider par la sortie structurée
ollama (`fmt`), la conformité dure par `MindmapJson` (Pydantic, `extra="forbid"` + intégrité de
l'arbre).

ARBRE STRICT (ADR-0016) : nœuds reliés par `parent` (None = racine, accrochée au centre). **Aucune
position** demandée au LLM — le placement est de la présentation (Slice B, client). Pas de liens
transverses (graphe) — follow-up.

Invariant vie privée (ADR-0011) : la carte dérive du COURS canonique validé, JAMAIS de données de
Massimo. `build_prompt` ne reçoit que le contexte canonique (cours + extraits RAG) et les
métadonnées de leçon — aucun champ de l'enfant n'y entre.

Règle CLAUDE.md : un prompt IA vit ici, jamais dans un composant.
"""

import json

from app.modules.mindmaps.schemas import MAX_NODES

MINDMAP_PROMPT_VERSION = "v1"

SYSTEM_PROMPT = (
    "Tu es ZETIS, un concepteur de cartes mentales (mindmaps) pour un enfant d'environ 12 ans. À "
    "partir d'un COURS validé, tu produis UNE carte mentale d'UNE seule leçon : une idée centrale, "
    "des branches principales, quelques exemples et les erreurs à éviter.\n\n"
    "RÈGLES DE SORTIE (impératif) :\n"
    "- Réponds UNIQUEMENT par un objet JSON valide conforme au schéma ci-dessous.\n"
    "- Aucun texte avant ou après, aucune explication, aucun commentaire, PAS de balises ```.\n\n"
    "SCHÉMA :\n"
    "{\n"
    '  "center": str (l\'idée centrale de la leçon, 2 à 5 mots),\n'
    '  "nodes": [ {"id": str, "label": str, "parent": str|null} ],\n'
    '  "required_nodes": [str] (ids des nœuds ESSENTIELS à retenir),\n'
    '  "optional_nodes": [str] (ids des nœuds de détail, facultatifs)\n'
    "}\n\n"
    "CONTRAINTES DE STRUCTURE (ARBRE STRICT) :\n"
    "- `parent = null` → branche de premier niveau, accrochée au centre. Sinon `parent` DOIT être "
    "l'`id` d'un autre nœud.\n"
    "- Chaque `id` est unique, court (ex: « photo », « racines »), sans espace.\n"
    "- AUCUN cycle : un nœud ne peut pas être son propre ancêtre.\n"
    "- N'invente PAS de coordonnées ni de position : tu décris seulement la structure.\n"
    "- Ne crée pas de liens transverses : chaque nœud a AU PLUS un parent.\n"
    f"- Au plus {MAX_NODES} nœuds ; vise 6 à 15 pour rester lisible.\n\n"
    "CONTRAINTES DE CONTENU :\n"
    "- Le COURS VALIDÉ fait foi : n'ajoute rien qu'il ne contienne (mêmes notations, mêmes "
    "définitions). Organise et hiérarchise, ne couvre pas tout le chapitre.\n"
    "- Français simple, labels courts (quelques mots), adaptés à ~12 ans.\n"
    "- Branches attendues : idée centrale, notions clés, un ou deux exemples, erreurs à éviter.\n"
    "- Ton bienveillant : n'emploie JAMAIS « échec », « lacune », « nul », « faute ». Préfère "
    "« à consolider », « point de vigilance »."
)

# Exemple few-shot en dict Python (jamais du JSON écrit à la main) — sérialisé au build. Ce spec
# DOIT rester valide au regard de `MindmapJson` (vérifié par test_mindmap_service).
FEW_SHOTS: list[dict] = [
    {
        "center": "Nutrition végétale",
        "nodes": [
            {"id": "eau", "label": "Eau", "parent": None},
            {"id": "racines", "label": "Absorbée par les racines", "parent": "eau"},
            {"id": "lumiere", "label": "Lumière", "parent": None},
            {"id": "energie", "label": "Source d'énergie", "parent": "lumiere"},
            {"id": "co2", "label": "Dioxyde de carbone", "parent": None},
            {"id": "feuilles", "label": "Capté par les feuilles", "parent": "co2"},
            {"id": "photo", "label": "Photosynthèse", "parent": None},
            {"id": "exemple", "label": "Feuille au soleil → sucre", "parent": "photo"},
            {"id": "erreur", "label": "La plante ne « mange » pas la terre", "parent": "photo"},
        ],
        "required_nodes": ["eau", "lumiere", "co2", "photo"],
        "optional_nodes": ["racines", "energie", "feuilles", "exemple", "erreur"],
    }
]

# Réinjectée en réparation ; le service y ajoute l'erreur de validation concrète.
REPAIR_INSTRUCTION = (
    "Ta réponse précédente n'est pas une MindmapJson valide. Corrige-la en respectant EXACTEMENT "
    "le schéma et l'intégrité de l'arbre (ids uniques, chaque `parent` = un id existant ou null, "
    "aucun cycle). Réponds UNIQUEMENT par l'objet JSON corrigé, sans texte ni balise. Erreur "
    "détectée : "
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
        "EXEMPLE DE CARTE ATTENDUE :\n" + json.dumps(shot, ensure_ascii=False, indent=2)
        for shot in FEW_SHOTS
    ]

    target = [
        "À TOI MAINTENANT",
        _context_line(subject, level, chapter, title),
        "CONTEXTE (le cours validé fait foi) :",
        sections,
        "Produis la carte mentale de CETTE leçon (objet JSON uniquement) :",
    ]
    blocks.append("\n\n".join(target))

    return SYSTEM_PROMPT, "\n\n".join(blocks)
