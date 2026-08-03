"""Le déclencheur automatique (ADR-0035).

Le test qui compte le plus est `test_parent_rule_semet_enfin` : `parent_rule` est déclarée
**légale et non émise** depuis le 2026-07-28 (§G.1), et trois documents ont expliqué pourquoi elle
ne pouvait pas l'être tant que tout lot partait d'un clic. C'est ici qu'elle s'écrit pour la
première fois — et si ce test tombe, l'axe 2 de « full autonomie » n'existe pas.

Les autres protègent le régulateur, l'idempotence, et le fait que **rien ne démarre par défaut**.
"""

from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import select

import app.db.models as m
from app.core.config import settings
from app.modules.production import runs, triggers
from app.modules.production.runner import authority_for
from app.modules.settings import service as svc
from app.tests.test_production_coverage import _seed_lesson, _seed_year


def _arm(db) -> None:
    """Arme le déclencheur — désarmé par défaut, il faut un geste explicite de Papa."""
    svc.set_auto_trigger_enabled(db, enabled=True)


def _controle(db, chapter, *, days: int = 3, kind: str = "controle", chapter_id=...) -> m.AgendaItem:
    student = db.scalar(select(m.StudentProfile))
    item = m.AgendaItem(
        student_id=student.id,
        chapter_id=chapter.id if chapter_id is ... else chapter_id,
        due_on=date.today() + timedelta(days=days),
        label="Contrôle sur les fractions",
        kind=kind,
        created_by="parent",
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def _seed(db):
    _, subject, chapter = _seed_year(db)
    lesson = _seed_lesson(db, chapter, title="Fractions", validated=True, course=True)
    skill = m.Skill(subject_id=subject.id, name="Additionner des fractions", level="4e")
    db.add(skill)
    db.flush()
    db.add(m.LessonSkill(lesson_id=lesson.id, skill_id=skill.id))
    db.commit()
    return chapter


# --- LE VERROU DE L'AXE 2 ----------------------------------------------------------------------


def test_parent_rule_semet_enfin(client_db) -> None:
    """⚠️ LE test du chantier. `parent_rule` était légale et NON ÉMISE depuis le 2026-07-28.

    Le §G.1 la définit par l'absence de clic : « aucun humain n'a ouvert cette pièce, **ni cliqué
    pour ce lot** ». Un lot né du scan satisfait cette définition pour la première fois.

    `authority_for` n'a pas été modifiée — elle attendait ce jour. Si elle rendait autre chose que
    `parent_rule` ici, tout le raisonnement de l'ADR-0032 §2 serait faux.
    """
    _, Session = client_db
    with Session() as db:
        chapter = _seed(db)
        _arm(db)
        item = _controle(db, chapter)

        report = triggers.scan_agenda(db)
        assert len(report["created"]) == 1, report

        run = db.get(m.ProductionRun, report["created"][0]["run_id"])
        assert run.trigger == "agenda"
        assert run.authorized_by == "parent_rule"
        assert run.agenda_item_id == item.id, "la référence typée n'est pas renseignée"
        # A0a est à 3 par défaut → les dérivés sont servis, et tamponnés `parent_rule`.
        assert authority_for(db, run) == "parent_rule"


# --- Rien ne démarre par défaut -----------------------------------------------------------------


def test_desarme_par_defaut_rien_ne_se_declenche(client_db) -> None:
    """La 7ᵉ clé vaut NON tant que Papa ne l'a pas armée. Un dispositif qui se met à travailler
    seul après une mise à jour serait une surprise, pas une fonctionnalité."""
    _, Session = client_db
    with Session() as db:
        chapter = _seed(db)
        _controle(db, chapter)

        assert svc.auto_trigger_enabled(db) is False
        report = triggers.scan_agenda(db)
        assert report["created"] == []
        assert report["skipped"][0]["reason"] == triggers.SKIP_DISABLED


def test_un_lot_automatique_ne_demarre_pas_pendant_que_massimo_travaille(client_db) -> None:
    """ADR-0035 §7. La préemption existante rend la main EN COURS DE ROUTE, ce qui suffisait pour
    un lot que Papa venait de demander. Un lot que **personne** n'a demandé ne doit pas disputer
    Ollama à la session de Massimo, fût-ce une notion."""
    _, Session = client_db
    with Session() as db:
        chapter = _seed(db)
        _arm(db)
        _controle(db, chapter)

        student = db.scalar(select(m.StudentProfile))
        db.add(
            m.LearningEvent(
                student_id=student.id,
                event_type="quiz_attempted",
                created_at=datetime.now(timezone.utc),
            )
        )
        db.commit()

        report = triggers.scan_agenda(db)
        assert report["created"] == []
        assert report["skipped"][0]["reason"] == triggers.SKIP_MASSIMO_ACTIVE


def test_se_connecter_nest_pas_travailler(client_db) -> None:
    """⚠️ Verrou d'un défaut MESURÉ EN VRAI le 2026-08-03, pas imaginé.

    `massimo_is_active` ne filtrait que `NON_ACTIVITY_EVENTS` : un simple `login` la faisait
    répondre « il travaille » pendant cinq minutes. Le module agenda avait pourtant DÉJÀ tranché
    en privé — *« la navigation n'est pas du travail (sans quoi ouvrir la page allumerait une
    trace) »*. Deux lecteurs de la même question lisaient deux listes différentes.

    Anodin tant que Papa cliquait (le lot attendait entre deux notions) ; **bloquant depuis
    l'ADR-0035 §7**, où cette réponse décide si un lot AUTOMATIQUE démarre : un `login` faisait
    sauter un réveil entier du scan, soit jusqu'à trois heures.
    """
    _, Session = client_db
    with Session() as db:
        chapter = _seed(db)
        _arm(db)
        _controle(db, chapter)

        student = db.scalar(select(m.StudentProfile))
        for passif in ("login", "page_viewed"):
            db.add(
                m.LearningEvent(
                    student_id=student.id,
                    event_type=passif,
                    created_at=datetime.now(timezone.utc),
                )
            )
        db.commit()

        assert len(triggers.scan_agenda(db)["created"]) == 1, (
            "un login ou une navigation suffit encore à suspendre la production"
        )


# --- Les cinq conditions ------------------------------------------------------------------------


@pytest.mark.parametrize(
    "kwargs, motif",
    [
        ({"kind": "devoir"}, "un devoir reviendrait tous les jours"),
        ({"chapter_id": None}, "sans chapitre il n'y a rien à produire"),
        ({"days": 60}, "produire deux mois à l'avance, c'est produire pour un programme changé"),
    ],
)
def test_les_echeances_hors_conditions_ne_declenchent_rien(client_db, kwargs, motif) -> None:
    _, Session = client_db
    with Session() as db:
        chapter = _seed(db)
        _arm(db)
        _controle(db, chapter, **kwargs)

        assert triggers.scan_agenda(db)["created"] == [], motif


def test_un_item_archive_ne_declenche_rien(client_db) -> None:
    """Un item archivé ne demande plus rien."""
    _, Session = client_db
    with Session() as db:
        chapter = _seed(db)
        _arm(db)
        item = _controle(db, chapter)
        item.dismissed_at = datetime.now(timezone.utc)
        db.commit()

        assert triggers.scan_agenda(db)["created"] == []


# --- Idempotence --------------------------------------------------------------------------------


def test_une_echeance_ne_produit_quun_seul_lot(client_db) -> None:
    """Sans cette règle, CHAQUE réveil du scan reproduirait le même chapitre jusqu'à l'échéance.

    ⚠️ Et elle se lit dans `production_runs`, **jamais** en écrivant sur `agenda_items` : le module
    production n'écrit pas dans une table que Massimo co-édite (ADR-0025 §2a).
    """
    _, Session = client_db
    with Session() as db:
        chapter = _seed(db)
        _arm(db)
        item = _controle(db, chapter)

        assert len(triggers.scan_agenda(db)["created"]) == 1
        second = triggers.scan_agenda(db)
        assert second["created"] == []
        assert second["skipped"][0]["reason"] == triggers.SKIP_ALREADY

        total = db.scalar(select(m.ProductionRun.id).where(m.ProductionRun.agenda_item_id == item.id))
        assert total is not None
        assert len(db.scalars(select(m.ProductionRun)).all()) == 1

        # ⚠️ Et l'agenda n'a PAS été touché — aucune colonne de production n'y a été écrite.
        db.refresh(item)
        assert item.dismissed_at is None


# --- Le régulateur de volume --------------------------------------------------------------------


def test_le_regulateur_refuse_au_dela_du_plafond(client_db) -> None:
    """Il REFUSE et il le DIT — même doctrine que `pending_backlog`, jamais de troncature muette."""
    _, Session = client_db
    with Session() as db:
        chapter = _seed(db)
        _arm(db)
        now = datetime.now(timezone.utc)
        for i in range(settings.production_auto_max_runs):
            db.add(
                m.ProductionRun(
                    student_id=db.scalar(select(m.StudentProfile)).id,
                    trigger="agenda",
                    authorized_by="parent_rule",
                    status="done",
                    chapter_id=chapter.id,
                    created_at=now - timedelta(hours=i + 1),
                )
            )
        db.commit()

        _controle(db, chapter)
        report = triggers.scan_agenda(db)
        assert report["created"] == []
        assert "plafond" in report["skipped"][0]["reason"]


def test_les_lots_manuels_ne_comptent_pas_dans_le_plafond(client_db) -> None:
    """⚠️ Le cœur de la décision : quand Papa clique, **le geste EST le régulateur** (ADR-0032 §5).

    Les mélanger ferait qu'une session de rattrapage de Papa désarmerait l'automatisme.
    """
    _, Session = client_db
    with Session() as db:
        chapter = _seed(db)
        _arm(db)
        for _ in range(settings.production_auto_max_runs + 3):
            runs.create_run(db, chapter_id=chapter.id)  # manual/parent_direct

        assert runs.auto_runs_in_window(db) == 0
        _controle(db, chapter)
        assert len(triggers.scan_agenda(db)["created"]) == 1


def test_un_lot_refuse_ne_consomme_pas_la_reference(client_db) -> None:
    """Un refus n'est pas une production : l'item redevient éligible au réveil suivant."""
    _, Session = client_db
    with Session() as db:
        chapter = _seed(db)
        _arm(db)
        now = datetime.now(timezone.utc)
        for i in range(settings.production_auto_max_runs):
            db.add(
                m.ProductionRun(
                    student_id=db.scalar(select(m.StudentProfile)).id,
                    trigger="agenda",
                    authorized_by="parent_rule",
                    status="done",
                    chapter_id=chapter.id,
                    created_at=now - timedelta(hours=i + 1),
                )
            )
        db.commit()
        item = _controle(db, chapter)

        assert triggers.scan_agenda(db)["created"] == []
        # La référence n'est PAS consommée : rien ne pointe cet item.
        assert not runs.run_exists_for(db, trigger="agenda", reference_id=item.id)


# --- La 7ᵉ clé ----------------------------------------------------------------------------------


def test_la_cle_du_declencheur_nest_pas_un_palier(client_db) -> None:
    """⚠️ Verrou de doctrine — deux questions, deux sources (ADR-0035 §5).

    Le palier dit si ZETIS a le droit de **servir** sans relecture ; cette clé dit s'il a le droit
    de **démarrer** sans clic. Si elle entrait dans `AUTONOMY_CLASSES`, `preset_of()` ferait qu'un
    **préréglage armerait le déclencheur** — et « ZETIS sert seul mais attend que je demande »
    deviendrait impossible.
    """
    assert svc.AUTO_TRIGGER_KEY not in svc.BY_KEY
    assert all(svc.AUTO_TRIGGER_KEY not in preset for preset in svc.PRESETS.values())
    # Le préfixe la met hors d'atteinte d'un balayage des six paliers.
    assert not svc.AUTO_TRIGGER_KEY.startswith("zetis_autonomy_")


def test_un_preglage_narme_jamais_le_declencheur(client_db) -> None:
    """Passer en *Autonome* ne met pas ZETIS au travail tout seul — c'est un second geste."""
    client, Session = client_db
    from app.main import app
    from app.modules.auth.deps import get_current_user

    app.dependency_overrides[get_current_user] = lambda: {"username": "papa", "role": "papa"}

    body = client.put(
        "/api/settings/autonomy", json={"values": {svc.A1: svc.SERVE, svc.A0A: svc.SERVE}}
    ).json()
    assert body["preset"] == "autonome"
    assert body["auto_trigger_enabled"] is False, "le préréglage a armé le déclencheur"

    body = client.put("/api/settings/autonomy", json={"auto_trigger_enabled": True}).json()
    assert body["auto_trigger_enabled"] is True
    # …et basculer le déclencheur n'a touché aucun palier.
    assert body["preset"] == "autonome"
