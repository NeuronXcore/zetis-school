from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class Quiz(Base, TimestampMixin):
    __tablename__ = "quizzes"

    id: Mapped[int] = mapped_column(primary_key=True)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id"))
    chapter_id: Mapped[int | None] = mapped_column(ForeignKey("chapters.id"), nullable=True)
    # Leçon source d'un quiz de fin de cours (ADR-0014 : 0..N quiz par leçon). Nullable :
    # les autres contextes (diagnostic, révision) ne sont pas rattachés à une leçon.
    lesson_id: Mapped[int | None] = mapped_column(ForeignKey("lessons.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    quiz_type: Mapped[str] = mapped_column(String(30), default="mission")
    # draft|ready|archived (String libre — pas d'enum DB). `archived` = supprimé mais
    # conservé car il porte des tentatives (ADR-0014 Décision 3 : on n'efface pas l'histoire).
    status: Mapped[str] = mapped_column(String(20), default="draft")
    created_by: Mapped[str] = mapped_column(String(20), default="ai")
    # pending|validated|rejected (ADR-0043 Décision 1). **Seul le diagnostic est gaté** : les quiz
    # de mission et de fin de cours restent servis sans relecture (ADR-0014 §2, intacte), et leur
    # colonne vaut `validated` dès la génération.
    #
    # ⚠️ **`status` et `validation_status` ne sont PAS un doublon.** `status` est le cycle de vie
    # (`draft|ready|archived` — l'ADR-0014 Décision 3 s'en sert pour retirer un quiz sans effacer
    # ses tentatives) ; `validation_status` dit si Papa l'a laissé passer. Un diagnostic `ready`
    # et `pending` est complet mais non servi. Les aligner effacerait cette distinction — même
    # motif que les deux conventions que `review_queue` documente et refuse d'unifier.
    validation_status: Mapped[str] = mapped_column(
        String(20), default="pending", server_default="pending"
    )
    # Provenance (addendum ADR-0011 §F) : QUI a laissé passer. Pour un quiz non gaté, c'est la
    # doctrine elle-même — `validated_by='system'`, écrit à la génération, STRICTEMENT réservé à
    # ce cas (test dédié) : sans ce verrou, une future auto-validation pourrait s'y déguiser sans
    # ADR. Un diagnostic relu par Papa porte `parent`, comme tout contenu relu.
    #
    # ⚠️ `NULL` sur une ligne `validated` n'est pas une anomalie : c'est la signature des quiz
    # antérieurs à l'ADR-0043, backfillés parce qu'ils étaient déjà servis. Personne ne les a
    # laissés passer ; ils sont passés faute de gate. Aucune rétro-attribution (doctrine §F.4).
    validated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    validated_by: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # Lot de production qui a produit cette pièce (ADR-0031 §4). `NULL` = produit hors lot,
    # ou antérieur au journal — **aucune rétro-attribution** (doctrine §F.4).
    production_run_id: Mapped[int | None] = mapped_column(
        ForeignKey("production_runs.id"), nullable=True
    )



class QuizQuestion(Base):
    __tablename__ = "quiz_questions"

    id: Mapped[int] = mapped_column(primary_key=True)
    quiz_id: Mapped[int] = mapped_column(ForeignKey("quizzes.id"))
    skill_id: Mapped[int | None] = mapped_column(ForeignKey("skills.id"), nullable=True)
    # mcq|mcq_multi|true_false|cloze|numeric|ordering|matching (+ short_answer/open légaux
    # mais non émis par le générateur — ADR-0014 Décision 4). String libre, pas d'enum DB.
    question_type: Mapped[str] = mapped_column(String(20), default="mcq")
    prompt_markdown: Mapped[str] = mapped_column(Text)
    # PRÉSENTATION servie à l'élève (jamais la clé) : options mcq, colonnes matching, items
    # ordering… `correct_answer_json` porte la clé, jamais renvoyée côté /api/student.
    choices_json: Mapped[dict | list | None] = mapped_column(JSON, nullable=True)
    correct_answer_json: Mapped[dict | list | None] = mapped_column(JSON, nullable=True)
    explanation_markdown: Mapped[str | None] = mapped_column(Text, nullable=True)
    difficulty: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    # ADR-0014 Décision 3 : `source` distingue le généré de l'édité-à-la-main (préservé par
    # la régénération) ; `status` retire une question défectueuse des tirages sans effacer
    # les `quiz_answers` déjà collectées.
    source: Mapped[str] = mapped_column(String(20), default="generated")  # generated|manual
    status: Mapped[str] = mapped_column(String(20), default="active")  # active|retired


class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"

    id: Mapped[int] = mapped_column(primary_key=True)
    quiz_id: Mapped[int] = mapped_column(ForeignKey("quizzes.id"))
    student_id: Mapped[int] = mapped_column(ForeignKey("student_profiles.id"))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    score_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    context: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # Les conditions dans lesquelles cette mesure a été prise (ADR-0048). **Écrit UNE fois, à la
    # soumission, et jamais recalculé à la lecture** : une règle qui change re-jugerait sinon tout
    # l'historique, et une mesure que Papa a déjà lue changerait d'avis sous ses yeux. `regle_version`
    # dit quelle règle l'a produit.
    #
    # 🔴 `NULL` ≠ « rien à signaler ». `NULL` veut dire **ZETIS ne regardait pas** — c'est le cas de
    # toutes les passations antérieures au chantier, et elles ne seront jamais rétro-remplies. Les
    # deux états se distinguent à l'écran (spec §6.2) ; les confondre ferait passer une absence
    # d'instrument pour un constat d'instrument.
    #
    # 🔴 Règle de vocabulaire : ce champ décrit LA MESURE, jamais l'enfant.
    reliability_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class QuizAnswer(Base):
    __tablename__ = "quiz_answers"

    id: Mapped[int] = mapped_column(primary_key=True)
    attempt_id: Mapped[int] = mapped_column(ForeignKey("quiz_attempts.id"))
    question_id: Mapped[int] = mapped_column(ForeignKey("quiz_questions.id"))
    answer_json: Mapped[dict | list | None] = mapped_column(JSON, nullable=True)
    is_correct: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    feedback_markdown: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Jugement structuré d'une réponse `open` (ADR-0014 Lot 2) : critère par critère + drapeau
    # d'ambiguïté (jamais une note globale opaque). Null pour les formats déterministes.
    ai_evaluation_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
