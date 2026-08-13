"""L'atelier — la fiche que Massimo fabrique (addendum ADR-0015, slice 1).

Trois promesses sont vérifiées ici, parce que ce sont elles que l'écran affiche à Massimo :

1. **« tout est gardé au fur et à mesure — tu peux fermer et revenir demain »** (reprise) ;
2. **un brouillon n'est pas une fiche** — ni servi, ni dérivable, tant qu'il n'a pas validé ;
3. **rouvrir une fiche finie ne l'écrase pas** — l'ancienne version reste lisible (§7).

Aucun LLM dans ce fichier, et ce n'est pas un choix de test : la slice 1 est intégralement
déterministe (règle 7 — ZETIS n'écrit jamais dans la fiche à la place de Massimo).
"""

import re
from unittest.mock import patch

from datetime import datetime, timezone

import pytest
from fastapi import HTTPException
from sqlalchemy import false as sa_false, func, select
from sqlalchemy.exc import IntegrityError

from app.db.models import (
    Fiche,
    Quiz,
    QuizAnswer,
    QuizAttempt,
    QuizQuestion,
    Skill,
    SpacedReviewAttempt,
    SpacedReviewCard,
)
from app.modules.eli5.service import get_default_student
from app.modules.fiches import atelier, service
from app.modules.fiches.population import STATUS_DRAFT, STATUS_PERSONAL  # noqa: F401
from app.modules.fiches.schemas import FicheDraft
from app.tests.test_fiche_service import _seed_validated_lesson

# 14 phrases utilisables (30–160 caractères) : de quoi prouver le plafond à 12.
_COURS = """# Les séismes

Un séisme vient d'une cassure brutale des roches en profondeur.
L'épicentre est le point situé à la surface, juste au-dessus du foyer.
Le foyer est l'endroit exact où la rupture commence dans la croûte.
La magnitude mesure l'énergie libérée par la rupture des roches.
L'intensité décrit les dégâts observés en surface par les habitants.
Les ondes sismiques se propagent dans toutes les directions depuis le foyer.
Une réplique est une secousse plus faible qui suit la secousse principale.
Le 26 décembre 2004, un séisme très puissant a frappé l'île de Sumatra.
Les failles sont les zones où les plaques lithosphériques se rencontrent.
Un sismographe enregistre les vibrations du sol au cours du temps.
La tectonique des plaques explique la répartition mondiale des séismes.
Les constructions parasismiques réduisent beaucoup le nombre de victimes.
Un tsunami peut naître d'un séisme dont le foyer se trouve sous l'océan.
La prévision exacte de la date d'un séisme reste aujourd'hui impossible.
"""


def _ouvrir(db, lesson_id: int) -> dict:
    return atelier.open_or_get_draft(
        db, student_id=get_default_student(db).id, lesson_id=lesson_id
    )


def _nb_fiches_de_massimo(db) -> int:
    return db.scalar(
        select(func.count()).select_from(Fiche).where(Fiche.author == "massimo")
    )


# ── Promesse 1 : la reprise ────────────────────────────────────────────────────


def test_ouvrir_deux_fois_ne_fait_pas_deux_brouillons(client_db) -> None:
    """Idempotence : il peut entrer par la tuile, ressortir, entrer par le cours. Un seul objet."""
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db, content=_COURS)
        premier = _ouvrir(db, lesson.id)
        second = _ouvrir(db, lesson.id)
        assert premier["id"] == second["id"]
        assert _nb_fiches_de_massimo(db) == 1


def test_un_SECOND_brouillon_est_refuse_par_la_base(client_db) -> None:
    """🔴 Constaté en base le 2026-08-13 : 4 brouillons pour 2 leçons.

    StrictMode monte deux fois en dev (et un double-tap fait pareil en vrai) : les deux `POST
    /draft` partaient ensemble, aucune transaction ne voyait l'autre, chacune créait le sien.
    L'atelier lisait ensuite le brouillon rempli pendant que la tuile lisait le vide — Massimo
    aurait vu son travail disparaître de sa liste.

    Depuis `d4e5f6a7b8c3`, **la base refuse**. L'idempotence cesse d'être une intention du code.
    """
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db, content=_COURS)
        student = get_default_student(db)
        premier = _ouvrir(db, lesson.id)

        db.add(
            Fiche(
                lesson_id=lesson.id,
                spec_json={},
                validation_status=STATUS_DRAFT,
                author="massimo",
                student_id=student.id,
                source="manual",
                version=1,
            )
        )
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

        # …et le brouillon d'origine est intact.
        assert atelier.open_or_get_draft(db, student_id=student.id, lesson_id=lesson.id)["id"] == (
            premier["id"]
        )


def test_la_course_perdue_rend_le_brouillon_du_gagnant_pas_une_500(client_db) -> None:
    """Interdire n'est pas gérer. Sans rattrapage, la SECONDE des deux ouvertures simultanées
    renverrait une 500 à Massimo — alors qu'il a juste ouvert son atelier deux fois.

    On simule la course en aveuglant la première lecture : le code croit qu'aucun brouillon
    n'existe, tente l'insertion, se fait refuser par l'index, et doit alors retrouver celui de
    l'autre.
    """
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db, content=_COURS)
        student = get_default_student(db)
        gagnant = _ouvrir(db, lesson.id)

        reel = atelier.draft_of_student
        appels = {"n": 0}

        def _aveugle_une_fois(sid, lid):
            appels["n"] += 1
            return sa_false() if appels["n"] == 1 else reel(sid, lid)

        with patch.object(atelier, "draft_of_student", _aveugle_une_fois):
            perdant = atelier.open_or_get_draft(
                db, student_id=student.id, lesson_id=lesson.id
            )

        assert appels["n"] == 2  # la lecture a bien été rejouée après le refus
        assert perdant["id"] == gagnant["id"]


def test_tous_les_lecteurs_designent_le_MEME_brouillon(client_db) -> None:
    """L'ordre stable reste, en ceinture : l'index empêche le doublon de naître, l'ordre garantit
    que l'atelier et la tuile désignent le même objet quoi qu'il arrive."""
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db, content=_COURS)
        student = get_default_student(db)
        premier = _ouvrir(db, lesson.id)
        atelier.patch_draft(
            db,
            draft_id=premier["id"],
            student_id=student.id,
            draft=FicheDraft(**{**premier["draft"], "essentiel": "Mon travail."}),
        )

        tuile = next(
            t
            for t in service.subject_fiche_tiles(db, "mathematiques")
            if t["lesson_id"] == lesson.id
        )
        assert tuile["draft_id"] == premier["id"]
        assert tuile["etapes_remplies"] == 1  # l'essentiel est bien vu


