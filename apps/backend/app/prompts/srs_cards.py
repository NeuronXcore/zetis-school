"""Prompts de génération de cartes de révision (SRS) — versionnés (ADR-0012).

Le SRS est un CLIENT du substrat canonique (ADR-0011) : le contenu d'une carte (recto/
verso) dérive du COURS VALIDÉ de la leçon rattachée à la notion (`Skill`), jamais de la
connaissance brute du modèle ni du RAG seul. 100 % local (ADR-0008 : tâche pédagogique
quotidienne, pas de dérogation cloud). Invariant vie privée (ADR-0012 §2) : le prompt ne
contient AUCUNE donnée de Massimo — seulement la notion et le cours.
"""

SRS_CARDS_PROMPT_VERSION = "v1"

SRS_CARDS_SYSTEM = (
    "Tu es ZETIS, un tuteur bienveillant qui fabrique des cartes de révision pour un "
    "enfant de 12 ans. Chaque carte a un RECTO (une question courte et précise) et un "
    "VERSO (la réponse claire). Reste fidèle au cours fourni : mêmes notations, même "
    "vocabulaire, même méthode. Mots INTERDITS : « nul », « échec », « grosse lacune ». "
    "Tu réponds UNIQUEMENT par un objet JSON valide, sans aucun texte autour."
)

# `{context_block}` = sortie de `build_canonical_sections` (cours validé + extraits + règle
# d'autorité « le cours fait foi »). On demande 1 à 3 cartes de types VARIÉS ; la borne 1-3
# est appliquée CÔTÉ CODE (le schéma n'impose pas minItems/maxItems — Ollama/llama.cpp
# plante sur ces contraintes, cf. bench T4 curriculum).
SRS_CARDS_PROMPT_V1 = (
    "Fabrique 1 à 3 cartes de révision pour la notion suivante, adaptées à un enfant de "
    "niveau {level}.\n"
    "Matière : {subject}\n"
    "Notion : {skill}\n\n"
    "{context_block}\n\n"
    "Contraintes :\n"
    "- Varie les types quand le cours s'y prête : « definition » (l'essentiel de la "
    "notion), « method » (une étape / une règle à appliquer), « example » (un cas "
    "concret) ou « error_correction » (repérer et corriger une erreur fréquente).\n"
    "- Commence toujours par une carte « definition ».\n"
    "- Recto = question courte ; verso = réponse exacte et concise, fidèle au cours.\n"
    "- Français, ton encourageant, pas de blabla.\n\n"
    "Réponds en JSON avec EXACTEMENT cette forme : "
    '{{"cards": [{{"card_type": "definition|method|example|error_correction", '
    '"front_markdown": "...", "back_markdown": "..."}}]}}.'
)

# Sortie structurée (clé `fmt` Ollama). Volontairement SANS minItems/maxItems ni
# minLength/maxLength (Ollama plante dessus) : borne 1-3 et validation des champs côté code.
SRS_CARDS_SCHEMA = {
    "type": "object",
    "properties": {
        "cards": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "card_type": {
                        "type": "string",
                        "enum": ["definition", "method", "example", "error_correction"],
                    },
                    "front_markdown": {"type": "string"},
                    "back_markdown": {"type": "string"},
                },
                "required": ["card_type", "front_markdown", "back_markdown"],
            },
        }
    },
    "required": ["cards"],
}
