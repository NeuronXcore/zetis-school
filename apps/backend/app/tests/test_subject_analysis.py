"""Analyse d'une matière (`adr-0028-dashboard-papa-agregat-unique` (Amendement 1)) : un test par invariant.

Ce que ces tests protègent tient en une phrase : **le panneau ne peut pas contredire les surfaces
qui existent déjà.** Il nomme les notions que l'agrégat compte, et il les compte comme `/lacunes`
les compte. Deux populations disjointes sous un même mot ont déjà coûté un bug (une preuve qui
annonçait 8 notions et en montrait 1) ; c'est ce motif que ce fichier ferme.

100 % offline : SQLite in-memory, aucun LLM — la route n'en appelle aucun, et un test le vérifie.
"""

from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import app.db.models as m
from app.main import app
from app.modules.auth.deps import get_current_user
from app.modules.dashboard import projections as p

UTC = timezone.utc
ROUTE = "/api/parent/progress/subjects/{}/analysis"


def _as_papa() -> None:
    app.dependency_overrides[get_current_user] = lambda: {"username": "papa", "role": "papa"}


def _seed(TestSession, *, statuses: list[str] | None = None) -> tuple[int, list[int]]:
    """Crée des notions dans la matière du `conftest`. Rend `(subject_id, skill_ids)`."""
    with TestSession() as db:
        student = db.query(m.StudentProfile).first()
        subject = db.query(m.Subject).first()
        skills = [
            m.Skill(subject_id=subject.id, name=f"Notion {i}", level="4e")
            for i in range(len(statuses or []))
        ]
        db.add_all(skills)
        db.flush()
        for skill, status in zip(skills, statuses or []):
            db.add(
                m.SkillMastery(
                    student_id=student.id, skill_id=skill.id, status=status, mastery_score=40
                )
            )
        db.commit()
        return subject.id, [s.id for s in skills]


def _gap(TestSession, *, skill_id: int, subject_id: int, severity: str = "high") -> None:
    with TestSession() as db:
        student = db.query(m.StudentProfile).first()
        db.add(
            m.Gap(
                student_id=student.id,
                skill_id=skill_id,
                subject_id=subject_id,
                severity=severity,
                status="open",
                first_detected_at=datetime.now(UTC),
            )
        )
        db.commit()


def _mission(TestSession, *, skill_id: int, subject_id: int, **kw) -> None:
    with TestSession() as db:
        student = db.query(m.StudentProfile).first()
        db.add(
            m.Mission(
                student_id=student.id,
                subject_id=subject_id,
                skill_id=skill_id,
                title="Mission",
                mission_type=kw.get("mission_type", "manual"),
                status=kw.get("status", "planned"),
                validation_status=kw.get("validation_status", "validated"),
            )
        )
        db.commit()


# ==================================================================================================
# Accès
# ==================================================================================================


def test_route_interdite_a_l_enfant(client_db) -> None:
    """Analyse parentale : jamais servie à Massimo (CLAUDE.md, séparation des domaines)."""
    client, TestSession = client_db
    subject_id, _ = _seed(TestSession, statuses=[])
    assert client.get(ROUTE.format(subject_id)).status_code == 403


def test_matiere_inconnue_rend_404(client_db) -> None:
    client, _ = client_db
    _as_papa()
    assert client.get(ROUTE.format(9999)).status_code == 404


# ==================================================================================================
# Cohérence avec les surfaces existantes
# ==================================================================================================


def test_le_panneau_compte_les_fragiles_COMME_l_agregat(client_db) -> None:
    """LE verrou du chantier, dans sa moitié serveur.

    La carte « Lecture ZETIS » annonce « N notions à renforcer » depuis `SubjectOut.notions.fragile`
    et sa preuve mènera au panneau. Si les deux ne comptaient pas la même population, la preuve
    montrerait autre chose que ce que le constat annonce — c'est exactement le bug d'origine.
    """
    client, TestSession = client_db
    subject_id, _ = _seed(TestSession, statuses=["weak", "learning", "solid", "mastered"])
    _as_papa()

    agregat = client.get("/api/parent/dashboard").json()
    matiere = next(s for s in agregat["subjects"] if s["id"] == subject_id)
    panneau = client.get(ROUTE.format(subject_id)).json()

    assert matiere["notions"]["fragile"] == 2, "deux statuts fragiles seedés"
    assert panneau["fragile_count"] == matiere["notions"]["fragile"]
    # Et le compte n'est pas un champ à part : il EST la longueur de la liste nommée.
    assert panneau["fragile_count"] == sum(1 for n in panneau["to_reinforce"] if n["is_fragile"])