def test_il_ferme_il_revient_il_retrouve_son_etat(client_db) -> None:
    """La promesse littérale de l'écran. Sans elle, la slice ne se teste pas sur deux séances."""
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db, content=_COURS)
        student = get_default_student(db)
        brouillon = _ouvrir(db, lesson.id)

        atelier.patch_draft(
            db,
            draft_id=brouillon["id"],
            student_id=student.id,
            draft=FicheDraft(
                **{**brouillon["draft"], "points_cles": ["L'épicentre est en surface.", "Le foyer est en profondeur."]}
            ),
        )

        repris = _ouvrir(db, lesson.id)
        assert repris["id"] == brouillon["id"]  # reprise EN PLACE, aucune version créée
        assert repris["version"] == 1
        assert len(repris["draft"]["points_cles"]) == 2


def test_vider_un_emplacement_est_possible(client_db) -> None:
    """Retirer une phrase est la moitié du geste « je choisis ». Une sauvegarde par FUSION
    rendrait ce geste impossible — d'où le remplacement franc du `spec_json`."""
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db, content=_COURS)
        student = get_default_student(db)
        brouillon = _ouvrir(db, lesson.id)
        garni = {**brouillon["draft"], "points_cles": ["Une phrase.", "Une autre."]}
        atelier.patch_draft(
            db, draft_id=brouillon["id"], student_id=student.id, draft=FicheDraft(**garni)
        )

        vide = atelier.patch_draft(
            db,
            draft_id=brouillon["id"],
            student_id=student.id,
            draft=FicheDraft(**{**garni, "points_cles": []}),
        )
        assert vide["draft"]["points_cles"] == []


# ── Promesse 2 : un brouillon n'est pas une fiche ──────────────────────────────


def test_un_brouillon_n_est_pas_servi_comme_une_fiche(client_db) -> None:
    """§1 bis : ni servi, ni imprimable, ni dérivable. Le deck ne doit pas le voir — et pour cause,
    `FicheOut.spec` est un `FicheSpec` STRICT : un brouillon à 2 points-clés le ferait exploser."""
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db, content=_COURS)
        brouillon = _ouvrir(db, lesson.id)

        assert service.list_subject_fiches(db, "mathematiques") == []
        maths = next(
            s for s in service.fiches_summary(db)["subjects"] if s["slug"] == "mathematiques"
        )
        assert maths["fiche_count"] == 0

        with pytest.raises(Exception) as err:
            service.get_student_fiche(db, brouillon["id"])
        assert getattr(err.value, "status_code", None) == 404


def test_finir_sans_l_essentiel_refuse_et_nomme_ce_qui_manque(client_db) -> None:
    """Le 422 n'est pas une erreur technique à masquer : il dit ce qu'il manque, et l'écran doit
    le traduire en langage d'enfant. Encore faut-il que le serveur le NOMME."""
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db, content=_COURS)
        student = get_default_student(db)
        brouillon = _ouvrir(db, lesson.id)  # décor pré-rempli, sections vides

        with pytest.raises(Exception) as err:
            atelier.finish_draft(db, draft_id=brouillon["id"], student_id=student.id)
        assert getattr(err.value, "status_code", None) == 422
        assert "essentiel" in err.value.detail["champs"]

        # et il reste un brouillon — un refus ne détruit pas son travail
        assert db.get(Fiche, brouillon["id"]).validation_status == STATUS_DRAFT


def test_finir_fait_exister_la_fiche_et_le_deck_la_voit(client_db) -> None:
    """Le passage `FicheDraft` → `FicheSpec` est le moment où la fiche existe."""
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db, content=_COURS)
        student = get_default_student(db)
        brouillon = _ouvrir(db, lesson.id)
        atelier.patch_draft(
            db,
            draft_id=brouillon["id"],
            student_id=student.id,
            draft=FicheDraft(
                **{
                    **brouillon["draft"],
                    "essentiel": "Un séisme, c'est quand les roches cassent d'un coup.",
                    "points_cles": ["L'épicentre est en surface."],
                }
            ),
        )
        fini = atelier.finish_draft(db, draft_id=brouillon["id"], student_id=student.id)

        assert db.get(Fiche, fini["id"]).validation_status == STATUS_PERSONAL
        assert [f["id"] for f in service.list_subject_fiches(db, "mathematiques")] == [fini["id"]]


# ── Promesse 3 : retravailler n'écrase pas ─────────────────────────────────────


def test_retravailler_cree_une_version_et_garde_l_ancienne(client_db) -> None:
    """§7 : la trajectoire dans le temps est le seul endroit du produit qui montre « sait-il ce
    qui compte ». L'écraser la détruirait."""
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db, content=_COURS)
        student = get_default_student(db)
        brouillon = _ouvrir(db, lesson.id)
        atelier.patch_draft(
            db,
            draft_id=brouillon["id"],
            student_id=student.id,
            draft=FicheDraft(**{**brouillon["draft"], "essentiel": "Première version."}),
        )
        v1 = atelier.finish_draft(db, draft_id=brouillon["id"], student_id=student.id)

        v2 = atelier.rework(db, fiche_id=v1["id"], student_id=student.id)
        assert v2["id"] != v1["id"]
        assert v2["version"] == 2
        assert v2["draft"]["essentiel"] == "Première version."  # elle repart de son travail
        assert db.get(Fiche, v1["id"]).validation_status == STATUS_PERSONAL  # l'ancienne reste

        # Retravailler deux fois de suite ne fabrique pas deux versions parallèles.
        assert atelier.rework(db, fiche_id=v1["id"], student_id=student.id)["id"] == v2["id"]


# ── Les phrases candidates ─────────────────────────────────────────────────────


def test_les_candidates_sont_tirees_du_cours_bornees_et_stables(client_db) -> None:
    """Trois propriétés, trois raisons. **Tirées du cours** : règle 7. **Bornées à 12** : au-delà,
    choisir devient trier. **Stables** : les emplacements retenus renvoient à des index, donc une
    liste qui bouge d'une session à l'autre casserait la reprise."""
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db, content=_COURS)
        student = get_default_student(db)
        brouillon = _ouvrir(db, lesson.id)

        out = atelier.candidates(
            db, draft_id=brouillon["id"], student_id=student.id, section="points_cles"
        )
        assert len(out["candidates"]) == atelier.NB_CANDIDATES == 12
        assert out["slots"] == 5
        for c in out["candidates"]:
            assert c["texte"] in _COURS  # mot pour mot : ZETIS n'en a écrit aucune

        encore = atelier.candidates(
            db, draft_id=brouillon["id"], student_id=student.id, section="points_cles"
        )
        assert encore == out  # déterministe


