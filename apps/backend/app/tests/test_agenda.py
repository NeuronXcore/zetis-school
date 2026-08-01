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
    for key in ("subject_id", "chapter_id", "parent_note"):
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
        patched = papa.patch(f"{PILOT}/items/{item_id}", json={"label": "Exercices 12 à 15"})
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


# ── 6 & 11. Asymétrie de la bande, et aucune case vide sur un jour à venir (§6, §7) ──


def test_band_asymmetry_past_traces_future_items(papa: TestClient) -> None:
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
            # Un jour à venir n'a pas de passé : `null`, JAMAIS `0` (ADR-0024 §5 —
            # pas de réceptacle vide, donc pas de case à remplir dans le contrat).
            assert day["traces"] is None
        if day_date < today:
            # Un jour passé n'a plus d'échéance à annoncer.
            assert day["fixed_items"] == []
        assert day["plan_steps"] == []  # Lot 2


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


def test_upcoming_drops_done_and_dismissed(papa: TestClient) -> None:
    item = _create_parent_item(papa, kind="controle", label="Contrôle SVT")
    _as_massimo()
    assert len(papa.get(f"{STUDENT}/upcoming").json()) == 1
    papa.post(f"{STUDENT}/items/{item['id']}/done")
    assert papa.get(f"{STUDENT}/upcoming").json() == []


# ── Traces : un compte grossier, plafonné, sans réceptacle vide (§7) ─────────────


def test_traces_are_capped_and_count_natures_not_volume(papa: TestClient, client_db) -> None:
    """Une rafale de révision vaut 1 (une nature), pas 12. Le plafond borne le tout — un
    comptage grossier et généreux, surtout pas une mesure d'effort."""
    _, SessionLocal = client_db
    db = SessionLocal()
    try:
        student = db.query(m.StudentProfile).first()
        yesterday = datetime.now(timezone.utc) - timedelta(days=1)
        for index in range(12):
            db.add(
                m.LearningEvent(
                    student_id=student.id,
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
    assert by_offset[-1]["traces"] == 1
    assert by_offset[-2]["traces"] == 0  # « 0 » et « pas de donnée » sont le même état.


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
