"""Exécution d'un lot (ADR-0031 §3-§5, addendum « le gate vit dans la sélection »).

Le test qui compte est le premier : **un lot n'auto-valide aucun cours**. Sans lui, l'addendum
ADR-0031 est décoratif — `equip_notion` rédige ET valide le cours par deux chemins, et un clic sur
« Compléter le chapitre » ferait passer quinze cours devant Massimo sans que Papa les ait ouverts.
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select

import app.db.models as m
from app.modules.production import runs
from app.modules.production.runner import (
    BLOCKED_COURSE_PENDING,
    BLOCKED_NO_LESSON,
    massimo_is_active,
    select_notions,
)
from app.tests.fakes import FakeEmbeddingProvider, FakeLLMProvider
from app.tests.test_production_coverage import _seed_lesson, _seed_year


def _skill(db, subject, name: str) -> m.Skill:
    skill = m.Skill(subject_id=subject.id, name=name, level="4e")
    db.add(skill)
    db.flush()
    return skill


def _attach(db, lesson, skill) -> None:
    db.add(m.LessonSkill(lesson_id=lesson.id, skill_id=skill.id))
    db.flush()


# --- LE VERROU DU §7 ---------------------------------------------------------------------------


def test_un_lot_nauto_valide_aucun_cours(client_db) -> None:
    """Chapitre entièrement en brouillon → AUCUNE leçon ne passe `validated`, AUCUN dérivé.

    C'est le verrou n°1 de l'addendum. `equip_notion` n'est pas modifié : ses deux chemins
    d'auto-validation (valider un brouillon préexistant, générer puis valider) deviennent
    inatteignables parce que la SÉLECTION ne lui donne jamais ces notions.
    """
    from app.modules.production import runner

    _, Session = client_db
    with Session() as db:
        _, subject, chapter = _seed_year(db)
        draft = _seed_lesson(db, chapter, title="Brouillon", validated=False, course=False)
        skill = _skill(db, subject, "Notion en brouillon")
        _attach(db, draft, skill)
        db.commit()

        run = runs.create_run(db, chapter_id=chapter.id)
        out = runner.execute(
            db, run_id=run.id, llm=FakeLLMProvider(), embedder=FakeEmbeddingProvider()
        )

        db.expire_all()
        assert db.get(m.Lesson, draft.id).status == "draft", "un cours a été auto-validé"
        assert db.scalar(select(m.Fiche)) is None
        assert db.scalar(select(m.Mindmap)) is None
        assert out["equipped"] == []
        assert out["blocked"] == [{"skill_id": skill.id, "reason": BLOCKED_COURSE_PENDING}]


def test_les_notions_bloquees_sont_rendues_avec_leur_motif(client_db) -> None:
    """Jamais omises en silence : une notion absente du retour se lirait comme un échec de
    production, alors que c'est un gate qui fonctionne."""
    _, Session = client_db
    with Session() as db:
        _, subject, chapter = _seed_year(db)
        orpheline = _skill(db, subject, "Notion sans leçon")
        draft = _seed_lesson(db, chapter, title="Brouillon", validated=False, course=False)
        bloquee = _skill(db, subject, "Notion à valider")
        _attach(db, draft, bloquee)
        db.commit()

        eligible, blocked = select_notions(db, [orpheline.id, bloquee.id])

    assert eligible == []
    assert {b["reason"] for b in blocked} == {BLOCKED_NO_LESSON, BLOCKED_COURSE_PENDING}


def test_une_lecon_validee_avec_contenu_est_equipable(client_db) -> None:
    """L'autre côté du gate : ce qui est passé par Papa est produit."""
    _, Session = client_db
    with Session() as db:
        _, subject, chapter = _seed_year(db)
        lesson = _seed_lesson(db, chapter, validated=True, course=True)
        skill = _skill(db, subject, "Notion prête")
        _attach(db, lesson, skill)
        db.commit()

        eligible, blocked = select_notions(db, [skill.id])

    assert eligible == [skill.id]
    assert blocked == []


# --- « Massimo passe devant » ------------------------------------------------------------------


