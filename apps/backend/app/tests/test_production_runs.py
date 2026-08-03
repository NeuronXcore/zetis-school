"""Journal de production — vocabulaire modélisé vs vocabulaire ÉMIS (ADR-0031 §4).

« Le modèle anticipe, le code n'anticipe pas. » `production_runs` naît avec toutes ses colonnes et
tout son vocabulaire ; la v1 n'en écrit qu'une valeur de chaque. Ces verrous tiennent l'écart —
sans eux, un déclencheur arriverait en production sans que son ADR existe.
"""

from datetime import datetime, timezone
from pathlib import Path

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

import app.db.models as m
from app.db.models.production import (
    AUTHORIZED_BY,
    EMITTED_AUTHORIZED_BY,
    EMITTED_TRIGGERS,
    TRIGGER_REFERENCE,
    TRIGGERS,
)


def _run(db, **kw) -> m.ProductionRun:
    """Un lot minimal. **Un scope par défaut depuis l'ADR-0036 §2**, et ce n'est pas cosmétique :
    sans lui, `ck_production_runs_exactly_one_scope` lèverait sur CHAQUE insertion — et le test
    voisin, qui attend une `IntegrityError` de la contrainte des RÉFÉRENCES, passerait au vert en
    ayant vérifié une tout autre règle."""
    student = db.scalar(select(m.StudentProfile.id))
    scoped = "chapter_id" in kw or "scope_skill_id" in kw
    row = m.ProductionRun(
        student_id=student,
        trigger=kw.pop("trigger", "manual"),
        authorized_by=kw.pop("authorized_by", "parent_direct"),
        created_at=datetime.now(timezone.utc),
        **({} if scoped else {"chapter_id": _chapter_id(db)}),
        **kw,
    )
    db.add(row)
    db.commit()
    return row


def _chapter_id(db) -> int:
    """Un chapitre, créé au besoin — le conftest n'en sème aucun."""
    existing = db.scalar(select(m.Chapter.id))
    if existing is not None:
        return existing
    subject_id = db.scalar(select(m.Subject.id))
    theme = m.Theme(subject_id=subject_id, name="Thème")
    db.add(theme)
    db.flush()
    chapter = m.Chapter(theme_id=theme.id, name="Chapitre")
    db.add(chapter)
    db.commit()
    return chapter.id


# --- Le verrou : ce que la v1 a le droit d'écrire ----------------------------------------------


def test_aucun_chemin_nemet_une_valeur_non_decidee() -> None:
    """Patron du verrou `system` (§F), inversé : on cherche les ÉCRITURES, pas les mentions.

    ⚠️ **L'assertion n'a PAS changé le 2026-08-03 — elle n'avait pas à changer.** Elle dérive les
    interdits d'`EMITTED_TRIGGERS` / `EMITTED_AUTHORIZED_BY` : ouvrir `agenda` et `parent_rule`
    (ADR-0035) a **automatiquement** rétréci la liste sans toucher une ligne de test. C'est ce
    qu'on attend d'un verrou bien posé.

    Ce qui a changé : **le nom et le motif**. L'ancienne version disait « autre chose que
    `manual` » et justifiait ainsi : *« un déclencheur d'agenda produirait du contenu — décision de
    l'ADR-0032, qui n'existe pas »*. **Cette décision existe depuis l'ADR-0035.** Garder le texte
    aurait fait lire un verrou de doctrine comme un verrou de phase.

    Ce qu'il protège **aujourd'hui** : `request`, `evidence`, `derived`, `council` — modélisés,
    non décidés. Le modèle anticipe, le code n'anticipe pas.
    """
    interdits = [t for t in TRIGGERS if t not in EMITTED_TRIGGERS]
    interdits += [a for a in AUTHORIZED_BY if a not in EMITTED_AUTHORIZED_BY]

    root = Path(__file__).resolve().parents[1] / "modules"
    offenders = []
    for path in sorted(root.rglob("*.py")):
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            code = line.split("#", 1)[0]
            if "trigger=" not in code and "authorized_by=" not in code:
                continue
            if any(f'"{v}"' in code or f"'{v}'" in code for v in interdits):
                offenders.append(f"{path.relative_to(root)}:{number}")
    assert offenders == [], f"valeur non décidée émise : {offenders}"


