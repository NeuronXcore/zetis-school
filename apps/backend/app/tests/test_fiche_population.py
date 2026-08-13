"""Verrous des deux prédicats de population des fiches (addendum ADR-0015 §2).

Ces tests existent pour une raison datée. Le cadrage annonçait **trois** lecteurs du gate
`validated`, tous dans le module `fiches` ; le read-before-code du 2026-08-13 en a trouvé
**huit**, dont quatre **hors** du module et **sans aucun filtre de statut** — `equipment`,
les deux requêtes de `coverage`, la cascade de `veto`. Sur ces quatre-là, la « sécurité par
construction » de `validation_status='personal'` ne joue pas : elle ne protège que les lecteurs
qui filtrent DÉJÀ sur `validated`.

Chacun des huit a donc son verrou ici : **sa fiche lui est visible, et elle n'existe pour personne
d'autre.**

⚠️ Chaque verrou a été saboté avant d'être gardé (prédicat retiré → le test rougit). Un test qui
reste vert quand on casse ce qu'il surveille ne prouve rien — c'est arrivé trois fois dans ce
dépôt.
"""

from datetime import datetime, timezone

import pytest
from sqlalchemy import select

from app.db.models import Fiche, ProductionRun, SchoolYear, Skill, Subject
from app.modules.eli5.service import get_default_student
from app.modules.fiches import service
from app.modules.fiches.population import (
    AUTHOR_MASSIMO,
    STATUS_PERSONAL,
    readable_by_student,
)
from app.modules.production import equipment, veto
from app.modules.production.coverage import actionable_gaps, coverage
from app.prompts import fiche as fiche_prompt
from app.tests.test_fiche_service import _seed_validated_lesson

_SPEC = fiche_prompt.FEW_SHOTS[0]


def _fiche_de_massimo(db, lesson_id: int, student_id: int) -> Fiche:
    """Ce que produira `finish` en slice 2 : un `FicheSpec` valide, hors cycle éditorial."""
    row = Fiche(
        lesson_id=lesson_id,
        spec_json=_SPEC,
        validation_status=STATUS_PERSONAL,
        author=AUTHOR_MASSIMO,
        student_id=student_id,
        source="manual",
        version=1,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _fiche_zetis(db, lesson_id: int, *, status: str) -> Fiche:
    row = Fiche(lesson_id=lesson_id, spec_json=_SPEC, validation_status=status)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


# ── Le flux élève : les QUATRE lecteurs, pas trois ──────────────────────────────


def test_sa_fiche_lui_est_visible_par_les_quatre_lecteurs(client_db) -> None:
    """Le 4ᵉ (`mark_seen`) manquait au cadrage : sans lui, `POST /seen` renvoie 404 sur sa
    propre fiche et le badge « nouveau » ne part jamais."""
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db)
        student = get_default_student(db)
        sienne = _fiche_de_massimo(db, lesson.id, student.id)

        # 1. le deck de la matière
        deck = service.list_subject_fiches(db, "mathematiques")
        assert [f["id"] for f in deck] == [sienne.id]

        # 2. le compteur de la grille — un deck où il n'a que ses fiches n'est pas « bientôt »
        maths = next(
            s for s in service.fiches_summary(db)["subjects"] if s["slug"] == "mathematiques"
        )
        assert maths["fiche_count"] == 1

        # 3. la lecture unitaire
        assert service.get_student_fiche(db, sienne.id)["id"] == sienne.id

        # 4. le marquage « vue » — 404 avant le correctif
        service.mark_seen(db, student.id, sienne.id)
        db.commit()
        assert service.get_student_fiche(db, sienne.id)["seen"] is True


@pytest.mark.parametrize("status", ["pending", "rejected"])
def test_une_fiche_zetis_non_validee_ne_fuit_toujours_pas(client_db, status: str) -> None:
    """Non-régression du gate lui-même : ouvrir la table à un second auteur ne l'a pas relâché."""
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db)
        muette = _fiche_zetis(db, lesson.id, status=status)

        assert service.list_subject_fiches(db, "mathematiques") == []
        with pytest.raises(Exception) as err:
            service.get_student_fiche(db, muette.id)
        assert getattr(err.value, "status_code", None) == 404


def test_le_predicat_est_nominatif_pas_ouvert_a_tout_massimo(client_db) -> None:
    """La règle porte sur `student_id`, pas sur « toute fiche `massimo` » — le jour du
    multi-enfant est déjà tenu par le prédicat, il n'aura pas à être réécrit.

    Testé sur le prédicat lui-même plutôt qu'à travers une route : les routes résolvent l'élève
    par `get_default_student` (MVP mono-enfant), donc elles ne peuvent pas exprimer « un autre »
    aujourd'hui — ce serait un test qui ne mesure pas ce qu'il annonce.
    """
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db)
        student = get_default_student(db)
        sienne = _fiche_de_massimo(db, lesson.id, student.id)

        def _lisible_par(sid: int) -> Fiche | None:
            return db.scalar(
                select(Fiche).where(Fiche.id == sienne.id, readable_by_student(sid))
            )

        assert _lisible_par(student.id) is not None
        assert _lisible_par(student.id + 1) is None


