"""Ce que ZETIS dit à Massimo — composition DÉTERMINISTE, côté serveur.

Trois raisons de composer ici plutôt que côté client :

1. **Un seul endroit décide de la formulation bienveillante.** Un frontend qui recompose finit
   toujours par écrire « ça fait 5 jours ! ». Le client reçoit un texte et un `code` : le code
   sert à choisir une illustration, jamais à réinterpréter la phrase.
2. **Aucun LLM.** Les messages doivent être testables hors ligne et reproductibles à l'identique :
   ZETIS ne doit pas dire un jour « bravo » et le lendemain autre chose sur le même état. Pas de
   `random` non plus.
3. **Les interdits deviennent des assertions.** Un test parcourt tous les templates et refuse le
   vocabulaire d'échec ainsi que tout décompte de jours — la règle CLAUDE.md cesse d'être une
   intention pour devenir un verrou.

**Règle absolue** : le nombre de jours d'absence n'apparaît JAMAIS dans une phrase. Il existe dans
le contexte pour que l'UI choisisse une illustration, pas pour être lu par l'enfant.
"""

from dataclasses import dataclass

# --- Contexte (entrées du choix) --------------------------------------------------------------


@dataclass(frozen=True)
class WelcomeContext:
    """Tout ce dont dépend le message d'accueil. Aucun accès DB : le choix est une fonction pure
    de cet objet, donc testable sans client HTTP ni base."""

    first_name: str
    has_history: bool
    days_since_last_visit: int | None
    last_notion: str | None
    consolidated_this_week: int
    gaps_closed_this_week: int
    reviews_due: int
    goal_days: int | None
    days_done: int
    goal_met: bool
    goal_met_today: bool
    mission_steps_left: int
    mission_notion: str | None


@dataclass(frozen=True)
class WrapUpContext:
    """Fin de séance. Entrées volontairement différentes de l'accueil : l'accueil regarde
    l'absence, la clôture regarde ce qui reste à faire."""

    first_name: str
    mission_steps_left: int
    mission_notion: str | None
    reviews_due: int
    goal_met_today: bool
    today_done: bool


@dataclass(frozen=True)
class Message:
    code: str
    title: str
    subtitle: str | None = None
    cta_label: str | None = None
    cta_target: str | None = None


# --- Seuils d'absence -------------------------------------------------------------------------
# Une absence « longue » appelle un accueil qui remet en selle ; une absence courte, un simple
# re-bonjour. Aucun des deux ne dit combien de jours se sont écoulés.
LONG_BREAK_DAYS = 4
SHORT_BREAK_DAYS = 2


