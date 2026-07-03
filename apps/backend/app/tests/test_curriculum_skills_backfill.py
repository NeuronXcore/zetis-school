"""Tests offline de la génération « skills-only » pour un niveau antérieur (ADR-0010).

Couvre : orchestration en mémoire (AUCUN chapitre / leçon / liaison persisté — verrou
sur les trois tables), dédup des notions, échec partiel d'un chapitre d'échafaudage
signalé sans avorter le reste, upsert au niveau cible réutilisant la passe 2 (sans
`lesson_skills`), idempotence du confirm, validation du niveau (400 hors cycle 4),
garde parent (403), invariant vie privée, erreur propre sans clé API. Aucun appel réseau.
"""

import json

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select

import app.db.models as m
from app.core.config import settings
from app.main import app
from app.modules.ai.provider import LLMResponse
from app.modules.auth.deps import get_current_user
from app.modules.curriculum import get_curriculum_provider
from app.modules.curriculum.service import (
    CurriculumGenerationError,
    confirm_skills_backfill,
    generate_skills_backfill,
)
from app.prompts import curriculum
from app.tests.fakes import _DEFAULT_CURRICULUM, _DEFAULT_LESSONS, FakeLLMProvider


# ---------------------------------------------------------------------------
# Fakes locaux (mêmes conventions que les tests des passes 1 et 2).
# ---------------------------------------------------------------------------


class _RecordingLLM(FakeLLMProvider):
    """FakeLLMProvider qui enregistre les prompts reçus (assert vie privée)."""

    def __init__(self, **kwargs) -> None:
        super().__init__(**kwargs)
        self.prompts: list[str] = []
        self.systems: list[str] = []

    def generate(self, request) -> LLMResponse:  # noqa: ANN001 — stub de test
        self.prompts.append(request.prompt)
        self.systems.append(request.system or "")
        return super().generate(request)


class _MixedLLM:
    """Chapitres toujours valides ; réponses de leçons servies dans l'ordre donné.

    Un item de `lesson_responses` = une invocation de la passe 2 (l'original ET sa
    réparation consomment chacun un item) → permet de faire échouer UN échafaudage précis."""

    def __init__(self, lesson_responses: list[str]) -> None:
        self._lessons = list(lesson_responses)

    def generate(self, request) -> LLMResponse:  # noqa: ANN001 — stub de test
        props = request.fmt.get("properties", {}) if isinstance(request.fmt, dict) else {}
        if "chapters" in props:
            return LLMResponse(json.dumps(_DEFAULT_CURRICULUM), "seq", 1)
        if "lessons" in props:
            return LLMResponse(self._lessons.pop(0), "seq", 1)
        raise AssertionError(f"fmt inattendu dans le backfill : {props}")


class _SequenceLLM:
    """Renvoie des réponses prédéfinies dans l'ordre (ignore la requête)."""

    def __init__(self, responses: list[str]) -> None:
        self._responses = list(responses)
        self.calls = 0

    def generate(self, request) -> LLMResponse:  # noqa: ANN001 — stub de test
        self.calls += 1
        return LLMResponse(text=self._responses.pop(0), model="seq", duration_ms=1)


# ---------------------------------------------------------------------------
# Helpers.
# ---------------------------------------------------------------------------

# Notions attendues dans chaque groupe (dédup de `_DEFAULT_LESSONS` : « Règle des signes »
# apparaît dans 2 leçons → une seule fois).
_EXPECTED_NOTIONS = ["Nombres relatifs", "Règle des signes", "Repérage sur une droite graduée"]


def _subject_id(db) -> int:
    return db.scalars(select(m.Subject)).first().id


def _count(db, model) -> int:
    return db.scalar(select(func.count()).select_from(model))


def _skills(db) -> list[m.Skill]:
    return list(db.scalars(select(m.Skill).order_by(m.Skill.id)))


def _backfill_jobs(db) -> list[m.AIJob]:
    return list(
        db.scalars(select(m.AIJob).where(m.AIJob.job_type == "curriculum_skills_backfill"))
    )


