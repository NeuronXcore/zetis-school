"""Le contrat de liste : ce que la page de Massimo doit pouvoir hiérarchiser (ADR-0044 Décision 6).

Ce fichier porte **le verrou central de la session A** — *`measured_at` est `null` si et seulement
si aucune notion du diagnostic n'a jamais été mesurée*.

⚠️ **Le décor est monté à la main, et il est NON DÉGÉNÉRÉ par construction** : trois diagnostics
**dans la même matière**, portant des notions **différentes**, avec des dates distinctes et non
extrêmes. Les deux propriétés servent chacune un sabotage précis :

- **même matière** → un agrégat par `subject_id` (le raccourci tentant) donnerait la même date aux
  trois. C'est le piège nommé par l'ADR : plus simple, plus rapide, et faux.
- **une notion jamais mesurée** → une jointure interne au lieu d'une jointure gauche ferait
  **disparaître** ce diagnostic de la liste au lieu de le sortir en tête.

100 % hors-ligne (SQLite), sans passer par le générateur : ce fichier teste le **contrat**, pas ce
que le `FakeLLMProvider` produit.
"""

from datetime import datetime, timezone

import app.db.models as m
from app.tests.test_diagnostics import as_massimo

# Deux instants distincts et NON EXTRÊMES — ni epoch, ni maintenant. Un verrou de valeur posé sur
# un plancher ou un plafond ne peut rien distinguer (leçon du sabotage vert de l'ADR-0043).
MESURE_ANCIENNE = datetime(2026, 3, 15, 10, 0, tzinfo=timezone.utc)
MESURE_RECENTE = datetime(2026, 7, 20, 10, 0, tzinfo=timezone.utc)


def _notion(db, nom: str) -> m.Skill:
    skill = m.Skill(subject_id=1, name=nom, level="4e")
    db.add(skill)
    db.flush()
    return skill


def _diagnostic(db, *, titre: str, skill: m.Skill) -> int:
    """Un diagnostic **relu** (le gate ADR-0043 n'est pas le sujet ici) sur UNE notion."""
    quiz = m.Quiz(
        subject_id=1,
        title=titre,
        quiz_type="diagnostic",
        status="ready",
        created_by="ai",
        validation_status="validated",
    )
    db.add(quiz)
    db.flush()
    db.add(
        m.QuizQuestion(
            quiz_id=quiz.id,
            skill_id=skill.id,
            question_type="mcq",
            prompt_markdown="2 + 2 ?",
            choices_json=["4", "5"],
            correct_answer_json=0,
            sort_order=0,
        )
    )
    return quiz.id


def _mesure(db, skill: m.Skill, quand: datetime) -> None:
    student = db.query(m.StudentProfile).first()
    db.add(
        m.SkillMastery(
            student_id=student.id,
            skill_id=skill.id,
            mastery_score=50,
            status="learning",
            last_seen_at=quand,
        )
    )


def _decor(db) -> dict[str, int]:
    """Trois diagnostics, une seule matière, trois notions — dont une jamais mesurée."""
    jamais, ancienne, recente = (
        _notion(db, "Notion jamais mesurée"),
        _notion(db, "Notion mesurée il y a longtemps"),
        _notion(db, "Notion mesurée récemment"),
    )
    ids = {
        "jamais": _diagnostic(db, titre="Diagnostic — jamais mesuré", skill=jamais),
        "ancien": _diagnostic(db, titre="Diagnostic — mesure ancienne", skill=ancienne),
        "recent": _diagnostic(db, titre="Diagnostic — mesure récente", skill=recente),
    }
    _mesure(db, ancienne, MESURE_ANCIENNE)
    _mesure(db, recente, MESURE_RECENTE)
    db.commit()
    return ids


def _par_id(client) -> dict[int, dict]:
    return {row["quiz_id"]: row for row in client.get("/api/diagnostics/quizzes").json()}


