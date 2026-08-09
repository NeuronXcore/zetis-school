"""La fiabilité d'une mesure de diagnostic (ADR-0048, Session A).

🔴 **RÈGLE DE VOCABULAIRE.** Tout ici prend **la mesure** pour sujet, jamais l'enfant. Un nom de
test qui dirait « triche » serait un défaut, pas un raccourci.

Ce fichier porte les verrous des **trois pièges qui rendraient le chantier inopérant EN RESTANT
VERT** — ce sont les trois premiers, et ils sont écrits pour rougir sur un sabotage précis :

1. le contraste calculé **après** `_upsert_skill_mastery` vaut toujours zéro ;
2. `NON_ACTIVITY_EVENTS` au lieu de `NON_WORK_EVENTS` compte `page_viewed` comme du travail ;
3. **une source de trace manquante** fait déclencher sur ce que ZETIS a déjà mesuré.

100 % hors-ligne (SQLite + `FakeLLMProvider`).
"""

from datetime import datetime, timezone

import pytest

import app.db.models as m
from app.modules.diagnostics import fiabilite
from app.modules.diagnostics.fiabilite import (
    VERDICT_A_CONFIRMER,
    VERDICT_RIEN_A_SIGNALER,
    notions_sans_trace,
)
from app.tests.test_diagnostics import _generate, as_massimo, as_papa

MAINTENANT = datetime(2026, 8, 9, tzinfo=timezone.utc)


# ================================================================================================
# LA RÈGLE — un FAIT déclenche seul, un INDICE ne déclenche jamais
# ================================================================================================


def _evaluer(*, reponses=None, conditions=None, per_skill=None, sans_trace=None) -> dict:
    return fiabilite.evaluer(
        reponses=reponses or [],
        conditions=conditions,
        per_skill=per_skill or [],
        sans_trace=sans_trace or set(),
    )


def test_rien_dobserve_donne_rien_a_signaler_jamais_null() -> None:
    """Dès lors que le serveur a REGARDÉ, le verdict existe.

    `None` est réservé aux passations d'avant le chantier : les deux états se distinguent à
    l'écran, et les confondre ferait passer une absence d'instrument pour un constat d'instrument.
    """
    bloc = _evaluer()
    assert bloc["verdict"] == VERDICT_RIEN_A_SIGNALER
    assert bloc is not None
    assert bloc["regle_version"] == fiabilite.REGLE_VERSION


@pytest.mark.parametrize(
    "nom, reponses, conditions",
    [
        ("l'écran quitté pendant la passation", [], {"sorties_ecran": 3}),
        ("un énoncé copié", [{"enonce_copie": True}], None),
        ("le plein écran quitté", [], {"plein_ecran_quitte": True}),
    ],
)
def test_un_fait_seul_declenche(nom, reponses, conditions) -> None:
    """Un fait suffit — aucun seuil à inventer, l'écran a été quitté, point.

    Sabotage : exiger deux faits pour déclencher → les trois cas rougissent.
    """
    assert _evaluer(reponses=reponses, conditions=conditions)["verdict"] == VERDICT_A_CONFIRMER, nom


def test_les_indices_ne_declenchent_JAMAIS_meme_a_deux() -> None:
    """🔴 Le verrou de la frontière fait/indice.

    Six réponses très rapides ET une fenêtre redimensionnée : deux indices au maximum de leur
    force, et le verdict reste `rien_a_signaler`. Lenteur ≠ triche, rapidité ≠ copie, et un iPad
    qu'on tourne redimensionne la fenêtre.

    Sabotage : faire de `taille_changee` ou de `reponses_rapides` un déclencheur → rouge.
    """
    bloc = _evaluer(
        reponses=[{"ms_depuis_precedente": 100}] * 5 + [{"ms_depuis_precedente": 30000}] * 5,
        conditions={"taille_changee": True},
    )
    assert bloc["indices"]["reponses_rapides"] >= 1, "le décor doit produire des réponses rapides"
    assert bloc["indices"]["taille_changee"] is True
    assert bloc["verdict"] == VERDICT_RIEN_A_SIGNALER
    assert bloc["declencheurs"] == []


