"""Conseil de classe IA (ADR-0020) — narration locale sur évidence, ancrage `skill_id`
anti-hallucination, dégradation gracieuse, Papa-only, pont Commander."""

from datetime import datetime, timezone

from sqlalchemy import select

import app.db.models as m
from app.main import app
from app.modules.ai import get_provider
from app.modules.auth.deps import get_current_user
from app.modules.production.equipment import equip_notion
from app.tests.fakes import FakeEmbeddingProvider, FakeLLMProvider


def _as_parent() -> None:
    app.dependency_overrides[get_current_user] = lambda: {"username": "papa", "role": "papa"}


def _seed_mastery(db, *, score: float = 0.2):
    """Fait apparaître la notion seedée dans l'évidence (maîtrise faible = fragile)."""
    student = db.scalar(select(m.StudentProfile))
    skill = db.scalar(select(m.Skill))
    db.add(
        m.SkillMastery(
            student_id=student.id, skill_id=skill.id, mastery_score=score, status="in_progress"
        )
    )
    db.commit()
    return student, skill


def test_council_requires_parent(client_db) -> None:
    client, _ = client_db
    # Rôle enfant par défaut (conftest) → route Papa refusée.
    assert client.post("/api/reports/class-council", json={}).status_code == 403


def test_generate_empty_evidence_is_graceful(client_db) -> None:
    client, _ = client_db
    _as_parent()
    # Aucune mastery/lacune seedée → pas d'appel LLM, rapport serein.
    r = client.post("/api/reports/class-council", json={})
    assert r.status_code == 200
    body = r.json()
    assert body["subjects"] == []
    assert "assez de données" in body["global_summary"].lower()


