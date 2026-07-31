from pydantic import BaseModel

from app.modules.motivation.schemas import WeekEngagementOut


class BadgeOut(BaseModel):
    code: str
    label: str
    icon: str


class XpEventOut(BaseModel):
    amount: int
    reason: str
    created_at: str | None


class XpHistoryDay(BaseModel):
    """Un jour OÙ MASSIMO A GAGNÉ DU XP. Jour Europe/Paris, `AAAA-MM-JJ`.

    Les jours sans gain ne sont pas ici à zéro : ils sont **absents**. C'est le cœur du contrat,
    pas un détail de sérialisation — voir `XpHistoryOut`.
    """

    date: str
    xp: int


class XpHistoryOut(BaseModel):
    """`GET /api/gamification/history` — le chemin parcouru, jour par jour.

    ⚠️ **Les jours sans XP sont OMIS.** Jamais renvoyés à zéro, jamais complétés côté serveur.

    Ce n'est pas une optimisation de payload : c'est le garde-fou de l'addendum ADR-0024
    « Accueil vivant » §A. La donnée d'absence **n'existe pas**, donc aucun client — présent ou
    futur, qui n'aura pas lu l'ADR — ne peut dessiner une case vide, une grille type heatmap ou
    un « depuis N jours ». `CLAUDE.md` interdit le décompte de jours manqués sous quelque forme
    que ce soit ; ici l'interdit est tenu par le CONTRAT, pas par la discipline de l'UI.

    Ne complétez jamais cette série côté client. Une courbe dense reconstruite à partir d'elle
    redescendrait à zéro à chaque absence : le cadrage de perte que ZETIS bannit.
    """

    days: list[XpHistoryDay]


class GamificationSummary(BaseModel):
    total_xp: int
    level: int
    xp_into_level: int  # XP acquis dans le niveau courant
    xp_for_next: int  # XP nécessaires pour passer un niveau
    # A remplacé `streak_days`/`active_today` (retirés) : un compte hebdomadaire qui ne peut
    # pas casser, là où la série tombait à zéro après un seul jour manqué.
    regularity: WeekEngagementOut
    badges: list[BadgeOut]
    recent: list[XpEventOut]
