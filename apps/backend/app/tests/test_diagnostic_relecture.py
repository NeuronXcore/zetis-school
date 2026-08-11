"""Papa peut LIRE un diagnostic avant de le laisser passer (ADR-0051, session A).

Ce fichier porte **le verrou central de la session** : *Papa ouvre un diagnostic non relu, avec ses
clés — et les trois routes élève continuent de rendre 404.* Les deux moitiés vivent dans le MÊME
test, et c'est délibéré.

🔴 **Un verrou qui n'assert qu'une absence ne verrouille rien.** Un écran vide, un gate trop large,
une route qui refuse tout le monde : les trois satisfont « Massimo ne voit rien ». C'est la
**présence** côté Papa qui donne son sens à l'absence côté Massimo, et le dépôt a payé quatre fois
pour l'apprendre (`test_delete_is_archiving_not_deletion`, le verrou central de l'`adr-0049`…).

Le décor réutilise `_diagnostic_pending` de `test_diagnostic_gate` — le gate et la relecture
racontent la même histoire par les deux bouts.

100 % hors-ligne (SQLite + `FakeLLMProvider`).
"""

import app.db.models as m
from app.tests.test_diagnostic_gate import _diagnostic_pending
from app.tests.test_diagnostics import as_massimo, as_papa

RELECTURE = "/api/diagnostics/quizzes/{}/relecture"


def _diagnostic_deux_notions(db, *, subject_id: int = 1) -> int:
    """Un diagnostic `pending` de 2 notions × 2 questions, avec clés et explications.

    ⚠️ **Deux notions, pas une** : c'est le minimum qui puisse démontrer un groupement. Avec une
    seule, un service qui rendrait tout dans un seul groupe passerait le test sans rien grouper.

    Les questions sont écrites **entrelacées** (`sort_order` 0, 1, 2, 3 → A, B, A, B) alors que le
    générateur, lui, écrit des blocs contigus. Le décor est donc plus dur que la réalité : il prouve
    que le regroupement se fait par identifiant de notion et pas par tranches de `sort_order`.
    """
    quiz = m.Quiz(
        subject_id=subject_id,
        title="Diagnostic — deux notions",
        quiz_type="diagnostic",
        status="ready",
        created_by="ai",
    )
    db.add(quiz)
    db.flush()

    premiere = db.query(m.Skill).first()
    seconde = m.Skill(subject_id=subject_id, name="Puissances", level="4e")
    db.add(seconde)
    db.flush()

    for rang, (skill, enonce) in enumerate(
        [
            (premiere, "(-3) + 5 ?"),
            (seconde, "2 puissance 3 ?"),
            (premiere, "(-2) x (-4) ?"),
            (seconde, "10 puissance 0 ?"),
        ]
    ):
        db.add(
            m.QuizQuestion(
                quiz_id=quiz.id,
                skill_id=skill.id,
                question_type="mcq",
                prompt_markdown=enonce,
                choices_json=["bonne", "mauvaise"],
                correct_answer_json=0,
                explanation_markdown=f"Parce que — explication {rang}",
                sort_order=rang,
            )
        )
    db.commit()
    return quiz.id


# ==================================================================================================
# LE VERROU CENTRAL — présence chez Papa, absence chez Massimo, dans le même test
# ==================================================================================================