def test_les_indices_sont_AFFICHES_meme_sans_declenchement() -> None:
    """Papa lit mieux qu'un seuil : les cacher reviendrait à décider à sa place."""
    bloc = _evaluer(
        reponses=[{"ms_depuis_precedente": 100}] * 5 + [{"ms_depuis_precedente": 30000}] * 5,
        conditions={"taille_changee": True},
    )
    assert bloc["indices"]["reponses_rapides"] > 0


def test_la_rapidite_ne_dit_rien_sous_quatre_reponses() -> None:
    """Sur trois réponses, une « médiane » ne décrit rien — on n'invente pas un indice."""
    trois = [{"ms_depuis_precedente": 10}, {"ms_depuis_precedente": 5000}, {"ms_depuis_precedente": 20}]
    assert _evaluer(reponses=trois)["indices"]["reponses_rapides"] == 0
    # ⚠️ L'anti-test-à-vide : à QUATRE réponses, le même décor rend un indice. Sans cette
    # contre-épreuve, le test passerait aussi bien si le champ était ignoré — ce qui est
    # EXACTEMENT ce qui s'est produit au renommage de `ms_reflexion` (il est resté vert pour la
    # mauvaise raison, attrapé en relisant les 4 rouges).
    assert _evaluer(reponses=trois + [{"ms_depuis_precedente": 5000}])["indices"]["reponses_rapides"] > 0


# ================================================================================================
# LE CONTRASTE — seuils
# ================================================================================================


def _notions(n: int, *, score: int) -> list[dict]:
    return [{"skill_id": i, "score": score, "skill_name": f"n{i}"} for i in range(1, n + 1)]


def test_le_contraste_exige_le_plancher_ET_la_majorite() -> None:
    """`>= 2` **et** majorité. Une notion isolée ne suffit pas, et un diagnostic à une notion non plus.

    Sabotage : retirer le plancher, ou remplacer la majorité par « au moins une » → rouge.
    """
    # 1 notion sur 1, acquise et sans trace : le plancher bloque.
    assert (
        _evaluer(per_skill=_notions(1, score=100), sans_trace={1})["verdict"]
        == VERDICT_RIEN_A_SIGNALER
    )
    # 2 sur 6 : le plancher passe, la majorité bloque.
    assert (
        _evaluer(per_skill=_notions(6, score=100), sans_trace={1, 2})["verdict"]
        == VERDICT_RIEN_A_SIGNALER
    )
    # 4 sur 6 : les deux passent.
    bloc = _evaluer(per_skill=_notions(6, score=100), sans_trace={1, 2, 3, 4})
    assert bloc["verdict"] == VERDICT_A_CONFIRMER
    assert "contraste" in bloc["declencheurs"]


def test_une_notion_sans_trace_mais_RATEE_ne_contraste_pas() -> None:
    """Le contraste porte sur ce que la mesure donne **acquis**, pas sur l'inconnu.

    Découvrir une notion et la rater est le déroulement NORMAL d'un diagnostic.
    """
    bloc = _evaluer(per_skill=_notions(4, score=20), sans_trace={1, 2, 3, 4})
    assert bloc["verdict"] == VERDICT_RIEN_A_SIGNALER
    assert bloc["faits"]["acquises_sans_trace"] == 0


# ================================================================================================
# 🔴 PIÈGE N° 3 — LES TROIS SOURCES DE TRACE
# ================================================================================================


