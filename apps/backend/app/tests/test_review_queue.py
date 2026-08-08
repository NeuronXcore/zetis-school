"""File de relecture (ADR-0039) : un test par invariant.

100 % offline (SQLite in-memory). Les invariants couverts sont ceux qui, s'ils cassaient, le
feraient **en silence** : un compteur qui annonce plus que sa page ne sert, un chapitre rendu
invisible parce qu'il vit sous un thème, une famille ajoutée d'un seul côté.

⚠️ La fixture `client_db` ne crée **ni année scolaire ni chapitre**. Tous les tests de ce fichier
montent donc leur propre décor via `_decor()` — sans lui, la file est vide et les assertions
passeraient **à vide**. C'est exactement ce qui rendait
`test_les_quiz_ne_sont_pas_dans_la_file_de_validation` inoffensif : son `validation == [] or …`
était vrai parce qu'il n'y avait jamais de ligne `validation` du tout.
"""

import app.db.models as m
from app.main import app
from app.modules.auth.deps import get_current_user


def _as_papa() -> None:
    app.dependency_overrides[get_current_user] = lambda: {"username": "papa", "role": "papa"}


def _as_massimo() -> None:
    app.dependency_overrides[get_current_user] = lambda: {"username": "massimo", "role": "child"}


def _decor(db) -> dict:
    """Année active + matière rattachée + chapitre validé + leçon validée servable.

    Le décor est délibérément « propre » : chaque test y ajoute UNE anomalie et vérifie qu'elle
    seule ressort.
    """
    student = db.query(m.StudentProfile).first()
    subject = db.query(m.Subject).first()
    year = m.SchoolYear(student_id=student.id, label="2026-2027", level="4e", status="active")
    db.add(year)
    db.flush()
    sys_row = m.SchoolYearSubject(school_year_id=year.id, subject_id=subject.id)
    db.add(sys_row)
    db.flush()
    chapter = m.Chapter(
        school_year_subject_id=sys_row.id, name="Nombres relatifs", validation_status="validated"
    )
    db.add(chapter)
    db.flush()
    lesson = m.Lesson(
        chapter_id=chapter.id,
        title="Additionner des relatifs",
        status="validated",
        created_by="parent",
        content_markdown="# Cours",
    )
    db.add(lesson)
    db.flush()
    db.commit()
    return {
        "year_id": year.id,
        "subject_id": subject.id,
        "sys_id": sys_row.id,
        "chapter_id": chapter.id,
        "lesson_id": lesson.id,
    }


def _hors_annee(db, ctx: dict) -> None:
    """Une pièce en attente de CHAQUE famille, hors de l'année active.

    ⚠️ Ce décor n'est pas décoratif : sans lui, un compteur borné et un compteur global rendent le
    MÊME nombre, et tout test d'égalité entre deux surfaces passe alors qu'une seule est bornée.
    Démontré par sabotage — la première version de `test_la_file_et_l_inbox_comptent_la_MEME_chose`
    restait verte alors que l'inbox recomptait les capsules sans borne.
    """
    student = db.query(m.StudentProfile).first()
    old_year = m.SchoolYear(
        student_id=student.id, label="2024-2025", level="6e", status="archived"
    )
    db.add(old_year)
    db.flush()
    # Une matière que l'année active n'étudie PAS — sinon la capsule resterait dans le périmètre.
    matiere_oubliee = m.Subject(name="Latin", slug="latin")
    db.add(matiere_oubliee)
    db.flush()
    old_sys = m.SchoolYearSubject(school_year_id=old_year.id, subject_id=matiere_oubliee.id)
    db.add(old_sys)
    db.flush()
    old_chapter = m.Chapter(
        school_year_subject_id=old_sys.id, name="Déclinaisons", validation_status="pending"
    )
    db.add(old_chapter)
    db.flush()
    old_lesson = m.Lesson(
        chapter_id=old_chapter.id,
        title="Rosa rosam",
        status="validated",
        created_by="parent",
        content_markdown="# Cours",
    )
    db.add(old_lesson)
    db.flush()
    db.add(
        m.Lesson(
            chapter_id=old_chapter.id, title="Brouillon d'hier", status="draft", created_by="ai"
        )
    )
    db.add(m.Fiche(lesson_id=old_lesson.id, validation_status="pending"))
    db.add(m.Mindmap(lesson_id=old_lesson.id, validation_status="pending"))
    db.add(
        m.Capsule(
            subject_id=matiere_oubliee.id, title="Capsule d'hier", validation_status="pending"
        )
    )
    # Le diagnostic se borne par MATIÈRE, comme la capsule : il n'a ni chapitre ni leçon.
    db.add(
        m.Quiz(
            subject_id=matiere_oubliee.id,
            title="Diagnostic d'hier",
            quiz_type="diagnostic",
            status="ready",
            validation_status="pending",
        )
    )


