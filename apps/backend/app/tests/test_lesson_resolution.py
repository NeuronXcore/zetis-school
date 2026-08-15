"""« La leçon d'une notion » — un substrat, trois appelants (ADR-0037).

Le test qui compte le plus est `test_les_trois_appelants_designent_la_meme_lecon` : trois modules
répondaient différemment à la même question, et **le pire cas était SILENCIEUX** — produire sur la
leçon que la galaxie n'oriente pas rend le contenu atteignable par personne, sans erreur ni test
rouge. C'est ce fichier qui rend cette classe de défaut impossible.

Les autres tiennent le périmètre d'année (nouveau pour la production) et la non-régression des
appelants historiques.
"""

from datetime import datetime, timezone

from sqlalchemy import select

import app.db.models as m
from app.modules.ai.canonical_context import resolve_canonical_context
from app.modules.galaxy.service import _course_lessons_by_skill
from app.modules.lesson_resolution import (
    lesson_matching_text,
    lessons_by_skill,
    lessons_of_skill,
)
from app.modules.production import runner
from app.modules.production.equipment import _skill_lesson
from app.tests.fakes import FakeEmbeddingProvider


def _annee(db, *, statut: str = "active", label: str = "2026-2027") -> m.SchoolYear:
    annee = m.SchoolYear(
        student_id=db.scalar(select(m.StudentProfile.id)), label=label, level="4e", status=statut
    )
    db.add(annee)
    db.flush()
    return annee


def _chapitre(db, annee: m.SchoolYear, *, valide: bool = True) -> m.Chapter:
    sys_row = m.SchoolYearSubject(
        school_year_id=annee.id, subject_id=db.scalar(select(m.Subject.id))
    )
    db.add(sys_row)
    db.flush()
    chapitre = m.Chapter(
        school_year_subject_id=sys_row.id,
        name="Chapitre",
        validation_status="validated" if valide else "pending",
    )
    db.add(chapitre)
    db.flush()
    return chapitre


def _lecon(db, chapitre, *, titre, cours: bool, statut="validated", touchee_le=None) -> m.Lesson:
    lecon = m.Lesson(
        chapter_id=chapitre.id,
        title=titre,
        content_markdown="# Cours\n\nContenu." if cours else None,
        status=statut,
        created_by="ai",
    )
    db.add(lecon)
    db.flush()
    if touchee_le is not None:
        lecon.updated_at = touchee_le
    db.add(m.LessonSkill(lesson_id=lecon.id, skill_id=db.scalar(select(m.Skill.id))))
    db.commit()
    return lecon


# --- LE VERROU DU CHANTIER ---------------------------------------------------------------------