def test_la_couverture_par_mission_est_celle_de_la_page_lacunes(client_db) -> None:
    """`/lacunes` et le panneau doivent dire la même chose sur « est-ce déjà pris en charge ».

    Le piège historique est le TYPE de mission : `missions._has_active_remediation` ne regarde que
    la remédiation, là où la question de Papa est plus large. Une mission `manual` `planned` couvre
    tout autant.
    """
    client, TestSession = client_db
    subject_id, skills = _seed(TestSession, statuses=["weak"])
    _gap(TestSession, skill_id=skills[0], subject_id=subject_id)
    _mission(TestSession, skill_id=skills[0], subject_id=subject_id, mission_type="manual")
    _as_papa()

    lacunes = client.get("/api/parent/progress/gaps").json()
    panneau = client.get(ROUTE.format(subject_id)).json()

    assert lacunes[0]["has_active_mission"] is True
    assert panneau["to_reinforce"][0]["has_active_mission"] is True
    assert panneau["without_mission_count"] == 0


def test_une_mission_NON_validee_couvre_quand_meme(client_db) -> None:
    """Le drapeau et la liste portent sur la MÊME population.

    `missions.pilot.pilot_list` filtre sur `validation_status == "validated"` ; le panneau ne le
    fait pas. Sinon une notion marquée « déjà couverte » n'afficherait aucune mission en regard, et
    Papa lirait une contradiction sur le même écran.
    """
    client, TestSession = client_db
    subject_id, skills = _seed(TestSession, statuses=["weak"])
    _mission(
        TestSession, skill_id=skills[0], subject_id=subject_id, validation_status="pending"
    )
    _as_papa()

    panneau = client.get(ROUTE.format(subject_id)).json()

    assert panneau["to_reinforce"][0]["has_active_mission"] is True
    assert [msn["id"] for msn in panneau["in_progress"]["missions"]], (
        "la mission qui couvre la notion doit AUSSI être listée"
    )


# ==================================================================================================
# Ce que la liste contient
# ==================================================================================================


def test_une_notion_fragile_SANS_lacune_apparait(client_db) -> None:
    """`to_reinforce` est l'UNION, pas l'intersection.

    Une notion peut être `weak` sans avoir jamais produit de `Gap` — mauvais score à un quiz de fin
    de cours, sans diagnostic. L'oublier viderait la liste au moment où elle est la plus utile.
    """
    client, TestSession = client_db
    subject_id, _ = _seed(TestSession, statuses=["weak"])
    _as_papa()

    notions = client.get(ROUTE.format(subject_id)).json()["to_reinforce"]

    assert len(notions) == 1
    assert notions[0]["is_fragile"] is True
    assert notions[0]["has_open_gap"] is False
    assert notions[0]["severity"] is None, "une notion fragile n'a pas de sévérité"


def test_une_lacune_sur_une_notion_NON_fragile_apparait(client_db) -> None:
    """L'autre moitié de l'union : une `Gap` ouverte sur une notion repassée `solid`."""
    client, TestSession = client_db
    subject_id, skills = _seed(TestSession, statuses=["solid"])
    _gap(TestSession, skill_id=skills[0], subject_id=subject_id, severity="medium")
    _as_papa()

    notions = client.get(ROUTE.format(subject_id)).json()["to_reinforce"]

    assert len(notions) == 1
    assert notions[0]["is_fragile"] is False
    assert notions[0]["has_open_gap"] is True
    assert notions[0]["severity"] == "medium"


