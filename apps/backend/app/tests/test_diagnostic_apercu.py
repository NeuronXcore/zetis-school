"""Le bandeau, le rail et les matières jamais mesurées (ADR-0043, spec §Structure).

⚠️ **Cette surface n'était prévue par aucune des trois sessions**, et c'est la Session A qui l'a
rendue nécessaire : en gatant `list_diagnostics` sur `validated`, elle a rendu le PREMIER CRAN
invisible de la seule route qui listait les diagnostics. Or Papa doit voir exactement ce que Massimo
ne voit pas encore.

Le verrou central du fichier est donc celui-là : **le rail montre les trois crans**, là où la route
élève n'en montre qu'un.

100 % hors-ligne (SQLite + `FakeLLMProvider`).
"""

from datetime import datetime, timedelta, timezone

import app.db.models as m
from app.tests.test_diagnostics import as_massimo, as_papa


def _t(jours: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=jours)


def _annee(db, *, subjects: list[str]) -> dict[str, int]:
    """Année active + N matières rattachées. Rend `{nom: subject_id}`.

    ⚠️ La fixture de base ne crée NI année NI rattachement : sans ce décor, l'aperçu rend des
    compteurs à zéro et toute assertion « X n'y est pas » passerait à vide.
    """
    student = db.query(m.StudentProfile).first()
    year = m.SchoolYear(student_id=student.id, label="2026-2027", level="4e", status="active")
    db.add(year)
    db.flush()
    ids: dict[str, int] = {}
    maths = db.query(m.Subject).first()  # « Mathématiques », déjà créée par la fixture
    for rang, nom in enumerate(subjects):
        matiere = maths if nom == maths.name else m.Subject(name=nom, slug=nom.lower(), sort_order=rang)
        if matiere is not maths:
            db.add(matiere)
            db.flush()
        db.add(m.SchoolYearSubject(school_year_id=year.id, subject_id=matiere.id))
        ids[nom] = matiere.id
    db.commit()
    return ids


def _diagnostic(
    db,
    *,
    subject_id: int,
    validation_status: str = "validated",
    passe_le: datetime | None = None,
    score: int = 70,
    notions: int = 1,
    cree_le: datetime | None = None,
) -> int:
    """Un diagnostic à un cran choisi. `passe_le=None` → pas de tentative, donc pas de 3ᵉ cran."""
    student = db.query(m.StudentProfile).first()
    quiz = m.Quiz(
        subject_id=subject_id,
        title="Diagnostic",
        quiz_type="diagnostic",
        status="ready",
        validation_status=validation_status,
        created_at=cree_le or _t(30),
        validated_at=_t(20) if validation_status == "validated" else None,
    )
    db.add(quiz)
    db.flush()
    for rang in range(notions):
        skill = m.Skill(subject_id=subject_id, name=f"Notion {subject_id}-{rang}", level="4e")
        db.add(skill)
        db.flush()
        db.add(
            m.QuizQuestion(
                quiz_id=quiz.id,
                skill_id=skill.id,
                question_type="mcq",
                prompt_markdown="?",
                choices_json=["A", "B"],
                correct_answer_json=0,
                sort_order=rang,
            )
        )
    if passe_le is not None:
        db.add(
            m.QuizAttempt(
                quiz_id=quiz.id,
                student_id=student.id,
                completed_at=passe_le,
                score_percent=score,
                context="diagnostic",
            )
        )
    db.commit()
    return quiz.id


# ==================================================================================================
# LE VERROU CENTRAL — le rail montre ce que la route élève ne montre plus
# ==================================================================================================


