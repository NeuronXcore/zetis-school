"""Test-verrous de l'ADR-0030 §Suivi — la frontière entre NOUVEAUTÉ et ARRIÉRÉ.

Ce fichier n'est pas un test de régression ordinaire. Il encode la seule règle qui rend les
badges livrables :

> Un badge de navigation compte ce qui est **NOUVEAU** (naît d'un geste, meurt d'un **regard**),
> jamais ce qui est **DÛ** (naît d'une date franchie, ne meurt que du **travail**, et **grossit
> quand Massimo ne vient pas**).

La seconde colonne est la définition d'une relance. L'ADR nomme explicitement, dans ses coûts, la
« pression durable » pour brancher ces badges sur les files — parce que c'est la version utile, et
que c'est la version interdite. Ces tests sont ce qui résiste à cette pression quand plus personne
ne se souvient du raisonnement.

Un échec ici ne se répare pas en ajustant l'assertion.
"""

import inspect
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import select

import app.db.models as m
from app.modules.news.schemas import NewsSummary
from app.modules.news.service import NEWS_SOURCES

SUMMARY = "/api/student/news/summary"

#: Vocabulaire de l'ARRIÉRÉ. Aucune source de témoin n'a le droit de le lire.
#:
#: `dismissed_at` n'y figure PAS, et c'est un arbitrage, pas un oubli : masquer un item est un
#: geste de Massimo sur sa propre page (il meurt d'une action de l'enfant, pas d'une date), donc
#: `new_agenda_count` a le droit de le filtrer. Le cacher dans un helper `_visible_items()` pour
#: satisfaire un grep rendrait ce verrou décoratif — mieux vaut l'exception écrite.
FORBIDDEN_TOKENS = (
    "due_count",
    "due_at",
    "due_on",
    "due_date",
    "done_at",
    "overdue",
    "late",
    # 🔴 AJOUTÉS le 2026-08-08, et le moment n'est pas un hasard : on perce ce jour-là une
    # exception dans la doctrine (`diagnostic`), et c'est précisément quand on ouvre un trou qu'il
    # faut resserrer le reste. Ces deux jetons manquaient — un compteur pouvait donc compter du
    # NON-FAIT (« ce qui n'a pas de passation ») sans qu'aucun verrou ne le voie.
    "completed_at",
    "taken_at",
)

#: Les compteurs autorisés à lire les jetons ci-dessus, avec la décision qui les y autorise.
#:
#: ⚠️ **Une entrée ici est une DÉROGATION, pas une configuration.** N'en ajouter une qu'avec un
#: ADR qui la nomme — sinon ce dictionnaire devient la porte de sortie du verrou qu'il borne.
DEROGATIONS = {
    "diagnostic": "adr-0030-temoins-nouveaute-navigation.md",
}


def _lit_un_jeton_interdit(body: str) -> str | None:
    """Premier jeton interdit réellement présent, ou `None`.

    ⚠️ **Pas un simple `in`.** `late` est contenu dans `correlate`, et le scan naïf a rendu rouge
    un `servable_quiz_ids` parfaitement conforme le 2026-08-15. La borne `(?<![a-z])…(?![a-z])`
    est **strictement plus fine** que le sous-chaîne : elle refuse `correlate`, mais continue
    d'attraper `_due_at`, `due_at_`, `q.completed_at` et `overdue_count`. Elle n'assouplit rien —
    un `\\b` classique, lui, aurait laissé passer `_late`, ce qui aurait été un affaiblissement.
    """
    for token in FORBIDDEN_TOKENS:
        if re.search(rf"(?<![a-z]){re.escape(token)}(?![a-z])", body):
            return token
    return None


def _body_without_docstring(fn) -> str:
    """Source d'une fonction, docstring RETIRÉE.

    Les docstrings de ces compteurs *doivent* nommer les interdits — c'est là qu'on explique
    pourquoi `new_cards_count` ne lit pas d'échéance. Les scanner ferait échouer le verrou sur
    sa propre documentation.
    """
    source = inspect.getsource(fn)
    doc = inspect.getdoc(fn)
    if not doc:
        return source
    # La docstring est le premier littéral du corps : on coupe à sa fermeture.
    closing = source.find('"""', source.find('"""') + 3)
    return source[closing + 3 :] if closing != -1 else source


