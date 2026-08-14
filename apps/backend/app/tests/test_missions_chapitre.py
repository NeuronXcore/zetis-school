"""Le chapitre d'une mission se DÉRIVE de sa notion (ADR-0057 · addendum Missions).

🔴 **Ce que ces tests gardent, et qui distingue Missions des quatre autres pages du motif** :
les quiz, fiches et mindmaps rangent des **leçons**, qui portent exactement un `chapter_id`. Une
mission range une **notion**, et `Skill` n'a **aucun** chapitre — il se dérive, et la dérivation
peut rendre zéro, un, ou plusieurs chapitres.

**La décision la plus facile à trahir sans que rien ne se voie** : quand elle en rend plusieurs, on
n'en choisit AUCUN (§3). Ranger « Priorités opératoires » sous « Fractions » parce qu'il vient en
premier serait afficher du faux sous une apparence de certitude.
"""

from sqlalchemy import select

import app.db.models as m
from app.modules.missions.service import chapters_of_missions


def _annee(db):
    """La chaîne COMPLÈTE qu'exige `lessons_by_skill` : année active → SchoolYearSubject.

    ⚠️ Sans elle, la dérivation rend `None` partout et **tous ces tests passeraient pour la
    mauvaise raison** — c'est le décor qui doit être juste avant l'assertion.
    """
    student = db.scalar(select(m.StudentProfile))
    subject = db.scalar(select(m.Subject))
    annee = m.SchoolYear(
        student_id=student.id, label="2026-2027", level="4e", status="active", mode="hybrid"
    )
    db.add(annee)
    db.flush()
    sys = m.SchoolYearSubject(school_year_id=annee.id, subject_id=subject.id)
    db.add(sys)
    db.flush()
    return student, subject, sys


def _chapitre(db, sys, nom, sort_order=0):
    ch = m.Chapter(
        school_year_subject_id=sys.id,
        name=nom,
        sort_order=sort_order,
        status="active",
        validation_status="validated",
    )
    db.add(ch)
    db.flush()
    return ch


def _lecon(db, chapitre, skill, *, status="validated", titre="Leçon"):
    lec = m.Lesson(
        chapter_id=chapitre.id, title=titre, status=status, sort_order=0, created_by="parent"
    )
    db.add(lec)
    db.flush()
    db.add(m.LessonSkill(lesson_id=lec.id, skill_id=skill.id))
    db.flush()
    return lec


def _notion(db, subject, nom):
    sk = m.Skill(subject_id=subject.id, name=nom, level="4e")
    db.add(sk)
    db.flush()
    return sk


def _mission(db, student, subject, skill, titre="Travailler"):
    msn = m.Mission(
        student_id=student.id,
        subject_id=subject.id,
        skill_id=skill.id if skill is not None else None,
        title=titre,
        mission_type="manual",
        status="planned",
        validation_status="validated",
    )
    db.add(msn)
    db.flush()
    return msn


def test_une_notion_dans_un_chapitre_range_sa_mission_dessous(client_db) -> None:
    """Le cas nominal — 90 % des missions mesurées le 2026-08-14 (52 sur 58).

    ⚠️ SABOTAGE ATTENDU : rendre `None` inconditionnellement doit faire ROUGIR.
    """
    _, Session = client_db
    with Session() as db:
        student, subject, sys = _annee(db)
        chapitre = _chapitre(db, sys, "Orthographe")
        notion = _notion(db, subject, "Participe passé")
        _lecon(db, chapitre, notion)
        msn = _mission(db, student, subject, notion)
        db.commit()

        rendu = chapters_of_missions(db, [msn])
        assert rendu[msn.id] == (chapitre.id, "Orthographe")


def test_une_notion_dans_DEUX_chapitres_ne_choisit_AUCUN(client_db) -> None:
    """🔴 LE verrou du chantier — la décision la plus facile à trahir en silence.

    « Priorités opératoires » est enseignée en Fractions ET en Nombres relatifs (mesuré en base).
    La ranger sous la première serait afficher une information **fausse** sous une apparence de
    certitude, et rien à l'écran ne dirait qu'un choix a été fait (addendum §3).

    ⚠️ SABOTAGE ATTENDU : `next(iter(ch))` sans le `len(ch) == 1`, ou un `sorted(ch)[0]`, doit
    faire ROUGIR. Les deux chapitres ont des `sort_order` ET des noms qui les départagent, pour
    qu'aucun tri « naturel » ne puisse passer pour un hasard heureux.
    """
    _, Session = client_db
    with Session() as db:
        student, subject, sys = _annee(db)
        premier = _chapitre(db, sys, "Alphabet", sort_order=0)
        second = _chapitre(db, sys, "Zébu", sort_order=1)
        notion = _notion(db, subject, "Priorités opératoires")
        _lecon(db, premier, notion, titre="Leçon A")
        _lecon(db, second, notion, titre="Leçon B")
        msn = _mission(db, student, subject, notion)
        db.commit()

        assert chapters_of_missions(db, [msn])[msn.id] is None