def _queue(client, **params) -> dict:
    response = client.get("/api/parent/review-queue", params=params)
    assert response.status_code == 200, response.text
    return response.json()


# ==================================================================================================
# Les cinq familles
# ==================================================================================================


def test_les_six_familles_en_attente_entrent_dans_la_file(client_db) -> None:
    client, TestSession = client_db
    with TestSession() as db:
        ctx = _decor(db)
        # Une de chaque, en attente.
        db.add(
            m.Lesson(
                chapter_id=ctx["chapter_id"],
                title="Brouillon",
                status="draft",
                created_by="ai",
            )
        )
        db.add(m.Fiche(lesson_id=ctx["lesson_id"], validation_status="pending"))
        db.add(m.Mindmap(lesson_id=ctx["lesson_id"], validation_status="pending"))
        db.add(
            m.Capsule(
                subject_id=ctx["subject_id"], title="Capsule", validation_status="pending"
            )
        )
        db.add(
            m.Chapter(
                school_year_subject_id=ctx["sys_id"],
                name="Chapitre à relire",
                validation_status="pending",
            )
        )
        db.add(
            m.Quiz(
                subject_id=ctx["subject_id"],
                title="Diagnostic à relire",
                quiz_type="diagnostic",
                status="ready",
                validation_status="pending",
            )
        )
        # ... et une de chaque, DÉJÀ validée : elles ne doivent jamais ressortir.
        db.add(m.Fiche(lesson_id=ctx["lesson_id"], validation_status="validated"))
        db.add(m.Mindmap(lesson_id=ctx["lesson_id"], validation_status="validated"))
        db.add(
            m.Capsule(
                subject_id=ctx["subject_id"], title="Déjà vue", validation_status="validated"
            )
        )
        db.add(
            m.Quiz(
                subject_id=ctx["subject_id"],
                title="Diagnostic déjà relu",
                quiz_type="diagnostic",
                status="ready",
                validation_status="validated",
            )
        )
        db.commit()
    _as_papa()

    body = _queue(client)

    assert body["counts"] == {
        "lesson": 1,
        "fiche": 1,
        "mindmap": 1,
        "capsule": 1,
        "chapter": 1,
        "diagnostic": 1,
        "total": 6,
    }
    assert {item["kind"] for item in body["items"]} == {
        "lesson",
        "fiche",
        "mindmap",
        "capsule",
        "chapter",
        "diagnostic",
    }
    # Le diagnostic déjà relu ne revient pas — le gate se lit dans les DEUX sens.
    assert [item["title"] for item in body["items"] if item["kind"] == "diagnostic"] == [
        "Diagnostic à relire"
    ]


