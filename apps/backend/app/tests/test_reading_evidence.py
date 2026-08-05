"""Le verrou GÉNÉRAL de la Lecture ZETIS : chaque constat mène à sa preuve (ADR-0038 §5).

Le dashboard émet trois classes de constats (`watch`, `up`, `flat`), chacun cliquable vers une
cible censée détailler le compte annoncé. Le 2026-08-05, la branche `watch` a été corrigée : elle
annonçait « Français : 8 notions à renforcer » et menait à une page qui en montrait UNE — deux
populations disjointes sous le même mot.

Le verrou écrit ce jour-là ne couvre QUE `watch` (`test_subject_analysis.py`). Ici il devient
général : pour **chaque** item de `reading`, on résout la cible depuis son `href`, on appelle ce
qu'elle sert, et on exige l'égalité. C'est la seule chose de ce chantier qui protège quelque chose
de façon permanente — les autres slices décrivent deux pages, celle-ci empêche la CLASSE entière
du défaut de revenir sur une branche qu'on n'a pas encore écrite.

⚠️ Ce que ce fichier ne fait PAS : se contenter de `href` non vide et `count >= 0`. C'est
exactement ce que faisait `test_aucun_constat_sans_preuve`, et c'est pourquoi il est resté vert
pendant que la preuve mentait. Un lien vers une route inexistante l'aurait satisfait.
"""

from urllib.parse import parse_qs, urlparse


import app.db.models as m
from app.core.config import settings
from app.main import app
from app.modules.auth.deps import get_current_user
from app.modules.dashboard import projections as p

DASHBOARD = "/api/parent/dashboard"
BRANCHES = {"watch", "up", "flat"}


def _as_papa() -> None:
    app.dependency_overrides[get_current_user] = lambda: {"username": "papa", "role": "papa"}


def _slug(href: str) -> str:
    slug = parse_qs(urlparse(href).query).get("subject", [None])[0]
    assert slug, f"la preuve doit désigner une matière : {href}"
    return slug


def _subject_id(TestSession, slug: str) -> int:
    with TestSession() as db:
        subject = db.query(m.Subject).filter_by(slug=slug).first()
    assert subject is not None, f"matière introuvable pour le slug « {slug} »"
    return subject.id


def _ce_que_la_cible_sert(client, TestSession, href: str) -> int:
    """Résout la cible depuis le `href` et rend le compte qu'elle sert RÉELLEMENT.

    Aucune tolérance sur un `href` inconnu : c'est le signal d'erreur nommé par l'ADR-0038 —
    « un constat ajouté avec un href que personne ne sait résoudre ». Le verrou doit alors
    rougir, pas hausser les épaules.
    """
    parsed = urlparse(href)
    slug = _slug(href)
    query = parse_qs(parsed.query)

    # `watch` → le panneau « Où agir » du dashboard, seul endroit qui NOMME les fragiles.
    if parsed.path == "/" and query.get("panel") == ["ou-agir"]:
        sid = _subject_id(TestSession, slug)
        return client.get(f"/api/parent/progress/subjects/{sid}/analysis").json()["fragile_count"]

    # `up` → la page Progression, dont la colonne « Acquis » est le compte des consolidées.
    if parsed.path == "/progression":
        body = client.get("/api/parent/progress/overview").json()
        ligne = next((s for s in body["subjects"] if s["slug"] == slug), None)
        assert ligne is not None, f"Progression ne sert aucune ligne pour « {slug} »"
        return ligne["notions"]["consolidated"]

    # `flat` → le Cahier de bord, qui reconstruit les sessions de la matière. On l'interroge sur
    # la fenêtre la plus large possible : si même là le compte diverge, ce n'est pas une question
    # de cadrage temporel.
    if parsed.path == "/cahier":
        sid = _subject_id(TestSession, slug)
        from datetime import timedelta

        from app.modules.activity.timeutils import today_local

        today = today_local()
        depuis = today - timedelta(days=p.HISTORY_DAYS - 1)
        body = client.get(
            f"/api/parent/activity/sessions?from={depuis.isoformat()}"
            f"&to={today.isoformat()}&subject_id={sid}"
        ).json()
        return sum(len(s["events"]) for jour in body["days"] for s in jour["sessions"])

    raise AssertionError(
        f"`href` que personne ne sait résoudre : {href}. Un constat dont la preuve n'a pas de "
        f"cible connue est un constat sans preuve — c'est le signal d'erreur de l'ADR-0038 §5."
    )


