"""La notion orpheline devient équipable — les verrous de l'ADR-0042.

Une `Skill` sans aucune `Lesson` est un état PRODUIT normal (contrat ADR-0010 : le rattrapage
d'un niveau antérieur upserte des notions « sans chapitre associé »). Pour elle, la chaîne était
fermée de bout en bout, et chaque maillon était individuellement correct — jusqu'au verdict
`acquired` rendu **arithmétiquement** inatteignable, donc à une lacune qui ne se refermait jamais.

Quatre verrous, dans l'ordre où ils comptent :

1. **le test-verrou** — la voie notion ne double JAMAIS la voie leçon ;
2. **le critère du chantier** — une notion de niveau antérieur atteint son étape quiz, et
   `acquired` redevient atteignable ;
3. **le plancher de preuve** — sans source, on refuse, et on le DIT ;
4. **la contre-épreuve** — une notion normale se comporte exactement comme avant.
"""

from datetime import timedelta

import pytest
from sqlalchemy import select

import app.db.models as m
from app.tests.fakes import Crc32EmbeddingProvider, FakeLLMProvider
from app.tests.test_missions import (
    _add_mission_quiz_attempt,
    _add_reverse_event,
    _steps_of,
)
from app.tests.test_production_coverage import _seed_lesson, _seed_year

NOTION_5E = "Fractions et proportionnalité"


# --- Fixtures de situation ----------------------------------------------------------------


@pytest.fixture
def rag_sur_sqlite(monkeypatch):
    """pgvector n'existe pas sur SQLite : l'opérateur de distance `<=>` y est une erreur de syntaxe.

    ⚠️ **Découvert en écrivant ces tests** : aucun test du dépôt n'avait jamais servi un chunk RAG
    `validated` **avec embedding**. Le chemin « il Y A des sources » n'était donc exercé nulle
    part — seule la branche « aucune source » l'était, parce qu'elle sort avant la requête
    vectorielle (`has_retrievable_chunks` répond `False` et `retrieve_for_skill` rend `[]`).

    On remplace **uniquement `search`**, c'est-à-dire une capacité du MOTEUR de base. Restent
    réels : `has_retrievable_chunks` (le prédicat du plancher, celui que la production rejoue
    avant le clic) et `retrieve_for_skill` (la cascade). C'est la logique de l'ADR-0042 qui est
    testée, pas une maquette de RAG.
    """
    from app.modules.rag import service as rag_service

    def _search_sans_vecteur(db, embedder, *, query, subject_id=None, k=3):
        stmt = select(m.RagChunk).where(
            m.RagChunk.validation_status.in_(("validated", "official")),
            m.RagChunk.embedding.isnot(None),
        )
        if subject_id is not None:
            stmt = stmt.where(m.RagChunk.subject_id == subject_id)
        return [(chunk, 0.0) for chunk in db.scalars(stmt.limit(k))]

    monkeypatch.setattr(rag_service, "search", _search_sans_vecteur)


def _quiz_pour(nom: str) -> dict:
    """Payload LLM factice dont les questions désignent la notion `nom`.

    Le résolveur du moteur (`_produce_questions`) apparie par nom normalisé : une question dont
    le `skill` ne correspond à aucune notion du lot est comptée `invalid` et jetée.
    """
    return {
        "questions": [
            {
                "question_type": "true_false",
                "skill": nom,
                "prompt": "[[Q3]] Une fraction peut représenter une proportion.",
                "answer": True,
                "explanation": "Une fraction est un rapport.",
            }
        ]
    }


def _notion_de_niveau_anterieur(db, subject) -> m.Skill:
    """Une notion de 5e, sans chapitre ni leçon — exactement ce que produit le skills-only."""
    skill = m.Skill(subject_id=subject.id, name=NOTION_5E, level="5e")
    db.add(skill)
    db.flush()
    return skill


def _source_validee(db, subject) -> None:
    """Une source récupérable dans la matière — le plancher de l'ADR-0042 §3 est franchi."""
    doc = m.RagDocument(
        subject_id=subject.id, title="Attendus de 5e", source_type="official",
        validation_status="validated",
    )
    db.add(doc)
    db.flush()
    db.add(
        m.RagChunk(
            document_id=doc.id,
            subject_id=subject.id,
            chunk_index=0,
            content="Une fraction exprime une proportion entre deux grandeurs.",
            source_type="official",
            validation_status="validated",
            embedding=Crc32EmbeddingProvider().embed(["proportion"])[0],
        )
    )
    db.commit()


# --- 1. LE TEST-VERROU --------------------------------------------------------------------