# --- Verrou n°1 : aucune source ne consomme une échéance -------------------------------------


def test_no_news_source_reads_a_deadline() -> None:
    """Le test lit le SOURCE des cinq compteurs, pas leur sortie.

    C'est le point : la sortie est un entier, elle ne peut pas trahir d'où elle vient. Un badge
    branché sur `due_count` rendrait exactement le même type de réponse qu'un badge conforme.
    """
    for key, source_fn in NEWS_SOURCES.items():
        if key in DEROGATIONS:
            continue
        token = _lit_un_jeton_interdit(_body_without_docstring(source_fn))
        assert token is None, (
            f"Le compteur « {key} » lit « {token} » : c'est un compteur d'ARRIÉRÉ, "
            f"pas un témoin de nouveauté (ADR-0030 §1)."
        )


#: Les fonctions que les compteurs APPELLENT, et qui échappent donc au scan ci-dessus.
#:
#: 🔴 **Ce registre existe parce que le verrou n°1 est SUPERFICIEL** : `_body_without_docstring` lit
#: `inspect.getsource` de la seule fonction de tête, jamais ses appelées. `new_fiches_count`
#: déléguait déjà depuis le premier jour ; depuis le 2026-08-15, trois compteurs de plus délèguent.
#: Sans ce registre, brancher un badge sur une file demanderait juste de descendre le `due_at`
#: **d'un cran** — et le verrou resterait vert.
DELEGATIONS = {
    "fiches": ("app.modules.fiches.service", "fiches_summary"),
    "matieres": ("app.modules.curriculum.service", "_active_year_or_none"),
    "eli5": ("app.modules.curriculum.service", "eligible_notion_ids"),
    "quiz": ("app.modules.quizzes.service", "servable_quiz_ids"),
}


def test_le_verrou_de_jetons_suit_les_DELEGATIONS() -> None:
    """Les fonctions appelées par un compteur sont scannées comme lui.

    Un compteur conforme qui appelle une fonction non conforme est un compteur non conforme : la
    sortie est un entier, elle ne dit pas d'où elle vient — c'est déjà l'argument du verrou n°1,
    et il vaut d'un cran plus bas.
    """
    import importlib

    for key, (module_path, fn_name) in DELEGATIONS.items():
        if key in DEROGATIONS:
            continue
        fn = getattr(importlib.import_module(module_path), fn_name)
        token = _lit_un_jeton_interdit(_body_without_docstring(fn))
        assert token is None, (
            f"« {key} » délègue à {fn_name}, qui lit « {token} » : le jeton interdit a "
            f"simplement descendu d'un cran (ADR-0030 §1)."
        )


def test_toute_delegation_reelle_est_DECLAREE() -> None:
    """🔴 Un registre qu'on oublie de tenir à jour ne verrouille rien.

    On lit le source de chaque compteur et on cherche les appels `<module>_service.<fn>` : chacun
    doit figurer dans `DELEGATIONS`. Sans cette assertion, ajouter une délégation non déclarée
    rouvrirait le trou en silence — exactement ce que le test ci-dessus existe pour fermer.
    """
    import re

    for key, source_fn in NEWS_SOURCES.items():
        body = _body_without_docstring(source_fn)
        appels = set(re.findall(r"\b(\w+_service)\.(\w+)\(", body))
        if not appels:
            continue
        assert key in DELEGATIONS, (
            f"Le compteur « {key} » délègue à {sorted(appels)} sans être déclaré dans DELEGATIONS."
        )
        _, declare = DELEGATIONS[key]
        assert declare in {fn for _, fn in appels}, (
            f"DELEGATIONS déclare « {declare} » pour « {key} », mais le source appelle "
            f"{sorted(fn for _, fn in appels)}."
        )


