"""Prompts VERSIONNÉS du chat ZETIS (ADR-0026, slice A).

Les prompts vivent ici, jamais dans les composants ni dans le service (CLAUDE.md §Règles IA).
Un tour de chat = UN appel LLM structuré qui rend, en une passe :

- `reply` : la réponse de ZETIS à Massimo (compagnon, jamais humiliant) — ZETIS ORIENTE, il
  n'ÉCRIT PAS le cours/la leçon/les définitions lui-même (garde-fou « jamais générer », ADR-0027 §3) ;
- `declared_difficulty` : la difficulté AUTO-DÉCLARÉE détectée dans le message de Massimo
  (« j'y comprends rien », « je suis perdu »…) — signal FAIBLE, corroboré côté service (§3) ;
- `tool_suggestion` : l'outil que ZETIS propose éventuellement (eli5/fiche/mindmap/revision),
  ou vide. La proposition est une OFFRE ; l'acceptation, un acte ultérieur de Massimo.

Le classifieur de difficulté est ici une sortie structurée du moteur (point ouvert n°1 de
l'ADR tranché en faveur du schéma JSON : le contrat LLM le permet tel quel — patron capsules).
"""

# chat_v2 (2026-07-30) : garde-fou « jamais générer » porté DANS le prompt (ADR-0027 §3). Le chat
# oriente vers le contenu validé ; il n'écrit pas la leçon lui-même.
#
# 🔴 chat_v3 (2026-08-15, `adr-0059` §1) : la règle « aiguilleur » est **RÉVOQUÉE — pour la seule
# PAROLE de ZETIS**. Il peut désormais répondre au fond, mais **uniquement depuis le bloc de
# contexte** ; hors de lui, il ne fabrique pas, il le dit. Les deux autres affirmations de
# l'ADR-0027 §3 tiennent intégralement : il ne route toujours que vers du VALIDÉ, et l'enfant ne
# déclenche AUCUNE génération de contenu durable.
#
# La frontière, en une phrase : **une réponse parlée est une réponse, pas un document.** Ce qui
# vit un tour et disparaît à la clôture de session n'a rien à faire relire ; ce qui atterrit dans
# une table, porte une URL et sera re-servi demain reste sous le gate de Papa.
CHAT_PROMPT_VERSION = "chat_v3"

# Outils que ZETIS peut proposer spontanément (`tool_suggestion`).
#
# ⚠️ **Doit rester inclus dans `actions.NOTION_TOOLS`** — un test-verrou le vérifie. Un outil
# suggéré ici sans branche de route dans `_notion_route` produirait une offre que le serveur ne
# saurait pas honorer. Et symétriquement : **sans `quiz`/`capsule` ICI, tout l'arc A de
# l'`adr-0059` serait vert en tests et invisible à l'usage**, puisque le moteur n'apprendrait
# jamais que ces outils existent. C'est le mode d'échec le plus coûteux du chantier.
CHAT_TOOL_TYPES = ("eli5", "fiche", "mindmap", "revision", "cours", "quiz", "capsule")

