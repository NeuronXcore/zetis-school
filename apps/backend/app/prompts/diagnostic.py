"""Prompts diagnostic versionnés (CLAUDE.md : prompts versionnés, jamais en dur dans le service).

Le diagnostic génère des QCM par notion pour situer le niveau de l'enfant, sans
jamais le dévaloriser. La sortie est strictement du JSON (parsée par le service)."""

PROMPT_VERSION = "v1"

DIAGNOSTIC_SYSTEM = (
    "Tu es ZETIS, un concepteur de questions de diagnostic pour un enfant de 12 ans. "
    "Tu crées des QCM courts, clairs et bienveillants pour situer son niveau. "
    "Jamais de question piège ni de formulation humiliante. "
    "Tu réponds UNIQUEMENT par un objet JSON valide, sans aucun texte autour."
)

# {n} questions à choix multiple pour UNE notion. Index 0-based de la bonne réponse.
DIAGNOSTIC_GEN_PROMPT_V1 = (
    "Génère {n} questions à choix multiple pour évaluer la notion suivante.\n"
    "Matière : {subject}\n"
    "Notion : {skill}\n"
    "Niveau : {level}\n\n"
    "Chaque question a EXACTEMENT 4 propositions, une seule correcte.\n"
    "Réponds en JSON avec EXACTEMENT cette forme (valeurs en français) :\n"
    '{{"questions": [{{"prompt": "...", "choices": ["...", "...", "...", "..."], '
    '"correct_index": 0, "explanation": "..."}}]}}'
)