def _decor_trois_sources(db) -> dict[str, int]:
    """Quatre notions : une connue par CHAQUE source, une connue par aucune."""
    from app.modules.eli5.service import get_default_student

    eleve = get_default_student(db)
    notions = {}
    for cle in ("mesuree", "travaillee", "cours_lu", "inconnue"):
        s = m.Skill(subject_id=1, name=f"Notion {cle}", level="4e")
        db.add(s)
        db.flush()
        notions[cle] = s.id

    # Source 1 — la notion a été MESURÉE (diagnostic, quiz, mission).
    db.add(m.SkillMastery(student_id=eleve.id, skill_id=notions["mesuree"]))
    # Source 2 — TRAVAILLÉE sans être mesurée (ELI5, chat, révision SRS).
    db.add(
        m.LearningEvent(
            student_id=eleve.id,
            skill_id=notions["travaillee"],
            event_type="eli5_explained",
            created_at=MAINTENANT,
        )
    )
    # Source 3 — le COURS A ÉTÉ LU.
    lecon = m.Lesson(chapter_id=1, title="Un cours", created_by="papa")
    db.add(lecon)
    db.flush()
    db.add(m.LessonSkill(lesson_id=lecon.id, skill_id=notions["cours_lu"]))
    db.add(m.LessonView(student_id=eleve.id, lesson_id=lecon.id, seen_at=MAINTENANT))
    db.commit()
    return notions


@pytest.mark.parametrize("source", ["mesuree", "travaillee", "cours_lu"])
def test_chaque_source_compte_SEULE(client_db, source) -> None:
    """🔴 UN TEST PAR SOURCE. Sabotage : retirer cette source de `notions_sans_trace` → rouge.

    Écrits séparément **exprès** : un test unique sur les trois laisserait une source manquante
    passer pour un défaut des deux autres, et le message de rouge ne désignerait rien.

    **Pourquoi les trois** : sur les dix appels à `log_learning_event`, trois seulement passent un
    `skill_id`, et le diagnostic n'en fait pas partie. `LearningEvent` seul — ce que la spec disait
    d'abord — aurait compté « jamais rencontrée » une notion mesurée par trois diagnostics.
    """
    client, TestSession = client_db
    with TestSession() as db:
        notions = _decor_trois_sources(db)
        from app.modules.eli5.service import get_default_student

        sans_trace = notions_sans_trace(
            db, student_id=get_default_student(db).id, skill_ids=list(notions.values())
        )
    assert notions[source] not in sans_trace, f"la source « {source} » n'est pas lue"
    assert notions["inconnue"] in sans_trace, "l'anti-test-à-vide : l'inconnue doit rester sans trace"


def test_les_trois_sources_ensemble_ne_laissent_QUE_l_inconnue(client_db) -> None:
    """L'égalité exacte — le filet qui attrape une source de trop comme une source de moins."""
    client, TestSession = client_db
    with TestSession() as db:
        notions = _decor_trois_sources(db)
        from app.modules.eli5.service import get_default_student

        sans_trace = notions_sans_trace(
            db, student_id=get_default_student(db).id, skill_ids=list(notions.values())
        )
    assert sans_trace == {notions["inconnue"]}


def test_page_viewed_n_est_PAS_du_travail(client_db) -> None:
    """🔴 PIÈGE N° 2. Sabotage : `NON_ACTIVITY_EVENTS` au lieu de `NON_WORK_EVENTS` → rouge.

    Sans `page_viewed` dans le filtre, **ouvrir une page suffirait à éteindre le signal**. Le dépôt
    a déjà payé ce défaut sur `production.runner.massimo_is_active`.
    """
    client, TestSession = client_db
    with TestSession() as db:
        from app.modules.eli5.service import get_default_student

        eleve = get_default_student(db)
        notion = m.Skill(subject_id=1, name="Notion seulement survolée", level="4e")
        db.add(notion)
        db.flush()
        db.add(
            m.LearningEvent(
                student_id=eleve.id,
                skill_id=notion.id,
                event_type="page_viewed",
                created_at=MAINTENANT,
            )
        )
        db.commit()
        sans_trace = notions_sans_trace(db, student_id=eleve.id, skill_ids=[notion.id])
    assert notion.id in sans_trace, "la navigation n'est pas du travail"


# ================================================================================================
# 🔴 PIÈGE N° 1 — L'ORDRE, DE BOUT EN BOUT
# ================================================================================================


