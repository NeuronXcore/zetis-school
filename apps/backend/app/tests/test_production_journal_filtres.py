"""Tri et filtre du Journal (addendum ADR-0034 « tri et filtre »).

Six tests, et chacun ferme un mode d'échec nommé dans l'ADR — pas une variante de couverture :

1. **filtrer PUIS paginer**, jamais l'inverse — un lot de maths en 4ᵉ page doit se trouver ;
2. **un lot retenu est rendu ENTIER** — le filtre choisit quels lots on regarde, jamais ce qu'on
   voit d'un lot ;
3. **`running` et `stale` ne se recouvrent pas** — sinon Papa compte un zombie deux fois ;
4. **la queue de tri** — sans elle la pagination perd ou répète des lots EN SILENCE ;
5. **un lot bloqué avant toute pièce ne répond à aucun filtre de type** — vérité attendue, pas
   défaut toléré : `production_events.piece` est `NULL` sur `outcome='blocked'` ;
6. **`sur_mesure` et `inconnu` vont en fin DANS LES DEUX SENS** — ils sont hors de l'échelle.
"""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

import app.db.models as m
from app.main import app
from app.modules.auth.deps import get_current_user
from app.modules.production import journal
from app.modules.production.journal_filters import JournalFiltre

PAPA = {"username": "papa", "role": "papa"}
API = "/api/production/journal"
MAINTENANT = datetime(2026, 8, 4, 18, 0, tzinfo=timezone.utc)


@pytest.fixture(autouse=True)
def _papa(client_db) -> None:
    app.dependency_overrides[get_current_user] = lambda: PAPA


def _matiere(db, nom: str) -> m.Subject:
    sujet = db.scalar(select(m.Subject).where(m.Subject.name == nom))
    if sujet is None:
        sujet = m.Subject(name=nom, slug=nom.lower())
        db.add(sujet)
        db.flush()
    return sujet


def _chapitre(db, sujet, *, nom="Chapitre") -> m.Chapter:
    """Un chapitre atteignable : année active → matière d'année → chapitre validé.

    ⚠️ Le rattachement passe par `school_year_subject_id`, comme `lessons_by_skill` (ADR-0037).
    """
    etudiant = db.scalar(select(m.StudentProfile))
    annee = db.scalar(select(m.SchoolYear).where(m.SchoolYear.status == "active"))
    if annee is None:
        annee = m.SchoolYear(
            student_id=etudiant.id, label="2026-2027", level="4e", status="active"
        )
        db.add(annee)
        db.flush()
    sys_row = db.scalar(
        select(m.SchoolYearSubject).where(
            m.SchoolYearSubject.school_year_id == annee.id,
            m.SchoolYearSubject.subject_id == sujet.id,
        )
    )
    if sys_row is None:
        sys_row = m.SchoolYearSubject(school_year_id=annee.id, subject_id=sujet.id)
        db.add(sys_row)
        db.flush()
    chapitre = m.Chapter(
        school_year_subject_id=sys_row.id, name=nom, validation_status="validated", sort_order=0
    )
    db.add(chapitre)
    db.flush()
    return chapitre


def _lot(
    db,
    chapitre,
    *,
    quand: datetime,
    statut="done",
    paliers: tuple[int, int] | None = (2, 2),
    battement: datetime | None = None,
) -> m.ProductionRun:
    """Un lot POSÉ EN BASE, sans passer par le runner : on teste le filtre, pas la production."""
    etudiant = db.scalar(select(m.StudentProfile))
    lot = m.ProductionRun(
        student_id=etudiant.id,
        trigger="manual",
        authorized_by="parent",
        status=statut,
        chapter_id=chapitre.id,
        created_at=quand,
        heartbeat_at=battement,
        a0a_level=paliers[0] if paliers else None,
        a1_level=paliers[1] if paliers else None,
        zetis_mode_source="capture" if paliers else None,
    )
    db.add(lot)
    db.flush()
    return lot


def _evenement(db, lot, *, piece, outcome="generated", skill_id=None) -> None:
    db.add(
        m.ProductionEvent(
            run_id=lot.id,
            skill_id=skill_id,
            piece=piece,
            outcome=outcome,
            created_at=lot.created_at,
        )
    )
    db.flush()


def _page(db, **kw) -> dict:
    return journal.list_journal(db, filtre=JournalFiltre(**kw), now=MAINTENANT, limit=50)


# --- 1. Filtrer PUIS paginer --------------------------------------------------------------------


