"""Résolution « leçon → matière » — implémentation UNIQUE, partagée par tous les consommateurs.

Le rattachement d'un chapitre est **branché** (cf. modèle `Chapter`) : soit à une matière d'année
(`school_year_subject_id`), soit directement à un thème (`theme_id`, depuis le module subjects).
Toute lecture qui veut la matière d'une leçon doit donc essayer les deux branches — d'où trois
jumeaux qui avaient divergé (`fiches`, `mindmaps`, journal d'activité) avant cette unification.

Le module vit dans `subjects` parce que c'est lui qui possède la hiérarchie `Subject → Theme →
Chapter` traversée ici. Il ne dépend que des modèles : aucun import de service, donc aucun cycle,
et il reste appelable aussi bien depuis un flux Papa que depuis un flux élève.

**Deux formes, une seule marche.** La traversée produit naturellement un `subject_id` (porté par
`SchoolYearSubject` ou par `Theme`) ; charger la ligne `Subject` est un `db.get` SUPPLÉMENTAIRE.
Le journal d'activité n'a besoin que de l'id (`learning_events.subject_id`) : lui rendre un objet
`Subject` le ferait payer une requête pour rien. D'où :

- `subject_id_for_lesson` — id en entrée, id en sortie (routers, journal) ;
- `subject_of_lesson`     — leçon déjà chargée en entrée, `Subject` en sortie (fiches, mindmaps,
  qui ont besoin de `.name` pour le prompt et de `.slug` pour la sérialisation).

Les deux acceptent `None` : les appelants sérialisent souvent une ligne dont la leçon peut avoir
disparu, et écrire la garde ici évite de la répéter sur chaque site d'appel.
"""

from sqlalchemy.orm import Session

from app.db.models import Chapter, Lesson, SchoolYearSubject, Subject, Theme


def _subject_id_of(db: Session, lesson: Lesson | None) -> int | None:
    """La marche elle-même : `chapter → (school_year_subject | theme) → subject_id`."""
    if lesson is None:
        return None
    chapter = db.get(Chapter, lesson.chapter_id)
    if chapter is None:
        return None
    if chapter.school_year_subject_id is not None:
        sys_row = db.get(SchoolYearSubject, chapter.school_year_subject_id)
        if sys_row is not None:
            return sys_row.subject_id
    if chapter.theme_id is not None:
        theme = db.get(Theme, chapter.theme_id)
        if theme is not None:
            return theme.subject_id
    return None


def subject_id_for_lesson(db: Session, lesson_id: int | None) -> int | None:
    """Id de la matière d'une leçon, ou None (leçon, chapitre ou rattachement absent).

    Forme « id seul » : aucun chargement de la ligne `Subject`. Sans cette résolution, un
    `lesson_viewed` sans `subject_id` disparaîtrait dès que Papa filtre la heatmap par matière.
    """
    lesson = db.get(Lesson, lesson_id) if lesson_id is not None else None
    return _subject_id_of(db, lesson)


def subject_of_lesson(db: Session, lesson: Lesson | None) -> Subject | None:
    """Matière d'une leçon déjà chargée, ou None. Forme « objet » (nom, slug…)."""
    subject_id = _subject_id_of(db, lesson)
    return db.get(Subject, subject_id) if subject_id is not None else None
