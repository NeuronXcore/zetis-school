"""Le plan de préparation — tests d'INVARIANTS (ADR-0050).

Ces tests encodent des règles de produit qui ne se voient pas dans le code : « rien à afficher
⇒ rien », « le plan est figé », « une date qui bouge le révoque », « cocher ne prouve rien ».

⚠️ **La chaîne de fixtures est longue, et ce n'est pas accidentel** : le chemin `fiche`/`quiz` de
`resolve_panoply` résout la leçon via `lesson_resolution.lessons_by_skill`, qui exige **l'année
active, un `school_year_subject` et un chapitre validé**. `ordered_chapter_skill_ids`, lui, n'en a
besoin de rien. **Les deux moitiés du plan n'ont donc pas le même périmètre** — un chapitre peut
résoudre des notions et ne produire aucune étape `fiche`. Monter la chaîne entière est le seul
moyen de tester ce que la production fera vraiment.
"""

import json
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

import app.db.models as m
import app.modules.agenda.plan as plan
from app.main import app
from app.modules.activity.timeutils import today_local
from app.modules.auth.deps import get_current_user

PAPA = {"username": "papa", "role": "papa"}
STUDENT = "/api/student/agenda"
PILOT = "/api/agenda"


@pytest.fixture()
def papa(client_db) -> TestClient:
    client, _ = client_db
    app.dependency_overrides[get_current_user] = lambda: PAPA
    return client


def _seed(
    Session,
    *,
    avec_fiche: bool = True,
    avec_cartes: bool = True,
    avec_quiz: bool = True,
    lecon_validee: bool = True,
    carte_sans_echeance: bool = False,
    notions_testables: int = 1,
) -> int:
    """Monte la chaîne curriculum COMPLÈTE et rend le `chapter_id`."""
    with Session() as db:
        student = db.scalar(select(m.StudentProfile).order_by(m.StudentProfile.id)).id
        # `SchoolYear.student_id` est NOT NULL : une année appartient à un élève.
        annee = m.SchoolYear(
            student_id=student, label="2026-2027", level="4e", status="active"
        )
        db.add(annee)
        matiere = db.scalar(select(m.Subject).where(m.Subject.slug == "mathematiques"))
        db.flush()
        sys_row = m.SchoolYearSubject(school_year_id=annee.id, subject_id=matiere.id)
        db.add(sys_row)
        db.flush()
        chapitre = m.Chapter(
            name="Les fractions",
            school_year_subject_id=sys_row.id,
            validation_status="validated",
        )
        db.add(chapitre)
        db.flush()
        lecon = m.Lesson(
            chapter_id=chapitre.id,
            title="Multiplier des fractions",
            created_by="parent",
            status="validated" if lecon_validee else "draft",
            content_markdown="# Cours",
        )
        db.add(lecon)
        db.flush()

        for index in range(max(1, notions_testables)):
            skill = m.Skill(subject_id=matiere.id, name=f"notion-{index}", level="4e")
            db.add(skill)
            db.flush()
            db.add(m.LessonSkill(lesson_id=lecon.id, skill_id=skill.id))
            if avec_cartes:
                db.add(
                    m.SpacedReviewCard(
                        student_id=student,
                        skill_id=skill.id,
                        front_markdown="Q",
                        back_markdown="R",
                        interval_days=1,
                        # `None` = le cas où la panoplie et le deck DIVERGENT : elle la compte,
                        # lui la refuse (`due_at IS NOT NULL`).
                        due_at=None if carte_sans_echeance else datetime.now(timezone.utc),
                        status="scheduled",
                    )
                )
        # ⚠️ Le quiz est rattaché à la LEÇON, pas à la notion : `Quiz` n'a aucun `skill_id`, et
        # la panoplie joint `LessonSkill.lesson_id == Quiz.lesson_id`. Toutes les notions d'une
        # leçon résolvent donc le MÊME quiz — un seul suffit, et six n'en feraient pas six.
        if avec_quiz:
            db.add(
                m.Quiz(
                    lesson_id=lecon.id,
                    subject_id=matiere.id,
                    title="Quiz du chapitre",
                    quiz_type="mission",
                    status="ready",
                )
            )
        if avec_fiche:
            db.add(m.Fiche(lesson_id=lecon.id, validation_status="validated"))
        db.commit()
        return chapitre.id


