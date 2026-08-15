"""Interrogation orale — la machine (ADR-0059 §10, §11, §12).

`service.py` reste l'orchestrateur du tour ; ce module porte la logique de l'interrogation, comme
`actions.py` porte celle de l'ancrage. Il ne connaît ni Redis ni HTTP : il reçoit un état, rend un
état et une réplique.

## Ce qu'il ne fait PAS, et pourquoi

- **Aucun XP, aucune écriture `SkillMastery`, aucun `event_type` neuf** (§12). C'est la mesure la
  moins fiable du dépôt — un transcript Whisper d'une phrase d'enfant, jugé par un modèle local,
  sur un verdict à quatre valeurs. La rendre probante polluerait missions, galaxie, `Gap`, deck
  SRS et Conseil de classe, et demanderait de révoquer l'`adr-0026` §2 **et** §3.
- **Aucune carte SRS portant la réponse de Massimo.** `eli5.reverse_evaluate` fait exactement
  cela (`schedule_review(back=req.answer_text)`) : il écrit le texte de l'enfant en base,
  durablement. On reprend la FORME de sa tâche, aucun de ses effets de bord.

Ce qu'on perd, écrit pour que personne ne le redécouvre comme un oubli : Papa voit « il a accepté
d'être interrogé sur les fractions », jamais « deux sur trois ».
"""

from dataclasses import dataclass

from app.core.config import settings
from app.modules.ai.provider import LLMProvider, LLMRequest
from app.prompts.chat_recall import (
    RECALL_SYSTEM,
    RECALL_VERDICTS,
    recall_turn_prompt,
    recall_turn_schema,
)

#: Verdict de repli. 🔴 **Le doute profite à l'enfant PAR CONSTRUCTION** : une valeur que le moteur
#: aurait inventée (« faux », « incorrect », « nul ») ne peut pas devenir un verdict négatif — elle
#: devient une demande de reformulation. C'est le garde-fou le moins contournable des cinq, parce
#: qu'il ne dépend d'aucune consigne de prompt.
VERDICT_DOUTE = "a_reformuler"

#: Phrase de clôture, composée SERVEUR et déterministe — jamais laissée au moteur, qui broderait.
#: §16 : ZETIS parle à la première personne et ne nomme aucun adulte.
CLOTURE = "Voilà, c'est tout pour cette fois — tu as bien travaillé !"

#: 🔴 **Clôture quand RIEN n'a été réussi** (correctif live 2026-08-15). Sur la première
#: interrogation jouée en vrai, Massimo n'a réussi aucune des trois questions — et ZETIS a conclu
#: par « tu as bien travaillé ». Une félicitation qui ne correspond à rien n'encourage pas : elle
#: apprend que la parole de ZETIS ne veut rien dire.
#:
#: ⚠️ Elle ne dit pas l'échec pour autant — `CLAUDE.md` interdit « nul », « échec », « lacune ».
#: Elle nomme ce qui s'est passé (une notion à renforcer) et ce qui vient après. C'est le
#: vocabulaire du dépôt : « notion à renforcer », « prochaine étape ».
CLOTURE_A_RENFORCER = (
    "Voilà pour cette fois. C'est une notion à renforcer — on la retravaillera ensemble, "
    "et ça viendra."
)

#: Verdicts qui comptent comme une réussite, même partielle. Une mini-victoire suffit à mériter
#: la clôture chaleureuse (`CLAUDE.md` : les mini-victoires).
_VERDICTS_REUSSIS = ("ok", "partiel")


def cloture_pour(verdicts: list[str]) -> str:
    """La clôture DIT ce qui s'est passé, elle ne félicite pas au hasard."""
    return CLOTURE if any(v in _VERDICTS_REUSSIS for v in verdicts) else CLOTURE_A_RENFORCER

#: Ce que ZETIS dit quand la dictée n'a rien donné d'exploitable. Aucun appel au moteur : une
#: dictée ratée ne doit JAMAIS produire un verdict sur Massimo.
TROP_COURT = "Je n'ai pas bien saisi — tu peux me le redire ?"

