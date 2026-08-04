"""Journal de production et veto (ADR-0034).

Les deux tests qui comptent sont les verrous du §Suivi :

1. **une pièce consommée n'est plus retirable** — sans lui le veto ment sur ce qu'il protège ;
2. **retirer un cours dont un dérivé est consommé est REFUSÉ** — c'est l'invariant V1 : retirer
   quand même ferait disparaître, sous les yeux de Massimo, la source d'une fiche qu'il a lue.

Le troisième vérifie que le détail par pièce, que `runner.execute` jetait, arrive bien en base.
"""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

import app.db.models as m
from app.main import app
from app.modules.auth.deps import get_current_user
from app.modules.production import journal, runs, veto
from app.tests.fakes import FakeEmbeddingProvider, FakeLLMProvider
from app.tests.test_production_coverage import _seed_lesson, _seed_year

PAPA = {"username": "papa", "role": "papa"}
CHILD = {"username": "massimo", "role": "child"}
API = "/api/production/journal"


def _as(role: dict) -> None:
    app.dependency_overrides[get_current_user] = lambda: role


@pytest.fixture(autouse=True)
def _papa(client_db) -> None:
    """⚠️ Dépend de `client_db` À DESSEIN — sinon l'autouse passe AVANT lui et le rôle retombe
    à `child` : toutes les routes du Journal en 403."""
    _as(PAPA)


def _skill(db, subject, name: str) -> m.Skill:
    skill = m.Skill(subject_id=subject.id, name=name, level="4e")
    db.add(skill)
    db.flush()
    return skill


def _attach(db, lesson, skill) -> None:
    db.add(m.LessonSkill(lesson_id=lesson.id, skill_id=skill.id))
    db.flush()


def _run_a_lot(db):
    """Un lot complet sur un chapitre dont le cours est validé — le cas nominal (palier 2)."""
    from app.modules.production import runner

    _, subject, chapter = _seed_year(db)
    lesson = _seed_lesson(db, chapter, title="Fractions", validated=True, course=True)
    skill = _skill(db, subject, "Additionner des fractions")
    _attach(db, lesson, skill)
    db.commit()

    run = runs.create_run(db, chapter_id=chapter.id)
    runner.execute(db, run_id=run.id, llm=FakeLLMProvider(), embedder=FakeEmbeddingProvider())
    return run, lesson, skill


def _run_at_palier_3(db):
    """Un lot AU PALIER 3 : le gate tombe, ZETIS rédige le cours lui-même.

    ⚠️ C'est la SEULE situation où un cours appartient à un lot — donc la seule où le veto sur le
    cours a quelque chose à retirer. On écrit les réglages directement en base : l'API refuse
    encore A1 = 3 (`VETO_SURFACE_AVAILABLE = False`), et ce test décrit le monde d'après le
    drapeau, exactement comme les trois verrous de `test_settings_autonomy.py`.
    """
    from app.modules.production import runner

    db.add(m.AppSetting(key="zetis_autonomy_a1_course", value="3"))
    db.add(m.AppSetting(key="zetis_autonomy_a0a_derives", value="3"))

    _, subject, chapter = _seed_year(db)
    # Pas de cours : c'est ZETIS qui va l'écrire, et c'est ça qu'on veut pouvoir retirer.
    lesson = _seed_lesson(db, chapter, title="Fractions", validated=False, course=False)
    skill = _skill(db, subject, "Additionner des fractions")
    _attach(db, lesson, skill)
    db.commit()

    run = runs.create_run(db, chapter_id=chapter.id)
    runner.execute(db, run_id=run.id, llm=FakeLLMProvider(), embedder=FakeEmbeddingProvider())
    db.refresh(lesson)
    return run, lesson, skill


# --- Ce que le worker fait cesse d'être jeté ----------------------------------------------------