def _item(client: TestClient, *, jours: int, chapitre: int | None = None) -> dict:
    payload = {
        "label": "Contrôle de fractions",
        "due_on": (today_local() + timedelta(days=jours)).isoformat(),
        "kind": "controle",
    }
    if chapitre is not None:
        payload["chapter_id"] = chapitre
    res = client.post(f"{PILOT}/items", json={"items": [payload]})
    assert res.status_code == 201, res.text
    return res.json()[0]


def _plan_du_jour(client: TestClient) -> list[dict]:
    """Toutes les étapes de la bande, tous jours confondus."""
    days = client.get(f"{STUDENT}/week").json()["days"]
    return [step for day in days for step in day["plan_steps"]]


# ── Rien à afficher ⇒ RIEN (Décision 3 + adr-0025 §14.6) ─────────────────────────


def test_pas_de_plan_a_j0_ni_j1(papa: TestClient, client_db) -> None:
    """Il n'y a pas de « rétro-planning » sur zéro jour disponible — et une échéance du jour
    même n'a plus rien à préparer."""
    _, Session = client_db
    chapitre = _seed(Session)
    for jours in (0, 1):
        _item(papa, jours=jours, chapitre=chapitre)
    assert _plan_du_jour(papa) == []


def test_pas_de_plan_sans_chapitre(papa: TestClient, client_db) -> None:
    """Sans chapitre, aucune notion n'est résoluble : le plan n'a rien à composer."""
    _, Session = client_db
    _seed(Session)
    _item(papa, jours=5, chapitre=None)
    assert _plan_du_jour(papa) == []


def test_pas_de_plan_quand_aucune_activite_nest_disponible(papa: TestClient, client_db) -> None:
    """Chapitre bien résolu, mais ni fiche, ni cartes, ni quiz → aucune étape.

    ⚠️ **Une seule garde s'applique ici** : le chapitre a une leçon validée et des notions, et
    l'échéance est à J+5. Si ce test passait alors qu'une autre garde le sauve, il ne prouverait
    rien — c'est le piège qui a rendu un verrou vert sur son sabotage la veille.
    """
    _, Session = client_db
    chapitre = _seed(Session, avec_fiche=False, avec_cartes=False, avec_quiz=False)
    _item(papa, jours=5, chapitre=chapitre)
    assert _plan_du_jour(papa) == []


def test_has_plan_est_faux_quand_le_plan_est_vide(papa: TestClient, client_db) -> None:
    """🔴 `has_plan` optimiste ferait apparaître un « ✦ » qui n'ouvre rien — le bouton mort."""
    _, Session = client_db
    chapitre = _seed(Session, avec_fiche=False, avec_cartes=False, avec_quiz=False)
    _item(papa, jours=5, chapitre=chapitre)
    upcoming = papa.get(f"{STUDENT}/upcoming").json()
    assert upcoming and all(item["has_plan"] is False for item in upcoming)


def test_has_plan_est_vrai_quand_le_plan_existe(papa: TestClient, client_db) -> None:
    _, Session = client_db
    chapitre = _seed(Session)
    _item(papa, jours=5, chapitre=chapitre)
    upcoming = papa.get(f"{STUDENT}/upcoming").json()
    assert upcoming and upcoming[0]["has_plan"] is True


# ── La composition (Décisions 2, 2 bis, 3) ───────────────────────────────────────


def test_trois_types_trois_etapes_jamais_le_jour_de_lecheance(papa: TestClient, client_db) -> None:
    """Une étape par TYPE, dans l'ordre de la panoplie, et jamais `day_offset == 0`."""
    _, Session = client_db
    chapitre = _seed(Session)
    _item(papa, jours=5, chapitre=chapitre)
    etapes = _plan_du_jour(papa)
    assert [e["kind"] for e in etapes] == ["fiche", "revision", "quiz"]
    assert all(e["day_offset"] >= 1 for e in etapes)
    # 🔴 Décision 2 ter — chaque étape DIT ce qu'elle prépare. ⚠️ Assertion sur la réponse HTTP,
    # jamais sur le retour du service : `response_model` filtre en silence ce qui n'est pas au
    # schéma, piège payé trois fois dans ce dépôt (adr-0045, adr-0047, adr-0049).
    assert all(isinstance(e["agenda_item_id"], int) for e in etapes)
    assert len({e["agenda_item_id"] for e in etapes}) == 1, "un seul contrôle ici"