#: 🔴 **« Je ne sais pas » n'est PAS une réponse fausse : c'est une demande d'aide.**
#:
#: Constaté au micro le 2026-08-15, sur la première interrogation jouée en vrai. Massimo a dit
#: « je ne sais pas aide moi », puis « je ne sais pas » — et à chaque fois ZETIS a traité l'aveu
#: comme une tentative : verdict, correction, **question suivante**. Il a consommé les trois
#: questions sans jamais avoir eu l'occasion de répondre à la première.
#:
#: Le plancher de longueur ne l'attrape pas (14 caractères > 8) et n'a pas à le faire : il vise
#: les dictées ratées, pas les aveux. Ce sont deux choses différentes et elles demandent deux
#: réponses différentes — redire la question d'un côté, AIDER de l'autre.
_AVEUX = (
    "je ne sais pas",
    "je sais pas",
    "j'sais pas",
    "aucune idée",
    "aucune idee",
    "je ne comprends pas",
    "je comprends pas",
    "aide-moi",
    "aide moi",
    "j'y arrive pas",
    "je n'y arrive pas",
)


def _est_un_aveu(reponse: str) -> bool:
    """Massimo demande-t-il de l'aide plutôt que de proposer une réponse ?"""
    minuscule = reponse.strip().lower()
    return any(aveu in minuscule for aveu in _AVEUX)