# ── La production : les QUATRE requêtes que le cadrage n'avait pas regardées ────


def test_sa_fiche_n_est_pas_prise_pour_la_fiche_zetis_de_la_lecon(client_db) -> None:
    """🔴 Le défaut le plus grave des quatre. Sans le prédicat, `_existing_fiche` rend SA fiche
    (« la dernière par id ») : ZETIS croit la sienne déjà faite et ne la produit plus, et
    l'appelant validerait la fiche personnelle en `parent_bulk`."""
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db)
        student = get_default_student(db)
        _fiche_de_massimo(db, lesson.id, student.id)

        assert equipment._existing_fiche(db, lesson.id) is None

        zetis = _fiche_zetis(db, lesson.id, status="pending")
        # Même créée APRÈS la sienne (donc `id` plus grand chez elle si on ne filtrait pas),
        # c'est bien la fiche ZETIS qui est rendue.
        assert equipment._existing_fiche(db, lesson.id).id == zetis.id


def test_sa_fiche_ne_fait_pas_disparaitre_la_lecon_du_reste_a_produire(client_db) -> None:
    """Sans le prédicat, la leçon compte comme couverte et ZETIS n'écrit jamais sa propre fiche."""
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db)
        student = get_default_student(db)
        year_id = db.scalar(select(SchoolYear.id).where(SchoolYear.status == "active"))

        assert actionable_gaps(db, year_id)["fiche"] == 1
        _fiche_de_massimo(db, lesson.id, student.id)
        assert actionable_gaps(db, year_id)["fiche"] == 1  # inchangé : ce n'est pas SA fiche

        _fiche_zetis(db, lesson.id, status="pending")
        assert actionable_gaps(db, year_id)["fiche"] == 0  # là, oui


def _cellule_fiche(matrice: dict, lesson_id: int) -> dict:
    for subject in matrice["subjects"]:
        for chapter in subject["chapters"]:
            for lesson in chapter["lessons"]:
                if lesson["id"] == lesson_id:
                    return lesson["cells"]["fiche"]
    raise AssertionError("leçon absente de la matrice de couverture")


def test_la_matrice_de_papa_ne_prend_pas_sa_fiche_pour_une_fiche_zetis(client_db) -> None:
    """Le filtre d'auteur est dans la clause ON de l'`outerjoin`, et les `MAX()` groupés sont sur
    des CHAÎNES : `pending` < `personal` < `rejected` < `validated`. Sans le filtre, une leçon
    portant une fiche ZETIS `pending` **et** la fiche de Massimo remonterait `personal` — un
    statut qui n'est celui d'aucune fiche ZETIS.
    """
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db)
        student = get_default_student(db)
        subject = db.scalar(select(Subject).where(Subject.slug == "mathematiques"))

        _fiche_de_massimo(db, lesson.id, student.id)
        cellule = _cellule_fiche(coverage(db, subject.id), lesson.id)
        assert cellule["state"] == "absent"  # sa fiche ne couvre rien
        assert cellule["object_id"] is None  # et n'est la cible d'aucun « Régénérer »

        zetis = _fiche_zetis(db, lesson.id, status="pending")
        cellule = _cellule_fiche(coverage(db, subject.id), lesson.id)
        assert cellule["state"] == "pending"  # et surtout PAS un état dérivé de `personal`
        assert cellule["object_id"] == zetis.id


def test_papa_ne_peut_pas_retirer_un_cours_dont_massimo_a_fait_sa_fiche(client_db) -> None:
    """La cascade de `veto` contourne `_get_or_404` (qui protège déjà la fiche personnelle, faute
    de `production_run_id`) en appelant `_delete_one` en direct. Le retrait doit donc être refusé
    en AMONT — Papa ne supprime pas le travail de son fils par un geste qui visait un cours."""
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db)
        student = get_default_student(db)
        run = ProductionRun(
            student_id=student.id,
            trigger="manual",
            authorized_by="parent_direct",
            status="queued",
            scope_skill_id=db.scalar(select(Skill)).id,
            scope_kind="fiche",
            created_at=datetime.now(timezone.utc),
        )
        db.add(run)
        db.flush()
        lesson.production_run_id = run.id
        db.commit()

        # Sans sa fiche, le cours est retirable.
        assert veto.preview_removal(db, kind="cours", piece_id=lesson.id)["removable"] is True

        sienne = _fiche_de_massimo(db, lesson.id, student.id)
        verdict = veto.preview_removal(db, kind="cours", piece_id=lesson.id)
        assert verdict["removable"] is False
        assert "sa propre fiche" in verdict["reason"]

        # Et elle reste bien listée dans la cascade : la FK `fiches.lesson_id` est NOT NULL,
        # l'oublier ferait échouer la suppression en base le jour où le retrait est permis.
        assert sienne.id in veto._derivatives_of_lesson(db, lesson.id)["fiche"]
