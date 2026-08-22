"""Agenda scolaire — tests d'INVARIANTS (ADR-0025, Lot 1).

Ces tests sont le livrable de la slice, pas un accessoire : ils encodent des règles de produit
qui ne se voient pas dans le code métier (« seul Massimo coche », « l'absence n'est pas un
événement », « aucune mission dans une surface datée »). Un refactor qui les casse casse l'ADR.
"""

from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

import app.db.models as m
from app.core.config import settings
from app.main import app
from app.modules.activity.timeutils import local_day
from app.modules.activity.timeutils import today_local
from app.modules.auth.deps import get_current_user

PAPA = {"username": "papa", "role": "papa"}
MASSIMO = {"username": "massimo", "role": "child"}

STUDENT = "/api/student/agenda"
PILOT = "/api/agenda"


@pytest.fixture()
def papa(client_db) -> TestClient:
    """Client authentifié en Papa (le conftest ouvre par défaut sur le rôle enfant)."""
    client, _ = client_db
    app.dependency_overrides[get_current_user] = lambda: PAPA
    return client


def _as_massimo() -> None:
    app.dependency_overrides[get_current_user] = lambda: MASSIMO


def _create_parent_item(client: TestClient, **kwargs) -> dict:
    payload = {
        "label": kwargs.get("label", "DM de maths ex. 12 à 15"),
        "due_on": kwargs.get("due_on", (today_local() + timedelta(days=2)).isoformat()),
        "kind": kwargs.get("kind", "devoir"),
    }
    for key in ("subject_id", "chapter_id", "lesson_id", "parent_note"):
        if key in kwargs:
            payload[key] = kwargs[key]
    response = client.post(f"{PILOT}/items", json={"items": [payload]})
    assert response.status_code == 201, response.text
    return response.json()[0]


# ── 1. Papa ne coche pas (§2b) ───────────────────────────────────────────────────


def test_papa_cannot_check_an_item(papa: TestClient) -> None:
    """Aucune route Papa n'écrit `done_at` — et la tentative est un refus d'AUTORITÉ (403),
    pas un refus de validation (422)."""
    item = _create_parent_item(papa)

    # a) Le PATCH Papa refuse `done_at` — 403 (autorité), surtout pas 422 (validation), et
    #    surtout pas un champ silencieusement ignoré qui laisserait croire que ça a marché.
    patched = papa.patch(f"{PILOT}/items/{item['id']}", json={"done_at": "2026-07-29T10:00:00Z"})
    assert patched.status_code == 403
    assert papa.get(
        f"{PILOT}/items", params={"from": "2020-01-01", "to": "2030-01-01"}
    ).json()[0]["done_at"] is None

    # b) Les routes de coche n'existent tout simplement pas côté Papa.
    for path in (f"{PILOT}/items/{item['id']}/done", f"{PILOT}/items/{item['id']}/undone"):
        assert papa.post(path).status_code == 404

    # c) La route élève, elle, coche — y compris un item saisi par Papa.
    _as_massimo()
    done = papa.post(f"{STUDENT}/items/{item['id']}/done")
    assert done.status_code == 200
    assert done.json()["done"] is True


# ── 2. Étanchéité : `parent_note` ne franchit jamais /api/student/* (§2b, ADR-0002) ──


def test_parent_note_never_reaches_massimo(papa: TestClient) -> None:
    """Assertion sur le JSON SÉRIALISÉ, pas sur le schéma : un champ présent dans la réponse
    réseau est un champ exposé, quoi qu'en fasse l'UI."""
    secret = "Il a séché le contrôle précédent, à surveiller"
    item = _create_parent_item(papa, parent_note=secret)
    assert papa.get(f"{PILOT}/items", params={"from": "2020-01-01", "to": "2030-01-01"}).json()[0][
        "parent_note"
    ] == secret

    _as_massimo()
    today = today_local()
    payloads = [
        papa.get(f"{STUDENT}/week").text,
        papa.get(f"{STUDENT}/upcoming").text,
        papa.get(
            f"{STUDENT}/items",
            params={"from": (today - timedelta(days=30)).isoformat(),
                    "to": (today + timedelta(days=30)).isoformat()},
        ).text,
        papa.post(f"{STUDENT}/items/{item['id']}/done").text,
    ]
    for body in payloads:
        assert "parent_note" not in body
        assert secret not in body


# ── 3. Trace d'édition (§2a) ─────────────────────────────────────────────────────


def test_parent_edit_marks_the_item_for_massimo(papa: TestClient) -> None:
    """Papa corrige un item de Massimo → `edited_by_parent_at` posé par le SERVICE, et
    `edited_by_parent: true` remonte côté enfant. Sans ce marqueur, l'agenda bougerait tout
    seul sous les yeux de Massimo."""
    settings.agenda_student_entry_enabled = True
    try:
        _as_massimo()
        created = papa.post(
            f"{STUDENT}/items",
            json={"label": "exo maths", "due_on": (today_local() + timedelta(days=1)).isoformat()},
        )
        assert created.status_code == 201
        item_id = created.json()["id"]
        assert created.json()["edited_by_parent"] is False

        app.dependency_overrides[get_current_user] = lambda: PAPA
        patched = papa.patch(f"{PILOT}/items/{item_id}", json={"label": "Relire la leçon"})
        assert patched.status_code == 200
        assert patched.json()["edited_by_parent_at"] is not None

        _as_massimo()
        band = papa.get(f"{STUDENT}/week").json()
        items = [i for day in band["days"] for i in day["fixed_items"]]
        assert any(i["id"] == item_id and i["edited_by_parent"] is True for i in items)
    finally:
        settings.agenda_student_entry_enabled = False


# ── 4. `created_by` immuable (§3) ────────────────────────────────────────────────


def test_created_by_is_immutable(papa: TestClient) -> None:
    item = _create_parent_item(papa)
    response = papa.patch(f"{PILOT}/items/{item['id']}", json={"created_by": "student"})
    assert response.status_code in (200, 422)
    if response.status_code == 200:
        assert response.json()["created_by"] == "parent"


# ── 5. Pas de suppression physique (§2c) ─────────────────────────────────────────


def test_delete_is_archiving_not_deletion(papa: TestClient, client_db) -> None:
    _, SessionLocal = client_db
    item = _create_parent_item(papa)
    response = papa.delete(f"{PILOT}/items/{item['id']}")
    assert response.status_code == 200
    assert response.json()["dismissed_at"] is not None

    db = SessionLocal()
    try:
        row = db.get(m.AgendaItem, item["id"])
        assert row is not None, "la ligne doit rester en base"
        assert row.dismissed_at is not None
    finally:
        db.close()

    # L'item archivé reste visible côté pilotage, disparaît côté Massimo.
    assert any(
        i["id"] == item["id"]
        for i in papa.get(
            f"{PILOT}/items", params={"from": "2020-01-01", "to": "2030-01-01"}
        ).json()
    )
    _as_massimo()
    band = papa.get(f"{STUDENT}/week").json()
    assert all(i["id"] != item["id"] for day in band["days"] for i in day["fixed_items"])


def _dans_la_bande(client: TestClient, item_id: int) -> bool:
    band = client.get(f"{STUDENT}/week").json()
    return any(i["id"] == item_id for day in band["days"] for i in day["fixed_items"])


def test_massimo_peut_revenir_sur_son_masquage(papa: TestClient) -> None:
    """La croix ✕ se rattrape — le symétrique que `dismiss` n'avait pas.

    🔴 **Défaut trouvé à la RELECTURE HUMAINE le 2026-08-10** : un tap retirait un devoir de
    l'agenda **définitivement**. Aucune route ne le rendait, et `dismissed_at` est exclu de
    `_STUDENT_EDITABLE` comme de `_PARENT_EDITABLE` — Papa lui-même ne pouvait que le ressaisir.
    Le §2c n'avait rien décidé là-dessus : l'irréversibilité était un oubli, désigné par
    l'asymétrie avec `undone` dans le même routeur.

    ⚠️ **TROIS assertions, et c'est le point.** Vérifier que l'item disparaît après `dismiss` ne
    verrouille **rien** — une bande vide satisferait l'assertion négative aussi bien qu'une bande
    correcte. Le verrou est l'aller-RETOUR : présent, puis absent, puis **présent de nouveau**.
    """
    item = _create_parent_item(papa)
    _as_massimo()

    assert _dans_la_bande(papa, item["id"]), "l'item doit être visible AVANT le masquage"
    assert papa.post(f"{STUDENT}/items/{item['id']}/dismiss").status_code == 200
    assert not _dans_la_bande(papa, item["id"])

    assert papa.post(f"{STUDENT}/items/{item['id']}/undismiss").status_code == 200
    assert _dans_la_bande(papa, item["id"]), "démasquer doit RENDRE l'item à l'agenda"


def test_undismiss_ne_fuit_pas_dismissed_at(papa: TestClient) -> None:
    """Le rattrapage n'ouvre aucun champ interdit : `AgendaItemStudentOut` reste muet sur les
    horodatages (§2c). Un `response_model` filtre en silence — sans ce test, ajouter le champ au
    service l'aurait exposé le jour où quelqu'un l'ajoute au schéma « pour déboguer »."""
    item = _create_parent_item(papa)
    _as_massimo()
    papa.post(f"{STUDENT}/items/{item['id']}/dismiss")
    corps = papa.post(f"{STUDENT}/items/{item['id']}/undismiss").json()
    for interdit in ("dismissed_at", "parent_note", "created_at", "edited_by_parent_at"):
        assert interdit not in corps, f"{interdit} ne doit jamais atteindre Massimo"


def test_papa_rend_une_echeance_archivee(papa: TestClient) -> None:
    """La moitié PARENTALE du rattrapage — celle qui compte quand le masquage était une esquive
    et non un faux mouvement. Rend agissante l'asymétrie que le §2c pose déjà (« le parent voit
    tout ») : jusque-là il voyait l'archive sans pouvoir la rendre."""
    item = _create_parent_item(papa)
    _as_massimo()
    papa.post(f"{STUDENT}/items/{item['id']}/dismiss")
    assert not _dans_la_bande(papa, item["id"])

    app.dependency_overrides[get_current_user] = lambda: PAPA
    response = papa.post(f"{PILOT}/items/{item['id']}/restore")
    assert response.status_code == 200
    assert response.json()["dismissed_at"] is None, "la ligne redevient visible, pas archivée"

    _as_massimo()
    assert _dans_la_bande(papa, item["id"]), "l'échéance rendue revient chez Massimo"


# ── 6 & 11. Asymétrie de la bande, et aucune case vide sur un jour à venir (§6, §7) ──


