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

COUNCIL_PROMPT_VERSION = "v1"

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
    '      "recent_evolution": str,  // tendance récente, qualitative (1 phrase)\n'
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
    "- Si une matière n'a pas de notion fragile, tu peux en faire l'éloge sans recommandation."
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
    prompt = (
        f"PÉRIODE : {context.get('period', '—')}\n\n"
        "ÉVIDENCE (calculée, à raconter — n'utilise que ces subject_id / skill_id) :\n"
        f"{json.dumps(context, ensure_ascii=False, indent=2)}\n\n"
        "Rédige le conseil de classe (objet JSON uniquement) :"
    )
    return SYSTEM_PROMPT, prompt