def test_les_deux_mesures_ne_fusionnent_JAMAIS(client_db) -> None:
    """Trois notions : une fragile seule, une en lacune seule, une les deux.

    Le total de la liste (3) n'est ni `fragile_count` (2) ni `open_gap_count` (2), et surtout il
    n'est pas leur somme (4). C'est ce qui interdit d'afficher un total unique.
    """
    client, TestSession = client_db
    subject_id, skills = _seed(TestSession, statuses=["weak", "solid", "learning"])
    _gap(TestSession, skill_id=skills[1], subject_id=subject_id)
    _gap(TestSession, skill_id=skills[2], subject_id=subject_id)
    _as_papa()

    body = client.get(ROUTE.format(subject_id)).json()

    assert len(body["to_reinforce"]) == 3
    assert body["fragile_count"] == 2
    assert body["open_gap_count"] == 2
    assert body["fragile_count"] + body["open_gap_count"] != len(body["to_reinforce"])


def test_le_panneau_ne_plafonne_PAS_a_huit_notions(client_db) -> None:
    """Le plafond de 8 du Conseil borne un PROMPT envoyé à un modèle, pas une liste à l'écran."""
    client, TestSession = client_db
    subject_id, _ = _seed(TestSession, statuses=["weak"] * 12)
    _as_papa()

    assert len(client.get(ROUTE.format(subject_id)).json()["to_reinforce"]) == 12


def test_le_panneau_ne_voit_QUE_sa_matiere(client_db) -> None:
    client, TestSession = client_db
    subject_id, _ = _seed(TestSession, statuses=["weak", "weak"])
    with TestSession() as db:
        student = db.query(m.StudentProfile).first()
        autre = m.Subject(name="SVT", slug="svt")
        db.add(autre)
        db.flush()
        intrus = m.Skill(subject_id=autre.id, name="Intrus", level="4e")
        db.add(intrus)
        db.flush()
        db.add(
            m.SkillMastery(
                student_id=student.id, skill_id=intrus.id, status="weak", mastery_score=10
            )
        )
        db.commit()
        intrus_id = intrus.id
    _as_papa()

    body = client.get(ROUTE.format(subject_id)).json()

    assert body["fragile_count"] == 2
    assert intrus_id not in [n["skill_id"] for n in body["to_reinforce"]]


def test_une_lacune_a_colonnes_incoherentes_est_rangee_PARTOUT_pareil(client_db) -> None:
    """Borne un écart réel, sans le corriger.

    `Gap` porte `skill_id` ET `subject_id`, et rien ne garantit leur accord : `diagnostics` écrit
    `subject_id=quiz.subject_id`, pas celui de la notion. Le dashboard et `/lacunes` attribuent par
    `Gap.subject_id` ; le Conseil groupe par `Skill.subject_id`. Le panneau doit suivre la première
    convention — sinon une même lacune se compterait dans deux matières selon l'écran regardé.
    """
    client, TestSession = client_db
    subject_id, skills = _seed(TestSession, statuses=["solid"])
    with TestSession() as db:
        autre = m.Subject(name="Physique", slug="physique")
        db.add(autre)
        db.commit()
        autre_id = autre.id
    # La notion est en Mathématiques, la lacune est étiquetée Physique.
    _gap(TestSession, skill_id=skills[0], subject_id=autre_id)
    _as_papa()

    agregat = client.get("/api/parent/dashboard").json()
    maths = next(s for s in agregat["subjects"] if s["id"] == subject_id)
    physique = next(s for s in agregat["subjects"] if s["id"] == autre_id)

    assert maths["gaps_open"] == 0 and physique["gaps_open"] == 1, "l'agrégat suit Gap.subject_id"
    assert client.get(ROUTE.format(subject_id)).json()["open_gap_count"] == 0
    assert client.get(ROUTE.format(autre_id)).json()["open_gap_count"] == 1


# ==================================================================================================
# Deux mesures SRS qu'on ne doit pas confondre
# ==================================================================================================