def _seed_existing_curriculum(db) -> None:
    """Un chapitre + une leçon + une liaison préexistants, pour prouver que le backfill
    n'y touche jamais (verrou des trois tables : compte identique avant/après)."""
    skill = db.scalars(select(m.Skill)).first()  # « Nombres relatifs » 4e (conftest)
    chapter = m.Chapter(
        name="Chapitre préexistant", source="manual", validation_status="validated"
    )
    db.add(chapter)
    db.flush()
    lesson = m.Lesson(
        chapter_id=chapter.id, title="Leçon préexistante", status="validated", created_by="parent"
    )
    db.add(lesson)
    db.flush()
    db.add(m.LessonSkill(lesson_id=lesson.id, skill_id=skill.id))
    db.commit()


def _as_papa() -> None:
    app.dependency_overrides[get_current_user] = lambda: {"username": "papa", "role": "papa"}


# ---------------------------------------------------------------------------
# Génération : orchestration en mémoire, rien de persisté (décision 1).
# ---------------------------------------------------------------------------


def test_generate_preview_is_in_memory_only(client_db) -> None:
    """VERROU des trois tables : la génération ne crée AUCUN chapitre, AUCUNE leçon,
    AUCUNE liaison — ni aucune `Skill` (l'upsert est réservé au confirm)."""
    _, Session = client_db
    with Session() as db:
        _seed_existing_curriculum(db)
        before = (
            _count(db, m.Chapter),
            _count(db, m.Lesson),
            _count(db, m.LessonSkill),
            _count(db, m.Skill),
        )

        preview = generate_skills_backfill(db, FakeLLMProvider(), _subject_id(db), "5e")

        after = (
            _count(db, m.Chapter),
            _count(db, m.Lesson),
            _count(db, m.LessonSkill),
            _count(db, m.Skill),
        )
        assert after == before  # rien n'a bougé dans les trois tables + skills

        # Prévisualisation : 3 chapitres d'échafaudage (FakeLLMProvider), notions dédupliquées.
        assert preview["level"] == "5e"
        assert preview["cycle"] == "cycle 4"
        assert preview["program_version"] == "2020"
        assert preview["failed_scaffolds"] == []
        assert len(preview["groups"]) == 3
        for group in preview["groups"]:
            assert group["notions"] == _EXPECTED_NOTIONS  # dédup intra-échafaudage

        # Une trace `ai_jobs` dédiée, réussie, avec la version de prompt v2.
        jobs = _backfill_jobs(db)
        assert len(jobs) == 1
        assert jobs[0].status == "succeeded"
        assert jobs[0].input_json["prompt_version"] == curriculum.CURRICULUM_PROMPT_VERSION
        assert jobs[0].input_json["level"] == "5e"
        assert jobs[0].input_json["provider"] == "FakeLLMProvider"
        assert jobs[0].output_json["scaffolds_ok"] == 3
        assert jobs[0].output_json["scaffolds_failed"] == 0


def test_generate_partial_failure_records_failed_scaffold(client_db) -> None:
    """Décision 4 : un chapitre d'échafaudage en échec (après réparation) → `failed_scaffolds`
    renseigné, le reste de la prévisualisation présent (liste partielle plutôt que rien)."""
    _, Session = client_db
    valid = json.dumps(_DEFAULT_LESSONS, ensure_ascii=False)
    # scaffold 0 : valide · scaffold 1 : invalide + réparation invalide · scaffold 2 : valide.
    llm = _MixedLLM([valid, "pas du json", "toujours pas", valid])
    with Session() as db:
        preview = generate_skills_backfill(db, llm, _subject_id(db), "5e")

        failed_title = _DEFAULT_CURRICULUM["chapters"][1]["title"]  # « Théorème de Pythagore »
        assert preview["failed_scaffolds"] == [failed_title]
        assert len(preview["groups"]) == 2
        assert failed_title not in {g["scaffold_chapter"] for g in preview["groups"]}
        # Génération considérée réussie malgré l'échec partiel.
        job = _backfill_jobs(db)[0]
        assert job.status == "succeeded"
        assert job.output_json["scaffolds_failed"] == 1
        assert job.output_json["scaffolds_ok"] == 2
        # Toujours rien persisté.
        assert (_count(db, m.Chapter), _count(db, m.Lesson), _count(db, m.LessonSkill)) == (0, 0, 0)


