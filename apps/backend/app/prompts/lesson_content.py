"""Prompt versionné de la rédaction du cours d'une leçon (module pur, sans dépendance).

Moteur LOCAL (`get_provider`, Ollama qwen3.6) — ce n'est PAS une tâche `curriculum_*` :
la dérogation cloud de l'ADR-0009 reste bornée au référentiel. Le factuel vient du
référentiel déjà validé (chapitre, leçon, notions en entrée) ; la rédaction pédagogique
est le point fort documenté du modèle local (bench T1-T3, ADR-0008).
"""

LESSON_CONTENT_PROMPT_VERSION = "v1"

SYSTEM_PROMPT = (
    "Tu es ZETIS, rédacteur de cours pour un élève de collège d'environ 12 ans. À "
    "partir d'une leçon du référentiel (matière, chapitre, titre, résumé, notions), tu "
    "rédiges le cours complet correspondant, en français simple et précis.\n\n"
    "RÈGLES DE SORTIE (impératif) :\n"
    "- Réponds UNIQUEMENT par un objet JSON valide conforme au schéma demandé : "
    '{"content": "<cours en markdown>"}. Aucun texte autour, PAS de balises ``` '
    "autour de l'objet (les blocs de code À L'INTÉRIEUR de content sont permis).\n"
    "- `content` est du MARKDOWN PUR : aucune balise HTML (pas de <details>, <summary>, "
    "<br>, <div>…). Les solutions des exercices s'écrivent directement en clair, "
    "en gras (« **Solution :** … ») juste après chaque énoncé.\n\n"
    "RÈGLES DE CONTENU :\n"
    "- Structure markdown imposée, dans cet ordre : `# <titre de la leçon>` ; une "
    "explication SIMPLE d'abord (avec une analogie concrète du quotidien) ; un ou deux "
    "exemples concrets détaillés ; `## Méthode` (étapes numérotées, pas à pas) ; "
    "`## Mini-exercices` (2 à 3 exercices AVEC leur solution expliquée juste après "
    "chacun) ; `## Ce qu'il faut retenir` (3 à 5 points courts).\n"
    "- Couvre TOUTES les notions listées, rien de plus : appuie-toi strictement sur la "
    "version du programme donnée, sans mélanger des versions successives.\n"
    "- Longueur cible : 400 à 800 mots.\n"
    "- Ton positif et encourageant : jamais « échec », « nul » ou « lacune » — préfère "
    "« à consolider », « prochaine étape ». Tutoie l'élève, phrases courtes, "
    "vocabulaire expliqué à la première occurrence."
)

# Réinjectée en réparation ; le service y ajoute l'erreur de validation concrète.
REPAIR_INSTRUCTION = (
    "Ta réponse précédente n'est pas un objet GeneratedLessonContent valide. Corrige-la "
    'en respectant EXACTEMENT le schéma : {"content": "<cours en markdown, 400 à 800 '
    'mots>"}. Réponds UNIQUEMENT par l\'objet JSON corrigé, sans aucun texte ni balise '
    "autour. Erreur détectée : "
)


def build_prompt(
    subject: str,
    level: str,
    cycle: str,
    chapter: dict,
    lesson: dict,
    notions: list[str],
    program_version: str,
) -> tuple[str, str]:
    """Construit le couple `(system, prompt)` de la rédaction du cours d'une leçon.

    `chapter` = {"name", "description"} (description optionnelle) ;
    `lesson` = {"title", "summary"} (summary optionnel) ; `notions` = intitulés des
    `Skill` rattachées (peut être vide pour une leçon manuelle sans notions).
    """
    chapter_line = f"Chapitre : « {chapter['name']} »"
    if chapter.get("description"):
        chapter_line += f" — {chapter['description']}"
    lesson_line = f"Leçon : « {lesson['title']} »"
    if lesson.get("summary"):
        lesson_line += f" — {lesson['summary']}"

    target = [
        "À TOI MAINTENANT",
        f"Matière : {subject}",
        f"Niveau : {level} · Cycle : {cycle}",
        f"Version du programme : {program_version}"
        + (" (BO du 30 juillet 2020)" if program_version == "2020" else ""),
        chapter_line,
        lesson_line,
        "Notions à couvrir : " + (", ".join(notions) if notions else "aucune (suis le titre et le résumé)"),
        "Cours complet de cette leçon (objet JSON uniquement) :",
    ]
    return SYSTEM_PROMPT, "\n".join(target)
