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
        ({"kind": "rendu"}, "`rendu` reste légal et NON ÉMIS"),
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


def test_un_devoir_declenche_comme_un_controle(client_db) -> None:
    """⚠️ **Ce cas testait l'INVERSE jusqu'au 2026-08-03**, et le changement est une décision, pas
    un ajustement.

    L'ADR-0035 §1 excluait `devoir` au motif qu'il « reviendrait tous les jours et noierait le
    régulateur ». **L'objection reste juste** — c'est le `kind` par défaut de la saisie. Le
    commanditaire a tranché l'inverse (addendum), et l'objection est traitée par le TRI
    (`test_un_controle_passe_avant_un_devoir`), pas effacée.
    """
    _, Session = client_db
    with Session() as db:
        chapter = _seed(db)
        _arm(db)
        _controle(db, chapter, kind="devoir")

        report = triggers.scan_agenda(db)
        assert len(report["created"]) == 1, report
        run = db.get(m.ProductionRun, report["created"][0]["run_id"])
        assert run.trigger == "agenda"


def test_un_controle_passe_avant_un_devoir(client_db) -> None:
    """⚠️ LE verrou qui rend la révocation du §1 tenable.

    Le scan crée les lots dans l'ordre et s'arrête quand le plafond refuse. Sans tri par `kind`,
    des devoirs saisis le dimanche mangeraient la semaine et le contrôle du jeudi partirait
    bredouille — c'est exactement ce que l'ADR-0035 §1 redoutait.

    Le devoir est ici **plus proche dans le temps** que le contrôle : si le tri par date primait,
    c'est lui qui passerait.
    """
    _, Session = client_db
    with Session() as db:
        chapter = _seed(db)
        _arm(db)
        devoir = _controle(db, chapter, kind="devoir", days=1)
        controle = _controle(db, chapter, kind="controle", days=6)

        ordre = [i.id for i in triggers.eligible_items(db, student_id=devoir.student_id)]
        assert ordre[0] == controle.id, "le devoir de demain a doublé le contrôle de jeudi"
        assert ordre[1] == devoir.id


def test_une_lecon_a_apprendre_declenche_un_lot(client_db) -> None:
    """`lecon` est déclencheur au même titre que `controle` (addendum ADR-0025 §14.2).

    C'est le type pour lequel produire a le plus de sens : des exercices se font sans ZETIS, une
    leçon s'apprend avec ce qu'il produit.
    """
    _, Session = client_db
    with Session() as db:
        chapter = _seed(db)
        _arm(db)
        lecon = _controle(db, chapter, kind="lecon")

        ordre = [i.id for i in triggers.eligible_items(db, student_id=lecon.student_id)]
        assert ordre == [lecon.id]


def test_ordre_des_trois_kinds_declencheurs(client_db) -> None:
    """⚠️ LE verrou qui attrape l'oubli de `_KIND_PRIORITY`.

    `_KIND_PRIORITY.get(kind, 9)` ne lève rien : un `kind` ajouté à `TRIGGERING_KINDS` mais absent
    de la table de priorité tombe en 9 et passe **systématiquement dernier**, sans qu'aucun autre
    test ne rougisse — le lot part quand même, il part juste toujours en dernier.

    Les dates sont volontairement dans l'ordre INVERSE de la priorité attendue : si le tri par
    date primait, l'ordre servi serait exactement le contraire.
    """
    _, Session = client_db
    with Session() as db:
        chapter = _seed(db)
        _arm(db)
        devoir = _controle(db, chapter, kind="devoir", days=1)
        lecon = _controle(db, chapter, kind="lecon", days=2)
        controle = _controle(db, chapter, kind="controle", days=6)

        ordre = [i.id for i in triggers.eligible_items(db, student_id=devoir.student_id)]
        assert ordre == [controle.id, lecon.id, devoir.id], (
            "l'ordre attendu est contrôle → leçon → devoir, quelles que soient les dates"
        )


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
        # ⚠️ **Chaque lot est terminé avant de lancer le suivant** (2026-08-05). Le test empilait
        # des lots `queued` sur le MÊME chapitre, ce que la garde anti-doublon refuse maintenant —
        # et elle a raison : personne ne peut faire cliquer Papa cinq fois sur un chapitre déjà en
        # file. Ce que le test vérifie ne change pas d'un caractère : `auto_runs_in_window` compte
        # par DÉCLENCHEUR, jamais par statut.
        for _ in range(settings.production_auto_max_runs + 3):
            lot = runs.create_run(db, chapter_id=chapter.id)  # manual/parent_direct
            lot.status = "done"
            db.commit()

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


