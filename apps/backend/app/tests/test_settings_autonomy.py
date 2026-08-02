"""Paliers d'autonomie de ZETIS (ADR-0032) — les verrous du §Suivi.

Le test qui compte le plus n'est pas dans ce fichier par hasard : **aucune auto-validation n'écrit
`parent`**. C'est le verrou qui manquait le jour où le défaut est né (2026-08-02) — `equip_notion`
auto-validait le cours par `set_lesson_validation`, qui tamponnait « relu pièce à pièce par Papa »
sur un cours que personne n'avait ouvert. Le verrou §F.3 existant ne pouvait pas le voir : il ne
teste que la NON-NULLITÉ de la provenance.
"""

import pytest
from sqlalchemy import select

import app.db.models as m
from app.main import app
from app.modules.auth.deps import get_current_user
from app.modules.settings import service as svc
from app.tests.fakes import FakeEmbeddingProvider, FakeLLMProvider
from app.tests.test_production_coverage import _seed_lesson, _seed_year

PAPA = {"username": "papa", "role": "papa"}
CHILD = {"username": "massimo", "role": "child"}
API = "/api/settings/autonomy"


def _as(role: dict) -> None:
    app.dependency_overrides[get_current_user] = lambda: role


@pytest.fixture(autouse=True)
def _papa(client_db) -> None:
    """⚠️ Dépend de `client_db` À DESSEIN : sans ça, l'autouse s'exécute AVANT lui, et le
    fixture de base réécrit l'override avec le rôle `child` — toutes les routes Papa en 403."""
    _as(PAPA)


def _values(payload: dict) -> dict[str, int]:
    return {c["key"]: c["value"] for c in payload["classes"]}


# --- Lecture ------------------------------------------------------------------------------------


def test_les_defauts_decrivent_le_regime_reel_daujourdhui(client_db) -> None:
    """Aucune ligne en base → les six défauts, et ils ne sont pas neutres.

    Ils décrivent ce que ZETIS fait **déjà** (dérivés et cartes servis sans relecture, cours gaté).
    Un défaut « tout au minimum » aurait été plus rassurant et faux — et la page qui l'affiche
    aurait menti dès son premier chargement.
    """
    client, _ = client_db
    body = client.get(API).json()

    assert _values(body) == {
        svc.A0A: svc.SERVE,
        svc.A0B: svc.SERVE,
        svc.A1: svc.VALIDATE,
        svc.A2: svc.PROPOSE,
        svc.A3: svc.VALIDATE,
        svc.A4: svc.NEVER,
    }
    assert body["preset"] == "semi"


def test_chaque_verrou_porte_son_motif(client_db) -> None:
    """Un cadenas muet se lit comme une panne : toute classe verrouillée DIT pourquoi."""
    client, _ = client_db
    for cls in client.get(API).json()["classes"]:
        if cls["locked"]:
            assert cls["reason"], f"{cls['code']} est verrouillée sans motif"


def test_le_front_na_aucune_liste_en_dur(client_db) -> None:
    """Les `choices` viennent du serveur — c'est lui qui refuse, l'UI ne fait que le rendre."""
    client, _ = client_db
    by_code = {c["code"]: c for c in client.get(API).json()["classes"]}

    assert by_code["A0a"]["choices"] == [svc.VALIDATE, svc.SERVE]
    assert by_code["A0b"]["choices"] == [svc.SERVE]  # verrouillé faute de gate
    assert by_code["A2"]["choices"] == [svc.PROPOSE]
    assert by_code["A4"]["choices"] == [svc.NEVER]


# --- Écriture et refus (verrous n°1, 5, 6bis) ---------------------------------------------------


def test_le_preset_se_derive_il_ne_se_stocke_pas(client_db) -> None:
    """Descendre A0a suffit à changer le régime affiché. Aucune ligne « mode » n'existe."""
    client, Session = client_db
    body = client.put(API, json={"values": {svc.A0A: svc.VALIDATE}}).json()
    assert body["preset"] == "manuel"

    with Session() as db:
        keys = {row.key for row in db.scalars(select(m.AppSetting))}
    assert all(not k.endswith("preset") and not k.endswith("mode") for k in keys)