def test_verrou_le_quiz_de_notion_ne_double_jamais_la_voie_lecon(client_db, rag_sur_sqlite) -> None:
    """🔴 **L'invariant central de l'ADR-0042.** La voie notion est un DERNIER RECOURS.

    Si elle acceptait une notion déjà portée par une leçon, deux chemins produiraient le quiz de
    la même notion — et l'ADR-0037 (« une seule réponse à *quelle est LA leçon de cette
    notion* ») serait rouvert par la bande, sans qu'aucun autre test ne le voie : les deux quiz
    seraient valides, servis, et personne ne saurait lequel fait foi.

    Contre-épreuve à jouer si ce test tombe : retirer la garde `lessons_of_skill` de
    `generate_quiz_for_skill` doit le faire rougir.
    """
    from app.modules.quizzes.service import generate_quiz_for_skill

    _, Session = client_db
    with Session() as db:
        _, subject, chapter = _seed_year(db)
        _source_validee(db, subject)
        lesson = _seed_lesson(db, chapter, title="Les fractions", validated=True, course=True)
        skill = _notion_de_niveau_anterieur(db, subject)
        db.add(m.LessonSkill(lesson_id=lesson.id, skill_id=skill.id))
        db.commit()

        with pytest.raises(Exception) as exc:
            generate_quiz_for_skill(
                db,
                FakeLLMProvider(quiz=_quiz_pour(NOTION_5E)),
                Crc32EmbeddingProvider(),
                skill_id=skill.id,
                count=1,
                difficulty=2,
            )
        assert getattr(exc.value, "status_code", None) == 409
        assert "leçon" in str(getattr(exc.value, "detail", ""))
        # Et rien n'a été écrit : le refus est un refus, pas un quiz orphelin de plus.
        assert db.scalar(select(m.Quiz).where(m.Quiz.lesson_id.is_(None))) is None


# --- 2. LE CRITÈRE DU CHANTIER ------------------------------------------------------------


def test_une_notion_de_niveau_anterieur_atteint_son_etape_quiz(client_db, rag_sur_sqlite) -> None:
    """🔴 **Le critère de réussite de l'ADR-0042, de bout en bout.**

    « Une notion de niveau antérieur, sans chapitre ni leçon, doit pouvoir être équipée jusqu'à
    ce qu'une mission de remédiation la portant comporte **son étape quiz**. »

    Ce test existe parce qu'il est possible de tout faire passer au vert sans rien débloquer :
    produire le quiz et oublier `_resolve_mission_quiz_ids`, qui joignait par `Quiz.lesson_id`.
    L'étape serait restée omise, le verdict `acquired` inatteignable, et la lacune ouverte à vie.
    """
    from app.modules.missions import service as missions_service
    from app.modules.production.equipment import equip_notion

    client, Session = client_db
    with Session() as db:
        student, subject, _ = _seed_year(db)
        _source_validee(db, subject)
        skill = _notion_de_niveau_anterieur(db, subject)
        db.commit()
        skill_id, subject_id = skill.id, subject.id

        # 1) L'équipement : quatre pièces sautées, le quiz produit — ancré sur la NOTION.
        body = equip_notion(
            db,
            skill_id=skill_id,
            llm=FakeLLMProvider(quiz=_quiz_pour(NOTION_5E)),
            embedder=Crc32EmbeddingProvider(),
        )
        assert body["has_lesson"] is False
        assert body["generated"] == ["quiz"], body
        assert set(body["skipped"]) == {"cours", "fiche", "srs", "mindmap"}

        quiz = db.scalar(select(m.Quiz).where(m.Quiz.lesson_id.is_(None)))
        assert quiz is not None and quiz.status == "ready"
        assert quiz.subject_id == subject_id, "la matière vient de la notion, pas d'une leçon"
        questions = list(db.scalars(select(m.QuizQuestion).where(m.QuizQuestion.quiz_id == quiz.id)))
        assert questions and all(q.skill_id == skill_id for q in questions), (
            "sans `skill_id` sur les questions, le quiz serait irrattachable à la notion"
        )

        # 2) La lacune, puis la mission de remédiation.
        db.add(
            m.Gap(student_id=student.id, skill_id=skill_id, subject_id=subject_id, status="open")
        )
        db.commit()
        missions = missions_service.generate_remediation(db, student)
        assert len(missions) == 1
        mission_id = missions[0]["id"]
        db.get(m.Mission, mission_id).validation_status = "validated"
        db.commit()

    # 3) L'ÉTAPE QUIZ EST LÀ — c'est tout l'objet du chantier.
    steps = _steps_of(client, mission_id)
    assert [s["step_type"] for s in steps] == ["quiz", "eli5", "vocal_explain"], (
        "ordre `remediation` = rappel d'abord ; l'étape quiz ne doit plus être omise"
    )

    # 4) Et `acquired` redevient atteignable.
    client.post(f"/api/missions/{mission_id}/start")
    with Session() as db:
        student = db.scalar(select(m.StudentProfile))
        skill = db.scalar(select(m.Skill).where(m.Skill.name == NOTION_5E))
        quiz = db.scalar(select(m.Quiz).where(m.Quiz.lesson_id.is_(None)))
        after = db.get(m.Mission, mission_id).started_at + timedelta(seconds=1)
        _add_reverse_event(db, student=student, skill=skill, score=90, at=after)
        _add_mission_quiz_attempt(db, student=student, quiz_id=quiz.id, score=85, at=after)

    steps = _steps_of(client, mission_id)
    for step in steps[:-1]:
        client.post(f"/api/missions/{mission_id}/steps/{step['id']}/complete")
    res = client.post(f"/api/missions/{mission_id}/steps/{steps[-1]['id']}/complete").json()
    assert res["verdict"] == "acquired", (
        "sans étape quiz, `_recall_ok(None, None)` est faux et le verdict retombe toujours sur "
        "`review_later` — c'est la boucle que ce chantier ouvre"
    )
    with Session() as db:
        skill = db.scalar(select(m.Skill).where(m.Skill.name == NOTION_5E))
        gap = db.scalar(select(m.Gap).where(m.Gap.skill_id == skill.id))
        assert gap is not None and gap.status == "resolved", "la lacune se referme enfin"


