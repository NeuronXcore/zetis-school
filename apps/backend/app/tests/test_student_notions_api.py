"""Tests HTTP des routes élève « notions validées » (decks ELI5 v2) — lecture seule,
validé uniquement, même chaîne de filtrage que la page Cours (ADR-0009 §9 : rien
n'atteint Massimo avant validation).

Deux routes couvertes :
- `GET /api/student/notions/summary` (compteurs par matière) ;
- `GET /api/student/subjects/{subject_slug}/notions` (liste dédupliquée par skill_id).

Le conftest authentifie en rôle `child` : ces routes doivent lui répondre 200.
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select

import app.db.models as m


def _link(db, lesson_id: int, skill_id: int) -> None:
    db.add(m.LessonSkill(lesson_id=lesson_id, skill_id=skill_id))


def _seed(Session) -> dict:
    """Année active 4e, deux matières. Maths = chapitre validé (leçons validées + une
    draft) reliant des notions, plus un chapitre `pending` et une leçon `draft` dans le
    chapitre validé pour éprouver le filtrage. Français = matière SANS rien de validé
    (doit apparaître à 0 dans le summary, `notions: []` dans le détail)."""
    with Session() as db:
        profile = db.scalars(select(m.StudentProfile)).first()
        maths = db.scalars(select(m.Subject).where(m.Subject.slug == "mathematiques")).first()
        # Une seconde matière pour le summary multi-matières (vide côté validé).
        francais = m.Subject(name="Français", slug="francais", sort_order=1)
        db.add(francais)
        db.flush()

        year = m.SchoolYear(student_id=profile.id, label="2026-2027", level="4e", status="active")
        db.add(year)
        db.flush()
        sys_maths = m.SchoolYearSubject(school_year_id=year.id, subject_id=maths.id)
        sys_fr = m.SchoolYearSubject(school_year_id=year.id, subject_id=francais.id)
        db.add_all([sys_maths, sys_fr])
        db.flush()

        # Chapitres maths : un validé (sort_order 0), un plus loin validé (1), un pending (2).
        ch_valide = m.Chapter(
            school_year_subject_id=sys_maths.id, name="Nombres relatifs", sort_order=0,
            source="generated", validation_status="validated",
        )
        ch_valide_2 = m.Chapter(
            school_year_subject_id=sys_maths.id, name="Fractions", sort_order=1,
            source="generated", validation_status="validated",
        )
        ch_pending = m.Chapter(
            school_year_subject_id=sys_maths.id, name="Chapitre non validé", sort_order=2,
            source="generated", validation_status="pending",
        )
        db.add_all([ch_valide, ch_valide_2, ch_pending])
        db.flush()

        # Notions (Skill) maths.
        s_relatifs = m.Skill(subject_id=maths.id, name="Additionner des relatifs")
        s_signes = m.Skill(subject_id=maths.id, name="Règle des signes")
        s_fractions = m.Skill(subject_id=maths.id, name="Simplifier une fraction")
        s_cachee = m.Skill(subject_id=maths.id, name="Notion cachée (draft only)")
        s_pending = m.Skill(subject_id=maths.id, name="Notion de chapitre pending")
        db.add_all([s_relatifs, s_signes, s_fractions, s_cachee, s_pending])
        db.flush()

        # Leçons du chapitre validé.
        l_valide = m.Lesson(
            chapter_id=ch_valide.id, title="Additions", created_by="ai", status="validated",
            sort_order=0,
        )
        l_valide_b = m.Lesson(
            chapter_id=ch_valide.id, title="Multiplications", created_by="ai", status="validated",
            sort_order=1,
        )
        # Leçon draft dans un chapitre validé : ses notions ne doivent PAS sortir.
        l_draft = m.Lesson(
            chapter_id=ch_valide.id, title="Brouillon", created_by="ai", status="draft",
            sort_order=2,
        )
        # Leçon validée du 2e chapitre validé (plus récente) — enseigne AUSSI s_signes.
        l_valide_ch2 = m.Lesson(
            chapter_id=ch_valide_2.id, title="Signes et fractions", created_by="ai",
            status="validated", sort_order=0,
        )
        # Leçon validée dans le chapitre pending : filtrée par le statut du chapitre.
        l_in_pending = m.Lesson(
            chapter_id=ch_pending.id, title="Leçon d'un chapitre non validé", created_by="ai",
            status="validated", sort_order=0,
        )
        db.add_all([l_valide, l_valide_b, l_draft, l_valide_ch2, l_in_pending])
        db.flush()

        # updated_at déterministes : l_valide_ch2 est la plus récente pour s_signes.
        l_valide.updated_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
        l_valide_b.updated_at = datetime(2026, 1, 2, tzinfo=timezone.utc)
        l_valide_ch2.updated_at = datetime(2026, 6, 1, tzinfo=timezone.utc)

        # Liaisons.
        _link(db, l_valide.id, s_relatifs.id)
        _link(db, l_valide_b.id, s_signes.id)          # s_signes via chapitre 0 (ancien)
        _link(db, l_valide_ch2.id, s_signes.id)        # s_signes via chapitre 1 (plus récent)
        _link(db, l_valide_ch2.id, s_fractions.id)
        _link(db, l_draft.id, s_cachee.id)             # draft → jamais visible
        _link(db, l_in_pending.id, s_pending.id)       # chapitre pending → jamais visible
        db.commit()

        return {
            "maths_slug": maths.slug,
            "francais_slug": francais.slug,
            "s_signes": s_signes.id,
            "ch2_name": ch_valide_2.name,
        }


def test_summary_counts_per_subject_including_empty(client_db) -> None:
    client, Session = client_db  # rôle child (conftest)
    _seed(Session)

    res = client.get("/api/student/notions/summary")
    assert res.status_code == 200
    subjects = {s["slug"]: s for s in res.json()["subjects"]}

    # Maths : 3 notions distinctes validées (relatifs, signes, fractions) — les notions
    # cachée (draft) et pending ne comptent pas ; s_signes n'est compté qu'une fois.
    assert subjects["mathematiques"]["notion_count"] == 3
    assert subjects["mathematiques"]["name"] == "Mathématiques" or subjects["mathematiques"]["name"]
    # Leçons fraîchement créées (défaut) → les 3 notions sont « new ».
    assert subjects["mathematiques"]["new_count"] == 3
    # Français : présent, à 0/0 (front « bientôt »), jamais filtré.
    assert subjects["francais"]["notion_count"] == 0
    assert subjects["francais"]["new_count"] == 0


def test_summary_new_count_only_within_freshness_window(client_db) -> None:
    """« new » = notion dont une leçon validée porteuse a été créée récemment. Une notion
    n'ayant que des leçons anciennes ne compte PAS comme fraîche."""
    client, Session = client_db
    with Session() as db:
        maths = db.scalars(select(m.Subject).where(m.Subject.slug == "mathematiques")).first()
        profile = db.scalars(select(m.StudentProfile)).first()
        year = m.SchoolYear(student_id=profile.id, label="2026-2027", level="4e", status="active")
        db.add(year)
        db.flush()
        sys_row = m.SchoolYearSubject(school_year_id=year.id, subject_id=maths.id)
        db.add(sys_row)
        db.flush()
        chapter = m.Chapter(
            school_year_subject_id=sys_row.id, name="Nombres", sort_order=0,
            source="generated", validation_status="validated",
        )
        db.add(chapter)
        db.flush()
        s_fresh = m.Skill(subject_id=maths.id, name="Notion fraîche")
        s_old = m.Skill(subject_id=maths.id, name="Notion ancienne")
        db.add_all([s_fresh, s_old])
        db.flush()
        fresh = m.Lesson(chapter_id=chapter.id, title="Fraîche", created_by="ai", status="validated")
        old = m.Lesson(chapter_id=chapter.id, title="Ancienne", created_by="ai", status="validated")
        db.add_all([fresh, old])
        db.flush()
        # La leçon « ancienne » est créée hors fenêtre (30 j) → sa notion n'est pas « new ».
        old.created_at = datetime.now(timezone.utc) - timedelta(days=30)
        db.add(m.LessonSkill(lesson_id=fresh.id, skill_id=s_fresh.id))
        db.add(m.LessonSkill(lesson_id=old.id, skill_id=s_old.id))
        db.commit()

    res = client.get("/api/student/notions/summary")
    assert res.status_code == 200
    maths_row = next(s for s in res.json()["subjects"] if s["slug"] == "mathematiques")
    assert maths_row["notion_count"] == 2  # les deux notions comptent
    assert maths_row["new_count"] == 1  # seule la notion fraîche est « new »


