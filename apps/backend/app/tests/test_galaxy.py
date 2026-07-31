"""Tests ZETIS Galaxy (ADR-0024) — surface élève du graphe de connaissances.

Les invariants vérifiés ici sont ceux qui protègent Massimo, pas seulement le contrat :
rien de non validé ne fuit, aucune action n'est promise sans contenu derrière, aucun
pourcentage ne sort, et le 6ᵉ statut réel (`in_progress`) ne passe pas à travers les mailles.
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select

import app.db.models as m
from app.modules.galaxy.service import normalize_status


def _seed_svt(TestSession, *, lesson_status: str = "validated",
              chapter_validation: str = "validated",
              lesson_content: str | None = "# Mitose\n\nLa cellule se divise…") -> dict:
    """Une matière SVT de l'année active : 1 chapitre, 1 leçon, 2 notions.

    `lesson_content` = le cours rédigé (`content_markdown`). Défaut : un cours présent — car
    « cours disponible » exige désormais un contenu réel, pas seulement une leçon validée. Passer
    `None` reproduit le cas « leçon validée mais cours jamais écrit »."""
    db = TestSession()
    student_id = db.scalar(select(m.StudentProfile.id).order_by(m.StudentProfile.id))

    subject = m.Subject(name="SVT", slug="svt", sort_order=2)
    db.add(subject)
    db.flush()

    year = m.SchoolYear(student_id=student_id, label="2026-2027", level="4e", status="active")
    db.add(year)
    db.flush()
    sys_row = m.SchoolYearSubject(school_year_id=year.id, subject_id=subject.id)
    db.add(sys_row)
    db.flush()

    chapter = m.Chapter(
        school_year_subject_id=sys_row.id,
        name="La cellule",
        sort_order=1,
        validation_status=chapter_validation,
    )
    db.add(chapter)
    db.flush()

    lesson = m.Lesson(
        chapter_id=chapter.id, title="Mitose", status=lesson_status, created_by="parent",
        content_markdown=lesson_content,
    )
    db.add(lesson)
    db.flush()

    mitose = m.Skill(subject_id=subject.id, name="Mitose", level="4e")
    adn = m.Skill(subject_id=subject.id, name="ADN", level="4e")
    db.add_all([mitose, adn])
    db.flush()
    db.add_all(
        [
            m.LessonSkill(lesson_id=lesson.id, skill_id=mitose.id),
            m.LessonSkill(lesson_id=lesson.id, skill_id=adn.id),
        ]
    )
    db.commit()
    ids = {
        "student_id": student_id,
        "subject_id": subject.id,
        "chapter_id": chapter.id,
        "lesson_id": lesson.id,
        "mitose_id": mitose.id,
        "adn_id": adn.id,
    }
    db.close()
    return ids


def _set_mastery(TestSession, student_id: int, skill_id: int, status: str, score: float) -> None:
    db = TestSession()
    db.add(
        m.SkillMastery(
            student_id=student_id, skill_id=skill_id, status=status, mastery_score=score
        )
    )
    db.commit()
    db.close()


# --- Le 6e statut : le piège que ce chantier existe pour ne pas retomber dedans ----------


def test_in_progress_est_rendu_comme_learning():
    """`in_progress` est écrit par le verdict de mission `review_later` et ne sort d'aucun
    `_status_from_score()`. Un mapping à 5 branches le manquerait EN SILENCE."""
    assert normalize_status("in_progress") == "learning"


def test_statut_inconnu_retombe_sur_unknown_sans_exception():
    assert normalize_status(None) == "unknown"
    assert normalize_status("") == "unknown"
    assert normalize_status("valeur_jamais_vue") == "unknown"


def test_in_progress_rendu_comme_learning_de_bout_en_bout(client_db):
    client, TestSession = client_db
    ids = _seed_svt(TestSession)
    _set_mastery(TestSession, ids["student_id"], ids["mitose_id"], "in_progress", 55)

    nodes = client.get("/api/student/galaxy/svt").json()["nodes"]
    mitose = next(n for n in nodes if n["skill_id"] == ids["mitose_id"])
    assert mitose["status"] == "learning"


# --- Gate de visibilité : le non-validé n'existe pas, même pas en « à découvrir » --------


def test_lecon_non_validee_nexiste_pas_dans_la_constellation(client_db):
    client, TestSession = client_db
    _seed_svt(TestSession, lesson_status="draft")

    body = client.get("/api/student/galaxy/svt").json()
    assert body["nodes"] == []
    assert body["edges"] == []


def test_chapitre_non_valide_nexiste_pas_dans_la_constellation(client_db):
    client, TestSession = client_db
    _seed_svt(TestSession, chapter_validation="pending")

    assert client.get("/api/student/galaxy/svt").json()["nodes"] == []


# --- Forme du graphe : arêtes de STRUCTURE seulement -------------------------------------


def test_constellation_amas_etoiles_et_aretes_de_structure(client_db):
    client, TestSession = client_db
    ids = _seed_svt(TestSession)

    body = client.get("/api/student/galaxy/svt").json()
    chapters = [n for n in body["nodes"] if n["kind"] == "chapter"]
    skills = [n for n in body["nodes"] if n["kind"] == "skill"]

    assert len(chapters) == 1
    assert chapters[0]["id"] == f"chapter-{ids['chapter_id']}"
    assert {s["label"] for s in skills} == {"Mitose", "ADN"}
    # 1 arête cœur→amas + 1 par étoile, toutes de type `structure`.
    assert len(body["edges"]) == 3
    assert {e["type"] for e in body["edges"]} == {"structure"}


def test_le_graphe_est_connexe_par_le_coeur_de_matiere(client_db):
    """Sans nœud `subject`, chaque chapitre serait une composante ISOLÉE : le moteur de
    forces les éloignerait et la constellation se disloquerait à l'écran."""
    client, TestSession = client_db
    ids = _seed_svt(TestSession)
    db = TestSession()
    autre_ch = m.Chapter(
        school_year_subject_id=db.scalar(select(m.SchoolYearSubject.id)),
        name="Génétique",
        sort_order=2,
        validation_status="validated",
    )
    db.add(autre_ch)
    db.flush()
    lecon = m.Lesson(
        chapter_id=autre_ch.id, title="Gènes", status="validated", created_by="parent"
    )
    db.add(lecon)
    db.flush()
    gene = m.Skill(subject_id=ids["subject_id"], name="Gène", level="4e")
    db.add(gene)
    db.flush()
    db.add(m.LessonSkill(lesson_id=lecon.id, skill_id=gene.id))
    db.commit()
    db.close()

    body = client.get("/api/student/galaxy/svt").json()
    roots = [n for n in body["nodes"] if n["kind"] == "subject"]
    assert len(roots) == 1

    # Parcours : tous les nœuds doivent être atteignables depuis le cœur.
    adjacency: dict[str, set[str]] = {}
    for edge in body["edges"]:
        adjacency.setdefault(edge["source"], set()).add(edge["target"])
        adjacency.setdefault(edge["target"], set()).add(edge["source"])
    seen = {roots[0]["id"]}
    stack = [roots[0]["id"]]
    while stack:
        for neighbour in adjacency.get(stack.pop(), ()):
            if neighbour not in seen:
                seen.add(neighbour)
                stack.append(neighbour)
    assert seen == {n["id"] for n in body["nodes"]}