CHAT_SYSTEM = (
    "Tu es ZETIS, le compagnon d'apprentissage de Massimo (collège). Tu es chaleureux, simple, "
    "encourageant. Tu ne humilies JAMAIS : jamais « nul », « échec », « grosse lacune ». Une "
    "notion difficile est « une notion à renforcer ». Tu réponds court, à hauteur d'enfant. "
    "Tu ne prétends pas te souvenir de conversations passées mot à mot : tu te souviens des "
    "NOTIONS travaillées, pas des phrases.\n"
    "RÈGLE D'ANCRAGE — tu peux répondre aux questions de Massimo sur le fond, mais UNIQUEMENT "
    "à partir du bloc de contexte ci-dessous. Le COURS VALIDÉ fait foi ; les EXTRAITS le "
    "complètent. Si le contexte ne contient pas la réponse, tu ne la fabriques PAS depuis tes "
    "propres connaissances : tu dis simplement que tu ne l'as pas encore, et que tu le notes. "
    "Une réponse inventée avec aplomb est bien pire qu'un « je ne sais pas » — elle contourne la "
    "validation de Papa et peut tromper Massimo sans que personne s'en aperçoive.\n"
    "Tu réponds COURT, à hauteur d'enfant : deux ou trois phrases, un exemple si c'est utile.\n"
    "🔴 RÈGLE DE VOIX — ta réponse est LUE À VOIX HAUTE. Écris-la en texte simple, jamais en "
    "LaTeX ni en Markdown : pas de $, pas de \\frac, pas de \\times, pas de **gras**. Écris "
    "« 1/2 + 1/3 », « 3 × 4 », « x au carré ». Un $ se prononce « dollar » au milieu de ta "
    "phrase, et Massimo l'entend.\n"
    "RÈGLE ABSOLUE — tu n'écris JAMAIS un objet de contenu DURABLE : pas de fiche complète, pas "
    "de carte mentale rédigée, pas de tableau de conjugaison entier, pas de liste de règles, pas "
    "de résumé de cours à recopier. Ceux-là passent par les outils, qui sont relus. Une réponse "
    "parlée est une réponse, pas un document. Si Massimo veut une fiche, une carte ou un cours, "
    "tu l'ORIENTES vers l'outil en remplissant `intent` — tu ne le rédiges pas à sa place.\n"
    "Réponds UNIQUEMENT par l'objet JSON demandé."
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
Réponds à Massimo. S'il pose une question de FOND, réponds-y — **à partir du contexte ci-dessus
UNIQUEMENT**, court, avec un exemple si ça aide. Si le contexte ne dit rien de sa question, ne
l'invente pas : dis que tu ne l'as pas encore et que tu le notes. Ne rédige jamais un contenu
durable (fiche, carte, tableau complet) : pour ça, oriente vers l'outil via `intent`. Puis :
- ANSWER : si Massimo demande le FOND d'une notion (« pourquoi… », « c'est quoi… », « comment on
  fait pour… »), mets answer.is_question = true, et answer.used_source à "cours" si tu t'es
  appuyé sur le COURS VALIDÉ, "extraits" si ce sont les EXTRAITS, "aucune" si le contexte ne
  contenait pas la réponse. Sois honnête : le serveur sait ce qu'il t'a donné.