# Le vrai cours de « La phrase complexe » — celui qui a produit les trois défauts vus à l'écran
# le 2026-08-13. Il reste ici tel quel : un test écrit d'après un cours de laboratoire ne les
# aurait jamais attrapés (mon `_COURS` ci-dessus n'a ni guillemets, ni gras, ni discours).
_COURS_REEL = """# La phrase complexe

Aujourd'hui, on va apprendre à construire des phrases plus riches et plus nuancées.
Tu connais déjà la phrase simple, qui contient un seul verbe conjugué.
Imagine que tu dois expliquer pourquoi tu es en retard.
Phrase simple : « Je suis en retard. »
Phrase complexe : « Il pleuvait, alors j'ai pris mon parapluie et je suis arrivé en retard. »
Dans une phrase complexe, on a **plusieurs propositions**.
Une proposition est un groupe de mots qui contient un verbe conjugué.
Si ces propositions sont collées sans mot de liaison, c'est de la **juxtaposition**.
Si on utilise un petit mot pour les lier logiquement, c'est de la **coordination**.
Les propositions coordonnées sont reliées par une conjonction de coordination.
"""


def test_une_citation_francaise_n_est_pas_coupee_en_deux(client_db) -> None:
    """🔴 Défaut vu à l'écran, invisible à tous mes tests précédents.

    Le point INTERNE d'un « … » déclenchait la coupure : Massimo se voyait proposer une phrase
    tronquée sans son guillemet fermant, et un fragment commençant par un `»` orphelin — qu'il
    aurait mis tel quel sur sa fiche.
    """
    phrases = atelier._phrases_du_cours(_COURS_REEL)
    assert not any(p.lstrip().startswith("»") for p in phrases), phrases
    # Aucune phrase ne doit ouvrir une citation sans la refermer.
    for p in phrases:
        assert p.count("«") == p.count("»"), p


def test_le_gras_du_cours_ne_laisse_pas_d_espace_avant_le_point(client_db) -> None:
    """`**plusieurs propositions**.` sortait en « plusieurs propositions . » — une cicatrice sur
    toutes les phrases dont le cours met la fin en gras."""
    phrases = atelier._phrases_du_cours(_COURS_REEL)
    assert not any(" ." in p or " ," in p for p in phrases), phrases
    assert any("plusieurs propositions." in p for p in phrases), phrases


def test_le_discours_pedagogique_est_ecarte(client_db) -> None:
    """« Aujourd'hui, on va apprendre… », « Imagine que… », « Tu connais déjà… » sont VRAIES,
    mais ce ne sont pas des idées à retenir. Les proposer, c'est faire trier l'introduction."""
    phrases = atelier._phrases_du_cours(_COURS_REEL)
    for discours in ("Aujourd'hui", "Imagine que", "Tu connais"):
        assert not any(p.startswith(discours) for p in phrases), phrases
    # L'ILLUSTRATION annoncée par deux-points (« Phrase simple : « … » ») est l'exemple, pas
    # l'idée. Branche distincte du contrôle de préfixe — elle mérite son propre verrou, sans quoi
    # la sabotant ne ferait rougir aucun test.
    assert not any(re.search(r":\s*«", p) for p in phrases), phrases
    # …et les énoncés, eux, sont bien là.
    assert any("Une proposition est un groupe de mots" in p for p in phrases), phrases


def test_une_phrase_entierement_citee_est_un_exemple_pas_une_idee(client_db) -> None:
    """« Le vent soufflait, les arbres dansaient. » n'est pas une idée à retenir : c'est ce SUR
    QUOI l'idée porte. Vu à l'écran après la première passe de filtrage — un filtre se règle
    sur du vrai texte, pas sur une intention."""
    cours = (
        "Dans une phrase complexe, on trouve plusieurs propositions reliées entre elles.\n"
        "« Le vent soufflait, les arbres dansaient. »\n"
        "Les propositions juxtaposées sont séparées par une simple virgule.\n"
        "Une conjonction de coordination relie deux propositions de même nature.\n"
        "La subordination place une proposition sous la dépendance d'une autre.\n"
        "Le verbe conjugué est le noyau de toute proposition française.\n"
    )
    phrases = atelier._phrases_du_cours(cours)
    assert not any(p.startswith("«") for p in phrases), phrases
    assert any("juxtaposées" in p for p in phrases), phrases


def test_une_phrase_qui_s_adresse_a_l_eleve_est_ecartee_meme_sans_prefixe(client_db) -> None:
    """« Mais dans la vie de tous les jours, TU AS souvent plusieurs idées… » ne commence par
    aucun préfixe de discours — c'est le marqueur interne qui doit l'attraper."""
    cours = (
        "Mais dans la vie de tous les jours, tu as souvent plusieurs idées à exprimer.\n"
        "Une proposition contient un verbe conjugué et son sujet.\n"
        "La juxtaposition relie les propositions par la seule ponctuation.\n"
        "La coordination emploie une conjonction pour lier deux propositions.\n"
        "La subordination introduit une proposition dépendante d'une principale.\n"
        "Le sens global de la phrase dépend du lien choisi entre les propositions.\n"
    )
    phrases = atelier._phrases_du_cours(cours)
    assert not any("tu as" in p.lower() for p in phrases), phrases


def test_un_cours_tout_en_discours_propose_quand_meme_quelque_chose(client_db) -> None:
    """Le filtre ne doit jamais vider l'atelier : mieux vaut des candidates imparfaites qu'un
    écran vide, qui se lirait comme « il n'y a rien à retenir »."""
    tout_discours = "\n".join(
        f"Tu vas découvrir la notion numéro {i} de ce chapitre de français." for i in range(6)
    )
    assert len(atelier._phrases_du_cours(tout_discours)) >= 5


def test_essentiel_n_offre_aucune_candidate_mais_une_amorce(client_db) -> None:
    """⚠️ **Comportement CHANGÉ en slice 2**, à dessein. En slice 1, `essentiel` renvoyait 400 —
    la section n'existait pas encore. Le raisonnement, lui, n'a pas bougé : `essentiel` est une
    **synthèse**, absente du cours par définition, donc aucune phrase candidate ne peut la porter
    (§8). Ce qui change, c'est ce qu'on fait de ce vide : au lieu de refuser, on pose une
    **amorce** — règle 1 des champs libres, la page blanche est ce qui fait recopier le cours.
    """
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db, content=_COURS)
        student = get_default_student(db)
        brouillon = _ouvrir(db, lesson.id)

        out = atelier.candidates(
            db, draft_id=brouillon["id"], student_id=student.id, section="essentiel"
        )
        assert out["candidates"] == []  # rien à choisir, et c'est la décision
        assert out["slots"] == 1
        assert out["amorce"] and out["amorce"].endswith("c'est…")
        # L'amorce parle de LA leçon, elle n'est pas un texte générique.
        assert lesson.title in out["amorce"]


