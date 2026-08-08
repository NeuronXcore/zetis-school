"""Ce que le diagnostic mesure, et comment il le rend (ADR-0043 Décisions 3, 4, 5).

Trois choses changent, et chacune peut se dégrader **en silence** :

1. la granularité passe de 2 à 5 questions par notion — mais le dépôt gardera les deux pour
   toujours, et un delta entre deux grains différents ne se lit pas comme entre deux grains égaux ;
2. les 8 notions sont choisies par ancienneté de mesure au lieu de l'ordre d'insertion ;
3. les lacunes sont **lues en base** au lieu d'être recalculées depuis les réponses.

⚠️ Le verrou le moins évident du fichier est le premier : `submit()` portait sa propre copie de
l'agrégat par notion. Sa suppression est invisible tant qu'on ne compare pas les deux surfaces sur
la MÊME passation.

100 % hors-ligne (SQLite + `FakeLLMProvider`).
"""

from datetime import datetime, timedelta, timezone

import app.db.models as m
from app.modules.diagnostics import service
from app.tests.test_diagnostics import _generate, as_massimo, as_papa


def _t(jours: int) -> datetime:
    return datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(days=jours)


def _passer(client, quiz_id: int, *, bonnes: bool = True) -> dict:
    """Massimo passe un diagnostic. `bonnes=False` → tout faux (index 1 dans le faux LLM)."""
    quiz = client.get(f"/api/diagnostics/quizzes/{quiz_id}").json()
    reponses = [
        {"question_id": q["id"], "choice_index": 0 if bonnes else 1} for q in quiz["questions"]
    ]
    return client.post(
        f"/api/diagnostics/quizzes/{quiz_id}/submit", json={"answers": reponses}
    ).json()


def _passation_manuelle(
    db, *, student, subject_id: int, skill_scores: dict[int, tuple[int, int]], quand: datetime
) -> int:
    """Une passation posée en base, notion par notion : `{skill_id: (correctes, total)}`.

    🔴 **C'est ce décor qui rend la granularité MIXTE testable.** La génération produit toujours le
    grain courant ; seule une passation écrite à la main peut porter les 2 questions par notion
    d'avant l'ADR-0043 à côté des 5 d'après. Sans lui, le test du pivot ne comparerait que des
    grains identiques — c'est-à-dire pas le cas qui pose problème.
    """
    quiz = m.Quiz(
        subject_id=subject_id,
        title="Diagnostic — passé",
        quiz_type="diagnostic",
        status="ready",
        validation_status="validated",
    )
    db.add(quiz)
    db.flush()
    attempt = m.QuizAttempt(
        quiz_id=quiz.id,
        student_id=student.id,
        started_at=quand,
        completed_at=quand,
        context="diagnostic",
    )
    db.add(attempt)
    db.flush()
    for skill_id, (correctes, total) in skill_scores.items():
        for rang in range(total):
            question = m.QuizQuestion(
                quiz_id=quiz.id,
                skill_id=skill_id,
                question_type="mcq",
                prompt_markdown=f"Q{rang}",
                choices_json=["A", "B"],
                correct_answer_json=0,
                sort_order=rang,
            )
            db.add(question)
            db.flush()
            juste = rang < correctes
            db.add(
                m.QuizAnswer(
                    attempt_id=attempt.id,
                    question_id=question.id,
                    answer_json={"choice_index": 0 if juste else 1},
                    is_correct=juste,
                    score=1.0 if juste else 0.0,
                )
            )
    total_q = sum(t for _c, t in skill_scores.values())
    attempt.score_percent = round(
        sum(c for c, _t in skill_scores.values()) / total_q * 100
    )
    db.commit()
    return attempt.id


# ==================================================================================================
# L'EXTRACTION — trois copies devenues deux
# ==================================================================================================


