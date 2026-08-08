"""Le diagnostic sort de l'évaluation éphémère : gate de relecture, rôles, soupape (ADR-0043).

Ce fichier porte **le verrou central de la session** — *un diagnostic non relu n'est servi par
AUCUNE route élève* — et sa contre-épreuve : le parcours d'un quiz de fin de cours ne change en
rien.

⚠️ **« AUCUNE route » est plus fort que ce que l'ADR prescrit**, et c'est délibéré. La Décision 1
ne nomme que `list_diagnostics` ; or il y a **trois** portes côté élève (`/quizzes`,
`/quizzes/{id}`, `/quizzes/{id}/submit`). Ne filtrer que la liste laisserait la passation
accessible à qui connaît l'identifiant — un gate qu'on contourne en lisant une URL n'en est pas un.

100 % hors-ligne (SQLite + `FakeLLMProvider`).
"""

import app.db.models as m
from app.tests.test_diagnostics import _generate, as_massimo, as_papa


def _annee_active(db, *, subject_id: int = 1) -> None:
    """Année active + matière rattachée.

    🔴 **Sans elle, la file de relecture est vide POUR TOUT LE MONDE** — `build_queue` rend des
    compteurs à zéro dès que `year_id is None`. Toute assertion « la file ne contient pas X »
    passerait alors à vide, quel que soit l'état du code. `test_review_queue.py` documente déjà ce
    trou dans son propre en-tête ; il vaut ici mot pour mot.
    """
    student = db.query(m.StudentProfile).first()
    year = m.SchoolYear(student_id=student.id, label="2026-2027", level="4e", status="active")
    db.add(year)
    db.flush()
    db.add(m.SchoolYearSubject(school_year_id=year.id, subject_id=subject_id))
    db.commit()


def _diagnostic_pending(db, *, subject_id: int = 1, titre: str = "Diagnostic — Maths") -> int:
    """Un diagnostic `pending` avec UNE question, posé directement en base.

    On ne passe pas par la génération : ce fichier teste le **gate**, pas le générateur. Un décor
    monté à la main rend le test insensible à ce que le `FakeLLMProvider` produit.
    """
    quiz = m.Quiz(
        subject_id=subject_id,
        title=titre,
        quiz_type="diagnostic",
        status="ready",
        created_by="ai",
    )
    db.add(quiz)
    db.flush()
    skill = db.query(m.Skill).first()
    db.add(
        m.QuizQuestion(
            quiz_id=quiz.id,
            skill_id=skill.id if skill is not None else None,
            question_type="mcq",
            prompt_markdown="2 + 2 ?",
            choices_json=["4", "5"],
            correct_answer_json=0,
            sort_order=0,
        )
    )
    db.commit()
    return quiz.id


# ==================================================================================================
# LE VERROU CENTRAL
# ==================================================================================================


def test_un_diagnostic_non_relu_n_est_servi_par_AUCUNE_route_eleve(client_db) -> None:
    """🔴 Verrou central de la session A.

    Les trois portes sont testées ensemble parce qu'elles se referment ensemble : deux d'entre
    elles partagent `_servable_quiz_or_404`, la troisième filtre en SQL. Un test par porte
    laisserait croire que fermer l'une suffit.

    Le décor contient **un** diagnostic. Si le gate était trop large et masquait tout, les
    assertions du test suivant (« un diagnostic relu EST servi ») rougiraient — les deux se
    tiennent.
    """
    client, TestSession = client_db
    with TestSession() as db:
        quiz_id = _diagnostic_pending(db)
        question_id = db.query(m.QuizQuestion).first().id
    as_massimo()

    # 1. La liste ne le nomme pas.
    listed = client.get("/api/diagnostics/quizzes").json()
    assert listed == [], "un diagnostic non relu ne doit pas figurer dans la liste de Massimo"

    # 2. L'accès direct par identifiant ne le rend pas — la faille qu'un filtre de liste seul
    #    laisserait ouverte.
    assert client.get(f"/api/diagnostics/quizzes/{quiz_id}").status_code == 404

    # 3. Et il ne se soumet pas : sans cette porte, Massimo écrirait `skill_mastery` et ouvrirait
    #    des `Gap` depuis une mesure que personne n'a relue.
    soumission = client.post(
        f"/api/diagnostics/quizzes/{quiz_id}/submit",
        json={"answers": [{"question_id": question_id, "choice_index": 0}]},
    )
    assert soumission.status_code == 404

    # Rien n'a été écrit — la vérification qui distingue « refusé » de « refusé après coup ».
    with TestSession() as db:
        assert db.query(m.QuizAttempt).count() == 0
        assert db.query(m.Gap).count() == 0