def test_le_detail_par_piece_arrive_en_base(client_db) -> None:
    """`equip_notion` renvoyait déjà `generated`/`skipped`/`errors` — `execute` les jetait.

    C'est LA demande « voir exactement ce que fait le worker » : la donnée existait, il manquait
    une table pour la retenir.
    """
    _, Session = client_db
    with Session() as db:
        run, _, skill = _run_a_lot(db)

        events = db.scalars(
            select(m.ProductionEvent).where(m.ProductionEvent.run_id == run.id)
        ).all()
        assert events, "le lot n'a écrit aucun événement — le détail repart à la poubelle"
        assert {e.outcome for e in events} <= {"generated", "skipped", "error", "blocked"}
        # Chaque événement de pièce porte SA notion : un journal sans notion ne se lit pas.
        assert all(e.skill_id == skill.id for e in events if e.piece)


def test_une_notion_bloquee_ecrit_sa_ligne_avec_son_motif(client_db) -> None:
    """Le gate du §7 devient VISIBLE. Une notion silencieusement omise se lirait comme un échec
    de production, alors que c'est un gate qui fonctionne (addendum ADR-0031)."""
    from app.modules.production import runner

    _, Session = client_db
    with Session() as db:
        _, subject, chapter = _seed_year(db)
        draft = _seed_lesson(db, chapter, title="Brouillon", validated=False, course=False)
        skill = _skill(db, subject, "Notion en brouillon")
        _attach(db, draft, skill)
        db.commit()

        run = runs.create_run(db, chapter_id=chapter.id)
        runner.execute(db, run_id=run.id, llm=FakeLLMProvider(), embedder=FakeEmbeddingProvider())

        blocked = db.scalars(
            select(m.ProductionEvent).where(
                m.ProductionEvent.run_id == run.id, m.ProductionEvent.outcome == "blocked"
            )
        ).all()
        assert len(blocked) == 1
        assert blocked[0].piece is None, "un blocage porte sur la NOTION, pas sur une pièce"
        assert blocked[0].detail, "un blocage muet se lit comme une panne"


def test_une_ligne_bloquee_porte_OU_ALLER_la_debloquer(client_db) -> None:
    """Le motif sans la destination oblige Papa à retrouver la leçon à la main (2026-08-04).

    ⚠️ La résolution est SERVEUR : « quelle est la leçon de cette notion » a une seule réponse dans
    le dépôt (ADR-0037). Le front recevrait sinon un `skill_id` nu et en inventerait une quatrième.
    """
    from app.modules.production import runner

    _, Session = client_db
    with Session() as db:
        _, subject, chapter = _seed_year(db)
        draft = _seed_lesson(db, chapter, title="Brouillon", validated=False, course=False)
        _attach(db, draft, _skill(db, subject, "Notion en brouillon"))
        # ⚠️ Une notion PRODUCTIBLE dans le même lot, et elle n'est pas décorative : sans elle, un
        # `target` posé sur TOUTES les lignes passerait le test. Vérifié par sabotage le
        # 2026-08-04 — la première version de ce test ne voyait pas la différence.
        prete = _seed_lesson(db, chapter, title="Prête", validated=True, course=True)
        _attach(db, prete, _skill(db, subject, "Notion prête"))
        db.commit()

        run = runs.create_run(db, chapter_id=chapter.id)
        runner.execute(db, run_id=run.id, llm=FakeLLMProvider(), embedder=FakeEmbeddingProvider())

        lot = journal.list_journal(db)["runs"][0]
        bloquee = next(e for e in lot["events"] if e["outcome"] == "blocked")
        produites = [e for e in lot["events"] if e["outcome"] == "generated"]
        attendu = {
            "lesson_id": draft.id,
            "chapter_id": chapter.id,
            "subject_id": subject.id,
            "object_id": None,
        }

    assert bloquee["target"] == attendu
    assert produites, "le lot devait aussi produire — sinon la ligne suivante ne prouve rien"
    # ⚠️ Ce qui distingue les deux sens de lecture. Une ligne PRODUITE mène désormais quelque part
    # elle aussi (le user l'a demandé le 2026-08-04) — mais à SA PIÈCE, pas à la leçon du blocage.
    # Sans cette assertion, un `target` recopié à l'identique sur toutes les lignes passerait.
    assert all(e["target"] is not None for e in produites)
    assert all(e["target"]["object_id"] is not None for e in produites if e["piece"] != "cours"), (
        "une ligne produite doit désigner la pièce, pas seulement sa leçon"
    )
    assert all(e["target"]["lesson_id"] != draft.id for e in produites), (
        "les lignes produites pointent sur LEUR leçon, pas sur celle qui était bloquée"
    )