def test_notion_portee_par_deux_lecons_napparait_quune_fois(client_db):
    client, TestSession = client_db
    ids = _seed_svt(TestSession)
    db = TestSession()
    autre = m.Lesson(
        chapter_id=ids["chapter_id"], title="Mitose (suite)", status="validated",
        created_by="parent",
    )
    db.add(autre)
    db.flush()
    db.add(m.LessonSkill(lesson_id=autre.id, skill_id=ids["mitose_id"]))
    db.commit()
    db.close()

    skills = [n for n in client.get("/api/student/galaxy/svt").json()["nodes"]
              if n["kind"] == "skill"]
    assert [s["skill_id"] for s in skills].count(ids["mitose_id"]) == 1


# --- Vue d'ensemble : un COMPTE, jamais un pourcentage -----------------------------------


def test_overview_compte_les_etoiles_allumees_sans_pourcentage(client_db):
    client, TestSession = client_db
    ids = _seed_svt(TestSession)
    _set_mastery(TestSession, ids["student_id"], ids["mitose_id"], "solid", 78)

    body = client.get("/api/student/galaxy").json()
    svt = next(s for s in body["subjects"] if s["slug"] == "svt")
    assert (svt["lit"], svt["total"]) == (1, 2)
    # Aucun champ de type ratio/pourcentage ne doit exister dans le contrat.
    assert not {k for k in svt if "percent" in k or "ratio" in k or "score" in k}


def test_matiere_sans_contenu_valide_apparait_a_zero_jamais_filtree(client_db):
    client, TestSession = client_db
    _seed_svt(TestSession, lesson_status="draft")

    svt = next(s for s in client.get("/api/student/galaxy").json()["subjects"]
               if s["slug"] == "svt")
    assert (svt["lit"], svt["total"]) == (0, 0)