def test_toute_derogation_est_adossee_a_un_ADR_qui_la_nomme() -> None:
    """Une dérogation sans document est un contournement qui se donne l'air d'une règle.

    Ce test ne juge pas le bien-fondé de l'exception — il exige qu'elle soit ÉCRITE quelque part
    où on la retrouvera. Le fichier nommé doit exister ; sinon la dérogation survit à sa propre
    justification, ce qui est la façon dont une doctrine se vide.
    """
    # `app/tests/x.py` → parents : tests, app, backend, apps, RACINE.
    racine = Path(__file__).resolve().parents[4] / "docs" / "decisions"
    for key, document in DEROGATIONS.items():
        assert key in NEWS_SOURCES, f"Dérogation « {key} » accordée à un compteur inexistant."
        assert (racine / document).is_file(), (
            f"La dérogation de « {key} » cite « {document} », qui n'existe pas."
        )


def test_UNE_SEULE_exception_meurt_du_travail_et_les_autres_meurent_d_un_REGARD() -> None:
    """🔴 LE VERROU D'EXCEPTION — il enregistre le trou pour empêcher qu'il s'élargisse.

    Le 2026-08-08, `diagnostic` est entré dans les témoins alors qu'il **meurt du TRAVAIL** :
    il compte les diagnostics relus que Massimo n'a pas passés, donc il grossit quand Massimo ne
    vient pas. C'est la colonne interdite de l'`adr-0030 §1`, ouverte par décision du
    commanditaire après objection et réaffirmation.

    ⚠️ **Ce qu'il faut comprendre, et qui a failli passer inaperçu** : ce compteur traversait les
    CINQ verrous de ce fichier sans en faire rougir un seul. Ils interrogent le **temps** — « une
    échéance change-t-elle ce nombre ? » — et aucune date n'entre dans son calcul. La règle a deux
    dimensions ; le fichier n'en verrouillait qu'une. Sans ce test, la prochaine session lirait
    sept témoins tous conformes et en conclurait qu'un compteur de non-faits est recevable.

    Il n'y en a qu'un, et il est nommé.
    """
    assert set(DEROGATIONS) == {"diagnostic"}, (
        "Une seconde exception a été ajoutée à la doctrine des témoins. Ce n'est pas un réglage : "
        "il faut un ADR qui la nomme, et une bonne raison de ne pas plutôt retirer la première."
    )


def test_every_served_field_has_a_declared_source() -> None:
    """Le schéma et le registre ne peuvent pas diverger : un champ servi sans source déclarée
    échapperait au verrou n°1."""
    assert set(NewsSummary.model_fields) == set(NEWS_SOURCES)


# --- Verrou n°2 : le temps qui passe ne fait grossir aucun badge ------------------------------