def test_l_amorce_coupe_le_sous_titre_de_la_lecon(client_db) -> None:
    """🔴 Vu à l'écran le 2026-08-13, invisible au test précédent qui utilisait un titre court.

    Les titres du référentiel portent très souvent « Notion : précisions ». Collé tel quel à
    « , c'est… », ça donne « La phrase complexe : juxtaposition et coordination, c'est… » —
    illisible. Seule la TÊTE du titre est un groupe nominal qu'on peut suffixer.
    """
    assert (
        atelier._amorce_essentiel("La phrase complexe : juxtaposition et coordination")
        == "La phrase complexe, c'est…"
    )
    assert atelier._amorce_essentiel("Les séismes") == "Les séismes, c'est…"
    # Un titre qui n'est QUE des précisions ne doit pas donner une amorce vide.
    assert atelier._amorce_essentiel(": rien devant") == ": rien devant, c'est…"


# ── Slice 2 : les deux sections qui s'ÉCRIVENT ─────────────────────────────────


def test_les_termes_viennent_des_notions_PUIS_du_gras(client_db) -> None:
    """L'ordre est un arbitrage (2026-08-13) : les **notions** portent le programme, le **gras**
    complète — une leçon n'a souvent que deux ou trois notions alors que la fiche accepte quatre
    définitions."""
    _, Session = client_db
    with Session() as db:
        cours = (
            "Un séisme casse les roches en profondeur.\n"
            "L'**épicentre** est le point situé à la surface.\n"
            "La **magnitude** mesure l'énergie libérée.\n"
        )
        lesson = _seed_validated_lesson(db, content=cours)
        student = get_default_student(db)
        brouillon = _ouvrir(db, lesson.id)

        out = atelier.candidates(
            db, draft_id=brouillon["id"], student_id=student.id, section="definitions"
        )
        termes = [c["texte"] for c in out["candidates"]]
        assert termes[0] == "Nombres relatifs"  # la notion de la leçon, en premier
        assert "épicentre" in termes and "magnitude" in termes  # le gras, ensuite
        assert out["slots"] == len(termes)


def test_un_terme_trop_long_est_ecarte_A_LA_SOURCE(client_db) -> None:
    """🔴 `Skill.name` accepte 160 caractères, `FicheDefinition.terme` en accepte 80. Un terme
    trop long proposé ferait échouer la validation **au `finish`** — donc APRÈS que Massimo a
    écrit sa définition. Le défaut serait tardif, invisible pendant tout le travail, et injuste.
    """
    _, Session = client_db
    with Session() as db:
        trop_long = "mot " * 30  # 120 caractères
        lesson = _seed_validated_lesson(db, content=f"Une phrase. Un **{trop_long}** ici.\n")
        student = get_default_student(db)
        brouillon = _ouvrir(db, lesson.id)

        out = atelier.candidates(
            db, draft_id=brouillon["id"], student_id=student.id, section="definitions"
        )
        for c in out["candidates"]:
            assert len(c["texte"]) <= 80, c["texte"]


def test_recopie_ne_se_declenche_JAMAIS_sur_les_points_cles(client_db) -> None:
    """🔴 Le verrou qui porte la décision de la slice 1, et qui doit survivre à la slice 2.

    En mode « je choisis », les points-clés SONT des phrases du cours mot pour mot. Y appliquer
    `recopie` dirait à Massimo que tout son travail est du copiage, alors qu'il a fait exactement
    ce qu'on lui demandait.
    """
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db, content=_COURS_REEL)
        student = get_default_student(db)
        brouillon = _ouvrir(db, lesson.id)
        # Cinq phrases prises MOT POUR MOT dans le cours.
        copiees = atelier._phrases_du_cours(_COURS_REEL)[:5]
        atelier.patch_draft(
            db,
            draft_id=brouillon["id"],
            student_id=student.id,
            draft=FicheDraft(**{**brouillon["draft"], "points_cles": copiees}),
        )

        retour = atelier.review_draft(db, draft_id=brouillon["id"], student_id=student.id)
        assert retour["remarques"] == [], retour["remarques"]


def test_recopie_se_declenche_sur_un_essentiel_recopie(client_db) -> None:
    """Le signal le plus important pédagogiquement, et le moins cher : déterministe, zéro LLM,
    zéro faux positif. ZETIS ne dit pas « c'est faux », il dit « ces mots viennent de ton cours »
    — c'est **vérifiable**."""
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db, content=_COURS_REEL)
        student = get_default_student(db)
        brouillon = _ouvrir(db, lesson.id)
        recopie = "Une proposition est un groupe de mots qui contient un verbe conjugué."
        atelier.patch_draft(
            db,
            draft_id=brouillon["id"],
            student_id=student.id,
            draft=FicheDraft(**{**brouillon["draft"], "essentiel": recopie}),
        )

        retour = atelier.review_draft(db, draft_id=brouillon["id"], student_id=student.id)
        assert len(retour["remarques"]) == 1
        r = retour["remarques"][0]
        assert r["type"] == "recopie" and r["section"] == "essentiel"
        assert "mot pour mot" in r["message"]
        # La piste est une QUESTION, jamais la phrase corrigée : ZETIS rend le défaut visible,
        # il ne fournit pas la formulation (règle 7).
        assert r["piste"].endswith("?")
        assert recopie not in r["piste"]
        # 🔴 ZETIS cite le texte DE MASSIMO, pas la forme normalisée qu'il compare en interne.
        # Vu à l'écran le 2026-08-13 : il lui renvoyait sa phrase en minuscules, sans ponctuation
        # — il ne s'y reconnaissait pas, et la remarque parlait de quelqu'un d'autre.
        assert "Une proposition est un groupe" in r["message"]


def test_un_essentiel_ecrit_avec_ses_mots_est_NOMME_comme_reussite(client_db) -> None:
    """Règle 2 du §5 : nommer d'abord une réussite, et précisément. `essentiel` est la section la
    plus difficile des six — la réussir mérite d'être dit, pas un « bravo » générique."""
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db, content=_COURS_REEL)
        student = get_default_student(db)
        brouillon = _ouvrir(db, lesson.id)
        atelier.patch_draft(
            db,
            draft_id=brouillon["id"],
            student_id=student.id,
            draft=FicheDraft(
                **{
                    **brouillon["draft"],
                    "essentiel": "Quand deux idées tiennent dans une seule phrase, c'est complexe.",
                }
            ),
        )

        retour = atelier.review_draft(db, draft_id=brouillon["id"], student_id=student.id)
        assert retour["remarques"] == []
        assert any("tes mots" in r for r in retour["reussites"])
        assert not any("bravo" in r.lower() for r in retour["reussites"])