# --- Le second déclencheur : les demandes de Massimo (ADR-0036 §1) ------------------------------


def _seed_notion(db) -> m.Skill:
    """Une notion prête à produire : chapitre + leçon validée avec cours + rattachement."""
    _, subject, chapter = _seed_year(db)
    lesson = _seed_lesson(db, chapter, title="Fractions", validated=True, course=True)
    skill = m.Skill(subject_id=subject.id, name="Additionner des fractions", level="4e")
    db.add(skill)
    db.flush()
    db.add(m.LessonSkill(lesson_id=lesson.id, skill_id=skill.id))
    db.commit()
    return skill


def _demande(db, skill, *, kind: str = "fiche") -> m.ContentRequest:
    student = db.scalar(select(m.StudentProfile))
    req = m.ContentRequest(
        student_id=student.id, skill_id=skill.id, content_kind=kind, status="pending"
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return req


def _autonome(db) -> None:
    """Régime *Autonome* — la monotonie porte A0a avec A1."""
    svc.write_autonomy(db, {svc.A1: svc.SERVE})


def test_une_demande_ne_declenche_rien_sans_les_DEUX_conditions(client_db) -> None:
    """⚠️ LE verrou du §1. Chaque condition seule laisse la porte fermée.

    Ce n'est **pas** la fusion que l'ADR-0035 §5 a refusée : celle-là aurait rendu le dispositif
    plus PERMISSIF (un préréglage armant le déclencheur). La conjonction est plus RESTRICTIVE —
    elle exige les deux consentements au lieu d'un.

    Hors de ce régime, l'addendum ADR-0027 continue de s'appliquer mot pour mot : la demande reste
    un repère de priorité, la production reste un geste de Papa.
    """
    _, Session = client_db
    with Session() as db:
        skill = _seed_notion(db)
        _demande(db, skill)

        # Ni l'un ni l'autre.
        assert triggers.scan_requests(db)["created"] == []

        # Le déclencheur seul (régime *Semi-autonome* par défaut) : refusé, et le motif est le
        # RÉGIME — la condition de doctrine passe avant celle de mise en marche.
        _arm(db)
        report = triggers.scan_requests(db)
        assert report["created"] == []
        assert report["skipped"][0]["reason"] == triggers.SKIP_NOT_AUTONOMOUS

        # Le régime seul : on passe en *Autonome* ET on désarme — l'inverse exact du cas
        # précédent. ⚠️ Le désarmement est explicite parce que le fixture porte UNE base pour tout
        # le test : sans lui, les deux conditions seraient réunies et le test prouverait le
        # contraire de son nom.
        _autonome(db)
        svc.set_auto_trigger_enabled(db, enabled=False)
        report = triggers.scan_requests(db)
        assert report["created"] == []
        assert report["skipped"][0]["reason"] == triggers.SKIP_DISABLED
        assert db.scalars(select(m.ProductionRun)).all() == []


def test_les_deux_conditions_reunies_declenchent_un_lot_piece(client_db) -> None:
    """`trigger='request'` s'écrit pour la première fois — et il porte un scope de PIÈCE.

    ⚠️ `card` → `srs` : la demande parle la langue de Massimo, le lot celle des tables. Si cette
    traduction manquait, le scope serait refusé par `create_run` et la demande resterait
    éternellement en attente sans que personne sache pourquoi.
    """
    _, Session = client_db
    with Session() as db:
        skill = _seed_notion(db)
        _autonome(db)
        _arm(db)
        req = _demande(db, skill, kind="card")

        report = triggers.scan_requests(db)
        assert len(report["created"]) == 1, report

        run = db.get(m.ProductionRun, report["created"][0]["run_id"])
        assert run.trigger == "request"
        assert run.authorized_by == "parent_rule", "aucun humain n'a cliqué pour ce lot"
        assert run.content_request_id == req.id, "la référence typée n'est pas renseignée"
        assert (run.scope_skill_id, run.scope_kind) == (skill.id, "srs")
        assert run.chapter_id is None, "un lot-pièce ne porte pas de chapitre"


def test_une_demande_de_capsule_ne_produit_aucun_lot(client_db) -> None:
    """⚠️ Constat de code, pas choix de périmètre (ADR-0036 §3, corrigé au read-before-code).

    `create_capsule` exige une **instruction en texte libre** — l'intention pédagogique de Papa —
    qu'une demande `(skill_id, content_kind)` ne porte pas. Le refus est **dit**, et surtout aucun
    lot n'est créé : un lot qui échouerait consommerait la référence et se répéterait.
    """
    _, Session = client_db
    with Session() as db:
        skill = _seed_notion(db)
        _autonome(db)
        _arm(db)
        _demande(db, skill, kind="capsule")

        report = triggers.scan_requests(db)
        assert report["created"] == []
        assert report["skipped"][0]["reason"] == triggers.SKIP_KIND_NOT_PRODUCIBLE
        assert db.scalars(select(m.ProductionRun)).all() == []


def test_une_demande_ne_produit_quun_seul_lot(client_db) -> None:
    """Idempotence, lue dans `production_runs` — jamais écrite sur `content_requests`."""
    _, Session = client_db
    with Session() as db:
        skill = _seed_notion(db)
        _autonome(db)
        _arm(db)
        req = _demande(db, skill)

        assert len(triggers.scan_requests(db)["created"]) == 1
        second = triggers.scan_requests(db)
        assert second["created"] == []
        assert second["skipped"][0]["reason"] == triggers.SKIP_REQUEST_ALREADY
        assert len(db.scalars(select(m.ProductionRun)).all()) == 1

        # La demande n'a pas été touchée par le scan : son statut appartient au §4.
        db.refresh(req)
        assert req.status == "pending"


def _saturer(db, *, trigger: str, count: int, chapter_id=None, skill_id=None) -> None:
    """Remplit un quota avec des lots déjà terminés — le passé que le régulateur relit."""
    now = datetime.now(timezone.utc)
    student_id = db.scalar(select(m.StudentProfile)).id
    for i in range(count):
        db.add(
            m.ProductionRun(
                student_id=student_id,
                trigger=trigger,
                authorized_by="parent_rule",
                status="done",
                chapter_id=chapter_id,
                scope_skill_id=skill_id,
                scope_kind="fiche" if skill_id else None,
                created_at=now - timedelta(hours=i + 1),
            )
        )
    db.commit()


# ⚠️ **Deux tests et non un seul, et ce n'est pas de la cosmétique.** La première rédaction tenait
# les deux sens dans un test à deux blocs `with Session()` — mais le fixture porte UNE base pour
# tout le test : les lots du premier bloc comptaient encore dans le second, et l'assertion
# tombait. Un test qui doit être lu deux fois pour savoir ce qu'il mesure ne mesure rien.


def test_un_plafond_dechanceance_sature_laisse_passer_une_demande(client_db) -> None:
    """⚠️ LE verrou du §5, premier sens. Le régulateur compte des **lots**, pas du **coût**.

    Un lot-pièce (~30 s) et un lot-chapitre (~36 min) y pèsent identiquement. Sous un plafond
    commun, deux échéances préparées fermeraient la porte à la moindre fiche demandée.
    """
    _, Session = client_db
    with Session() as db:
        skill = _seed_notion(db)
        _autonome(db)
        _arm(db)
        _saturer(
            db,
            trigger="agenda",
            count=settings.production_auto_max_runs,
            chapter_id=db.scalar(select(m.Chapter.id)),
        )

        _demande(db, skill)
        assert len(triggers.scan_requests(db)["created"]) == 1
        assert runs.request_runs_in_window(db) == 1


def test_un_plafond_de_demandes_sature_laisse_passer_une_echeance(client_db) -> None:
    """⚠️ LE verrou du §5, second sens — celui qui protège le contrôle du jeudi.

    Sans compteur distinct, **un soir d'ennui de Massimo priverait son contrôle de préparation**.
    C'est la moitié du défaut que le premier test ne voit pas.
    """
    _, Session = client_db
    with Session() as db:
        skill = _seed_notion(db)
        chapter = db.get(m.Chapter, db.scalar(select(m.Chapter.id)))
        _autonome(db)
        _arm(db)
        _saturer(
            db,
            trigger="request",
            count=settings.production_request_max_runs,
            skill_id=skill.id,
        )

        assert runs.auto_runs_in_window(db) == 0, "les lots de demande comptent dans le quota auto"
        _controle(db, chapter)
        assert len(triggers.scan_agenda(db)["created"]) == 1


def test_le_plafond_des_demandes_refuse_et_le_dit(client_db) -> None:
    """Il REFUSE et il le DIT — et un refus ne consomme pas la référence."""
    _, Session = client_db
    with Session() as db:
        skill = _seed_notion(db)
        _autonome(db)
        _arm(db)
        _saturer(
            db,
            trigger="request",
            count=settings.production_request_max_runs,
            skill_id=skill.id,
        )
        req = _demande(db, skill, kind="mindmap")

        report = triggers.scan_requests(db)
        assert report["created"] == []
        assert "plafond" in report["skipped"][0]["reason"]
        assert not runs.run_exists_for(db, trigger="request", reference_id=req.id)


# --- La 7ᵉ clé ----------------------------------------------------------------------------------


def test_la_cle_du_declencheur_nest_pas_un_palier(client_db) -> None:
    """⚠️ Verrou de doctrine — deux questions, deux sources (ADR-0035 §5).

    Le palier dit si ZETIS a le droit de **servir** sans relecture ; cette clé dit s'il a le droit
    de **démarrer** sans clic. Si elle entrait dans `AUTONOMY_CLASSES`, `niveau_de()` ferait qu'un
    **préréglage armerait le déclencheur** — et « ZETIS sert seul mais attend que je demande »
    deviendrait impossible.
    """
    assert svc.AUTO_TRIGGER_KEY not in svc.BY_KEY
    assert all(svc.AUTO_TRIGGER_KEY not in paliers for paliers in svc.NIVEAUX.values())
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
    assert body["niveau"] == "autonome"
    assert body["auto_trigger_enabled"] is False, "le préréglage a armé le déclencheur"

    body = client.put("/api/settings/autonomy", json={"auto_trigger_enabled": True}).json()
    assert body["auto_trigger_enabled"] is True
    # …et basculer le déclencheur n'a touché aucun palier.
    assert body["niveau"] == "autonome"


# --- Le réveil périodique ne se duplique pas (correctif du 2026-08-03) --------------------------


class _JobFactice:
    def __init__(self, func_name: str) -> None:
        self.func_name = func_name


class _FileFactice:
    """Une file RQ réduite à ce que `scan_already_planned` lui demande."""

    def __init__(self, en_file: list, planifies: list) -> None:
        self.jobs = en_file
        self._planifies = {f"id-{i}": j for i, j in enumerate(planifies)}

    def fetch_job(self, job_id):
        return self._planifies.get(job_id)


def _registre_factice(ids):
    class _Registre:
        def __init__(self, queue=None) -> None:
            self._ids = ids

        def get_job_ids(self):
            return self._ids

    return _Registre


def test_un_reveil_deja_prevu_nest_pas_amorce_une_seconde_fois(monkeypatch) -> None:
    """⚠️ Verrou d'un défaut CONSTATÉ EN VRAI le 2026-08-03, pas imaginé.

    `production_worker.py` amorce le scan au démarrage ET `scan_triggers` se replanifie en
    `finally`. Les deux sont justes séparément — l'un remplit une file vide, l'autre survit à un
    scan qui échoue. **Ensemble, chaque redémarrage ajoutait une récurrence permanente** : quatre
    réveils planifiés après quatre démarrages dans la journée. Bénin en dev ; en production, un
    worker redémarre à chaque déploiement.

    Les deux registres comptent : un réveil est **en file** quand son heure est venue, **planifié**
    le reste du temps. N'en lire qu'un rouvrirait le défaut une fois sur deux.
    """
    import rq.registry

    from app.modules.production import jobs

    scan = _JobFactice(jobs.SCAN_JOB_NAME)
    autre = _JobFactice("app.modules.production.jobs.run_production")

    cas = [
        ([], [], False, "aucun réveil : il FAUT amorcer, sinon la file reste vide pour toujours"),
        ([scan], [], True, "un réveil est en file"),
        ([], [scan], True, "un réveil est planifié"),
        ([autre], [autre], False, "un lot de production n'est pas un réveil"),
    ]
    for en_file, planifies, attendu, motif in cas:
        monkeypatch.setattr(
            rq.registry,
            "ScheduledJobRegistry",
            _registre_factice([f"id-{i}" for i in range(len(planifies))]),
        )
        file = _FileFactice(en_file, planifies)
        assert jobs.scan_already_planned(file) is attendu, motif