def test_band_asymmetry_past_traces_future_items(papa: TestClient) -> None:
    """🔴 **Test INVERSÉ par l'ADR-0025 Amendement 8 §R3 (2026-08-17).**

    Il asserait `day["fixed_items"] == []` sur un jour passé, au motif du §6 :
    *« un jour passé n'a plus d'échéance à annoncer »*. Le commanditaire a révoqué cette
    asymétrie — un jour passé annonce désormais ce que l'école demandait, sinon revenir sur le
    samedi 15 août répond « Rien à rendre ce jour-là » alors qu'il y avait un devoir.

    ⚠️ **L'asymétrie n'est PAS morte pour autant** : elle tenait deux choses, et une seule est
    révoquée. `traces` reste `null` sur un jour à venir, et `plan_steps` reste `[]` sur un jour
    passé (une étape qu'on ne peut plus faire est un reproche, pas une aide). Les deux sont
    assertées ci-dessous — sans quoi la prochaine session les révoquerait par entraînement.
    """
    today = today_local()
    _create_parent_item(papa, due_on=(today + timedelta(days=2)).isoformat())
    _create_parent_item(papa, due_on=(today - timedelta(days=2)).isoformat(), label="passé")

    _as_massimo()
    band = papa.get(f"{STUDENT}/week").json()
    # Amplitude lue dans la config, jamais figée : elle est réglable (3 avant / 10 après
    # depuis le 2026-07-29), et un test qui la fige interdirait de la régler.
    assert len(band["days"]) == (
        settings.agenda_band_days_before + settings.agenda_band_days_after + 1
    )
    for day in band["days"]:
        day_date = date.fromisoformat(day["date"])
        if day_date > today:
            # PRÉSERVÉ : un jour à venir n'a pas de passé — `null`, JAMAIS `[]` (ADR-0024 §5 :
            # pas de réceptacle vide, donc pas de case à remplir dans le contrat).
            assert day["traces"] is None
        if day_date < today:
            # PRÉSERVÉ : aucune étape de plan sur un jour passé.
            assert day["plan_steps"] == []

    # RÉVOQUÉ : le jour passé porte maintenant son échéance.
    passe = next(d for d in band["days"] if d["offset"] == -2)
    assert [item["label"] for item in passe["fixed_items"]] == ["passé"]


def test_band_is_sliding_not_calendar(papa: TestClient) -> None:
    """Ancre un DIMANCHE → 3 jours de futur quand même. Une bande calendaire donnerait 0
    d'horizon ce jour-là : l'écran deviendrait un pur rétroviseur au pire moment."""
    _as_massimo()
    sunday = date(2026, 8, 2)
    assert sunday.weekday() == 6
    band = papa.get(f"{STUDENT}/week", params={"anchor": sunday.isoformat()}).json()
    offsets = [day["offset"] for day in band["days"]]
    before, after = settings.agenda_band_days_before, settings.agenda_band_days_after
    assert offsets == list(range(-before, after + 1))
    # Le point du test : un dimanche garde tout son horizon futur. Une bande calendaire en
    # donnerait 0 ce jour-là — l'écran deviendrait un pur rétroviseur au pire moment.
    assert after > 0
    assert date.fromisoformat(band["days"][-1]["date"]) == sunday + timedelta(days=after)


# ── 7. Règle de datation : aucune mission, aucune carte SRS dans une surface datée (§4) ──


def test_dated_surfaces_never_contain_missions_or_srs_cards(papa: TestClient, client_db) -> None:
    """Test-verrou. ZETIS ne se donne jamais rendez-vous à lui-même : poser une carte due ou
    une mission sur un calendrier fabriquerait un rendez-vous inexistant — donc du retard le
    lendemain."""
    _, SessionLocal = client_db
    db = SessionLocal()
    try:
        student = db.query(m.StudentProfile).first()
        skill = db.query(m.Skill).first()
        db.add(
            m.Mission(
                student_id=student.id,
                skill_id=skill.id,
                title="Mission active de révision",
                status="active",
                due_date=today_local() + timedelta(days=1),
            )
        )
        db.add(
            m.SpacedReviewCard(
                student_id=student.id,
                skill_id=skill.id,
                front_markdown="recto",
                back_markdown="verso",
                due_at=datetime.now(timezone.utc) - timedelta(days=1),
            )
        )
        db.commit()
    finally:
        db.close()

    _as_massimo()
    week_body = papa.get(f"{STUDENT}/week").text
    upcoming_body = papa.get(f"{STUDENT}/upcoming").text
    for body in (week_body, upcoming_body):
        assert "Mission active de révision" not in body
        assert "recto" not in body
    # Aucun item d'agenda n'existe : la bande est donc vide de points fixes.
    assert all(day["fixed_items"] == [] for day in papa.get(f"{STUDENT}/week").json()["days"])


# ── 8. Non probant : l'évidence ne bouge pas d'un iota (§3) ──────────────────────


def test_agenda_never_changes_evidence_outputs(papa: TestClient, client_db) -> None:
    """Test-verrou central de l'ADR. Créer et cocher des items ne change AUCUNE sortie de
    `evidence/service.py`, ne touche aucune carte SRS, ne crédite aucun XP.

    Cocher ne prouve rien, ne pas cocher ne prouve rien."""
    from app.modules.evidence import service as evidence

    _, SessionLocal = client_db

    def snapshot() -> tuple:
        db = SessionLocal()
        try:
            student = db.query(m.StudentProfile).first()
            return (
                evidence.mastery_by_skill(db, student_id=student.id),
                evidence.open_gaps(db, student_id=student.id),
                evidence.recent_verdicts(db, student_id=student.id),
                evidence.weighted_quiz_signal(db, student_id=student.id),
                evidence.srs_pressure(db, student_id=student.id),
                db.query(m.XPEvent).count(),
                db.query(m.SpacedReviewCard).count(),
                db.query(m.SkillMastery).count(),
            )
        finally:
            db.close()

    before = snapshot()
    first = _create_parent_item(papa)
    second = _create_parent_item(papa, kind="controle", label="Contrôle chapitre 3")
    _as_massimo()
    assert papa.post(f"{STUDENT}/items/{first['id']}/done").status_code == 200
    assert papa.post(f"{STUDENT}/items/{second['id']}/done").status_code == 200

    assert snapshot() == before


def test_no_missed_event_is_ever_emitted(papa: TestClient, client_db) -> None:
    """« L'absence n'est pas un événement » (§3). Un item passé jamais coché, puis décoché :
    le journal ne contient que `agenda_item_created` / `agenda_item_done`."""
    _, SessionLocal = client_db
    stale = _create_parent_item(
        papa, due_on=(today_local() - timedelta(days=10)).isoformat(), label="jamais fait"
    )
    fresh = _create_parent_item(papa)
    _as_massimo()
    papa.post(f"{STUDENT}/items/{fresh['id']}/done")
    papa.post(f"{STUDENT}/items/{fresh['id']}/undone")
    papa.get(f"{STUDENT}/week")

    db = SessionLocal()
    try:
        types = {row.event_type for row in db.query(m.LearningEvent).all()}
    finally:
        db.close()
    assert types <= {"agenda_item_created", "agenda_item_done"}
    assert not any("missed" in t or "undone" in t or "late" in t for t in types)
    assert stale["id"]  # l'item en retard existe bien, et n'a produit aucune trace


def test_agenda_events_stay_out_of_activity_projections(papa: TestClient, client_db) -> None:
    """Corollaire de §3 et du hors-périmètre : l'agenda ne remonte ni dans le dashboard, ni dans
    le Cahier de bord, ni dans les minutes actives. Cocher n'est pas travailler.

    La heatmap est désormais servie par l'agrégat du module `dashboard` (ADR-0028) : c'est donc
    lui qu'on interroge ici. Le piège reste le même, et il est déjà tombé trois fois — tout
    nouveau lecteur de `learning_events` doit exclure `NON_ACTIVITY_EVENTS`."""
    from app.modules.activity import service as activity
    from app.modules.dashboard import service as dashboard

    _, SessionLocal = client_db
    item = _create_parent_item(papa)
    _as_massimo()
    papa.post(f"{STUDENT}/items/{item['id']}/done")

    db = SessionLocal()
    try:
        student = db.query(m.StudentProfile).first()
        payload = dashboard.build_dashboard(db, student_id=student.id)
        detail = activity.day_detail(db, student_id=student.id, day=today_local())
    finally:
        db.close()

    assert all(subject["calendar"] == [] for subject in payload["subjects"])
    assert payload["periods"]["7"]["kpis"]["active_minutes"]["value"] == 0
    assert payload["unattributed_minutes"]["7"] == 0
    assert detail["events"] == []


# ── 9. Garde de rôle (ADR-0002) ──────────────────────────────────────────────────


def test_pilot_routes_require_parent(client_db) -> None:
    """Le rôle `child` (défaut du conftest) est refusé sur tout `/api/agenda/*`."""
    client, _ = client_db
    assert client.get(f"{PILOT}/items", params={"from": "2026-01-01", "to": "2026-12-31"}).status_code == 403
    assert client.post(f"{PILOT}/items", json={"items": []}).status_code == 403
    assert client.delete(f"{PILOT}/items/1").status_code == 403


# ── 12. Verrou de phase (§10) ────────────────────────────────────────────────────


def test_phase_lock_blocks_entry_but_never_the_checkbox(papa: TestClient) -> None:
    """Flag fermé : la SAISIE élève est en 403, mais cocher et masquer restent ouverts — sans
    eux l'objet n'aurait aucun état (Papa est en 403 sur `done_at`). Le verrou est SERVEUR :
    une UI cachée n'est pas une règle."""
    item = _create_parent_item(papa)
    _as_massimo()
    body = {"label": "recopié de l'ENT", "due_on": (today_local() + timedelta(days=1)).isoformat()}

    assert settings.agenda_student_entry_enabled is False
    assert papa.post(f"{STUDENT}/items", json=body).status_code == 403
    assert papa.patch(f"{STUDENT}/items/{item['id']}", json={"label": "x"}).status_code == 403
    # …mais la coche et le masquage passent.
    assert papa.post(f"{STUDENT}/items/{item['id']}/done").status_code == 200
    assert papa.post(f"{STUDENT}/items/{item['id']}/dismiss").status_code == 200

    settings.agenda_student_entry_enabled = True
    try:
        created = papa.post(f"{STUDENT}/items", json=body)
        assert created.status_code == 201
        assert created.json()["created_by"] == "student"
    finally:
        settings.agenda_student_entry_enabled = False


def test_phase_lock_is_toggled_by_papa_and_persists(papa: TestClient) -> None:
    """L'interrupteur est un **geste de Papa** (§10, règle 2), persisté en base : sans lui, la
    bascule demanderait d'éditer un `.env` et de redémarrer — ce n'est pas un geste.

    Tant qu'aucune ligne n'existe, c'est la variable d'environnement qui répond."""
    assert papa.get(f"{PILOT}/settings").json() == {"student_entry_enabled": False}

    opened = papa.put(f"{PILOT}/settings", json={"student_entry_enabled": True})
    assert opened.status_code == 200
    assert opened.json()["student_entry_enabled"] is True
    assert papa.get(f"{PILOT}/settings").json()["student_entry_enabled"] is True

    # …et la saisie élève s'ouvre réellement, sans toucher à la config du serveur.
    assert settings.agenda_student_entry_enabled is False
    _as_massimo()
    body = {"label": "Poésie à apprendre", "due_on": (today_local()).isoformat()}
    assert papa.post(f"{STUDENT}/items", json=body).status_code == 201

    # Refermer est possible : la bascule n'est pas un cliquet.
    app.dependency_overrides[get_current_user] = lambda: PAPA
    papa.put(f"{PILOT}/settings", json={"student_entry_enabled": False})
    _as_massimo()
    assert papa.post(f"{STUDENT}/items", json=body).status_code == 403