def test_la_file_et_l_inbox_comptent_la_MEME_chose(client_db) -> None:
    """🔴 LE VERROU du chantier.

    Une famille ajoutée d'un seul côté, un prédicat modifié sur une seule surface, un périmètre qui
    diverge : ce test tombe. C'est la transposition de la règle de l'ADR-0038 — *un constat ne peut
    plus annoncer un nombre que sa preuve ne sert pas* — sur la file de relecture.

    ⚠️ Le décor porte **une pièce hors année de chaque famille** (`_hors_annee`). Sans elles, les
    deux surfaces rendent le même nombre même quand une seule est bornée, et le verrou ne verrouille
    rien : vérifié par sabotage.
    """
    client, TestSession = client_db
    with TestSession() as db:
        ctx = _decor(db)
        for index in range(3):
            db.add(
                m.Lesson(
                    chapter_id=ctx["chapter_id"],
                    title=f"Brouillon {index}",
                    status="draft",
                    created_by="ai",
                )
            )
        db.add(m.Fiche(lesson_id=ctx["lesson_id"], validation_status="pending"))
        db.add(
            m.Capsule(
                subject_id=ctx["subject_id"], title="Capsule", validation_status="pending"
            )
        )
        _hors_annee(db, ctx)
        db.commit()
    _as_papa()

    queue = _queue(client)
    dashboard = client.get("/api/parent/dashboard").json()
    validation = next(item for item in dashboard["inbox"] if item["kind"] == "validation")

    # 1. Le total de la ligne == le total de la file.
    assert validation["count"] == queue["counts"]["total"] == len(queue["items"])
    # 2. Chaque segment == le compteur de sa famille == le nombre d'items de cette famille.
    by_kind = {segment["kind"]: segment["count"] for segment in validation["breakdown"]}
    for kind, count in queue["counts"].items():
        if kind == "total":
            continue
        served = len([item for item in queue["items"] if item["kind"] == kind])
        assert served == count, f"{kind} : la file sert {served} objets pour un compteur de {count}"
        assert by_kind.get(kind, 0) == count, f"{kind} : le dashboard annonce {by_kind.get(kind, 0)}"
    # 3. Une famille à zéro n'occupe pas un segment — un « 0 fiche » cliquable serait un cul-de-sac.
    assert "mindmap" not in by_kind


def test_seuls_les_quiz_de_DIAGNOSTIC_entrent_dans_la_file(client_db) -> None:
    """La ligne de partage est `quiz_type`, JAMAIS la table (ADR-0043, qui amende l'ADR-0014 §2).

    Ce test s'appelait « les quiz ne sont JAMAIS dans la file » et portait sur la TABLE : à
    l'époque, `quizzes` n'avait pas de `validation_status`. Il n'est pas supprimé — il est déplacé
    sur le bon prédicat, parce que ce qu'il protège n'a pas bougé : les quiz de **mission** et de
    **fin de cours** restent servis sans gate, et cette absence doit se relire comme un choix, pas
    comme un oubli.

    🔴 **Le décor porte les DEUX populations dans la même table, et les trois quiz sont `pending`.**
    C'est le seul montage qui distingue « la requête filtre sur `quiz_type` » de « la requête a
    oublié un prédicat » : un décor sans quiz de mission passerait aussi avec un `select(Quiz)` nu.
    L'anti-test-à-vide de l'aîné est conservé sous une forme plus forte — un compte EXACT, des deux
    côtés.
    """
    client, TestSession = client_db
    with TestSession() as db:
        ctx = _decor(db)
        commun = {"subject_id": ctx["subject_id"], "status": "ready", "validation_status": "pending"}
        db.add(m.Quiz(lesson_id=ctx["lesson_id"], title="Quiz de mission", quiz_type="mission", **commun))
        db.add(m.Quiz(lesson_id=ctx["lesson_id"], title="Quiz de fin de cours", quiz_type="lesson", **commun))
        db.add(m.Quiz(lesson_id=None, title="Diagnostic — Maths", quiz_type="diagnostic", **commun))
        db.commit()
    _as_papa()

    body = _queue(client)
    dashboard = client.get("/api/parent/dashboard").json()
    validation = next(item for item in dashboard["inbox"] if item["kind"] == "validation")

    # Ce qui entre : le diagnostic, et lui seul. `total == 1` couvre les deux autres d'un coup —
    # y compris le cas où ils entreraient sous une famille qu'on n'aurait pas pensé à nommer.
    assert body["counts"]["diagnostic"] == 1
    assert body["counts"]["total"] == 1, "un quiz non-diagnostic est entré dans la file"
    assert [item["title"] for item in body["items"]] == ["Diagnostic — Maths"]

    # Le diagnostic remonte jusqu'au dashboard, et la file « À décider » le nomme par sa FAMILLE.
    assert validation["count"] == 1, "sans ligne non vide, on ne teste rien"
    assert "diagnostic" in (validation["detail"] or "").lower()
    assert "quiz" not in (validation["detail"] or "").lower(), "la famille s'appelle `diagnostic`"