# --- Panneau d'actions : rien de promis sans contenu derrière -----------------------------


def test_la_panoplie_complete_est_toujours_renvoyee(client_db):
    """Révision de l'ADR-0024 §4 (2026-07-28) : on renvoie TOUTES les activités de ZETIS,
    chacune avec sa disponibilité — le client grise ce qui n'existe pas encore."""
    client, TestSession = client_db
    ids = _seed_svt(TestSession)

    actions = client.get(f"/api/student/galaxy/notion/{ids['mitose_id']}").json()["actions"]
    assert [a["kind"] for a in actions] == [
        "cours",
        "eli5",
        "fiche",
        "capsule",
        "mindmap",
        "revision",
        "quiz",
    ]
    dispo = {a["kind"]: a["available"] for a in actions}
    # Le cours est RÉDIGÉ (le seed pose un content_markdown) et ELI5 ne dépend de rien.
    assert dispo["cours"] is True
    assert dispo["eli5"] is True
    # Rien d'autre n'a été créé dans ce jeu de données.
    assert not any(dispo[k] for k in ("fiche", "capsule", "mindmap", "revision", "quiz"))


def test_cours_indisponible_si_lecon_validee_sans_contenu_redige(client_db):
    """Correctif 2026-07-30 : une leçon validée SANS `content_markdown` n'a pas de cours à servir.
    `notion_panel` ne doit pas prétendre le contraire (sinon porte vide + demande à Papa jamais
    enregistrée)."""
    client, TestSession = client_db
    ids = _seed_svt(TestSession, lesson_content=None)  # leçon validée, cours jamais écrit
    actions = client.get(f"/api/student/galaxy/notion/{ids['mitose_id']}").json()["actions"]
    dispo = {a["kind"]: a["available"] for a in actions}
    assert dispo["cours"] is False  # ← le mensonge corrigé
    assert dispo["eli5"] is True  # ELI5 reste offert (génératif à la volée)


def test_une_fiche_validee_rend_l_action_disponible(client_db):
    client, TestSession = client_db
    ids = _seed_svt(TestSession)
    db = TestSession()
    # Une fiche NON validée ne doit rien ouvrir : Massimo ne lit que du validé.
    db.add(m.Fiche(lesson_id=ids["lesson_id"], validation_status="pending"))
    db.commit()
    db.close()
    actions = client.get(f"/api/student/galaxy/notion/{ids['mitose_id']}").json()["actions"]
    assert next(a for a in actions if a["kind"] == "fiche")["available"] is False

    db = TestSession()
    fiche = m.Fiche(lesson_id=ids["lesson_id"], validation_status="validated")
    db.add(fiche)
    db.commit()
    fiche_id = fiche.id
    db.close()
    actions = client.get(f"/api/student/galaxy/notion/{ids['mitose_id']}").json()["actions"]
    action = next(a for a in actions if a["kind"] == "fiche")
    assert action["available"] is True and action["fiche_id"] == fiche_id


def test_une_capsule_validee_rend_l_action_disponible(client_db):
    client, TestSession = client_db
    ids = _seed_svt(TestSession)
    db = TestSession()
    capsule = m.Capsule(
        subject_id=ids["subject_id"],
        skill_id=ids["mitose_id"],
        title="Mitose en 2 min",
        validation_status="validated",
    )
    db.add(capsule)
    db.commit()
    capsule_id = capsule.id
    db.close()

    actions = client.get(f"/api/student/galaxy/notion/{ids['mitose_id']}").json()["actions"]
    action = next(a for a in actions if a["kind"] == "capsule")
    assert action["available"] is True and action["capsule_id"] == capsule_id
    # La capsule est notion-centrée : elle ne doit PAS remonter sur une autre notion.
    autres = client.get(f"/api/student/galaxy/notion/{ids['adn_id']}").json()["actions"]
    assert next(a for a in autres if a["kind"] == "capsule")["available"] is False


def test_action_quiz_apparait_quand_un_quiz_pret_existe(client_db):
    client, TestSession = client_db
    ids = _seed_svt(TestSession)
    db = TestSession()
    quiz = m.Quiz(
        subject_id=ids["subject_id"],
        lesson_id=ids["lesson_id"],
        quiz_type="mission",
        status="ready",
        title="Q",
    )
    db.add(quiz)
    db.commit()
    quiz_id = quiz.id
    db.close()

    actions = client.get(f"/api/student/galaxy/notion/{ids['mitose_id']}").json()["actions"]
    quiz_action = next(a for a in actions if a["kind"] == "quiz")
    assert quiz_action["quiz_id"] == quiz_id


