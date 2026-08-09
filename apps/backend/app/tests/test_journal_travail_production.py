"""Un travail dit ce qu'il a produit — addendum ADR-0041.

🔴 **Le verrou de ce fichier est `test_rien_produit_ne_rend_JAMAIS_de_route`.** Sans lui, la
réparation se retourne : un travail qui n'a rien fabriqué rattacherait une pièce préexistante et
ferait croire qu'il l'a faite — le défaut inverse de celui qu'on corrige, et strictement plus
trompeur que le silence d'avant. Il est écrit pour **survivre à un routeur qui rend une route** :
on lui en fournit une exprès, et il exige `None` quand même.

Le reste couvre une règle par `job_type`, plus les deux dégradations qui doivent rester muettes
(type inconnu, `output_json` absent).
"""

from datetime import datetime, timezone

import pytest

import app.db.models as m
from app.modules.production import journal
from app.tests.test_production_coverage import _seed_lesson, _seed_year

#: Une route valide pour CE job — fournie même quand la règle doit la refuser. C'est ce qui rend le
#: verrou capable d'attraper un `route` recopié sans condition.
ROUTES = {1: "/programme?subject=1&chapter=2&lesson=3"}


def _job(
    job_type: str, sortie: dict | None, *, status: str = "succeeded", entree: dict | None = None
) -> m.AIJob:
    """Un travail NON persisté : `resume_de_production` est une fonction pure de ses champs."""
    return m.AIJob(
        id=1,
        job_type=job_type,
        status=status,
        input_json=entree,
        output_json=sortie,
        created_by="file",
    )


def _resume(job_type: str, sortie: dict | None, *, status: str = "succeeded") -> dict | None:
    return journal.resume_de_production(_job(job_type, sortie, status=status), ROUTES)


# --- Une règle par type -------------------------------------------------------------------------


def test_equipement_qui_a_tout_saute_dit_qu_il_n_a_rien_produit():
    """Le cas qui a déclenché le chantier : `fait · 0 s` sur cinq pièces déjà présentes."""
    r = _resume(
        "equip_notion",
        {"skill_id": 64, "generated": [], "skipped": ["cours", "fiche", "srs", "quiz", "mindmap"]},
    )
    assert r["texte"] == "rien produit — 5 pièces existaient déjà"
    assert r["ton"] == "avertissement"


def test_equipement_qui_a_produit_compte_ses_pieces_et_mene_quelque_part():
    r = _resume("equip_notion", {"skill_id": 64, "generated": ["fiche", "quiz"], "skipped": []})
    assert r["texte"] == "2 pièces produites"
    assert r["route"] == ROUTES[1]


def test_redaction_du_cours_dit_le_cours_et_pas_sa_longueur():
    """⚠️ `content_chars` vit sur la trace `parent`, exclue du Journal (constat 1 de l'addendum)."""
    r = _resume("lesson_content", {"lesson_id": 114})
    assert r["texte"] == "cours rédigé"
    assert r["ton"] == "succes"
    assert r["route"] == ROUTES[1]


def test_lecons_du_chapitre_dit_un_ETAT_et_jamais_une_creation():
    """🔴 **Trouvé à la relecture visuelle du 2026-08-09**, et c'est le défaut qu'on répare, à
    l'envers : l'écran disait « 7 leçons créées » là où le job en avait fabriqué **5** — deux des
    sept dataient de trois jours plus tôt (114 et 115, créées le 06/08).

    `lesson_ids` est l'état RÉSULTANT du chapitre. Le compte réellement créé (`lessons_count`) vit
    sur la trace `parent`, exclue du Journal : il ne peut pas être dit, donc il ne se devine pas.
    """
    r = _resume("curriculum_lessons", {"chapter_id": 44, "lesson_ids": [114, 115, 153, 154]})
    assert r["texte"] == "4 leçons au chapitre"
    assert "créé" not in r["texte"], "surestimer serait le défaut même que cet addendum corrige"
    assert r["ton"] == "neutre", "un état n'est pas un succès de production"


def test_le_singulier_est_respecte():
    """« 1 leçons créées » se lit comme un bug de l'écran, et ferait douter du reste."""
    assert _resume("curriculum_lessons", {"lesson_ids": [114]})["texte"] == "1 leçon au chapitre"
    assert _resume("srs_cards_generate", {"skill_id": 1, "created": 1})["texte"] == "1 carte créée"