def test_les_deux_conventions_de_statut_sont_lues(client_db) -> None:
    """`lessons.status == 'draft'` ET `validation_status == 'pending'` — les deux, jamais une seule.

    Elles ne sont pas alignées volontairement (`school.py` documente qu'elles ne sont pas un
    doublon) : ce test garantit qu'on ne « simplifie » pas en n'en lisant plus qu'une.
    """
    client, TestSession = client_db
    with TestSession() as db:
        ctx = _decor(db)
        db.add(
            m.Lesson(
                chapter_id=ctx["chapter_id"], title="Brouillon", status="draft", created_by="ai"
            )
        )
        db.add(m.Fiche(lesson_id=ctx["lesson_id"], validation_status="pending"))
        db.commit()
    _as_papa()

    body = _queue(client)

    assert body["counts"]["lesson"] == 1  # convention `status`
    assert body["counts"]["fiche"] == 1  # convention `validation_status`
    # La leçon validée du décor ne ressort pas.
    assert [item["title"] for item in body["items"] if item["kind"] == "lesson"] == ["Brouillon"]


# ==================================================================================================
# Rattachement : les cas qui disparaissent en silence
# ==================================================================================================


def test_un_chapitre_en_attente_sort_SANS_lecon_parente(client_db) -> None:
    """Un chapitre est le nœud, pas une feuille : `lesson_id` reste `None`, et c'est l'information."""
    client, TestSession = client_db
    with TestSession() as db:
        ctx = _decor(db)
        db.add(
            m.Chapter(
                school_year_subject_id=ctx["sys_id"],
                name="Théorème de Pythagore",
                validation_status="pending",
            )
        )
        db.commit()
    _as_papa()

    body = _queue(client, kind="chapter")

    assert len(body["items"]) == 1
    item = body["items"][0]
    assert item["title"] == "Théorème de Pythagore"
    assert item["lesson_id"] is None and item["lesson"] is None
    assert item["chapter_id"] is not None
    assert item["subject"] == "Mathématiques"  # la matière, elle, est résolue
    # `Chapter` n'a pas de `TimestampMixin` : on sert NULL plutôt qu'une date inventée.
    assert item["created_at"] is None


def test_la_matiere_est_resolue_pour_un_chapitre_sous_THEME_seul(client_db) -> None:
    """🔴 Le piège qui a coûté l'ADR-0037, puis a été retrouvé dans `lessons_by_skill`.

    `Chapter.school_year_subject_id` est nullable : un chapitre peut vivre sous
    `Subject → Theme → Chapter`. Un `INNER JOIN` sur `SchoolYearSubject` le ferait disparaître
    **sans erreur**. Ce test verrouille le `COALESCE` des deux chemins.
    """
    client, TestSession = client_db
    with TestSession() as db:
        ctx = _decor(db)
        theme = m.Theme(subject_id=ctx["subject_id"], name="Algèbre")
        db.add(theme)
        db.flush()
        db.add(
            m.Chapter(
                school_year_subject_id=None,
                theme_id=theme.id,
                name="Chapitre orphelin d'année",
                validation_status="pending",
            )
        )
        db.commit()
    _as_papa()

    body = _queue(client, kind="chapter")

    assert [item["title"] for item in body["items"]] == ["Chapitre orphelin d'année"]
    assert body["items"][0]["subject"] == "Mathématiques"
    assert body["items"][0]["subject_id"] == ctx["subject_id"]