def test_papa_ouvre_un_pending_avec_ses_cles_et_massimo_ne_voit_toujours_rien(client_db) -> None:
    """🔴 Verrou central de la session A (ADR-0051 Décision 5).

    Les deux moitiés ensemble, sur le MÊME diagnostic :

    - **présence** — Papa reçoit 200, ses questions, et la bonne réponse de chacune. C'est ce que
      le chantier ajoute, et ce qu'aucune route ne savait rendre ;
    - **absence** — les trois portes élève rendent toujours 404 (`adr-0043`), pas 403 : pour
      Massimo, un diagnostic non relu n'existe pas.

    Séparer les deux laisserait passer les deux pannes symétriques : un gate qui s'ouvre pour tout
    le monde, et une route de Papa qui ne rend rien.
    """
    client, TestSession = client_db
    with TestSession() as db:
        quiz_id = _diagnostic_pending(db)
        question_id = db.query(m.QuizQuestion).first().id

    # ── PRÉSENCE : Papa ouvre, et il voit la clé ────────────────────────────────────────────────
    as_papa()
    reponse = client.get(RELECTURE.format(quiz_id))
    assert reponse.status_code == 200, "Papa doit pouvoir ouvrir un diagnostic NON RELU"
    corps = reponse.json()
    assert corps["total"] == 1
    questions = [q for notion in corps["notions"] for q in notion["questions"]]
    assert len(questions) == 1
    assert questions[0]["prompt_markdown"] == "2 + 2 ?"
    assert questions[0]["choices_json"] == ["4", "5"]
    # 🔴 LA raison d'être de la route : la bonne réponse est servie, et elle est JUSTE.
    assert questions[0]["correct_answer_json"] == 0

    # ── ABSENCE : le gate de Massimo n'a pas bougé d'un pouce ───────────────────────────────────
    as_massimo()
    assert client.get("/api/diagnostics/quizzes").json() == []
    assert client.get(f"/api/diagnostics/quizzes/{quiz_id}").status_code == 404
    assert (
        client.post(
            f"/api/diagnostics/quizzes/{quiz_id}/submit",
            json={"answers": [{"question_id": question_id, "choice_index": 0}]},
        ).status_code
        == 404
    )
    with TestSession() as db:
        assert db.query(m.QuizAttempt).count() == 0
        assert db.query(m.Gap).count() == 0


def test_la_relecture_groupe_par_notion_et_sert_l_explication(client_db) -> None:
    """🔴 Second verrou : la FORME est la décision (ADR-0051 Décision 3).

    Ce que ce test tient, et qu'une simple liste de questions ne tiendrait pas :

    1. il y a bien **un groupe par notion**, et chacun porte son nom — c'est le groupe qui pose la
       question à Papa (*« ces questions mesurent-elles bien celle-ci ? »*) ;
    2. le regroupement se fait **par identifiant**, pas par tranches : le décor entrelace
       délibérément les `sort_order` ;
    3. **l'explication est servie** — le texte que Massimo lira après coup, donc la moitié de ce
       qu'on valide.
    """
    client, TestSession = client_db
    with TestSession() as db:
        quiz_id = _diagnostic_deux_notions(db)
    as_papa()

    corps = client.get(RELECTURE.format(quiz_id)).json()

    assert corps["total"] == 4
    assert [n["skill_name"] for n in corps["notions"]] == ["Nombres relatifs", "Puissances"]
    assert [len(n["questions"]) for n in corps["notions"]] == [2, 2]

    # Les énoncés ont bien suivi leur notion — un groupement qui range mal serait vert sur les
    # seuls comptes ci-dessus.
    assert [q["prompt_markdown"] for q in corps["notions"][0]["questions"]] == [
        "(-3) + 5 ?",
        "(-2) x (-4) ?",
    ]
    assert [q["prompt_markdown"] for q in corps["notions"][1]["questions"]] == [
        "2 puissance 3 ?",
        "10 puissance 0 ?",
    ]

    # 🔴 Les explications sont là, toutes, et non vides.
    explications = [q["explanation_markdown"] for n in corps["notions"] for q in n["questions"]]
    assert len(explications) == 4
    assert all(e for e in explications), "l'explication est ce que Massimo lira APRÈS — elle se relit"


# ==================================================================================================
# Ce que le contrat refuse de faire
# ==================================================================================================


def test_une_notion_absente_ne_devient_jamais_le_mot_Notion(client_db) -> None:
    """`skill_name` vaut `None`, pas `"Notion"` (Décision 3).

    Le repli de `get_quiz_for_taking` est bon pour un enfant, qui n'a pas à lire un trou de
    génération. Ici il ferait l'inverse de ce qu'on demande : il donnerait à un défaut l'apparence
    d'une notion, sur l'écran fait exactement pour repérer ce défaut-là.
    """
    client, TestSession = client_db
    with TestSession() as db:
        quiz_id = _diagnostic_pending(db)
        db.query(m.QuizQuestion).update({m.QuizQuestion.skill_id: None})
        db.commit()
    as_papa()

    notions = client.get(RELECTURE.format(quiz_id)).json()["notions"]
    assert len(notions) == 1
    assert notions[0]["skill_id"] is None
    assert notions[0]["skill_name"] is None, "un repli qui ressemble à un nom masque le défaut"