def test_un_lot_de_maths_en_QUATRIEME_page_est_trouve_par_le_filtre(client_db) -> None:
    """⚠️ Le défaut que ce test ferme ne ressemble pas à un défaut.

    Filtrer une page déjà chargée répondrait « rien en maths » — une page vide, crédible, et
    fausse. Ici les 60 lots de français sont plus récents : le lot de maths est hors des vingt
    premiers, et le filtre doit quand même le rendre en première page.
    """
    _, Session = client_db
    with Session() as db:
        maths, francais = _matiere(db, "Mathématiques"), _matiere(db, "Français")
        ch_maths, ch_fr = _chapitre(db, maths, nom="Fractions"), _chapitre(db, francais)
        _lot(db, ch_maths, quand=MAINTENANT - timedelta(days=90))
        for jour in range(60):
            _lot(db, ch_fr, quand=MAINTENANT - timedelta(days=jour))
        db.commit()
        # ⚠️ Les ids se lisent DANS la session : après sa fermeture, toucher `ch_fr.id` lève un
        # `DetachedInstanceError` et le test échoue pour une raison qui n'a rien à voir.
        id_maths, id_fr, subject_maths = ch_maths.id, ch_fr.id, maths.id

        sans_filtre = journal.list_journal(db, limit=20, now=MAINTENANT)
        page = _page(db, subject_ids=(subject_maths,))

    assert len(sans_filtre["runs"]) == 20
    assert all(r["chapter_id"] == id_fr for r in sans_filtre["runs"]), (
        "le lot de maths ne doit PAS être dans les vingt premiers — sinon le test ne prouve rien"
    )
    assert [r["chapter_id"] for r in page["runs"]] == [id_maths]
    assert page["total"] == 1, "le total porte sur l'ensemble FILTRÉ, jamais sur l'histoire"


# --- 2. Un lot retenu est rendu ENTIER ----------------------------------------------------------


def test_un_lot_retenu_par_un_filtre_de_type_garde_TOUTES_ses_lignes(client_db) -> None:
    """Le filtre choisit quels lots on regarde, jamais ce qu'on voit d'un lot.

    ⚠️ C'est le contraire du réflexe naturel : filtrer sur *fiche* puis n'afficher que les fiches
    ferait dire au Journal que le lot n'a produit que ça. Un registre rend compte en entier.
    """
    _, Session = client_db
    with Session() as db:
        chapitre = _chapitre(db, _matiere(db, "Mathématiques"))
        lot = _lot(db, chapitre, quand=MAINTENANT)
        for piece in ("cours", "fiche", "mindmap", "quiz"):
            _evenement(db, lot, piece=piece)
        db.commit()

        page = _page(db, pieces=("fiche",))

    assert len(page["runs"]) == 1
    rendu = {e["piece"] for e in page["runs"][0]["events"]}
    assert rendu == {"cours", "fiche", "mindmap", "quiz"}


# --- 3. `running` EXCLUT `stale` ----------------------------------------------------------------


def test_running_et_stale_ne_se_recouvrent_pas(client_db) -> None:
    """Un lot zombie répondrait à deux filtres, et Papa le compterait deux fois.

    L'affichage les sépare déjà (`run_status`) ; le filtre doit dire la même chose, ou l'un des
    deux ment.
    """
    _, Session = client_db
    with Session() as db:
        chapitre = _chapitre(db, _matiere(db, "Mathématiques"))
        vivant = _lot(
            db,
            chapitre,
            quand=MAINTENANT,
            statut="running",
            battement=MAINTENANT - timedelta(seconds=30),
        )
        zombie = _lot(
            db,
            chapitre,
            quand=MAINTENANT,
            statut="running",
            battement=MAINTENANT - timedelta(days=2),
        )
        db.commit()

        en_cours = _page(db, statuts=("running",))
        sans_reponse = _page(db, statuts=("stale",))
        les_deux = _page(db, statuts=("running", "stale"))

    assert [r["id"] for r in en_cours["runs"]] == [vivant.id]
    assert [r["id"] for r in sans_reponse["runs"]] == [zombie.id]
    assert les_deux["total"] == 2, "leur union vaut 2, pas 3 : aucun lot n'est compté deux fois"
    assert {r["status"] for r in sans_reponse["runs"]} == {"stale"}


# --- 4. La queue de tri -------------------------------------------------------------------------


def test_la_queue_de_tri_empeche_la_pagination_de_PERDRE_des_lots(client_db) -> None:
    """⚠️ Défaut de pagination classique, et **silencieux**.

    Six lots de la même matière : la clé de tri est **constante**, donc c'est la queue, et elle
    seule, qui décide de l'ordre. Sans elle, la base rend ce qu'elle veut — en pratique l'ordre
    d'insertion — et deux pages successives peuvent répéter un lot en en oubliant un autre.

    ⚠️ **Les lots sont insérés du plus ANCIEN au plus récent, à dessein** : l'ordre d'insertion est
    donc l'inverse exact de l'ordre attendu. Une première version de ce test se contentait de
    vérifier « aucun doublon, aucun disparu » — elle restait **VERTE en retirant la queue**, parce
    qu'un ensemble ne dit rien d'un ordre. Contre-épreuve refaite : celle-ci rougit.
    """
    _, Session = client_db
    with Session() as db:
        chapitre = _chapitre(db, _matiere(db, "Mathématiques"))
        du_plus_ancien = [
            _lot(db, chapitre, quand=MAINTENANT - timedelta(hours=6 - h)).id for h in range(6)
        ]
        db.commit()

        p1 = journal.list_journal(
            db, limit=3, offset=0, filtre=JournalFiltre(tri="matiere"), now=MAINTENANT
        )
        p2 = journal.list_journal(
            db, limit=3, offset=3, filtre=JournalFiltre(tri="matiere"), now=MAINTENANT
        )

    ids = [r["id"] for r in p1["runs"]] + [r["id"] for r in p2["runs"]]
    assert len(ids) == len(set(ids)), "un lot est apparu deux fois : la queue de tri ne tient pas"
    assert set(ids) == set(du_plus_ancien), "un lot a disparu entre les deux pages"
    assert ids == list(reversed(du_plus_ancien)), (
        "à clé de tri égale, la queue impose le plus récent d'abord — c'est elle qu'on vérifie"
    )