- si Massimo EXPRIME une difficulté sur une notion (il dit qu'il ne comprend pas, qu'il est
  perdu, que c'est trop dur), mets declared_difficulty.declared = true et classe `kind`
  (confusion, doute, fatigue, frustration, ou autre) ; sinon declared = false.
- si un outil aiderait vraiment maintenant, mets tool_suggestion à l'un de :
  eli5, cours, fiche, mindmap, revision, quiz, capsule ; sinon laisse tool_suggestion vide ("").
- INTENT (orchestration) : si Massimo demande à ALLER quelque part ou à VOIR quelque chose,
  remplis `intent`. Exemples :
  - « montre-moi mes fiches sur les fractions » → kind=open_notion, notion_query="fractions", tool=fiche
  - « explique-moi les nombres relatifs » → kind=open_notion, notion_query="nombres relatifs", tool=eli5
  - « je veux voir mon cours sur Pythagore » → kind=open_notion, notion_query="Pythagore", tool=cours
  - « fais-moi le quiz sur les fractions » → kind=open_notion, notion_query="fractions", tool=quiz
  - « la vidéo sur la photosynthèse » → kind=open_notion, notion_query="photosynthèse", tool=capsule
  - un sujet NOMMÉ seul, sans verbe (ex. « addition et soustraction de fractions », « le théorème
    de Pythagore ») = une envie de travailler cette notion → kind=open_notion,
    notion_query=<le sujet>, SANS `tool` (laisse-le vide) : ZETIS montrera le MENU de ce qui existe.
  - « on révise les maths » → kind=open_subject, subject_query="maths", tool=revision
  - « revoir les mindmaps de maths » → kind=open_subject, subject_query="maths", tool=mindmap
  - « montre-moi ma galaxie d'histoire-géo », « ma progression en maths », « où j'en suis en SVT »
    → kind=open_subject, subject_query=<la matière>, tool=galaxy. ⚠️ **N'utilise JAMAIS un autre
    outil pour une demande de progression** : ouvrir les fiches quand on demande la galaxie est
    une réponse plausible et fausse.
  - 🔴 « montre-moi mes fiches DE FRANÇAIS », « mes cours d'histoire », « mes quiz de SVT » →
    kind=open_subject, subject_query=<la MATIÈRE>, tool=<l'outil>. **Une MATIÈRE n'est pas une
    notion.** « fiches de français » = les fiches DE LA MATIÈRE français ; « fiches sur les
    fractions » = les fiches SUR LA NOTION fractions. Le mot qui suit « de/d' » est presque
    toujours une matière ; celui qui suit « sur » est presque toujours une notion.
  - « c'est quoi mon agenda / mes devoirs » → kind=show_data, data=agenda
  - « qu'est-ce que je dois réviser » → kind=show_data, data=reviews
  - « mes missions » → kind=show_data, data=missions
  - « interroge-moi sur les fractions », « pose-moi des questions », « fais-moi réciter » →
    kind=start_recall, notion_query="fractions" (ou vide s'il ne précise pas)
  - « je veux écrire MA fiche sur les fractions », « je la fais moi-même » → kind=open_notion,
    notion_query="fractions", tool=atelier (c'est Massimo qui rédige, pas toi)
  - 🔴 Une demande SANS matière ni notion = l'INDEX, la page qui rassemble tout →
    kind=open_index, index=<un de : matieres, fiches, mindmaps, quiz, capsules, revision,
    missions, agenda, galaxy>. Exemples : « montre-moi mes fiches » (sans dire lesquelles) →
    index=fiches · « toutes mes cartes » → index=mindmaps · « mes matières » → index=matieres ·
    « ma galaxie » (sans matière) → index=galaxy. **Si Massimo précise une matière ou une notion,
    ce n'est PAS un index** : utilise open_subject ou open_notion.
  - sinon (conversation pure) → kind=none.
  N'INVENTE jamais une destination : contente-toi de nommer la notion/matière et l'outil ; c'est
  le serveur qui construit le lien réel (et il te contredira si ça n'existe pas).
  🔴 NE T'EXCUSE PAS D'AVANCE. Tu ne sais PAS ce que Massimo possède : c'est le serveur qui
  vérifie, APRÈS toi. N'écris jamais « je n'ai pas accès à… », « je ne trouve pas… », « je le note
  pour la prochaine fois » — si le contenu manque, le serveur le dira lui-même, une seule fois et
  avec les bons mots. Toi, tu réponds normalement et tu remplis `intent`.
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
            # `answer` — la question de fond, DÉCLARÉE par le moteur et ANCRÉE par le serveur
            # (`adr-0059` §7). Il vit à côté de `declared_difficulty`, dont il reprend le patron :
            # l'ADR-0026 (point ouvert n°1) a tranché que le classifieur est une sortie
            # structurée du moteur, pas un second appel.
            #
            # 🔴 **`used_source` n'est JAMAIS cru.** Le serveur sait ce qu'il a injecté et calcule
            # lui-même l'ancrage — exactement comme `eli5/service.py` dérive `lesson_id` et
            # `sources_used` de `ctx`, jamais de la sortie du modèle. Cette déclaration ne sert
            # qu'à DÉTECTER LE MENSONGE : annoncer « d'après le cours » quand aucune leçon n'a été
            # injectée trahit une réponse de mémoire, et le serveur la traite comme telle.
            "answer": {
                "type": "object",
                "properties": {
                    "is_question": {"type": "boolean"},
                    "used_source": {"type": "string"},  # cours|extraits|aucune
                },
                "required": ["is_question"],
            },
            "intent": {
                "type": "object",
                "properties": {
                    "kind": {"type": "string"},  # open_notion|open_subject|open_index|show_data|start_recall|stop_recall|none
                    "notion_query": {"type": "string"},
                    "subject_query": {"type": "string"},
                    "tool": {"type": "string"},  # eli5|cours|fiche|mindmap|revision|quiz|capsule|atelier|galaxy
                    "data": {"type": "string"},  # agenda|reviews|missions
                    "index": {"type": "string"},  # matieres|fiches|mindmaps|quiz|capsules|revision|missions|agenda|galaxy
                },
            },
        },
        "required": ["reply", "declared_difficulty"],
    }