def test_une_ligne_PRODUITE_porte_l_id_de_sa_piece(client_db) -> None:
    """🔒 Le pendant du lien de déblocage : voir ce que ZETIS vient de faire.

    ⚠️ **`object_id` vient des `pieces` du lot**, pas d'une requête de plus : le journal les a déjà
    résolues pour la liste rétractable. Une seconde lecture pour la même information divergerait au
    premier changement de règle de rattachement.
    """
    from app.modules.production import runner

    _, Session = client_db
    with Session() as db:
        _, subject, chapter = _seed_year(db)
        lesson = _seed_lesson(db, chapter, title="Prête", validated=True, course=True)
        skill = _skill(db, subject, "Notion prête")
        _attach(db, lesson, skill)
        db.commit()

        run = runs.create_run(db, chapter_id=chapter.id)
        runner.execute(db, run_id=run.id, llm=FakeLLMProvider(), embedder=FakeEmbeddingProvider())

        lot = journal.list_journal(db)["runs"][0]
        fiche = next(
            e for e in lot["events"] if e["outcome"] == "generated" and e["piece"] == "fiche"
        )
        piece = next(p for p in lot["pieces"] if p["kind"] == "fiche")
        attendu_subject = subject.id

    assert fiche["target"] is not None, "une pièce produite doit mener quelque part"
    assert fiche["target"]["object_id"] == piece["id"]
    assert fiche["target"]["subject_id"] == attendu_subject


def test_une_ligne_en_ERREUR_ne_mene_nulle_part(client_db) -> None:
    """La contre-épreuve du précédent : toutes les lignes ne portent pas une destination.

    Une erreur se lit dans son message ; l'ouvrir désignerait la mauvaise cause. Sans ce test, un
    `target` posé partout passerait au vert.
    """
    _, Session = client_db
    with Session() as db:
        _, subject, chapter = _seed_year(db)
        lesson = _seed_lesson(db, chapter, title="Prête", validated=True, course=True)
        skill = _skill(db, subject, "Notion prête")
        _attach(db, lesson, skill)
        run = runs.create_run(db, chapter_id=chapter.id)
        db.add(
            m.ProductionEvent(
                run_id=run.id,
                skill_id=skill.id,
                piece="fiche",
                outcome="error",
                detail="le générateur a rendu un JSON vide",
                created_at=datetime.now(timezone.utc),
            )
        )
        db.commit()

        ligne = next(
            e for e in journal.list_journal(db)["runs"][0]["events"] if e["outcome"] == "error"
        )

    assert ligne["target"] is None


def test_une_notion_ORPHELINE_ne_porte_aucune_destination(client_db) -> None:
    """Rien à ouvrir : la contre-épreuve du test précédent.

    Une notion sans leçon est bloquée elle aussi — mais son motif dit déjà tout, et un lien qui
    mènerait quelque part malgré tout serait pire que pas de lien. Sans ce test, `target` pourrait
    pointer n'importe où sans que rien ne le voie.
    """
    from app.modules.production import runner

    _, Session = client_db
    with Session() as db:
        _, subject, chapter = _seed_year(db)
        # Un chapitre a besoin d'une leçon pour que le plan la trouve ; la notion ORPHELINE, elle,
        # n'est rattachée à aucune.
        _seed_lesson(db, chapter, title="Une autre", validated=True, course=True)
        orpheline = _skill(db, subject, "Notion sans leçon")
        db.commit()

        run = runs.create_run(db, scope_skill_id=orpheline.id, scope_kind="fiche")
        runner.execute(db, run_id=run.id, llm=FakeLLMProvider(), embedder=FakeEmbeddingProvider())

        lot = journal.list_journal(db)["runs"][0]
        bloquee = next(e for e in lot["events"] if e["outcome"] == "blocked")

    assert bloquee["target"] is None
    assert bloquee["detail"], "un blocage muet se lit comme une panne"


