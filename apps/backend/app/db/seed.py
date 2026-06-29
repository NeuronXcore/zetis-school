"""Seed de développement (Étape 9). Idempotent : ne s'exécute que si la base est vide.

Usage : python -m app.db.seed
"""

from app.db import models as m
from app.db.base import SessionLocal

SUBJECTS = [
    ("Français", "francais", "#f472b6", "📖"),
    ("Mathématiques", "mathematiques", "#60a5fa", "➗"),
    ("Histoire-Géo", "histoire-geo", "#fbbf24", "🌍"),
    ("SVT", "svt", "#34d399", "🌱"),
    ("Anglais", "anglais", "#a78bfa", "🇬🇧"),
    ("Espagnol", "espagnol", "#fb923c", "🇪🇸"),
    ("Physique-Chimie", "physique-chimie", "#22d3ee", "⚗️"),
    ("Technologie", "technologie", "#94a3b8", "🛠️"),
]


def seed() -> None:
    db = SessionLocal()
    try:
        if db.query(m.User).count() > 0:
            print("Seed ignoré : la base contient déjà des données.")
            return

        # Utilisateurs (identité — pas de mot de passe, cf. DATA_MODEL).
        papa = m.User(email="papa@zetis.local", name="Papa", role="parent")
        massimo = m.User(email="massimo@zetis.local", name="Massimo", role="child")
        db.add_all([papa, massimo])
        db.flush()

        profile = m.StudentProfile(
            user_id=massimo.id, first_name="Massimo", school_level_current="4e"
        )
        db.add(profile)
        db.flush()

        year = m.SchoolYear(
            student_id=profile.id, label="2026-2027", level="4e", status="active", mode="hybrid"
        )
        db.add(year)
        db.flush()

        subjects = {}
        for i, (name, slug, color, icon) in enumerate(SUBJECTS):
            s = m.Subject(name=name, slug=slug, color=color, icon=icon, sort_order=i)
            db.add(s)
            subjects[slug] = s
        db.flush()

        sys_map = {}
        for slug, subject in subjects.items():
            sy = m.SchoolYearSubject(
                school_year_id=year.id, subject_id=subject.id, weekly_target_minutes=60
            )
            db.add(sy)
            sys_map[slug] = sy
        db.flush()

        chapters = {
            "francais": ["Lecture et compréhension", "Grammaire", "Orthographe", "Expression écrite"],
            "mathematiques": ["Nombres relatifs", "Fractions", "Proportionnalité", "Géométrie"],
        }
        for slug, names in chapters.items():
            for i, name in enumerate(names):
                db.add(
                    m.Chapter(
                        school_year_subject_id=sys_map[slug].id,
                        name=name,
                        sort_order=i,
                        status="active" if i == 0 else "planned",
                    )
                )

        skill_relatifs = m.Skill(
            subject_id=subjects["mathematiques"].id, name="Nombres relatifs", level="4e"
        )
        skill_recit = m.Skill(subject_id=subjects["francais"].id, name="Temps du récit", level="4e")
        db.add_all([skill_relatifs, skill_recit])
        db.flush()

        db.add(
            m.Mission(
                student_id=profile.id,
                subject_id=subjects["mathematiques"].id,
                skill_id=skill_relatifs.id,
                title="Renforcer les nombres relatifs",
                mission_type="practice",
                status="active",
                priority=1,
                created_by="ai",
            )
        )

        quiz = m.Quiz(
            subject_id=subjects["mathematiques"].id,
            title="Quiz — Nombres relatifs",
            quiz_type="mission",
            status="draft",
            created_by="ai",
        )
        db.add(quiz)
        db.flush()
        db.add(
            m.QuizQuestion(
                quiz_id=quiz.id,
                skill_id=skill_relatifs.id,
                question_type="mcq",
                prompt_markdown="Quel nombre est le plus petit ?",
                choices_json=["-5", "-2", "0", "+3"],
                correct_answer_json="-5",
                explanation_markdown="-5 est le plus à gauche sur la droite des nombres.",
                sort_order=0,
            )
        )

        db.commit()
        print("Seed OK : Papa, Massimo, année 4e, 8 matières, chapitres, notions, 1 mission, 1 quiz.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