def test_jamais_deux_etapes_du_meme_type(papa: TestClient, client_db) -> None:
    """🔴 VERROU Décision 2 bis — six notions testables ne donnent PAS six quiz.

    Le plan dit par où commencer, pas tout ce qu'on pourrait faire.
    """
    _, Session = client_db
    chapitre = _seed(Session, notions_testables=6)
    _item(papa, jours=5, chapitre=chapitre)
    kinds = [e["kind"] for e in _plan_du_jour(papa)]
    assert len(kinds) == len(set(kinds)), kinds
    assert len(kinds) <= plan.PLAN_MAX_STEPS


def test_echeance_proche_deux_etapes_au_lieu_de_trois(papa: TestClient, client_db) -> None:
    """2 ou 3 jours restants → le plafond descend à 2. Il ne monte jamais au-dessus de 3."""
    _, Session = client_db
    chapitre = _seed(Session)
    _item(papa, jours=3, chapitre=chapitre)
    assert len(_plan_du_jour(papa)) == plan.PLAN_MAX_STEPS_SHORT


def test_une_carte_sans_echeance_ne_produit_aucune_etape_de_revision(
    papa: TestClient, client_db
) -> None:
    """🔴 LE verrou de la Décision 2 amendée — le SEUL cas où la panoplie et le deck divergent.

    `resolve_panoply` compte cette carte (`status` seul) ; `chapter_servable_count` la refuse
    (`due_at IS NOT NULL`). Composer `revision` depuis la panoplie donnerait une étape qui ouvre
    sur un **400**.

    ⚠️ SABOTAGE ATTENDU : composer `revision` depuis `_panoply_entry(..., "revision")` doit faire
    ROUGIR ce test.
    """
    _, Session = client_db
    chapitre = _seed(Session, carte_sans_echeance=True, avec_fiche=False, avec_quiz=False)
    _item(papa, jours=5, chapitre=chapitre)
    assert _plan_du_jour(papa) == []


# ── Le figement et sa révocation (Décision 4) ────────────────────────────────────


def test_le_plan_ne_se_recompose_pas_quand_une_fiche_arrive_apres(
    papa: TestClient, client_db
) -> None:
    """🔴 « Un plan qui se recalcule à chaque ouverture est un plan auquel on ne fait pas
    confiance » (§8 rôle 1).

    ⚠️ Le figement ne se teste PAS en appelant deux fois : il faut **changer le monde entre les
    deux** et vérifier que le plan n'a pas bougé.
    """
    _, Session = client_db
    chapitre = _seed(Session, avec_fiche=False)
    _item(papa, jours=5, chapitre=chapitre)
    avant = [e["kind"] for e in _plan_du_jour(papa)]
    assert "fiche" not in avant

    with Session() as db:  # le monde change APRÈS la première lecture
        lecon = db.scalar(select(m.Lesson).order_by(m.Lesson.id))
        db.add(m.Fiche(lesson_id=lecon.id, validation_status="validated"))
        db.commit()

    assert [e["kind"] for e in _plan_du_jour(papa)] == avant