def _passer(client, quiz_id: int, *, corps: dict | None = None) -> dict:
    quiz = client.get(f"/api/diagnostics/quizzes/{quiz_id}").json()
    reponses = [{"question_id": q["id"], "choice_index": 0} for q in quiz["questions"]]
    if corps is not None:
        for r in reponses:
            r.update(corps)
    return client.post(
        f"/api/diagnostics/quizzes/{quiz_id}/submit", json={"answers": reponses}
    ).json()


def test_le_contraste_ne_se_compare_pas_a_LUI_MEME(client_db, executer_travail) -> None:
    """🔴 LE VERROU CENTRAL DE LA SESSION.

    Une passation sur des notions **jamais rencontrées**, toutes réussies : le contraste doit
    déclencher. `submit()` écrit un `SkillMastery` pour chacune — s'il le fait **avant** de lire
    les traces, la passation se compare à elle-même, `sans_trace` est vide, et le verdict retombe
    à `rien_a_signaler` **sans qu'aucune autre assertion du dépôt ne bouge**.

    Sabotage : déplacer l'appel à `notions_sans_trace` après la boucle de propagation → rouge.
    """
    client, TestSession = client_db
    with TestSession() as db:
        db.add(m.Skill(subject_id=1, name="Fractions", level="4e"))
        db.commit()
    body = _generate(client, TestSession, executer_travail)
    _passer(client, body["quiz_id"])

    as_papa()
    detail = client.get("/api/diagnostics/results").json()[0]
    assert detail["fiabilite"]["verdict"] == VERDICT_A_CONFIRMER
    assert "contraste" in detail["fiabilite"]["declencheurs"]
    assert detail["fiabilite"]["faits"]["acquises_sans_trace"] >= 2


def test_l_evenement_du_journal_reste_ecrit_par_le_ROUTEUR(client_db, executer_travail) -> None:
    """🔴 PIÈGE N° 3 bis — un ordre qui vit dans un AUTRE fichier que le calcul.

    `log_learning_event` est appelé par `diagnostics/router.py`, **après** le retour de `submit()`.
    C'est ce qui empêche le contraste de voir l'événement de sa propre passation. Le déplacer dans
    le service casserait le contraste **sans toucher au contraste**.

    Ce test tient l'ordre par son effet observable : l'événement existe en base APRÈS la
    soumission, et le verdict a quand même vu les notions comme sans trace.
    """
    client, TestSession = client_db
    with TestSession() as db:
        db.add(m.Skill(subject_id=1, name="Fractions", level="4e"))
        db.commit()
    body = _generate(client, TestSession, executer_travail)
    resultat = _passer(client, body["quiz_id"])

    with TestSession() as db:
        evenements = db.query(m.LearningEvent).filter_by(event_type="quiz_attempted").all()
        attempt = db.get(m.QuizAttempt, resultat["attempt_id"])
        assert evenements, "le journal d'activité doit avoir sa trace"
        assert attempt.reliability_json["faits"]["acquises_sans_trace"] >= 2, (
            "le contraste a vu la passation APRÈS son propre événement — l'appel a migré "
            "dans le service"
        )


# ================================================================================================
# LE CONTRAT — ce qui est SERVI, testé sur la ROUTE
# ================================================================================================


def test_le_contrat_d_avant_le_chantier_marche_A_L_IDENTIQUE(client_db, executer_travail) -> None:
    """Un corps sans aucun champ optionnel reste accepté, et produit un verdict.

    C'est ce qui garde les tests existants verts et permet de déployer le back avant le front.
    """
    client, TestSession = client_db
    with TestSession() as db:
        db.add(m.Skill(subject_id=1, name="Fractions", level="4e"))
        db.commit()
    body = _generate(client, TestSession, executer_travail)
    resultat = _passer(client, body["quiz_id"])
    assert "attempt_id" in resultat

    with TestSession() as db:
        attempt = db.get(m.QuizAttempt, resultat["attempt_id"])
        assert attempt.reliability_json is not None, "le serveur a regardé : ce n'est pas NULL"
        assert attempt.reliability_json["verdict"] in (
            VERDICT_A_CONFIRMER,
            VERDICT_RIEN_A_SIGNALER,
        )