# --- 3. LE PLANCHER DE PREUVE -------------------------------------------------------------


def test_sans_source_le_quiz_est_refuse_avant_tout_appel_au_modele(client_db) -> None:
    """Le plancher de l'ADR-0042 §3 : pas de source, pas de quiz — et le refus se DIT.

    Un quiz bâti sur la seule connaissance du modèle serait servi à Massimo comme une MESURE de
    sa maîtrise, sans qu'aucune source du dépôt ne l'ancre. L'auto-vérification à l'aveugle
    (ADR-0014) contrôle la cohérence interne d'une question, pas sa pertinence au programme.

    ⚠️ Embedder **crc32** et non `FakeEmbeddingProvider` : ce dernier dérive de `hash()`, salé
    par `PYTHONHASHSEED`, et tout test de NON-résolution devient flaky à ~50 %.
    """
    from app.modules.quizzes.service import generate_quiz_for_skill

    _, Session = client_db
    with Session() as db:
        _, subject, _ = _seed_year(db)
        skill = _notion_de_niveau_anterieur(db, subject)  # aucune source dans la matière
        db.commit()

        appels: list[str] = []

        class LlmQuiCompte(FakeLLMProvider):
            def generate(self, request):  # noqa: ANN001
                appels.append(request.prompt)
                return super().generate(request)

        with pytest.raises(Exception) as exc:
            generate_quiz_for_skill(
                db, LlmQuiCompte(), Crc32EmbeddingProvider(), skill_id=skill.id,
                count=1, difficulty=2,
            )
        assert getattr(exc.value, "status_code", None) == 409
        assert "source" in str(getattr(exc.value, "detail", ""))
        assert appels == [], "le refus doit tomber AVANT le modèle — on ne paie pas pour jeter"


def test_la_production_annonce_le_blocage_avant_le_clic(client_db) -> None:
    """Le motif est rendu par le GATE, pas découvert à l'exécution (ADR-0036 §2).

    Et il est **distinct** de `BLOCKED_NO_LESSON` : l'absence de leçon n'empêche plus le quiz,
    c'est l'absence de source qui l'empêche. Confondre les deux ferait lire « rien à quoi
    rattacher un cours » sur une notion dont il ne manque qu'une source.
    """
    from app.modules.production.runner import (
        BLOCKED_NO_LESSON,
        BLOCKED_NO_LESSON_NO_SOURCE,
        select_notions,
    )

    _, Session = client_db
    with Session() as db:
        _, subject, _ = _seed_year(db)
        skill = _notion_de_niveau_anterieur(db, subject)
        db.commit()

        # Sans source : bloqué, avec le motif qui dit quoi faire.
        eligible, blocked = select_notions(db, [skill.id], piece="quiz")
        assert eligible == [] and blocked[0]["reason"] == BLOCKED_NO_LESSON_NO_SOURCE

        # Les quatre pièces leçon-centrées gardent l'ancien motif, inchangé.
        eligible, blocked = select_notions(db, [skill.id], piece="fiche")
        assert eligible == [] and blocked[0]["reason"] == BLOCKED_NO_LESSON

        # Avec une source : le quiz devient éligible, et lui seul.
        _source_validee(db, subject)
        eligible, _ = select_notions(db, [skill.id], piece="quiz")
        assert eligible == [skill.id]
        eligible, blocked = select_notions(db, [skill.id], piece=None)
        assert eligible == [] and blocked[0]["reason"] == BLOCKED_NO_LESSON