# --- 5. Un lot bloqué avant toute pièce ---------------------------------------------------------


def test_un_lot_bloque_avant_toute_piece_ne_repond_a_AUCUN_filtre_de_type(client_db) -> None:
    """⚠️ **Vérité attendue, pas défaut toléré.**

    `production_events.piece` est `NULL` quand l'événement porte sur la notion entière
    (`outcome='blocked'`) : un lot écarté faute de cours n'a jamais atteint le stade où un type
    existe. Le test l'écrit pour que personne ne le « répare » — et l'écran, lui, doit le DIRE
    dans son état vide.
    """
    _, Session = client_db
    with Session() as db:
        chapitre = _chapitre(db, _matiere(db, "Mathématiques"))
        bloque = _lot(db, chapitre, quand=MAINTENANT)
        _evenement(db, bloque, piece=None, outcome="blocked")
        db.commit()

        sans_filtre = _page(db)
        par_type = {p: _page(db, pieces=(p,))["total"] for p in journal.KINDS}

    assert [r["id"] for r in sans_filtre["runs"]] == [bloque.id]
    assert set(par_type.values()) == {0}, (
        "aucun type ne peut retenir ce lot : il n'a pas d'événement porteur de type"
    )


# --- 6. Hors de l'échelle, donc en fin dans les deux sens ---------------------------------------


def test_sur_mesure_et_inconnu_vont_en_FIN_dans_les_deux_sens(client_db) -> None:
    """Ils ne sont ni plus ni moins autonomes : ils sont **hors de l'échelle**.

    Les placer aux extrémités selon le sens ferait croire à une gradation qui n'existe pas — un
    lot « non enregistré » n'est pas « moins autonome » qu'un lot *Manual*.
    """
    _, Session = client_db
    with Session() as db:
        chapitre = _chapitre(db, _matiere(db, "Mathématiques"))
        manuel = _lot(db, chapitre, quand=MAINTENANT, paliers=(2, 2))
        autonome = _lot(db, chapitre, quand=MAINTENANT, paliers=(3, 3))
        # ⚠️ PAS (3, 2) : c'est exactement *Semi* (`SERVE`, `VALIDATE`). Un vrai « sur mesure » est
        # un couple qui ne compose AUCUN préréglage — piège payé en écrivant ce test.
        sur_mesure = _lot(db, chapitre, quand=MAINTENANT, paliers=(1, 1))
        inconnu = _lot(db, chapitre, quand=MAINTENANT, paliers=None)
        db.commit()

        croissant = [
            r["id"]
            for r in _page(db, tri="mode", descendant=False)["runs"]
        ]
        decroissant = [r["id"] for r in _page(db, tri="mode", descendant=True)["runs"]]

    hors_echelle = {sur_mesure.id, inconnu.id}
    assert set(croissant[-2:]) == hors_echelle, "en fin en ordre croissant"
    assert set(decroissant[-2:]) == hors_echelle, "en fin en ordre DÉCROISSANT aussi"
    assert croissant[0] == manuel.id
    assert decroissant[0] == autonome.id


# --- La route : aucun filtre par défaut ---------------------------------------------------------


def test_la_route_sans_parametre_ne_filtre_RIEN(client_db) -> None:
    """Un journal qui s'ouvrirait déjà filtré cacherait son contenu à celui qui a oublié qu'il
    l'avait filtré — c'est le mode d'échec nommé par l'addendum, pas une préférence."""
    client, Session = client_db
    with Session() as db:
        chapitre = _chapitre(db, _matiere(db, "Mathématiques"))
        for jour in range(3):
            _lot(db, chapitre, quand=MAINTENANT - timedelta(days=jour))
        db.commit()

    corps = client.get(API).json()
    assert corps["total"] == 3
    assert len(corps["runs"]) == 3


def test_une_valeur_de_filtre_INCONNUE_est_ignoree_pas_rejetee(client_db) -> None:
    """Un 422 sur un vocabulaire d'écran ferait tomber la page entière pour une pilule mal
    orthographiée dans une URL partagée. On ignore, on ne casse pas."""
    client, Session = client_db
    with Session() as db:
        chapitre = _chapitre(db, _matiere(db, "Mathématiques"))
        _lot(db, chapitre, quand=MAINTENANT)
        db.commit()

    reponse = client.get(f"{API}?statut=nawak&mode=nawak&piece=nawak&tri=nawak")
    assert reponse.status_code == 200
    assert reponse.json()["total"] == 1