def test_les_trois_appelants_designent_la_meme_lecon(client_db) -> None:
    """⚠️ LE test. Trois modules, une seule réponse — sur une notion qui en admettait plusieurs.

    Sans lui, la production peut écrire une fiche sur une leçon que la galaxie n'oriente pas :
    **du contenu que personne ne peut ouvrir**, sans erreur, sans événement de journal, sans test
    rouge. Le refus observé le 2026-08-03 était l'autre face, bruyante, du même défaut.

    ⚠️ **Les deux leçons sont posées pour que les DEUX TRIS SE CONTREDISENT** : la plus récemment
    touchée est créée EN PREMIER, donc porte l'id le plus BAS. Sans cette inversion, `id DESC` et
    `(updated_at, id) DESC` désignent la même leçon et le test ne distingue rien — c'était le cas
    de sa première version, **démasquée par la contre-épreuve** (un appelant débranché du substrat
    → 805 verts), jamais par la relecture.
    """
    _, Session = client_db
    with Session() as db:
        chapitre = _chapitre(db, _annee(db))
        recente = _lecon(  # id le plus BAS, mais touchée en dernier
            db, chapitre, titre="Récente", cours=True,
            touchee_le=datetime(2026, 6, 1, tzinfo=timezone.utc),
        )
        ancienne = _lecon(  # id le plus HAUT — c'est elle que l'ancien tri retenait
            db, chapitre, titre="Ancienne", cours=True,
            touchee_le=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        assert ancienne.id > recente.id, "les deux tris ne se contredisent pas : le test est aveugle"
        skill_id = db.scalar(select(m.Skill.id))

        substrat = lessons_of_skill(db, skill_id)
        galaxie = _course_lessons_by_skill(db, [skill_id])[skill_id][0]
        production = _skill_lesson(db, skill_id)
        canonique = resolve_canonical_context(
            db, FakeEmbeddingProvider(), skill_id=skill_id
        ).lesson

        assert substrat[0].id == recente.id, "le substrat ne retient pas la dernière TOUCHÉE"
        assert galaxie == recente.id, "la galaxie diverge du substrat"
        assert production.id == recente.id, "la production diverge du substrat"
        assert canonique.id == recente.id, "le contexte canonique diverge du substrat"


def test_le_cas_observe_ne_bloque_plus(client_db) -> None:
    """⚠️ Le défaut du 2026-08-03, en test.

    Notion « Discours direct » : leçon 5 validée **avec** cours, leçon 12 validée **sans**. La
    production triait par `id` et retenait la 12 → « Cours à valider », alors que Massimo
    consultait le cours de la 5. Le tri par `updated_at` retient celle que la galaxie sert.
    """
    _, Session = client_db
    with Session() as db:
        chapitre = _chapitre(db, _annee(db))
        avec_cours = _lecon(
            db, chapitre, titre="Avec cours", cours=True,
            touchee_le=datetime(2026, 6, 1, tzinfo=timezone.utc),
        )
        sans_cours = _lecon(  # id PLUS HAUT — c'est elle que l'ancien tri retenait
            db, chapitre, titre="Sans cours", cours=False,
            touchee_le=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        assert sans_cours.id > avec_cours.id, "la fixture ne reproduit pas le cas observé"

        skill_id = db.scalar(select(m.Skill.id))
        eligible, blocked = runner.select_notions(db, [skill_id])

    assert eligible == [skill_id], f"la notion est encore bloquée à tort : {blocked}"
    assert blocked == []


# --- Le périmètre d'année, NOUVEAU pour la production -------------------------------------------


def test_une_lecon_d_annee_close_n_est_pas_equipable(client_db) -> None:
    """⚠️ Changement de comportement assumé (ADR-0037 §3).

    La production n'avait **aucun** filtre d'année : elle pouvait équiper la leçon de l'an dernier.
    Le motif rendu est celui de l'absence de support — parce que du point de vue de Massimo, cette
    leçon n'existe pas.

    ⚠️ **Une année ACTIVE est seedée en plus, et c'est indispensable.** La première version de ce
    test n'avait que l'année close : il passait alors par la garde « pas d'année active », pas par
    le filtre qu'il prétend vérifier. **Démasqué par la contre-épreuve** (filtre d'année retiré →
    805 verts), jamais par la relecture. Un test qui passe pour la mauvaise raison ne teste rien.
    """
    _, Session = client_db
    with Session() as db:
        _chapitre(db, _annee(db))  # il EXISTE une année active — sans leçon pour cette notion
        close = _chapitre(db, _annee(db, statut="archived", label="2025-2026"))
        _lecon(db, close, titre="Leçon de l'an dernier", cours=True)
        skill_id = db.scalar(select(m.Skill.id))

        assert lessons_of_skill(db, skill_id) == []
        eligible, blocked = runner.select_notions(db, [skill_id])

    assert eligible == []
    assert blocked == [{"skill_id": skill_id, "reason": runner.BLOCKED_NO_LESSON}]


def test_un_chapitre_non_valide_ne_porte_aucune_lecon(client_db) -> None:
    """Le périmètre suit celui de la galaxie : chapitre `pending` ⇒ rien n'est atteignable."""
    _, Session = client_db
    with Session() as db:
        brouillon = _chapitre(db, _annee(db), valide=False)
        _lecon(db, brouillon, titre="Dans un chapitre non validé", cours=True)
        assert lessons_of_skill(db, db.scalar(select(m.Skill.id))) == []


def test_sans_annee_active_le_resolveur_rend_du_vide_sans_lever(client_db) -> None:
    """⚠️ Correction du cadrage, faite au read-before-code.

    `curriculum._active_year_or_404` porte son comportement dans son nom. Le brancher tel quel
    ferait remonter un **404 depuis un job RQ** — ce que l'ADR-0035 a déjà jugé absurde : « le code
    de statut ne part vers personne ». Ici on RÉPOND vide ; l'appelant décide quoi en dire.
    """
    _, Session = client_db
    with Session() as db:
        skill_id = db.scalar(select(m.Skill.id))
        assert lessons_of_skill(db, skill_id) == []  # aucune année seedée par le conftest
        eligible, blocked = runner.select_notions(db, [skill_id])
    assert eligible == []
    assert blocked[0]["reason"] == runner.BLOCKED_NO_LESSON


# --- Non-régression des appelants historiques ----------------------------------------------------


def test_le_cas_courant_ne_change_pas(client_db) -> None:
    """⚠️ Ce qui change ne doit changer QUE là où il y avait ambiguïté.

    Une notion, une leçon : c'est le cas de l'écrasante majorité du référentiel, et celui des deux
    appelants historiques d'`equip_notion` (Conseil de classe, composition champion). Les deux tris
    — `id` et `updated_at` — y donnent forcément le même résultat ; ce test le fige, pour qu'une
    future retouche du substrat ne les emporte pas au passage.
    """
    _, Session = client_db
    with Session() as db:
        chapitre = _chapitre(db, _annee(db))
        seule = _lecon(db, chapitre, titre="La seule leçon", cours=True)
        skill_id = db.scalar(select(m.Skill.id))

        assert [l.id for l in lessons_of_skill(db, skill_id)] == [seule.id]
        assert _skill_lesson(db, skill_id).id == seule.id
        assert runner.select_notions(db, [skill_id]) == ([skill_id], [])


def test_le_brouillon_reste_visible_de_la_production_seule(client_db) -> None:
    """⚠️ Le cœur de la décision : le substrat ne filtre PAS le statut de leçon.

    La production doit voir un brouillon — au palier 3, `equip_notion` a le droit de rédiger puis
    valider son cours. Lui imposer le `validated` de la galaxie **supprimerait ce palier**. La
    galaxie, elle, ne doit pas le voir : Massimo ne l'atteint pas.
    """
    _, Session = client_db
    with Session() as db:
        chapitre = _chapitre(db, _annee(db))
        brouillon = _lecon(db, chapitre, titre="Brouillon", cours=False, statut="draft")
        skill_id = db.scalar(select(m.Skill.id))

        assert [l.id for l in lessons_of_skill(db, skill_id)] == [brouillon.id]
        assert _skill_lesson(db, skill_id).id == brouillon.id, "la production a perdu le palier 3"
        assert _course_lessons_by_skill(db, [skill_id]) == {}, "la galaxie sert un brouillon"


def test_le_lot_ne_fait_quUNE_requete_pour_toutes_ses_notions(client_db) -> None:
    """⚠️ Propriété que `resolve_panoply` PROMET, et que le cadrage allait casser.

    Sa signature annoncée était mono-notion ; l'appeler par notion aurait fait passer la page
    matière de 18 requêtes à N. Le résolveur est donc par LOT, et ce test le fige — un futur
    `for skill_id in …: lessons_of_skill(…)` le ferait tomber.
    """
    _, Session = client_db
    with Session() as db:
        chapitre = _chapitre(db, _annee(db))
        _lecon(db, chapitre, titre="Leçon", cours=True)
        autres = [m.Skill(subject_id=1, name=f"Notion {i}", level="4e") for i in range(5)]
        db.add_all(autres)
        db.commit()
        ids = [db.scalar(select(m.Skill.id))] + [s.id for s in autres]

        compte = {"n": 0}
        from sqlalchemy import event

        moteur = db.get_bind()

        def _compter(*args, **kwargs):
            compte["n"] += 1

        event.listen(moteur, "before_cursor_execute", _compter)
        try:
            lessons_by_skill(db, ids)
        finally:
            event.remove(moteur, "before_cursor_execute", _compter)

    # Deux : l'année active, puis les leçons. Jamais une par notion.
    assert compte["n"] == 2, f"{compte['n']} requêtes pour {len(ids)} notions"


# --- « De quel cours cette phrase parle-t-elle ? » — le sens INVERSE (ADR-0059, live 2026-08-15) ---


def _cours(db, chapitre, *, titre: str, contenu: str, statut: str = "validated") -> m.Lesson:
    """Une leçon dont on maîtrise le titre ET le contenu — les deux entrées de la recherche."""
    lecon = m.Lesson(
        chapter_id=chapitre.id,
        title=titre,
        content_markdown=contenu,
        status=statut,
        created_by="papa",
    )
    db.add(lecon)
    db.commit()
    return lecon


def test_le_cours_est_retrouve_par_un_mot_de_son_TITRE(client_db) -> None:
    """🔴 LE défaut né au micro : deux notions dans une phrase, et plus rien ne s'ancre.

    « Explique-moi la différence entre le narrateur et le personnage principal » ne résout aucune
    notion — la similarité se dilue entre les deux. Le cours, lui, s'appelle « Le narrateur ».

    Sabotage : ne comparer que sur le contenu, ou rendre `None` sans regarder le titre.
    """
    _, Session = client_db
    with Session() as db:
        chapitre = _chapitre(db, _annee(db))
        _cours(db, chapitre, titre="Le narrateur", contenu="Celui qui raconte l'histoire.")
        trouve = lesson_matching_text(
            db, text="explique-moi la différence entre le narrateur et le personnage principal"
        )
        assert trouve is not None and trouve.title == "Le narrateur"


def test_le_nom_d_une_NOTION_ouvre_aussi_la_porte(client_db) -> None:
    """Un cours peut s'appeler « Chapitre 3 » et enseigner les nombres relatifs.

    Le titre n'est pas la seule enseigne : les notions portées comptent autant.
    """
    _, Session = client_db
    with Session() as db:
        chapitre = _chapitre(db, _annee(db))
        # `_lecon` rattache la notion seedée (« Nombres relatifs ») à la leçon.
        _lecon(db, chapitre, titre="Chapitre 3", cours=True)
        trouve = lesson_matching_text(db, text="c'est quoi les nombres relatifs déjà ?")
        assert trouve is not None and trouve.title == "Chapitre 3"


def test_le_CONTENU_seul_ne_suffit_JAMAIS_a_elire_un_cours(client_db) -> None:
    """🔴 Le garde-fou de la fonction, et la raison pour laquelle elle est sûre.

    « Différence » apparaît dans n'importe quel cours de maths. Ancrer ZETIS dessus lui ferait
    répondre à côté **avec l'aplomb d'une source validée** — pire que le refus qu'on répare.

    Sabotage : rendre les candidats du contenu éligibles, ou baisser le poids du titre.
    """
    _, Session = client_db
    with Session() as db:
        chapitre = _chapitre(db, _annee(db))
        _cours(
            db,
            chapitre,
            titre="Les fractions",
            contenu="On calcule la différence entre le narrateur et le personnage principal.",
        )
        assert lesson_matching_text(db, text="parle-moi du narrateur") is None


def test_le_contenu_DEPARTAGE_deux_cours_dont_le_titre_mord(client_db) -> None:
    """Le contenu ne peut pas élire, mais il classe : c'est tout son rôle."""
    _, Session = client_db
    with Session() as db:
        chapitre = _chapitre(db, _annee(db))
        _cours(db, chapitre, titre="Le narrateur", contenu="Généralités.")
        _cours(
            db,
            chapitre,
            titre="Le narrateur et le point de vue",
            contenu="Le personnage principal est celui dont on raconte l'histoire.",
        )
        trouve = lesson_matching_text(
            db, text="la différence entre le narrateur et le personnage principal"
        )
        assert trouve is not None and trouve.title == "Le narrateur et le point de vue"


def test_les_mots_TROP_COURANTS_n_ouvrent_aucune_porte(client_db) -> None:
    """« Explique », « comment », « chose » : un cours intitulé avec eux ne serait pas un candidat.

    Sans ce filtre, la moindre politesse de Massimo ancrerait ZETIS sur un cours au hasard.
    """
    _, Session = client_db
    with Session() as db:
        chapitre = _chapitre(db, _annee(db))
        _cours(db, chapitre, titre="Comment expliquer une chose", contenu="Peu importe.")
        assert lesson_matching_text(db, text="explique-moi comment faire cette chose") is None


def test_le_perimetre_est_celui_du_module_brouillons_et_cours_vides_exclus(client_db) -> None:
    """⚠️ Le chat s'ancre sur ce qu'il trouve ici : un brouillon contournerait le gate de Papa.

    Trois exclusions, chacune sabotable séparément : leçon non validée, cours non rédigé,
    chapitre non validé.
    """
    _, Session = client_db
    with Session() as db:
        annee = _annee(db)
        valide = _chapitre(db, annee)
        _cours(db, valide, titre="Le narrateur brouillon", contenu="x", statut="draft")
        vide = m.Lesson(
            chapter_id=valide.id, title="Le narrateur vide", content_markdown=None,
            status="validated", created_by="papa",
        )
        db.add(vide)
        en_attente = _chapitre(db, annee, valide=False)
        _cours(db, en_attente, titre="Le narrateur non validé", contenu="x")
        assert lesson_matching_text(db, text="parle-moi du narrateur") is None


def test_une_annee_CLOSE_n_ancre_plus_le_chat(client_db) -> None:
    """Même resserrement que `resolve_canonical_context` : ce qui n'est plus atteignable par
    Massimo n'a pas à nourrir ce qu'on lui dit."""
    _, Session = client_db
    with Session() as db:
        close = _annee(db, statut="closed", label="2025-2026")
        _cours(db, _chapitre(db, close), titre="Le narrateur", contenu="Ancien cours.")
        assert lesson_matching_text(db, text="parle-moi du narrateur") is None