def test_action_revision_apparait_avec_une_carte_active(client_db):
    client, TestSession = client_db
    ids = _seed_svt(TestSession)
    db = TestSession()
    db.add(
        m.SpacedReviewCard(
            student_id=ids["student_id"], skill_id=ids["mitose_id"],
            front_markdown="r", back_markdown="v", status="scheduled",
        )
    )
    # Une carte suspendue ne compte pas : elle n'est pas révisable.
    db.add(
        m.SpacedReviewCard(
            student_id=ids["student_id"], skill_id=ids["adn_id"],
            front_markdown="r", back_markdown="v", status="suspended",
        )
    )
    db.commit()
    db.close()

    def revision_dispo(skill_id: int) -> bool:
        actions = client.get(f"/api/student/galaxy/notion/{skill_id}").json()["actions"]
        return next(a for a in actions if a["kind"] == "revision")["available"]

    assert revision_dispo(ids["mitose_id"]) is True
    # Une carte suspendue n'est pas révisable : l'action reste grisée.
    assert revision_dispo(ids["adn_id"]) is False


def test_notion_hors_perimetre_renvoie_404_sans_rien_reveler(client_db):
    client, TestSession = client_db
    _seed_svt(TestSession)

    assert client.get("/api/student/galaxy/notion/999999").status_code == 404


def test_notion_dune_lecon_non_validee_renvoie_404(client_db):
    client, TestSession = client_db
    ids = _seed_svt(TestSession, lesson_status="draft")

    assert client.get(f"/api/student/galaxy/notion/{ids['mitose_id']}").status_code == 404


def test_matiere_inconnue_renvoie_404(client_db):
    client, TestSession = client_db
    _seed_svt(TestSession)

    assert client.get("/api/student/galaxy/inconnue").status_code == 404


# --- Graphe global (Accueil) ---------------------------------------------------------------


def test_graphe_global_est_connexe_depuis_la_racine(client_db):
    """Sans nœud `root`, chaque matière serait une composante isolée et la galaxie se
    disloquerait — même piège que le nœud `subject` dans une constellation."""
    client, TestSession = client_db
    _seed_svt(TestSession)

    body = client.get("/api/student/galaxy/all").json()
    roots = [n for n in body["nodes"] if n["kind"] == "root"]
    assert len(roots) == 1

    adjacency: dict[str, set[str]] = {}
    for edge in body["edges"]:
        adjacency.setdefault(edge["source"], set()).add(edge["target"])
        adjacency.setdefault(edge["target"], set()).add(edge["source"])
    seen = {"root"}
    stack = ["root"]
    while stack:
        for neighbour in adjacency.get(stack.pop(), ()):
            if neighbour not in seen:
                seen.add(neighbour)
                stack.append(neighbour)
    assert seen == {n["id"] for n in body["nodes"]}


def test_graphe_global_ne_sert_que_du_valide(client_db):
    client, TestSession = client_db
    _seed_svt(TestSession, lesson_status="draft")

    body = client.get("/api/student/galaxy/all").json()
    assert body["nodes"] == [] and body["edges"] == []


# --- Frise de progression -------------------------------------------------------------------


def test_frise_ne_decroit_jamais_meme_si_la_maitrise_regresse(client_db):
    """LE point de la frise : `SkillMastery` peut régresser, `learning_events` non. On compte
    la PREMIÈRE fois qu'une notion a été travaillée — la courbe ne peut donc que monter."""
    client, TestSession = client_db
    ids = _seed_svt(TestSession)

    db = TestSession()
    base = datetime(2026, 7, 1, 9, 0, tzinfo=timezone.utc)
    for offset, skill in enumerate((ids["mitose_id"], ids["adn_id"])):
        db.add(
            m.LearningEvent(
                student_id=ids["student_id"],
                skill_id=skill,
                event_type="quiz_attempted",
                created_at=base + timedelta(days=offset),
            )
        )
    # La notion régresse ensuite : elle ne doit PAS être décomptée de la frise.
    db.add(
        m.SkillMastery(
            student_id=ids["student_id"], skill_id=ids["mitose_id"], status="weak", mastery_score=10
        )
    )
    db.commit()
    db.close()

    body = client.get("/api/student/galaxy/timeline").json()
    counts = [p["lit"] for p in body["points"]]
    assert counts == sorted(counts), "la frise doit être monotone"
    assert body["total"] == 2


def test_frise_vide_sans_evenement(client_db):
    client, TestSession = client_db
    _seed_svt(TestSession)

    body = client.get("/api/student/galaxy/timeline").json()
    assert body == {"points": [], "total": 0}