@dataclass
class RecallState:
    """État d'une interrogation. Vit dans Redis, sous le TTL de la session.

    ⚠️ **Que des étiquettes.** `current_question` est une parole de ZETIS (elle vit déjà dans le
    fil de tours) ; les réponses de Massimo n'entrent PAS ici — elles transitent vers le prompt
    d'évaluation puis sont oubliées. Les accumuler serait du verbatim sans usage.
    """

    skill_id: int
    skill_name: str
    asked_count: int
    current_question: str
    verdicts: list[str]
    #: Nombre d'aveux d'ignorance sur la question EN COURS. Au premier, ZETIS aide et repose la
    #: même question ; au second, il corrige et avance — on n'insiste pas indéfiniment.
    aides: int = 0

    def to_dict(self) -> dict:
        return {
            "skill_id": self.skill_id,
            "skill_name": self.skill_name,
            "asked_count": self.asked_count,
            "current_question": self.current_question,
            "verdicts": list(self.verdicts),
            "aides": self.aides,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "RecallState":
        return cls(
            skill_id=int(data.get("skill_id") or 0),
            skill_name=str(data.get("skill_name") or ""),
            asked_count=int(data.get("asked_count") or 0),
            current_question=str(data.get("current_question") or ""),
            verdicts=[str(v) for v in (data.get("verdicts") or [])],
            aides=int(data.get("aides") or 0),
        )


@dataclass
class RecallTurn:
    """Résultat d'un tour : ce que ZETIS dit, l'état à écrire (ou `None` si c'est fini)."""

    reply: str
    state: RecallState | None
    verdict: str | None = None
    finished: bool = False


def _ask(
    provider: LLMProvider, *, context_block: str, skill_name: str, previous: str, last: bool
) -> dict:
    response = provider.generate(
        LLMRequest(
            prompt=recall_turn_prompt(
                context_block=context_block, skill_name=skill_name, previous=previous, last=last
            ),
            system=RECALL_SYSTEM,
            json_output=True,
            fmt=recall_turn_schema(),
        )
    )
    import json

    try:
        parsed = json.loads(response.text)
    except (ValueError, TypeError):
        parsed = {}
    return parsed if isinstance(parsed, dict) else {}


def _verdict(brut: object) -> str:
    """Normalise le verdict. **Toute valeur inconnue devient `a_reformuler`.**

    Sabotage qui doit rougir : mapper l'inconnu vers `a_revoir` — le moteur pourrait alors
    fabriquer un négatif que le vocabulaire fermé interdisait.
    """
    valeur = str(brut or "").strip().lower()
    return valeur if valeur in RECALL_VERDICTS else VERDICT_DOUTE


def ouvrir(
    provider: LLMProvider, *, context_block: str, skill_id: int, skill_name: str
) -> RecallTurn:
    """Premier tour : ZETIS pose sa première question. Aucun verdict — rien à évaluer encore."""
    parsed = _ask(
        provider, context_block=context_block, skill_name=skill_name, previous="", last=False
    )
    question = str(parsed.get("next_question") or "").strip()
    feedback = str(parsed.get("feedback") or "").strip()
    if not question:
        # Le moteur n'a pas produit de question : on n'ouvre pas une interrogation vide.
        return RecallTurn(reply=feedback or TROP_COURT, state=None, finished=True)
    return RecallTurn(
        reply=f"{feedback} {question}".strip() if feedback else question,
        state=RecallState(
            skill_id=skill_id,
            skill_name=skill_name,
            asked_count=1,
            current_question=question,
            verdicts=[],
        ),
    )


def repondre(
    provider: LLMProvider, state: RecallState, reponse: str, *, context_block: str
) -> RecallTurn:
    """Massimo a répondu : on évalue, puis on relance — ou on clôt.

    🔴 **Le SERVEUR décide de la fin**, jamais le moteur : `asked_count` atteint le plafond, on
    ferme. Un modèle à qui l'on demande s'il veut arrêter d'interroger n'arrête pas.
    """
    propre = (reponse or "").strip()
    # 🔴 Plancher de longueur, SANS appel au moteur. Une dictée ratée (« euh », un blanc, un mot
    # coupé) ne doit jamais produire un verdict sur Massimo — et surtout pas un négatif.
    if len(propre) < settings.chat_recall_min_answer_chars:
        return RecallTurn(reply=TROP_COURT, state=state)

    # 🔴 **Un aveu d'ignorance ne consomme PAS la question** (correctif live 2026-08-15, première
    # interrogation jouée en vrai). Massimo a dit « je ne sais pas aide moi » : ZETIS a jugé,
    # corrigé, et **enchaîné sur une autre question**. Il a brûlé ses trois questions sans jamais
    # avoir eu l'occasion de répondre à la première.
    #
    # Demander de l'aide n'est pas se tromper. ZETIS aide, et **repose la même question** — c'est
    # le seul moyen que la récupération active ait lieu, et c'est l'ordre que `CLAUDE.md` prescrit
    # (l'explication simple AVANT l'exercice).
    #
    # ⚠️ Une seule fois par question : au second aveu, on corrige et on avance. Insister
    # indéfiniment sur une question qu'il ne sait pas serait une autre façon de l'enfermer.
    if _est_un_aveu(propre) and state.aides == 0:
        parsed = _ask(
            provider,
            context_block=context_block,
            skill_name=state.skill_name,
            previous=(
                f"Question posée : {state.current_question}\n"
                "Massimo dit qu'il ne sait pas et demande de l'aide. Donne-lui un INDICE tiré du "
                "cours — surtout PAS la réponse — puis REPOSE-LUI EXACTEMENT la même question, "
                "mot pour mot."
            ),
            last=False,
        )
        indice = str(parsed.get("feedback") or "").strip()
        return RecallTurn(
            reply=f"{indice} {state.current_question}".strip() if indice else state.current_question,
            state=RecallState(
                skill_id=state.skill_id,
                skill_name=state.skill_name,
                asked_count=state.asked_count,  # ⚠️ INCHANGÉ : la question n'est pas consommée
                current_question=state.current_question,
                verdicts=list(state.verdicts),
                aides=1,
            ),
        )

    derniere = state.asked_count >= settings.chat_recall_questions
    parsed = _ask(
        provider,
        context_block=context_block,
        skill_name=state.skill_name,
        previous=f"Question posée : {state.current_question}\nRéponse de Massimo : {propre}",
        last=derniere,
    )
    verdict = _verdict(parsed.get("verdict"))
    feedback = str(parsed.get("feedback") or "").strip()
    question = str(parsed.get("next_question") or "").strip()

    tous_verdicts = [*state.verdicts, verdict]
    if derniere:
        # ⚠️ La clôture est composée SERVEUR. Même si le moteur a désobéi et posé une question de
        # plus, elle n'est pas servie : c'est le seul moyen que « trois questions » veuille dire
        # trois questions.
        fin = cloture_pour(tous_verdicts)
        return RecallTurn(
            reply=f"{feedback} {fin}".strip() if feedback else fin,
            state=None,
            verdict=verdict,
            finished=True,
        )

    if not question:
        # Le moteur n'a plus de question alors qu'il en restait : on clôt proprement plutôt que
        # de le relancer — ZETIS n'insiste jamais (`adr-0026` §4).
        fin = cloture_pour(tous_verdicts)
        return RecallTurn(
            reply=f"{feedback} {fin}".strip() if feedback else fin,
            state=None,
            verdict=verdict,
            finished=True,
        )

    return RecallTurn(
        reply=f"{feedback} {question}".strip() if feedback else question,
        state=RecallState(
            skill_id=state.skill_id,
            skill_name=state.skill_name,
            asked_count=state.asked_count + 1,
            current_question=question,
            verdicts=[*state.verdicts, verdict],
            aides=0,  # nouvelle question, nouveau droit à l'aide
        ),
        verdict=verdict,
    )
