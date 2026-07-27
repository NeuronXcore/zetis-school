"""Horodatages de bascule : `mastered_at` et `gaps.resolved_at`.

Le cœur du chantier « auto-motivation » : sans ces dates, « consolidées cette semaine » ne peut
pas être calculé honnêtement. Les tests d'IDEMPOTENCE sont les plus importants — c'est le bug qui
rendrait le compteur faux sans jamais lever d'erreur.
"""

from datetime import datetime, timedelta, timezone

import app.db.models as m
from app.modules.progress.mastery import set_mastery_status
from app.modules.progress.service import consolidated_this_week, gaps_closed_this_week

UTC = timezone.utc
T1 = datetime(2026, 7, 27, 10, 0, tzinfo=UTC)
T2 = datetime(2026, 7, 29, 10, 0, tzinfo=UTC)


def _mastery(status: str = "learning", mastered_at=None) -> m.SkillMastery:
    """Ligne détachée : le helper est une fonction PURE, aucune session n'est nécessaire."""
    row = m.SkillMastery(student_id=1, skill_id=1, status=status)
    row.mastered_at = mastered_at
    return row


class TestSetMasteryStatus:
    def test_entree_dans_mastered_tamponne(self) -> None:
        row = _mastery("solid")
        set_mastery_status(row, "mastered", T1)
        assert row.status == "mastered"
        assert row.mastered_at == T1

    def test_mastered_reconfirme_ne_retamponne_PAS(self) -> None:
        """LE test du chantier. `quizzes/scoring.py` rejoue à chaque quiz de fin de cours : si la
        date était repoussée, « consolidées cette semaine » recompterait éternellement les mêmes
        notions et le compteur montré à Massimo serait faux."""
        row = _mastery("mastered", mastered_at=T1)
        set_mastery_status(row, "mastered", T2)
        assert row.mastered_at == T1

    def test_sortie_de_mastered_efface(self) -> None:
        """La date ne survit pas à la régression : elle mentirait sur l'état courant."""
        row = _mastery("mastered", mastered_at=T1)
        set_mastery_status(row, "in_progress", T2)
        assert row.status == "in_progress"
        assert row.mastered_at is None

    def test_reconsolidation_pose_une_date_NEUVE(self) -> None:
        """Une notion qui régresse puis se re-consolide est une victoire RÉCENTE."""
        row = _mastery("mastered", mastered_at=T1)
        set_mastery_status(row, "in_progress", T1)
        set_mastery_status(row, "mastered", T2)
        assert row.mastered_at == T2

    def test_ligne_heritee_reste_sans_date(self) -> None:
        """`mastered` sans date = consolidée avant la migration. La re-confirmer ne doit pas la
        faire apparaître dans la semaine courante."""
        row = _mastery("mastered", mastered_at=None)
        set_mastery_status(row, "mastered", T2)
        assert row.mastered_at is None

    def test_invariant_date_implique_mastered(self) -> None:
        for target in ("solid", "learning", "weak", "unknown"):
            row = _mastery("mastered", mastered_at=T1)
            set_mastery_status(row, target, T2)
            assert row.mastered_at is None, f"date survivante sur {target}"


class TestCompteursHebdomadaires:
    """Comptages en base, sur des semaines Europe/Paris."""

    MONDAY = T1.date()  # lundi 27 juillet 2026

    def _seed_mastery(self, db, *, skill_id: int, status: str, mastered_at) -> None:
        row = m.SkillMastery(student_id=1, skill_id=skill_id, status=status)
        row.mastered_at = mastered_at
        db.add(row)

    def test_compte_la_semaine_et_pas_les_autres(self, client_db) -> None:
        _, TestSession = client_db
        with TestSession() as db:
            student = db.query(m.StudentProfile).first()
            subject = db.query(m.Subject).first()
            skills = [m.Skill(subject_id=subject.id, name=f"N{i}", level="4e") for i in range(3)]
            db.add_all(skills)
            db.flush()
            # Une cette semaine, une la semaine dernière, une héritée (sans date).
            for skill, when in zip(skills, [T2, T1 - timedelta(days=7), None]):
                row = m.SkillMastery(student_id=student.id, skill_id=skill.id, status="mastered")
                row.mastered_at = when
                db.add(row)
            db.commit()

            assert consolidated_this_week(db, student_id=student.id, monday=self.MONDAY) == 1

    def test_gaps_refermes_comptent_des_NOTIONS_distinctes(self, client_db) -> None:
        """`_upsert_gap` ne déduplique que sur `open` : une notion re-ratée alors qu'elle était
        `in_progress` reçoit une SECONDE ligne. Sans DISTINCT, elle compterait deux fermetures."""
        _, TestSession = client_db
        with TestSession() as db:
            student = db.query(m.StudentProfile).first()
            subject = db.query(m.Subject).first()
            skill = m.Skill(subject_id=subject.id, name="Fractions", level="4e")
            db.add(skill)
            db.flush()
            for _ in range(2):
                gap = m.Gap(
                    student_id=student.id,
                    skill_id=skill.id,
                    subject_id=subject.id,
                    status="resolved",
                )
                gap.resolved_at = T2
                db.add(gap)
            db.commit()

            assert gaps_closed_this_week(db, student_id=student.id, monday=self.MONDAY) == 1

    def test_semaine_vide_rend_zero(self, client_db) -> None:
        _, TestSession = client_db
        with TestSession() as db:
            student = db.query(m.StudentProfile).first()
            assert consolidated_this_week(db, student_id=student.id, monday=self.MONDAY) == 0
            assert gaps_closed_this_week(db, student_id=student.id, monday=self.MONDAY) == 0

    def test_bornes_de_semaine_en_heure_de_paris(self, client_db) -> None:
        """Dimanche 22:30 UTC = lundi 00:30 à Paris : l'événement appartient à la semaine
        SUIVANTE. C'est la divergence de fuseau qui existait dans le calcul du streak."""
        _, TestSession = client_db
        with TestSession() as db:
            student = db.query(m.StudentProfile).first()
            subject = db.query(m.Subject).first()
            skill = m.Skill(subject_id=subject.id, name="Bascule", level="4e")
            db.add(skill)
            db.flush()
            # Dimanche 2 août 22:30 UTC → lundi 3 août 00:30 Paris (CEST, UTC+2).
            row = m.SkillMastery(student_id=student.id, skill_id=skill.id, status="mastered")
            row.mastered_at = datetime(2026, 8, 2, 22, 30, tzinfo=UTC)
            db.add(row)
            db.commit()

            # Semaine du 27 juillet (lun→dim 2 août) : l'instant en est SORTI.
            assert consolidated_this_week(db, student_id=student.id, monday=self.MONDAY) == 0
            # Semaine du 3 août : il y est.
            assert (
                consolidated_this_week(
                    db, student_id=student.id, monday=self.MONDAY + timedelta(days=7)
                )
                == 1
            )