def test_cartes_de_revision_comptent_les_cartes():
    r = _resume("srs_cards_generate", {"skill_id": 149, "created": 3, "updated": 0})
    assert r["texte"] == "3 cartes créées"
    assert r["ton"] == "succes"


def test_cartes_de_revision_sans_creation_le_dit():
    """`created: 0` est un succès qui n'a rien produit — exactement le cas qu'on rendait invisible."""
    r = _resume("srs_cards_generate", {"skill_id": 149, "created": 0, "updated": 4})
    assert r["texte"] == "aucune carte nouvelle"
    assert r["ton"] == "avertissement"


def test_diagnostic_mene_a_SA_matiere_et_le_dit():
    """🔴 **Décision 4 amendée après relecture visuelle (2026-08-09).**

    Sans route ni indication, la ligne laissait un doute : ni lien, ni mot disant où aller. La route
    est donc de grain MATIÈRE — et le libellé le NOMME. Ce n'est pas le défaut de l'`adr-0047`
    Décision 8 (promettre un grain notion, livrer un grain matière) : ici on annonce la matière et
    on livre la matière.
    """
    job = _job(
        "diagnostic_generate",
        {"quiz_id": 57, "subject": "Histoire-Géo", "questions_count": 40},
        entree={"subject_id": 3},
    )
    r = journal.resume_de_production(job, {1: "/diagnostics?subject=3"})
    assert r["texte"] == "40 questions · Histoire-Géo"
    assert r["route"] == "/diagnostics?subject=3"
    assert r["route_texte"] == "voir les diagnostics d'Histoire-Géo →", (
        "trois matières sur huit commencent par une voyelle — sans élision, un libellé sur cinq "
        "se lit de travers"
    )
    assert "cette" not in r["route_texte"], "le libellé ne doit pas promettre CE diagnostic"


def test_la_route_du_diagnostic_se_compose_sur_input_json(client_db):
    """La sortie ne porte que le NOM de la matière ; l'id est dans l'entrée, déjà chargée."""
    _, TestSession = client_db
    db = TestSession()
    job = m.AIJob(
        job_type="diagnostic_generate",
        status="succeeded",
        created_by="file",
        created_at=datetime.now(timezone.utc),
        input_json={"subject_id": 3, "level": None},
        output_json={"quiz_id": 57, "subject": "Histoire-Géo", "questions_count": 40},
    )
    db.add(job)
    db.flush()
    assert journal.routes_des_travaux(db, [job]) == {job.id: "/diagnostics?subject=3"}


@pytest.mark.parametrize(
    "matiere,attendu",
    [
        ("Mathématiques", "voir les diagnostics de Mathématiques →"),
        ("Histoire-Géo", "voir les diagnostics d'Histoire-Géo →"),
        ("Anglais", "voir les diagnostics d'Anglais →"),
        ("Espagnol", "voir les diagnostics d'Espagnol →"),
        ("SVT", "voir les diagnostics de SVT →"),
    ],
)
def test_l_elision_du_libelle(matiere, attendu):
    job = _job(
        "diagnostic_generate", {"subject": matiere, "questions_count": 40}, entree={"subject_id": 3}
    )
    assert journal.resume_de_production(job, {1: "/diagnostics?subject=3"})["route_texte"] == attendu


def test_un_diagnostic_sans_matiere_identifiable_n_a_pas_de_lien():
    """Un lien sans matière déposerait Papa sur « Toutes » — le retour du lien au hasard."""
    r = journal.resume_de_production(
        _job("diagnostic_generate", {"questions_count": 40}, entree={}), {}
    )
    assert r["route"] is None
    assert r["route_texte"] is None


# --- Les dégradations, qui doivent rester muettes -------------------------------------------------


def test_un_type_sans_regle_degrade_proprement():
    """Un `job_type` neuf ne casse pas la page : il ne dit simplement rien de plus."""
    r = _resume("council_generate", {"report_subjects": 1})
    assert r == {"texte": "terminé", "ton": "neutre", "route": None, "route_texte": None}


