"""Index des notions + frise (adr-0040 Lot 1) : la mesure, avant que l'écran ne la montre.

Deux verrous que l'ADR exige nommément :
  - le NOMBRE DE REQUÊTES est constant, indépendant du nombre de notions et de matières ;
  - une SEPTIÈME valeur de `SkillMastery.status` doit faire ÉCHOUER un test, pas glisser en
    silence dans « non abordée ».
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import event, select

import app.db.models as m
from app.main import app
from app.modules.auth.deps import get_current_user
from app.modules.progress import skills as skills_service


def _as_parent() -> None:
    app.dependency_overrides[get_current_user] = lambda: {"username": "papa", "role": "papa"}


def _seed(db, *, notions: int = 3, subjects: int = 1, prefixe: str = "a"):
    """Crée `subjects` matières × `notions` notions, sans aucune maîtrise.

    Renvoie des IDENTIFIANTS, jamais des objets ORM : la session du test se referme avant les
    assertions, et un attribut lu sur une instance détachée lève `DetachedInstanceError`.

    ⚠️ La fixture `client_db` seede DÉJÀ une matière et une notion. Tout comptage doit donc être
    relatif aux ids créés ici, jamais absolu.
    """
    student_id = db.scalar(select(m.StudentProfile)).id
    created: list[int] = []
    for s in range(subjects):
        subject = m.Subject(name=f"Matière {prefixe}{s}", slug=f"mat-{prefixe}{s}", sort_order=s)
        db.add(subject)
        db.flush()
        for n in range(notions):
            skill = m.Skill(subject_id=subject.id, name=f"Notion {prefixe}{s}-{n}", level="4e")
            db.add(skill)
            db.flush()
            created.append(skill.id)
    db.commit()
    return student_id, created


def test_les_six_statuts_reels_sont_TOUS_mappes(client_db) -> None:
    """🔴 Le verrou de la septième valeur.

    `SkillMastery.status` a six valeurs, `in_progress` étant écrit par `missions/service.py` hors
    de tout `_status_from_score()` — piège signalé par `adr-0024` PUIS `adr-0028`, raté deux fois.
    Ajouter une septième valeur au modèle sans la mapper doit casser ICI, et non produire
    silencieusement une notion « non abordée » de plus.
    """
    assert set(skills_service.PALIER_BY_STATUS) == set(skills_service.KNOWN_MASTERY_STATUSES), (
        "un statut de SkillMastery n'est pas mappé vers un palier — il glisserait dans « non abordée »"
    )
    # Et le mapping ne doit pas inventer de palier hors du vocabulaire du §4.
    assert set(skills_service.PALIER_BY_STATUS.values()) <= {
        "acquise",
        "a_renforcer",
        "en_cours",
        "non_abordee",
    }


def test_le_nombre_de_requetes_ne_depend_PAS_du_volume(client_db) -> None:
    """🔴 Le verrou d'N+1, mesuré et non supposé.

    Une route qui boucle une requête par notion tiendrait sur la base de dev et s'effondrerait sur
    les 280 réelles. On compte les SELECT émis, sur deux volumes très différents.
    """
    client, Session = client_db
    _as_parent()

    def compte_selects(fn) -> int:
        n = 0
        with Session() as db:
            engine = db.get_bind()

            def before(conn, cursor, statement, *a):
                nonlocal n
                if statement.lstrip().upper().startswith("SELECT"):
                    n += 1

            event.listen(engine, "before_cursor_execute", before)
            try:
                fn(db)
            finally:
                event.remove(engine, "before_cursor_execute", before)
        return n

    with Session() as db:
        student_id, _ = _seed(db, notions=2, subjects=1)
    petit = compte_selects(
        lambda db: skills_service.skills_index(db, student_id=student_id)
    )

    with Session() as db:
        _seed(db, notions=25, subjects=4, prefixe="b")  # 100 notions de plus, 4 matières de plus
    grand = compte_selects(
        lambda db: skills_service.skills_index(db, student_id=student_id)
    )

    assert petit == grand, (
        f"le nombre de requêtes suit le volume ({petit} → {grand}) : c'est un N+1"
    )


def test_les_deux_absences_ne_partagent_PAS_un_null(client_db) -> None:
    """🔴 Le §7 : quatre états de « depuis », dont DEUX `unknown` distincts.

    Un `int | None` ferait dire à `null` trois choses à la fois — jamais abordée, bascule
    antérieure à la trace, date perdue à la migration. Or **une seule se comblera d'elle-même**.
    """
    client, Session = client_db
    _as_parent()
    now = datetime.now(timezone.utc)

    with Session() as db:
        student_id, skills = _seed(db, notions=4, subjects=1)
        jamais, avant_trace, avant_migration, datee = skills

        # abordée, aucune bascule tracée, pas consolidée → before_history
        db.add(m.SkillMastery(student_id=student_id, skill_id=avant_trace, status="weak"))
        # consolidée sans `mastered_at` → before_migration (date définitivement perdue)
        db.add(
            m.SkillMastery(
                student_id=student_id, skill_id=avant_migration, status="mastered",
                mastery_score=95, mastered_at=None,
            )
        )
        # abordée AVEC une bascule tracée → {days}
        db.add(m.SkillMastery(student_id=student_id, skill_id=datee, status="solid"))
        db.add(
            m.SkillMasteryHistory(
                student_id=student_id, skill_id=datee, status="solid",
                mastery_score=75, changed_at=now - timedelta(days=3),
            )
        )
        db.commit()
        index = skills_service.skills_index(db, student_id=student_id)

    par_id = {n["skill_id"]: n for n in index["notions"]}
    assert par_id[jamais]["since"] is None, "aucune ligne de maîtrise → null, et lui seul"
    assert par_id[jamais]["palier"] == "non_abordee"
    assert par_id[avant_trace]["since"] == {"unknown": "before_history"}
    assert par_id[avant_migration]["since"] == {"unknown": "before_migration"}
    assert par_id[datee]["since"] == {"days": 3}
    # Les deux `unknown` sont DISTINCTS — c'est toute la décision du §7.
    assert par_id[avant_trace]["since"] != par_id[avant_migration]["since"]


def test_palier_et_lacune_sont_deux_axes_independants(client_db) -> None:
    """§4 — jamais une colonne à trois valeurs.

    Une notion peut être « à renforcer » sans lacune, et porter une lacune ouverte en étant
    « en cours ». Les fondre reproduirait le bug d'`analyse-par-matiere`.
    """
    client, Session = client_db
    _as_parent()
    with Session() as db:
        student_id, skills = _seed(db, notions=2, subjects=1)
        fragile_sans_lacune, en_cours_avec_lacune = skills
        db.add(m.SkillMastery(student_id=student_id, skill_id=fragile_sans_lacune, status="weak"))
        db.add(
            m.SkillMastery(student_id=student_id, skill_id=en_cours_avec_lacune, status="solid")
        )
        db.add(
            m.Gap(
                student_id=student_id, skill_id=en_cours_avec_lacune,
                subject_id=db.get(m.Skill, en_cours_avec_lacune).subject_id, status="open", severity="high",
            )
        )
        db.commit()
        index = skills_service.skills_index(db, student_id=student_id)

    par_id = {n["skill_id"]: n for n in index["notions"]}
    a = par_id[fragile_sans_lacune]
    b = par_id[en_cours_avec_lacune]
    assert a["palier"] == "a_renforcer" and a["has_open_gap"] is False
    assert b["palier"] == "en_cours" and b["has_open_gap"] is True


def test_les_matieres_sortent_dans_l_ordre_de_l_annee(client_db) -> None:
    """§4 bis — l'ordre des matières est celui de la table « Par matière », jamais alphabétique.

    Un tri alphabétique ferait diverger deux vues du MÊME écran.
    """
    client, Session = client_db
    _as_parent()
    with Session() as db:
        student_id = db.scalar(select(m.StudentProfile)).id
        # `sort_order` volontairement à contre-sens de l'alphabet
        for nom, slug, ordre in (("Zoologie", "zoo", 0), ("Algèbre", "alg", 1)):
            subject = m.Subject(name=nom, slug=slug, sort_order=ordre)
            db.add(subject)
            db.flush()
            db.add(m.Skill(subject_id=subject.id, name=f"Notion {nom}", level="4e"))
        db.commit()
        index = skills_service.skills_index(db, student_id=student_id)

    noms = [s["name"] for s in index["subjects"]]
    assert noms.index("Zoologie") < noms.index("Algèbre"), (
        "l'ordre doit suivre sort_order, pas l'alphabet"
    )


def test_la_frise_ne_prete_pas_de_palier_de_depart_a_la_plus_ancienne(client_db) -> None:
    """La frise remonte `from_status`, sauf pour la première bascule tracée.

    Lui en inventer un serait une affirmation que la trace ne porte pas — même règle que
    l'écrasement du Lot 0.
    """
    client, Session = client_db
    _as_parent()
    now = datetime.now(timezone.utc)
    with Session() as db:
        student_id, skills = _seed(db, notions=1, subjects=1)
        skill = skills[0]
        for jours, statut in ((10, "weak"), (5, "learning"), (1, "solid")):
            db.add(
                m.SkillMasteryHistory(
                    student_id=student_id, skill_id=skill, status=statut,
                    mastery_score=50, changed_at=now - timedelta(days=jours),
                )
            )
        db.commit()
        frise = skills_service.skill_timeline(db, student_id=student_id, skill_id=skill)

    t = frise["transitions"]
    assert [x["to_status"] for x in t] == ["solid", "learning", "weak"], "récentes d'abord"
    assert t[0]["from_status"] == "learning"
    assert t[1]["from_status"] == "weak"
    assert t[2]["from_status"] is None, "la plus ancienne tracée n'a pas de palier de départ connu"


def test_les_routes_sont_papa_only(client_db) -> None:
    """`require_parent` de bout en bout : aucune surface Massimo (§« ce que l'ADR ne fait pas »)."""
    client, _Session = client_db
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides[get_current_user] = lambda: {"username": "massimo", "role": "child"}
    assert client.get("/api/parent/progress/skills").status_code == 403
    assert client.get("/api/parent/progress/skills/1/timeline").status_code == 403


def test_la_route_skills_repond_et_declare_ses_bornes(client_db) -> None:
    """Le contrat réseau : l'index, ses matières, et les DEUX débuts de trace (§6)."""
    client, Session = client_db
    _as_parent()
    with Session() as db:
        _seed(db, notions=2, subjects=1)
    body = client.get("/api/parent/progress/skills").json()
    # Relatif : `client_db` seede déjà une matière et une notion.
    assert len(body["notions"]) >= 2 and len(body["subjects"]) >= 1
    # Déclarés même vides : c'est leur ABSENCE qui doit être lisible, pas leur omission.
    assert "history_since" in body and "reviews_since" in body
