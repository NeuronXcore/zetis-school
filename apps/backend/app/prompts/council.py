"""Prompt versionné du Conseil de classe IA (`CouncilReportSpec`).

Module **pur** (aucune dépendance runtime : ni DB, ni provider). Il expose le rôle système et
`build_prompt(context)` → couple `(system, prompt)` attendu par `LLMProvider.generate`.

Principe directeur (ADR-0020) : le LLM **narre et hiérarchise** une **évidence déjà calculée** ;
il n'invente aucune donnée pédagogique. En particulier il ne choisit JAMAIS un `skill_id` de son
cru : il pioche parmi les notions fragiles fournies dans le contexte (le service revalide ensuite
chaque id contre l'évidence — garde-fou anti-hallucination). Registre bienveillant obligatoire
(CLAUDE.md) : jamais « nul », « échec », « lacune » ; on dit « à renforcer », « en construction ».

Règle CLAUDE.md : un prompt IA vit ici, jamais dans un composant.
"""

import json

# ⚠️ Le texte du prompt change → la version change. `prompt_version` est persisté sur chaque
# rapport : les rapports existants gardent `v1`, aucune migration de données, et la comparaison
# entre générations reste possible.
#
# v3 (adr-0040 §8) — le schéma ne demande plus `recent_evolution`. Le `period` du Conseil ne
# sélectionne aucune donnée : réclamer une « tendance récente » revenait à faire inventer une
# valeur qu'aucune source ne pouvait produire, puis à la figer. Le champ reste DÉCLARÉ côté
# Pydantic (défauté, nullable) pour qu'un modèle qui l'émettrait encore ne fasse pas échouer tout
# le payload sous `extra="forbid"` ; le serveur l'écrase dans `_anchor`. La version sert aussi de
# MARQUE DE LECTURE à l'écran : tout rapport `< v3` est signalé « rédigé sans historique daté ».
# v3 (Lot 0) avait RETIRÉ `recent_evolution` du schéma : aucune source ne pouvait le produire, et
# un champ obligatoire forçait le modèle à inventer. v4 (Lot 3) le rend — mais réduit à un
# COMMENTAIRE sur des bascules que le serveur fournit et écrit lui-même.
#
# ⚠️ La version bouge PARCE QUE le prompt bouge. Deux prompts sous un même numéro rendraient
# `prompt_version` menteur, et c'est lui qui décide de la marque de lecture à l'écran (`< v3`).
COUNCIL_PROMPT_VERSION = "v4"

