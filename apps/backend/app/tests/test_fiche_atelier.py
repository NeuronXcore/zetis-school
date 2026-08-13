"""L'atelier — la fiche que Massimo fabrique (addendum ADR-0015, slice 1).

Trois promesses sont vérifiées ici, parce que ce sont elles que l'écran affiche à Massimo :

1. **« tout est gardé au fur et à mesure — tu peux fermer et revenir demain »** (reprise) ;
2. **un brouillon n'est pas une fiche** — ni servi, ni dérivable, tant qu'il n'a pas validé ;
3. **rouvrir une fiche finie ne l'écrase pas** — l'ancienne version reste lisible (§7).

Aucun LLM dans ce fichier, et ce n'est pas un choix de test : la slice 1 est intégralement
déterministe (règle 7 — ZETIS n'écrit jamais dans la fiche à la place de Massimo).
"""

import re

import pytest
from sqlalchemy import func, select

from app.db.models import Fiche
from app.modules.eli5.service import get_default_student
from app.modules.fiches import atelier, service
from app.modules.fiches.population import STATUS_DRAFT, STATUS_PERSONAL
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


def test_seul_points_cles_se_choisit(client_db) -> None:
    """`essentiel` est une SYNTHÈSE : par définition absente du cours, donc aucune phrase
    candidate ne peut la porter (§8). Le refus est explicite, pas une liste vide."""
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db, content=_COURS)
        student = get_default_student(db)
        brouillon = _ouvrir(db, lesson.id)

        with pytest.raises(Exception) as err:
            atelier.candidates(
                db, draft_id=brouillon["id"], student_id=student.id, section="essentiel"
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
    """Le refus doit rester une invitation : « choisis au moins une idée, et je regarde »."""
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db, content=_COURS)
        student = get_default_student(db)
        brouillon = _ouvrir(db, lesson.id)

        with pytest.raises(Exception) as err:
            atelier.review_draft(db, draft_id=brouillon["id"], student_id=student.id)
        assert getattr(err.value, "status_code", None) == 409
        assert "au moins une idée" in err.value.detail


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