def test_une_capsule_sans_chapitre_reste_dans_la_file(client_db) -> None:
    """Les capsules n'ont pas de leçon et pas toujours de chapitre.

    C'est exactement pourquoi elles sont absentes de la matrice de la Couverture — et pourquoi
    cette file existe. Une capsule sans chapitre doit rester visible, avec un fil partiel.
    """
    client, TestSession = client_db
    with TestSession() as db:
        ctx = _decor(db)
        db.add(
            m.Capsule(
                subject_id=ctx["subject_id"],
                chapter_id=None,
                title="Les relatifs en 3 minutes",
                validation_status="pending",
            )
        )
        db.commit()
    _as_papa()

    body = _queue(client, kind="capsule")

    assert len(body["items"]) == 1
    item = body["items"][0]
    assert item["chapter_id"] is None and item["chapter"] is None
    assert item["lesson_id"] is None
    assert item["subject"] == "Mathématiques"


def test_hors_annee_active_n_est_compte_NULLE_PART(client_db) -> None:
    """Le bornage du §3, verrouillé des DEUX côtés.

    Sans ce test, borner la file sans borner l'inbox (ou l'inverse) passerait inaperçu — et le
    segment « leçons » annoncerait un nombre que `/couverture?filter=no_lesson` ne sert pas.
    """
    client, TestSession = client_db
    with TestSession() as db:
        ctx = _decor(db)
        # Une leçon brouillon DANS l'année…
        db.add(
            m.Lesson(
                chapter_id=ctx["chapter_id"], title="Dans l'année", status="draft", created_by="ai"
            )
        )
        # … et une pièce en attente de chaque famille HORS de l'année active.
        _hors_annee(db, ctx)
        db.commit()
    _as_papa()

    body = _queue(client)
    dashboard = client.get("/api/parent/dashboard").json()
    validation = next(item for item in dashboard["inbox"] if item["kind"] == "validation")

    assert [item["title"] for item in body["items"] if item["kind"] == "lesson"] == ["Dans l'année"]
    assert body["counts"] == {
        "lesson": 1,
        "fiche": 0,
        "mindmap": 0,
        "capsule": 0,
        "chapter": 0,
        "diagnostic": 0,
        "total": 1,
    }, "aucune famille ne laisse passer une pièce hors année"
    assert validation["count"] == 1, "les deux surfaces se bornent pareil"


# ==================================================================================================
# Filtres, compteurs, doctrine
# ==================================================================================================


def test_les_filtres_ne_touchent_NI_les_compteurs_NI_les_matieres(client_db) -> None:
    """🔴 Leçon déjà payée deux fois (`filterCounts`, `allSubjects`).

    Des pastilles qui s'effondrent au premier clic obligent à repasser par « Tout » pour changer
    d'avis.
    """
    client, TestSession = client_db
    with TestSession() as db:
        ctx = _decor(db)
        autre = m.Subject(name="Français", slug="francais")
        db.add(autre)
        db.flush()
        db.add(m.SchoolYearSubject(school_year_id=ctx["year_id"], subject_id=autre.id))
        db.add(m.Fiche(lesson_id=ctx["lesson_id"], validation_status="pending"))
        db.add(
            m.Capsule(subject_id=autre.id, title="Le passé simple", validation_status="pending")
        )
        db.commit()
    _as_papa()

    complet = _queue(client)
    filtre = _queue(client, kind="fiche")

    assert filtre["counts"] == complet["counts"]
    assert filtre["subjects"] == complet["subjects"]
    assert len(complet["subjects"]) == 2
    assert [item["kind"] for item in filtre["items"]] == ["fiche"]