def test_le_retour_ne_depasse_JAMAIS_deux_remarques(client_db) -> None:
    """Sept remarques ne sont pas de l'aide, c'est un bulletin — et un enfant abandonne. La borne
    est dure côté serveur, pas une consigne d'écran."""
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db, content=_COURS_REEL)
        student = get_default_student(db)
        brouillon = _ouvrir(db, lesson.id)
        phrases = atelier._phrases_du_cours(_COURS_REEL)
        atelier.patch_draft(
            db,
            draft_id=brouillon["id"],
            student_id=student.id,
            draft=FicheDraft(
                **{
                    **brouillon["draft"],
                    "essentiel": phrases[0],
                    "definitions": [
                        {"terme": f"mot {i}", "definition": p} for i, p in enumerate(phrases[1:4])
                    ],
                }
            ),
        )

        retour = atelier.review_draft(db, draft_id=brouillon["id"], student_id=student.id)
        assert len(retour["remarques"]) <= 2
        assert 1 <= len(retour["reussites"]) <= 2


# ── L'écran 2 : une tuile par LEÇON, quatre états ──────────────────────────────


def _fiche_de_massimo(db, lesson_id: int, student_id: int) -> Fiche:
    """Une fiche personnelle FINIE — l'état que `finish_draft` produit."""
    row = Fiche(
        lesson_id=lesson_id,
        spec_json={
            "title": "T",
            "subject": "M",
            "level": "4e",
            "essentiel": "La sienne.",
            "definitions": [],
            "points_cles": [],
            "erreurs_a_eviter": [],
        },
        validation_status=STATUS_PERSONAL,
        author="massimo",
        student_id=student_id,
        source="manual",
        version=1,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _fiche_zetis(db, lesson_id: int, *, status: str) -> Fiche:
    row = Fiche(
        lesson_id=lesson_id,
        spec_json={
            "title": "T",
            "subject": "M",
            "level": "4e",
            "essentiel": "Celle de ZETIS.",
            "definitions": [],
            "points_cles": [],
            "erreurs_a_eviter": [],
        },
        validation_status=status,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _lecon_soeur(db, modele, titre: str, *, content: str | None = _COURS):
    """Une seconde leçon dans le MÊME chapitre — sans recréer une année active."""
    from app.db.models import Lesson

    l = Lesson(
        chapter_id=modele.chapter_id,
        title=titre,
        status="validated",
        created_by="ai",
        content_markdown=content,
        program_version="2020",
        sort_order=modele.sort_order + 1,
    )
    db.add(l)
    db.commit()
    db.refresh(l)
    return l


def test_les_quatre_etats_de_l_ecran_2(client_db) -> None:
    """🔴 Ce que la liste fiche-centrée ne pouvait PAS montrer : un travail commencé et une leçon
    à fabriquer. Sans ces deux états, une fiche interrompue était perdue de vue — alors que le
    serveur la gardait parfaitement. Constaté à l'usage le 2026-08-13."""
    _, Session = client_db
    with Session() as db:
        a = _seed_validated_lesson(db, content=_COURS)  # → commencée
        b = _lecon_soeur(db, a, "Leçon finie")  # → ma_fiche
        c = _lecon_soeur(db, a, "Leçon ZETIS")  # → zetis
        d = _lecon_soeur(db, a, "Leçon vierge")  # → à fabriquer
        student = get_default_student(db)

        atelier.open_or_get_draft(db, student_id=student.id, lesson_id=a.id)
        fini = _fiche_de_massimo(db, b.id, student.id)
        _fiche_zetis(db, c.id, status="validated")

        par_lecon = {t["lesson_id"]: t for t in service.subject_fiche_tiles(db, "mathematiques")}
        assert par_lecon[a.id]["etat"] == "commencee"
        assert par_lecon[a.id]["draft_id"] is not None
        assert par_lecon[b.id]["etat"] == "ma_fiche"
        assert par_lecon[b.id]["fiche_id"] == fini.id
        assert par_lecon[c.id]["etat"] == "zetis"
        assert par_lecon[d.id]["etat"] == "a_fabriquer"


def test_un_brouillon_passe_AVANT_une_fiche_finie(client_db) -> None:
    """§7 : s'il a rouvert sa fiche pour la retravailler, c'est CE travail qu'il veut reprendre —
    pas relire la version précédente. L'ordre de priorité n'est pas arbitraire."""
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db, content=_COURS)
        student = get_default_student(db)
        brouillon = atelier.open_or_get_draft(db, student_id=student.id, lesson_id=lesson.id)
        atelier.patch_draft(
            db,
            draft_id=brouillon["id"],
            student_id=student.id,
            draft=FicheDraft(**{**brouillon["draft"], "essentiel": "Version 1."}),
        )
        v1 = atelier.finish_draft(db, draft_id=brouillon["id"], student_id=student.id)
        atelier.rework(db, fiche_id=v1["id"], student_id=student.id)  # une v2 est en cours

        tuile = next(
            t for t in service.subject_fiche_tiles(db, "mathematiques") if t["lesson_id"] == lesson.id
        )
        assert tuile["etat"] == "commencee"
        assert tuile["versions"] == 1  # la v1 finie existe toujours


def test_une_lecon_sans_cours_NI_fiche_n_apparait_pas(client_db) -> None:
    """Montrer une tuile qui ne s'ouvre sur rien serait une porte peinte sur un mur."""
    _, Session = client_db
    with Session() as db:
        a = _seed_validated_lesson(db, content=_COURS)
        vide = _lecon_soeur(db, a, "Rien du tout", content=None)

        ids = {t["lesson_id"] for t in service.subject_fiche_tiles(db, "mathematiques")}
        assert a.id in ids
        assert vide.id not in ids


def test_le_corrige_ZETIS_reste_a_un_clic_meme_quand_il_a_sa_fiche(client_db) -> None:
    """§3 révisé : rien n'est verrouillé. Ce qui change, c'est ce qui s'ouvre EN PREMIER."""
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db, content=_COURS)
        student = get_default_student(db)
        sienne = _fiche_de_massimo(db, lesson.id, student.id)
        zetis = _fiche_zetis(db, lesson.id, status="validated")

        tuile = next(
            t for t in service.subject_fiche_tiles(db, "mathematiques") if t["lesson_id"] == lesson.id
        )
        assert tuile["etat"] == "ma_fiche"
        assert tuile["fiche_id"] == sienne.id  # la SIENNE s'ouvre en premier
        assert tuile["zetis_fiche_id"] == zetis.id  # le corrigé reste accessible