@pytest.mark.parametrize(
    "key, value",
    [
        (svc.A4, svc.SERVE),  # terminal — jamais, quel que soit le préréglage
        (svc.A2, svc.SERVE),  # référentiel — figé au palier 1
        (svc.A3, svc.SERVE),  # élire n'est pas créer
        (svc.A0B, svc.VALIDATE),  # cartes SRS — aucun gate n'existe pour les valider
    ],
)
def test_les_classes_verrouillees_refusent_lecriture(client_db, key: str, value: int) -> None:
    """VERROU n°1 et 6bis : refus **motivé**, jamais une troncature silencieuse."""
    client, _ = client_db
    response = client.put(API, json={"values": {key: value}})

    assert response.status_code == 422
    assert response.json()["detail"], "le refus doit dire pourquoi"
    assert _values(client.get(API).json())[key] == svc.BY_KEY[key].default


def test_a1_au_palier_3_est_refuse_tant_que_le_veto_na_pas_decran(client_db) -> None:
    """VERROU n°5 : le palier 3 d'A1 et son veto se livrent ensemble, ou pas du tout.

    Laisser ZETIS servir des cours sans surface pour les retirer, ce serait livrer un droit qui
    n'existe pas. Le jour où le Journal est livré, `VETO_SURFACE_AVAILABLE` passe à `True`.
    """
    client, _ = client_db
    assert svc.VETO_SURFACE_AVAILABLE is False

    response = client.put(API, json={"values": {svc.A1: svc.SERVE}})
    assert response.status_code == 422
    assert "Journal" in response.json()["detail"]


def test_la_monotonie_est_une_regle_pas_une_preference() -> None:
    """A1 = 3 force A0a = 3 — fonction pure, testée hors du verrou de phase.

    On ne sert pas un cours sans relecture tout en relisant les fiches qui en dérivent.
    """
    resolved = svc.apply_monotonicity({svc.A0A: svc.VALIDATE, svc.A1: svc.SERVE})
    assert resolved[svc.A0A] == svc.SERVE


def test_une_cle_inconnue_est_refusee(client_db) -> None:
    client, _ = client_db
    assert client.put(API, json={"values": {"zetis_autonomy_a9_licorne": 3}}).status_code == 422


def test_aucun_blob_six_lignes_six_cles(client_db) -> None:
    """VERROU n°6 : six clés plates. Un blob JSON ferait d'un réglage la réécriture de tous."""
    client, Session = client_db
    client.put(API, json={"values": {svc.A0A: svc.VALIDATE}})

    with Session() as db:
        rows = list(db.scalars(select(m.AppSetting)))
    assert len(rows) == len(svc.AUTONOMY_CLASSES)
    for row in rows:
        assert row.value.isdigit(), f"{row.key} ne porte pas un palier nu : {row.value!r}"


def test_aucune_route_eleve(client_db) -> None:
    """VERROU n°8 : Massimo n'a rien à lire ici (invariant V1 — un retrait doit rester invisible)."""
    client, _ = client_db
    _as(CHILD)
    assert client.get(API).status_code == 403
    assert client.put(API, json={"values": {svc.A0A: svc.SERVE}}).status_code == 403


# --- Ce que les paliers commandent --------------------------------------------------------------


def test_le_gate_du_cours_suit_a1(client_db) -> None:
    """A1 = 2 → gate armé. La bascule se lit à un seul endroit, et c'est la sélection."""
    _, Session = client_db
    with Session() as db:
        assert svc.course_gate_enabled(db) is True
        db.add(m.AppSetting(key=svc.A1, value=str(svc.SERVE)))
        db.commit()
        assert svc.course_gate_enabled(db) is False


def test_le_gate_retire_rend_les_notions_sans_cours_eligibles(client_db) -> None:
    """Palier 3 d'A1 : ce qui était bloqué redevient équipable — et RIEN d'autre ne change."""
    from app.modules.production.runner import BLOCKED_COURSE_PENDING, select_notions

    _, Session = client_db
    with Session() as db:
        _, subject, chapter = _seed_year(db)
        draft = _seed_lesson(db, chapter, title="Brouillon", validated=False, course=False)
        skill = m.Skill(subject_id=subject.id, name="Notion en brouillon", level="4e")
        db.add(skill)
        db.flush()
        db.add(m.LessonSkill(lesson_id=draft.id, skill_id=skill.id))
        db.commit()

        eligible, blocked = select_notions(db, [skill.id])
        assert eligible == [] and blocked[0]["reason"] == BLOCKED_COURSE_PENDING

        eligible, blocked = select_notions(db, [skill.id], require_validated_course=False)
        assert eligible == [skill.id] and blocked == []


