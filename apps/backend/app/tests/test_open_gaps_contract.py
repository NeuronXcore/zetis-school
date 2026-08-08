"""`GET /api/parent/progress/gaps` sert `source` et `content_state` (ADR-0045, slice C).

🔴 **Pourquoi ces deux champs existent.** Les jauges de la page Diagnostic de Papa renvoient ici
avec `?source=diagnostic` et `?contenu=absent`. Tant que la charge utile ne portait pas de quoi
filtrer, le renvoi « dont 4 sans contenu → » menait à une page qui en affichait **10** : un nombre
cliquable qui conduit à un autre nombre est **pire** que le nombre invisible qu'il remplace, et
c'est le défaut même dont l'ADR-0039 est né.

⚠️ **Le décor est NON DÉGÉNÉRÉ, et c'est tout le test.** Il porte les **trois** états de contenu et
**deux** origines. Avec un seul état, n'importe quelle valeur constante passerait ; avec une seule
origine, un filtre qui ne filtre rien passerait aussi.
"""

import app.db.models as m
from app.main import app
from app.modules.auth.deps import get_current_user


def _as_papa() -> None:
    app.dependency_overrides[get_current_user] = lambda: {"username": "papa", "role": "papa"}


def _seed(TestSession) -> None:
    """Trois lacunes, trois états de contenu, deux origines.

    | notion       | leçon            | `content_state` attendu | `source`     |
    |--------------|------------------|-------------------------|--------------|
    | Avec cours   | une `validated`  | `ok`                    | `diagnostic` |
    | Sans leçon   | **aucune**       | `aucune_lecon`          | `diagnostic` |
    | Cours draft  | une `draft`      | `cours_brouillon`       | `mission`    |
    """
    with TestSession() as db:
        student = db.query(m.StudentProfile).first()
        subject = db.query(m.Subject).first()

        # ⚠️ Une leçon n'est trouvée par `lessons_by_skill` que via **année ACTIVE →
        # SchoolYearSubject → chapitre `validated`**. Sans cette chaîne, les trois notions
        # ressortiraient `aucune_lecon` et le test passerait pour la mauvaise raison.
        year = m.SchoolYear(
            student_id=student.id, label="2026-2027", level="4e", status="active"
        )
        db.add(year)
        db.flush()
        sys_row = m.SchoolYearSubject(school_year_id=year.id, subject_id=subject.id)
        db.add(sys_row)
        db.flush()
        chapter = m.Chapter(
            school_year_subject_id=sys_row.id, name="Chapitre", validation_status="validated"
        )
        db.add(chapter)
        db.flush()

        skills = {}
        for nom in ("Avec cours", "Sans leçon", "Cours draft"):
            skill = m.Skill(subject_id=subject.id, name=nom, level="4e")
            db.add(skill)
            skills[nom] = skill
        db.flush()

        for nom, statut in (("Avec cours", "validated"), ("Cours draft", "draft")):
            lecon = m.Lesson(
                chapter_id=chapter.id,
                title=f"Leçon {nom}",
                status=statut,
                created_by="parent",
            )
            db.add(lecon)
            db.flush()
            db.add(m.LessonSkill(lesson_id=lecon.id, skill_id=skills[nom].id))

        for nom, source in (
            ("Avec cours", "diagnostic"),
            ("Sans leçon", "diagnostic"),
            ("Cours draft", "mission"),
        ):
            db.add(
                m.Gap(
                    student_id=student.id,
                    skill_id=skills[nom].id,
                    subject_id=subject.id,
                    source=source,
                    severity="medium",
                    status="open",
                )
            )
        db.commit()


def test_open_gaps_sert_l_origine_de_chaque_lacune(client_db) -> None:
    """Sans `source`, la page ne peut pas distinguer ce qu'une MESURE a ouvert de ce qu'un
    EXERCICE a révélé — et le renvoi d'une jauge du Diagnostic ramène les deux."""
    client, TestSession = client_db
    _seed(TestSession)
    _as_papa()

    par_notion = {g["skill_name"]: g for g in client.get("/api/parent/progress/gaps").json()}

    assert par_notion["Avec cours"]["source"] == "diagnostic"
    assert par_notion["Sans leçon"]["source"] == "diagnostic"
    # 🔴 Celle-ci NE vient PAS d'un diagnostic : c'est elle qui rend le filtre nécessaire.
    assert par_notion["Cours draft"]["source"] == "mission"


def test_open_gaps_distingue_les_TROIS_etats_de_contenu(client_db) -> None:
    """🔴 `aucune_lecon` et `cours_brouillon` ne se confondent pas (ADR-0042) : sans leçon la lacune
    est réparable par un quiz ancré sur la notion, avec un cours en brouillon cette voie REFUSE."""
    client, TestSession = client_db
    _seed(TestSession)
    _as_papa()

    par_notion = {g["skill_name"]: g for g in client.get("/api/parent/progress/gaps").json()}

    assert par_notion["Avec cours"]["content_state"] == "ok"
    assert par_notion["Sans leçon"]["content_state"] == "aucune_lecon"
    assert par_notion["Cours draft"]["content_state"] == "cours_brouillon"


def test_le_compte_sans_contenu_produisible_est_derivable(client_db) -> None:
    """Le nombre que la jauge annonce (« dont N sans contenu ») doit pouvoir se retrouver ICI.

    C'est l'invariant du chantier : **un renvoi mène au compte qu'il annonce**. Deux surfaces qui
    comptent la même population par deux chemins différents finiront par diverger ; ce test dit
    que le chemin existe."""
    client, TestSession = client_db
    _seed(TestSession)
    _as_papa()

    gaps = client.get("/api/parent/progress/gaps").json()
    sans_contenu = [g for g in gaps if g["content_state"] != "ok"]

    assert len(sans_contenu) == 2
    assert {g["skill_name"] for g in sans_contenu} == {"Sans leçon", "Cours draft"}
