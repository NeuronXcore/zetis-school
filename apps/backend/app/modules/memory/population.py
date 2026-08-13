"""De quelle population de cartes parle-t-on — prédicats partagés (addendum ADR-0015 §13).

Patron repris de `fiches/population.py`, et pour la même raison : depuis que Massimo écrit ses
propres définitions, **une requête qui ne dit pas de quelle population elle parle répond à une
question mal posée**. Le module `memory` a déjà démontré qu'il diverge de lui-même — `generation.py`
et `schedule_review` ne s'accordaient pas sur la clé de la table — et une clause recopiée dans cinq
lecteurs est le moyen le plus sûr de recommencer.

⚠️ **Aucun prédicat d'ici ne lit d'ÉCHÉANCE.** `new_cards_count` est l'un de ses appelants, et
`test_news_doctrine.py` verrouille l'absence de jeton d'échéance dans le **corps** de ce
compteur — un verrou qui lit du source, donc **aveugle à ce qu'un helper contient**. La règle est
tenue ici par construction : le masquage regarde un type et un statut, jamais une date.
"""

from sqlalchemy import and_, exists, select
from sqlalchemy.orm import aliased
from sqlalchemy.sql.elements import ColumnElement

from app.db.models import SpacedReviewCard

# --- Vocabulaire ---------------------------------------------------------------------
#
# `definition` est produit par la génération (`generation.py`) ET par toute révision planifiée
# (`schedule_review`). `definition_perso` naît de la fiche que Massimo fabrique lui-même : ZETIS
# donne le terme, Massimo écrit la définition — recto/verso sans aucune transformation (§8).
CARD_TYPE_DEFINITION = "definition"
CARD_TYPE_DEFINITION_PERSO = "definition_perso"

# Une carte « active » (`scheduled`/`new`) est révisable ; on exclut les états non-servis
# (ADR-0013) : `pending` = générée sans cours validé (cas dégradé) ; `suspended` = orpheline
# (plus aucun cours validé ne la couvre, planification conservée) ; `archived` = réserve.
INACTIVE_CARD_STATUSES = frozenset({"pending", "suspended", "archived"})


def masquee_par_sa_carte() -> ColumnElement[bool]:
    """La carte `definition` de ZETIS s'efface tant que Massimo a la SIENNE sur cette notion.

    🔴 **Masquage, jamais suppression ni suspension** (§13 décision 5). La carte ZETIS garde sa
    planification et redevient servable le jour où il n'a plus de carte personnelle active.
    `suspended` voudrait dire *« plus aucun cours validé ne la couvre »* (ADR-0013) — lui donner
    un second sens rendrait le statut illisible.

    **Pourquoi masquer** : les deux cartes portent la même notion. Les servir toutes les deux,
    c'est poser deux fois la même question — et le deck matière **n'entrelace pas** (tri
    `due_at asc, id asc`), donc elles se suivraient **dos à dos**. Entre la formulation de ZETIS
    et la sienne, c'est la sienne qui compte : *c'est celle-là qu'il doit pouvoir retrouver.*

    ⚠️ Le masquage exige que sa carte soit elle-même **active**. Sans cette condition, une carte
    personnelle suspendue ferait disparaître la notion de la révision **des deux côtés** — un
    silence, c'est-à-dire le pire mode d'échec possible ici.
    """
    sienne = aliased(SpacedReviewCard)
    return and_(
        SpacedReviewCard.card_type == CARD_TYPE_DEFINITION,
        exists(
            select(1).where(
                sienne.student_id == SpacedReviewCard.student_id,
                sienne.skill_id == SpacedReviewCard.skill_id,
                sienne.card_type == CARD_TYPE_DEFINITION_PERSO,
                sienne.status.not_in(INACTIVE_CARD_STATUSES),
            )
        ),
    )


def servable() -> ColumnElement[bool]:
    """Ce que Massimo peut réellement recevoir — **la seule définition du mot « servable »**.

    🔴 **Vaut pour la SÉLECTION *et* pour les COMPTEURS.** Une carte masquée mais comptée ferait
    annoncer « 8 cartes » pour en servir 7 — le défaut exact que l'`adr-0039` a payé sur la file
    de relecture (49 fiches annoncées, 10 lignes servies). Les deux doivent partir d'ici.

    N'inclut **aucune** clause d'échéance : le deck chapitre sert des cartes non dues (ADR-0049),
    et le témoin de nouveauté n'a pas le droit d'en lire une (ADR-0030). L'échéance se compose
    par-dessus, là où elle est légitime.
    """
    return and_(
        SpacedReviewCard.status.not_in(INACTIVE_CARD_STATUSES),
        ~masquee_par_sa_carte(),
    )