def test_le_rail_montre_les_TROIS_crans(client_db) -> None:
    """🔴 Verrou central de la session C.

    Un diagnostic `pending` est **invisible de Massimo** (gate de la Session A) et **doit** être
    visible de Papa : c'est le premier cran, celui qui dit « à relire ». Si cette route se mettait
    à réutiliser le filtre de `list_diagnostics`, le rail perdrait sa raison d'être en silence —
    il resterait rempli, simplement amputé de ce que Papa attend le plus.

    Les deux assertions se tiennent : la même base rend 3 lignes à Papa et 2 à Massimo.
    """
    client, TestSession = client_db
    with TestSession() as db:
        ids = _annee(db, subjects=["Mathématiques", "Français", "SVT"])
        _diagnostic(db, subject_id=ids["Mathématiques"], validation_status="pending")
        _diagnostic(db, subject_id=ids["Français"], validation_status="validated")
        _diagnostic(db, subject_id=ids["SVT"], validation_status="validated", passe_le=_t(5))
    as_papa()

    rail = client.get("/api/diagnostics/apercu").json()["rail"]

    assert {ligne["subject"]: ligne["cran"] for ligne in rail} == {
        "Mathématiques": "genere",
        "Français": "propose",
        "SVT": "passe",
    }

    # Contre-épreuve : la route élève n'en voit que deux — le premier cran lui reste fermé.
    as_massimo()
    assert len(client.get("/api/diagnostics/quizzes").json()) == 2


def test_aucun_score_avant_le_troisieme_cran(client_db) -> None:
    """🔴 `None`, jamais `0`. Un zéro se lirait comme une mesure catastrophique, pas comme une
    absence de mesure — et il n'existe aucun score avant qu'une tentative n'ait été complétée."""
    client, TestSession = client_db
    with TestSession() as db:
        ids = _annee(db, subjects=["Mathématiques", "Français"])
        _diagnostic(db, subject_id=ids["Mathématiques"], validation_status="pending")
        _diagnostic(db, subject_id=ids["Français"], validation_status="validated", passe_le=_t(2), score=45)
    as_papa()

    rail = client.get("/api/diagnostics/apercu").json()["rail"]
    par_cran = {ligne["cran"]: ligne["score_percent"] for ligne in rail}

    assert par_cran["genere"] is None
    assert par_cran["passe"] == 45, "le 3ᵉ cran, lui, porte bien son score — sinon on ne teste rien"


def test_le_rang_se_compte_PAR_MATIERE_et_dans_l_ordre_du_temps(client_db) -> None:
    """« 3ᵉ passation » se lit dans sa matière, pas dans le dépôt entier.

    Le décor entrelace deux matières dans le temps : un compteur global rendrait 1-2-3-4 au lieu de
    1-1-2-2. C'est le seul montage qui distingue les deux.
    """
    client, TestSession = client_db
    with TestSession() as db:
        ids = _annee(db, subjects=["Mathématiques", "Français"])
        _diagnostic(db, subject_id=ids["Mathématiques"], passe_le=_t(90), score=50)
        _diagnostic(db, subject_id=ids["Français"], passe_le=_t(60), score=55)
        _diagnostic(db, subject_id=ids["Mathématiques"], passe_le=_t(30), score=60)
        _diagnostic(db, subject_id=ids["Français"], passe_le=_t(10), score=65)
    as_papa()

    rail = client.get("/api/diagnostics/apercu").json()["rail"]

    # Le rail est servi du plus RÉCENT au plus ancien.
    assert [(l["subject"], l["rang"]) for l in rail] == [
        ("Français", 2),
        ("Mathématiques", 2),
        ("Français", 1),
        ("Mathématiques", 1),
    ]


def test_un_diagnostic_REJETE_sort_du_rail(client_db) -> None:
    """Écarté par Papa, il n'attend plus rien — ni de lui, ni de Massimo.

    Il n'est pas effacé pour autant (ADR-0014 §3) : il sort de la vue, pas de la base.
    """
    client, TestSession = client_db
    with TestSession() as db:
        ids = _annee(db, subjects=["Mathématiques"])
        _diagnostic(db, subject_id=ids["Mathématiques"], validation_status="rejected")
    as_papa()

    assert client.get("/api/diagnostics/apercu").json()["rail"] == []
    with TestSession() as db:
        assert db.query(m.Quiz).count() == 1, "rejeté n'est pas effacé"