def test_sans_lecon_validee_pas_de_chapitre_pour_DEUX_raisons(client_db) -> None:
    """Zéro chapitre → « Sans chapitre ». Deux causes DISTINCTES, et il faut les deux.

    🔴 Un décor à une seule cause laisserait passer un sabotage : c'est arrivé la veille sur
    `/revision`, où deux protections se couvraient l'une l'autre.
    """
    _, Session = client_db
    with Session() as db:
        student, subject, sys = _annee(db)
        chapitre = _chapitre(db, sys, "Grammaire")

        # (1) une notion qu'AUCUNE leçon n'enseigne
        orpheline = _notion(db, subject, "Notion orpheline")
        sans_lecon = _mission(db, student, subject, orpheline, titre="Sans leçon")

        # (2) une notion enseignée par un BROUILLON seulement
        brouillonnee = _notion(db, subject, "Notion en brouillon")
        _lecon(db, chapitre, brouillonnee, status="draft")
        en_brouillon = _mission(db, student, subject, brouillonnee, titre="Brouillon")

        db.commit()
        rendu = chapters_of_missions(db, [sans_lecon, en_brouillon])
        assert rendu[sans_lecon.id] is None, "aucune leçon n'enseigne cette notion"
        assert rendu[en_brouillon.id] is None, "un brouillon n'est pas montrable à Massimo"


def test_un_brouillon_ne_donne_JAMAIS_un_chapitre(client_db) -> None:
    """🔴 L'ERREUR EXACTE QUE LE CADRAGE A COMMISE, transformée en verrou.

    `lessons_by_skill` filtre `Lesson.status != 'archived'` — **les brouillons passent**, et son
    contrat dit que c'est à l'appelant de poser le gate. Le cadrage l'a oublié : sa première mesure
    annonçait 3 missions à deux chapitres et 1 à quatre ; avec le gate `validated`, il en reste
    1 et 1.

    Ici la notion est enseignée par UNE leçon validée et UNE en brouillon, dans DEUX chapitres
    différents. Le bon résultat est donc le chapitre de la **validée** — pas `None`.

    ⚠️ SABOTAGE ATTENDU : retirer `lec.status == "validated"` fait voir deux chapitres, donc rendre
    `None`. Le test ROUGIT. C'est le seul décor qui distingue « gate posé » de « gate oublié ».
    """
    _, Session = client_db
    with Session() as db:
        student, subject, sys = _annee(db)
        publie = _chapitre(db, sys, "Nombres relatifs", sort_order=0)
        futur = _chapitre(db, sys, "Calcul littéral", sort_order=1)
        notion = _notion(db, subject, "Règle des signes")
        _lecon(db, publie, notion, titre="Multiplication de relatifs")
        _lecon(db, futur, notion, status="draft", titre="Suppression de parenthèses")
        msn = _mission(db, student, subject, notion)
        db.commit()

        assert chapters_of_missions(db, [msn])[msn.id] == (publie.id, "Nombres relatifs")


def test_une_champion_derive_de_ses_ETAPES_pas_d_elle_meme(client_db) -> None:
    """Une mission `champion` ne porte AUCUNE notion sur elle-même (ADR-0022) : elles vivent sur
    ses étapes. Ne regarder que `mission.skill_id` la rendrait muette.

    ⚠️ SABOTAGE ATTENDU : retirer la lecture de `MissionStep.skill_id` dans `_skill_ids_of` doit
    faire ROUGIR — la champion retomberait sur `None` sans que rien d'autre ne bouge.
    """
    _, Session = client_db
    with Session() as db:
        student, subject, sys = _annee(db)
        chapitre = _chapitre(db, sys, "Géométrie")
        notion = _notion(db, subject, "Théorème de Pythagore")
        _lecon(db, chapitre, notion)
        # subject_id ET skill_id à NULL : c'est la signature d'une croisée.
        msn = m.Mission(
            student_id=student.id,
            subject_id=None,
            skill_id=None,
            title="Défi champion 🏆",
            mission_type="champion",
            status="planned",
            validation_status="validated",
        )
        db.add(msn)
        db.flush()
        db.add(m.MissionStep(mission_id=msn.id, step_type="quiz", skill_id=notion.id, sort_order=0))
        db.commit()

        assert chapters_of_missions(db, [msn])[msn.id] == (chapitre.id, "Géométrie")


def test_la_liste_eleve_sert_le_chapitre_ET_le_slug_de_matiere(client_db) -> None:
    """🔴 Verrou SERVEUR sur le PAYLOAD — un verrou front seul ne prouve rien.

    En slice Fiches, supprimer un champ du payload laissait **87 tests verts**. Les trois champs
    neufs (`chapter`, `chapter_id`, `subject_slug`) doivent traverser la route élève.

    `subject_slug` manquait : le front devinait le slug par `slugify(nom)`, et un nom accentué ne
    redonne pas toujours le bon slug.
    """
    client, Session = client_db
    with Session() as db:
        student, subject, sys = _annee(db)
        chapitre = _chapitre(db, sys, "Orthographe")
        notion = _notion(db, subject, "Participe passé")
        _lecon(db, chapitre, notion)
        _mission(db, student, subject, notion, titre="Travailler : Participe passé")
        db.commit()
        attendu_id, attendu_slug = chapitre.id, subject.slug

    rows = client.get("/api/missions").json()
    assert len(rows) == 1
    assert rows[0]["chapter"] == "Orthographe"
    assert rows[0]["chapter_id"] == attendu_id
    assert rows[0]["subject_slug"] == attendu_slug


def test_aucune_migration_pour_ce_chantier(client_db) -> None:
    """🔴 LE CRITÈRE QUI BORNE (addendum §4) : le chapitre se calcule à la LECTURE.

    `missions` ne doit gagner **aucune** colonne. Une notion change de chapitres dès que Papa
    valide une leçon : un `chapter_id` dénormalisé serait faux le lendemain sans que rien ne le
    signale — c'est la leçon de `Quiz.chapter_id` (`DATA_MODEL.md`).

    Ce verrou est le **signal d'erreur n° 2** de l'addendum, rendu mécanique.
    """
    colonnes = {c.name for c in m.Mission.__table__.columns}
    assert "chapter_id" not in colonnes
    assert "chapter" not in colonnes