def test_la_dictee_refuse_le_brouillon_d_un_autre(client_db) -> None:
    """La dictée ne renvoie que du texte — mais elle consomme du Whisper local et laisse une
    trace `ai_jobs`. La faire sur le brouillon d'un autre n'aurait aucun sens."""
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db, content=_COURS)
        brouillon = _ouvrir(db, lesson.id)
        autre = get_default_student(db).id + 1

        with pytest.raises(Exception) as err:
            atelier.assert_draft_is_mine(db, draft_id=brouillon["id"], student_id=autre)
        assert getattr(err.value, "status_code", None) == 404


def test_une_section_non_implementee_refuse_explicitement(client_db) -> None:
    """Refuser en nommant la section vaut mieux qu'une liste vide, qui se lirait
    « il n'y a rien à retenir ici »."""
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db, content=_COURS)
        student = get_default_student(db)
        brouillon = _ouvrir(db, lesson.id)

        with pytest.raises(Exception) as err:
            atelier.candidates(
                db, draft_id=brouillon["id"], student_id=student.id, section="mnemonique"
            )
        assert getattr(err.value, "status_code", None) == 400


def test_un_cours_non_ecrit_le_dit_au_lieu_de_rendre_une_liste_vide(client_db) -> None:
    """Une liste vide se lirait comme « il n'y a rien à retenir » — un message faux et décourageant."""
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db, content=None)
        student = get_default_student(db)
        brouillon = _ouvrir(db, lesson.id)

        with pytest.raises(Exception) as err:
            atelier.candidates(
                db, draft_id=brouillon["id"], student_id=student.id, section="points_cles"
            )
        assert getattr(err.value, "status_code", None) == 409


# ── L'appartenance, et le corrigé ──────────────────────────────────────────────


def test_le_brouillon_d_un_autre_ne_se_touche_pas(client_db) -> None:
    """Une fiche personnelle n'a pas de cycle éditorial : rien d'autre ne la protège."""
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db, content=_COURS)
        brouillon = _ouvrir(db, lesson.id)
        autre = get_default_student(db).id + 1

        for appel in (
            lambda: atelier.patch_draft(
                db, draft_id=brouillon["id"], student_id=autre, draft=FicheDraft()
            ),
            lambda: atelier.finish_draft(db, draft_id=brouillon["id"], student_id=autre),
            lambda: atelier.candidates(
                db, draft_id=brouillon["id"], student_id=autre, section="points_cles"
            ),
        ):
            with pytest.raises(Exception) as err:
                appel()
            assert getattr(err.value, "status_code", None) == 404


def test_regarde_ma_fiche_ne_rend_que_des_reussites_en_slice_1(client_db) -> None:
    """🔴 Le verrou du blocage tranché : `recopie` est ABSENT de la slice 1, et c'est voulu.

    En mode « je choisis », les points-clés sont des phrases du cours mot pour mot : `recopie`
    flaguerait les cinq et dirait à Massimo que tout son travail est du copiage. Ce test rougira
    le jour où quelqu'un rebranchera les remarques sans avoir ajouté une section qui s'ÉCRIT.
    """
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db, content=_COURS)
        student = get_default_student(db)
        brouillon = _ouvrir(db, lesson.id)
        atelier.patch_draft(
            db,
            draft_id=brouillon["id"],
            student_id=student.id,
            draft=FicheDraft(
                **{**brouillon["draft"], "points_cles": ["L'épicentre est le point situé à la surface."]}
            ),
        )

        retour = atelier.review_draft(db, draft_id=brouillon["id"], student_id=student.id)
        assert retour["remarques"] == []
        assert 1 <= len(retour["reussites"]) <= 2
        assert all(r.strip() for r in retour["reussites"])
        assert not any("bravo" in r.lower() for r in retour["reussites"])


def test_une_reussite_nomme_ce_que_le_cours_met_en_gras(client_db) -> None:
    """« Précise » veut dire vérifiable : ZETIS cite ce que le COURS souligne, pas une politesse."""
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(
            db, content="Le foyer est en profondeur.\n\n**L'épicentre est en surface.**\n"
        )
        student = get_default_student(db)
        brouillon = _ouvrir(db, lesson.id)
        atelier.patch_draft(
            db,
            draft_id=brouillon["id"],
            student_id=student.id,
            draft=FicheDraft(
                **{**brouillon["draft"], "points_cles": ["L'épicentre est en surface."]}
            ),
        )

        reussites = atelier.review_draft(
            db, draft_id=brouillon["id"], student_id=student.id
        )["reussites"]
        assert any("gras" in r for r in reussites)


def test_regarder_une_fiche_vide_invite_au_lieu_de_planter(client_db) -> None:
    """Le refus doit rester une invitation, jamais une erreur.

    ⚠️ **Libellé CHANGÉ en slice 2** : « choisis au moins une idée » est devenu faux, puisqu'on
    peut maintenant commencer en **écrivant** (`essentiel`, `definitions`) et pas seulement en
    choisissant. Le comportement, lui, n'a pas bougé : 409 tant que rien n'est rempli.
    """
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db, content=_COURS)
        student = get_default_student(db)
        brouillon = _ouvrir(db, lesson.id)

        with pytest.raises(Exception) as err:
            atelier.review_draft(db, draft_id=brouillon["id"], student_id=student.id)
        assert getattr(err.value, "status_code", None) == 409
        assert "Commence par quelque chose" in err.value.detail


def test_le_corrige_s_ouvre_sans_condition_de_tentative(client_db) -> None:
    """§3 révisé le 2026-08-12 : « lire avant de fabriquer, c'est ok ». Ni 403, ni état
    « a-t-il tenté ? » à tenir côté serveur — ce qui reste du §3 est un défaut d'ouverture."""
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db, content=_COURS)
        zetis = Fiche(
            lesson_id=lesson.id,
            spec_json={
                "title": "Les séismes",
                "subject": "Mathématiques",
                "level": "4e",
                "essentiel": "La fiche de ZETIS.",
                "definitions": [],
                "points_cles": [],
                "erreurs_a_eviter": [],
            },
            validation_status="validated",
        )
        db.add(zetis)
        db.commit()

        # Aucun brouillon, aucune tentative : le corrigé s'ouvre quand même.
        assert service.fiche_zetis_de_lecon(db, lesson.id)["id"] == zetis.id


# ── Le pont : ses définitions deviennent ses cartes (addendum ADR-0015 §13) ────────