def test_retard_et_charge_SRS_sont_deux_mesures_distinctes(client_db) -> None:
    """`srs_pressure` compte le RETARD et ne filtre PAS les cartes suspendues ; `review_load` compte
    la charge À VENIR sur 14 jours et les filtre. Les servir sous un seul mot les ferait diverger
    du jour où une carte est suspendue."""
    client, TestSession = client_db
    subject_id, skills = _seed(TestSession, statuses=["weak"])
    now = datetime.now(UTC)
    with TestSession() as db:
        student = db.query(m.StudentProfile).first()
        # DEUX cartes en retard, UNE due dans 3 jours, et UNE SUSPENDUE due dans 5 jours.
        #
        # ⚠️ **Un `card_type` DISTINCT par carte** depuis le 2026-08-13 : la clé
        # `(student_id, skill_id, card_type)` est désormais contrainte en base (addendum
        # ADR-0015 §13). Quatre cartes de même type sur une même notion n'étaient pas seulement
        # interdites — elles étaient **inatteignables par le produit** (`generation.py` déduplique
        # par type, `schedule_review` met à jour). Le décor décrivait un état qui n'existe pas.
        # Les assertions, elles, ne bougent pas : c'est bien le même comptage qui est vérifié.
        cartes = [
            (now - timedelta(days=5), "new", "definition"),
            (now - timedelta(days=2), "new", "method"),
            (now + timedelta(days=3), "new", "example"),
            (now + timedelta(days=5), "suspended", "error_correction"),
        ]
        for due, statut, type_carte in cartes:
            db.add(
                m.SpacedReviewCard(
                    student_id=student.id,
                    skill_id=skills[0],
                    front_markdown="Recto",
                    back_markdown="Verso",
                    card_type=type_carte,
                    due_at=due,
                    status=statut,
                )
            )
        db.commit()
    _as_papa()

    panneau = client.get(ROUTE.format(subject_id)).json()["in_progress"]
    agregat = client.get("/api/parent/dashboard").json()
    charge = next(s for s in agregat["subjects"] if s["id"] == subject_id)["review_load"]

    # Les deux nombres DIFFÈRENT, et chacun pour sa raison propre.
    assert panneau["review_overdue"] == 2, "le retard ne compte que ce qui est DÉJÀ dû"
    assert panneau["review_max_overdue_days"] >= 4, "la plus ancienne commande le pire retard"
    assert sum(charge) == 1, (
        "la charge à venir ne compte que ce qui est devant — et EXCLUT la carte suspendue, "
        "que `srs_pressure` ne filtrerait pas"
    )


# ==================================================================================================
# Ce que la route N'EST PAS
# ==================================================================================================


def test_le_panneau_n_ecrit_RIEN(client_db) -> None:
    """Contrairement au Conseil, qui fige toujours un rapport. Une lecture qui écrit finirait par
    être appelée pour son effet de bord."""
    client, TestSession = client_db
    subject_id, skills = _seed(TestSession, statuses=["weak"])
    _gap(TestSession, skill_id=skills[0], subject_id=subject_id)
    _as_papa()

    tables = (m.Mission, m.Gap, m.SkillMastery, m.AIJob, m.LearningEvent)

    def compte() -> list[int]:
        with TestSession() as db:
            return [db.query(t).count() for t in tables]

    avant = compte()
    assert client.get(ROUTE.format(subject_id)).status_code == 200
    assert compte() == avant


def test_le_panneau_n_appelle_AUCUN_llm(client_db) -> None:
    """C'est ce qui le rend instantané et gratuit — *l'analyse est l'évidence, le Conseil est la
    narration.* Vérifié à la SOURCE : un provider mocké dans le `conftest` rendrait n'importe quel
    appel invisible, donc un test d'exécution serait complaisant."""
    source = Path(__file__).resolve().parents[1] / "modules" / "progress" / "analysis.py"
    texte = source.read_text()

    for interdit in ("modules.ai", "modules.reports", "build_prompt", "get_provider"):
        assert interdit not in texte, f"`{interdit}` n'a rien à faire dans l'analyse"