def test_submit_et_results_notent_la_MEME_passation_pareil(client_db, executer_travail) -> None:
    """🔴 Verrou de l'extraction : deux surfaces, un seul calcul.

    `submit()` portait sa propre copie de l'agrégat, calculée pendant l'écriture des réponses ;
    `latest_results` en lisait une autre depuis `quiz_answers`. Tant qu'on ne les compare pas sur
    la MÊME passation, une divergence peut s'installer sans qu'aucun test ne rougisse.

    C'est aussi la condition du pivot : comparer deux passations n'a de sens que si elles sont
    notées de la même façon.

    🔴 **Ce test a d'abord été VERT SUR UN SABOTAGE, et le décor en était la cause.** Il répondait
    tout faux : chaque score valait 0, et à 0 une divergence multiplicative est indétectable. Il
    répond désormais **partiellement**, et il assied le score attendu sur une valeur exacte —
    un score qui n'est ni le plancher ni le plafond est le seul qui puisse voir un décalage.

    ⚠️ Deuxième leçon du même échec : à 5 questions par notion, **tout score est un multiple de
    20**. Un sabotage qui arrondit à la dizaine est l'identité sur ces valeurs — il ne prouve rien,
    ni dans un sens ni dans l'autre. Un sabotage doit produire une valeur ATTEIGNABLE différente.
    """
    client, TestSession = client_db
    body = _generate(client, TestSession, executer_travail)

    # Trois bonnes réponses sur cinq → 60 %. Ni 0 ni 100 : la seule zone où un décalage se voit.
    quiz = client.get(f"/api/diagnostics/quizzes/{body['quiz_id']}").json()
    reponses = [
        {"question_id": q["id"], "choice_index": 0 if rang < 3 else 1}
        for rang, q in enumerate(quiz["questions"])
    ]
    immediat = client.post(
        f"/api/diagnostics/quizzes/{body['quiz_id']}/submit", json={"answers": reponses}
    ).json()

    as_papa()
    relu = next(
        row
        for row in client.get("/api/diagnostics/results").json()
        if row["attempt_id"] == immediat["attempt_id"]
    )

    def _cle(payload: dict) -> list[tuple]:
        return sorted(
            (r["skill_id"], r["score"], r["status"], r["questions_count"])
            for r in payload["per_skill"]
        )

    # Valeur EXACTE, pas seulement l'égalité des deux surfaces : deux surfaces peuvent s'accorder
    # sur un chiffre faux. 3/5 = 60 %, `learning` (≥ 40, < 70).
    assert [r["score"] for r in immediat["per_skill"]] == [60]
    assert [r["status"] for r in immediat["per_skill"]] == ["learning"]
    assert immediat["score_percent"] == 60

    assert _cle(immediat) == _cle(relu), "la même passation notée deux fois différemment"
    assert immediat["score_percent"] == relu["score_percent"]


# ==================================================================================================
# LA GRANULARITÉ (Décision 3) — et le pivot sur des grains MIXTES
# ==================================================================================================


def test_une_passation_neuve_porte_cinq_questions_par_notion(client_db, executer_travail) -> None:
    """`QUESTIONS_PER_SKILL` = 5 : six valeurs de score possibles au lieu de trois.

    Le verrou ne porte pas sur la constante — il porte sur ce qui ARRIVE en base. Une constante
    changée sans que le générateur suive ne se verrait nulle part.
    """
    client, TestSession = client_db
    body = _generate(client, TestSession, executer_travail)
    resultat = _passer(client, body["quiz_id"], bonnes=True)

    assert [r["questions_count"] for r in resultat["per_skill"]] == [5]
    # Et le grain se lit jusque dans les scores atteignables : 3/5 = 60, impossible à 2 questions.
    assert service.QUESTIONS_PER_SKILL == 5


def test_le_pivot_compare_des_passations_a_granularite_MIXTE(client_db, executer_travail) -> None:
    """🔴 Le cas que le dépôt portera pour toujours : une passation à 2 questions, une à 5.

    L'ADR-0043 Décision 3 n'améliore que le FUTUR. Un delta entre 50 % (sur 2 questions) et 80 %
    (sur 5) est vrai, mais il ne se lit pas comme un delta entre deux grains identiques — la page
    doit pouvoir le dire, donc le contrat doit le porter **point par point**.
    """
    client, TestSession = client_db
    with TestSession() as db:
        student = db.query(m.StudentProfile).first()
        skill_id = db.query(m.Skill).first().id
        # Le passé : 1 bonne sur 2 → 50 %, l'une des trois seules valeurs d'alors.
        ancien = _passation_manuelle(
            db, student=student, subject_id=1, skill_scores={skill_id: (1, 2)}, quand=_t(0)
        )
        # Le présent : 4 bonnes sur 5 → 80 %, inatteignable à 2 questions.
        recent = _passation_manuelle(
            db, student=student, subject_id=1, skill_scores={skill_id: (4, 5)}, quand=_t(30)
        )
    as_papa()

    portee = client.get("/api/diagnostics/portee", params={"subject_id": 1}).json()

    assert [a["attempt_id"] for a in portee["attempts"]] == [ancien, recent], "ordre chronologique"
    ligne = next(n for n in portee["notions"] if n["skill_id"] == skill_id)
    assert [p["score"] for p in ligne["points"]] == [50, 80]
    assert [p["questions_count"] for p in ligne["points"]] == [2, 5], "le grain est servi par point"
    assert ligne["delta"] == 30