def test_une_cle_illisible_est_servie_None_jamais_coercee(client_db) -> None:
    """Désigner le MAUVAIS choix comme bonne réponse serait le pire défaut de cette surface.

    Le générateur écrit toujours un entier, et les 304 questions de la base de dev en portent un.
    Mais le jour où ce ne serait plus vrai, la route doit dire « je ne sais pas » plutôt que
    d'afficher un `0` plausible sur l'écran dont le seul rôle est de vérifier cette clé.
    """
    client, TestSession = client_db
    with TestSession() as db:
        quiz_id = _diagnostic_pending(db)
        db.query(m.QuizQuestion).update({m.QuizQuestion.correct_answer_json: {"blanks": [["4"]]}})
        db.commit()
    as_papa()

    corps = client.get(RELECTURE.format(quiz_id)).json()
    assert corps["notions"][0]["questions"][0]["correct_answer_json"] is None


def test_un_diagnostic_deja_relu_reste_lisible(client_db) -> None:
    """Décision 2 : ce qui disparaît après un verdict, ce sont les verdicts — pas la lecture.

    Un diagnostic passé se relit aussi : c'est ce qui permet de comprendre un score.
    """
    client, TestSession = client_db
    with TestSession() as db:
        quiz_id = _diagnostic_pending(db)
    as_papa()
    client.post(f"/api/diagnostics/quizzes/{quiz_id}/validate")

    assert client.get(RELECTURE.format(quiz_id)).status_code == 200


def test_un_lot_sans_question_rend_un_total_de_zero(client_db) -> None:
    """L'état que la base de dev ne montre pas — 0 diagnostic sans question, mesuré le 2026-08-11.

    Il ne se constate pas, il s'écrit : c'est sur ce contrat que le client décide de **ne pas
    afficher** « Laisser passer » (Décision 3).
    """
    client, TestSession = client_db
    with TestSession() as db:
        quiz = m.Quiz(
            subject_id=1, title="Diagnostic vide", quiz_type="diagnostic", status="ready", created_by="ai"
        )
        db.add(quiz)
        db.commit()
        quiz_id = quiz.id
    as_papa()

    corps = client.get(RELECTURE.format(quiz_id)).json()
    assert corps["total"] == 0
    assert corps["notions"] == []


# ==================================================================================================
# Les frontières — rôle et type
# ==================================================================================================


def test_la_route_de_relecture_refuse_massimo(client_db) -> None:
    """C'est la route de PAPA. La servir à l'enfant lui donnerait les clés de sa propre mesure."""
    client, TestSession = client_db
    with TestSession() as db:
        quiz_id = _diagnostic_pending(db)
    as_massimo()

    assert client.get(RELECTURE.format(quiz_id)).status_code == 403


def test_la_relecture_ne_sert_pas_un_quiz_de_MISSION(client_db) -> None:
    """🔴 La frontière que ce chantier s'interdit de franchir.

    `_quiz_or_404` filtre sur `quiz_type` : un quiz de mission ou de fin de cours n'entre pas par
    cette porte. Il a la sienne (`GET /api/quizzes/{id}`), avec ses gestes de production — et
    l'alternative (a) de l'ADR, *élargir `_mission_quiz_or_404`*, a été écartée pour ne pas ouvrir
    ces gestes aux diagnostics. Ce test tient l'autre sens de la même frontière.
    """
    client, TestSession = client_db
    with TestSession() as db:
        quiz = m.Quiz(
            subject_id=1,
            title="Quiz de fin de cours",
            quiz_type="lesson",
            status="ready",
            created_by="ai",
        )
        db.add(quiz)
        db.commit()
        quiz_id = quiz.id
    as_papa()

    assert client.get(RELECTURE.format(quiz_id)).status_code == 404