def _seed_programme(Session) -> dict:
    """Année active + chapitre validé + leçon validée AVEC cours + notion + quiz jouable.

    🔴 **Sans ce décor, les trois témoins posés le 2026-08-15 valent 0 partout et les deux verrous
    n°2 passent À VIDE.** La fixture `client_db` ne crée ni `SchoolYear`, ni `Chapter`, ni `Lesson`,
    ni `Quiz` : `new_matieres_count`, `new_eli5_count` et `new_quizzes_count` sortaient donc `0` des
    deux côtés de chaque comparaison, et l'égalité tenait sans rien prouver. C'est le « décor
    dégénéré » déjà rencontré sur l'`adr-0045` — un sabotage reste vert parce que le décor ne peut
    pas atteindre la branche verrouillée.

    Rend les ids utiles aux tests qui font ensuite le geste (ouvrir le cours, la notion, le quiz).
    """
    now = datetime.now(timezone.utc)
    with Session() as db:
        student = db.scalar(select(m.StudentProfile).order_by(m.StudentProfile.id))
        subject = db.scalar(select(m.Subject).order_by(m.Subject.id))
        skill = db.scalar(select(m.Skill).order_by(m.Skill.id))

        year = m.SchoolYear(student_id=student.id, label="2026-2027", level="4e", status="active")
        db.add(year)
        db.flush()
        sys_ = m.SchoolYearSubject(school_year_id=year.id, subject_id=subject.id)
        db.add(sys_)
        db.flush()
        chapter = m.Chapter(
            school_year_subject_id=sys_.id, name="Nombres relatifs", validation_status="validated"
        )
        db.add(chapter)
        db.flush()

        lesson = m.Lesson(
            chapter_id=chapter.id,
            title="Additionner des relatifs",
            status="validated",
            created_by="ai",
            content_markdown="# Le cours",
        )
        # ⚠️ Leçon validée SANS cours : elle ne doit être comptée par aucun témoin, parce que
        # `student_lesson_content` répond 404 dessus — donc aucun geste ne pourrait l'éteindre.
        # C'est le décor du verrou N2 (borne B2), et il est ici pour que N2 ne soit pas à vide.
        lesson_sans_cours = m.Lesson(
            chapter_id=chapter.id,
            title="Chapitre annoncé, cours pas encore écrit",
            status="validated",
            created_by="ai",
            content_markdown=None,
        )
        db.add_all([lesson, lesson_sans_cours])
        db.flush()
        db.add(m.LessonSkill(lesson_id=lesson.id, skill_id=skill.id))

        quiz = m.Quiz(
            subject_id=subject.id,
            chapter_id=chapter.id,
            lesson_id=lesson.id,
            title="Quiz de fin de cours",
            quiz_type="mission",
            status="ready",
            validation_status="validated",
        )
        db.add(quiz)
        db.flush()
        # 🔴 Un quiz de DIAGNOSTIC, sur la MÊME leçon validée, avec une question active.
        # Il n'est pas décoratif : sans lui, `servable_quiz_ids` et `list_student_quiz_index`
        # désignent le même ensemble même quand la première oublie le filtre `quiz_type`, et le
        # test d'égalité reste vert sur une divergence réelle (sabotage n°8 du 2026-08-15 —
        # décor dégénéré, forme déjà rencontrée sur l'adr-0045). Il tient aussi la borne 3 de
        # l'addendum Quiz : un diagnostic n'entre jamais dans le témoin `quiz`, sinon il
        # doublerait le témoin `diagnostic`, qui meurt du travail.
        diagnostic = m.Quiz(
            subject_id=subject.id,
            chapter_id=chapter.id,
            lesson_id=lesson.id,
            title="Diagnostic de rentrée",
            quiz_type="diagnostic",
            status="ready",
            validation_status="validated",
        )
        db.add_all([diagnostic])
        db.flush()
        for cible in (quiz, diagnostic):
            db.add(
                m.QuizQuestion(
                    quiz_id=cible.id,
                    skill_id=skill.id,
                    question_type="mcq",
                    prompt_markdown="2 + (-3) = ?",
                    choices_json=["-1", "1"],
                    correct_answer_json="-1",
                    status="active",
                )
            )
        db.commit()
        return {
            "student_id": student.id,
            "lesson_id": lesson.id,
            "lesson_sans_cours_id": lesson_sans_cours.id,
            "skill_id": skill.id,
            "quiz_id": quiz.id,
            "now": now,
        }