@pytest.mark.parametrize(
    "job_type,sortie",
    [
        ("lesson_content", {"lesson_id": 114}),
        ("curriculum_lessons", {"lesson_ids": [1, 2]}),
        ("srs_cards_generate", {"skill_id": 1, "created": 2}),
        ("equip_notion", {"skill_id": 1, "generated": ["fiche"]}),
    ],
)
def test_tout_lien_NOMME_sa_destination(job_type, sortie):
    """🔴 Un « voir → » nu laisse Papa découvrir où il atterrit — trouvé à la relecture du
    2026-08-09, et c'est le défaut que l'`adr-0047` Décision 8 avait déjà corrigé ailleurs."""
    r = journal.resume_de_production(_job(job_type, sortie), ROUTES)
    assert r["route"] == ROUTES[1]
    assert r["route_texte"], "une route sans libellé rendrait « voir → » nu"
    assert r["route_texte"] != "voir →"
    assert r["route_texte"].endswith("→")


@pytest.mark.parametrize("sortie", [None, {}, {"lesson_id": None}, "pas un dict"])
def test_une_sortie_absente_ou_malformee_ne_leve_pas(sortie):
    job = m.AIJob(id=1, job_type="lesson_content", status="succeeded", created_by="file")
    job.output_json = sortie
    assert journal.resume_de_production(job, ROUTES) is None


@pytest.mark.parametrize("status", ["queued", "running", "failed"])
def test_un_travail_non_termine_ne_dit_rien_de_sa_production(status):
    """Une phrase au futur se lirait comme un fait ; l'échec, lui, a déjà son `error`."""
    assert _resume("srs_cards_generate", {"created": 3}, status=status) is None


# --- 🔴 LE VERROU ---------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "job_type,sortie",
    [
        ("equip_notion", {"skill_id": 64, "generated": [], "skipped": ["cours", "fiche"]}),
        ("equip_notion", {"skill_id": 64, "generated": [], "skipped": []}),
        ("srs_cards_generate", {"skill_id": 149, "created": 0}),
        ("curriculum_lessons", {"chapter_id": 44, "lesson_ids": []}),
    ],
)
def test_rien_produit_ne_rend_JAMAIS_de_route(job_type, sortie):
    """🔴 **Le verrou de l'addendum (décision 3).**

    `ROUTES` contient une route valide pour ce job — la règle doit la refuser quand même. Rattacher
    une pièce préexistante à un travail qui ne l'a pas faite ferait croire le contraire ; c'est la
    doctrine déjà écrite pour les pièces `skipped` (`journal.cible()`), appliquée ici.
    """
    r = journal.resume_de_production(_job(job_type, sortie), ROUTES)
    assert r["route"] is None
    assert r["route_texte"] is None, "un libellé sans route est un lien fantôme"
    assert r["ton"] == "avertissement"


# --- La résolution des routes, en base ------------------------------------------------------------


def test_les_routes_sont_resolues_en_lot_et_pointent_la_lecon(client_db):
    """`lesson_content` ne porte qu'un `lesson_id` : chapitre et matière viennent d'une requête en
    lot (addendum §5), jamais d'un aller-retour par ligne."""
    _, TestSession = client_db
    db = TestSession()
    _, subject, chapter = _seed_year(db)
    lesson = _seed_lesson(db, chapter)
    db.flush()

    job = m.AIJob(
        job_type="lesson_content",
        status="succeeded",
        created_by="file",
        created_at=datetime.now(timezone.utc),
        output_json={"lesson_id": lesson.id},
    )
    db.add(job)
    db.flush()

    routes = journal.routes_des_travaux(db, [job])
    assert routes[job.id] == (
        f"/programme?subject={subject.id}&chapter={chapter.id}&lesson={lesson.id}"
    )


def test_un_travail_dont_la_route_ne_se_resout_pas_n_en_a_pas(client_db):
    """Une leçon inexistante ne doit pas produire un lien vers le vide."""
    _, TestSession = client_db
    db = TestSession()
    job = m.AIJob(
        job_type="lesson_content",
        status="succeeded",
        created_by="file",
        created_at=datetime.now(timezone.utc),
        output_json={"lesson_id": 999_999},
    )
    db.add(job)
    db.flush()
    assert journal.routes_des_travaux(db, [job]) == {}