def test_le_filtre_par_matiere_ne_garde_que_sa_matiere(client_db) -> None:
    client, TestSession = client_db
    with TestSession() as db:
        ctx = _decor(db)
        autre = m.Subject(name="Français", slug="francais")
        db.add(autre)
        db.flush()
        db.add(m.SchoolYearSubject(school_year_id=ctx["year_id"], subject_id=autre.id))
        db.add(m.Capsule(subject_id=ctx["subject_id"], title="Maths", validation_status="pending"))
        db.add(m.Capsule(subject_id=autre.id, title="Français", validation_status="pending"))
        db.commit()
    _as_papa()

    body = _queue(client, subject_id=ctx["subject_id"])

    assert [item["title"] for item in body["items"]] == ["Maths"]
    assert body["counts"]["capsule"] == 2, "le compteur reste celui de la population entière"


def test_les_familles_ne_s_entrelacent_jamais(client_db) -> None:
    """L'ordre des familles est FIXE (§7) et ne dépend d'aucune date.

    Une file triable par ancienneté ferait remonter le plus vieux devant — un reproche daté. On
    relit dans l'ordre du curriculum, familles groupées.
    """
    client, TestSession = client_db
    with TestSession() as db:
        ctx = _decor(db)
        db.add(m.Capsule(subject_id=ctx["subject_id"], title="C", validation_status="pending"))
        db.add(m.Fiche(lesson_id=ctx["lesson_id"], validation_status="pending"))
        db.add(
            m.Lesson(
                chapter_id=ctx["chapter_id"], title="Brouillon", status="draft", created_by="ai"
            )
        )
        db.commit()
    _as_papa()

    kinds = [item["kind"] for item in _queue(client)["items"]]

    assert kinds == ["lesson", "fiche", "capsule"]


def test_la_route_est_reservee_a_papa(client_db) -> None:
    client, _ = client_db
    _as_massimo()

    assert client.get("/api/parent/review-queue").status_code in (401, 403)


def test_la_route_n_ecrit_RIEN(client_db) -> None:
    """Une file de lecture qui écrirait « au passage » serait indétectable jusqu'au jour où."""
    client, TestSession = client_db
    with TestSession() as db:
        ctx = _decor(db)
        db.add(
            m.Lesson(
                chapter_id=ctx["chapter_id"], title="Brouillon", status="draft", created_by="ai"
            )
        )
        db.add(m.Fiche(lesson_id=ctx["lesson_id"], validation_status="pending"))
        db.commit()

    def _empreinte() -> tuple:
        with TestSession() as db:
            return (
                db.query(m.Lesson).count(),
                db.query(m.Fiche).count(),
                db.query(m.Chapter).count(),
                sorted(row.status for row in db.query(m.Lesson).all()),
                sorted(row.validation_status for row in db.query(m.Fiche).all()),
            )

    _as_papa()
    avant = _empreinte()
    _queue(client)
    _queue(client, kind="lesson")

    assert _empreinte() == avant


def test_une_annee_sans_rien_a_relire_rend_une_file_vide_et_pas_de_ligne(client_db) -> None:
    """L'état vide est l'état NORMAL : la ligne `validation` disparaît, elle ne s'affiche pas à 0."""
    client, TestSession = client_db
    with TestSession() as db:
        _decor(db)
    _as_papa()

    body = _queue(client)
    dashboard = client.get("/api/parent/dashboard").json()

    assert body["items"] == []
    assert body["counts"]["total"] == 0
    assert [item for item in dashboard["inbox"] if item["kind"] == "validation"] == []