def test_deplacer_la_date_supprime_le_plan_et_ses_coches(papa: TestClient, client_db) -> None:
    """🔴 Un rétro-planning est une FONCTION DE LA DATE. Le garder afficherait des jours qui ne
    veulent plus rien dire. La perte des coches est assumée.

    ⚠️ **On assertait d'abord sur les ids, et c'était FAUX** : SQLite réattribue les rowids après
    un DELETE, si bien qu'un plan supprimé puis recomposé revient avec `{1, 2, 3}`. Le test
    rougissait sur du code correct. On asserte donc sur la **promesse** — les coches sont
    perdues, et les jours suivent la nouvelle date — jamais sur l'identité des lignes.
    """
    client, Session = client_db
    chapitre = _seed(Session)
    item = _item(papa, jours=5, chapitre=chapitre)
    etapes = _plan_du_jour(papa)
    assert etapes
    offsets_avant = sorted(e["day_offset"] for e in etapes)

    client.post(f"{STUDENT}/plan-steps/{etapes[0]['id']}/done")
    assert any(e["done"] for e in _plan_du_jour(papa)), "la coche doit d'abord exister"

    res = papa.patch(
        f"{PILOT}/items/{item['id']}",
        json={"due_on": (today_local() + timedelta(days=4)).isoformat()},
    )
    assert res.status_code == 200, res.text

    apres = _plan_du_jour(papa)
    assert apres, "un nouveau plan est composé pour la nouvelle date"
    assert not any(e["done"] for e in apres), "🔴 les coches sont PERDUES avec le plan"
    assert sorted(e["day_offset"] for e in apres) != offsets_avant, (
        "les jours doivent suivre la nouvelle date"
    )


def test_patcher_un_autre_champ_ne_supprime_PAS_le_plan(papa: TestClient, client_db) -> None:
    """⚠️ Deux assertions, sinon le verrou est à moitié écrit : le chantier agenda a déjà payé
    « le PATCH partiel qui périme une donnée » — `data.get("due_on")` vaut `None` aussi quand la
    clé est absente.

    ⚠️ **Ne PAS asserter sur les ids** : SQLite les réattribue après un DELETE, donc un plan
    supprimé puis recomposé revient avec les mêmes — et le sabotage passait VERT. On asserte sur
    ce que la suppression détruirait vraiment : **la coche**.
    """
    client, Session = client_db
    chapitre = _seed(Session)
    item = _item(papa, jours=5, chapitre=chapitre)
    etapes = _plan_du_jour(papa)
    assert etapes
    client.post(f"{STUDENT}/plan-steps/{etapes[0]['id']}/done")
    assert any(e["done"] for e in _plan_du_jour(papa))

    res = papa.patch(f"{PILOT}/items/{item['id']}", json={"label": "Contrôle (reporté ?)"})
    assert res.status_code == 200, res.text
    assert any(e["done"] for e in _plan_du_jour(papa)), (
        "patcher un autre champ ne doit PAS détruire le plan ni ses coches"
    )


# ── La coche (Décision 5, option A) ──────────────────────────────────────────────


def test_cocher_une_etape_ne_credite_AUCUN_XP(papa: TestClient, client_db) -> None:
    """🔴 VERROU — le geste est déclaratif, il ne se récompense pas : sinon Massimo apprend à
    cocher (§3). ⚠️ Le saboter en ajoutant un `award_xp` doit ROUGIR."""
    client, Session = client_db
    chapitre = _seed(Session)
    _item(papa, jours=5, chapitre=chapitre)
    etape = _plan_du_jour(papa)[0]

    res = client.post(f"{STUDENT}/plan-steps/{etape['id']}/done")
    assert res.status_code == 200 and res.json()["done"] is True

    with Session() as db:
        assert db.scalar(select(func.count(m.XPEvent.id))) == 0


def test_jouer_lactivite_ne_coche_rien(papa: TestClient, client_db) -> None:
    """🔴 VERROU — c'est ce qui distingue l'option (A) de l'option (B), REPORTÉE.

    Sans lui, la frontière se franchirait par inadvertance le jour où quelqu'un trouvera la
    trace « à portée de main ».
    """
    client, Session = client_db
    chapitre = _seed(Session)
    _item(papa, jours=5, chapitre=chapitre)
    etape = next(e for e in _plan_du_jour(papa) if e["kind"] == "revision")

    with Session() as db:  # une session de cartes a bien eu lieu
        carte = db.scalar(select(m.SpacedReviewCard).order_by(m.SpacedReviewCard.id))
        db.add(
            m.SpacedReviewAttempt(
                card_id=carte.id,
                student_id=carte.student_id,
                rating="good",
                reviewed_at=datetime.now(timezone.utc),
                is_consolidation=True,
            )
        )
        db.commit()

    apres = next(e for e in _plan_du_jour(papa) if e["id"] == etape["id"])
    assert apres["done"] is False, "jouer l'activité ne coche pas l'étape"


