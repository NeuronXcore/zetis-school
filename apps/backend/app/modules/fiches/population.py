"""De quelle POPULATION de fiches parle-t-on ? — les deux prédicats partagés (addendum ADR-0015).

La table `fiches` porte depuis l'addendum **deux auteurs**. Toute requête qui la lit sans le dire
répond donc à une question mal posée. Ce module est délibérément **sans dépendance lourde** (ni
LLM, ni prompts, ni service) pour qu'il puisse être importé aussi bien par le flux élève que par
la production, sans cycle et sans traîner le pipeline de génération derrière lui.

## Pourquoi UN endroit et pas une clause recopiée

Le cadrage annonçait **trois** lecteurs du gate `validated`, tous dans le module `fiches`. Le
read-before-code du 2026-08-13 en a trouvé **huit**, dont quatre **hors** du module et **sans
aucun filtre de statut** — `equipment._existing_fiche`, les deux requêtes de `coverage`, la
cascade de `veto`. C'est le motif du piège de l'agenda (trois lecteurs non filtrés de
`learning_events`), en plus large.

Sur ces quatre-là, la « sécurité par construction » de `validation_status='personal'` ne joue
pas : elle ne protège que les lecteurs qui filtrent DÉJÀ sur `validated`. D'où le second
prédicat — celui de la population ZETIS.

## Les deux publics

- `readable_by_student()` — ce que Massimo a le droit de voir. Le gate porte sur ce que ZETIS
  **sert**, jamais sur ce que Massimo **écrit** (§2) ;
- `zetis_authored()` — ce que ZETIS considère comme SON travail : production, couverture,
  équipement, pilotage Papa. Une fiche personnelle n'y entre jamais, ni comme pièce à produire,
  ni comme pièce déjà produite, ni comme pièce retirable.
"""

from sqlalchemy import and_, or_
from sqlalchemy.sql.elements import ColumnElement

from app.db.models import Fiche

AUTHOR_ZETIS = "zetis"
AUTHOR_MASSIMO = "massimo"

# 4ᵉ valeur de `validation_status`, hors cycle éditorial : une fiche personnelle n'est ni validée
# ni rejetée — elle est à lui. Voir le commentaire du modèle `Fiche`.
STATUS_PERSONAL = "personal"
STATUS_VALIDATED = "validated"

# 5ᵉ valeur — **extension de l'addendum, pas une décision qu'il porte**. Le §2 ne nomme que
# `personal`, mais le §1 bis exige de PERSISTER un état incomplet (« il ferme, il revient, il
# retrouve son état ») et l'écran 2 de la spec distingue « sa fiche finie » de « son brouillon ».
# Il fallait donc les séparer en base. Le brouillon n'est **pas** une fiche : il n'est ni servi,
# ni imprimable, ni dérivable — d'où son exclusion de `readable_by_student`.
STATUS_DRAFT = "personal_draft"


def zetis_authored() -> ColumnElement[bool]:
    """Les fiches dont ZETIS est l'auteur — la population de la production et du pilotage.

    ⚠️ À placer dans la clause **ON** d'un `outerjoin`, jamais dans le `WHERE` : en `WHERE`, un
    `LEFT JOIN` redevient un `INNER JOIN` et les leçons SANS fiche disparaissent du résultat.
    `coverage` a déjà ce patron pour `Quiz` — on le relit, on ne le réinvente pas.
    """
    return Fiche.author == AUTHOR_ZETIS


def readable_by_student(student_id: int) -> ColumnElement[bool]:
    """Ce que l'élève a le droit de lire : les fiches ZETIS validées **et** les siennes.

    La fiche personnelle n'a pas de cycle éditorial : elle est lisible par son auteur sans
    validation, parce qu'elle ne sort pas de ZETIS. Ses **dérivés** (cartes SRS, quiz), eux,
    repassent par le gate normal — ils redeviennent du contenu servi.
    """
    return or_(
        and_(Fiche.author == AUTHOR_ZETIS, Fiche.validation_status == STATUS_VALIDATED),
        and_(
            Fiche.author == AUTHOR_MASSIMO,
            Fiche.student_id == student_id,
            # Un brouillon n'est pas une fiche (§1 bis) : il se reprend par l'atelier, il ne se
            # LIT pas dans le deck. Sans cette clause, `FicheOut.spec` — un `FicheSpec` strict —
            # exploserait sur un brouillon à 3 points-clés sans `essentiel`.
            Fiche.validation_status != STATUS_DRAFT,
        ),
    )


def draft_of_student(student_id: int, lesson_id: int) -> ColumnElement[bool]:
    """LE brouillon d'une leçon pour cet élève — la requête de reprise (§1 bis, §7).

    Un seul brouillon vivant par (élève, leçon) : rouvrir une fiche FINIE crée une nouvelle
    version, rouvrir un BROUILLON reprend en place. C'est la distinction du §7.
    """
    return and_(
        Fiche.author == AUTHOR_MASSIMO,
        Fiche.student_id == student_id,
        Fiche.lesson_id == lesson_id,
        Fiche.validation_status == STATUS_DRAFT,
    )