def choose_welcome(ctx: WelcomeContext) -> Message:
    """Le message d'accueil. Premier cas qui correspond l'emporte.

    L'ORDRE porte une intention pédagogique : ce qui est humain (te revoir) passe avant tout
    compteur, et l'invitation à s'engager passe avant la félicitation — sinon on rate la fenêtre
    du lundi, le seul moment où proposer un objectif a du sens.
    """
    name = ctx.first_name

    if not ctx.has_history:
        return Message(
            code="first_visit",
            title=f"Bienvenue, {name} !",
            subtitle="On commence tranquillement : choisis une matière, ou lance une révision courte.",
            cta_label="Voir mes matières",
            cta_target="matieres",
        )

    absence = ctx.days_since_last_visit
    if absence is not None and absence >= LONG_BREAK_DAYS:
        if ctx.last_notion:
            return Message(
                code="back_after_break",
                title=f"Content de te revoir, {name} !",
                subtitle=f"On reprend là où tu t'étais arrêté : {ctx.last_notion}.",
                cta_label="Reprendre",
                cta_target="missions",
            )
        return Message(
            code="back_after_break",
            title=f"Content de te revoir, {name} !",
            subtitle="On reprend tranquillement, à ton rythme.",
            cta_label="Voir mes matières",
            cta_target="matieres",
        )

    if absence is not None and absence >= SHORT_BREAK_DAYS and ctx.last_notion:
        return Message(
            code="back_short_break",
            title=f"Re-bonjour, {name} !",
            subtitle=f"{ctx.last_notion} t'attend.",
            cta_label="Continuer",
            cta_target="missions",
        )

    if ctx.goal_days is None:
        return Message(
            code="no_goal_yet",
            title="Nouvelle semaine !",
            subtitle="Tu viens combien de jours cette semaine ? C'est toi qui choisis.",
        )

    if ctx.goal_met_today:
        return Message(
            code="goal_reached_today",
            title=f"Tu viens de tenir ton engagement de la semaine, {name} !",
            subtitle="Tout ce que tu fais maintenant est en bonus.",
        )

    if ctx.goal_met:
        return Message(
            code="goal_reached",
            title="Ton engagement de la semaine est tenu !",
            subtitle="Tout ce que tu fais maintenant est en bonus.",
        )

    if ctx.consolidated_this_week >= 1 or ctx.gaps_closed_this_week >= 1:
        return Message(
            code="progress_visible",
            title=_progress_title(ctx),
            subtitle="Ça avance bien.",
        )

    if ctx.mission_steps_left >= 1 and ctx.mission_notion:
        return Message(
            code="resume_notion",
            title=f"On continue {ctx.mission_notion} ?",
            subtitle=_steps_left_line(ctx.mission_steps_left),
            cta_label="Reprendre ma mission",
            cta_target="missions",
        )

    if ctx.reviews_due >= 1:
        return Message(
            code="reviews_due",
            title=_reviews_title(ctx.reviews_due),
            subtitle="Cinq minutes suffisent.",
            cta_label="Réviser",
            cta_target="revision",
        )

    return Message(
        code="all_clear",
        title=f"Rien d'obligatoire aujourd'hui, {name}.",
        subtitle="Tu peux explorer une matière ou faire une révision rapide.",
        cta_label="Voir mes matières",
        cta_target="matieres",
    )


def choose_wrap_up(ctx: WrapUpContext) -> Message:
    """Le mot de la fin d'une séance : ce qui a été gagné, et le prochain pas.

    **Ligne rouge** : la clôture ne dit JAMAIS combien de jours il reste pour tenir l'engagement.
    Ce serait la pression quotidienne interdite — l'enfant repart avec une intention, pas avec un
    décompte."""
    if ctx.goal_met_today:
        return Message(
            code="week_goal_reached",
            title="Tu as tenu ton engagement de la semaine !",
            subtitle="La suite, c'est du bonus.",
        )

    if ctx.mission_steps_left >= 1 and ctx.mission_notion:
        return Message(
            code="mission_in_progress",
            title=f"Belle séance ! On finira {ctx.mission_notion} la prochaine fois.",
            subtitle=_steps_left_line(ctx.mission_steps_left),
            cta_label="Voir ma mission",
            cta_target="missions",
        )

    if ctx.reviews_due >= 1:
        return Message(
            code="reviews_left",
            title="Belle séance !",
            subtitle=_reviews_wait_line(ctx.reviews_due),
            cta_label="Réviser",
            cta_target="revision",
        )

    if ctx.today_done:
        return Message(
            code="day_done",
            title=f"Belle séance, {ctx.first_name} !",
            subtitle="Ta journée est cochée.",
        )

    return Message(code="all_clear", title="Belle séance !", subtitle="À bientôt.")


# --- Composition des tournures variables -------------------------------------------------------
# Isolées ici pour que l'accord singulier/pluriel soit écrit UNE fois et testé.


def _plural(count: int, singular: str, plural: str) -> str:
    return singular if count <= 1 else plural


def _progress_title(ctx: WelcomeContext) -> str:
    if ctx.consolidated_this_week >= 1:
        n = ctx.consolidated_this_week
        return f"Tu as consolidé {n} {_plural(n, 'notion', 'notions')} cette semaine !"
    n = ctx.gaps_closed_this_week
    return f"Tu as renforcé {n} {_plural(n, 'notion', 'notions')} cette semaine !"


def _steps_left_line(count: int) -> str:
    return f"Il te reste {count} {_plural(count, 'étape', 'étapes')}."


def _reviews_title(count: int) -> str:
    return f"{count} {_plural(count, 'carte t’attend', 'cartes t’attendent')} aujourd'hui."


def _reviews_wait_line(count: int) -> str:
    return (
        f"Il te reste {count} {_plural(count, 'carte', 'cartes')} — "
        "elles t'attendront, tu peux les faire quand tu veux."
    )