def _seed_world(Session, *, offset_days: int) -> None:
    """Sème les mêmes objets dans deux mondes ne différant QUE par leurs champs datés.

    Reculer une échéance de 30 jours est observationnellement identique à avancer l'horloge de
    30 jours. Si un compteur diverge entre les deux mondes, c'est exactement qu'il grossit par
    écoulement du temps.
    """
    now = datetime.now(timezone.utc)
    today = now.date()
    with Session() as db:
        student = db.scalar(select(m.StudentProfile).order_by(m.StudentProfile.id))
        subject = db.scalar(select(m.Subject).order_by(m.Subject.id))
        skill = db.scalar(select(m.Skill).order_by(m.Skill.id))
        quiz = db.scalar(select(m.Quiz).order_by(m.Quiz.id))

        # Une tentative DATÉE sur le quiz jouable. C'est elle qui ferait diverger les deux mondes
        # si `new_quizzes_count` se branchait un jour sur `QuizAttempt` — sans elle, le verrou
        # n'aurait aucun moyen de voir la faute.
        if quiz is not None:
            db.add(
                m.QuizAttempt(
                    quiz_id=quiz.id,
                    student_id=student.id,
                    started_at=now + timedelta(days=offset_days),
                    completed_at=now + timedelta(days=offset_days),
                    score_percent=80.0,
                )
            )

        db.add(
            m.SpacedReviewCard(
                student_id=student.id,
                skill_id=skill.id,
                front_markdown="Q",
                back_markdown="R",
                interval_days=1,
                due_at=now + timedelta(days=offset_days),
                status="scheduled",
            )
        )
        db.add(
            m.AgendaItem(
                student_id=student.id,
                label="DM de maths",
                kind="devoir",
                due_on=today + timedelta(days=offset_days),
                created_by="parent",
            )
        )
        db.add(
            m.Mission(
                student_id=student.id,
                subject_id=subject.id,
                skill_id=skill.id,
                title="Renforcer",
                mission_type="remediation",
                status="planned",
                validation_status="validated",
                due_date=today + timedelta(days=offset_days),
                priority=1,
                created_by="ai",
            )
        )
        db.commit()


def test_a_passing_deadline_changes_no_witness(client_db) -> None:
    """Monde « échéances dépassées » et monde « échéances à venir » donnent les MÊMES compteurs.

    C'est le test qui a fait remonter la vraie violation du lot : `reviews/summary.new_count`
    exigeait `due_at <= now` alors que les cartes naissent avec une échéance FUTURE — une carte
    fraîchement générée y entrait donc plusieurs jours plus tard, sans aucun geste. Avec cette
    expression-là, ce test rendrait 1 contre 0.
    """
    client, Session = client_db
    _seed_programme(Session)
    _seed_world(Session, offset_days=-30)
    past = client.get(SUMMARY).json()

    with Session() as db:
        for model in (m.SpacedReviewCard, m.AgendaItem, m.Mission, m.QuizAttempt):
            for row in db.scalars(select(model)):
                db.delete(row)
        db.commit()

    _seed_world(Session, offset_days=+30)
    future = client.get(SUMMARY).json()

    assert past == future, (
        "Un compteur dépend d'une échéance : il grossira quand Massimo ne viendra pas "
        "(ADR-0030 §1)."
    )


def test_moving_the_clock_forward_grows_nothing(client_db, monkeypatch) -> None:
    """« Si Massimo ne vient pas pendant 3 jours : inchangé » (§1, ligne 3 du tableau).

    Lecture littérale de la règle, faisable parce que les modules concernés isolent leur horloge
    dans un `_now()`. Limite écrite plutôt que masquée : le watermark de l'agenda passe par
    `func.now()` (horloge SQL), que ce monkeypatch n'atteint pas — c'est
    `test_a_passing_deadline_changes_no_witness` qui couvre l'agenda.
    """
    from app.modules.agenda import service as agenda_service
    from app.modules.fiches import service as fiches_service
    from app.modules.memory import service as memory_service

    client, Session = client_db
    _seed_programme(Session)
    _seed_world(Session, offset_days=+3)
    before = client.get(SUMMARY).json()
    # Le décor doit être ATTEIGNABLE, sinon l'égalité ci-dessous tient à vide (adr-0045).
    assert before["matieres"] > 0

    far_future = datetime.now(timezone.utc) + timedelta(days=30)
    for module in (memory_service, agenda_service, fiches_service):
        monkeypatch.setattr(module, "_now", lambda: far_future)

    assert client.get(SUMMARY).json() == before