def test_generate_pass1_failure_raises_clean(client_db) -> None:
    """Échec de la passe 1 (chapitres invalides × 2) → erreur propre, trace `failed`,
    aucune prévisualisation (sans chapitres, rien à proposer). Rien de persisté."""
    _, Session = client_db
    llm = _SequenceLLM(['{"bad": true}', '{"still": "wrong"}'])
    with Session() as db:
        with pytest.raises(CurriculumGenerationError):
            generate_skills_backfill(db, llm, _subject_id(db), "5e")
        assert llm.calls == 2  # une réparation tentée, puis abandon
        assert (_count(db, m.Chapter), _count(db, m.Lesson), _count(db, m.Skill)) == (0, 0, 1)
        jobs = _backfill_jobs(db)
        assert len(jobs) == 1
        assert jobs[0].status == "failed"


def test_generate_rejects_non_cycle4_level(client_db) -> None:
    """Le rattrapage ne couvre que le cycle 4 : lycée (2de) et cycle 3 (6e) → 400."""
    _, Session = client_db
    with Session() as db:
        sid = _subject_id(db)
        for bad_level in ("2de", "6e", "cm2"):
            with pytest.raises(HTTPException) as exc:
                generate_skills_backfill(db, FakeLLMProvider(), sid, bad_level)
            assert exc.value.status_code == 400
        assert _backfill_jobs(db) == []  # refusé avant toute trace