def test_measured_at_est_null_ssi_la_notion_n_a_jamais_ete_mesuree(client_db) -> None:
    """LE VERROU. Deux sabotages le font rougir, et ils échouent différemment.

    1. jointure gauche → jointure interne : le diagnostic jamais mesuré **disparaît** ;
    2. agrégat par matière → les trois portent la même date, et `jamais` cesse d'être `None`.

    D'où les deux moitiés de ce test : la **présence** des trois, puis leurs **dates**.
    """
    client, TestSession = client_db
    with TestSession() as db:
        ids = _decor(db)
    as_massimo()

    rows = _par_id(client)

    # ⚠️ La moitié qu'on oublie d'écrire : sans elle, « measured_at is None » serait vrai d'un
    # diagnostic ABSENT de la liste — un `KeyError` dirait la vérité, mais seulement par accident.
    assert set(rows) == set(ids.values()), "les trois diagnostics relus doivent être servis"

    assert rows[ids["jamais"]]["measured_at"] is None
    assert rows[ids["ancien"]]["measured_at"] is not None
    assert rows[ids["recent"]]["measured_at"] is not None


def test_la_mesure_est_celle_des_notions_du_diagnostic_pas_de_sa_matiere(client_db) -> None:
    """Le second sabotage, isolé : deux diagnostics d'UNE MÊME matière portent deux dates.

    Un agrégat par `subject_id` les rendrait égales — et rien à l'écran ne le dirait, puisque
    l'ordre de liste qui en découlerait resterait plausible.
    """
    client, TestSession = client_db
    with TestSession() as db:
        ids = _decor(db)
    as_massimo()

    rows = _par_id(client)
    ancien, recent = rows[ids["ancien"]], rows[ids["recent"]]

    # Comparaison sur le préfixe de date : SQLite rend un datetime naïf là où PostgreSQL garde le
    # fuseau, donc l'ISO complet diffère d'un moteur à l'autre. La date, elle, ne bouge pas.
    assert ancien["measured_at"][:10] == "2026-03-15"
    assert recent["measured_at"][:10] == "2026-07-20"
    assert ancien["measured_at"] < recent["measured_at"], "l'ordre des mesures doit être lisible"


def test_le_contrat_sert_le_slug_de_matiere(client_db) -> None:
    """Sans le slug, le front recode les matières en dur — `CLAUDE.md` l'interdit."""
    client, TestSession = client_db
    with TestSession() as db:
        _decor(db)
    as_massimo()

    for row in client.get("/api/diagnostics/quizzes").json():
        assert row["subject"] == "Mathématiques"
        assert row["subject_slug"] == "mathematiques"


def test_taken_at_et_last_attempt_id_sortent_de_la_meme_passation(client_db) -> None:
    """Deux champs, une seule ligne : ils ne peuvent pas se contredire.

    Le décor pose **deux** passations terminées sur le même diagnostic — sans la seconde, « la
    dernière » serait vraie par défaut et ne prouverait rien.
    """
    client, TestSession = client_db
    with TestSession() as db:
        ids = _decor(db)
        student = db.query(m.StudentProfile).first()
        for quand in (MESURE_ANCIENNE, MESURE_RECENTE):
            db.add(
                m.QuizAttempt(
                    quiz_id=ids["ancien"],
                    student_id=student.id,
                    completed_at=quand,
                    score_percent=50,
                )
            )
        db.commit()
        derniere = (
            db.query(m.QuizAttempt).order_by(m.QuizAttempt.completed_at.desc()).first().id
        )
    as_massimo()

    rows = _par_id(client)
    passe, jamais_passe = rows[ids["ancien"]], rows[ids["jamais"]]

    assert passe["taken_at"][:10] == "2026-07-20", "c'est la DERNIÈRE passation qui date la ligne"
    assert passe["last_attempt_id"] == derniere

    # `taken` n'existe plus (Décision 6) : il reste dérivable, et c'est tout ce qu'on en attend.
    assert jamais_passe["taken_at"] is None
    assert jamais_passe["last_attempt_id"] is None