def _fiche_avec_definitions(db, lesson_id: int, student_id: int, definitions: list[dict]) -> Fiche:
    row = _fiche_de_massimo(db, lesson_id, student_id)
    row.spec_json = {**row.spec_json, "definitions": definitions}
    db.commit()
    db.refresh(row)
    return row


def _cartes(db, student_id: int) -> dict:
    return {
        (c.skill_id, c.card_type): c
        for c in db.scalars(
            select(SpacedReviewCard).where(SpacedReviewCard.student_id == student_id)
        )
    }


def test_une_definition_sur_une_NOTION_devient_une_carte(client_db) -> None:
    """Recto le terme de ZETIS, verso la phrase de Massimo — aucune transformation (§8).

    C'est **sa** formulation qu'il révisera : c'est tout l'intérêt du pont.
    """
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db, content=_COURS)
        eleve = get_default_student(db).id
        fiche = _fiche_avec_definitions(
            db, lesson.id, eleve,
            [{"terme": "Nombres relatifs", "definition": "Des nombres avec un signe devant."}],
        )

        res = atelier.cartes_depuis_la_fiche(db, fiche_id=fiche.id, student_id=eleve)
        assert res == {"cartes": 1, "termes_sans_notion": []}

        cartes = _cartes(db, eleve)
        (carte,) = [c for (_, t), c in cartes.items() if t == "definition_perso"]
        assert carte.front_markdown == "Nombres relatifs"
        assert carte.back_markdown == "Des nombres avec un signe devant."


def test_un_terme_SANS_notion_ne_donne_pas_de_carte_ET_LE_DIT(client_db) -> None:
    """🔴 Le nombre ne doit pas mentir.

    ZETIS propose les termes en deux temps : les notions de la leçon, **puis le gras du cours**.
    Un terme venu du gras n'a aucune notion derrière lui — donc aucune carte possible
    (`skill_id` est NOT NULL). Annoncer « 2 cartes » pour en créer 1 serait le défaut de la file
    de relecture (`adr-0039`).
    """
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db, content=_COURS)
        eleve = get_default_student(db).id
        fiche = _fiche_avec_definitions(
            db, lesson.id, eleve,
            [
                {"terme": "Nombres relatifs", "definition": "Avec un signe."},
                {"terme": "mot en gras du cours", "definition": "Ce que j'en dis."},
            ],
        )

        res = atelier.cartes_depuis_la_fiche(db, fiche_id=fiche.id, student_id=eleve)
        assert res["cartes"] == 1
        assert res["termes_sans_notion"] == ["mot en gras du cours"]


def test_le_pont_N_ECRASE_PAS_la_carte_de_ZETIS(client_db) -> None:
    """🔴 La raison d'être de tout le §13 : deux cartes coexistent sur la même notion."""
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db, content=_COURS)
        eleve = get_default_student(db).id
        skill = db.scalar(select(Skill).where(Skill.name == "Nombres relatifs"))
        db.add(
            SpacedReviewCard(
                student_id=eleve, skill_id=skill.id, card_type="definition",
                front_markdown="La définition de ZETIS.", back_markdown="Sa réponse.",
                interval_days=7, status="scheduled",
            )
        )
        db.commit()

        fiche = _fiche_avec_definitions(
            db, lesson.id, eleve,
            [{"terme": "Nombres relatifs", "definition": "Ma définition à moi."}],
        )
        atelier.cartes_depuis_la_fiche(db, fiche_id=fiche.id, student_id=eleve)

        cartes = _cartes(db, eleve)
        assert set(t for (_, t) in cartes) == {"definition", "definition_perso"}
        assert cartes[(skill.id, "definition")].front_markdown == "La définition de ZETIS."
        assert cartes[(skill.id, "definition_perso")].back_markdown == "Ma définition à moi."


def test_rejouer_le_pont_MET_A_JOUR_au_lieu_de_dupliquer(client_db) -> None:
    """Il corrige une définition et refait le geste : la carte suit, elle ne se dédouble pas."""
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db, content=_COURS)
        eleve = get_default_student(db).id
        fiche = _fiche_avec_definitions(
            db, lesson.id, eleve,
            [{"terme": "Nombres relatifs", "definition": "Première version."}],
        )
        atelier.cartes_depuis_la_fiche(db, fiche_id=fiche.id, student_id=eleve)

        fiche.spec_json = {
            **fiche.spec_json,
            "definitions": [{"terme": "Nombres relatifs", "definition": "Version corrigée."}],
        }
        db.commit()
        atelier.cartes_depuis_la_fiche(db, fiche_id=fiche.id, student_id=eleve)

        cartes = [c for (_, t), c in _cartes(db, eleve).items() if t == "definition_perso"]
        assert len(cartes) == 1
        assert cartes[0].back_markdown == "Version corrigée."


def test_le_pont_ne_s_ouvre_PAS_sur_un_brouillon(client_db) -> None:
    """§1 bis : un brouillon n'est ni exportable ni dérivable. C'est ce qui empêche un
    demi-travail d'entrer dans le circuit de révision."""
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db, content=_COURS)
        eleve = get_default_student(db).id
        brouillon = _ouvrir(db, lesson.id)

        with pytest.raises(HTTPException) as err:
            atelier.cartes_depuis_la_fiche(db, fiche_id=brouillon["id"], student_id=eleve)
        assert err.value.status_code == 404


# ── `erreurs_a_eviter` : ZETIS rappelle un FAIT, il n'invente pas (§8) ─────────────


def _rater_un_quiz(db, lesson_id: int, skill_id: int, student_id: int, combien: int) -> None:
    subject_id = db.scalar(select(Skill.subject_id).where(Skill.id == skill_id))
    quiz = Quiz(subject_id=subject_id, lesson_id=lesson_id, title="Quiz", status="validated")
    db.add(quiz)
    db.flush()
    question = QuizQuestion(quiz_id=quiz.id, skill_id=skill_id, prompt_markdown="Une question ?")
    db.add(question)
    db.flush()
    for _ in range(combien):
        essai = QuizAttempt(quiz_id=quiz.id, student_id=student_id)
        db.add(essai)
        db.flush()
        db.add(QuizAnswer(attempt_id=essai.id, question_id=question.id, is_correct=False))
    db.commit()