def test_le_pivot_n_interpole_PAS_une_notion_non_mesuree(client_db) -> None:
    """🔴 Une notion sautée vaut `None`, jamais la valeur précédente reportée.

    Reporter dessinerait un palier plat que personne n'a mesuré, et un palier plat se lit « rien
    n'a bougé » — l'exact contraire de « on n'a pas regardé ».
    """
    client, TestSession = client_db
    with TestSession() as db:
        student = db.query(m.StudentProfile).first()
        premiere = db.query(m.Skill).first()
        seconde = m.Skill(subject_id=1, name="Fractions", level="4e")
        db.add(seconde)
        db.commit()
        seconde_id = seconde.id
        _passation_manuelle(
            db,
            student=student,
            subject_id=1,
            skill_scores={premiere.id: (1, 2), seconde_id: (2, 2)},
            quand=_t(0),
        )
        _passation_manuelle(
            db, student=student, subject_id=1, skill_scores={premiere.id: (2, 2)}, quand=_t(10)
        )
        _passation_manuelle(
            db,
            student=student,
            subject_id=1,
            skill_scores={premiere.id: (2, 2), seconde_id: (0, 2)},
            quand=_t(20),
        )
        premiere_id = premiere.id
    as_papa()

    portee = client.get("/api/diagnostics/portee", params={"subject_id": 1}).json()
    sautee = next(n for n in portee["notions"] if n["skill_id"] == seconde_id)

    assert [p if p is None else p["score"] for p in sautee["points"]] == [100, None, 0]
    # Le delta va de la PREMIÈRE à la DERNIÈRE mesure — il ne dépend pas du trou entre les deux.
    assert sautee["delta"] == -100
    # Et la notion mesurée partout n'a aucun trou.
    partout = next(n for n in portee["notions"] if n["skill_id"] == premiere_id)
    assert all(p is not None for p in partout["points"])


def test_une_seule_passation_ne_fait_pas_de_portee(client_db) -> None:
    """Un point ne fait pas une pente : `notions` est vide, la page n'a rien à compter elle-même."""
    client, TestSession = client_db
    with TestSession() as db:
        student = db.query(m.StudentProfile).first()
        skill_id = db.query(m.Skill).first().id
        _passation_manuelle(
            db, student=student, subject_id=1, skill_scores={skill_id: (1, 2)}, quand=_t(0)
        )
    as_papa()

    portee = client.get("/api/diagnostics/portee", params={"subject_id": 1}).json()

    assert len(portee["attempts"]) == 1, "la passation existe bien — sinon on ne teste rien"
    assert portee["notions"] == []


# ==================================================================================================
# LA SÉLECTION (Décision 4) — par ancienneté de mesure
# ==================================================================================================


