"""Test-verrous de l'ADR-0030 §Suivi — la frontière entre NOUVEAUTÉ et ARRIÉRÉ.

Ce fichier n'est pas un test de régression ordinaire. Il encode la seule règle qui rend les
badges livrables :

> Un badge de navigation compte ce qui est **NOUVEAU** (naît d'un geste, meurt d'un **regard**),
> jamais ce qui est **DÛ** (naît d'une date franchie, ne meurt que du **travail**, et **grossit
> quand Massimo ne vient pas**).

La seconde colonne est la définition d'une relance. L'ADR nomme explicitement, dans ses coûts, la
« pression durable » pour brancher ces badges sur les files — parce que c'est la version utile, et
que c'est la version interdite. Ces tests sont ce qui résiste à cette pression quand plus personne
ne se souvient du raisonnement.

Un échec ici ne se répare pas en ajustant l'assertion.
"""

import inspect
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import select

import app.db.models as m
from app.modules.news.schemas import NewsSummary
from app.modules.news.service import NEWS_SOURCES

SUMMARY = "/api/student/news/summary"

#: Vocabulaire de l'ARRIÉRÉ. Aucune source de témoin n'a le droit de le lire.
#:
#: `dismissed_at` n'y figure PAS, et c'est un arbitrage, pas un oubli : masquer un item est un
#: geste de Massimo sur sa propre page (il meurt d'une action de l'enfant, pas d'une date), donc
#: `new_agenda_count` a le droit de le filtrer. Le cacher dans un helper `_visible_items()` pour
#: satisfaire un grep rendrait ce verrou décoratif — mieux vaut l'exception écrite.
FORBIDDEN_TOKENS = (
    "due_count",
    "due_at",
    "due_on",
    "due_date",
    "done_at",
    "overdue",
    "late",
    # 🔴 AJOUTÉS le 2026-08-08, et le moment n'est pas un hasard : on perce ce jour-là une
    # exception dans la doctrine (`diagnostic`), et c'est précisément quand on ouvre un trou qu'il
    # faut resserrer le reste. Ces deux jetons manquaient — un compteur pouvait donc compter du
    # NON-FAIT (« ce qui n'a pas de passation ») sans qu'aucun verrou ne le voie.
    "completed_at",
    "taken_at",
)

#: Les compteurs autorisés à lire les jetons ci-dessus, avec la décision qui les y autorise.
#:
#: ⚠️ **Une entrée ici est une DÉROGATION, pas une configuration.** N'en ajouter une qu'avec un
#: ADR qui la nomme — sinon ce dictionnaire devient la porte de sortie du verrou qu'il borne.
DEROGATIONS = {
    "diagnostic": "adr-0030-addendum-temoin-diagnostic.md",
}


def _body_without_docstring(fn) -> str:
    """Source d'une fonction, docstring RETIRÉE.

    Les docstrings de ces compteurs *doivent* nommer les interdits — c'est là qu'on explique
    pourquoi `new_cards_count` ne lit pas d'échéance. Les scanner ferait échouer le verrou sur
    sa propre documentation.
    """
    source = inspect.getsource(fn)
    doc = inspect.getdoc(fn)
    if not doc:
        return source
    # La docstring est le premier littéral du corps : on coupe à sa fermeture.
    closing = source.find('"""', source.find('"""') + 3)
    return source[closing + 3 :] if closing != -1 else source


# --- Verrou n°1 : aucune source ne consomme une échéance -------------------------------------


def test_no_news_source_reads_a_deadline() -> None:
    """Le test lit le SOURCE des cinq compteurs, pas leur sortie.

    C'est le point : la sortie est un entier, elle ne peut pas trahir d'où elle vient. Un badge
    branché sur `due_count` rendrait exactement le même type de réponse qu'un badge conforme.
    """
    for key, source_fn in NEWS_SOURCES.items():
        if key in DEROGATIONS:
            continue
        body = _body_without_docstring(source_fn)
        for token in FORBIDDEN_TOKENS:
            assert token not in body, (
                f"Le compteur « {key} » lit « {token} » : c'est un compteur d'ARRIÉRÉ, "
                f"pas un témoin de nouveauté (ADR-0030 §1)."
            )