def _seed_les_trois_branches(TestSession) -> None:
    """Une fixture qui produit les TROIS classes de constats, pas une de moins.

    Sans elle, la boucle du verrou tournerait sur une liste partielle et passerait sans rien
    prouver — ce qui est arrivé trois fois sur les deux chantiers précédents.
    """
    from datetime import datetime, timedelta, timezone

    with TestSession() as db:
        student = db.query(m.StudentProfile).first()
        maths = db.query(m.Subject).first()

        # Mathématiques : 1 consolidée (`up`) + 3 fragiles (`watch`), et assez de traces pour ne
        # PAS déclencher `flat`.
        skills = [m.Skill(subject_id=maths.id, name=f"N{i}", level="4e") for i in range(4)]
        db.add_all(skills)
        db.flush()
        for skill, status in zip(skills, ["mastered", "weak", "weak", "learning"]):
            db.add(
                m.SkillMastery(
                    student_id=student.id, skill_id=skill.id, status=status, mastery_score=50
                )
            )
        now = datetime.now(timezone.utc)
        for minutes_ago in (40, 30, 20, 10):
            db.add(
                m.LearningEvent(
                    student_id=student.id,
                    subject_id=maths.id,
                    event_type="lesson_viewed",
                    created_at=now - timedelta(minutes=minutes_ago),
                )
            )

        # Français : des notions au programme et DEUX traces (< 3) → `flat`.
        #
        # ⚠️ Deux, et surtout pas zéro. Avec aucune trace, le constat annoncerait 0 et sa cible en
        # servirait 0 : l'égalité tiendrait sans rien prouver, et le verrou serait vert même si le
        # résolveur rendait constamment zéro. C'est la vacuité que ce fichier est censé interdire.
        francais = m.Subject(name="Français", slug="francais")
        db.add(francais)
        db.flush()
        db.add(m.Skill(subject_id=francais.id, name="Accord du participe", level="4e"))
        for minutes_ago in (60, 55):
            db.add(
                m.LearningEvent(
                    student_id=student.id,
                    subject_id=francais.id,
                    event_type="lesson_viewed",
                    created_at=now - timedelta(minutes=minutes_ago),
                )
            )
        db.commit()


def test_les_trois_branches_menent_a_leur_preuve(client_db) -> None:
    """LE verrou : chaque constat annonce exactement ce que sa cible sert.

    On SUIT le lien — on ne se contente pas de vérifier qu'il existe."""
    client, TestSession = client_db
    _seed_les_trois_branches(TestSession)
    _as_papa()

    constats = client.get(DASHBOARD).json()["reading"]

    # ⚠️ ANTI-VACUITÉ, et elle est obligatoire : une boucle sur une liste vide passe toujours.
    vues = {c["trend"] for c in constats}
    assert vues == BRANCHES, f"les trois branches doivent être représentées, vu : {sorted(vues)}"

    for constat in constats:
        annonce = constat["evidence"]["count"]
        # Second garde-fou d'anti-vacuité : `0 == 0` tiendrait même si le résolveur rendait
        # toujours zéro. Chaque branche doit annoncer quelque chose à comparer.
        assert annonce > 0, f"[{constat['trend']}] compte nul : la comparaison ne prouverait rien"

        servi = _ce_que_la_cible_sert(client, TestSession, constat["evidence"]["href"])
        assert annonce == servi, (
            f"[{constat['trend']}] « {constat['text']} » annonce {annonce}, "
            f"sa preuve en sert {servi} ({constat['evidence']['href']})"
        )