def test_une_passation_d_avant_le_chantier_reste_NULL(client_db) -> None:
    """🔴 `NULL` ≠ `rien_a_signaler`, et rien ne rétro-remplit.

    Trois états, pas deux : on ne peut pas reconstituer des conditions qu'on n'a pas observées, et
    prétendre le contraire produirait un instrument qui rassure sans avoir mesuré.
    """
    client, TestSession = client_db
    with TestSession() as db:
        ancienne = m.QuizAttempt(quiz_id=1, student_id=1, context="diagnostic")
        db.add(ancienne)
        db.commit()
        assert ancienne.reliability_json is None
        relue = db.get(m.QuizAttempt, ancienne.id)
        assert relue.reliability_json is None, "aucun backfill, aucune valeur par défaut"


def test_les_signaux_par_reponse_logent_SANS_migration(client_db, executer_travail) -> None:
    """`answer_json` est déjà un JSON libre — le contrat par question n'a rien coûté au schéma."""
    client, TestSession = client_db
    with TestSession() as db:
        db.add(m.Skill(subject_id=1, name="Fractions", level="4e"))
        db.commit()
    body = _generate(client, TestSession, executer_travail)
    resultat = _passer(client, body["quiz_id"], corps={"ms_depuis_precedente": 4200, "enonce_copie": True})

    with TestSession() as db:
        reponse = db.query(m.QuizAnswer).filter_by(attempt_id=resultat["attempt_id"]).first()
        assert reponse.answer_json["ms_depuis_precedente"] == 4200
        assert reponse.answer_json["enonce_copie"] is True
        attempt = db.get(m.QuizAttempt, resultat["attempt_id"])
        assert attempt.reliability_json["faits"]["enonces_copies"] >= 1


def test_la_duree_et_le_debut_cessent_d_etre_faux(client_db, executer_travail) -> None:
    """`started_at` valait `completed_at`, au même instant, et `duration_seconds` n'était JAMAIS
    écrit. Le client mesure enfin le temps — on remplit les deux."""
    client, TestSession = client_db
    with TestSession() as db:
        db.add(m.Skill(subject_id=1, name="Fractions", level="4e"))
        db.commit()
    body = _generate(client, TestSession, executer_travail)
    quiz = client.get(f"/api/diagnostics/quizzes/{body['quiz_id']}").json()
    resultat = client.post(
        f"/api/diagnostics/quizzes/{body['quiz_id']}/submit",
        json={
            "answers": [{"question_id": q["id"], "choice_index": 0} for q in quiz["questions"]],
            "conditions": {"ms_total": 214000, "signaux_observables": ["sortie_ecran"]},
        },
    ).json()

    with TestSession() as db:
        attempt = db.get(m.QuizAttempt, resultat["attempt_id"])
        assert attempt.duration_seconds == 214
        assert attempt.started_at < attempt.completed_at, "started_at n'est plus completed_at"
        assert attempt.reliability_json["portee"]["observables"] == ["sortie_ecran"]