def test_toute_derogation_est_adossee_a_un_ADR_qui_la_nomme() -> None:
    """Une dérogation sans document est un contournement qui se donne l'air d'une règle.

    Ce test ne juge pas le bien-fondé de l'exception — il exige qu'elle soit ÉCRITE quelque part
    où on la retrouvera. Le fichier nommé doit exister ; sinon la dérogation survit à sa propre
    justification, ce qui est la façon dont une doctrine se vide.
    """
    # `app/tests/x.py` → parents : tests, app, backend, apps, RACINE.
    racine = Path(__file__).resolve().parents[4] / "docs" / "decisions"
    for key, document in DEROGATIONS.items():
        assert key in NEWS_SOURCES, f"Dérogation « {key} » accordée à un compteur inexistant."
        assert (racine / document).is_file(), (
            f"La dérogation de « {key} » cite « {document} », qui n'existe pas."
        )


def test_UNE_SEULE_exception_meurt_du_travail_et_les_autres_meurent_d_un_REGARD() -> None:
    """🔴 LE VERROU D'EXCEPTION — il enregistre le trou pour empêcher qu'il s'élargisse.

    Le 2026-08-08, `diagnostic` est entré dans les témoins alors qu'il **meurt du TRAVAIL** :
    il compte les diagnostics relus que Massimo n'a pas passés, donc il grossit quand Massimo ne
    vient pas. C'est la colonne interdite de l'`adr-0030 §1`, ouverte par décision du
    commanditaire après objection et réaffirmation.

    ⚠️ **Ce qu'il faut comprendre, et qui a failli passer inaperçu** : ce compteur traversait les
    CINQ verrous de ce fichier sans en faire rougir un seul. Ils interrogent le **temps** — « une
    échéance change-t-elle ce nombre ? » — et aucune date n'entre dans son calcul. La règle a deux
    dimensions ; le fichier n'en verrouillait qu'une. Sans ce test, la prochaine session lirait
    sept témoins tous conformes et en conclurait qu'un compteur de non-faits est recevable.

    Il n'y en a qu'un, et il est nommé.
    """
    assert set(DEROGATIONS) == {"diagnostic"}, (
        "Une seconde exception a été ajoutée à la doctrine des témoins. Ce n'est pas un réglage : "
        "il faut un ADR qui la nomme, et une bonne raison de ne pas plutôt retirer la première."
    )


def test_every_served_field_has_a_declared_source() -> None:
    """Le schéma et le registre ne peuvent pas diverger : un champ servi sans source déclarée
    échapperait au verrou n°1."""
    assert set(NewsSummary.model_fields) == set(NEWS_SOURCES)


# --- Verrou n°2 : le temps qui passe ne fait grossir aucun badge ------------------------------


def _seed_world(Session, *, offset_days: int) -> None:
    """Sème les mêmes objets dans deux mondes ne différant QUE par leurs champs datés.

    Reculer une échéance de 30 jours est observationnellement identique à avancer l'horloge de
    30 jours. Si un compteur diverge entre les deux mondes, c'est exactement qu'il grossit par
    écoulement du temps.
    """
    now = datetime.now(timezone.utc)
    today = now.date()
    with Session() as db:
        student = db.scalar(select(m.StudentProfile).order_by(m.StudentProfile.id))
        subject = db.scalar(select(m.Subject).order_by(m.Subject.id))
        skill = db.scalar(select(m.Skill).order_by(m.Skill.id))

        db.add(
            m.SpacedReviewCard(
                student_id=student.id,
                skill_id=skill.id,
                front_markdown="Q",
                back_markdown="R",
                interval_days=1,
                due_at=now + timedelta(days=offset_days),
                status="scheduled",
            )
        )
        db.add(
            m.AgendaItem(
                student_id=student.id,
                label="DM de maths",
                kind="devoir",
                due_on=today + timedelta(days=offset_days),
                created_by="parent",
            )
        )
        db.add(
            m.Mission(
                student_id=student.id,
                subject_id=subject.id,
                skill_id=skill.id,
                title="Renforcer",
                mission_type="remediation",
                status="planned",
                validation_status="validated",
                due_date=today + timedelta(days=offset_days),
                priority=1,
                created_by="ai",
            )
        )
        db.commit()