def test_aucun_href_ne_reste_irresolvable(client_db) -> None:
    """Une branche ajoutée demain doit CASSER ce fichier, pas passer inaperçue.

    C'est le quatrième signal d'erreur de l'ADR-0038 : « le verrou est contourné plutôt que
    respecté — un constat ajouté avec un href que personne ne sait résoudre »."""
    client, TestSession = client_db
    _seed_les_trois_branches(TestSession)
    _as_papa()

    constats = client.get(DASHBOARD).json()["reading"]
    assert constats, "fixture vide : le test ne prouverait rien"

    for constat in constats:
        # Ne lève pas → la cible est connue ET a répondu.
        _ce_que_la_cible_sert(client, TestSession, constat["evidence"]["href"])


# --- La fenêtre de la branche `flat` — dette PAYÉE le 2026-08-05 ----------------------------------


def test_flat_ne_ment_pas_au_dela_de_la_fenetre_du_cahier(client_db) -> None:
    """Une trace hors de portée du Cahier n'est PAS comptée par le constat.

    ⚠️ **Ce test a vécu en `xfail(strict=True)`** le temps que le chantier existe : il décrivait
    une divergence réelle (le constat comptait sur 730 j, sa preuve n'en servait que 366) au lieu
    de la taire en prose. Le jour où la fenêtre a été bornée, il est passé **XPASS(strict)** —
    donc rouge — et a forcé le retrait du marqueur. La dette n'a pas pu pourrir en silence.

    Il garde exactement le même corps : ce qui était la preuve du défaut est devenu le verrou de
    sa correction. Retirer le bornage de `_reading` le fait retomber.
    """
    from datetime import datetime, timedelta, timezone

    client, TestSession = client_db
    assert p.HISTORY_DAYS > settings.activity_max_range_days, (
        "sans cet écart, le test ne prouverait rien — il n'y aurait pas de zone aveugle"
    )

    with TestSession() as db:
        student = db.query(m.StudentProfile).first()
        subject = db.query(m.Subject).first()
        subject_id = subject.id
        db.add(m.Skill(subject_id=subject_id, name="Notion", level="4e"))
        now = datetime.now(timezone.utc)
        # Une trace récente, une hors de portée du Cahier mais dans la fenêtre du constat.
        for days_ago in (0, settings.activity_max_range_days + 100):
            db.add(
                m.LearningEvent(
                    student_id=student.id,
                    subject_id=subject_id,
                    event_type="lesson_viewed",
                    created_at=now - timedelta(days=days_ago),
                )
            )
        db.commit()
    _as_papa()

    constats = [c for c in client.get(DASHBOARD).json()["reading"] if c["trend"] == "flat"]
    assert constats, "au moins un constat « trop peu d'activité » attendu"

    for constat in constats:
        annonce = constat["evidence"]["count"]
        servi = _ce_que_la_cible_sert(client, TestSession, constat["evidence"]["href"])
        assert annonce == servi, (
            f"« {constat['text']} » annonce {annonce} traces, son Cahier en sert {servi} : "
            f"la fenêtre du constat ({p.HISTORY_DAYS} j) dépasse celle de sa preuve "
            f"({settings.activity_max_range_days} j)"
        )
        # La trace hors fenêtre existe bel et bien en base : si elle avait simplement disparu du
        # décor, l'égalité ci-dessus serait vraie sans rien prouver. C'est le piège du décor qui
        # ne peut pas faire diverger les deux branches — payé trois fois dans ce dépôt.
        assert annonce == 1, (
            f"le décor pose 2 traces dont 1 hors fenêtre : le constat doit en compter 1, pas "
            f"{annonce}"
        )