def test_subject_notions_dedup_filtering_and_recent_chapter(client_db) -> None:
    client, Session = client_db
    ids = _seed(Session)

    res = client.get(f"/api/student/subjects/{ids['maths_slug']}/notions")
    assert res.status_code == 200
    body = res.json()
    assert body["subject"]["slug"] == "mathematiques"
    notions = body["notions"]
    names = [n["name"] for n in notions]

    # Filtrage : draft & chapitre pending exclus.
    assert "Notion cachée (draft only)" not in names
    assert "Notion de chapitre pending" not in names
    # Dédup : s_signes une seule fois.
    signes = [n for n in notions if n["skill_id"] == ids["s_signes"]]
    assert len(signes) == 1
    # chapter_title = celui de la leçon la plus récente (chapitre 2 « Fractions »).
    assert signes[0]["chapter_title"] == ids["ch2_name"]

    # Tri : ordre des chapitres (sort_order) puis nom de notion. Chapitre 0 d'abord
    # (« Additionner des relatifs »), puis chapitre 1 (« Règle des signes » avant
    # « Simplifier une fraction »).
    assert names == [
        "Additionner des relatifs",
        "Règle des signes",
        "Simplifier une fraction",
    ]


def test_subject_with_nothing_validated_returns_empty_list(client_db) -> None:
    client, Session = client_db
    ids = _seed(Session)

    res = client.get(f"/api/student/subjects/{ids['francais_slug']}/notions")
    assert res.status_code == 200
    body = res.json()
    assert body["subject"]["slug"] == "francais"
    assert body["notions"] == []


def test_unknown_subject_is_404(client_db) -> None:
    client, Session = client_db
    _seed(Session)
    assert client.get("/api/student/subjects/matiere-inconnue/notions").status_code == 404