def test_witnesses_only_ever_decrease_under_consultation(client_db) -> None:
    """Sous les seuls gestes de REGARD, aucun compteur ne monte — et au moins un descend.

    Formulation directe du second test-verrou de l'ADR §Suivi.
    """
    client, Session = client_db
    now = datetime.now(timezone.utc)
    with Session() as db:
        student = db.scalar(select(m.StudentProfile).order_by(m.StudentProfile.id))
        skill = db.scalar(select(m.Skill).order_by(m.Skill.id))
        db.add(
            m.SpacedReviewCard(
                student_id=student.id,
                skill_id=skill.id,
                front_markdown="Q",
                back_markdown="R",
                interval_days=1,
                due_at=now - timedelta(days=1),
                status="scheduled",
            )
        )
        db.add(
            m.AgendaItem(
                student_id=student.id,
                label="Contrôle",
                kind="controle",
                due_on=now.date() + timedelta(days=2),
                created_by="parent",
            )
        )
        db.commit()

    _seed_programme(Session)
    before = client.get(SUMMARY).json()
    assert before["agenda"] > 0 and before["revision"] > 0 and before["matieres"] > 0

    assert client.post("/api/student/agenda/seen").status_code == 204
    after = client.get(SUMMARY).json()

    for key in before:
        assert after[key] <= before[key], f"Le témoin « {key} » a monté sous un simple regard."
    assert after["agenda"] == 0


# --- Verrou n°3 : les témoins posés le 2026-08-15 meurent d'un REGARD, et savent mourir ---------
#
# 🔴 DIMENSION QUE CE FICHIER NE VERROUILLAIT PAS. Les verrous n°1 et n°2 interrogent le TEMPS
# (« une échéance change-t-elle ce nombre ? »). La règle en a deux : le compteur meurt-il d'un
# REGARD ? C'est l'angle mort qui a laissé `diagnostic` traverser les cinq verrous sans en faire
# rougir un — et c'est celui que les trois témoins ajoutés ce jour-là doivent franchir de face.


def test_le_temoin_matieres_meurt_du_premier_regard_et_pas_deux_fois(client_db) -> None:
    """Ouvrir le cours retire EXACTEMENT une unité, et le rouvrir n'en retire aucune.

    L'idempotence n'est pas un détail de confort : sans elle le compteur descendrait sous zéro à
    l'usage, ou remonterait — un témoin qui ne converge pas ne se lit plus.
    """
    client, Session = client_db
    monde = _seed_programme(Session)

    avant = client.get(SUMMARY).json()["matieres"]
    assert avant == 1, "Le décor ne rend pas le témoin atteignable — il verrouillerait à vide."

    assert client.get(f"/api/student/lessons/{monde['lesson_id']}/cours").status_code == 200
    assert client.get(SUMMARY).json()["matieres"] == avant - 1

    assert client.get(f"/api/student/lessons/{monde['lesson_id']}/cours").status_code == 200
    assert client.get(SUMMARY).json()["matieres"] == avant - 1


def test_aucun_temoin_ne_compte_ce_qu_aucun_geste_ne_peut_eteindre(client_db) -> None:
    """🔴 BORNE B2 — un témoin doit pouvoir atteindre ZÉRO.

    Le décor porte DEUX leçons validées : une avec cours, une sans. `student_lesson_content` répond
    **404** sur la seconde, donc `mark_lesson_seen` n'y est jamais atteint : la compter donnerait un
    badge immortel, que Massimo apprendrait à ne plus regarder.

    Ce n'est pas un cas de bord théorique — au cadrage du 2026-08-15, **50 des 92 leçons validées**
    de la base de dev étaient dans ce cas, soit la majorité.

    Sabotage qui doit faire rougir : retirer `content_markdown.is_not(None)` de `new_matieres_count`.
    """
    client, Session = client_db
    monde = _seed_programme(Session)

    assert (
        client.get(f"/api/student/lessons/{monde['lesson_sans_cours_id']}/cours").status_code == 404
    )
    # Une seule des deux leçons validées est comptée : celle qu'un geste peut éteindre.
    assert client.get(SUMMARY).json()["matieres"] == 1

    client.get(f"/api/student/lessons/{monde['lesson_id']}/cours")
    assert client.get(SUMMARY).json()["matieres"] == 0, (
        "Le témoin ne retombe pas à zéro alors que tout ce qui est ouvrable a été ouvert : "
        "il compte quelque chose d'inatteignable (borne B2)."
    )


