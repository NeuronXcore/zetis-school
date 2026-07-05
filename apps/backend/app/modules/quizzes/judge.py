"""Jugement d'une réponse ouverte par le moteur local (ADR-0014 Lot 2, Décision 4).

Le format `open` est le seul à correction NON déterministe : une réponse écrite libre est jugée
par le LLM local contre des **critères** (points attendus, persistés dans `correct_answer_json`).
Garde-fous non négociables :

- **critère par critère** — jamais une note globale opaque (résultat structuré dans
  `ai_evaluation_json`) ;
- **bénéfice du doute** — si le juge n'est pas sûr (ou si sa réponse est illisible), l'élève est
  crédité et l'ambiguïté est remontée à Papa (drapeau `ambiguous`) ;
- **toujours bienveillant** — le feedback ne dit jamais « faux »/« échec » (vocabulaire CLAUDE.md).

Fonction à I/O (un appel LLM) mais sans DB : elle renvoie un dict, la persistance vit dans le
service. Testable via `FakeLLMProvider` (branche `criteria`).
"""

import json

from app.modules.ai.provider import LLMProvider, LLMRequest
from app.prompts.quiz import QUIZ_JUDGE_FMT, QUIZ_JUDGE_PROMPT_V1, QUIZ_JUDGE_SYSTEM


def _benefit_of_doubt(feedback: str) -> dict:
    """Réponse indécidable → on crédite l'élève et on signale l'ambiguïté à Papa."""
    return {
        "is_correct": True,
        "feedback_markdown": feedback,
        "ai_evaluation_json": {"criteria": [], "confident": False, "ambiguous": True},
        "ambiguous": True,
    }


def judge_open(
    provider: LLMProvider, *, prompt: str, answer_text: str, criteria: list
) -> dict:
    """Juge une réponse ouverte. Renvoie `{is_correct, feedback_markdown, ai_evaluation_json, ambiguous}`."""
    if not (answer_text or "").strip():
        # Rien écrit : pas d'acquis à créditer, mais on invite gentiment (jamais « faux »).
        return {
            "is_correct": False,
            "feedback_markdown": "Tu n'as encore rien écrit — lance-toi, même une phrase courte compte !",
            "ai_evaluation_json": {"criteria": [], "confident": True, "ambiguous": False, "empty": True},
            "ambiguous": False,
        }

    criteria_block = "\n".join(f"- {c}" for c in criteria) if criteria else "- (aucun critère précisé)"
    jprompt = QUIZ_JUDGE_PROMPT_V1.format(
        question=prompt, answer=answer_text.strip(), criteria=criteria_block
    )
    resp = provider.generate(
        LLMRequest(prompt=jprompt, system=QUIZ_JUDGE_SYSTEM, json_output=True, fmt=QUIZ_JUDGE_FMT)
    )
    try:
        data = json.loads(resp.text)
        crits = data.get("criteria") or []
        feedback = str(data.get("feedback") or "").strip()
        confident = bool(data.get("confident", True))
    except (json.JSONDecodeError, AttributeError, TypeError):
        # Juge illisible → bénéfice du doute (mieux vaut créditer qu'injustement pénaliser).
        return _benefit_of_doubt(
            "Ta réponse mérite le regard de Papa — je te l'accorde en attendant. Bravo d'avoir essayé !"
        )

    ambiguous = not confident
    met = sum(1 for c in crits if isinstance(c, dict) and c.get("met"))
    total = len([c for c in crits if isinstance(c, dict)])

    if ambiguous:
        is_correct = True  # bénéfice du doute
    else:
        # Acquis si au moins la moitié des critères sont présents (tolérant, jamais punitif).
        is_correct = total > 0 and met >= (total + 1) // 2

    if not feedback:
        feedback = (
            "Bien joué, tu as bien expliqué !" if is_correct else "Bon début — précise encore quelques points."
        )

    return {
        "is_correct": is_correct,
        "feedback_markdown": feedback,
        "ai_evaluation_json": {"criteria": crits, "confident": confident, "ambiguous": ambiguous},
        "ambiguous": ambiguous,
    }