def test_chaque_declencheur_sait_quelle_reference_il_exige() -> None:
    """`TRIGGER_REFERENCE` couvre TOUT le vocabulaire — sinon un déclencheur neuf arriverait sans
    qu'on ait dit ce qu'il référence, et la contrainte « exactement une FK » serait invérifiable."""
    assert set(TRIGGER_REFERENCE) == set(TRIGGERS)
    assert TRIGGER_REFERENCE["manual"] is None, "un geste de Papa ne référence que lui-même"


# --- La contrainte de cohérence, tenue par la base ---------------------------------------------


def test_un_run_manuel_ne_porte_aucune_reference_de_declencheur(client_db) -> None:
    """Garde-fou au plus près de la donnée : `manual` avec une FK de déclencheur est incohérent —
    Papa a cliqué, il ne « vient » d'aucun agenda ni d'aucune demande."""
    _, Session = client_db
    with Session() as db:
        skill_id = db.scalar(select(m.Skill.id))
        with pytest.raises(IntegrityError):
            _run(db, trigger="manual", skill_id=skill_id)


def test_un_run_manuel_porte_son_scope(client_db) -> None:
    """⚠️ `chapter_id` ne figure pas au schéma de l'ADR-0031 §4, dont toutes les colonnes disent
    POURQUOI on produit et aucune SUR QUOI. Sans lui, un run n'aurait rien porté de son propre
    périmètre : rien à réafficher, rien à rejouer."""
    _, Session = client_db
    with Session() as db:
        run = _run(db, trigger="manual")
        assert run.status == "queued"
        assert run.finished_at is None
        assert "chapter_id" in m.ProductionRun.__table__.columns


def test_un_lot_porte_exactement_un_scope(client_db) -> None:
    """La base refuse l'entre-deux (ADR-0036 §2) — aucun scope, ou les deux.

    ⚠️ Tenu **en SQL**, contrairement à la règle des références (confiée au service et à son
    verrou). L'écart est délibéré : celle-ci ne dépend d'aucun vocabulaire ouvert, donc l'exprimer
    en base ne la rend ni illisible ni fragile au prochain déclencheur — et un lot sans scope
    produirait dans le vide quel que soit le chemin d'écriture qui l'a créé.
    """
    _, Session = client_db
    with Session() as db:
        chapter_id = _chapter_id(db)
        skill_id = db.scalar(select(m.Skill.id))

        with pytest.raises(IntegrityError):  # aucun scope
            _run(db, chapter_id=None)
    with Session() as db:
        with pytest.raises(IntegrityError):  # les deux à la fois
            _run(db, chapter_id=chapter_id, scope_skill_id=skill_id, scope_kind="fiche")
    with Session() as db:
        with pytest.raises(IntegrityError):  # une notion sans type
            _run(db, chapter_id=None, scope_skill_id=skill_id)
    with Session() as db:
        run = _run(db, chapter_id=None, scope_skill_id=skill_id, scope_kind="fiche")
        assert run.chapter_id is None and run.scope_kind == "fiche"


# --- Aucune rétro-attribution -------------------------------------------------------------------


def test_le_contenu_existant_reste_hors_lot(client_db) -> None:
    """`production_run_id` naît `NULL` partout — doctrine §F.4. Prétendre reconstituer les lots
    passés fabriquerait une histoire."""
    _, Session = client_db
    with Session() as db:
        for model in (m.Lesson, m.Fiche, m.Mindmap, m.Quiz, m.SpacedReviewCard):
            column = model.__table__.columns["production_run_id"]
            assert column.nullable, f"{model.__name__}.production_run_id doit être nullable"
            assert column.default is None and column.server_default is None