def test_student_cannot_edit_an_item_written_by_papa(papa: TestClient) -> None:
    """Phase 1 : Massimo édite SES items ; sur un item de Papa → 403 (§2a, symétrie du
    marqueur d'édition)."""
    item = _create_parent_item(papa)
    settings.agenda_student_entry_enabled = True
    try:
        _as_massimo()
        assert papa.patch(f"{STUDENT}/items/{item['id']}", json={"label": "nope"}).status_code == 403
    finally:
        settings.agenda_student_entry_enabled = False


# ── « Ce qui arrive » : bornes et nature (§6) ────────────────────────────────────


def test_upcoming_only_controls_and_hand_ins_bounded(papa: TestClient) -> None:
    today = today_local()
    _create_parent_item(papa, kind="devoir", label="devoir ordinaire")
    for index in range(6):
        _create_parent_item(
            papa,
            kind="controle",
            label=f"Contrôle {index}",
            due_on=(today + timedelta(days=index + 1)).isoformat(),
        )
    _create_parent_item(
        papa, kind="controle", label="Trop loin", due_on=(today + timedelta(days=60)).isoformat()
    )

    _as_massimo()
    rows = papa.get(f"{STUDENT}/upcoming").json()
    assert len(rows) == settings.agenda_upcoming_max
    assert all(row["label"].startswith("Contrôle") for row in rows)
    assert all(row["has_plan"] is False for row in rows)
    assert [row["days_left"] for row in rows] == sorted(row["days_left"] for row in rows)
    assert "Trop loin" not in [row["label"] for row in rows]


def test_upcoming_exclut_la_lecon_a_apprendre(papa: TestClient) -> None:
    """⚠️ VERROU addendum §14.3 — `lecon` DÉCLENCHE la production mais n'entre PAS ici.

    C'est le premier `kind` dans ce cas, et la dissymétrie est voulue : `UpcomingItemOut` ne porte
    aucun champ `kind`, donc « contrôle jeudi » et « leçon pour demain » s'afficheraient sous une
    forme identique pour deux gravités différentes — et la section, plafonnée à 4, verrait les
    leçons chasser les contrôles.
    """
    today = today_local()
    _create_parent_item(
        papa, kind="lecon", label="Leçon à apprendre", due_on=(today + timedelta(days=1)).isoformat()
    )
    _create_parent_item(
        papa, kind="controle", label="Contrôle", due_on=(today + timedelta(days=3)).isoformat()
    )

    _as_massimo()
    rows = papa.get(f"{STUDENT}/upcoming").json()
    assert [row["label"] for row in rows] == ["Contrôle"]


def _seed_deux_chapitres(client_db) -> tuple[int, int, int]:
    """Deux chapitres, une leçon dans le premier. Rend `(chapitre_a, chapitre_b, lecon_a)`."""
    _, Session = client_db
    with Session() as db:
        # ⚠️ `Chapter` n'a PAS de `subject_id` : il se rattache par `theme_id` (place pédagogique)
        # ou `school_year_subject_id` (ancrage temporel), les deux nullables. Ni l'un ni l'autre
        # n'est nécessaire ici — la garde du §15 ne regarde que le couple leçon/chapitre.
        a = m.Chapter(name="La phrase complexe")
        b = m.Chapter(name="Le récit")
        db.add_all([a, b])
        db.flush()
        lecon = m.Lesson(chapter_id=a.id, title="Juxtaposition et coordination", created_by="parent")
        db.add(lecon)
        db.commit()
        return a.id, b.id, lecon.id


def test_une_lecon_hors_du_chapitre_est_refusee_en_422(papa: TestClient, client_db) -> None:
    """⚠️ VERROU §15 — une leçon étrangère au chapitre produirait un lien qui dépose Massimo
    au hasard. Mieux vaut un 422 franc qu'une adresse fausse.

    Le cas se produit sans mauvaise volonté : Papa choisit un intitulé dans la liste d'un
    chapitre, **puis change de chapitre**. Le front efface la leçon ; un client qui l'oublierait
    est arrêté ici.
    """
    chapitre_a, chapitre_b, lecon_a = _seed_deux_chapitres(client_db)

    ok = papa.post(
        f"{PILOT}/items",
        json={
            "items": [
                {
                    "label": "Juxtaposition et coordination",
                    "due_on": (today_local() + timedelta(days=2)).isoformat(),
                    "chapter_id": chapitre_a,
                    "lesson_id": lecon_a,
                }
            ]
        },
    )
    assert ok.status_code == 201, ok.text

    refuse = papa.post(
        f"{PILOT}/items",
        json={
            "items": [
                {
                    "label": "Juxtaposition et coordination",
                    "due_on": (today_local() + timedelta(days=2)).isoformat(),
                    "chapter_id": chapitre_b,  # ← l'autre chapitre
                    "lesson_id": lecon_a,
                }
            ]
        },
    )
    assert refuse.status_code == 422, refuse.text