def test_la_selection_reprend_la_notion_la_PLUS_ANCIENNEMENT_mesuree(client_db) -> None:
    """🔴 Un diagnostic sert à réduire l'incertitude : remesurer ce qui vient de l'être n'en réduit
    aucune.

    Le décor est construit pour que **l'ordre d'insertion et l'ordre de mesure s'opposent** : la
    notion la plus récemment mesurée est celle de plus petit `id`. Sous l'ancien
    `order_by(Skill.id)`, elle sortirait en tête ; sous la règle de l'ADR-0043, elle sort en
    dernier. Un décor où les deux ordres coïncident ne prouverait rien.
    """
    client_db_, TestSession = client_db
    del client_db_
    with TestSession() as db:
        student = db.query(m.StudentProfile).first()
        recente = db.query(m.Skill).first()  # id le plus petit
        ancienne = m.Skill(subject_id=1, name="Mesurée il y a longtemps", level="4e")
        jamais = m.Skill(subject_id=1, name="Jamais mesurée", level="4e")
        db.add_all([ancienne, jamais])
        db.flush()
        db.add(
            m.SkillMastery(student_id=student.id, skill_id=recente.id, last_seen_at=_t(100))
        )
        db.add(
            m.SkillMastery(student_id=student.id, skill_id=ancienne.id, last_seen_at=_t(1))
        )
        db.commit()

        choisies = service.notions_a_mesurer(db, subject_id=1, student_id=student.id, limit=3)
        assert [s.name for s in choisies] == [
            "Jamais mesurée",  # aucune mesure → incertitude maximale
            "Mesurée il y a longtemps",
            recente.name,  # mesurée hier : c'est d'elle qu'on sait le plus
        ]

        # Contre-épreuve de la dégradation : sans élève, on retombe sur l'ordre d'insertion, qui
        # est exactement le comportement d'avant l'ADR-0043. Pas un résultat faux — l'ancien.
        sans_eleve = service.notions_a_mesurer(db, subject_id=1, student_id=None, limit=3)
        assert [s.id for s in sans_eleve] == sorted(s.id for s in sans_eleve)
        assert sans_eleve[0].id == recente.id


# ==================================================================================================
# LES LACUNES LUES EN BASE (Décision 5)
# ==================================================================================================


def test_une_lacune_RESOLUE_change_d_ETAT_sans_disparaitre_de_Papa(client_db, executer_travail) -> None:
    """🔴 Le défaut que la Décision 5 corrige — et la nuance que la maquette a imposée ensuite.

    `_per_skill_for_attempt` **recalculait** les lacunes depuis les réponses de la passation : une
    lacune que Papa avait résolue continuait de s'afficher **comme ouverte**, à jamais, alors que le
    docstring promettait « lacunes ouvertes ».

    ⚠️ **Ce test a changé de forme en Session C, et pas pour le faire passer.** Sa première version
    exigeait qu'une lacune résolue DISPARAISSE du détail. C'était trop étroit : la station ② de la
    maquette porte un badge `résolue`, impossible à afficher si la lacune était filtrée. La spec dit
    « les lacunes **ouvertes par** un diagnostic » — c'est l'ORIGINE, pas l'état courant.

    Il vérifie donc maintenant **les deux surfaces**, ce qu'il ne faisait pas :

    - côté **Papa**, la lacune reste listée et son `status` bascule — c'est le badge ;
    - côté **Massimo**, `lacunes_ouvertes` ne la rend plus : au sortir d'une passation, une lacune
      déjà refermée n'aurait rien à faire.
    """
    client, TestSession = client_db
    body = _generate(client, TestSession, executer_travail)
    resultat = _passer(client, body["quiz_id"], bonnes=False)
    attempt_id = resultat["attempt_id"]

    # 1. Elle est là, ouverte, dans la réponse immédiate ET dans la vue Papa.
    assert [g["skill_id"] for g in resultat["gaps"]], "un diagnostic tout faux doit ouvrir une lacune"
    as_papa()
    detail = client.get(f"/api/diagnostics/results/{attempt_id}").json()
    assert [g["status"] for g in detail["gaps"]] == ["open"]

    # 2. Papa la résout — et la mesure, elle, ne bouge pas d'un point.
    with TestSession() as db:
        gap = db.query(m.Gap).first()
        gap.status = "resolved"
        db.commit()
        skill_ids = [gap.skill_id]
        student_id = gap.student_id

    apres = client.get(f"/api/diagnostics/results/{attempt_id}").json()
    assert [g["status"] for g in apres["gaps"]] == ["resolved"], (
        "Papa doit LIRE l'état, pas perdre la ligne — c'est le badge `résolue` de la station ②"
    )
    assert apres["per_skill"] == detail["per_skill"], (
        "la MESURE est figée, seule la LACUNE est vivante — c'est la distinction de la Décision 6"
    )

    # 3. …et la surface étroite, celle que Massimo voit, ne la rend PLUS.
    with TestSession() as db:
        assert service.lacunes_ouvertes(db, student_id=student_id, skill_ids=skill_ids) == []