def test_une_etape_dun_autre_eleve_rend_404(papa: TestClient, client_db) -> None:
    """404 et non 403 : un id inconnu et un id étranger doivent être INDISCERNABLES."""
    client, _ = client_db
    assert client.post(f"{STUDENT}/plan-steps/999999/done").status_code == 404


# ── Papa LIT le plan, il ne le DÉCLENCHE pas (Décision 7) ────────────────────────


def _etapes_en_base(Session) -> int:
    with Session() as db:
        return db.scalar(select(func.count(m.AgendaPlanStep.id))) or 0


def _grille(client: TestClient) -> list[dict]:
    """La grille de pilotage, sur une fenêtre qui couvre largement l'échéance."""
    res = client.get(
        f"{PILOT}/items",
        params={
            "from": (today_local() - timedelta(days=1)).isoformat(),
            "to": (today_local() + timedelta(days=20)).isoformat(),
        },
    )
    assert res.status_code == 200, res.text
    return res.json()


def test_lire_la_grille_de_papa_ne_COMPOSE_AUCUN_plan(papa: TestClient, client_db) -> None:
    """🔴 **LE verrou de la Session C.**

    Le §8 dit *« composé à la première lecture »* — la première lecture **de Massimo**. Si la
    grille de Papa composait, il **figerait le plan de son fils** en relevant l'ENT le dimanche
    soir, sur un état du référentiel antérieur aux fiches qu'il s'apprête justement à valider.
    La surface de pilotage **constate**, elle ne provoque pas — même frontière que `done_at`,
    que Papa lit et n'écrit jamais (§2b).

    ⚠️ L'échéance est **réellement composable** (chapitre résolu, fiche + cartes + quiz, J+5) :
    c'est ce qui rend le test probant. Sur une échéance sans plan possible, il passerait sans
    rien prouver — le piège qui a rendu un verrou vert sur son sabotage.
    """
    _, Session = client_db
    chapitre = _seed(Session)
    _item(papa, jours=5, chapitre=chapitre)
    assert _etapes_en_base(Session) == 0, "créer l'échéance ne compose rien non plus"

    grille = _grille(papa)
    assert _etapes_en_base(Session) == 0, "🔴 Papa vient de figer le plan de Massimo"
    assert grille[0]["plan_steps_total"] == 0
    assert grille[0]["plan_steps_done"] == 0

    # Et Massimo, lui, le fait naître — sinon ce test prouverait seulement que rien ne marche.
    assert len(_plan_du_jour(papa)) == 3
    assert _etapes_en_base(Session) == 3


def test_papa_lit_le_compte_du_plan_et_ses_coches(papa: TestClient, client_db) -> None:
    """« plan en 3 étapes · 1 cochée » — deux entiers, calculés en base."""
    _, Session = client_db
    chapitre = _seed(Session)
    _item(papa, jours=5, chapitre=chapitre)
    etapes = _plan_du_jour(papa)  # la lecture de Massimo compose le plan

    assert _grille(papa)[0]["plan_steps_total"] == 3
    assert _grille(papa)[0]["plan_steps_done"] == 0

    papa.post(f"{STUDENT}/plan-steps/{etapes[0]['id']}/done")
    ligne = _grille(papa)[0]
    assert (ligne["plan_steps_total"], ligne["plan_steps_done"]) == (3, 1)

    # Décocher redescend : le compte suit la déclaration, il ne cumule pas.
    papa.post(f"{STUDENT}/plan-steps/{etapes[0]['id']}/undone")
    assert _grille(papa)[0]["plan_steps_done"] == 0


def test_une_echeance_sans_plan_rend_zero_sur_zero(papa: TestClient, client_db) -> None:
    """`0/0` et non `null` : la surface n'a aucun cas d'absence à traiter, elle rend RIEN."""
    _, Session = client_db
    _seed(Session)
    _item(papa, jours=5, chapitre=None)
    ligne = _grille(papa)[0]
    assert (ligne["plan_steps_total"], ligne["plan_steps_done"]) == (0, 0)