def test_une_cause_levee_est_annotee_SANS_reecrire_la_ligne(client_db) -> None:
    """🔒 Les deux temps sur la même ligne : le motif au passé, l'annotation au présent.

    Le cas réel du 2026-08-04 : lot bloqué à 15:18:58 par un cours inexistant, cours écrit à
    15:20:51, validé à 15:35:33. La ligne se lisait comme un problème actuel.

    ⚠️ **Le motif d'origine est vérifié INTACT** — c'est la moitié qui compte. Une annotation qui
    remplacerait le motif ferait perdre la raison pour laquelle le lot n'a rien produit (§F.4).
    """
    from app.modules.production import runner
    from app.modules.production.runner import BLOCKED_COURSE_MISSING

    _, Session = client_db
    with Session() as db:
        _, subject, chapter = _seed_year(db)
        vide = _seed_lesson(db, chapter, title="Sans cours", validated=True, course=False)
        skill = _skill(db, subject, "Notion sans cours")
        _attach(db, vide, skill)
        db.commit()

        run = runs.create_run(db, chapter_id=chapter.id)
        runner.execute(db, run_id=run.id, llm=FakeLLMProvider(), embedder=FakeEmbeddingProvider())

        avant = next(
            e for e in journal.list_journal(db)["runs"][0]["events"] if e["outcome"] == "blocked"
        )
        assert avant["resolved"] is False, "rien n'a bougé : la cause tient toujours"

        # Papa écrit le cours APRÈS coup — le geste que la ligne réclamait.
        db.get(m.Lesson, vide.id).content_markdown = "# Le cours\n\nÉcrit après le lot."
        db.commit()

        apres = next(
            e for e in journal.list_journal(db)["runs"][0]["events"] if e["outcome"] == "blocked"
        )

    assert apres["resolved"] is True
    assert apres["detail"] == BLOCKED_COURSE_MISSING, "la ligne d'origine a été réécrite"


def test_une_cause_seulement_DEPLACEE_n_est_pas_annoncee_resolue(client_db) -> None:
    """⚠️ LE verrou du sens : « résolu » = plus AUCUN blocage, pas « le motif d'origine a changé ».

    Une notion passée de « cours jamais rédigé » à « cours à valider » a bien changé de cause — et
    un lot n'y produirait toujours rien. Dire « résolu » ferait renoncer Papa au geste qui reste.
    """
    from app.modules.production import runner

    _, Session = client_db
    with Session() as db:
        _, subject, chapter = _seed_year(db)
        vide = _seed_lesson(db, chapter, title="Sans cours", validated=True, course=False)
        _attach(db, vide, _skill(db, subject, "Notion sans cours"))
        db.commit()

        run = runs.create_run(db, chapter_id=chapter.id)
        runner.execute(db, run_id=run.id, llm=FakeLLMProvider(), embedder=FakeEmbeddingProvider())

        # Cours ÉCRIT mais dévalidé : la première cause tombe, la seconde apparaît.
        lecon = db.get(m.Lesson, vide.id)
        lecon.content_markdown = "# Le cours\n\nÉcrit, pas encore relu."
        lecon.status = "draft"
        db.commit()

        ligne = next(
            e for e in journal.list_journal(db)["runs"][0]["events"] if e["outcome"] == "blocked"
        )

    assert ligne["resolved"] is False