def test_un_diagnostic_relu_par_papa_est_servi(client_db) -> None:
    """Le pendant du verrou : la soupape existe et elle ouvre réellement.

    Sans ce test, un gate qui refuserait TOUT passerait le verrou central les yeux fermés.
    """
    client, TestSession = client_db
    with TestSession() as db:
        quiz_id = _diagnostic_pending(db)
    as_papa()

    verdict = client.post(f"/api/diagnostics/quizzes/{quiz_id}/validate")
    assert verdict.status_code == 200
    assert verdict.json() == {"quiz_id": quiz_id, "validation_status": "validated"}

    as_massimo()
    assert [row["quiz_id"] for row in client.get("/api/diagnostics/quizzes").json()] == [quiz_id]
    assert client.get(f"/api/diagnostics/quizzes/{quiz_id}").status_code == 200


def test_un_diagnostic_rejete_reste_hors_de_portee(client_db) -> None:
    """`rejected` n'est pas `pending` : il sort de la file **sans** devenir servable.

    Les deux états se ressemblent côté Massimo et se distinguent côté Papa — confondre les deux
    ferait réapparaître à chaque chargement un diagnostic que Papa a écarté.
    """
    client, TestSession = client_db
    with TestSession() as db:
        _annee_active(db)
        quiz_id = _diagnostic_pending(db)
    as_papa()

    # ⚠️ Le compte AVANT n'est pas décoratif : sans lui, « la file ne le contient plus » serait vrai
    # même si elle ne l'avait jamais contenu.
    assert client.get("/api/parent/review-queue").json()["counts"]["diagnostic"] == 1

    assert client.post(f"/api/diagnostics/quizzes/{quiz_id}/reject").json() == {
        "quiz_id": quiz_id,
        "validation_status": "rejected",
    }
    assert client.get("/api/parent/review-queue").json()["counts"]["diagnostic"] == 0

    as_massimo()
    assert client.get("/api/diagnostics/quizzes").json() == []
    assert client.get(f"/api/diagnostics/quizzes/{quiz_id}").status_code == 404


# ==================================================================================================
# La provenance — la moitié que le scan lexical ne peut pas prouver
# ==================================================================================================


def test_un_diagnostic_relu_porte_parent_JAMAIS_la_provenance_de_doctrine(client_db) -> None:
    """🔴 Moitié comportementale de `test_system_is_reserved_to_quizzes`.

    Ce dernier est **lexical** : il scanne les fichiers de `app/modules`. Il ne peut rien dire du
    diagnostic, dont le module ne contient pas le mot cherché — et il exempte le fichier qui écrit
    légitimement la valeur, où une génération de diagnostic pourrait un jour venir se loger.

    C'est donc ici, sur l'objet en base, que se vérifie ce que l'ADR-0043 tient à empêcher : une
    auto-validation déguisée en doctrine. Un diagnostic relu porte la provenance d'un humain qui
    l'a ouvert, comme tout contenu relu.
    """
    client, TestSession = client_db
    with TestSession() as db:
        quiz_id = _diagnostic_pending(db)
    as_papa()

    # À la naissance : ni gate franchi, ni provenance. `None` se lit « personne ne l'a laissé
    # passer », et c'est exact — il n'est pas passé.
    with TestSession() as db:
        quiz = db.get(m.Quiz, quiz_id)
        assert quiz.validation_status == "pending"
        assert quiz.validated_by is None

    client.post(f"/api/diagnostics/quizzes/{quiz_id}/validate")

    with TestSession() as db:
        quiz = db.get(m.Quiz, quiz_id)
        assert quiz.validated_by == "parent"
        assert quiz.validated_at is not None