def test_le_verdict_est_servi_a_Papa_par_la_ROUTE(client_db, executer_travail) -> None:
    """⚠️ Testé sur la ROUTE, pas sur le service : `response_model` filtre EN SILENCE les champs
    non déclarés, et le dépôt s'est fait avoir deux fois de suite sur ce motif (ADR-0045, -0047).
    """
    client, TestSession = client_db
    with TestSession() as db:
        db.add(m.Skill(subject_id=1, name="Fractions", level="4e"))
        # ⚠️ `apercu` filtre son rail sur l'ANNÉE ACTIVE : sans elle, il rend un rail vide et le
        # verrou de contrat passerait sur une liste sans ligne — un test à vide, exactement ce que
        # ce dépôt sabote ailleurs pour s'en prémunir. L'assertion `passees and …` l'a attrapé.
        eleve = db.query(m.StudentProfile).first()
        annee = m.SchoolYear(
            student_id=eleve.id, label="2026-2027", level="4e", status="active"
        )
        db.add(annee)
        db.flush()
        db.add(m.SchoolYearSubject(school_year_id=annee.id, subject_id=1))
        db.commit()
    body = _generate(client, TestSession, executer_travail)
    resultat = _passer(client, body["quiz_id"])

    as_papa()
    detail = client.get(f"/api/diagnostics/results/{resultat['attempt_id']}").json()
    assert detail["fiabilite"] is not None, "le champ a été filtré à la sérialisation"
    assert detail["fiabilite"]["regle_version"] == fiabilite.REGLE_VERSION
    assert "faits" in detail["fiabilite"] and "indices" in detail["fiabilite"]

    apercu = client.get("/api/diagnostics/apercu").json()
    passees = [ligne for ligne in apercu["rail"] if ligne["cran"] == "passe"]
    assert passees and passees[0]["fiabilite_verdict"] is not None
    non_passees = [ligne for ligne in apercu["rail"] if ligne["cran"] != "passe"]
    for ligne in non_passees:
        assert ligne["fiabilite_verdict"] is None, "un cran non passé n'a pas de mesure à qualifier"


def test_MASSIMO_ne_voit_RIEN_du_verdict(client_db, executer_travail) -> None:
    """🔴 Il ne voit rien et n'est jamais accusé.

    ⚠️ **Ce verrou porte sur le CONTRAT, et le sabotage naïf reste VERT** — mesuré. Ajouter
    `"fiabilite": attempt.reliability_json` au service ne fuit pas : `DiagnosticResultOut` ne
    déclare pas le champ, et `response_model` le retire **en silence**. C'est le même mécanisme qui
    a coûté deux chantiers au dépôt (ADR-0045, -0047), et qui joue ici **en notre faveur**.

    Le sabotage qui vise juste demande donc **deux gestes** : produire le champ dans le service
    **et** le déclarer dans le schéma enfant. Joué le 2026-08-09 → rouge. Sans cette précision, la
    prochaine session croirait le verrou plus fort qu'il n'est, ou le croirait mort.
    """
    client, TestSession = client_db
    with TestSession() as db:
        db.add(m.Skill(subject_id=1, name="Fractions", level="4e"))
        db.commit()
    body = _generate(client, TestSession, executer_travail)
    resultat = _passer(client, body["quiz_id"])
    relecture = client.get(f"/api/diagnostics/mes-resultats/{resultat['attempt_id']}").json()

    for nom, payload in (("submit", resultat), ("relecture", relecture)):
        texte = str(payload)
        for interdit in ("fiabilite", "verdict", "a_confirmer", "declencheurs"):
            assert interdit not in texte, f"« {nom} » laisse fuir {interdit} chez Massimo"


# ================================================================================================
# LA VERBALISATION
# ================================================================================================


def test_la_carte_est_servie_a_CHAQUE_passation(client_db, executer_travail) -> None:
    """🔴 Quel que soit le verdict. La conditionner au doute la transformerait en accusation.

    Sabotage : ne la servir que si `verdict == a_confirmer` → rouge.
    """
    client, TestSession = client_db
    with TestSession() as db:
        db.add(m.Skill(subject_id=1, name="Fractions", level="4e"))
        db.commit()
    body = _generate(client, TestSession, executer_travail)
    resultat = _passer(client, body["quiz_id"])
    assert resultat["verbalisation"] is not None
    assert resultat["verbalisation"]["skill_name"]
    assert resultat["verbalisation"]["explication"] is None