def test_un_geste_declaratif_dagenda_ne_suspend_pas_la_production(client_db) -> None:
    """`NON_ACTIVITY_EVENTS` est exclu : cocher une case d'agenda n'est pas une session de travail
    (ADR-0025 §3). Sans cette exclusion, un geste déclaratif suspendrait un lot."""
    _, Session = client_db
    with Session() as db:
        student = db.scalar(select(m.StudentProfile))
        db.add(
            m.LearningEvent(
                student_id=student.id,
                event_type="agenda_item_done",
                created_at=datetime.now(timezone.utc),
            )
        )
        db.commit()
        assert massimo_is_active(db, student_id=student.id) is False

        db.add(
            m.LearningEvent(
                student_id=student.id,
                event_type="lesson_viewed",
                created_at=datetime.now(timezone.utc),
            )
        )
        db.commit()
        assert massimo_is_active(db, student_id=student.id) is True


def test_une_activite_ancienne_ne_suspend_rien(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        student = db.scalar(select(m.StudentProfile))
        db.add(
            m.LearningEvent(
                student_id=student.id,
                event_type="lesson_viewed",
                created_at=datetime.now(timezone.utc) - timedelta(hours=3),
            )
        )
        db.commit()
        assert massimo_is_active(db, student_id=student.id) is False


# --- Le régulateur du palier 2 -----------------------------------------------------------------


def test_le_plafond_refuse_et_le_dit(client_db) -> None:
    """Il REFUSE, il ne tronque pas. Une production qui dépasse durablement la capacité de
    relecture fabrique une dette qui tue le dispositif (ADR-0023 §5)."""
    import pytest
    from fastapi import HTTPException

    from app.core.config import settings

    _, Session = client_db
    with Session() as db:
        _, _, chapter = _seed_year(db)
        lesson = _seed_lesson(db, chapter)
        for _ in range(settings.production_max_pending):
            db.add(m.Fiche(lesson_id=lesson.id, spec_json={}, validation_status="pending"))
        db.commit()

        assert runs.pending_backlog(db) >= settings.production_max_pending
        with pytest.raises(HTTPException) as exc:
            runs.create_run(db, chapter_id=chapter.id)
    assert exc.value.status_code == 409
    assert "relecture" in exc.value.detail


def test_un_run_neuf_est_manual_et_parent_direct(client_db) -> None:
    """Le modèle anticipe, le code n'anticipe pas : six `trigger` légaux, un seul émis."""
    _, Session = client_db
    with Session() as db:
        _, _, chapter = _seed_year(db)
        db.commit()
        chapter_id = chapter.id
        run = runs.create_run(db, chapter_id=chapter_id)
        trigger, authorized_by, status_, run_chapter = (
            run.trigger,
            run.authorized_by,
            run.status,
            run.chapter_id,
        )

    assert (trigger, authorized_by, status_) == ("manual", "parent_direct", "queued")
    assert run_chapter == chapter_id


# --- Le scope de PIÈCE (ADR-0036 §2) -----------------------------------------------------------


def test_un_lot_piece_produit_la_piece_et_rien_dautre(client_db) -> None:
    """Une fiche demandée → une fiche produite. **Pas le kit, pas le chapitre.**

    Les deux moitiés comptent, et la seconde autant que la première : le chapitre porte une
    SECONDE notion, prête et éligible, qu'un lot ordinaire aurait équipée. Sans elle, le test ne
    distinguerait pas « le scope est respecté » de « il n'y avait rien d'autre à faire ».
    """
    from app.modules.production import runner

    _, Session = client_db
    with Session() as db:
        _, subject, chapter = _seed_year(db)
        lesson = _seed_lesson(db, chapter, title="Visée", validated=True, course=True)
        cible = _skill(db, subject, "Notion visée")
        _attach(db, lesson, cible)

        autre_lecon = _seed_lesson(db, chapter, title="Voisine", validated=True, course=True)
        _attach(db, autre_lecon, _skill(db, subject, "Notion voisine"))
        db.commit()

        run = runs.create_run(db, scope_skill_id=cible.id, scope_kind="fiche")
        runner.execute(db, run_id=run.id, llm=FakeLLMProvider(), embedder=FakeEmbeddingProvider())

        db.expire_all()
        fiches = db.scalars(select(m.Fiche)).all()
        assert [f.lesson_id for f in fiches] == [lesson.id], "le scope de pièce n'a pas tenu"
        # Les quatre autres pièces du kit n'ont pas été produites.
        assert db.scalar(select(m.Mindmap)) is None
        assert db.scalar(select(m.Quiz)) is None
        assert db.scalar(select(m.SpacedReviewCard)) is None
        assert db.get(m.ProductionRun, run.id).total_notions == 1


def test_un_lot_piece_reste_soumis_au_gate_du_cours(client_db) -> None:
    """Le palier ouvre la porte du cours, **jamais la demande** (ADR-0036 §2).

    Une demande de `cours` sur une notion en brouillon, au palier < 3 : le gate de la SÉLECTION la
    bloque avant tout appel de générateur, et le motif entre au journal. Le lot-pièce n'a donc
    ouvert aucune porte que le palier fermait — ce qui est la raison pour laquelle le prérequis
    « cours » d'`equip_piece` est acceptable.
    """
    from app.modules.production import runner

    _, Session = client_db
    with Session() as db:
        _, subject, chapter = _seed_year(db)
        draft = _seed_lesson(db, chapter, title="Brouillon", validated=False, course=False)
        skill = _skill(db, subject, "Notion en brouillon")
        _attach(db, draft, skill)
        db.commit()

        run = runs.create_run(db, scope_skill_id=skill.id, scope_kind="cours")
        out = runner.execute(
            db, run_id=run.id, llm=FakeLLMProvider(), embedder=FakeEmbeddingProvider()
        )

        db.expire_all()
        assert db.get(m.Lesson, draft.id).status == "draft", "un cours a été écrit sur demande"
        assert out["blocked"] == [{"skill_id": skill.id, "reason": BLOCKED_COURSE_PENDING}]


def test_un_lot_porte_un_scope_et_un_seul(client_db) -> None:
    """Le service refuse et le DIT, avant la base — un 422 lisible plutôt qu'une `IntegrityError`."""
    import pytest
    from fastapi import HTTPException

    _, Session = client_db
    with Session() as db:
        _, subject, chapter = _seed_year(db)
        skill = _skill(db, subject, "Notion")
        db.commit()

        for kwargs in (
            {},  # aucun scope
            {"chapter_id": chapter.id, "scope_skill_id": skill.id, "scope_kind": "fiche"},
            {"scope_skill_id": skill.id},  # une notion sans type
            {"scope_skill_id": skill.id, "scope_kind": "capsule"},  # hors `PIECES`
        ):
            with pytest.raises(HTTPException) as exc:
                runs.create_run(db, **kwargs)
            assert exc.value.status_code == 422, kwargs


# --- L'auto-fermeture des demandes servies (ADR-0036 §4) ---------------------------------------


def _demande_de_cours(db, skill) -> m.ContentRequest:
    req = m.ContentRequest(
        student_id=db.scalar(select(m.StudentProfile)).id,
        skill_id=skill.id,
        content_kind="cours",
        status="pending",
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return req


def test_un_lot_en_echec_ne_ferme_aucune_demande(client_db, monkeypatch) -> None:
    """⚠️ La moitié du §4 qui protège Massimo d'un « c'est prêt » sur du vide.

    Le contenu demandé est **réellement disponible** ici — le test ne prouverait rien sinon, il
    constaterait juste qu'il n'y avait rien à fermer. Ce qu'il tient, c'est qu'un lot qui échoue ne
    déclenche pas la passe de fermeture, même quand elle aurait abouti.

    Le lot suivant, lui, referme : la demande n'est pas perdue, seulement pas fermée par un échec.
    """
    import pytest

    from app.modules.production import equipment, runner

    _, Session = client_db
    with Session() as db:
        _, subject, chapter = _seed_year(db)
        lesson = _seed_lesson(db, chapter, validated=True, course=True)
        skill = _skill(db, subject, "Notion prête")
        _attach(db, lesson, skill)
        db.commit()
        req = _demande_de_cours(db, skill)

        def _boom(*args, **kwargs):
            raise RuntimeError("Ollama a coupé")

        monkeypatch.setattr(equipment, "equip_notion", _boom)
        run = runs.create_run(db, chapter_id=chapter.id)
        with pytest.raises(RuntimeError):
            runner.execute(
                db, run_id=run.id, llm=FakeLLMProvider(), embedder=FakeEmbeddingProvider()
            )

        db.refresh(req)
        assert req.status == "pending", "un lot en échec a refermé une demande"

        # …et le lot suivant, qui réussit, la referme.
        monkeypatch.undo()
        run2 = runs.create_run(db, chapter_id=chapter.id)
        runner.execute(db, run_id=run2.id, llm=FakeLLMProvider(), embedder=FakeEmbeddingProvider())
        db.refresh(req)
        assert req.status == "done"


def test_un_lot_referme_aussi_les_demandes_quil_satisfait_au_passage(client_db) -> None:
    """⚠️ Le balayage porte sur TOUTES les demandes en attente, pas sur celles du lot.

    Ce qui ferme une demande est que le contenu soit là, **pas qu'un lot particulier l'ait
    produit** : ici le lot est un lot MANUEL sur un chapitre, sans aucun lien avec la demande, et
    Papa n'a rien eu à cliquer.
    """
    from app.modules.production import runner

    _, Session = client_db
    with Session() as db:
        _, subject, chapter = _seed_year(db)
        lesson = _seed_lesson(db, chapter, validated=True, course=True)
        skill = _skill(db, subject, "Notion prête")
        _attach(db, lesson, skill)
        db.commit()
        req = _demande_de_cours(db, skill)

        run = runs.create_run(db, chapter_id=chapter.id)  # manual, aucun `content_request_id`
        runner.execute(db, run_id=run.id, llm=FakeLLMProvider(), embedder=FakeEmbeddingProvider())

        assert db.get(m.ProductionRun, run.id).content_request_id is None
        db.refresh(req)
        assert req.status == "done"


# --- L'aperçu : le gate visible AVANT le clic (slice C) ------------------------------------------


def test_lapercu_ne_cree_rien(client_db) -> None:
    """Lecture pure : un aperçu qui créerait un run ferait de chaque survol une production."""
    _, Session = client_db
    with Session() as db:
        _, subject, chapter = _seed_year(db)
        lesson = _seed_lesson(db, chapter)
        _attach(db, lesson, _skill(db, subject, "Notion prête"))
        db.commit()

        runs.preview(db, chapter_id=chapter.id)
        assert db.scalars(select(m.ProductionRun)).all() == []


def test_lapercu_nomme_les_notions_bloquees_et_leur_motif(client_db) -> None:
    """Jamais un compte nu. « 13 en attente » ne dit pas lesquelles ni pourquoi — donc ne dit
    pas à Papa ce qu'il doit valider pour débloquer son lot."""
    _, Session = client_db
    with Session() as db:
        _, subject, chapter = _seed_year(db)
        draft = _seed_lesson(db, chapter, title="Brouillon", validated=False, course=False)
        _attach(db, draft, _skill(db, subject, "Fractions"))
        db.commit()

        out = runs.preview(db, chapter_id=chapter.id)

    assert out["eligible"] == []
    assert out["blocked"][0]["name"] == "Fractions"
    assert out["blocked"][0]["reason"] == BLOCKED_COURSE_PENDING


def test_lapercu_porte_larriere_et_son_plafond(client_db) -> None:
    """Pour que le bouton dise POURQUOI il refuse, avant d'essayer plutôt qu'après un 409."""
    from app.core.config import settings

    _, Session = client_db
    with Session() as db:
        _, _, chapter = _seed_year(db)
        db.commit()
        out = runs.preview(db, chapter_id=chapter.id)

    assert out["max_pending"] == settings.production_max_pending
    assert out["pending_backlog"] == 0