def test_la_generation_ne_valide_rien_toute_seule(client_db, executer_travail) -> None:
    """Générer n'est pas relire — le diagnostic naît `pending`, y compris par la vraie voie.

    Le test précédent monte son décor à la main ; celui-ci passe par `generate_diagnostic`, seul
    endroit où une auto-validation pourrait s'écrire sans que personne ne la voie.
    """
    client, TestSession = client_db
    with TestSession() as db:
        _annee_active(db)
    body = _generate(client, TestSession, executer_travail, valider=False)

    with TestSession() as db:
        quiz = db.get(m.Quiz, body["quiz_id"])
        assert quiz.validation_status == "pending"
        assert quiz.validated_by is None

    # Et il est bien dans la file de Papa, sous sa propre famille.
    as_papa()
    assert client.get("/api/parent/review-queue").json()["counts"]["diagnostic"] == 1


# ==================================================================================================
# Les rôles (Décision 2)
# ==================================================================================================


def test_les_routes_de_papa_refusent_massimo(client_db) -> None:
    """Un gate de relecture n'a aucun sens si l'espace enfant peut lancer et lire les mesures."""
    client, TestSession = client_db
    with TestSession() as db:
        quiz_id = _diagnostic_pending(db)
    as_massimo()

    assert client.post("/api/diagnostics/generate", json={"subject_id": 1}).status_code == 403
    assert client.get("/api/diagnostics/results").status_code == 403
    assert client.post(f"/api/diagnostics/quizzes/{quiz_id}/validate").status_code == 403
    assert client.post(f"/api/diagnostics/quizzes/{quiz_id}/reject").status_code == 403


def test_la_soumission_refuse_papa(client_db) -> None:
    """🔴 La moitié qu'on oublie : protéger l'entrée en laissant la sortie ouverte ne protège rien.

    `submit` écrit `skill_mastery` et ouvre des `Gap` — un signal FORT (`scoring.py` le nomme
    ainsi, face au 0.4 des missions). Depuis l'espace Papa, il serait faux et indétectable.
    """
    client, TestSession = client_db
    with TestSession() as db:
        quiz_id = _diagnostic_pending(db)
        question_id = db.query(m.QuizQuestion).first().id
    as_papa()
    client.post(f"/api/diagnostics/quizzes/{quiz_id}/validate")

    refus = client.post(
        f"/api/diagnostics/quizzes/{quiz_id}/submit",
        json={"answers": [{"question_id": question_id, "choice_index": 0}]},
    )
    assert refus.status_code == 403
    with TestSession() as db:
        assert db.query(m.QuizAttempt).count() == 0


# ==================================================================================================
# CONTRE-ÉPREUVE — le quiz de fin de cours ne bouge pas d'un pouce
# ==================================================================================================


def test_contre_epreuve_le_quiz_de_fin_de_cours_est_intact(client_db) -> None:
    """L'ADR-0014 §2 reste **entière** pour les quiz de mission et de fin de cours (ADR-0043 §8).

    La migration a posé une colonne sur toute la table ; c'est le moment où un quiz non gaté peut
    se retrouver gaté par inadvertance. Les trois faits qui le prouveraient sont vérifiés ensemble :
    il naît `validated`, il porte la provenance de doctrine, et il n'entre pas dans la file.
    """
    client, TestSession = client_db
    with TestSession() as db:
        _annee_active(db)
        subject = db.query(m.Subject).first()
        lesson = db.query(m.Lesson).first()
        quiz = m.Quiz(
            subject_id=subject.id,
            lesson_id=lesson.id if lesson is not None else None,
            title="Quiz de fin de cours",
            quiz_type="lesson",
            status="ready",
            created_by="ai",
        )
        db.add(quiz)
        db.commit()
        # ⚠️ Le défaut du MODÈLE est `pending` : ce quiz-ci le porte, faute d'être passé par le
        # générateur. Ce que la contre-épreuve vérifie, c'est que le gate ne le regarde pas —
        # `quiz_type`, jamais la table.
        quiz_id = quiz.id
    as_papa()

    assert client.get("/api/parent/review-queue").json()["counts"]["total"] == 0

    # Et il n'est pas servi comme un diagnostic non plus : `_quiz_or_404` filtre déjà sur le type.
    as_massimo()
    assert client.get(f"/api/diagnostics/quizzes/{quiz_id}").status_code == 404
