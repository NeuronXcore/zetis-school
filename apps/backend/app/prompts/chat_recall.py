"""Interrogation orale de ZETIS (ADR-0059 §10, §11) — prompt versionné, à part de `chat.py`.

Un fichier distinct parce que c'est une **tâche différente** : autre schéma de sortie, autres
garde-fous, autre cycle de vie. `chat.py` porte déjà deux prompts ; y en ajouter un troisième,
dont le seul point commun est de parler à Massimo, les rendrait tous plus difficiles à faire
évoluer séparément.

## Ce que ce prompt ne décide PAS

Le nombre de questions, le moment d'arrêter, la valeur du verdict quand elle est inconnue : **tout
cela est tranché côté serveur**. Un modèle qui décide quand cesser d'interroger ne cesse pas, et
un vocabulaire de verdict laissé libre finit par contenir « faux ».
"""

RECALL_PROMPT_VERSION = "recall_v1"

# Vocabulaire FERMÉ des verdicts. 🔴 **Aucune valeur n'est binaire, et il n'existe pas de
# « faux ».** Une valeur hors liste retombe sur `a_reformuler` côté service : le doute profite à
# l'enfant PAR CONSTRUCTION, pas par bonne volonté du moteur.
RECALL_VERDICTS = ("ok", "partiel", "a_revoir", "a_reformuler")

RECALL_SYSTEM = (
    "Tu es ZETIS, et tu fais réciter Massimo (collège) à l'oral, gentiment. Tu poses UNE question "
    "à la fois, courte, sur le cours ci-dessous — jamais sur autre chose.\n"
    "🔴 RÈGLE DE DICTÉE — la réponse de Massimo a été DICTÉE puis transcrite automatiquement. Les "
    "homophones, les accents manquants, les mots tronqués, la ponctuation absente et les petites "
    "fautes sont des ARTEFACTS DE TRANSCRIPTION, jamais des erreurs de Massimo. Si la réponse est "
    "proche du sens attendu, elle est JUSTE. Si tu ne peux pas trancher, rends `a_reformuler` — "
    "jamais `a_revoir`.\n"
    "🔴 RÈGLE DE CORRECTION — quand tu rends `a_revoir`, tu REDONNES l'information correcte, tirée "
    "du cours, dans ton `feedback`. Dire « pas tout à fait » sans donner la réponse est une "
    "évaluation, pas un apprentissage.\n"
    "Tu n'humilies JAMAIS : jamais « nul », « échec », « faux », « erreur ». Une notion difficile "
    "est « une notion à renforcer ». Tu encourages à chaque tour.\n"
    "Tes questions et tes corrections viennent UNIQUEMENT du cours fourni. S'il ne dit rien sur un "
    "point, tu ne l'inventes pas.\n"
    "Réponds UNIQUEMENT par l'objet JSON demandé."
)

# `{context_block}` = cours canonique + extraits (composé serveur, déjà borné).
# `{previous}` = la question posée et la réponse de Massimo, ou la marque d'ouverture.
# `{closing}` = consigne de clôture quand le SERVEUR a décidé que c'était la dernière.
RECALL_TURN_PROMPT = """{context_block}

## NOTION INTERROGÉE
{skill_name}

## TOUR PRÉCÉDENT
{previous}

## TA RÉPONSE
{closing}
- `verdict` : si un tour précédent est donné, juge la réponse de Massimo — ok | partiel |
  a_revoir | a_reformuler. Rappelle-toi la RÈGLE DE DICTÉE : dans le doute, `a_reformuler`.
  À l'ouverture (pas de tour précédent), laisse `verdict` vide ("").
- `feedback` : ce que tu DIS à Massimo, à voix haute, court et chaleureux. Sur `ok`, confirme et
  reformule brièvement pour consolider. Sur `partiel`, dis ce qui manque. Sur `a_revoir`, donne
  la bonne réponse depuis le cours. Sur `a_reformuler`, demande-lui de redire autrement.
- `next_question` : la question suivante, courte, sur le cours. Laisse-la vide ("") si on te dit
  que c'était la dernière.
"""

_CLOSING_CONTINUE = "Ce n'est PAS la dernière question : pose-en une nouvelle."
_CLOSING_LAST = (
    "🔴 C'ÉTAIT LA DERNIÈRE QUESTION. Ne pose plus de question : laisse `next_question` VIDE, et "
    "termine par un encouragement court sur ce qui a été travaillé."
)


def recall_turn_prompt(
    *, context_block: str, skill_name: str, previous: str, last: bool
) -> str:
    """Assemble le tour d'interrogation. `last` est décidé par le SERVEUR, jamais par le moteur."""
    return RECALL_TURN_PROMPT.format(
        context_block=context_block or "(pas de cours fourni)",
        skill_name=skill_name,
        previous=previous or "(première question — rien à évaluer)",
        closing=_CLOSING_LAST if last else _CLOSING_CONTINUE,
    )


def recall_turn_schema() -> dict:
    """Schéma JSON d'un tour d'interrogation.

    Sobre volontairement : pas de `minLength`/`maxLength` (certains moteurs locaux plantent
    dessus, cf. TROUBLESHOOTING), pas d'`enum` sur `verdict` — la valeur est validée côté service
    contre `RECALL_VERDICTS`, ce qui est plus robuste sur les petits moteurs ET permet la règle
    « valeur inconnue ⇒ `a_reformuler` ».

    ⚠️ Porte `declared_difficulty` ? **Non** — et c'est ce qui le distingue du tour de chat dans
    l'aiguillage du faux moteur des tests. Deux schémas qui se ressemblent trop deviennent
    indiscernables ; c'est ce qui s'est produit le 2026-08-15 avec la propriété `answer`.
    """
    return {
        "type": "object",
        "properties": {
            "verdict": {"type": "string"},  # ok|partiel|a_revoir|a_reformuler ("" à l'ouverture)
            "feedback": {"type": "string"},
            "next_question": {"type": "string"},
        },
        "required": ["feedback"],
    }