def test_le_temoin_eli5_meurt_du_premier_regard_et_pas_deux_fois(client_db) -> None:
    """Demander l'explication d'une notion retire exactement une unité, et une seule fois."""
    client, Session = client_db
    monde = _seed_programme(Session)

    avant = client.get(SUMMARY).json()["eli5"]
    assert avant == 1, "Le décor ne rend pas le témoin atteignable — il verrouillerait à vide."

    url = f"/api/ai/eli5/skills/{monde['skill_id']}/seen"
    assert client.post(url).status_code == 204
    assert client.get(SUMMARY).json()["eli5"] == 0

    assert client.post(url).status_code == 204
    assert client.get(SUMMARY).json()["eli5"] == 0


def test_le_temoin_eli5_n_est_PAS_le_compteur_de_RECENCE(client_db) -> None:
    """🔴 L'antidote au motif « ELI5 a déjà un `new_count`, réutilisons-le ».

    Deux vérifications, parce qu'aucune ne suffit seule :

    1. **Sur le source** — ni `NOTION_NEW_WINDOW_DAYS`, ni `created_at`, ni `timedelta`. Un
       compteur de récence décroît par le TEMPS, sans qu'aucun regard n'ait eu lieu : c'est
       exactement ce que l'`adr-0030 §2` refuse, et cette règle n'a pas été amendée.
    2. **Sur les nombres** — dans un monde où la notion est ANCIENNE (leçon créée il y a un an),
       le compteur de récence vaut 0 et le témoin vaut 1. S'ils étaient le même objet, ils
       répondraient pareil.
    """
    from app.modules.curriculum import service as curriculum_service
    from app.modules.eli5 import service as eli5_service

    body = _body_without_docstring(eli5_service.new_eli5_count)
    for token in ("NOTION_NEW_WINDOW_DAYS", "created_at", "timedelta"):
        assert token not in body, (
            f"`new_eli5_count` lit « {token} » : c'est un compteur de RÉCENCE, et le §2 le refuse."
        )

    client, Session = client_db
    _seed_programme(Session)
    with Session() as db:
        lesson = db.scalar(select(m.Lesson).where(m.Lesson.content_markdown.is_not(None)))
        lesson.created_at = datetime.now(timezone.utc) - timedelta(days=365)
        db.commit()

        recence = sum(s["new_count"] for s in curriculum_service.student_notions_summary(db)["subjects"])

    assert recence == 0, "Le décor ne sépare pas les deux objets — le test tiendrait à vide."
    assert client.get(SUMMARY).json()["eli5"] == 1, (
        "Le témoin suit la récence : il s'éteindra tout seul, sans que Massimo ait rien lu."
    )


def test_la_population_eli5_est_celle_que_la_page_montre(client_db) -> None:
    """Le badge et la page comptent le MÊME ensemble.

    Un badge qui compte plus que sa page est inextinguible (borne B2) ; un badge qui en compte
    moins ment dans l'autre sens. `eligible_notion_ids` est LA définition, et ce test la lie à
    `student_subject_notions`, qui alimente l'écran.
    """
    from app.modules.curriculum import service as curriculum_service

    _, Session = client_db
    _seed_programme(Session)
    with Session() as db:
        du_badge = set(curriculum_service.eligible_notion_ids(db))
        de_la_page = {
            notion["skill_id"]
            for subject in db.scalars(select(m.Subject))
            for notion in curriculum_service.student_subject_notions(db, subject.slug)["notions"]
        }
    assert du_badge == de_la_page