def test_generate_narrates_and_anchors_skill_ids(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        _, skill = _seed_mastery(db)
        real_id = skill.id
        subject_id = db.get(m.Skill, real_id).subject_id
    _as_parent()
    # Le LLM (fake) renvoie une reco mêlant le skill réel ET un id inventé (999999).
    app.dependency_overrides[get_provider] = lambda: FakeLLMProvider(
        council={
            "global_summary": "Bilan encourageant.",
            "subjects": [
                {
                    "subject_id": subject_id,
                    "subject_name": "Mathématiques",
                    "strengths": "des bases solides",
                    "to_reinforce": "une notion en construction",
                    "recent_evolution": "stable",
                    "recommendations": [
                        {
                            "skill_ids": [real_id, 999999],
                            "mission_type": "manual",
                            "template_hint": "recall_first",
                            "justification": "maîtrise en construction",
                        }
                    ],
                }
            ],
        }
    )
    r = client.post("/api/reports/class-council", json={"period": "Trimestre 1"})
    assert r.status_code == 200
    body = r.json()
    assert body["period"] == "Trimestre 1"
    assert len(body["subjects"]) == 1
    reco = body["subjects"][0]["recommendations"][0]
    # Ancrage : le skill réel est gardé, l'id inventé (hors évidence) est retiré.
    assert real_id in reco["skill_ids"]
    assert 999999 not in reco["skill_ids"]
    assert reco["skill_names"] and all(reco["skill_names"])  # noms résolus pour l'affichage
    # Trace IA + persistance figée.
    with Session() as db:
        job = db.scalar(select(m.AIJob).where(m.AIJob.job_type == "council_generate"))
        assert job is not None and job.status == "succeeded"
        report = db.scalar(select(m.CouncilReport))
        assert report is not None and report.evidence_snapshot_json["subjects"]


def test_anchoring_drops_unknown_subject(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        _seed_mastery(db)
    _as_parent()
    app.dependency_overrides[get_provider] = lambda: FakeLLMProvider(
        council={
            "global_summary": "x",
            "subjects": [
                {
                    "subject_id": 987654,  # matière absente de l'évidence
                    "subject_name": "Inventée",
                    "strengths": "",
                    "to_reinforce": "",
                    "recent_evolution": "",
                    "recommendations": [],
                }
            ],
        }
    )
    r = client.post("/api/reports/class-council", json={})
    assert r.status_code == 200
    assert r.json()["subjects"] == []  # matière hors évidence retirée


def test_create_missions_from_reco_reuses_commander(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        _, skill = _seed_mastery(db)
        real_id = skill.id
    _as_parent()
    r = client.post(
        "/api/reports/class-council/create-missions",
        json={"skill_ids": [real_id], "force_priority": True},
    )
    assert r.status_code == 200
    assert len(r.json()) == 1
    with Session() as db:
        mission = db.scalar(select(m.Mission).where(m.Mission.mission_type == "manual"))
        assert mission is not None
        assert mission.skill_id == real_id
        # 5ter : validée par construction (le clic Papa EST l'approbation) + priorité forcée.
        assert mission.validation_status == "validated"
        assert mission.force_priority is True


def _seed_validated_lesson_for_skill(db):
    """Année active → matière → chapitre validé → leçon validée + contenu, rattachée à la notion."""
    subject = db.scalar(select(m.Subject))
    skill = db.scalar(select(m.Skill))
    student = db.scalar(select(m.StudentProfile))
    year = m.SchoolYear(student_id=student.id, label="2026-2027", level="4e", status="active")
    db.add(year)
    db.flush()
    sysr = m.SchoolYearSubject(school_year_id=year.id, subject_id=subject.id, status="active")
    db.add(sysr)
    db.flush()
    chap = m.Chapter(
        school_year_subject_id=sysr.id, name="Ch", validation_status="validated", sort_order=0
    )
    db.add(chap)
    db.flush()
    lesson = m.Lesson(
        chapter_id=chap.id,
        title="Leçon",
        status="validated",
        created_by="ai",
        content_markdown="# Titre\n\nUn contenu de cours suffisant pour dériver.",
        program_version="2020",
        sort_order=0,
    )
    db.add(lesson)
    db.flush()
    db.add(m.LessonSkill(lesson_id=lesson.id, skill_id=skill.id))
    db.commit()
    return lesson, skill


# --- L'équipement : la ROUTE enfile, l'ORCHESTRATEUR produit (ADR-0041 §4) ----------------------
#
# ⚠️ **Changement de contrat VOULU, pas un test rendu vert.** La route tenait la requête HTTP
# pendant cinq générations LLM (~69 s) ; elle rend désormais 202 + un travail. Les trois
# comportements que les tests d'origine protégeaient — dégradation sans leçon, auto-validation,
# idempotence — n'ont pas changé d'un caractère : ils vivent dans `equipment.equip_notion`, qui
# n'est pas touché. On les exerce donc **directement sur l'orchestrateur**, patron déjà en place
# dans `test_settings_autonomy.py`. Ce qui se teste au niveau de la route, c'est ce que la route
# fait maintenant : enfiler.


def test_equip_notion_route_enqueues_and_returns_immediately(client_db, file_rq_factice) -> None:
    """La route rend la main tout de suite, et le travail existe EN BASE avant d'être enfilé."""
    client, Session = client_db
    with Session() as db:
        sid = db.scalar(select(m.Skill)).id
    _as_parent()
    r = client.post("/api/reports/class-council/equip-notion", json={"skill_id": sid})
    assert r.status_code == 202
    body = r.json()
    assert body["status"] == "queued"

    with Session() as db:
        job = db.get(m.AIJob, body["job_id"])
        # ⚠️ L'ordre est le verrou : la ligne doit être VISIBLE (commitée) avant l'enfilement,
        # sinon le worker peut la prendre avant qu'elle existe — et la barre ne peut pas
        # l'annoncer « en file » au retour de la route.
        assert job is not None and job.status == "queued"
        assert job.job_type == "equip_notion"
        assert job.input_json == {"skill_id": sid}
        assert job.started_at is None and job.finished_at is None

    assert len(file_rq_factice.enqueued) == 1, "le travail doit partir dans la file"


def test_equip_notion_sans_lecon_saute_les_quatre_pieces_lecon_centrees(client_db) -> None:
    """Notion orpheline : les quatre pièces leçon-centrées restent hors d'atteinte.

    ⚠️ **Ce test a changé de sens le 2026-08-07 (ADR-0042), délibérément.** Il affirmait que
    les CINQ pièces étaient sautées — la doctrine « pas de leçon, rien à produire ». Le quiz a
    depuis appris à s'ancrer sur la notion : l'inclure encore dans `skipped` reviendrait à
    verrouiller le trou que l'ADR-0042 vient de combler.

    Ce qui reste vrai et que ce test protège : **on ne fabrique toujours ni chapitre ni leçon à
    la volée** (interdit ADR-0021 décision 3, non levé). Cours, fiche, SRS et mindmap sont
    leçon-centrés et le demeurent.

    Ici la notion n'a aucune source RAG, donc le quiz est **refusé par le plancher** de
    l'ADR-0042 §3 — et le refus se DIT (`errors`), il ne se tait pas.
    """
    _, Session = client_db
    with Session() as db:
        skill = db.scalar(select(m.Skill))
        body = equip_notion(
            db, skill_id=skill.id, llm=FakeLLMProvider(), embedder=FakeEmbeddingProvider()
        )
    assert body["has_lesson"] is False
    assert body["generated"] == []
    assert set(body["skipped"]) == {"cours", "fiche", "srs", "mindmap"}
    assert [e["piece"] for e in body["errors"]] == ["quiz"]
    assert "source" in body["errors"][0]["message"]


def test_equip_notion_generates_and_autovalidates_kit(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        _seed_validated_lesson_for_skill(db)
        sid = db.scalar(select(m.Skill)).id
        body = equip_notion(
            db, skill_id=sid, llm=FakeLLMProvider(), embedder=FakeEmbeddingProvider()
        )
    assert body["has_lesson"] is True
    assert body["errors"] == []
    # Cours déjà validé → sauté (idempotence) ; les dérivés sont générés.
    assert "cours" in body["skipped"]
    assert {"fiche", "srs", "quiz", "mindmap"}.issubset(set(body["generated"]))
    # Auto-validation en base : le kit est utilisable par une mission tout de suite.
    with Session() as db:
        assert db.scalar(
            select(m.Fiche).where(m.Fiche.validation_status == "validated")
        ) is not None
        assert db.scalar(
            select(m.Mindmap).where(m.Mindmap.validation_status == "validated")
        ) is not None
        assert db.scalar(
            select(m.Quiz).where(m.Quiz.quiz_type == "mission", m.Quiz.status == "ready")
        ) is not None
    # Idempotence : un 2e passage ne régénère pas les pièces déjà validées.
    with Session() as db:
        again = equip_notion(
            db, skill_id=sid, llm=FakeLLMProvider(), embedder=FakeEmbeddingProvider()
        )
    assert {"fiche", "quiz", "mindmap"}.issubset(set(again["skipped"]))


def test_equip_notion_does_not_regenerate_existing_pending_content(client_db) -> None:
    """Une pièce déjà créée (brouillon `pending` de Papa) n'est PAS régénérée — juste validée."""
    _, Session = client_db
    with Session() as db:
        lesson, _ = _seed_validated_lesson_for_skill(db)
        # Papa a déjà créé une fiche (encore `pending`).
        db.add(m.Fiche(lesson_id=lesson.id, validation_status="pending", source="manual"))
        db.commit()
        sid = db.scalar(select(m.Skill)).id
        body = equip_notion(
            db, skill_id=sid, llm=FakeLLMProvider(), embedder=FakeEmbeddingProvider()
        )
    # La fiche existante est SAUTÉE (pas régénérée), pas dans `generated`.
    assert "fiche" in body["skipped"]
    assert "fiche" not in body["generated"]
    with Session() as db:
        fiches = list(db.scalars(select(m.Fiche)))
        assert len(fiches) == 1  # aucune fiche en double
        assert fiches[0].validation_status == "validated"  # le brouillon a été validé, pas recréé


def test_list_and_get_report(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        _seed_mastery(db)
    _as_parent()
    rid = client.post("/api/reports/class-council", json={"period": "T1"}).json()["id"]
    listed = client.get("/api/reports/class-council").json()
    assert any(item["id"] == rid and item["period"] == "T1" for item in listed)
    detail = client.get(f"/api/reports/class-council/{rid}").json()
    assert detail["id"] == rid and detail["period"] == "T1"


# --- Pont d'actionnabilité CROISÉ (ADR-0022 §8) : reco champion → mission champion -------------


def test_create_champion_from_reco(client_db) -> None:
    """`create-champion` compose UNE mission `champion` multi-matières à partir de notions
    (déjà équipées côté page). Papa-only, validated par construction, étapes taggées `skill_id`."""
    client, Session = client_db
    with Session() as db:
        subj_a = db.scalar(select(m.Subject))  # Mathématiques (seedé)
        skill_a = db.scalar(select(m.Skill))
        subj_b = m.Subject(name="Français", slug="francais")
        db.add(subj_b)
        db.flush()
        skill_b = m.Skill(subject_id=subj_b.id, name="Temps du récit", level="4e")
        db.add(skill_b)
        db.commit()
        ids = [skill_a.id, skill_b.id]
    _as_parent()
    res = client.post(
        "/api/reports/class-council/create-champion",
        json={"skill_ids": ids, "flavor": "consolidation"},
    )
    assert res.status_code == 200
    mission = res.json()
    assert mission["mission_type"] == "champion"
    assert mission["subject_id"] is None and mission["skill_id"] is None
    assert mission["validation_status"] == "validated"
    assert {s["skill_id"] for s in mission["steps"]} == set(ids)


def test_create_champion_requires_two_subjects(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        subj_a = db.scalar(select(m.Subject))
        s1 = db.scalar(select(m.Skill))
        s2 = m.Skill(subject_id=subj_a.id, name="Autre notion maths", level="4e")
        db.add(s2)
        db.commit()
        ids = [s1.id, s2.id]
    _as_parent()
    res = client.post(
        "/api/reports/class-council/create-champion",
        json={"skill_ids": ids, "flavor": "consolidation"},
    )
    assert res.status_code == 422  # 1 seule matière → pas une croisée


# ==================================================================================================
# Portée matière (adr-0020-conseil-de-classe-ia (Amendement 1))
# ==================================================================================================


def _seed_deux_matieres(Session) -> tuple[int, int, int, int]:
    """Deux matières avec chacune une notion fragile. Rend `(sujet_a, skill_a, sujet_b, skill_b)`."""
    with Session() as db:
        student = db.scalar(select(m.StudentProfile))
        a = db.scalar(select(m.Subject))
        b = m.Subject(name="SVT", slug="svt")
        db.add(b)
        db.flush()
        skill_a = db.scalar(select(m.Skill))
        skill_b = m.Skill(subject_id=b.id, name="Photosynthèse", level="4e")
        db.add(skill_b)
        db.flush()
        for skill in (skill_a, skill_b):
            db.add(
                m.SkillMastery(
                    student_id=student.id, skill_id=skill.id, mastery_score=0.2, status="weak"
                )
            )
        db.commit()
        return a.id, skill_a.id, b.id, skill_b.id


def _fake_council(subject_id: int, subject_name: str, skill_id: int) -> None:
    app.dependency_overrides[get_provider] = lambda: FakeLLMProvider(
        council={
            "global_summary": "Synthèse.",
            "subjects": [
                {
                    "subject_id": subject_id,
                    "subject_name": subject_name,
                    "strengths": "",
                    "to_reinforce": "",
                    "recent_evolution": "",
                    "recommendations": [
                        {"skill_ids": [skill_id], "template_hint": "", "justification": "x"}
                    ],
                }
            ],
        }
    )


def test_le_conseil_cible_ne_narre_QUE_sa_matiere(client_db) -> None:
    """La restriction de `_build_context`. Sans elle, le contexte porte les deux matières."""
    client, Session = client_db
    sujet_a, skill_a, _sujet_b, _skill_b = _seed_deux_matieres(Session)
    _as_parent()
    _fake_council(sujet_a, "Mathématiques", skill_a)

    body = client.post("/api/reports/class-council", json={"subject_id": sujet_a}).json()

    assert body["subject_id"] == sujet_a
    assert body["subject_name"] == "Mathématiques"
    with Session() as db:
        rapport = db.scalar(select(m.CouncilReport).order_by(m.CouncilReport.id.desc()))
        evidence = rapport.evidence_snapshot_json
    assert len(evidence["subjects"]) == 1, "l'évidence ne doit porter QUE la matière ciblée"
    assert evidence["subjects"][0]["subject_id"] == sujet_a
    assert evidence["scope"]["subject_id"] == sujet_a


def test_l_ancrage_rejette_une_autre_matiere_en_portee_ciblee(client_db) -> None:
    """L'ancrage hérite de la portée GRATUITEMENT — `allowed_subject_ids` dérive du contexte.

    C'est exactement le genre de propriété qu'un refactor casse en silence : il suffit de calculer
    `allowed_subject_ids` AVANT le filtrage « pour clarifier », et une matière hors portée passe.
    D'où ce verrou : un modèle qui nomme une matière VALIDE mais hors portée doit rendre un rapport
    vide.
    """
    client, Session = client_db
    sujet_a, _skill_a, sujet_b, skill_b = _seed_deux_matieres(Session)
    _as_parent()
    # Conseil ciblé sur A, mais le modèle raconte B — qui existe, et a de l'évidence.
    _fake_council(sujet_b, "SVT", skill_b)

    body = client.post("/api/reports/class-council", json={"subject_id": sujet_a}).json()

    assert body["subjects"] == [], "une matière hors portée doit être rejetée par l'ancrage"


def test_l_evolution_recente_est_ECRASEE_quand_l_evidence_ne_porte_aucune_bascule(
    client_db,
) -> None:
    """Miroir exact du verrou de portée matière, sur le CONTENU au lieu de la PORTÉE (adr-0040 §8.1).

    Le défaut corrigé : `recent_evolution` était un `str` NON-NULLABLE pour une valeur qu'aucune
    source ne peut produire — le `period` du Conseil ne sélectionne aucune donnée. Le producteur
    remplissait donc parce que le TYPE l'y obligeait, et la phrase inventée était figée dans
    `subjects_json`, devenant rétroactivement indiscernable d'une observation réelle.

    ⚠️ L'assertion qui compte porte sur le FIGÉ, pas sur la réponse HTTP. Un écrasement fait à la
    sérialisation laisserait la base mentir en silence, et c'est la base qu'on relit dans six mois.
    """
    client, Session = client_db
    sujet_a, skill_a, _sujet_b, _skill_b = _seed_deux_matieres(Session)
    _as_parent()
    # Le modèle AFFIRME une évolution. L'évidence n'en porte aucune : elle doit disparaître.
    app.dependency_overrides[get_provider] = lambda: FakeLLMProvider(
        council={
            "global_summary": "Synthèse.",
            "subjects": [
                {
                    "subject_id": sujet_a,
                    "subject_name": "Mathématiques",
                    "strengths": "",
                    "to_reinforce": "",
                    "recent_evolution": "Nette progression depuis trois semaines.",
                    "recommendations": [
                        {"skill_ids": [skill_a], "template_hint": "", "justification": "x"}
                    ],
                }
            ],
        }
    )

    body = client.post("/api/reports/class-council", json={"subject_id": sujet_a}).json()

    assert body["subjects"], "la matière ciblée doit bien être narrée : on teste le champ, pas l'ancrage"
    assert body["subjects"][0]["recent_evolution"] is None, (
        "le serveur doit écraser l'évolution que l'évidence ne porte pas"
    )
    with Session() as db:
        rapport = db.scalar(select(m.CouncilReport).order_by(m.CouncilReport.id.desc()))
        fige = rapport.subjects_json
        version = rapport.prompt_version
    assert fige[0]["recent_evolution"] is None, (
        "le rapport FIGÉ ne doit pas conserver la phrase inventée — c'est lui qu'on relira"
    )
    # ⚠️ Cette assertion épinglait le LITTÉRAL `"v3"` jusqu'au 2026-08-06, où le Lot 3 a fait
    # bouger le prompt vers v4. Un littéral n'est pas un verrou : il rougit à chaque édition du
    # prompt, pour une raison qui n'a rien à voir avec ce que le test protège. Ce qui compte est le
    # PRÉDICAT que l'écran applique (`n < 3` ⇒ « rédigée sans historique daté ») : ce rapport-ci ne
    # doit jamais porter cette marque.
    numero = int(version.removeprefix("v").split(".")[0])
    assert numero >= 3, "la marque de lecture de l'écran se dérive de cette version"


def _seed_bascules(Session, skill_id: int) -> list[str]:
    """Trois bascules datées sur une notion. Rend leurs dates ISO, de la plus RÉCENTE à la plus
    ancienne — l'ordre que `mastery_transitions` garantit."""
    with Session() as db:
        student = db.scalar(select(m.StudentProfile))
        for jour, statut in ((10, "weak"), (20, "learning"), (28, "solid")):
            db.add(
                m.SkillMasteryHistory(
                    student_id=student.id,
                    skill_id=skill_id,
                    status=statut,
                    mastery_score=jour,
                    changed_at=datetime(2026, 7, jour, 9, 0, tzinfo=timezone.utc),
                )
            )
        db.commit()
    return ["2026-07-28", "2026-07-20", "2026-07-10"]


def test_le_conseil_CITE_les_bascules_datees_et_aucune_autre(client_db) -> None:
    """Le livrable du Lot 3 (adr-0040 §8) : la narration porte des dates RÉELLES, mesurées.

    🔴 Les trois assertions qui comptent :
      · les bascules servies sont exactement celles de l'évidence, dans leur ordre, avec leurs
        vraies dates — le modèle n'en produit AUCUNE, il ne rend qu'un commentaire ;
      · `since` vaut `history_since` et NON `period` (§9) — deux bornes distinctes qui ne
        partagent pas un nom ;
      · `since` figure dans le SNAPSHOT figé (§8.3), sans quoi un rapport relu dans six mois
        serait indiscernable d'un rapport sans borne.
    """
    client, Session = client_db
    sujet_a, skill_a, _sujet_b, _skill_b = _seed_deux_matieres(Session)
    dates = _seed_bascules(Session, skill_a)
    _as_parent()
    _fake_council(sujet_a, "Mathématiques", skill_a)
    # Le modèle commente ; il ne date rien.
    app.dependency_overrides[get_provider] = lambda: FakeLLMProvider(
        council={
            "global_summary": "Synthèse.",
            "subjects": [
                {
                    "subject_id": sujet_a,
                    "subject_name": "Mathématiques",
                    "strengths": "",
                    "to_reinforce": "",
                    "recent_evolution": "Montée régulière sur la trace disponible depuis le 10/07.",
                    "recommendations": [
                        {"skill_ids": [skill_a], "template_hint": "", "justification": "x"}
                    ],
                }
            ],
        }
    )

    body = client.post("/api/reports/class-council", json={"subject_id": sujet_a}).json()
    evolution = body["subjects"][0]["recent_evolution"]

    assert evolution is not None, "une matière qui PORTE des bascules doit les raconter"
    assert [t["changed_at"] for t in evolution["transitions"]] == dates
    assert [t["to"] for t in evolution["transitions"]] == ["solid", "learning", "weak"]
    # `from` est calculé par FENÊTRAGE : la plus ANCIENNE bascule n'a pas de palier de départ, et
    # prétendre le connaître serait une invention.
    assert evolution["transitions"][-1]["from"] is None
    assert evolution["transitions"][0]["from"] == "learning"
    assert evolution["comment"], "le commentaire du modèle est la seule part qui lui revient"

    # `since` = la borne de TRACE, jamais l'étiquette `period` (§9).
    assert evolution["since"] == "2026-07-10"
    assert evolution["since"] != body["period"]

    with Session() as db:
        rapport = db.scalar(select(m.CouncilReport).order_by(m.CouncilReport.id.desc()))
        assert rapport.evidence_snapshot_json["trace"]["since"] == "2026-07-10", (
            "sans `since` au snapshot, un rapport relu dans six mois ne dit plus sur quoi il portait"
        )
        assert rapport.subjects_json[0]["recent_evolution"]["transitions"], (
            "c'est le FIGÉ qu'on relira — un ancrage fait à la sérialisation laisserait la base muette"
        )


def test_une_matiere_SANS_bascule_garde_son_evolution_nulle_meme_avec_une_voisine_qui_en_a(
    client_db,
) -> None:
    """L'écrasement du Lot 0 tient MATIÈRE PAR MATIÈRE, pas globalement.

    Le défaut qu'on prévient : dès qu'UNE matière porte des bascules, il serait tentant de traiter
    « il y a de la trace » comme un état du rapport. Ce serait rouvrir le trou par la fenêtre — la
    voisine, elle, n'a rien bougé, et sa prose serait de nouveau figée comme vraie.
    """
    client, Session = client_db
    sujet_a, skill_a, sujet_b, skill_b = _seed_deux_matieres(Session)
    _seed_bascules(Session, skill_a)  # A bouge, B ne bouge pas
    _as_parent()
    app.dependency_overrides[get_provider] = lambda: FakeLLMProvider(
        council={
            "global_summary": "Synthèse.",
            "subjects": [
                {
                    "subject_id": s_id,
                    "subject_name": nom,
                    "strengths": "",
                    "to_reinforce": "",
                    "recent_evolution": "Nette progression ces dernières semaines.",
                    "recommendations": [
                        {"skill_ids": [sk], "template_hint": "", "justification": "x"}
                    ],
                }
                for s_id, nom, sk in ((sujet_a, "Mathématiques", skill_a), (sujet_b, "SVT", skill_b))
            ],
        }
    )

    body = client.post("/api/reports/class-council", json={}).json()
    par_matiere = {s["subject_id"]: s["recent_evolution"] for s in body["subjects"]}

    assert par_matiere[sujet_a] is not None and par_matiere[sujet_a]["transitions"]
    assert par_matiere[sujet_b] is None, (
        "la matière sans bascule garde son évolution nulle, même quand sa voisine en porte"
    )


def test_le_conseil_GLOBAL_reste_inchange(client_db) -> None:
    """Rétrocompatibilité stricte : `{}` et `{"period": …}` continuent de tout narrer."""
    client, Session = client_db
    sujet_a, skill_a, _sujet_b, _skill_b = _seed_deux_matieres(Session)
    _as_parent()
    _fake_council(sujet_a, "Mathématiques", skill_a)

    body = client.post("/api/reports/class-council", json={"period": "Trimestre 1"}).json()

    assert body["subject_id"] is None, "sans portée, le rapport est GLOBAL"
    with Session() as db:
        rapport = db.scalar(select(m.CouncilReport).order_by(m.CouncilReport.id.desc()))
        evidence = rapport.evidence_snapshot_json
    assert len(evidence["subjects"]) == 2, "le conseil global voit toujours les deux matières"
    assert evidence["scope"] is None


def test_la_liste_rend_TOUT_par_defaut_et_sait_filtrer(client_db) -> None:
    """Sans `subject_id`, la liste rend globaux ET ciblés — c'est ce qui garde le client intact."""
    client, Session = client_db
    sujet_a, skill_a, _sujet_b, _skill_b = _seed_deux_matieres(Session)
    _as_parent()
    _fake_council(sujet_a, "Mathématiques", skill_a)

    client.post("/api/reports/class-council", json={})
    client.post("/api/reports/class-council", json={"subject_id": sujet_a})

    tout = client.get("/api/reports/class-council").json()
    assert len(tout) == 2
    assert {item["subject_id"] for item in tout} == {None, sujet_a}

    cible = client.get(f"/api/reports/class-council?subject_id={sujet_a}").json()
    assert len(cible) == 1 and cible[0]["subject_id"] == sujet_a
    assert cible[0]["subject_name"] == "Mathématiques"


def test_la_troncature_du_conseil_cible_est_DECLAREE(client_db) -> None:
    """Le panneau n'est pas plafonné, le prompt l'est à 16. L'écart doit être AUDITABLE.

    Sans `notions_available`, un rapport ciblé qui ignore 4 notions sur 20 est indiscernable d'un
    rapport complet — et l'auditabilité du figeage, seul argument justifiant l'absence de mode
    aperçu, ne tiendrait plus.
    """
    client, Session = client_db
    with Session() as db:
        student = db.scalar(select(m.StudentProfile))
        sujet = db.scalar(select(m.Subject))
        skills = [m.Skill(subject_id=sujet.id, name=f"N{i}", level="4e") for i in range(20)]
        db.add_all(skills)
        db.flush()
        for skill in skills:
            db.add(
                m.SkillMastery(
                    student_id=student.id, skill_id=skill.id, mastery_score=0.2, status="weak"
                )
            )
        db.commit()
        sujet_id, premier = sujet.id, skills[0].id
    _as_parent()
    _fake_council(sujet_id, "Mathématiques", premier)

    client.post("/api/reports/class-council", json={"subject_id": sujet_id})

    with Session() as db:
        scope = db.scalar(
            select(m.CouncilReport).order_by(m.CouncilReport.id.desc())
        ).evidence_snapshot_json["scope"]
    assert scope["notions_available"] == 20
    assert scope["notions_considered"] == 16, "plafond ciblé, plus large que les 8 du global"
    assert scope["notions_available"] > scope["notions_considered"], "la troncature est déclarée"


def test_la_degradation_gracieuse_est_cadree_sur_la_matiere(client_db) -> None:
    """« Pas assez de données pour un conseil de classe » à propos d'UNE matière laisserait croire
    que toute la scolarité est muette."""
    client, Session = client_db
    with Session() as db:
        vide = m.Subject(name="Espagnol", slug="espagnol")
        db.add(vide)
        db.commit()
        vide_id = vide.id
    _as_parent()

    body = client.post("/api/reports/class-council", json={"subject_id": vide_id}).json()

    assert body["subjects"] == []
    assert "Espagnol" in body["global_summary"]