def test_une_matiere_HORS_annee_active_ne_pese_sur_rien(client_db) -> None:
    """Bornage à l'année active, comme la Couverture et la file de relecture.

    Le décor pose une matière que l'année n'étudie pas ET un diagnostic passé dessus : sans le
    bornage, elle apparaîtrait dans le rail et gonflerait la jauge des matières mesurées.
    """
    client, TestSession = client_db
    with TestSession() as db:
        ids = _annee(db, subjects=["Mathématiques"])
        _diagnostic(db, subject_id=ids["Mathématiques"], passe_le=_t(3))
        oubliee = m.Subject(name="Latin", slug="latin")
        db.add(oubliee)
        db.flush()
        _diagnostic(db, subject_id=oubliee.id, passe_le=_t(1))
    as_papa()

    apercu = client.get("/api/diagnostics/apercu").json()

    assert [l["subject"] for l in apercu["rail"]] == ["Mathématiques"]
    assert apercu["jauges"]["matieres_total"] == 1
    assert apercu["jauges"]["matieres_mesurees"] == 1


# ==================================================================================================
# LES QUATRE JAUGES
# ==================================================================================================


def test_les_jauges_comptent_ce_que_le_rail_montre(client_db) -> None:
    """Les compteurs et le rail décrivent la MÊME population — sinon le bandeau ment sur sa page.

    Même invariant que la file de relecture (`test_la_file_et_l_inbox_comptent_la_MEME_chose`) :
    deux façons de compter la même chose finissent toujours par diverger.
    """
    client, TestSession = client_db
    with TestSession() as db:
        ids = _annee(db, subjects=["Mathématiques", "Français", "SVT", "Anglais"])
        _diagnostic(db, subject_id=ids["Mathématiques"], passe_le=_t(5))
        _diagnostic(db, subject_id=ids["Français"], validation_status="pending")
        _diagnostic(db, subject_id=ids["SVT"], validation_status="validated")
    as_papa()

    apercu = client.get("/api/diagnostics/apercu").json()
    jauges, rail = apercu["jauges"], apercu["rail"]

    assert jauges["matieres_total"] == 4
    assert jauges["matieres_mesurees"] == 1
    assert jauges["a_relire"] == len([l for l in rail if l["cran"] == "genere"]) == 1
    assert jauges["proposes_non_passes"] == len([l for l in rail if l["cran"] == "propose"]) == 1
    assert jauges["jamais_generees"] == 1  # Anglais
    assert [s["name"] for s in apercu["jamais_genere"]] == ["Anglais"]


def test_la_plus_ancienne_lecture_est_la_DERNIERE_de_chaque_matiere(client_db) -> None:
    """🔴 « Encore invoquée » — pas « la plus vieille du dépôt ».

    Ce qu'on sait d'une matière aujourd'hui, c'est sa mesure la PLUS RÉCENTE. La jauge cherche la
    plus vieille de ces lectures-là : celle sur laquelle on continue de décider avec le moins de
    fraîcheur. Une passation de Maths d'il y a un an n'est plus invoquée si Maths a été remesurée
    depuis.

    Le décor le rend décisif : la passation la plus ancienne du dépôt est une passation de Maths
    (300 j) que deux mesures postérieures ont remplacée. La réponse attendue est SVT (100 j).
    """
    client, TestSession = client_db
    with TestSession() as db:
        ids = _annee(db, subjects=["Mathématiques", "SVT"])
        _diagnostic(db, subject_id=ids["Mathématiques"], passe_le=_t(300))
        _diagnostic(db, subject_id=ids["Mathématiques"], passe_le=_t(10))
        _diagnostic(db, subject_id=ids["SVT"], passe_le=_t(100))
    as_papa()

    lecture = client.get("/api/diagnostics/apercu").json()["jauges"]["plus_ancienne_lecture"]

    assert lecture["subject"] == "SVT"
    assert lecture["jours"] == 100


def test_la_quatrieme_jauge_vaut_zero_par_DECISION(client_db) -> None:
    """`trigger='evidence'` reste fermé : ZETIS ne se commande pas de production sur sa propre
    mesure. La constante est SERVIE pour que la page rende un vide voulu, pas un compteur de panne."""
    client, TestSession = client_db
    with TestSession() as db:
        ids = _annee(db, subjects=["Mathématiques"])
        _diagnostic(db, subject_id=ids["Mathématiques"], passe_le=_t(1))
    as_papa()

    assert client.get("/api/diagnostics/apercu").json()["jauges"]["lots_declenches"] == 0


