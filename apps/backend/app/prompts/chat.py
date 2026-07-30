"""Prompts VERSIONNÉS du chat ZETIS (ADR-0026, slice A).

Les prompts vivent ici, jamais dans les composants ni dans le service (CLAUDE.md §Règles IA).
Un tour de chat = UN appel LLM structuré qui rend, en une passe :

- `reply` : la réponse de ZETIS à Massimo (ton compagnon, pédagogique, jamais humiliant) ;
- `declared_difficulty` : la difficulté AUTO-DÉCLARÉE détectée dans le message de Massimo
  (« j'y comprends rien », « je suis perdu »…) — signal FAIBLE, corroboré côté service (§3) ;
- `tool_suggestion` : l'outil que ZETIS propose éventuellement (eli5/fiche/mindmap/revision),
  ou vide. La proposition est une OFFRE ; l'acceptation, un acte ultérieur de Massimo.

Le classifieur de difficulté est ici une sortie structurée du moteur (point ouvert n°1 de
l'ADR tranché en faveur du schéma JSON : le contrat LLM le permet tel quel — patron capsules).
"""

CHAT_PROMPT_VERSION = "chat_v1"

# Outils que ZETIS peut proposer (bornés — le routage réel est un lot ultérieur, hors slice A).
CHAT_TOOL_TYPES = ("eli5", "fiche", "mindmap", "revision")

CHAT_SYSTEM = (
    "Tu es ZETIS, le compagnon d'apprentissage de Massimo (collège). Tu es chaleureux, simple, "
    "encourageant. Tu ne humilies JAMAIS : jamais « nul », « échec », « grosse lacune ». Une "
    "notion difficile est « une notion à renforcer ». Tu réponds court, à hauteur d'enfant. "
    "Tu ne prétends pas te souvenir de conversations passées mot à mot : tu te souviens des "
    "NOTIONS travaillées, pas des phrases. Réponds UNIQUEMENT par l'objet JSON demandé."
)

# `{context_block}` = contexte composé serveur (rappel des notions récentes + cours canonique
# quand la notion est résolue), déjà borné au budget de tokens. `{history}` = derniers tours de
# la session (lus dans Redis). `{message}` = le message courant de Massimo.
CHAT_TURN_PROMPT = """{context_block}

## CONVERSATION EN COURS
{history}

## MESSAGE DE MASSIMO
{message}

## TA RÉPONSE
Réponds à Massimo. Puis :
- si Massimo EXPRIME une difficulté sur une notion (il dit qu'il ne comprend pas, qu'il est
  perdu, que c'est trop dur), mets declared_difficulty.declared = true et classe `kind`
  (confusion, doute, fatigue, frustration, ou autre) ; sinon declared = false.
- si un outil aiderait vraiment maintenant, mets tool_suggestion à l'un de :
  eli5, fiche, mindmap, revision ; sinon laisse tool_suggestion vide ("").
- INTENT (orchestration) : si Massimo demande à ALLER quelque part ou à VOIR quelque chose,
  remplis `intent`. Exemples :
  - « montre-moi mes fiches sur les fractions » → kind=open_notion, notion_query="fractions", tool=fiche
  - « explique-moi les nombres relatifs » → kind=open_notion, notion_query="nombres relatifs", tool=eli5
  - un sujet NOMMÉ seul, sans verbe (ex. « addition et soustraction de fractions », « le théorème
    de Pythagore ») = une envie de travailler cette notion → kind=open_notion,
    notion_query=<le sujet>, tool=eli5
  - « on révise les maths » → kind=open_subject, subject_query="maths", tool=revision
  - « c'est quoi mon agenda / mes devoirs » → kind=show_data, data=agenda
  - « qu'est-ce que je dois réviser » → kind=show_data, data=reviews
  - « mes missions » → kind=show_data, data=missions
  - sinon (conversation pure) → kind=none.
  N'INVENTE jamais une destination : contente-toi de nommer la notion/matière et l'outil ; c'est
  le serveur qui construit le lien réel (et il te contredira si ça n'existe pas).
"""


def chat_turn_schema() -> dict:
    """Schéma JSON de la sortie d'un tour (passé en `LLMRequest.fmt`, patron ollama `format`).

    Volontairement sobre : pas de `minLength`/`maxLength` (certains moteurs locaux plantent
    dessus, cf. TROUBLESHOOTING). `tool_suggestion` est une chaîne libre validée côté service
    contre `CHAT_TOOL_TYPES` (une valeur inconnue = pas de proposition), plutôt qu'un enum avec
    null — plus robuste sur les petits moteurs."""
    return {
        "type": "object",
        "properties": {
            "reply": {"type": "string"},
            "declared_difficulty": {
                "type": "object",
                "properties": {
                    "declared": {"type": "boolean"},
                    "kind": {"type": "string"},
                },
                "required": ["declared"],
            },
            "tool_suggestion": {"type": "string"},
            "intent": {
                "type": "object",
                "properties": {
                    "kind": {"type": "string"},  # open_notion|open_subject|show_data|none
                    "notion_query": {"type": "string"},
                    "subject_query": {"type": "string"},
                    "tool": {"type": "string"},  # eli5|fiche|mindmap|cours|revision
                    "data": {"type": "string"},  # agenda|reviews|missions
                },
            },
        },
        "required": ["reply", "declared_difficulty"],
    }