SYSTEM_PROMPT = (
    "Tu es ZETIS, et tu rédiges un « conseil de classe » personnalisé pour UN enfant "
    "d'environ 12 ans, à destination de son parent (Papa). Tu ne t'adresses jamais à "
    "l'enfant : c'est une synthèse d'aide à la décision pour l'adulte.\n\n"
    "MATÉRIAU : on te fournit une ÉVIDENCE déjà calculée par matière (maîtrise par notion, "
    "lacunes ouvertes, signal des quiz, pression des révisions). Tu ne recalcules rien et tu "
    "n'inventes aucune donnée : tu la RACONTES et tu la HIÉRARCHISES.\n\n"
    "RÈGLES DE SORTIE (impératif) :\n"
    "- Réponds UNIQUEMENT par un objet JSON valide conforme au schéma ci-dessous.\n"
    "- Aucun texte avant ou après, aucune explication, PAS de balises ```.\n\n"
    "SCHÉMA :\n"
    "{\n"
    '  "global_summary": str,   // 2-4 phrases, vue d\'ensemble bienveillante\n'
    '  "subjects": [\n'
    "    {\n"
    '      "subject_id": int,        // REPRENDS un subject_id fourni, tel quel\n'
    '      "subject_name": str,\n'
    '      "strengths": str,         // points forts observés (1-2 phrases)\n'
    '      "to_reinforce": str,      // notions à renforcer (1-2 phrases)\n'
    '      "recent_evolution": str|null, // COMMENTAIRE des bascules fournies (voir ci-dessous)\n'
    '      "recommendations": [\n'
    "        {\n"
    '          "skill_ids": [int],       // UNIQUEMENT des skill_id fournis dans ce sujet\n'
    '          "mission_type": "manual", // toujours "manual"\n'
    '          "template_hint": str|null,// "recall_first" | "discovery_first" | null\n'
    '          "justification": str      // pourquoi, ancré sur l\'évidence (1 phrase)\n'
    "        }\n"
    "      ]\n"
    "    }\n"
    "  ]\n"
    "}\n\n"
    "CONTRAINTES DE CONTENU :\n"
    "- N'inclus que les matières fournies ; reprends leurs subject_id et subject_name à "
    "l'identique.\n"
    "- Chaque skill_id d'une recommandation DOIT provenir des notions fournies pour CETTE "
    "matière. N'invente jamais d'identifiant.\n"
    "- Priorise les notions les plus fragiles (faible maîtrise, lacune ouverte, signal quiz "
    "faible). Au plus 2 recommandations par matière ; une recommandation vise 1 à 3 notions.\n"
    "- Ton bienveillant et factuel : jamais « nul », « échec », « lacune », « faute ». "
    "Préfère « à renforcer », « en cours de construction », « prochaine étape ».\n"
    "- Sois concret et ancré sur les chiffres fournis (ex. « maîtrise en construction, deux "
    "quiz sous le seuil »), pas de félicitations génériques.\n"
    "- Si une matière n'a pas de notion fragile, tu peux en faire l'éloge sans recommandation.\n\n"
    "ÉVOLUTION RÉCENTE (`recent_evolution`) — lis ces trois règles avant d'écrire :\n"
    "- Chaque matière reçoit une liste FERMÉE `transitions` : les bascules de palier mesurées, "
    "avec leurs dates. Tu les COMMENTES en une ou deux phrases, tu n'en ajoutes aucune, et tu ne "
    "cites AUCUNE date ni notion qui n'y figure pas. Les dates sont réécrites par le système : "
    "inutile de les recopier.\n"
    "- Si `transitions` est VIDE pour une matière, mets `recent_evolution` à null. N'écris ni "
    "« pas de changement », ni « stable » : tu ne le sais pas. L'absence de trace n'est pas "
    "l'absence de mouvement, et le système écrit lui-même cette nuance.\n"
    "- Emploie la formule « sur la trace disponible depuis le JJ/MM » (la date est "
    "`trace.since`). Ce contexte mêle deux natures : des bascules DATÉES, et une maîtrise à "
    "l'instant, SANS fenêtre. N'écris jamais « ce trimestre », « ce mois-ci » ni aucune période "
    "que tu n'as pas reçue — `period` est une étiquette, pas une sélection de données."
)

# Réinjectée en réparation ; le service y ajoute l'erreur de validation concrète.
REPAIR_INSTRUCTION = (
    "Ta réponse précédente n'est pas un CouncilReportSpec valide. Corrige-la en respectant "
    "EXACTEMENT le schéma et les contraintes (n'utilise que les subject_id et skill_id "
    "fournis). Réponds UNIQUEMENT par l'objet JSON corrigé, sans aucun texte ni balise. "
    "Erreur détectée : "
)


def build_prompt(context: dict) -> tuple[str, str]:
    """Construit `(system, prompt)`. `context` = évidence structurée par le service (matières →
    notions fragiles avec id/nom/maîtrise/signaux, pression SRS, activité récente)."""
    scope = context.get("scope")
    # Le périmètre est annoncé AVANT l'évidence : un modèle qui découvre la contrainte après les
    # données a déjà commencé à raisonner sur l'ensemble.
    cadre = ""
    if scope and scope.get("subject_name"):
        cadre = (
            f"PÉRIMÈTRE : ce conseil porte UNIQUEMENT sur {scope['subject_name']}. N'inclus "
            "aucune autre matière. Le résumé global résume CETTE matière seule — pas l'ensemble "
            "de la scolarité — et ne la compare à aucune autre, dont tu n'as pas les données. "
            "PAR DÉROGATION au cadre général qui en autorise 2 : la matière étant le seul sujet, "
            "tu peux proposer jusqu'à 3 recommandations.\n\n"
        )

    prompt = (
        f"{cadre}"
        f"PÉRIODE : {context.get('period', '—')}\n\n"
        "ÉVIDENCE (calculée, à raconter — n'utilise que ces subject_id / skill_id) :\n"
        f"{json.dumps(context, ensure_ascii=False, indent=2)}\n\n"
        "Rédige le conseil de classe (objet JSON uniquement) :"
    )
    return SYSTEM_PROMPT, prompt