# --- 4. LA CONTRE-ÉPREUVE -----------------------------------------------------------------


def test_contre_epreuve_une_notion_avec_lecon_se_comporte_comme_avant(client_db, rag_sur_sqlite) -> None:
    """Une notion normale ne voit RIEN de ce chantier.

    Le kit complet, l'ancrage sur la leçon, et surtout **aucun quiz `lesson_id IS NULL`** : si la
    voie notion s'ouvrait ici, on produirait un doublon invisible sur toute la base existante.
    """
    from app.modules.production.equipment import equip_notion
    from app.modules.production.runner import select_notions

    _, Session = client_db
    with Session() as db:
        _, subject, chapter = _seed_year(db)
        _source_validee(db, subject)  # une source existe : elle ne doit rien changer ici
        lesson = _seed_lesson(db, chapter, title="Les fractions", validated=True, course=True)
        skill = m.Skill(subject_id=subject.id, name="Nombres relatifs", level="4e")
        db.add(skill)
        db.flush()
        db.add(m.LessonSkill(lesson_id=lesson.id, skill_id=skill.id))
        db.commit()

        # Le gate ne bouge pas — la notion est équipable, comme avant.
        for piece in (None, "quiz", "fiche"):
            eligible, blocked = select_notions(db, [skill.id], piece=piece)
            assert eligible == [skill.id] and blocked == [], piece

        body = equip_notion(
            db, skill_id=skill.id, llm=FakeLLMProvider(), embedder=Crc32EmbeddingProvider()
        )
        assert body["has_lesson"] is True
        assert "quiz" in body["generated"], f"{body['generated']=} {body['skipped']=} {body['errors']=}"

        quizzes = list(db.scalars(select(m.Quiz)))
        assert len(quizzes) == 1
        assert quizzes[0].lesson_id == lesson.id, (
            "le quiz d'une notion portée reste ancré sur SA leçon — la voie notion ne s'ouvre pas"
        )


def test_un_quiz_sans_lecon_egare_ne_fait_pas_croire_la_notion_deja_equipee(
    client_db, rag_sur_sqlite
) -> None:
    """🔴 **Trouvé par la vérification réelle du 2026-08-07, pas par les tests.**

    La base de dev porte un quiz `mission` **`draft`, `lesson_id IS NULL`**, hérité d'un vieux jeu
    de données, dont les questions visent une notion qui, elle, **a** une leçon. En rendant
    `_has_mission_quiz` sensible à l'ancrage notion, ce quiz-là s'est mis à répondre « déjà
    produit » sur le chemin NORMAL : `equip_notion` aurait cessé de générer le quiz d'une notion
    parfaitement équipable, **en silence**, sur toute la base existante.

    La contre-épreuve ne pouvait pas le voir : sa fixture n'a aucun quiz sans leçon. Ce test met
    la situation réelle dans la fixture.
    """
    from app.modules.production.equipment import _has_mission_quiz, equip_notion

    _, Session = client_db
    with Session() as db:
        _, subject, chapter = _seed_year(db)
        _source_validee(db, subject)
        lesson = _seed_lesson(db, chapter, title="Les fractions", validated=True, course=True)
        skill = db.scalar(select(m.Skill))  # la notion du seed — elle A une leçon
        db.add(m.LessonSkill(lesson_id=lesson.id, skill_id=skill.id))
        db.flush()

        # Le quiz égaré : type mission, sans leçon, pointant sur cette notion.
        egare = m.Quiz(
            subject_id=subject.id, lesson_id=None, title="Quiz historique",
            quiz_type="mission", status="draft", created_by="ai",
        )
        db.add(egare)
        db.flush()
        db.add(
            m.QuizQuestion(
                quiz_id=egare.id, skill_id=skill.id, question_type="true_false",
                prompt_markdown="…", sort_order=0, source="generated", status="active",
            )
        )
        db.commit()

        assert _has_mission_quiz(db, skill.id) is False, (
            "un quiz sans leçon ne compte QUE pour une notion orpheline — celle-ci a une leçon"
        )
        body = equip_notion(
            db, skill_id=skill.id, llm=FakeLLMProvider(), embedder=Crc32EmbeddingProvider()
        )
        assert "quiz" in body["generated"], (
            f"le quiz du chemin normal doit toujours être produit — {body['skipped']=}"
        )