def test_la_reponse_ne_depend_d_AUCUNE_periode(client_db) -> None:
    """Corollaire du §2 de l'addendum : tout ce qui est fenêtré vit déjà dans `SubjectOut`. Un
    paramètre de période ici ferait refetcher le panneau au clic sur « 30 jours »."""
    client, TestSession = client_db
    subject_id, _ = _seed(TestSession, statuses=["weak"])
    _as_papa()

    nu = client.get(ROUTE.format(subject_id)).json()
    avec = client.get(ROUTE.format(subject_id) + "?period=365").json()

    del nu["generated_at"], avec["generated_at"]
    assert nu == avec, "un query param de période ne doit RIEN changer"


def test_les_statuts_fragiles_viennent_de_projections(client_db) -> None:
    """Le panneau ne rejoue aucun seuil (ADR-0028 §3) : il lit `FRAGILE_STATUSES`. Le verrou porte
    sur `learning`, le statut qu'un mapping écrit à la main oublie le plus souvent."""
    assert "learning" in p.FRAGILE_STATUSES
    client, TestSession = client_db
    subject_id, _ = _seed(TestSession, statuses=["learning"])
    _as_papa()

    assert client.get(ROUTE.format(subject_id)).json()["fragile_count"] == 1


# ==================================================================================================
# LE verrou du chantier : un constat ne peut plus annoncer un nombre que sa preuve ne sert pas
# ==================================================================================================


def test_le_compte_du_constat_EGALE_ce_que_sa_preuve_sert(client_db) -> None:
    """Le garde-fou qui manquait, et le seul qui protège durablement quelque chose.

    Le bug d'origine : « Français : 8 notions à renforcer » avec une preuve menant à une page qui
    en montrait UNE. Le constat comptait les notions FRAGILES, sa preuve listait des lignes `Gap` —
    deux populations disjointes sous le même mot, sans que rien ne s'en aperçoive.

    Le test existant (`test_aucun_constat_sans_preuve`) ne vérifiait que « `href` non vide et
    `count >= 0` » : il passait avec un lien vers une route inexistante.

    Ici on SUIT le lien : on résout la matière depuis son `href`, on appelle la cible, et on exige
    que le compte annoncé soit exactement ce qu'elle sert. C'est ce qui ferme la CLASSE entière du
    défaut, pas seulement son occurrence de 2026-08-05.
    """
    client, TestSession = client_db
    # Neuf fragiles : au-dessus du plafond de 8 du Conseil, pour que toute fuite de ce plafond dans
    # le panneau fasse diverger le compte de la liste.
    subject_id, _ = _seed(TestSession, statuses=["weak"] * 5 + ["learning"] * 4)
    _as_papa()

    constats = client.get("/api/parent/dashboard").json()["reading"]
    a_renforcer = [r for r in constats if r["trend"] == "watch"]
    assert a_renforcer, "au moins un constat « à renforcer » attendu"

    for constat in a_renforcer:
        href = constat["evidence"]["href"]
        slug = parse_qs(urlparse(href).query).get("subject", [None])[0]
        assert slug, f"la preuve doit désigner une matière : {href}"
        assert parse_qs(urlparse(href).query).get("panel") == ["ou-agir"], (
            f"la preuve d'un constat « à renforcer » doit ouvrir le PANNEAU, pas une autre page "
            f"qui compte une autre population : {href}"
        )

        with TestSession() as db:
            cible = db.query(m.Subject).filter_by(slug=slug).first()
        assert cible is not None, f"matière introuvable pour {href}"

        servi = client.get(ROUTE.format(cible.id)).json()
        assert constat["evidence"]["count"] == servi["fragile_count"], (
            f"« {constat['text']} » annonce {constat['evidence']['count']}, "
            f"sa preuve en sert {servi['fragile_count']}"
        )
        # Et le compte servi n'est pas un champ décoratif : il EST la liste nommée.
        assert servi["fragile_count"] == sum(
            1 for n in servi["to_reinforce"] if n["is_fragile"]
        )