def test_un_piege_vient_de_ses_ERREURS_avec_le_compte(client_db) -> None:
    """Un piège ne se rédige pas, ça se CONSTATE. La raison porte le fait, pas un conseil."""
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db, content=_COURS)
        eleve = get_default_student(db).id
        skill = db.scalar(select(Skill).where(Skill.name == "Nombres relatifs"))
        _rater_un_quiz(db, lesson.id, skill.id, eleve, 2)
        brouillon = _ouvrir(db, lesson.id)

        out = atelier.candidates(
            db, draft_id=brouillon["id"], student_id=eleve, section="erreurs_a_eviter"
        )
        assert out["slots"] == 3
        assert out["candidates"] == [
            {
                "index": 0,
                "texte": "Attention à : Nombres relatifs",
                "raison": "tu t'es trompé 2 fois là-dessus",
            }
        ]


def test_une_carte_RATEE_compte_aussi_mais_pas_un_RE_TOUR(client_db) -> None:
    """⚠️ `is_consolidation` veut dire « cet essai n'a pas mesuré l'oubli » (ADR-0049).

    Le compter gonflerait le nombre sans qu'aucune erreur nouvelle n'ait eu lieu — et le
    nombre est précisément ce qui rend la proposition crédible.
    """
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db, content=_COURS)
        eleve = get_default_student(db).id
        skill = db.scalar(select(Skill).where(Skill.name == "Nombres relatifs"))
        carte = SpacedReviewCard(
            student_id=eleve, skill_id=skill.id, card_type="definition",
            front_markdown="R", back_markdown="V", interval_days=1, status="scheduled",
        )
        db.add(carte)
        db.flush()
        maintenant = datetime.now(timezone.utc)
        db.add(SpacedReviewAttempt(card_id=carte.id, student_id=eleve, rating="again",
                                   reviewed_at=maintenant, is_consolidation=False))
        db.add(SpacedReviewAttempt(card_id=carte.id, student_id=eleve, rating="again",
                                   reviewed_at=maintenant, is_consolidation=True))
        db.commit()
        brouillon = _ouvrir(db, lesson.id)

        out = atelier.candidates(
            db, draft_id=brouillon["id"], student_id=eleve, section="erreurs_a_eviter"
        )
        assert out["candidates"][0]["raison"] == "tu t'es trompé une fois là-dessus"


def test_aucune_erreur_mesuree_ne_donne_AUCUN_piege(client_db) -> None:
    """🔴 État légitime, pas un manque à combler.

    Un enfant qui n'a pas encore travaillé cette leçon n'a pas de piège à en tirer. Inventer
    un piège pour remplir la section serait exactement ce que la règle 7 interdit.
    """
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db, content=_COURS)
        brouillon = _ouvrir(db, lesson.id)
        out = atelier.candidates(
            db, draft_id=brouillon["id"], student_id=get_default_student(db).id,
            section="erreurs_a_eviter",
        )
        assert out["candidates"] == []


def test_les_pieges_ne_dependent_PAS_du_cours_ecrit(client_db) -> None:
    """Un piège vient de ses erreurs, pas du texte de la leçon : le 409 « cours non écrit »
    n'a rien à faire ici — ce serait un refus sans rapport avec la question posée."""
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db, content=None)
        eleve = get_default_student(db).id
        skill = db.scalar(select(Skill).where(Skill.name == "Nombres relatifs"))
        _rater_un_quiz(db, lesson.id, skill.id, eleve, 1)
        brouillon = _ouvrir(db, lesson.id)

        out = atelier.candidates(
            db, draft_id=brouillon["id"], student_id=eleve, section="erreurs_a_eviter"
        )
        assert len(out["candidates"]) == 1


def test_une_lecon_SANS_NOTION_ne_fait_rien_inventer(client_db) -> None:
    """🔴 Verrou ajouté après un sabotage VERT — la branche « aucune notion » n'était couverte
    par aucun test, alors que c'est celle où l'invention est la plus tentante.

    Le motif est déjà consigné : *une fonction à plusieurs branches demande un verrou par
    branche*. Le test précédent passe par une leçon QUI A une notion (le décor en crée une) ;
    saboter la sortie anticipée ne le faisait donc pas rougir.
    """
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db, content=_COURS, with_skill=False)
        brouillon = _ouvrir(db, lesson.id)
        out = atelier.candidates(
            db, draft_id=brouillon["id"], student_id=get_default_student(db).id,
            section="erreurs_a_eviter",
        )
        assert out["candidates"] == [], "aucune notion ⇒ aucun piège, jamais un piège inventé"


# ── « NOUVEAU jamais DÛ » vaut aussi pour sa propre fiche (adr-0030) ───────────────


def test_sa_propre_fiche_ne_compte_JAMAIS_comme_nouvelle(client_db) -> None:
    """🔴 On ne DÉCOUVRE pas ce qu'on vient d'écrire.

    Sans cette exclusion, finir sa fiche allumait un badge « NOUVEAU » qui ne s'éteignait qu'en
    la rouvrant : un témoin qui s'allume tout seul, c'est-à-dire la règle de l'`adr-0030` prise
    à revers. Elle compte bien dans son deck — mais pas comme une nouveauté.
    """
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db, content=_COURS)
        _fiche_de_massimo(db, lesson.id, get_default_student(db).id)

        resume = service.fiches_summary(db)
        maths = next(s for s in resume["subjects"] if s["slug"] == "mathematiques")
        assert maths["fiche_count"] == 1, "sa fiche est bien dans son deck"
        assert maths["new_count"] == 0, "…mais elle n'est pas une NOUVEAUTÉ pour lui"


def test_une_fiche_de_ZETIS_jamais_ouverte_RESTE_nouvelle(client_db) -> None:
    """Contre-partie : la règle ne doit pas éteindre le cas légitime.

    Une fiche que ZETIS a produite et que Massimo n'a pas lue est exactement ce que le témoin
    de nouveauté existe pour signaler.
    """
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db, content=_COURS)
        _fiche_zetis(db, lesson.id, status="validated")

        resume = service.fiches_summary(db)
        maths = next(s for s in resume["subjects"] if s["slug"] == "mathematiques")
        assert maths["fiche_count"] == 1
        assert maths["new_count"] == 1


def test_le_temoin_de_NAVIGATION_dit_la_meme_chose_que_le_deck(client_db) -> None:
    """Les deux compteurs restent d'accord — `new_fiches_count` DÉLÈGUE à `fiches_summary`.

    Une seconde définition de « fiche nouvelle » finirait par diverger de celle que voit la
    grille, et le badge de navigation mentirait sur ce que la page affiche.
    """
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db, content=_COURS)
        eleve = get_default_student(db).id
        _fiche_de_massimo(db, lesson.id, eleve)
        _fiche_zetis(db, lesson.id, status="validated")

        resume = service.fiches_summary(db)
        assert service.new_fiches_count(db, eleve) == sum(
            s["new_count"] for s in resume["subjects"]
        ) == 1