class TestRegimeDeduit:
    """Le régime d'un lot ANTÉRIEUR à la capture, reconstitué de ce qu'il a fait (addendum §1bis).

    ⚠️ **On ne consulte aucun réglage.** Ceux d'aujourd'hui ont pu changer — c'est toute la raison
    d'être de la capture. Ce qu'un lot a LAISSÉ, en revanche, n'a pas changé : un cours qu'il a
    rédigé reste un cours qu'il a rédigé. La déduction ne lit que des actes.

    Chaque test isole UNE preuve. Le dernier vérifie qu'en l'absence de preuve on **ne répond pas** —
    sans lui, il suffirait de renvoyer « manuel » par défaut pour que tout le reste passe au vert.
    """

    def test_une_origine_request_prouve_le_regime_autonome(self) -> None:
        # Le scan n'émet `request` que sous les DEUX conditions du §1 de l'ADR-0036, dont le régime
        # *Autonome*. C'est vrai par construction, sans regarder un seul artefact.
        assert journal.deduire_regime("request", {}) == "autonome"

    def test_un_cours_REDIGE_par_le_lot_prouve_le_regime_autonome(self) -> None:
        # Écrire un cours exige que le gate du §7 soit tombé → A1 = 3 → A0a = 3 par monotonie.
        assert journal.deduire_regime("manual", {"a_ecrit_cours": True}) == "autonome"

    def test_un_derive_laisse_A_RELIRE_prouve_le_regime_manuel(self) -> None:
        # A0a = 2. Et A1 = 3 forcerait A0a = 3 : A1 vaut donc 2 aussi.
        assert journal.deduire_regime("manual", {"derives_a_relire": True}) == "manuel"

    def test_un_derive_servi_ET_un_cours_bloque_prouvent_le_regime_semi(self) -> None:
        # A0a = 3 (servi d'office) et A1 < 3 (le cours a bloqué) — c'est exactement *Semi*.
        preuves = {"derives_servis": True, "bloque_sur_cours": True}
        assert journal.deduire_regime("manual", preuves) == "semi"

    def test_un_derive_servi_SEUL_ne_prouve_rien_et_on_le_dit(self) -> None:
        """⚠️ LE test qui empêche la devinette.

        A0a = 3 laisse *Semi* et *Autonome* indiscernables tant qu'aucun cours n'a manqué. Rendre
        l'un des deux au hasard serait le mensonge que toute cette mécanique évite.
        """
        assert journal.deduire_regime("manual", {"derives_servis": True}) is None
        assert journal.deduire_regime("manual", {}) is None

    def test_le_regime_CAPTURE_prime_sur_toute_deduction(self, client_db) -> None:
        """Un lot qui a enregistré son régime ne se fait pas réinterpréter par ses artefacts.

        ⚠️ Sans cette priorité, un lot capturé *Manuel* qui aurait produit sous une règle plus
        permissive serait réécrit par la déduction — l'inverse exact de ce que la capture protège.
        """
        _, Session = client_db
        with Session() as db:
            run, _, _ = _run_a_lot(db)
            run.a0a_level, run.a1_level = 2, 2  # capturé : Manuel
            db.commit()

            lot = journal.list_journal(db)["runs"][0]

        assert (lot["zetis_mode"], lot["zetis_mode_source"]) == ("manuel", "capture")

    def test_un_lot_sans_capture_rend_son_regime_DEDUIT_et_le_dit(self, client_db) -> None:
        """Bout en bout : le lot du palier 3 a rédigé son cours, donc il était *Autonome*."""
        _, Session = client_db
        with Session() as db:
            run, _, _ = _run_at_palier_3(db)
            run.a0a_level, run.a1_level = None, None  # antérieur à la colonne
            db.commit()

            lot = journal.list_journal(db)["runs"][0]

        assert (lot["zetis_mode"], lot["zetis_mode_source"]) == ("autonome", "deduit")