def test_les_CINQ_segments_menent_a_la_file(client_db) -> None:
    """Les cinq familles vont à la file, sans exception (ADR-0039 §5).

    Les cours y avaient d'abord fait exception — routés vers `/couverture?filter=no_lesson`, où
    vit la validation en lot par chapitre. Décision revue par Papa **après l'avoir vue à l'écran**
    le 2026-08-05 : relire un cours se fait un par un, et une file où quatre familles sur cinq
    atterrissent laissait la cinquième ailleurs sans raison lisible.
    """
    client, TestSession = client_db
    with TestSession() as db:
        ctx = _decor(db)
        db.add(
            m.Lesson(
                chapter_id=ctx["chapter_id"], title="Brouillon", status="draft", created_by="ai"
            )
        )
        db.add(
            m.Capsule(subject_id=ctx["subject_id"], title="Capsule", validation_status="pending")
        )
        db.commit()
    _as_papa()

    dashboard = client.get("/api/parent/dashboard").json()
    validation = next(item for item in dashboard["inbox"] if item["kind"] == "validation")
    hrefs = {segment["kind"]: segment["href"] for segment in validation["breakdown"]}

    assert hrefs["lesson"] == "/relecture?kind=lesson"
    assert hrefs["capsule"] == "/relecture?kind=capsule"
    assert validation["href"] == "/relecture"
    # Aucun segment ne sort de la file : une exception rendrait le reste illisible.
    assert all(href.startswith("/relecture") for href in hrefs.values())
    # Le repli textuel reste servi pour tout consommateur qui ignore `breakdown`.
    assert validation["detail"] == "1 cours · 1 capsule"


# ==================================================================================================
# « À produire » : le nombre annoncé est celui que la destination ouvre
# ==================================================================================================


def test_le_delta_a_produire_compte_ce_que_la_couverture_OUVRE(client_db) -> None:
    """🔴 Verrou frère du précédent, côté « à produire » (ADR-0039 §9).

    Mesuré à l'écran avant correction : le dashboard annonçait « ↓ 49 à produire » sous Fiches et
    `/couverture?filter=ready&manque=fiche` ouvrait **17** lignes. Deux causes cumulées, aucune
    n'étant une faute de calcul : la chaîne ignorait l'année scolaire, et une leçon validée **sans
    cours rédigé** entrait dans la soustraction alors qu'aucun dérivé n'y est générable.
    """
    client, TestSession = client_db
    with TestSession() as db:
        ctx = _decor(db)
        # Servable et nue → produisible : elle DOIT être comptée (le décor en fournit déjà une).
        servable = m.Lesson(
            chapter_id=ctx["chapter_id"],
            title="Servable et nue",
            status="validated",
            created_by="parent",
            content_markdown="# Cours",
        )
        db.add(servable)
        # Validée mais SANS cours → aucun dérivé générable : ne doit PAS être comptée en fiches.
        db.add(
            m.Lesson(
                chapter_id=ctx["chapter_id"],
                title="Validée sans cours",
                status="validated",
                created_by="parent",
                content_markdown=None,
            )
        )
        # Servable et DÉJÀ pourvue → rien à produire, même si la fiche attend une relecture.
        pourvue = m.Lesson(
            chapter_id=ctx["chapter_id"],
            title="Déjà pourvue",
            status="validated",
            created_by="parent",
            content_markdown="# Cours",
        )
        db.add(pourvue)
        db.flush()
        db.add(m.Fiche(lesson_id=pourvue.id, validation_status="pending"))
        db.commit()
    _as_papa()

    chain = client.get("/api/parent/dashboard").json()["content_chain"]
    par_marche = {stage["stage"]: stage for stage in chain}

    # 2 servables nues (celle du décor + « Servable et nue »), la pourvue et la sans-cours exclues.
    assert par_marche["fiches"]["missing_count"] == 2
    assert par_marche["fiches"]["missing_href"] == "/couverture?filter=ready&manque=fiche"
    # ⚠️ La soustraction des marches, elle, en annonce 4 (les quatre leçons validées, moins zéro
    # fiche *validée*) : deux de trop, et pour deux raisons différentes — la leçon sans cours n'est
    # pas produisible, et la fiche `pending` existe déjà. C'est tout l'écart, en une ligne.
    assert par_marche["fiches"]["target"] - par_marche["fiches"]["value"] == 4
    # Le cours manquant a son propre compte, et c'est celui de la pilule « Sans cours ».
    assert par_marche["cours_valides"]["missing_count"] == 1
    # La première marche ne porte rien : aucun delta ne se lit au-dessus d'elle.
    assert par_marche["chapitres_valides"]["missing_href"] is None
    assert par_marche["chapitres_valides"]["missing_count"] is None