def test_generate_subject_404(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        with pytest.raises(HTTPException) as exc:
            generate_skills_backfill(db, FakeLLMProvider(), 9999, "5e")
        assert exc.value.status_code == 404


def test_generate_privacy_invariant_no_student_data(client_db) -> None:
    """ADR-0009 addendum, condition 1 : aucune donnée de Massimo dans system+prompt, sur
    l'ENSEMBLE des appels (passe 1 + toutes les passes 2)."""
    _, Session = client_db
    with Session() as db:
        profile = db.scalars(select(m.StudentProfile)).first()
        user = db.scalars(select(m.User)).first()
        student_fields = [profile.first_name, user.name, user.email]

        llm = _RecordingLLM()
        generate_skills_backfill(db, llm, _subject_id(db), "5e")

    haystack = "\n".join(llm.systems + llm.prompts)
    for value in student_fields:
        assert value, "champ élève vide : le test perdrait son sens"
        assert value not in haystack


# ---------------------------------------------------------------------------
# Confirmation : upsert au niveau cible, réutilise la passe 2, sans liaison.
# ---------------------------------------------------------------------------


def test_confirm_upserts_target_level_without_links(client_db) -> None:
    """Décision 1/2 : upsert des `Skill` au niveau cible, AUCUNE ligne `lesson_skills`.
    La « Nombres relatifs » seedée en 4e n'est pas réutilisée pour la 5e (clé = niveau)."""
    _, Session = client_db
    with Session() as db:
        sid = _subject_id(db)
        result = confirm_skills_backfill(db, sid, "5e", ["Nombres relatifs", "Fractions"])

        assert result == {"created": 2, "existing": 0}
        assert _count(db, m.LessonSkill) == 0  # jamais de liaison dans ce flux
        skills = _skills(db)
        assert len(skills) == 3  # 1 seedée (4e) + 2 créées (5e)
        new_5e = {s.name for s in skills if s.level == "5e"}
        assert new_5e == {"Nombres relatifs", "Fractions"}
        assert {s.name for s in skills if s.level == "4e"} == {"Nombres relatifs"}  # seed intacte

        # Idempotence : re-confirmer la même liste ne crée rien.
        again = confirm_skills_backfill(db, sid, "5e", ["Nombres relatifs", "Fractions"])
        assert again == {"created": 0, "existing": 2}
        assert _count(db, m.LessonSkill) == 0
        assert len(_skills(db)) == 3


def test_confirm_reuses_existing_skill_at_same_level(client_db) -> None:
    """À niveau égal, une notion déjà présente (seed) est réutilisée, pas dupliquée."""
    _, Session = client_db
    with Session() as db:
        sid = _subject_id(db)
        seeded = db.scalars(select(m.Skill)).first()  # « Nombres relatifs » 4e

        result = confirm_skills_backfill(db, sid, "4e", ["Nombres relatifs", "Nouvelle notion"])

        assert result == {"created": 1, "existing": 1}
        skills = _skills(db)
        assert len(skills) == 2
        assert seeded.id == db.scalars(
            select(m.Skill).where(m.Skill.name == "Nombres relatifs", m.Skill.level == "4e")
        ).first().id  # la ligne seedée est réutilisée, pas recréée


def test_confirm_dedup_is_case_and_space_insensitive(client_db) -> None:
    """Trois variantes casse/espaces d'une même notion → une seule `Skill` créée."""
    _, Session = client_db
    with Session() as db:
        sid = _subject_id(db)
        result = confirm_skills_backfill(db, sid, "5e", ["  Fractions ", "fractions", "FRACTIONS"])
        assert result == {"created": 1, "existing": 0}
        created = [s for s in _skills(db) if s.level == "5e"]
        assert len(created) == 1
        assert created[0].name == "Fractions"  # forme « jolie » de la 1re occurrence


def test_confirm_rejects_non_cycle4_level(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        sid = _subject_id(db)
        with pytest.raises(HTTPException) as exc:
            confirm_skills_backfill(db, sid, "2de", ["Fractions"])
        assert exc.value.status_code == 400
        assert _skills(db) == [db.scalars(select(m.Skill)).first()]  # rien créé


# ---------------------------------------------------------------------------
# API : garde parent, flux generate → confirm, validations, 503 sans clé.
# ---------------------------------------------------------------------------


def test_skills_backfill_routes_are_parent_only(client_db) -> None:
    """Garde `require_parent` : le rôle child (conftest) est refusé sur les deux routes."""
    client, _ = client_db  # conftest = rôle child
    gen = client.post(
        "/api/curriculum/skills-backfill/generate", json={"subject_id": 1, "level": "5e"}
    )
    assert gen.status_code == 403
    conf = client.post(
        "/api/curriculum/skills-backfill/confirm",
        json={"subject_id": 1, "level": "5e", "notions": [{"scaffold_chapter": "X", "name": "Y"}]},
    )
    assert conf.status_code == 403


def test_skills_backfill_generate_then_confirm_flow(client_db) -> None:
    client, Session = client_db
    _as_papa()
    with Session() as db:
        sid = _subject_id(db)

    res = client.post(
        "/api/curriculum/skills-backfill/generate", json={"subject_id": sid, "level": "5e"}
    )
    assert res.status_code == 200
    preview = res.json()
    assert preview["level"] == "5e"
    assert len(preview["groups"]) == 3
    assert preview["failed_scaffolds"] == []

    # Le client porte la liste revue (stateless) : on aplatit la prévisualisation.
    notions = [
        {"scaffold_chapter": g["scaffold_chapter"], "name": n}
        for g in preview["groups"]
        for n in g["notions"]
    ]
    res = client.post(
        "/api/curriculum/skills-backfill/confirm",
        json={"subject_id": sid, "level": "5e", "notions": notions},
    )
    assert res.status_code == 200
    # 3 notions distinctes (dédupliquées entre les échafaudages par l'upsert).
    assert res.json() == {"created": 3, "existing": 0}

    with Session() as db:
        created = [s for s in _skills(db) if s.level == "5e"]
        assert {s.name for s in created} == set(_EXPECTED_NOTIONS)
        assert _count(db, m.LessonSkill) == 0

    # Re-confirmer : idempotent.
    res = client.post(
        "/api/curriculum/skills-backfill/confirm",
        json={"subject_id": sid, "level": "5e", "notions": notions},
    )
    assert res.json() == {"created": 0, "existing": 3}


def test_generate_invalid_level_returns_400(client_db) -> None:
    client, Session = client_db
    _as_papa()
    with Session() as db:
        sid = _subject_id(db)
    res = client.post(
        "/api/curriculum/skills-backfill/generate", json={"subject_id": sid, "level": "2de"}
    )
    assert res.status_code == 400
    assert "cycle 4" in res.json()["detail"]


def test_generate_returns_503_without_api_key(client_db, monkeypatch) -> None:
    """Sans clé cloud, la génération renvoie 503 explicite (même résolveur que la passe 1) —
    jamais de bascule silencieuse. Le confirm, lui, n'appelle pas le LLM."""
    client, Session = client_db
    _as_papa()
    with Session() as db:
        sid = _subject_id(db)
    # On retire le mock du provider curriculum pour exercer le vrai résolveur.
    del app.dependency_overrides[get_curriculum_provider]
    monkeypatch.setattr(settings, "curriculum_llm_provider", "anthropic")
    monkeypatch.setattr(settings, "anthropic_api_key", None)

    res = client.post(
        "/api/curriculum/skills-backfill/generate", json={"subject_id": sid, "level": "5e"}
    )
    assert res.status_code == 503
    assert "CURRICULUM_LLM_PROVIDER=ollama" in res.json()["detail"]