def test_le_tirage_est_DETERMINISTE(client_db, executer_travail) -> None:
    """Recharger repose la MÊME question — sinon aucun test ne tient cet écran, et Massimo
    pourrait relancer le dé jusqu'à tomber sur une notion qui l'arrange."""
    client, TestSession = client_db
    with TestSession() as db:
        db.add(m.Skill(subject_id=1, name="Fractions", level="4e"))
        db.commit()
    body = _generate(client, TestSession, executer_travail)
    resultat = _passer(client, body["quiz_id"])
    url = f"/api/diagnostics/mes-resultats/{resultat['attempt_id']}"
    tirages = {client.get(url).json()["verbalisation"]["question_id"] for _ in range(5)}
    assert len(tirages) == 1, f"le tirage varie d'un appel à l'autre : {tirages}"
    assert tirages == {resultat["verbalisation"]["question_id"]}


def test_le_mot_de_Massimo_se_range_et_se_relit(client_db, executer_travail) -> None:
    """Il vit sur la RÉPONSE, pas dans le bloc de fiabilité : celui-ci ne porte que ce que ZETIS a
    **observé**, ceci est ce que Massimo a **dit**. Zéro migration."""
    client, TestSession = client_db
    with TestSession() as db:
        db.add(m.Skill(subject_id=1, name="Fractions", level="4e"))
        db.commit()
    body = _generate(client, TestSession, executer_travail)
    resultat = _passer(client, body["quiz_id"])
    attempt_id = resultat["attempt_id"]
    question_id = resultat["verbalisation"]["question_id"]

    rendu = client.post(
        f"/api/diagnostics/mes-resultats/{attempt_id}/explication",
        json={"question_id": question_id, "texte": "j'ai cherché"},
    )
    assert rendu.status_code == 200
    assert rendu.json()["explication"] == "j'ai cherché"

    relecture = client.get(f"/api/diagnostics/mes-resultats/{attempt_id}").json()
    assert relecture["verbalisation"]["explication"] == "j'ai cherché"

    with TestSession() as db:
        attempt = db.get(m.QuizAttempt, attempt_id)
        assert "explication" not in str(attempt.reliability_json), (
            "une parole n'entre pas dans un instrument de mesure"
        )


def test_l_explication_n_entre_PAS_dans_le_verdict(client_db, executer_travail) -> None:
    """🔴 Ni sa présence, ni son absence. La compter ferait de « Passer » un aveu."""
    client, TestSession = client_db
    with TestSession() as db:
        db.add(m.Skill(subject_id=1, name="Fractions", level="4e"))
        db.commit()
    body = _generate(client, TestSession, executer_travail)
    resultat = _passer(client, body["quiz_id"])
    attempt_id = resultat["attempt_id"]

    with TestSession() as db:
        avant = dict(db.get(m.QuizAttempt, attempt_id).reliability_json)

    client.post(
        f"/api/diagnostics/mes-resultats/{attempt_id}/explication",
        json={"question_id": resultat["verbalisation"]["question_id"], "texte": "j'ai cherché"},
    )

    with TestSession() as db:
        apres = dict(db.get(m.QuizAttempt, attempt_id).reliability_json)
    assert avant == apres, "le verdict a bougé après une explication"


def test_le_verdict_est_FIGE_et_ne_se_recalcule_pas(client_db, executer_travail, monkeypatch) -> None:
    """Une règle qui change ne re-juge PAS l'historique.

    Sabotage : recalculer `fiabilite` à la lecture dans `result_detail` → rouge, puisque le seuil
    déplacé changerait le verdict relu.
    """
    client, TestSession = client_db
    with TestSession() as db:
        db.add(m.Skill(subject_id=1, name="Fractions", level="4e"))
        db.commit()
    body = _generate(client, TestSession, executer_travail)
    resultat = _passer(client, body["quiz_id"])

    as_papa()
    avant = client.get(f"/api/diagnostics/results/{resultat['attempt_id']}").json()["fiabilite"]

    # Les seuils changent sous les pieds de la passation déjà écrite.
    monkeypatch.setattr(fiabilite, "CONTRASTE_SCORE_MIN", 1000)
    monkeypatch.setattr(fiabilite, "CONTRASTE_PLANCHER", 99)

    apres = client.get(f"/api/diagnostics/results/{resultat['attempt_id']}").json()["fiabilite"]
    assert avant == apres, "la mesure a changé d'avis sous les yeux de Papa"