def test_a_passing_deadline_changes_no_witness(client_db) -> None:
    """Monde « échéances dépassées » et monde « échéances à venir » donnent les MÊMES compteurs.

    C'est le test qui a fait remonter la vraie violation du lot : `reviews/summary.new_count`
    exigeait `due_at <= now` alors que les cartes naissent avec une échéance FUTURE — une carte
    fraîchement générée y entrait donc plusieurs jours plus tard, sans aucun geste. Avec cette
    expression-là, ce test rendrait 1 contre 0.
    """
    client, Session = client_db
    _seed_world(Session, offset_days=-30)
    past = client.get(SUMMARY).json()

    with Session() as db:
        for model in (m.SpacedReviewCard, m.AgendaItem, m.Mission):
            for row in db.scalars(select(model)):
                db.delete(row)
        db.commit()

    _seed_world(Session, offset_days=+30)
    future = client.get(SUMMARY).json()

    assert past == future, (
        "Un compteur dépend d'une échéance : il grossira quand Massimo ne viendra pas "
        "(ADR-0030 §1)."
    )


def test_moving_the_clock_forward_grows_nothing(client_db, monkeypatch) -> None:
    """« Si Massimo ne vient pas pendant 3 jours : inchangé » (§1, ligne 3 du tableau).

    Lecture littérale de la règle, faisable parce que les modules concernés isolent leur horloge
    dans un `_now()`. Limite écrite plutôt que masquée : le watermark de l'agenda passe par
    `func.now()` (horloge SQL), que ce monkeypatch n'atteint pas — c'est
    `test_a_passing_deadline_changes_no_witness` qui couvre l'agenda.
    """
    from app.modules.agenda import service as agenda_service
    from app.modules.fiches import service as fiches_service
    from app.modules.memory import service as memory_service

    client, Session = client_db
    _seed_world(Session, offset_days=+3)
    before = client.get(SUMMARY).json()

    far_future = datetime.now(timezone.utc) + timedelta(days=30)
    for module in (memory_service, agenda_service, fiches_service):
        monkeypatch.setattr(module, "_now", lambda: far_future)

    assert client.get(SUMMARY).json() == before


def test_witnesses_only_ever_decrease_under_consultation(client_db) -> None:
    """Sous les seuls gestes de REGARD, aucun compteur ne monte — et au moins un descend.

    Formulation directe du second test-verrou de l'ADR §Suivi.
    """
    client, Session = client_db
    now = datetime.now(timezone.utc)
    with Session() as db:
        student = db.scalar(select(m.StudentProfile).order_by(m.StudentProfile.id))
        skill = db.scalar(select(m.Skill).order_by(m.Skill.id))
        db.add(
            m.SpacedReviewCard(
                student_id=student.id,
                skill_id=skill.id,
                front_markdown="Q",
                back_markdown="R",
                interval_days=1,
                due_at=now - timedelta(days=1),
                status="scheduled",
            )
        )
        db.add(
            m.AgendaItem(
                student_id=student.id,
                label="Contrôle",
                kind="controle",
                due_on=now.date() + timedelta(days=2),
                created_by="parent",
            )
        )
        db.commit()

    before = client.get(SUMMARY).json()
    assert before["agenda"] > 0 and before["revision"] > 0

    assert client.post("/api/student/agenda/seen").status_code == 204
    after = client.get(SUMMARY).json()

    for key in before:
        assert after[key] <= before[key], f"Le témoin « {key} » a monté sous un simple regard."
    assert after["agenda"] == 0