# ==================================================================================================
# LES BADGES DE LA STATION ② — les deux que l'ADR-0042 a séparés
# ==================================================================================================


def test_aucune_lecon_et_cours_brouillon_ne_se_confondent_PAS(client_db) -> None:
    """🔴 Deux situations, deux gestes de Papa — c'est l'`adr-0042` qui les a séparées.

    Sans leçon, le quiz s'ancre sur la notion : la lacune est **réparable**, Papa produit.
    Avec une leçon en brouillon, la voie notion **refuse** — dernier recours réservé aux notions
    sans leçon — et Papa doit valider le cours.

    Un état unique rendrait les deux indistinguables alors qu'ils ne commandent pas la même action.
    Le décor porte les TROIS cas, sinon on ne teste qu'une branche.
    """
    client, TestSession = client_db
    with TestSession() as db:
        ids = _annee(db, subjects=["Mathématiques"])
        student = db.query(m.StudentProfile).first()
        subject_id = ids["Mathématiques"]

        sys_row = db.query(m.SchoolYearSubject).first()
        chapitre = m.Chapter(school_year_subject_id=sys_row.id, name="Chapitre", validation_status="validated")
        db.add(chapitre)
        db.flush()

        sans, brouillon, validee = (
            m.Skill(subject_id=subject_id, name=nom, level="4e")
            for nom in ("Sans leçon", "Cours en brouillon", "Cours validé")
        )
        db.add_all([sans, brouillon, validee])
        db.flush()
        for skill, statut in ((brouillon, "draft"), (validee, "validated")):
            lecon = m.Lesson(
                chapter_id=chapitre.id, title=f"Leçon {skill.name}", status=statut, created_by="ai"
            )
            db.add(lecon)
            db.flush()
            db.add(m.LessonSkill(lesson_id=lecon.id, skill_id=skill.id))

        quiz = m.Quiz(
            subject_id=subject_id, title="Diagnostic", quiz_type="diagnostic",
            status="ready", validation_status="validated",
        )
        db.add(quiz)
        db.flush()
        attempt = m.QuizAttempt(
            quiz_id=quiz.id, student_id=student.id, completed_at=_t(1), score_percent=20,
            context="diagnostic",
        )
        db.add(attempt)
        db.flush()
        for skill in (sans, brouillon, validee):
            question = m.QuizQuestion(
                quiz_id=quiz.id, skill_id=skill.id, question_type="mcq",
                prompt_markdown="?", choices_json=["A", "B"], correct_answer_json=0, sort_order=0,
            )
            db.add(question)
            db.flush()
            db.add(m.QuizAnswer(attempt_id=attempt.id, question_id=question.id, is_correct=False))
            db.add(
                m.Gap(
                    student_id=student.id, skill_id=skill.id, subject_id=subject_id,
                    source="diagnostic", severity="high", status="open",
                )
            )
        db.commit()
        attempt_id = attempt.id
    as_papa()

    detail = client.get(f"/api/diagnostics/results/{attempt_id}").json()
    etats = {gap["skill_name"]: gap["content_state"] for gap in detail["gaps"]}

    assert etats == {
        "Sans leçon": "aucune_lecon",
        "Cours en brouillon": "cours_brouillon",
        "Cours validé": "ok",
    }
    # …et la jauge compte les deux premiers, pas le troisième.
    assert client.get("/api/diagnostics/apercu").json()["jauges"]["lacunes_sans_contenu"] == 2


def test_l_apercu_est_reserve_a_papa(client_db) -> None:
    """Surface d'analyse : elle montre à Papa ce que le gate cache à Massimo. La lui ouvrir
    annulerait le gate par la porte de derrière."""
    client, _ = client_db
    as_massimo()

    assert client.get("/api/diagnostics/apercu").status_code == 403
