"""Résolution d'un scope de production — `plan(scope)` (ADR-0031 §2).

Le test qui compte est celui de l'ACCORD : la matrice de couverture et la production doivent
résoudre le même chapitre en la même liste de notions. La page affiche ce que la production
exécutera ; deux résolutions divergentes se paieraient comme le prédicat de disponibilité s'est
payé le 2026-07-30.
"""

from sqlalchemy import select

import app.db.models as m
from app.modules.production.coverage import coverage
from app.modules.production.scope import plan
from app.tests.test_production_coverage import _seed_lesson, _seed_year


def _skill(db, subject, name: str) -> m.Skill:
    skill = m.Skill(subject_id=subject.id, name=name, level="4e")
    db.add(skill)
    db.flush()
    return skill


def _attach(db, lesson, *skills) -> None:
    for skill in skills:
        db.add(m.LessonSkill(lesson_id=lesson.id, skill_id=skill.id))
    db.flush()


def _row_counts(db) -> dict[str, int]:
    """Effectif des tables que l'équipement écrit — la mesure de « aucun effet de bord »."""
    tables = (m.Lesson, m.LessonSkill, m.Skill, m.Fiche, m.Mindmap, m.Quiz, m.SpacedReviewCard)
    return {t.__name__: db.query(t).count() for t in tables}


def _matrix_notions(db, subject_id: int, chapter_id: int) -> set[int]:
    """Les notions que la MATRICE rattache à ce chapitre — sa vérité à elle."""
    tree = coverage(db, subject_id)
    ids: set[int] = set()
    for subject in tree["subjects"]:
        for chapter in subject["chapters"]:
            if chapter["id"] != chapter_id:
                continue
            for lesson in chapter["lessons"]:
                ids.update(item["skill_id"] for item in lesson["notions"]["items"])
    return ids


# --- Le verrou du substrat unique --------------------------------------------------------------


def test_la_matrice_et_la_production_resolvent_le_meme_chapitre_pareil(client_db) -> None:
    """LE test de cette slice. Un substrat, deux consommateurs — sinon la Couverture promettrait
    un lot que la production ne produirait pas."""
    _, Session = client_db
    with Session() as db:
        _, subject, chapter = _seed_year(db)
        l1 = _seed_lesson(db, chapter, title="Leçon 1")
        l2 = _seed_lesson(db, chapter, title="Leçon 2")
        a, b, c = (_skill(db, subject, n) for n in ("Notion A", "Notion B", "Notion C"))
        _attach(db, l1, a, b)
        _attach(db, l2, c)
        db.commit()

        assert set(plan(db, chapter_id=chapter.id)) == _matrix_notions(db, subject.id, chapter.id)
        assert set(plan(db, chapter_id=chapter.id)) == {a.id, b.id, c.id}


def test_une_lecon_brouillon_reste_dans_le_scope(client_db) -> None:
    """Écart ASSUMÉ avec la lettre de l'ADR-0023 §2, qui disait « leçons validées ».

    La matrice retient `status != "archived"` — son travail est de montrer ce qui MANQUE,
    brouillons compris. Filtrer ici aurait cassé le substrat partagé pour gagner un filtre d'une
    ligne. Le gate de validation appartient à la production : `equip_notion` le porte déjà.
    """
    _, Session = client_db
    with Session() as db:
        _, subject, chapter = _seed_year(db)
        draft = _seed_lesson(db, chapter, title="Brouillon", validated=False, course=False)
        skill = _skill(db, subject, "Notion en brouillon")
        _attach(db, draft, skill)
        db.commit()

        assert plan(db, chapter_id=chapter.id) == [skill.id]
        assert set(plan(db, chapter_id=chapter.id)) == _matrix_notions(db, subject.id, chapter.id)


def test_une_lecon_archivee_sort_du_scope(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        _, subject, chapter = _seed_year(db)
        lesson = _seed_lesson(db, chapter, title="Archivée")
        lesson.status = "archived"
        skill = _skill(db, subject, "Notion archivée")
        _attach(db, lesson, skill)
        db.commit()

        assert plan(db, chapter_id=chapter.id) == []


# --- Pureté et déterminisme ---------------------------------------------------------------------


def test_plan_est_pure_et_deterministe(client_db) -> None:
    """Mêmes entrées → mêmes sorties, ordre compris, et AUCUNE écriture.

    Un ordre instable ferait varier la production d'un lot à l'autre ; une écriture ferait d'un
    résolveur un producteur d'effets de bord, que la Couverture appelle pour une page de lecture.
    """
    _, Session = client_db
    with Session() as db:
        _, subject, chapter = _seed_year(db)
        lesson = _seed_lesson(db, chapter)
        skills = [_skill(db, subject, f"Notion {i}") for i in range(4)]
        _attach(db, lesson, *skills)
        db.commit()
        before = _row_counts(db)

        first = plan(db, chapter_id=chapter.id)
        second = plan(db, chapter_id=chapter.id)

    assert first == second, "ordre instable"
    # Comptage sur les tables que la production ÉCRIT quand elle équipe : si `plan` en touchait
    # une, ce serait un résolveur devenu producteur — appelé par une page de lecture.
    with Session() as db:
        assert _row_counts(db) == before, "`plan` a écrit en base"


def test_une_notion_portee_par_deux_lecons_nest_equipee_quune_fois(client_db) -> None:
    """La matrice est LEÇON-centrée (la notion apparaît sous chaque leçon), `plan` est
    NOTION-centrée : on équipe une notion une fois. D'où la déduplication."""
    _, Session = client_db
    with Session() as db:
        _, subject, chapter = _seed_year(db)
        l1 = _seed_lesson(db, chapter, title="Leçon 1")
        l2 = _seed_lesson(db, chapter, title="Leçon 2")
        shared = _skill(db, subject, "Notion partagée")
        _attach(db, l1, shared)
        _attach(db, l2, shared)
        db.commit()

        assert plan(db, chapter_id=chapter.id) == [shared.id]


def test_chapitre_sans_lecon_rend_une_liste_vide(client_db) -> None:
    """Un état normal, pas un incident : chapitre neuf, ou leçons toutes archivées."""
    _, Session = client_db
    with Session() as db:
        _, _, chapter = _seed_year(db)
        db.commit()
        assert plan(db, chapter_id=chapter.id) == []