def test_changer_de_chapitre_seul_ne_laisse_pas_une_lecon_perimee(
    papa: TestClient, client_db
) -> None:
    """Le contrôle porte sur l'état RÉSULTANT, pas sur le corps du PATCH.

    Papa ne patche QUE le chapitre : la leçon posée plus tôt devient périmée. Lire seulement
    `data` laisserait passer exactement ce cas — celui qui produit le lien faux.
    """
    chapitre_a, chapitre_b, lecon_a = _seed_deux_chapitres(client_db)
    item = _create_parent_item(papa, chapter_id=chapitre_a, lesson_id=lecon_a)

    refuse = papa.patch(f"{PILOT}/items/{item['id']}", json={"chapter_id": chapitre_b})
    assert refuse.status_code == 422, refuse.text

    # Le geste correct — changer les deux ensemble — passe.
    ok = papa.patch(
        f"{PILOT}/items/{item['id']}", json={"chapter_id": chapitre_b, "lesson_id": None}
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["lesson_id"] is None


def test_massimo_recoit_de_quoi_ouvrir_son_cours(papa: TestClient, client_db) -> None:
    """§15 — `lesson_id` et `chapter_id` sont servis à Massimo : ce sont des ADRESSES.

    ⚠️ Et rien d'autre ne s'ouvre au passage : `parent_note`, `dismissed_at` et les horodatages
    restent absents de sa frontière, sans exception.
    """
    chapitre_a, _, lecon_a = _seed_deux_chapitres(client_db)
    _create_parent_item(
        papa,
        due_on=today_local().isoformat(),
        chapter_id=chapitre_a,
        lesson_id=lecon_a,
        parent_note="à surveiller",
    )

    _as_massimo()
    today = today_local()
    rows = papa.get(
        f"{STUDENT}/items", params={"from": today.isoformat(), "to": today.isoformat()}
    ).json()
    assert rows[0]["lesson_id"] == lecon_a
    assert rows[0]["chapter_id"] == chapitre_a
    for interdit in ("parent_note", "dismissed_at", "created_at", "edited_by_parent_at"):
        assert interdit not in rows[0], f"{interdit} a fuité dans la frontière élève"


def test_une_lecon_se_saisit_se_corrige_et_se_coche(papa: TestClient) -> None:
    """Le 4ᵉ type n'introduit AUCUNE branche : il vit comme les trois autres."""
    item = _create_parent_item(papa, kind="lecon", label="Le passé composé")
    assert item["kind"] == "lecon"

    patched = papa.patch(f"{PILOT}/items/{item['id']}", json={"kind": "controle"})
    assert patched.status_code == 200
    assert patched.json()["kind"] == "controle"

    _as_massimo()
    assert papa.post(f"{STUDENT}/items/{item['id']}/done").status_code == 200


def test_upcoming_drops_done_and_dismissed(papa: TestClient) -> None:
    item = _create_parent_item(papa, kind="controle", label="Contrôle SVT")
    _as_massimo()
    assert len(papa.get(f"{STUDENT}/upcoming").json()) == 1
    papa.post(f"{STUDENT}/items/{item['id']}/done")
    assert papa.get(f"{STUDENT}/upcoming").json() == []


# ── Traces : un compte grossier, plafonné, sans réceptacle vide (§7) ─────────────


def test_traces_are_capped_and_count_natures_not_volume(papa: TestClient, client_db) -> None:
    """Une rafale de révision vaut UNE matière, pas 12. Un comptage grossier et généreux,
    surtout pas une mesure d'effort.

    🔴 **Adapté par l'Amendement 8 §D2** : `traces` était un `int`, c'est désormais la LISTE des
    matières travaillées. La règle testée n'a pas changé d'un pouce — une rafale vaut 1 — mais
    l'unité est passée du *nombre de natures* au *nom de la matière*, parce que trois points
    verts ne disaient rien de ce qui avait été fait.
    """
    _, SessionLocal = client_db
    db = SessionLocal()
    try:
        student = db.query(m.StudentProfile).first()
        subject = db.query(m.Subject).first()
        # ⚠️ Le NOM est capturé DANS la session : après `db.close()`, l'instance est détachée et
        # tout accès d'attribut lève `DetachedInstanceError`. Piège tombé à l'écriture.
        subject_name = subject.name
        yesterday = datetime.now(timezone.utc) - timedelta(days=1)
        for index in range(12):
            db.add(
                m.LearningEvent(
                    student_id=student.id,
                    subject_id=subject.id,
                    event_type="review_attempted",
                    created_at=yesterday + timedelta(minutes=index),
                )
            )
        # La navigation n'est pas une activité : elle ne doit allumer aucune trace.
        db.add(
            m.LearningEvent(
                student_id=student.id, event_type="page_viewed", created_at=yesterday
            )
        )
        db.commit()
    finally:
        db.close()

    _as_massimo()
    band = papa.get(f"{STUDENT}/week").json()
    by_offset = {day["offset"]: day for day in band["days"]}
    # Douze événements, UNE matière — le volume ne se voit pas, et c'est le point.
    assert [t["name"] for t in by_offset[-1]["traces"]] == [subject_name]
    # « [] » et « pas de donnée » sont le même état (§7) : le jour d'avant n'a rien eu.
    assert by_offset[-2]["traces"] == []
    # ⚠️ Aucune quantité ne doit jamais apparaître dans une trace.
    assert set(by_offset[-1]["traces"][0]) == {"slug", "name", "color"}


def test_traces_are_capped_by_setting(papa: TestClient, client_db) -> None:
    """Le plafond survit au changement d'unité : il borne la hauteur de la cellule, pas l'effort."""
    _, SessionLocal = client_db
    db = SessionLocal()
    try:
        student = db.query(m.StudentProfile).first()
        # ⚠️ Le test CRÉE ses matières au lieu de les emprunter à la fixture : la version
        # empruntée se `skip`ait faute d'en trouver assez, et **un test sauté ne prouve rien**.
        # Le plafond ne se vérifie qu'en le dépassant.
        surplus = settings.agenda_traces_cap + 2
        subject_ids = []
        for index in range(surplus):
            subject = m.Subject(name=f"Matière {index}", slug=f"matiere-test-{index}")
            db.add(subject)
            db.flush()
            subject_ids.append(subject.id)
        yesterday = datetime.now(timezone.utc) - timedelta(days=1)
        for index, subject_id in enumerate(subject_ids):
            db.add(
                m.LearningEvent(
                    student_id=student.id,
                    subject_id=subject_id,
                    event_type="quiz_attempted",
                    created_at=yesterday + timedelta(minutes=index),
                )
            )
        db.commit()
    finally:
        db.close()

    _as_massimo()
    band = papa.get(f"{STUDENT}/week").json()
    by_offset = {day["offset"]: day for day in band["days"]}
    assert len(by_offset[-1]["traces"]) == settings.agenda_traces_cap


def test_une_activite_sans_matiere_reste_une_trace(papa: TestClient, client_db) -> None:
    """🔴 **Test-verrou né d'une MESURE, pas d'une intuition.**

    La première écriture de `trace_subjects_by_day` filtrait `subject_id IS NOT NULL`, au motif
    qu'une trace anonyme serait « un réceptacle déguisé ». Comptage sur la base de dev :
    **44 des 48 `chat_tool_response` n'ont aucune matière**, et **1 jour travaillé sur 20**
    perdait toute trace. C'était réintroduire, par la porte de derrière, le défaut même que
    l'Amendement 8 corrige — une page qui sous-déclare ce que Massimo a fait.

    ⚠️ Un réceptacle est une case **éteinte** qui attend d'être remplie ; ceci est une marque
    **allumée** sans nom de matière. Les deux ne se ressemblent que sur le papier.
    """
    _, SessionLocal = client_db
    db = SessionLocal()
    try:
        student = db.query(m.StudentProfile).first()
        yesterday = datetime.now(timezone.utc) - timedelta(days=1)
        db.add(
            m.LearningEvent(
                student_id=student.id,
                subject_id=None,
                event_type="chat_tool_response",
                created_at=yesterday,
            )
        )
        db.commit()
    finally:
        db.close()

    _as_massimo()
    band = papa.get(f"{STUDENT}/week").json()
    trace = {day["offset"]: day for day in band["days"]}[-1]["traces"]
    assert len(trace) == 1, "le jour ne disparaît pas"
    assert trace[0]["slug"] is None and trace[0]["name"] is None
    # Aucune couleur de repli : inventer une teinte inventerait une matière.
    assert trace[0]["color"] is None


# ── 9. Le watermark de nouveauté ne fuit nulle part (addendum §12.3) ─────────────


def test_agenda_last_seen_at_never_leaks(papa: TestClient) -> None:
    """`agenda_last_seen_at` est la trace du REGARD de Massimo. Elle ne sort d'aucune route.

    Symétrique exact de `parent_note` : là c'est Papa qui écrit et Massimo qui ne doit pas lire,
    ici c'est Massimo qui écrit et Papa qui ne doit pas lire. Le motif est le même dans les deux
    sens — l'asymétrie de visibilité du §2c serait une surveillance par la porte de service, et
    « vu le 12, jamais fait » est précisément l'objet que l'addendum §12.3 refuse de fabriquer.

    Assertion sur le JSON SÉRIALISÉ et sur les schémas : un champ présent dans la réponse réseau
    est un champ exposé, quoi qu'en fasse l'UI.
    """
    from app.modules.agenda.schemas import AgendaItemPilotOut, AgendaItemStudentOut

    # a) Les schémas de sortie ne le portent pas — ni côté Papa, ni côté Massimo.
    assert "agenda_last_seen_at" not in AgendaItemPilotOut.model_fields
    assert "agenda_last_seen_at" not in AgendaItemStudentOut.model_fields

    item = _create_parent_item(papa)
    today = today_local()
    window = {
        "from": (today - timedelta(days=30)).isoformat(),
        "to": (today + timedelta(days=30)).isoformat(),
    }

    # b) Massimo pose le watermark, puis on balaie TOUTES les sorties des deux interfaces.
    _as_massimo()
    assert papa.post(f"{STUDENT}/seen").status_code == 204

    bodies = [
        papa.get(f"{STUDENT}/week").text,
        papa.get(f"{STUDENT}/upcoming").text,
        papa.get(f"{STUDENT}/items", params=window).text,
        papa.post(f"{STUDENT}/items/{item['id']}/done").text,
        papa.get("/api/student/news/summary").text,
    ]
    app.dependency_overrides[get_current_user] = lambda: PAPA
    bodies += [
        papa.get(f"{PILOT}/items", params=window).text,
        papa.get(f"{PILOT}/settings").text,
        papa.patch(f"{PILOT}/items/{item['id']}", json={"label": "DM révisé"}).text,
        papa.put(f"{PILOT}/items/{item['id']}/note", json={"parent_note": "vu"}).text,
    ]
    for body in bodies:
        assert "agenda_last_seen_at" not in body
        assert "last_seen" not in body

    # c) Le témoin sort en NOMBRE, jamais en date : c'est ce qui le rend non traçable.
    _as_massimo()
    summary = papa.get("/api/student/news/summary").json()
    assert isinstance(summary["agenda"], int)


def test_only_massimo_writes_the_watermark(papa: TestClient) -> None:
    """Le regard est un geste de Massimo : aucune route Papa ne pose le watermark.

    Vérifié sur le SOURCE du routeur, parce que la fuite qu'on redoute n'est pas une réponse
    HTTP mais un appel ajouté au mauvais endroit — invisible dans les payloads.
    """
    import inspect

    from app.modules.agenda import router as agenda_router

    source = inspect.getsource(agenda_router)
    assert source.count("mark_agenda_seen") == 1, "un second appelant est apparu : le vérifier"
    # La section Papa du routeur commence à ce séparateur ; l'unique appel doit être AVANT.
    assert source.index("mark_agenda_seen") < source.index("# ── Papa")

    # Et la route n'existe pas sous le préfixe Papa.
    assert papa.post(f"{PILOT}/seen").status_code == 404


# ── Amendement 8 — « Ce que tu as travaillé » : raconter sans jamais mesurer ─────


# Les champs qui font d'un récit une mesure. Un seul suffit à transformer une surface d'enfant
# en chronomètre — et c'est très exactement l'interdiction que l'Amendement 8 §R4 a BORNÉE
# plutôt que levée : les natures et les matières remontent, jamais les quantités.
CHAMPS_DE_MESURE = {"minutes", "xp", "time", "score_percent", "count", "duration", "total"}


def test_day_traces_ne_sert_aucune_mesure(papa: TestClient, client_db) -> None:
    """🔴 **Test-verrou sur le JSON SÉRIALISÉ, pas sur la définition du schéma.**

    Un champ présent dans la réponse réseau est un champ exposé, quoi qu'en fasse l'UI. C'est la
    même jurisprudence que `parent_note` : la frontière se vérifie sur ce qui sort du serveur.

    ⚠️ Le danger précis qu'il garde : `activity.service.day_detail` rend exactement la même
    question (« qu'a fait Massimo ce jour-là ? ») **avec** `time`, `minutes`, `xp` et
    `score_percent`. Router cette route vers lui « en filtrant côté client » est le raccourci
    qui se présentera un jour comme une simplification.
    """
    _, SessionLocal = client_db
    db = SessionLocal()
    try:
        student = db.query(m.StudentProfile).first()
        subject = db.query(m.Subject).first()
        skill = db.query(m.Skill).first()
        # Capturés DANS la session (cf. piège du `DetachedInstanceError` plus haut).
        subject_name, skill_name, skill_id = subject.name, skill.name, skill.id
        hier = datetime.now(timezone.utc) - timedelta(days=1)
        for event_type in ("lesson_viewed", "quiz_attempted", "review_attempted"):
            db.add(
                m.LearningEvent(
                    student_id=student.id,
                    subject_id=subject.id,
                    skill_id=skill.id,
                    event_type=event_type,
                    created_at=hier,
                    payload_json={"xp": 20, "score_percent": 80, "minutes": 12},
                )
            )
        db.commit()
        # 🔴 `local_day`, JAMAIS `hier.date()`. L'événement est stocké en UTC ; la route le range
        # dans un jour **Europe/Paris** (`range_bounds_utc`). Entre minuit et 2 h locales, les deux
        # dates diffèrent : l'événement tombait hors des bornes du jour demandé et `subjects` était
        # vide — `IndexError`. Ces quatre tests étaient donc **rouges 2 h par jour et verts 22**.
        #
        # ⚠️ La CI ne pouvait pas l'attraper : ses runners tournent en UTC, où jour local = jour
        # UTC. Ce défaut n'existe QUE sur une machine en avance sur UTC.
        #
        # ⚠️ `astimezone()` nu ne suffirait pas non plus : il prendrait le fuseau de la MACHINE.
        # `local_day` prend celui de l'APP (`settings.activity_timezone`), qui est ce que la route
        # utilise. Le test doit dater comme l'application date.
        #
        # 📌 `test_agenda_plan.py` documentait déjà ce piège — « un verrou qui ne mord que deux
        # heures sur vingt-quatre n'est pas un verrou, c'est une loterie ». La leçon n'avait pas
        # voyagé jusqu'ici.
        jour = local_day(hier).isoformat()
    finally:
        db.close()

    _as_massimo()
    reponse = papa.get(f"{STUDENT}/days/{jour}/traces")
    assert reponse.status_code == 200
    charge = reponse.json()

    # Le payload d'origine PORTAIT xp / score_percent / minutes : la preuve que le filtre est
    # bien celui du schéma, et pas un hasard de données pauvres.
    brut = reponse.text
    for champ in CHAMPS_DE_MESURE:
        assert f'"{champ}"' not in brut, f"« {champ} » a fui dans la réponse élève"

    assert charge["date"] == jour
    matiere = charge["subjects"][0]
    assert set(matiere) == {"slug", "name", "color", "notions", "forms"}
    assert matiere["name"] == subject_name
    # 🔴 `{id, name}` et non le nom seul : l'`id` est ce qui rend la notion CLIQUABLE
    # (Amdt 8 §D10). Sans lui, le bloc racontait à Massimo ce qu'il avait fait sans lui
    # laisser aucun moyen d'y revenir.
    assert matiere["notions"] == [{"id": skill_id, "name": skill_name}]
    # Ordre DOCTRINAL, jamais par fréquence : lire → s'exercer → consolider.
    assert matiere["forms"] == ["Cours lu", "Quiz", "Révision SRS"]


def test_day_traces_ne_compte_pas_le_volume(papa: TestClient, client_db) -> None:
    """Douze révisions rendent UNE forme, pas douze. Le récit ne compte pas."""
    _, SessionLocal = client_db
    db = SessionLocal()
    try:
        student = db.query(m.StudentProfile).first()
        subject = db.query(m.Subject).first()
        hier = datetime.now(timezone.utc) - timedelta(days=1)
        for index in range(12):
            db.add(
                m.LearningEvent(
                    student_id=student.id,
                    subject_id=subject.id,
                    event_type="review_attempted",
                    created_at=hier + timedelta(minutes=index),
                )
            )
        db.commit()
        jour = local_day(hier).isoformat()
    finally:
        db.close()

    _as_massimo()
    charge = papa.get(f"{STUDENT}/days/{jour}/traces").json()
    assert charge["subjects"][0]["forms"] == ["Révision SRS"]


def test_day_traces_ignore_la_navigation_et_les_coches(papa: TestClient, client_db) -> None:
    """🔴 **Cocher un devoir ne fabrique JAMAIS une trace** (§3, préservé par l'Amdt 8 §B4).

    Le filtre est `NON_WORK_EVENTS` et surtout pas `NON_ACTIVITY_EVENTS` : avec la seconde,
    `login` et `page_viewed` compteraient, et **ouvrir la page allumerait une trace**.
    """
    _, SessionLocal = client_db
    db = SessionLocal()
    try:
        student = db.query(m.StudentProfile).first()
        subject = db.query(m.Subject).first()
        hier = datetime.now(timezone.utc) - timedelta(days=1)
        for event_type in ("login", "page_viewed", "agenda_item_done", "agenda_item_created"):
            db.add(
                m.LearningEvent(
                    student_id=student.id,
                    subject_id=subject.id,
                    event_type=event_type,
                    created_at=hier,
                )
            )
        db.commit()
        jour = local_day(hier).isoformat()
    finally:
        db.close()

    _as_massimo()
    charge = papa.get(f"{STUDENT}/days/{jour}/traces").json()
    assert charge["subjects"] == [], "naviguer et cocher ne sont pas du travail"


def test_un_soir_tardif_appartient_au_jour_LOCAL_pas_au_jour_UTC(papa: TestClient, client_db) -> None:
    """🔴 Le verrou qui mord à N'IMPORTE QUELLE HEURE — instant FIGÉ, jamais `now()`.

    Le 2026-08-22 à 00 h 57, quatre tests de ce fichier sont tombés en `IndexError`. Ils dataient
    l'événement avec `hier.date()`, la date **UTC** — alors que la route range dans un jour
    **Europe/Paris** (`range_bounds_utc`). Entre minuit et 2 h locales, les deux diffèrent :
    l'événement sortait des bornes du jour demandé.

    ⚠️ **Ils étaient donc rouges 2 h par jour et verts 22**, et la CI ne pouvait rien voir : ses
    runners tournent en UTC, où jour local = jour UTC. Corriger les quatre ne suffit pas — sans ce
    test-ci, la même faute reviendrait et resterait invisible 22 h sur 24.

    📌 Le fichier voisin l'avait déjà écrit, pour le défaut symétrique :
    *« un verrou qui ne mord que deux heures sur vingt-quatre n'est pas un verrou, c'est une
    loterie »* (`test_agenda_plan.py`). La leçon n'avait pas voyagé ; ce test la fait voyager.

    L'instant est **figé** au 15 juillet 22 h 30 UTC — soit le **16** juillet 00 h 30 à Paris.
    Rien ici ne dépend de l'heure du lancement.
    """
    tard = datetime(2026, 7, 15, 22, 30, tzinfo=timezone.utc)
    jour_utc, jour_local = tard.date().isoformat(), local_day(tard).isoformat()
    assert jour_utc != jour_local, "l'instant choisi doit justement enjamber la frontière"

    _, SessionLocal = client_db
    db = SessionLocal()
    try:
        student = db.query(m.StudentProfile).first()
        subject = db.query(m.Subject).first()
        db.add(
            m.LearningEvent(
                student_id=student.id,
                subject_id=subject.id,
                event_type="lesson_viewed",
                created_at=tard,
            )
        )
        db.commit()
    finally:
        db.close()

    _as_massimo()
    # 🔴 Il appartient au jour LOCAL…
    assert papa.get(f"{STUDENT}/days/{jour_local}/traces").json()["subjects"], (
        f"un événement du {tard.isoformat()} doit se lire au {jour_local} (Europe/Paris)"
    )
    # …et à lui SEUL. C'est cette moitié-ci qui tombe si quelqu'un revient à `.date()`.
    assert papa.get(f"{STUDENT}/days/{jour_utc}/traces").json()["subjects"] == [], (
        f"il ne doit PAS se lire au {jour_utc}, qui n'est que sa date UTC"
    )


def test_day_traces_sans_notion_rend_la_matiere_seule(papa: TestClient, client_db) -> None:
    """La ligne de notion SAUTE quand l'événement n'en porte pas — la matière reste une réponse.

    ⚠️ C'est le repli du constat §D2 : `Skill` n'a aucun `chapter_id`, donc on rend la NOTION ;
    et un événement sans `skill_id` n'a même pas de notion. Il ne disparaît pas pour autant.
    """
    _, SessionLocal = client_db
    db = SessionLocal()
    try:
        student = db.query(m.StudentProfile).first()
        subject = db.query(m.Subject).first()
        hier = datetime.now(timezone.utc) - timedelta(days=1)
        db.add(
            m.LearningEvent(
                student_id=student.id,
                subject_id=subject.id,
                skill_id=None,
                event_type="fiche_viewed",
                created_at=hier,
            )
        )
        db.commit()
        jour = local_day(hier).isoformat()
    finally:
        db.close()

    _as_massimo()
    charge = papa.get(f"{STUDENT}/days/{jour}/traces").json()
    assert charge["subjects"][0]["notions"] == []
    assert charge["subjects"][0]["forms"] == ["Fiche de révision"]


def test_les_deux_evenements_de_chat_ne_font_qu_un_libelle(papa: TestClient, client_db) -> None:
    """`chat_topic` et `chat_tool_response` rendent le MÊME libellé : il ne doit pas doubler.

    Le dédoublonnage se fait sur le libellé, pas sur le type d'événement — c'est le piège que
    ce test verrouille.
    """
    _, SessionLocal = client_db
    db = SessionLocal()
    try:
        student = db.query(m.StudentProfile).first()
        subject = db.query(m.Subject).first()
        hier = datetime.now(timezone.utc) - timedelta(days=1)
        for event_type in ("chat_topic", "chat_tool_response"):
            db.add(
                m.LearningEvent(
                    student_id=student.id,
                    subject_id=subject.id,
                    event_type=event_type,
                    created_at=hier,
                )
            )
        db.commit()
        jour = local_day(hier).isoformat()
    finally:
        db.close()

    _as_massimo()
    charge = papa.get(f"{STUDENT}/days/{jour}/traces").json()
    assert charge["subjects"][0]["forms"] == ["Conversation avec ZETIS"]


def test_month_rend_le_mois_et_ses_bornes(papa: TestClient) -> None:
    """La grille mois : 28 à 31 jours, et des bornes de navigation qui DISPARAISSENT (§14.6)."""
    _as_massimo()
    charge = papa.get(f"{STUDENT}/month", params={"anchor": "2026-02"}).json()
    assert charge["anchor"] == "2026-02"
    assert len(charge["days"]) == 28, "février 2026 : 28 jours, pas 42"
    assert charge["days"][0]["date"] == "2026-02-01"
    assert charge["days"][-1]["date"] == "2026-02-28"

    # Loin dans le futur : plus de chevron avant. Loin dans le passé : plus de chevron arrière.
    futur = papa.get(f"{STUDENT}/month", params={"anchor": "2030-01"}).json()
    assert futur["next_anchor"] is None
    passe = papa.get(f"{STUDENT}/month", params={"anchor": "2000-01"}).json()
    assert passe["prev_anchor"] is None


def test_month_garde_l_asymetrie_des_plans_sur_le_passe(papa: TestClient) -> None:
    """La grille mois n'est pas une porte dérobée : les règles de la bande valent pour elle.

    Un jour passé porte ses échéances (§R3) mais **jamais** d'étape de plan — une étape qu'on
    ne peut plus faire est un reproche, pas une aide.
    """
    today = today_local()
    _create_parent_item(papa, due_on=(today - timedelta(days=1)).isoformat(), label="hier")

    _as_massimo()
    charge = papa.get(f"{STUDENT}/month", params={"anchor": today.strftime("%Y-%m")}).json()
    par_date = {day["date"]: day for day in charge["days"]}
    hier = par_date.get((today - timedelta(days=1)).isoformat())
    if hier is not None:  # le 1er du mois, « hier » est dans le mois précédent
        assert [i["label"] for i in hier["fixed_items"]] == ["hier"]
        assert hier["plan_steps"] == []


def test_month_ne_sert_pas_les_jours_des_mois_voisins(papa: TestClient) -> None:
    """Les cellules d'alignement sont fabriquées CLIENT, et rendues totalement vides.

    Les servir en gris importerait dans le champ de vision les trous d'un mois qu'on ne regarde
    pas — et un jour gris à moitié éteint est exactement ce que le §7 refuse.
    """
    _as_massimo()
    charge = papa.get(f"{STUDENT}/month", params={"anchor": "2026-08"}).json()
    mois = {day["date"][:7] for day in charge["days"]}
    assert mois == {"2026-08"}


# ── 15. « Prendre de l'avance » — la troisième question (Amdt 9) ─────────────────
#
# 🔴 **Le bloc est ANCRÉ, pas inventorié.** Il part de la prochaine échéance et propose les gestes
# qui la préparent. La forme alternative (quatre listes, une par source) a été écartée parce que
# quatre listes de choses à faire GROSSISSENT quand Massimo ne vient pas — c'est la définition du
# compteur d'arriéré que le §7 interdit. Ces tests verrouillent les deux moitiés : ce que le bloc
# rend, et surtout ce qu'il ne rend jamais.

AHEAD = f"{STUDENT}/ahead"

#: Tout ce qu'un geste a le droit de porter. **Liste FERMÉE, et c'est le verrou** : un champ qui
#: arrive sans passer par ici (`due_count`, `session_size`, `score`, `days_left`, `minutes`, `xp`)
#: est une quantité qui a franchi la frontière.
CLES_GESTE = {"kind", "detail", "mindmap_id", "skill_id"}
CLES_ANCRE = {"item_id", "label", "kind", "due_on", "subject", "chapter_id", "lesson_id"}


def _chapitre_avec_lecon(db, *, nom="Fractions", statut_lecon="validated"):
    """Chapitre → leçon → notion, le minimum pour qu'un geste ait une cible."""
    subject = db.query(m.Subject).first()
    chapter = m.Chapter(name=nom)
    db.add(chapter)
    db.flush()
    lesson = m.Lesson(
        chapter_id=chapter.id, title=f"Cours — {nom}", status=statut_lecon, created_by="parent"
    )
    db.add(lesson)
    db.flush()
    skill = m.Skill(subject_id=subject.id, name=f"Notion {nom}", level="4e")
    db.add(skill)
    db.flush()
    db.add(m.LessonSkill(lesson_id=lesson.id, skill_id=skill.id))
    db.commit()
    return chapter.id, lesson.id, skill.id


def test_ahead_repond_meme_sans_echeance(papa: TestClient) -> None:
    """🔴 Sans échéance à venir, le bloc RÉPOND — il ne disparaît pas.

    C'est la leçon du toast muet du 2026-08-17 : un vide CONFIRMÉ est une réponse, un silence
    n'en est pas une. Un bloc qui s'évapore se lit comme une panne.
    """
    _as_massimo()
    charge = papa.get(AHEAD)
    assert charge.status_code == 200, charge.text
    assert charge.json()["anchor"] is None
    # Et ce n'est pas un réceptacle (§B1) : pas de gestes fantômes sans cible.
    assert charge.json()["gestes"] == []


def test_ahead_ancre_sur_la_prochaine_echeance(papa: TestClient) -> None:
    today = today_local()
    _create_parent_item(papa, due_on=(today + timedelta(days=5)).isoformat(), label="loin")
    _create_parent_item(papa, due_on=(today + timedelta(days=2)).isoformat(), label="proche")
    # Aujourd'hui a déjà sa section « Aujourd'hui » : le bloc ne redit pas ce qui est au-dessus.
    _create_parent_item(papa, due_on=today.isoformat(), label="aujourd'hui")

    _as_massimo()
    ancre = papa.get(AHEAD).json()["anchor"]
    assert ancre["label"] == "proche"


def test_ahead_donne_la_priorite_au_controle(papa: TestClient) -> None:
    """Un contrôle se prépare sur plusieurs jours et ne se rattrape pas la veille — il prime,
    même sur un devoir plus proche."""
    today = today_local()
    _create_parent_item(papa, due_on=(today + timedelta(days=1)).isoformat(), label="devoir")
    _create_parent_item(
        papa, due_on=(today + timedelta(days=6)).isoformat(), label="contrôle", kind="controle"
    )

    _as_massimo()
    assert papa.get(AHEAD).json()["anchor"]["label"] == "contrôle"


def test_ahead_ne_porte_AUCUNE_quantite(papa: TestClient, client_db) -> None:
    """🔴 VERROU §D3 de l'Amendement 9 — aucun nombre, sur la RÉPONSE sérialisée.

    Deux pièges sont documentés dans le code qu'ils concernent, et ce test les tient tous deux :
    `due_count` est l'arriéré des cartes (`memory/schemas.py` dit lui-même de ne jamais le
    montrer), et `days_left` est le décompte chiffré que §D8 a retiré de la page.

    ⚠️ **Ce que ce verrou attrape, et ce qu'il n'attrape pas — vérifié par sabotage, et ma
    première rédaction se trompait.** J'avais écrit qu'il tiendrait « un champ ajouté à un dict de
    service ». C'est **faux** : `response_model` filtre la sortie, donc une quantité ajoutée au
    dict de `ahead()` n'atteint jamais la réponse — sabotage joué, resté VERT. Le verrou porte
    donc là où la fuite est réellement possible : **le schéma**. Sabotage rejoué en ajoutant
    `days_left` à `AheadAnchorOut` — rouge. C'est la bonne frontière, mais il fallait la nommer
    juste : un test qui ne dit pas ce qu'il garde finit par garder autre chose.
    """
    _, SessionLocal = client_db
    db = SessionLocal()
    try:
        chapter_id, _, _ = _chapitre_avec_lecon(db)
    finally:
        db.close()
    _create_parent_item(
        papa,
        due_on=(today_local() + timedelta(days=3)).isoformat(),
        label="contrôle de fractions",
        kind="controle",
        chapter_id=chapter_id,
    )

    _as_massimo()
    charge = papa.get(AHEAD).json()
    assert set(charge) == {"anchor", "gestes"}
    assert set(charge["anchor"]) == CLES_ANCRE
    for geste in charge["gestes"]:
        assert set(geste) == CLES_GESTE, geste
    corps = papa.get(AHEAD).text
    for interdit in ("days_left", "due_count", "session_size", "count", "total", "score",
                     "minutes", "xp", "mastery"):
        assert interdit not in corps, interdit


def test_ahead_ne_sert_un_geste_que_si_sa_cible_existe(papa: TestClient, client_db) -> None:
    """🔴 §B6 — *« un bouton mort se lit comme une panne »*, et c'est le SERVEUR qui tranche.

    Un chapitre sans mindmap, sans carte et sans mission ne doit produire aucune porte.
    """
    _, SessionLocal = client_db
    db = SessionLocal()
    try:
        chapter_id, _, _ = _chapitre_avec_lecon(db, nom="Chapitre nu")
    finally:
        db.close()
    _create_parent_item(
        papa,
        due_on=(today_local() + timedelta(days=3)).isoformat(),
        label="contrôle",
        kind="controle",
        chapter_id=chapter_id,
    )

    _as_massimo()
    kinds = {g["kind"] for g in papa.get(AHEAD).json()["gestes"]}
    assert "mindmap" not in kinds
    assert "revision" not in kinds
    assert "mission" not in kinds


def test_ahead_sert_la_mindmap_DU_chapitre(papa: TestClient, client_db) -> None:
    _, SessionLocal = client_db
    db = SessionLocal()
    try:
        chapter_id, lesson_id, _ = _chapitre_avec_lecon(db)
        autre_chapitre, autre_lecon, _ = _chapitre_avec_lecon(db, nom="Autre")
        db.add(
            m.Mindmap(
                lesson_id=lesson_id,
                validation_status="validated",
                mindmap_json={"center": "Les fractions"},
            )
        )
        db.add(
            m.Mindmap(
                lesson_id=autre_lecon,
                validation_status="validated",
                mindmap_json={"center": "Hors sujet"},
            )
        )
        db.commit()
    finally:
        db.close()
    _create_parent_item(
        papa,
        due_on=(today_local() + timedelta(days=3)).isoformat(),
        label="contrôle",
        kind="controle",
        chapter_id=chapter_id,
    )

    _as_massimo()
    gestes = {g["kind"]: g for g in papa.get(AHEAD).json()["gestes"]}
    assert gestes["mindmap"]["detail"] == "Les fractions"
    assert gestes["mindmap"]["mindmap_id"] is not None


def test_ahead_renforce_une_notion_fragile_sans_jamais_dire_son_score(
    papa: TestClient, client_db
) -> None:
    """🔴 `to_reinforce` vit derrière `require_parent` et porte `severity` / `mastery_score` —
    aucun de ces champs n'a le droit d'atteindre Massimo (ADR-0024 §5). On dérive donc du seul
    statut `weak`, et on rend le NOM de la notion, jamais son état chiffré.

    ⚠️ Une notion `solid` ne doit RIEN produire : sinon le geste ne dirait plus rien.
    """
    _, SessionLocal = client_db
    db = SessionLocal()
    try:
        chapter_id, _, skill_id = _chapitre_avec_lecon(db)
        student = db.query(m.StudentProfile).first()
        db.add(
            m.SkillMastery(
                student_id=student.id, skill_id=skill_id, status="solid", mastery_score=90.0
            )
        )
        db.commit()
    finally:
        db.close()
    _create_parent_item(
        papa,
        due_on=(today_local() + timedelta(days=3)).isoformat(),
        label="contrôle",
        kind="controle",
        chapter_id=chapter_id,
    )

    _as_massimo()
    assert "renforcer" not in {g["kind"] for g in papa.get(AHEAD).json()["gestes"]}

    db = SessionLocal()
    try:
        maitrise = db.query(m.SkillMastery).filter_by(skill_id=skill_id).one()
        maitrise.status = "weak"
        db.commit()
    finally:
        db.close()

    gestes = {g["kind"]: g for g in papa.get(AHEAD).json()["gestes"]}
    assert gestes["renforcer"]["detail"] == "Notion Fractions"
    assert gestes["renforcer"]["skill_id"] is not None
    assert "90" not in papa.get(AHEAD).text


def test_la_frontiere_du_paragraphe_4_passe_entre_ahead_et_les_surfaces_datees(
    papa: TestClient, client_db
) -> None:
    """🔴 **LE test de la frontière** (Amdt 9 §R/B1). Le §4 dit *« ZETIS ne se donne jamais
    rendez-vous à lui-même »* — il est **borné**, pas révoqué.

    Une mission a le droit d'apparaître dans `/ahead`, qui ne porte AUCUNE date. Elle n'a jamais
    le droit d'apparaître dans `/week` ni dans `/month`, qui en portent.

    ⚠️ Si ce test rougit, ce n'est pas lui qui a vieilli : c'est la frontière qui a été franchie.
    Son frère `test_dated_surfaces_never_contain_missions_or_srs_cards` reste l'autorité sur la
    moitié datée, et il n'a pas été touché.
    """
    _, SessionLocal = client_db
    db = SessionLocal()
    try:
        chapter_id, _, skill_id = _chapitre_avec_lecon(db)
        student = db.query(m.StudentProfile).first()
        db.add(
            # ⚠️ `Mission` n'a **pas** de colonne `chapter_id` : le chapitre est DÉRIVÉ de ses
            # notions par `chapters_of_missions`. C'est pourquoi le geste filtre sur le dict de
            # sortie de `list_missions`, jamais sur le modèle.
            m.Mission(
                student_id=student.id,
                skill_id=skill_id,
                title="Reprendre les fractions",
                status="active",
                validation_status="validated",
            )
        )
        db.commit()
    finally:
        db.close()
    today = today_local()
    _create_parent_item(
        papa,
        due_on=(today + timedelta(days=3)).isoformat(),
        label="contrôle",
        kind="controle",
        chapter_id=chapter_id,
    )

    _as_massimo()
    assert "Reprendre les fractions" in papa.get(AHEAD).text
    assert "Reprendre les fractions" not in papa.get(f"{STUDENT}/week").text
    assert "Reprendre les fractions" not in papa.get(
        f"{STUDENT}/month", params={"anchor": today.strftime("%Y-%m")}
    ).text


# ── 16. L'alerte de retard à l'ouverture (Amdt 9 §D12) ──────────────────────────
#
# 🔴 **Trois règles, et chacune protège d'une dérive nommée dans l'ADR** : du NOUVEAU seulement
# (sinon c'est une relance quotidienne), une fois par jour (sinon c'est une réclamation), une
# échéance nommée sans nombre (sinon c'est le compteur d'arriéré du §7 — le seul interdit qui n'a
# pas bougé de la journée).

ALERTE = f"{STUDENT}/late-alert"


def _profil(SessionLocal):
    db = SessionLocal()
    try:
        return db.query(m.StudentProfile).first().id
    finally:
        db.close()


def _poser_plancher(SessionLocal, jour) -> None:
    """Pose le bord bas de la fenêtre, et rouvre la porte du jour.

    ⚠️ **Deux colonnes depuis le 2026-08-17** : `agenda_late_alert_floor` dit *à partir d'où on
    regarde*, `agenda_late_alert_on` dit *en a-t-on déjà montré un aujourd'hui*. Les confondre
    coûtait des échéances perdues — c'est le défaut que ce fichier verrouille plus bas.
    """
    db = SessionLocal()
    try:
        profil = db.query(m.StudentProfile).first()
        profil.agenda_late_alert_floor = jour
        profil.agenda_late_alert_on = None
        db.commit()
    finally:
        db.close()


def test_la_premiere_visite_n_alerte_JAMAIS(papa: TestClient, client_db) -> None:
    """🔴 Sans plancher, toute l'histoire scolaire deviendrait « nouvelle » d'un coup — et la
    fonctionnalité s'inaugurerait par l'arriéré complet, l'inverse exact de ce qu'elle décide."""
    _create_parent_item(
        papa, due_on=(today_local() - timedelta(days=30)).isoformat(), label="très vieux"
    )
    _as_massimo()
    assert papa.get(ALERTE).json() is None
    # Le plancher est posé : le passé antérieur ne sera jamais signalé.
    _, SessionLocal = client_db
    db = SessionLocal()
    try:
        assert db.query(m.StudentProfile).first().agenda_late_alert_floor == today_local()
    finally:
        db.close()


def test_l_alerte_ne_signale_QUE_du_nouveau_retard(papa: TestClient, client_db) -> None:
    today = today_local()
    _create_parent_item(papa, due_on=(today - timedelta(days=10)).isoformat(), label="ancien")
    _create_parent_item(papa, due_on=(today - timedelta(days=1)).isoformat(), label="récent")
    _, SessionLocal = client_db
    # Dernière alerte il y a trois jours : « ancien » était déjà en retard, « récent » non.
    _poser_plancher(SessionLocal, today - timedelta(days=3))

    _as_massimo()
    alerte = papa.get(ALERTE).json()
    assert alerte is not None
    assert alerte["label"] == "récent"


def test_l_alerte_ne_revient_pas_deux_fois_le_meme_jour(papa: TestClient, client_db) -> None:
    """Le toast s'accuse, et la journée est close. Un enfant qui ouvre sa page cinq fois ne le
    voit pas cinq fois."""
    today = today_local()
    _create_parent_item(papa, due_on=(today - timedelta(days=1)).isoformat(), label="récent")
    _, SessionLocal = client_db
    _poser_plancher(SessionLocal, today - timedelta(days=3))

    _as_massimo()
    assert papa.get(ALERTE).json() is not None
    assert papa.post(f"{ALERTE}/seen", json={"item_id": None}).status_code == 204
    assert papa.get(ALERTE).json() is None


def test_la_LECTURE_ne_consomme_pas_l_alerte(papa: TestClient, client_db) -> None:
    """🔴 Marquer sur le GET escamoterait l'alerte à toute requête qui n'aboutit pas à l'écran —
    et React réinvoque les effets en double en développement. Deux lectures de suite doivent
    rendre la MÊME alerte tant que le client n'a pas accusé réception."""
    today = today_local()
    _create_parent_item(papa, due_on=(today - timedelta(days=1)).isoformat(), label="récent")
    _, SessionLocal = client_db
    _poser_plancher(SessionLocal, today - timedelta(days=3))

    _as_massimo()
    assert papa.get(ALERTE).json()["label"] == "récent"
    assert papa.get(ALERTE).json()["label"] == "récent"


def test_une_echeance_FAITE_ou_masquee_n_alerte_pas(papa: TestClient, client_db) -> None:
    today = today_local()
    item = _create_parent_item(
        papa, due_on=(today - timedelta(days=1)).isoformat(), label="fait hier"
    )
    _, SessionLocal = client_db
    _poser_plancher(SessionLocal, today - timedelta(days=3))

    _as_massimo()
    papa.post(f"{STUDENT}/items/{item['id']}/done")
    assert papa.get(ALERTE).json() is None


def test_l_alerte_ne_porte_AUCUN_nombre(papa: TestClient, client_db) -> None:
    """🔴 VERROU §7 — le compteur d'arriéré est le SEUL interdit qui n'a pas bougé de la journée.

    Trois échéances tombées : l'alerte en nomme UNE, et ne dit jamais combien il y en a. Pas de
    `days_late` non plus — le toast NOMME le jour, il ne mesure pas l'écart ; « depuis 4 jours »
    est un reproche chiffré.
    """
    today = today_local()
    for n in (1, 2, 3):
        _create_parent_item(
            papa, due_on=(today - timedelta(days=n)).isoformat(), label=f"retard {n}"
        )
    _, SessionLocal = client_db
    _poser_plancher(SessionLocal, today - timedelta(days=5))

    _as_massimo()
    corps = papa.get(ALERTE)
    assert set(corps.json()) == {"item_id", "label", "kind", "due_on", "subject"}
    for interdit in ("count", "total", "days_late", "late_count", "remaining"):
        assert interdit not in corps.text, interdit


def test_le_filigrane_de_l_alerte_ne_fuit_par_AUCUNE_route(papa: TestClient, client_db) -> None:
    """Symétrique exact de `agenda_last_seen_at` : la date de dernière alerte est une mécanique
    interne. Servie à Papa, elle deviendrait « dernière fois qu'on lui a rappelé son retard » —
    de la surveillance par la porte de service, ce que l'ADR-0025 condamne."""
    today = today_local()
    _create_parent_item(papa, due_on=(today - timedelta(days=1)).isoformat(), label="récent")
    _as_massimo()
    papa.get(ALERTE)
    corps = [
        papa.get(f"{STUDENT}/week").text,
        papa.get(f"{STUDENT}/ahead").text,
        papa.get(f"{STUDENT}/items", params={"from": "2026-01-01", "to": "2026-12-31"}).text,
    ]
    app.dependency_overrides[get_current_user] = lambda: PAPA
    corps.append(
        papa.get(f"{PILOT}/items", params={"from": "2026-01-01", "to": "2026-12-31"}).text
    )
    for body in corps:
        assert "late_alert" not in body
        assert "agenda_late_alert_on" not in body


# ── 16 bis. La BORNE de la fenêtre d'alerte — le cas sur lequel j'ai raisonné seul ──
#
# 🔴 Les tests du §16 encadrent la fenêtre (une échéance ancienne, une récente) mais **ne touchent
# jamais sa borne**. Or c'est exactement là que se joue le choix `>=` contre `>` :
#
#   `due_on >= agenda_late_alert_on`
#
# Raisonnement d'origine : une échéance due LE JOUR MÊME de la dernière alerte n'était pas encore
# en retard ce jour-là (`due_on < today` était faux), donc l'exclure la rendrait invisible **pour
# toujours** — un trou d'une journée dans le filet. Écrit puis testé par la même main, ce qui est
# le pire ordre. Ces trois tests sont écrits pour le CASSER.


def test_borne_une_echeance_due_LE_JOUR_de_la_derniere_alerte_est_signalee(
    papa: TestClient, client_db
) -> None:
    """🔴 LE cas limite. Le 14, ZETIS alerte ; une échéance est due le 14 — pas encore en retard.
    Le 15, elle l'est. Si la fenêtre partait de `> alerte`, elle ne serait signalée JAMAIS."""
    today = today_local()
    veille = today - timedelta(days=1)
    _create_parent_item(papa, due_on=veille.isoformat(), label="due le jour de l'alerte")
    _, SessionLocal = client_db
    _poser_plancher(SessionLocal, veille)  # dernière alerte le même jour que l'échéance

    _as_massimo()
    alerte = papa.get(ALERTE).json()
    assert alerte is not None, (
        "Trou d'une journée : une échéance due le jour de la dernière alerte n'était pas encore "
        "en retard ce jour-là, et ne le deviendrait jamais aux yeux du filtre."
    )
    assert alerte["label"] == "due le jour de l'alerte"


def test_borne_une_echeance_ANTERIEURE_a_la_derniere_alerte_ne_revient_pas(
    papa: TestClient, client_db
) -> None:
    """L'autre bord, celui qui empêche la relance. Un enfant qui n'arrive pas à rattraper ne doit
    pas revoir la même alerte."""
    today = today_local()
    _create_parent_item(
        papa, due_on=(today - timedelta(days=5)).isoformat(), label="déjà signalée"
    )
    _, SessionLocal = client_db
    _poser_plancher(SessionLocal, today - timedelta(days=4))  # alerte APRÈS l'échéance

    _as_massimo()
    assert papa.get(ALERTE).json() is None


def test_une_echeance_PLUS_RECENTE_rouvre_le_droit_a_une_alerte(
    papa: TestClient, client_db
) -> None:
    """Le mécanisme complet, sur deux jours : on signale, la journée se ferme, puis une NOUVELLE
    échéance tombe. Elle doit être signalée — sinon « nouveau seulement » deviendrait « une seule
    fois, jamais plus »."""
    today = today_local()
    _create_parent_item(papa, due_on=(today - timedelta(days=3)).isoformat(), label="première")
    _, SessionLocal = client_db
    _poser_plancher(SessionLocal, today - timedelta(days=4))

    # ⚠️ Les DEUX échéances se créent tant qu'on est encore Papa : `_create_parent_item` passe par
    # la route de pilotage, qui répond 403 à Massimo. Ma première version créait la seconde après
    # `_as_massimo()` et échouait sur ce 403 — un rouge qui ne disait rien du code testé.
    _create_parent_item(papa, due_on=(today - timedelta(days=1)).isoformat(), label="seconde")

    _as_massimo()
    premiere = papa.get(ALERTE).json()
    assert premiere["label"] == "première"
    papa.post(f"{ALERTE}/seen", json={"item_id": premiere["item_id"]})
    assert papa.get(ALERTE).json() is None, "la journée est close"

    # Le lendemain : seule la porte du jour se rouvre, le plancher reste là où l'accusé l'a mis.
    _rouvrir_la_journee(SessionLocal)
    assert papa.get(ALERTE).json()["label"] == "seconde"


def _rouvrir_la_journee(SessionLocal) -> None:
    """Simule le lendemain SANS toucher au plancher — c'est tout l'objet du correctif."""
    db = SessionLocal()
    try:
        db.query(m.StudentProfile).first().agenda_late_alert_on = None
        db.commit()
    finally:
        db.close()


def test_DEUX_echeances_dans_la_MEME_fenetre_ne_doivent_pas_en_perdre_une(
    papa: TestClient, client_db
) -> None:
    """🔴 DÉFAUT TROUVÉ PAR RELECTURE PAIRE, le 2026-08-17 — aucun de mes tests ne pouvait le voir.

    `late_alert()` sert **une** échéance (`.limit(1)`) mais `mark_late_alert_seen()` brûle **toute
    la fenêtre** en poussant le plancher à `today`. Quand deux échéances tombent en retard dans le
    même intervalle — Massimo ne revient pas de la semaine — la seconde n'est jamais montrée, et
    ne le sera **plus jamais**.

    ⚠️ Le contrat écrit dans la docstring de `late_alert()` promet l'inverse : *« une échéance dont
    la date est tombée depuis la dernière alerte »*. Les deux le sont. C'est donc un défaut, pas
    un arbitrage — et il frappe en priorité le type que `PRIORITAIRES` met en tête partout
    ailleurs : un contrôle tombe en silence derrière un devoir plus ancien.

    ⚠️ **Pourquoi mes quatre tests étaient aveugles** : tous n'ont qu'UNE échéance dans la fenêtre.
    Celui qui en a deux (`..._QUE_du_nouveau_retard`) place la seconde HORS fenêtre — il vérifie
    l'exclusion, jamais la concurrence. Le cas « deux dedans » n'existait nulle part.
    """
    today = today_local()
    _create_parent_item(papa, due_on=(today - timedelta(days=5)).isoformat(), label="exposé SVT")
    _create_parent_item(
        papa,
        due_on=(today - timedelta(days=2)).isoformat(),
        label="contrôle de maths",
        kind="controle",
    )
    _, SessionLocal = client_db
    _poser_plancher(SessionLocal, today - timedelta(days=6))

    _as_massimo()
    premiere = papa.get(ALERTE).json()
    assert premiere["label"] == "exposé SVT"
    papa.post(f"{ALERTE}/seen", json={"item_id": premiere["item_id"]})

    # ⚠️ **Ma première version de ce test TRICHAIT** : elle rejouait « les jours suivants » en
    # RECULANT le plancher, ce que la réalité ne fait jamais — le plancher n'avance que. Elle
    # rouvrait donc la fenêtre à la main et passait au vert sur le code fautif.
    #
    # L'assertion honnête ne dépend pas du temps qui passe : après l'accusé, le contrôle est-il
    # ENCORE dans la fenêtre que le prochain appel regardera ? Le plancher étant désormais le seul
    # bord bas, il suffit de le comparer à l'échéance qui n'a pas été montrée.
    db = SessionLocal()
    try:
        plancher = db.query(m.StudentProfile).first().agenda_late_alert_floor
    finally:
        db.close()
    controle = today - timedelta(days=2)
    assert controle >= plancher, (
        f"Le contrôle de maths (dû le {controle}) est passé SOUS le plancher ({plancher}) sans "
        "avoir été montré : l'accusé de réception a brûlé toute la fenêtre alors qu'une seule "
        "échéance en était sortie. Aucun jour futur ne pourra le rattraper — le plancher n'avance "
        "que. Le contrat de `late_alert()` promet pourtant « une échéance dont la date est tombée "
        "depuis la dernière alerte »."
    )
    # Et il ne suffit pas qu'il soit atteignable : le lendemain, il doit SORTIR.
    _rouvrir_la_journee(SessionLocal)
    assert papa.get(ALERTE).json()["label"] == "contrôle de maths"


def test_un_accuse_REJOUE_en_retard_ne_rouvre_pas_une_fenetre_close(
    papa: TestClient, client_db
) -> None:
    """🔴 Verrou de la garde anti-recul — écrit APRÈS un sabotage resté vert.

    En remplaçant `if lendemain > plancher` par `if True`, tous les tests passaient encore : la
    garde n'était vérifiée nulle part. Le scénario qui la met en défaut est réel — un accusé de
    réception qui arrive en double ou en retard (réseau lent, onglet rouvert) :

    1. jour 1, l'exposé est signalé et accusé → le plancher passe au lendemain de l'exposé ;
    2. jour 2, le contrôle est signalé et accusé → le plancher passe au lendemain du contrôle ;
    3. l'accusé du jour 1 arrive **enfin**. Sans la garde, le plancher RECULE, et le contrôle —
       déjà montré — repasse dans la fenêtre. Massimo le revoit, ce que le §D12 interdit
       explicitement : *« une échéance déjà signalée ne revient jamais »*.
    """
    today = today_local()
    _create_parent_item(papa, due_on=(today - timedelta(days=5)).isoformat(), label="exposé SVT")
    _create_parent_item(papa, due_on=(today - timedelta(days=2)).isoformat(), label="contrôle")
    _, SessionLocal = client_db
    _poser_plancher(SessionLocal, today - timedelta(days=6))

    _as_massimo()
    expose = papa.get(ALERTE).json()
    papa.post(f"{ALERTE}/seen", json={"item_id": expose["item_id"]})

    _rouvrir_la_journee(SessionLocal)
    controle = papa.get(ALERTE).json()
    assert controle["label"] == "contrôle"
    papa.post(f"{ALERTE}/seen", json={"item_id": controle["item_id"]})

    # L'accusé retardataire du PREMIER toast arrive maintenant.
    papa.post(f"{ALERTE}/seen", json={"item_id": expose["item_id"]})

    _rouvrir_la_journee(SessionLocal)
    assert papa.get(ALERTE).json() is None, (
        "Le plancher a reculé : une échéance déjà signalée est revenue dans la fenêtre."
    )


def test_un_accuse_SANS_echeance_fait_quand_meme_avancer_le_plancher(
    papa: TestClient, client_db
) -> None:
    """🔴 Le mode de dégradation avait changé de nature — trouvé par relecture paire.

    `item_id` est optionnel de bout en bout, et un **bundle JS en cache d'avant le correctif**
    n'en envoie aucun : c'est le cas ordinaire juste après une mise en ligne. Sans recalcul
    serveur, le plancher restait immobile et le même toast revenait **tous les jours,
    indéfiniment** — un mois plus tard il était encore là.

    C'est précisément ce que le §D12 écarte : *« un enfant qui n'arrive pas à rattraper ne verra
    pas le même toast tous les jours »*. Avant le correctif du plancher, rater un accusé coûtait
    *une alerte de trop dans la journée* ; il coûtait ensuite *la même, pour toujours*. La
    dégradation avait empiré sans que rien ne le signale.
    """
    today = today_local()
    _create_parent_item(papa, due_on=(today - timedelta(days=5)).isoformat(), label="exposé SVT")
    _create_parent_item(papa, due_on=(today - timedelta(days=2)).isoformat(), label="contrôle")
    _, SessionLocal = client_db
    _poser_plancher(SessionLocal, today - timedelta(days=6))

    _as_massimo()
    assert papa.get(ALERTE).json()["label"] == "exposé SVT"
    # Le vieux client : accusé au corps vide, aucune échéance nommée.
    assert papa.post(f"{ALERTE}/seen").status_code == 204

    _rouvrir_la_journee(SessionLocal)
    suivante = papa.get(ALERTE).json()
    assert suivante is not None and suivante["label"] == "contrôle", (
        "Le plancher n'a pas bougé : le même toast reviendrait tous les jours, sans fin."
    )


def test_un_id_ETRANGER_ne_deplace_pas_le_plancher_au_hasard(papa: TestClient, client_db) -> None:
    """L'`id` vient du client : il est revalidé, jamais cru. Un `id` qui n'appartient pas à l'élève
    — ou qui n'existe pas — retombe sur le recalcul serveur, pas sur un plancher déplacé au
    hasard, qui perdrait exactement ce que le correctif répare."""
    today = today_local()
    _create_parent_item(papa, due_on=(today - timedelta(days=5)).isoformat(), label="exposé SVT")
    _create_parent_item(papa, due_on=(today - timedelta(days=2)).isoformat(), label="contrôle")
    _, SessionLocal = client_db
    _poser_plancher(SessionLocal, today - timedelta(days=6))

    _as_massimo()
    assert papa.get(ALERTE).json()["label"] == "exposé SVT"
    papa.post(f"{ALERTE}/seen", json={"item_id": 999_999})  # inexistant

    _rouvrir_la_journee(SessionLocal)
    assert papa.get(ALERTE).json()["label"] == "contrôle"


def test_un_accuse_DUPLIQUE_sans_echeance_n_avale_pas_la_suivante(
    papa: TestClient, client_db
) -> None:
    """🔴 Le défaut d'hier, revenu par la porte ouverte pour le réparer — troisième trouvaille
    de la relecture paire.

    La règle « pas deux fois le même jour » vit dans `late_alert()`, pas dans l'accusé. Un accusé
    **rejoué sans `item_id`** relance donc `_echeance_a_signaler()` avec le plancher **déjà
    avancé** par le premier — et avale l'échéance suivante, qui n'a jamais été montrée.

    ⚠️ **Avec `item_id`, la garde anti-recul absorbe le doublon** (`lendemain > plancher` est faux
    au second passage) : le trou n'existe QUE sur le chemin du recalcul.

    ⚠️ **Et l'asymétrie le rend vicieux** : la population qui a besoin du recalcul — les bundles en
    cache — est exactement celle qui poste sans `item_id`. Le mécanisme de réparation ne se
    déclenchait que là où il pouvait nuire.

    ⚠️ Le doublon n'est pas un cas de laboratoire : React réinvoque les effets en double en
    développement (deux fois documenté dans ce module), et un réessai réseau le produit en prod.
    """
    today = today_local()
    _create_parent_item(papa, due_on=(today - timedelta(days=5)).isoformat(), label="exposé SVT")
    _create_parent_item(papa, due_on=(today - timedelta(days=2)).isoformat(), label="contrôle")
    _, SessionLocal = client_db
    _poser_plancher(SessionLocal, today - timedelta(days=6))

    _as_massimo()
    assert papa.get(ALERTE).json()["label"] == "exposé SVT"
    # Le vieux bundle accuse DEUX fois — effet réinvoqué, ou réessai réseau.
    papa.post(f"{ALERTE}/seen")
    papa.post(f"{ALERTE}/seen")

    _rouvrir_la_journee(SessionLocal)
    suivante = papa.get(ALERTE).json()
    assert suivante is not None and suivante["label"] == "contrôle", (
        "Le second accusé a recalculé avec le plancher déjà avancé et avalé le contrôle : il n'a "
        "jamais été montré, et ne le sera plus."
    )


def test_DEUX_echeances_le_MEME_JOUR_sortent_toutes_les_deux(
    papa: TestClient, client_db
) -> None:
    """🔴 QUATRIÈME défaut de la même famille — sorti d'une démonstration à l'écran, pas d'un test.

    Le plancher est une **date**. Deux échéances du même jour ne peuvent donc pas être départagées :
    montrer la première l'avance au lendemain, ce qui exclut **aussi la seconde**. Vu en direct le
    2026-08-17 en voulant montrer un contrôle au commanditaire — il ne pouvait pas sortir.

    ⚠️ C'est exactement le motif des trois autres : *un cas à DEUX exercé à UN*. Ici, deux
    échéances **à la même date**. Et ça contredit le contrat écrit à l'ADR : « aucune n'est perdue ».

    ⚠️ Le cas est ordinaire, pas tordu : un contrôle et sa leçon tombent le même jour, et c'est
    même la situation que le plan de préparation existe pour servir.
    """
    today = today_local()
    meme_jour = (today - timedelta(days=3)).isoformat()
    _create_parent_item(papa, due_on=meme_jour, label="la leçon")
    _create_parent_item(papa, due_on=meme_jour, label="le contrôle", kind="controle")
    _, SessionLocal = client_db
    _poser_plancher(SessionLocal, today - timedelta(days=6))

    _as_massimo()
    premiere = papa.get(ALERTE).json()
    assert premiere["label"] == "la leçon"
    papa.post(f"{ALERTE}/seen", json={"item_id": premiere["item_id"]})

    _rouvrir_la_journee(SessionLocal)
    seconde = papa.get(ALERTE).json()
    assert seconde is not None and seconde["label"] == "le contrôle", (
        "Le contrôle du même jour est perdu : le plancher, qui est une DATE, a sauté par-dessus "
        "les deux échéances alors qu'une seule avait été montrée."
    )