# --- LE VERROU DU VETO --------------------------------------------------------------------------


def test_une_piece_consommee_nest_plus_retirable(client_db) -> None:
    """La consommation ferme la fenêtre — pas l'horloge (§G.3).

    Sans ce verrou, le veto retirerait sous les yeux de Massimo un contenu qu'il a ouvert :
    l'invariant V1 (« le retrait est invisible de Massimo ») deviendrait faux.
    """
    _, Session = client_db
    with Session() as db:
        run, _, _ = _run_a_lot(db)
        fiche = db.scalar(select(m.Fiche).where(m.Fiche.production_run_id == run.id))
        assert fiche is not None, "le lot n'a produit aucune fiche — le test ne teste rien"

        assert veto.preview_removal(db, kind="fiche", piece_id=fiche.id)["removable"] is True

        student = db.scalar(select(m.StudentProfile))
        db.add(
            m.FicheView(
                student_id=student.id, fiche_id=fiche.id, seen_at=datetime.now(timezone.utc)
            )
        )
        db.commit()

        verdict = veto.preview_removal(db, kind="fiche", piece_id=fiche.id)
        assert verdict["removable"] is False
        assert verdict["reason"], "un refus muet se lit comme une panne"


def test_retirer_un_cours_dont_un_derive_est_consomme_est_refuse(client_db) -> None:
    """⚠️ LE verrou de l'invariant V1.

    Le cours est la source canonique de ses dérivés. Le retirer alors que Massimo a lu une fiche
    qui en dérive laisserait cette fiche sans source — un trou inexpliqué. **Refuser est plus
    honnête que retirer à moitié.**
    """
    _, Session = client_db
    with Session() as db:
        run, lesson, _ = _run_at_palier_3(db)
        # ⚠️ Le cours doit APPARTENIR au lot — sinon le veto n'a rien à retirer. Trou trouvé le
        # 2026-08-02 : le filigrane ne voit que les lignes NÉES, or `equip_notion` écrit dans une
        # leçon préexistante. `_stamp_course` comble ce trou, et cette assertion le verrouille.
        assert lesson.production_run_id == run.id, "le cours rédigé par ZETIS n'est pas tamponné"
        fiche = db.scalar(select(m.Fiche).where(m.Fiche.production_run_id == run.id))
        assert fiche is not None

        # Le cours est retirable tant que rien n'est consommé…
        assert veto.preview_removal(db, kind="cours", piece_id=lesson.id)["removable"] is True

        # …et cesse de l'être dès que Massimo ouvre un dérivé.
        student = db.scalar(select(m.StudentProfile))
        db.add(
            m.FicheView(
                student_id=student.id, fiche_id=fiche.id, seen_at=datetime.now(timezone.utc)
            )
        )
        db.commit()

        verdict = veto.preview_removal(db, kind="cours", piece_id=lesson.id)
        assert verdict["removable"] is False
        assert verdict["reason"]

        # Et le refus est tenu par la ROUTE, pas seulement par l'aperçu.
        client, _ = client_db
        res = client.delete(f"{API}/pieces/cours/{lesson.id}")
        assert res.status_code == 409
        assert db.get(m.Lesson, lesson.id) is not None, "le cours a été supprimé malgré le refus"


def test_retirer_un_cours_emporte_ses_derives(client_db) -> None:
    """Rien de consommé → le retrait passe, ET il emporte les dérivés.

    En laisser un orphelin servirait à Massimo un contenu dont la source n'existe plus.
    """
    _, Session = client_db
    with Session() as db:
        run, lesson, _ = _run_at_palier_3(db)
        fiche_id = db.scalar(select(m.Fiche.id).where(m.Fiche.production_run_id == run.id))

        out = veto.remove(db, kind="cours", piece_id=lesson.id)

        assert db.get(m.Lesson, lesson.id) is None
        assert out["removed"]["cours"] == 1
        if fiche_id is not None:
            assert db.get(m.Fiche, fiche_id) is None, "fiche orpheline laissée derrière"