def test_le_temoin_quiz_meurt_de_l_OUVERTURE_et_pas_deux_fois(client_db) -> None:
    """Ouvrir le quiz retire une unité ; le rouvrir n'en retire aucune."""
    client, Session = client_db
    monde = _seed_programme(Session)

    avant = client.get(SUMMARY).json()["quiz"]
    # 1 et non 2 : le décor porte AUSSI un diagnostic sur la même leçon, et un diagnostic n'entre
    # jamais dans ce témoin (borne 3 — il doublerait le témoin `diagnostic`, qui meurt du travail).
    assert avant == 1, "Le décor ne rend pas le témoin atteignable — il verrouillerait à vide."

    url = f"/api/student/quiz/{monde['quiz_id']}/seen"
    assert client.post(url).status_code == 204
    assert client.get(SUMMARY).json()["quiz"] == 0

    assert client.post(url).status_code == 204
    assert client.get(SUMMARY).json()["quiz"] == 0


def test_le_temoin_quiz_ignore_les_TENTATIVES(client_db) -> None:
    """🔴 BORNE 1 de `adr-0030-temoins-nouveaute-navigation` (Amendement 4) — le compteur ne regarde jamais `QuizAttempt`.

    Un quiz PASSÉ mais jamais marqué ouvert reste compté ; un quiz OUVERT et jamais passé ne l'est
    plus. C'est exactement l'inverse de ce que ferait un compteur d'arriéré, et c'est ce qui
    empêche ce témoin de grossir quand Massimo ne vient pas.

    La tentative est créée **directement en base**, sans passer par la route : le test doit tenir
    même si la route change, parce que c'est le COMPTEUR qui est verrouillé ici.

    Sabotage qui doit faire rougir : brancher `new_quizzes_count` sur `QuizAttempt.completed_at`.
    """
    from app.modules.quizzes import service as quizzes_service

    body = _body_without_docstring(quizzes_service.new_quizzes_count)
    assert "QuizAttempt" not in body, (
        "Le témoin Quiz lit les tentatives : il meurt du TRAVAIL, colonne interdite du §1."
    )

    client, Session = client_db
    monde = _seed_programme(Session)
    with Session() as db:
        db.add(
            m.QuizAttempt(
                quiz_id=monde["quiz_id"],
                student_id=monde["student_id"],
                started_at=monde["now"],
                completed_at=monde["now"],
                score_percent=100.0,
            )
        )
        db.commit()

    assert client.get(SUMMARY).json()["quiz"] == 1, (
        "Passer le quiz a éteint le témoin : il compte du TRAVAIL, pas un regard."
    )


def test_la_definition_du_quiz_jouable_est_unique(client_db) -> None:
    """L'expression ensembliste et la source historique désignent le MÊME ensemble.

    `servable_quiz_ids` est une seconde formulation du filtre de `_servable_quizzes_of_subject`,
    écrite pour ne pas faire une requête par quiz dans `news/summary`. La docstring d'origine
    prévient que deux formulations divergent toujours ; ce test est ce qui les tient ensemble
    (patron `new_fiches_count` / `fiches_summary`).
    """
    from app.modules.quizzes import service as quizzes_service

    _, Session = client_db
    _seed_programme(Session)
    with Session() as db:
        ensembliste = set(quizzes_service.servable_quiz_ids(db))
        historique = {row["quiz_id"] for row in quizzes_service.list_student_quiz_index(db)}
    assert ensembliste, "Décor vide : le test tiendrait sans rien prouver."
    assert ensembliste == historique


def test_le_summary_repond_200_sans_annee_active(client_db) -> None:
    """Aucune année active ne doit faire tomber les DIX témoins.

    Le piège est réel : `curriculum.service._active_year_or_404` LÈVE une `HTTPException`, et c'est
    la fonction que la pente naturelle aurait réutilisée. `GET /news/summary` est monté au shell de
    Massimo — un 404 ici éteint toute la navigation, et toute la suite de tests avec (aucune
    fixture ne crée de `SchoolYear`).
    """
    client, _ = client_db  # décor volontairement NU : pas d'année active
    reponse = client.get(SUMMARY)
    assert reponse.status_code == 200, reponse.text
    assert reponse.json()["matieres"] == 0