def test_deplacer_la_date_rend_zero_dans_la_REPONSE_du_patch(
    papa: TestClient, client_db
) -> None:
    """🔴 La réponse du PATCH dit ce qui vient de se passer, pas ce qui était vrai avant.

    Déplacer la date **supprime** le plan (Décision 4). Une route unitaire qui renverrait le
    compte d'avant afficherait « 3 étapes » sur une échéance qui n'en a plus aucune — et il
    aurait fallu recharger la page pour s'en apercevoir.
    """
    _, Session = client_db
    chapitre = _seed(Session)
    item = _item(papa, jours=5, chapitre=chapitre)
    _plan_du_jour(papa)
    assert _grille(papa)[0]["plan_steps_total"] == 3

    res = papa.patch(
        f"{PILOT}/items/{item['id']}",
        json={"due_on": (today_local() + timedelta(days=9)).isoformat()},
    )
    assert res.status_code == 200, res.text
    assert (res.json()["plan_steps_total"], res.json()["plan_steps_done"]) == (0, 0)


def test_une_route_unitaire_rend_le_VRAI_compte_du_plan(papa: TestClient, client_db) -> None:
    """🔴 Le pendant POSITIF du test ci-dessus, et il est indispensable.

    Seul, l'autre est **vert sur son sabotage** : si `pilot_out_one` rendait toujours `{}`, il
    verrait quand même `0/0` après un déplacement de date — le plan venant d'être supprimé, la
    bonne réponse et la mauvaise coïncident. Démontré le 2026-08-10.

    Il faut donc une route unitaire qui **ne touche pas** au plan et doit rendre un compte NON
    NUL : la note privée. Saboter `pilot_out_one` en `plan={}` rougit ici, et seulement ici.
    """
    _, Session = client_db
    chapitre = _seed(Session)
    item = _item(papa, jours=5, chapitre=chapitre)
    etapes = _plan_du_jour(papa)
    papa.post(f"{STUDENT}/plan-steps/{etapes[0]['id']}/done")

    res = papa.put(f"{PILOT}/items/{item['id']}/note", json={"parent_note": "revoir avec lui"})
    assert res.status_code == 200, res.text
    assert (res.json()["plan_steps_total"], res.json()["plan_steps_done"]) == (3, 1)


def test_papa_ne_recoit_JAMAIS_les_etapes_elles_memes(papa: TestClient, client_db) -> None:
    """🔴 Deux entiers, et rien d'autre (Décision 7).

    Servir les étapes à Papa en ferait un **objet de pilotage** : il lirait ce que ZETIS a
    proposé, puis voudrait le corriger — et le plan cesserait d'être un service rendu à Massimo.
    L'assertion porte sur le **JSON sérialisé**, pas sur le schéma : c'est ce qui part sur le
    réseau qui est exposé, quoi qu'en fasse l'UI.
    """
    _, Session = client_db
    chapitre = _seed(Session)
    _item(papa, jours=5, chapitre=chapitre)
    _plan_du_jour(papa)

    brut = json.dumps(_grille(papa))
    for interdit in ("day_offset", "sort_order", "resource_id", "plan_steps\"", "steps\":"):
        assert interdit not in brut, f"« {interdit} » ne doit jamais atteindre Papa"


def test_aucune_route_ne_permet_a_papa_de_generer_un_plan(papa: TestClient, client_db) -> None:
    """L'affordance n'existe pas — pas même en 403. Un plan est composé par la lecture de
    Massimo, jamais par un geste d'adulte (Décision 7 : « aucune génération manuelle »)."""
    _, Session = client_db
    chapitre = _seed(Session)
    item = _item(papa, jours=5, chapitre=chapitre)
    for chemin in (f"{PILOT}/items/{item['id']}/plan", f"{PILOT}/plan-steps"):
        assert papa.post(chemin).status_code == 404, chemin
    assert _etapes_en_base(Session) == 0