def test_une_piece_hors_lot_nest_pas_retirable_ici(client_db) -> None:
    """Le veto ne s'exerce QUE sur ce qui vient d'un lot.

    Une pièce équipée par le Conseil de classe ou le champion a été demandée par un clic de Papa :
    elle n'a pas de fenêtre de veto, et la supprimer d'ici court-circuiterait ses surfaces.
    """
    _, Session = client_db
    with Session() as db:
        _, subject, chapter = _seed_year(db)
        lesson = _seed_lesson(db, chapter, title="Hors lot", validated=True, course=True)
        db.commit()
        assert lesson.production_run_id is None

        with pytest.raises(Exception) as exc:
            veto.remove(db, kind="cours", piece_id=lesson.id)
        assert "409" in str(exc.value) or "lot" in str(exc.value).lower()


# --- Les lots zombies -----------------------------------------------------------------------


def test_un_lot_muet_est_rendu_stale_sans_balayage(client_db) -> None:
    """`stale` est une LECTURE, jamais une valeur stockée.

    Le §G.3 a écarté la quarantaine temporelle parce qu'elle exigeait un ordonnanceur ; la même
    doctrine s'applique ici. Le seul écrivain est `close_stale_runs`, appelé AVANT une création.
    """
    _, Session = client_db
    with Session() as db:
        _, _, chapter = _seed_year(db)
        db.commit()
        run = runs.create_run(db, chapter_id=chapter.id)
        run.status = "running"
        run.heartbeat_at = datetime.now(timezone.utc) - timedelta(days=1)
        db.commit()

        assert runs.is_stale(run) is True
        assert journal.run_status(run) == "stale"
        # La table, elle, ne connaît toujours que quatre statuts.
        assert run.status == "running"

        # Le ménage est opportuniste : il a lieu quand on crée le lot suivant.
        assert runs.close_stale_runs(db) == 1
        db.refresh(run)
        assert run.status == "failed"
        assert run.finished_at is not None


def test_un_lot_sans_battement_nest_pas_zombie(client_db) -> None:
    """Un lot antérieur au journal n'a pas de battement — aucune rétro-attribution (§F.4).

    Sans cette garde, le premier déploiement déclarerait morts tous les lots historiques.
    """
    _, Session = client_db
    with Session() as db:
        _, _, chapter = _seed_year(db)
        db.commit()
        run = runs.create_run(db, chapter_id=chapter.id)
        run.status = "running"
        run.heartbeat_at = None
        db.commit()

        assert runs.is_stale(run) is False


# --- La route ------------------------------------------------------------------------------


def test_le_journal_rend_le_flux_et_reste_reserve_a_papa(client_db) -> None:
    """Surface Papa entièrement : le veto est invisible de Massimo (V1)."""
    client, Session = client_db
    with Session() as db:
        _run_a_lot(db)

    res = client.get(API)
    assert res.status_code == 200
    body = res.json()
    assert body["runs"], "le journal est vide alors qu'un lot a tourné"
    first = body["runs"][0]
    assert first["events"], "le lot n'expose aucun détail"
    assert "consumed" in first["pieces"][0]

    _as(CHILD)
    assert client.get(API).status_code == 403
    _as(PAPA)


def test_le_journal_ne_totalise_aucune_provenance(client_db) -> None:
    """§F.2 : la provenance est un fait, jamais un reproche — elle ne se totalise pas.

    Verrou de doctrine : le jour où quelqu'un ajoutera « 31 objets servis sans relecture », ce
    test tombera, et c'est exactement ce qu'on veut.
    """
    client, Session = client_db
    with Session() as db:
        _run_a_lot(db)

    body = client.get(API).json()
    interdits = {"parent_bulk_count", "zetis_ratio", "unreviewed_count", "provenance_totals"}
    assert not (interdits & set(body)), "un total de provenance est apparu dans le Journal"