def test_une_lacune_in_progress_reste_ouverte_et_ne_double_PAS(client_db) -> None:
    """`in_progress` est ouverte (`OPEN_GAP_STATUSES`), et deux lignes rendent UNE ligne.

    Le tuple canonique est importé de `progress.service` plutôt que recopié — `diagnostics` était
    justement le module qui ne l'importait pas.

    ⚠️ Le doublon du décor n'est pas artificiel : `_upsert_gap` déduplique sur `"open"` SEUL, donc
    une lacune passée `in_progress` en produit un au diagnostic suivant. Ce défaut est au
    `BACKLOG.md` et **hors périmètre ici** — mais lire avec le tuple canonique le rendrait visible
    à l'écran sous la forme de deux lignes pour une notion. La dédup de lecture est ce qui l'en
    empêche, et on garde la plus sévère.
    """
    client, TestSession = client_db
    with TestSession() as db:
        student = db.query(m.StudentProfile).first()
        skill_id = db.query(m.Skill).first().id
        attempt_id = _passation_manuelle(
            db, student=student, subject_id=1, skill_scores={skill_id: (0, 5)}, quand=_t(0)
        )
        db.add_all(
            [
                m.Gap(
                    student_id=student.id,
                    skill_id=skill_id,
                    subject_id=1,
                    source="diagnostic",
                    severity="medium",
                    status="in_progress",
                ),
                m.Gap(
                    student_id=student.id,
                    skill_id=skill_id,
                    subject_id=1,
                    source="diagnostic",
                    severity="high",
                    status="open",
                ),
            ]
        )
        db.commit()
    as_papa()

    detail = client.get(f"/api/diagnostics/results/{attempt_id}").json()

    assert len(detail["gaps"]) == 1, "deux lignes en base ne font pas deux lignes à l'écran"
    assert detail["gaps"][0]["severity"] == "high", "on garde la plus sévère"


def test_une_lacune_d_une_AUTRE_source_n_entre_pas(client_db) -> None:
    """Le panneau du diagnostic montre les lacunes du diagnostic (`source='diagnostic'`).

    Sans ce filtre, une lacune ouverte par une mission viendrait s'afficher dans une passation qui
    ne l'a jamais mesurée — et Papa lirait la mesure comme sa cause.
    """
    client, TestSession = client_db
    with TestSession() as db:
        student = db.query(m.StudentProfile).first()
        skill_id = db.query(m.Skill).first().id
        attempt_id = _passation_manuelle(
            db, student=student, subject_id=1, skill_scores={skill_id: (0, 5)}, quand=_t(0)
        )
        db.add(
            m.Gap(
                student_id=student.id,
                skill_id=skill_id,
                subject_id=1,
                source="mission",
                severity="high",
                status="open",
            )
        )
        db.commit()
    as_papa()

    detail = client.get(f"/api/diagnostics/results/{attempt_id}").json()

    assert detail["gaps"] == []
    # …et la notion est bien à 0 % : la mesure existe, seule la lacune est écartée. Sans cette
    # ligne, un contrat vide passerait le test.
    assert detail["per_skill"][0]["score"] == 0


# ==================================================================================================
# LE DÉTAIL D'UNE PASSATION
# ==================================================================================================


def test_le_detail_refuse_une_passation_qui_n_est_pas_un_diagnostic(client_db) -> None:
    """`404`, pas `403` : Papa n'a pas à apprendre l'existence de ce qu'il ne peut pas ouvrir."""
    client, TestSession = client_db
    with TestSession() as db:
        student = db.query(m.StudentProfile).first()
        quiz = m.Quiz(subject_id=1, title="Quiz de mission", quiz_type="mission", status="ready")
        db.add(quiz)
        db.flush()
        attempt = m.QuizAttempt(
            quiz_id=quiz.id, student_id=student.id, completed_at=_t(0), context="mission"
        )
        db.add(attempt)
        db.commit()
        attempt_id = attempt.id
    as_papa()

    assert client.get(f"/api/diagnostics/results/{attempt_id}").status_code == 404
    assert client.get("/api/diagnostics/results/999999").status_code == 404


def test_le_detail_est_reserve_a_papa(client_db) -> None:
    """La surface d'analyse reste côté Papa — même règle que `/results` (ADR-0043 Décision 2)."""
    client, _ = client_db
    as_massimo()

    assert client.get("/api/diagnostics/results/1").status_code == 403
    assert client.get("/api/diagnostics/portee", params={"subject_id": 1}).status_code == 403