def test_une_notion_sans_lecon_reste_bloquee_a_tous_les_paliers(client_db) -> None:
    """Ce n'est pas un gate, c'est une absence de support : aucun palier ne la débloque."""
    from app.modules.production.runner import BLOCKED_NO_LESSON, select_notions

    _, Session = client_db
    with Session() as db:
        _, subject, _ = _seed_year(db)
        orpheline = m.Skill(subject_id=subject.id, name="Sans leçon", level="4e")
        db.add(orpheline)
        db.commit()

        eligible, blocked = select_notions(db, [orpheline.id], require_validated_course=False)
        assert eligible == [] and blocked[0]["reason"] == BLOCKED_NO_LESSON


# --- LE VERROU DU DÉFAUT (n°4) ------------------------------------------------------------------


def test_aucune_auto_validation_necrit_parent(client_db) -> None:
    """VERROU n°4 — le cours auto-validé est `parent_bulk`, JAMAIS `parent`.

    Contre-épreuve jouée : en remettant `set_lesson_validation(db, id, "validate")` sans `by=`
    dans `equip_notion`, ce test tombe. Sans lui, un cours que personne n'a ouvert repart marqué
    « relu pièce à pièce par Papa » — et devient indistinguable d'une vraie relecture.
    """
    from app.modules.production.equipment import equip_notion

    _, Session = client_db
    with Session() as db:
        _, subject, chapter = _seed_year(db)
        draft = _seed_lesson(db, chapter, title="Brouillon", validated=False, course=True)
        skill = m.Skill(subject_id=subject.id, name="Notion", level="4e")
        db.add(skill)
        db.flush()
        db.add(m.LessonSkill(lesson_id=draft.id, skill_id=skill.id))
        db.commit()
        lesson_id = draft.id

        equip_notion(
            db, skill_id=skill.id, llm=FakeLLMProvider(), embedder=FakeEmbeddingProvider()
        )

        lesson = db.get(m.Lesson, lesson_id)
        assert lesson.status == "validated"
        assert lesson.validated_by == "parent_bulk", (
            "un cours auto-validé ne doit jamais porter `parent` : personne ne l'a ouvert"
        )


def test_la_route_humaine_ecrit_toujours_parent(client_db) -> None:
    """Le défaut n'était pas dans la valeur écrite : `parent` reste juste pour un clic de Papa."""
    client, Session = client_db
    with Session() as db:
        _, _, chapter = _seed_year(db)
        draft = _seed_lesson(db, chapter, title="À relire", validated=False, course=True)
        db.commit()
        lesson_id = draft.id

    assert client.post(f"/api/lessons/{lesson_id}/validate").status_code == 200
    with Session() as db:
        assert db.get(m.Lesson, lesson_id).validated_by == "parent"


def test_parent_rule_reste_non_emise_tant_que_papa_clique(client_db) -> None:
    """⚠️ Correction d'une hypothèse de l'ADR : ce n'est pas le palier qui émet `parent_rule`.

    Le §G.1 la définit par l'absence de clic (« ni cliqué pour ce lot »). Un lot lancé depuis la
    Couverture EST un clic — sa provenance reste `parent_bulk`, même à A1 = 3.
    """
    from app.modules.production import runs
    from app.modules.production.runner import authority_for

    _, Session = client_db
    with Session() as db:
        _seed_year(db)
        chapter = db.scalar(select(m.Chapter))
        run = runs.create_run(db, chapter_id=chapter.id)

        assert run.authorized_by == "parent_direct"
        assert authority_for(db, run) == "parent_bulk"

        # A0a = 2 : ZETIS produit, Papa valide → rien n'est tamponné du tout.
        db.add(m.AppSetting(key=svc.A0A, value=str(svc.VALIDATE)))
        db.commit()
        assert authority_for(db, run) is None
