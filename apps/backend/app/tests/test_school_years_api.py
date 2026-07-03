"""Tests HTTP du CRUD années scolaires : garde parent + règles métier serveur
(unicité de l'année active, `level` immuable, pas de DELETE, `mode` jamais exposé)."""

from sqlalchemy import select

import app.db.models as m
from app.main import app
from app.modules.auth.deps import get_current_user


def _as_papa() -> None:
    app.dependency_overrides[get_current_user] = lambda: {"username": "papa", "role": "papa"}


def _seed_year(Session, label: str = "2025-2026", level: str = "5e", status: str = "active") -> int:
    with Session() as db:
        profile = db.scalars(select(m.StudentProfile)).first()
        year = m.SchoolYear(student_id=profile.id, label=label, level=level, status=status)
        db.add(year)
        db.commit()
        return year.id


def test_routes_are_parent_only(client_db) -> None:
    client, _ = client_db  # conftest = rôle child
    assert client.get("/api/school-years").status_code == 403
    assert client.post(
        "/api/school-years", json={"label": "2026-2027", "level": "4e"}
    ).status_code == 403
    assert client.patch("/api/school-years/1", json={}).status_code == 403


def test_list_years_newest_first_without_mode(client_db) -> None:
    client, Session = client_db
    _as_papa()

    assert client.get("/api/school-years").json() == []

    _seed_year(Session, label="2025-2026", level="5e", status="archived")
    _seed_year(Session, label="2026-2027", level="4e", status="active")
    res = client.get("/api/school-years")
    assert res.status_code == 200
    years = res.json()
    assert [y["label"] for y in years] == ["2026-2027", "2025-2026"]
    assert [y["status"] for y in years] == ["active", "archived"]
    # `mode` (déprécié, ADR-0009 §4) ne sort JAMAIS du CRUD.
    assert all("mode" not in y for y in years)


def test_create_year_is_draft(client_db) -> None:
    client, _ = client_db
    _as_papa()

    res = client.post(
        "/api/school-years",
        json={"label": "2027-2028", "level": "3e", "starts_on": "2027-09-01", "ends_on": "2028-07-04"},
    )
    assert res.status_code == 201
    year = res.json()
    assert year["label"] == "2027-2028"
    assert year["level"] == "3e"
    assert year["status"] == "draft"  # l'activation est un geste séparé
    assert year["starts_on"] == "2027-09-01"
    assert year["ends_on"] == "2028-07-04"
    assert year["program_version"] is None
    assert "mode" not in year


def test_create_rejects_mode(client_db) -> None:
    """`mode` n'existe dans aucun schéma de requête : extra="forbid" → 422."""
    client, _ = client_db
    _as_papa()
    res = client.post(
        "/api/school-years", json={"label": "2027-2028", "level": "3e", "mode": "hybrid"}
    )
    assert res.status_code == 422


def test_patch_edits_label_and_dates(client_db) -> None:
    client, Session = client_db
    _as_papa()
    year_id = _seed_year(Session, label="2026-2027", level="4e")

    res = client.patch(
        f"/api/school-years/{year_id}",
        json={"label": "2026-2027 (bis)", "starts_on": "2026-09-01", "ends_on": "2027-07-04"},
    )
    assert res.status_code == 200
    year = res.json()
    assert year["label"] == "2026-2027 (bis)"
    assert year["starts_on"] == "2026-09-01"
    assert year["ends_on"] == "2027-07-04"
    assert year["status"] == "active"  # statut inchangé si non fourni
    assert "mode" not in year

    assert client.patch("/api/school-years/9999", json={"label": "X"}).status_code == 404


def test_patch_level_is_immutable(client_db) -> None:
    """`level` est absent du schéma PATCH : toute modification est rejetée en 422."""
    client, Session = client_db
    _as_papa()
    year_id = _seed_year(Session, label="2026-2027", level="4e")

    res = client.patch(f"/api/school-years/{year_id}", json={"level": "3e"})
    assert res.status_code == 422

    with Session() as db:
        assert db.get(m.SchoolYear, year_id).level == "4e"


def test_activation_archives_previous_active(client_db) -> None:
    """Une seule année `active` : l'activation archive l'ancienne, même transaction."""
    client, Session = client_db
    _as_papa()
    old_id = _seed_year(Session, label="2025-2026", level="5e", status="active")
    new_id = _seed_year(Session, label="2026-2027", level="4e", status="draft")

    res = client.patch(f"/api/school-years/{new_id}", json={"status": "active"})
    assert res.status_code == 200
    assert res.json()["status"] == "active"

    statuses = {y["id"]: y["status"] for y in client.get("/api/school-years").json()}
    assert statuses == {new_id: "active", old_id: "archived"}
    with Session() as db:
        active = db.scalars(select(m.SchoolYear).where(m.SchoolYear.status == "active")).all()
        assert [y.id for y in active] == [new_id]


def test_no_delete_route(client_db) -> None:
    """Pas de suppression d'année : les FK pédagogiques en dépendent (spec V1)."""
    client, Session = client_db
    _as_papa()
    year_id = _seed_year(Session)
    assert client.delete(f"/api/school-years/{year_id}").status_code == 405


def test_program_version_derived_from_chapters(client_db) -> None:
    """La version de programme est dérivée des chapitres générés (ADR-0009 §5)."""
    client, Session = client_db
    _as_papa()
    year_id = _seed_year(Session, label="2026-2027", level="4e")
    with Session() as db:
        subject = db.scalars(select(m.Subject)).first()
        sys_row = m.SchoolYearSubject(school_year_id=year_id, subject_id=subject.id)
        db.add(sys_row)
        db.flush()
        db.add(
            m.Chapter(
                school_year_subject_id=sys_row.id,
                name="Nombres relatifs",
                source="generated",
                validation_status="pending",
                program_version="2020",
            )
        )
        db.commit()

    years = client.get("/api/school-years").json()
    assert years[0]["program_version"] == "2020"