# --- Verrous d'architecture ---------------------------------------------------------------


def test_galaxy_nimporte_ni_progress_ni_production():
    """Mur Papa/Massimo (ADR-0002) : ces deux modules sont `require_parent`. Les consommer
    ferait fuiter des données de pilotage vers l'élève."""
    from pathlib import Path

    source = Path(__file__).resolve().parents[1] / "modules" / "galaxy"
    for path in source.glob("*.py"):
        text = path.read_text(encoding="utf-8")
        assert "modules.production" not in text, f"{path.name} importe `production`"
        # `progress.service` est Papa-only ; seul `evidence` est le substrat partagé.
        assert "modules.progress" not in text, f"{path.name} importe `progress`"


def test_aucune_route_galaxy_nexige_le_role_parent():
    """La Galaxy est la page de Massimo. On inspecte les dépendances RÉELLES du router,
    pas le texte du fichier : un commentaire citant `require_parent` ne doit pas faire
    passer — ni échouer — ce verrou."""
    from app.modules.auth.deps import require_parent
    from app.modules.galaxy.router import student_router

    guards = {d.dependency for d in student_router.dependencies}
    for route in student_router.routes:
        guards.update(d.dependency for d in getattr(route, "dependencies", []))
    assert require_parent not in guards


# --- Rejeu animé : `?with_skills=true` (ADR-0029) ------------------------------------------


def test_frise_ne_sert_pas_les_notions_sans_qu_on_le_demande(client_db):
    """L'ADR-0029 promet que les consommateurs actuels ne voient AUCUN changement de charge
    utile. `skills` doit être absent, pas présent à `null`."""
    client, TestSession = client_db
    ids = _seed_svt(TestSession)

    db = TestSession()
    db.add(
        m.LearningEvent(
            student_id=ids["student_id"],
            skill_id=ids["mitose_id"],
            event_type="quiz_attempted",
            created_at=datetime(2026, 7, 1, 9, 0, tzinfo=timezone.utc),
        )
    )
    db.commit()
    db.close()

    assert "skills" not in client.get("/api/student/galaxy/timeline").json()


def test_with_skills_sert_la_date_de_premiere_fois_par_notion(client_db):
    """Le rejeu a besoin de savoir QUELLE étoile s'allume quand — pas seulement combien."""
    client, TestSession = client_db
    ids = _seed_svt(TestSession)

    db = TestSession()
    base = datetime(2026, 7, 1, 9, 0, tzinfo=timezone.utc)
    for offset, skill in enumerate((ids["mitose_id"], ids["adn_id"])):
        db.add(
            m.LearningEvent(
                student_id=ids["student_id"],
                skill_id=skill,
                event_type="quiz_attempted",
                created_at=base + timedelta(days=offset),
            )
        )
    # Une SECONDE trace sur la même notion : elle ne doit rien changer — c'est la PREMIÈRE
    # fois qui compte, sinon une étoile se rallumerait à chaque révision.
    db.add(
        m.LearningEvent(
            student_id=ids["student_id"],
            skill_id=ids["mitose_id"],
            event_type="review_attempted",
            created_at=base + timedelta(days=20),
        )
    )
    db.commit()
    db.close()

    skills = client.get("/api/student/galaxy/timeline?with_skills=true").json()["skills"]

    assert [s["skill_id"] for s in skills] == [ids["mitose_id"], ids["adn_id"]]
    assert [s["date"] for s in skills] == ["2026-07-01", "2026-07-02"]
    assert [s["date"] for s in skills] == sorted(s["date"] for s in skills), "ordre chronologique"


def test_with_skills_ne_sert_aucun_etat_de_maitrise(client_db):
    """Deux états seulement dans le rejeu : pas encore née, et allumée.

    Servir l'état de maîtrise permettrait un rejeu où des étoiles S'ÉTEIGNENT — `SkillMastery`
    régresse. C'est le cadrage de perte que ZETIS bannit."""
    client, TestSession = client_db
    ids = _seed_svt(TestSession)

    db = TestSession()
    db.add(
        m.LearningEvent(
            student_id=ids["student_id"],
            skill_id=ids["mitose_id"],
            event_type="quiz_attempted",
            created_at=datetime(2026, 7, 1, 9, 0, tzinfo=timezone.utc),
        )
    )
    db.add(
        m.SkillMastery(
            student_id=ids["student_id"], skill_id=ids["mitose_id"], status="weak", mastery_score=10
        )
    )
    db.commit()
    db.close()

    skills = client.get("/api/student/galaxy/timeline?with_skills=true").json()["skills"]
    assert set(skills[0]) == {"skill_id", "date"}
