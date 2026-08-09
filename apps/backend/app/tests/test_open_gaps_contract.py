"""`GET /api/parent/progress/gaps` sert `source` et `content_state` (ADR-0045, slice C).

🔴 **Pourquoi ces deux champs existent.** Les jauges de la page Diagnostic de Papa renvoient ici
avec `?source=diagnostic` et `?contenu=absent`. Tant que la charge utile ne portait pas de quoi
filtrer, le renvoi « dont 4 sans contenu → » menait à une page qui en affichait **10** : un nombre
cliquable qui conduit à un autre nombre est **pire** que le nombre invisible qu'il remplace, et
c'est le défaut même dont l'ADR-0039 est né.

⚠️ **Le décor est NON DÉGÉNÉRÉ, et c'est tout le test.** Il porte les **trois** états de contenu et
**deux** origines. Avec un seul état, n'importe quelle valeur constante passerait ; avec une seule
origine, un filtre qui ne filtre rien passerait aussi.
"""

import app.db.models as m
from app.main import app
from app.modules.auth.deps import get_current_user


def _as_papa() -> None:
    app.dependency_overrides[get_current_user] = lambda: {"username": "papa", "role": "papa"}


def _seed(TestSession) -> None:
    """Trois lacunes, trois états de contenu, deux origines.

    | notion       | leçon            | `content_state` attendu | `source`     |
    |--------------|------------------|-------------------------|--------------|
    | Avec cours   | une `validated`  | `ok`                    | `diagnostic` |
    | Sans leçon   | **aucune**       | `aucune_lecon`          | `diagnostic` |
    | Cours draft  | une `draft`      | `cours_brouillon`       | `mission`    |
    """
    with TestSession() as db:
        student = db.query(m.StudentProfile).first()
        subject = db.query(m.Subject).first()

        # ⚠️ Une leçon n'est trouvée par `lessons_by_skill` que via **année ACTIVE →
        # SchoolYearSubject → chapitre `validated`**. Sans cette chaîne, les trois notions
        # ressortiraient `aucune_lecon` et le test passerait pour la mauvaise raison.
        year = m.SchoolYear(
            student_id=student.id, label="2026-2027", level="4e", status="active"
        )
        db.add(year)
        db.flush()
        sys_row = m.SchoolYearSubject(school_year_id=year.id, subject_id=subject.id)
        db.add(sys_row)
        db.flush()
        chapter = m.Chapter(
            school_year_subject_id=sys_row.id, name="Chapitre", validation_status="validated"
        )
        db.add(chapter)
        db.flush()

        skills = {}
        for nom in ("Avec cours", "Sans leçon", "Cours draft"):
            skill = m.Skill(subject_id=subject.id, name=nom, level="4e")
            db.add(skill)
            skills[nom] = skill
        db.flush()

        for nom, statut in (("Avec cours", "validated"), ("Cours draft", "draft")):
            lecon = m.Lesson(
                chapter_id=chapter.id,
                title=f"Leçon {nom}",
                status=statut,
                created_by="parent",
            )
            db.add(lecon)
            db.flush()
            db.add(m.LessonSkill(lesson_id=lecon.id, skill_id=skills[nom].id))

        for nom, source in (
            ("Avec cours", "diagnostic"),
            ("Sans leçon", "diagnostic"),
            ("Cours draft", "mission"),
        ):
            db.add(
                m.Gap(
                    student_id=student.id,
                    skill_id=skills[nom].id,
                    subject_id=subject.id,
                    source=source,
                    severity="medium",
                    status="open",
                )
            )
        db.commit()


def test_open_gaps_sert_l_origine_de_chaque_lacune(client_db) -> None:
    """Sans `source`, la page ne peut pas distinguer ce qu'une MESURE a ouvert de ce qu'un
    EXERCICE a révélé — et le renvoi d'une jauge du Diagnostic ramène les deux."""
    client, TestSession = client_db
    _seed(TestSession)
    _as_papa()

    par_notion = {g["skill_name"]: g for g in client.get("/api/parent/progress/gaps").json()}

    assert par_notion["Avec cours"]["source"] == "diagnostic"
    assert par_notion["Sans leçon"]["source"] == "diagnostic"
    # 🔴 Celle-ci NE vient PAS d'un diagnostic : c'est elle qui rend le filtre nécessaire.
    assert par_notion["Cours draft"]["source"] == "mission"


def test_open_gaps_distingue_les_TROIS_etats_de_contenu(client_db) -> None:
    """🔴 `aucune_lecon` et `cours_brouillon` ne se confondent pas (ADR-0042) : sans leçon la lacune
    est réparable par un quiz ancré sur la notion, avec un cours en brouillon cette voie REFUSE."""
    client, TestSession = client_db
    _seed(TestSession)
    _as_papa()

    par_notion = {g["skill_name"]: g for g in client.get("/api/parent/progress/gaps").json()}

    assert par_notion["Avec cours"]["content_state"] == "ok"
    assert par_notion["Sans leçon"]["content_state"] == "aucune_lecon"
    assert par_notion["Cours draft"]["content_state"] == "cours_brouillon"


def test_le_compte_sans_contenu_produisible_est_derivable(client_db) -> None:
    """Le nombre que la jauge annonce (« dont N sans contenu ») doit pouvoir se retrouver ICI.

    C'est l'invariant du chantier : **un renvoi mène au compte qu'il annonce**. Deux surfaces qui
    comptent la même population par deux chemins différents finiront par diverger ; ce test dit
    que le chemin existe."""
    client, TestSession = client_db
    _seed(TestSession)
    _as_papa()

    gaps = client.get("/api/parent/progress/gaps").json()
    sans_contenu = [g for g in gaps if g["content_state"] != "ok"]

    assert len(sans_contenu) == 2
    assert {g["skill_name"] for g in sans_contenu} == {"Sans leçon", "Cours draft"}


# ================================================================================================
# ADR-0047 — `lesson_id` et `mission_id` : de quoi rendre la ligne actionnable.
#
# ⚠️ **Décor SÉPARÉ, volontairement.** Étendre `_seed` aurait cassé
# `test_le_compte_sans_contenu_produisible_est_derivable`, qui compte `== 2` — et modifier un test
# existant pour faire passer du code neuf est une régression masquée (`WORKFLOW.md §2.3`).
# ================================================================================================


def _seed_gestes(TestSession) -> dict[str, int]:
    """Quatre notions, taillées pour les cas que le geste doit distinguer.

    | notion            | leçons                                    | attendu                   |
    |-------------------|-------------------------------------------|---------------------------|
    | Quatre leçons     | 2 `draft` + 2 `validated`                 | la `validated` la + récente|
    | Brouillon double  | 2 `draft`                                 | la `draft` la + récente    |
    | Orpheline         | aucune                                    | `lesson_id` **null**      |
    | Couverte          | une `validated` + **deux missions**       | la mission la + prioritaire|

    Rend `{nom: id}` des objets dont les tests ont besoin pour se prononcer sur une IDENTITÉ, et
    pas seulement sur « une valeur non nulle ».
    """
    from datetime import datetime, timedelta, timezone

    repere = datetime(2026, 8, 1, 12, 0, tzinfo=timezone.utc)
    attendus: dict[str, int] = {}

    with TestSession() as db:
        student = db.query(m.StudentProfile).first()
        subject = db.query(m.Subject).first()

        year = m.SchoolYear(student_id=student.id, label="2026-2027", level="4e", status="active")
        db.add(year)
        db.flush()
        sys_row = m.SchoolYearSubject(school_year_id=year.id, subject_id=subject.id)
        db.add(sys_row)
        db.flush()
        chapter = m.Chapter(
            school_year_subject_id=sys_row.id, name="Chapitre", validation_status="validated"
        )
        db.add(chapter)
        db.flush()

        skills = {}
        for nom in ("Quatre leçons", "Brouillon double", "Orpheline", "Couverte"):
            skill = m.Skill(subject_id=subject.id, name=nom, level="4e")
            db.add(skill)
            skills[nom] = skill
        db.flush()
        attendus["skill_couverte"] = skills["Couverte"].id

        def _lecon(notion: str, statut: str, jours: int) -> m.Lesson:
            """`updated_at` posé EXPLICITEMENT : sans ça, les quatre leçons naîtraient au même
            `server_default=func.now()` et le départage retomberait sur l'`id` — le test passerait
            alors pour la mauvaise raison, en prouvant l'ordre qu'on a justement écarté."""
            lecon = m.Lesson(
                chapter_id=chapter.id,
                title=f"{notion} · {statut} · J+{jours}",
                status=statut,
                created_by="parent",
                updated_at=repere + timedelta(days=jours),
            )
            db.add(lecon)
            db.flush()
            db.add(m.LessonSkill(lesson_id=lecon.id, skill_id=skills[notion].id))
            return lecon

        # 🔴 L'ORDRE DE CRÉATION EST L'INVERSE DE L'ORDRE ATTENDU, et c'est tout l'intérêt :
        # la leçon qui doit gagner est créée EN PREMIER, donc elle a le plus PETIT `id`. Un
        # départage par `id` décroissant — celui que l'ADR prescrivait avant correction — rendrait
        # l'autre. Le test ne peut donc pas passer par accident.
        attendus["validee_gagnante"] = _lecon("Quatre leçons", "validated", jours=30).id
        _lecon("Quatre leçons", "validated", jours=1)
        _lecon("Quatre leçons", "draft", jours=90)  # plus récente que tout, mais pas du bon statut
        _lecon("Quatre leçons", "draft", jours=2)

        attendus["brouillon_gagnant"] = _lecon("Brouillon double", "draft", jours=30).id
        _lecon("Brouillon double", "draft", jours=1)

        _lecon("Couverte", "validated", jours=5)

        # Deux missions sur la MÊME notion : `active_missions` trie `priority DESC, id`, donc la
        # prioritaire gagne — créée en second, elle a l'id le plus grand, ce qui écarte aussi un
        # départage accidentel par ordre d'insertion.
        for titre, priorite, cle in (
            ("Mission secondaire", 1, None),
            ("Mission prioritaire", 9, "mission_gagnante"),
        ):
            mission = m.Mission(
                student_id=student.id,
                subject_id=subject.id,
                skill_id=skills["Couverte"].id,
                title=titre,
                mission_type="remediation",
                status="active",
                priority=priorite,
            )
            db.add(mission)
            db.flush()
            if cle:
                attendus[cle] = mission.id

        for nom in ("Quatre leçons", "Brouillon double", "Orpheline", "Couverte"):
            db.add(
                m.Gap(
                    student_id=student.id,
                    skill_id=skills[nom].id,
                    subject_id=subject.id,
                    source="diagnostic",
                    severity="medium",
                    status="open",
                )
            )
        db.commit()

    return attendus


def _par_notion(client) -> dict:
    return {g["skill_name"]: g for g in client.get("/api/parent/progress/gaps").json()}


def test_la_lecon_visee_suit_l_etat_vise_par_le_geste(client_db) -> None:
    """🔴 Le cœur de l'ADR-0047 Décision 4.

    « Valider le cours de cette leçon → » doit ouvrir une leçon **en brouillon** ; « Relire la
    leçon → » une leçon **validée**. Ouvrir une leçon déjà validée sous le libellé « Valider »
    recréerait le défaut que tout le chantier corrige — un libellé qui promet ce que le lien ne
    livre pas."""
    client, TestSession = client_db
    attendus = _seed_gestes(TestSession)
    _as_papa()

    lignes = _par_notion(client)

    assert lignes["Quatre leçons"]["content_state"] == "ok"
    assert lignes["Quatre leçons"]["lesson_id"] == attendus["validee_gagnante"]

    assert lignes["Brouillon double"]["content_state"] == "cours_brouillon"
    assert lignes["Brouillon double"]["lesson_id"] == attendus["brouillon_gagnant"]


def test_le_departage_ne_pose_PAS_un_second_ordre(client_db) -> None:
    """🔴 Le verrou qui tient la correction du 2026-08-09.

    L'ADR-0047 prescrivait d'abord « la plus récente (`id` le plus grand) ». `lessons_by_skill`
    trie déjà `(updated_at, id)` décroissant, et les deux ordres DIVERGENT. Le décor le rend
    vérifiable : la leçon attendue a le **plus petit `id`** de son statut, et le `updated_at` le
    plus récent. Si quelqu'un réintroduit un tri par `id`, ce test rougit.

    Ce n'est pas un détail de style : deux ordres de « la plus récente » dans le même dépôt, c'est
    le motif des dettes *deux définitions de `has_referentiel`* et *sept copies de `_active_year`*.
    """
    client, TestSession = client_db
    attendus = _seed_gestes(TestSession)
    _as_papa()

    rendue = _par_notion(client)["Quatre leçons"]["lesson_id"]

    assert rendue == attendus["validee_gagnante"]
    # La preuve que le test mord : l'attendue n'est PAS l'id le plus grand de sa notion.
    with TestSession() as db:
        ids_validees = [
            lecon.id
            for lecon in db.query(m.Lesson).all()
            if lecon.status == "validated" and lecon.title.startswith("Quatre leçons")
        ]
    assert rendue != max(ids_validees), "le décor ne distingue plus les deux ordres"


def test_sans_lecon_la_cle_EXISTE_et_vaut_null(client_db) -> None:
    """`aucune_lecon` rend `lesson_id: null`, pas l'ABSENCE de clé.

    La différence compte côté client : une clé absente et une clé nulle se lisent pareil en
    JavaScript, mais seule la seconde survit à un `response_model` qui déclare le champ. C'est
    aussi ce qui distingue « pas de leçon » de « champ oublié »."""
    client, TestSession = client_db
    _seed_gestes(TestSession)
    _as_papa()

    orpheline = _par_notion(client)["Orpheline"]

    assert "lesson_id" in orpheline
    assert orpheline["lesson_id"] is None
    assert orpheline["content_state"] == "aucune_lecon"


def test_la_reponse_HTTP_porte_les_deux_champs(client_db) -> None:
    """🔴 Le piège `response_model`, troisième et quatrième champ du même service.

    L'ADR-0045 a vu `source` et `content_state` produits par le service et DISPARAÎTRE en silence
    à la sérialisation, faute d'être déclarés dans `OpenGapOut`. Ce test regarde la réponse HTTP,
    jamais le dict du service — c'est la seule place d'où le filtrage est visible."""
    client, TestSession = client_db
    _seed_gestes(TestSession)
    _as_papa()

    for ligne in client.get("/api/parent/progress/gaps").json():
        assert "lesson_id" in ligne, "le response_model a filtré lesson_id en silence"
        assert "mission_id" in ligne, "le response_model a filtré mission_id en silence"


def test_mission_id_est_la_PLUS_PRIORITAIRE_et_accompagne_le_drapeau(client_db) -> None:
    """`mission_id` suit l'ordre d'`active_missions` (`priority DESC, id`), sans second critère.

    Et il est non nul **exactement** quand `has_active_mission` l'est : les deux sortent de la même
    passe, donc la page ne peut pas afficher « déjà pris en charge » sans savoir où mène le geste.
    """
    client, TestSession = client_db
    attendus = _seed_gestes(TestSession)
    _as_papa()

    lignes = _par_notion(client)

    assert lignes["Couverte"]["has_active_mission"] is True
    assert lignes["Couverte"]["mission_id"] == attendus["mission_gagnante"]

    for nom in ("Quatre leçons", "Brouillon double", "Orpheline"):
        assert lignes[nom]["has_active_mission"] is False
        assert lignes[nom]["mission_id"] is None


def test_l_ensemble_des_notions_couvertes_n_a_PAS_change(client_db) -> None:
    """🔴 Non-régression sur une fonction à CINQ lecteurs.

    `skills_with_active_mission` dérive désormais de `missions_by_skill`. Quatre autres surfaces en
    dépendent — `_gaps_without_mission` et `_inbox` (dashboard), `_to_reinforce`
    (progress.analysis), `skills_index`. Si l'ensemble changeait, elles compteraient autre chose
    que cette page sans que rien ne le dise."""
    from app.modules.progress import service as progress_service

    _client, TestSession = client_db
    _seed_gestes(TestSession)

    with TestSession() as db:
        student = db.query(m.StudentProfile).first()
        ensemble = progress_service.skills_with_active_mission(db, student_id=student.id)
        par_notion = progress_service.missions_by_skill(db, student_id=student.id)
        attendu = {
            mission.skill_id
            for mission in progress_service.active_missions(db, student_id=student.id)
            if mission.skill_id is not None
        }

    assert ensemble == attendu
    assert set(par_notion) == ensemble


def test_open_gaps_ne_coute_PAS_une_requete_de_plus(client_db) -> None:
    """🔴 ADR-0047 Décision 5 — « les deux champs coûtent ZÉRO requête ».

    Le vrai invariant n'est pas un nombre absolu : c'est que le coût **ne dépend pas du nombre de
    lacunes**. Une résolution par ligne passerait un plafond mal choisi et exploserait en prod, où
    Papa a dix lacunes et non trois. Et `open_gap_count` appelle `open_gaps` : tout coût s'y paie
    une seconde fois.

    ⚠️ Le piège serait d'appeler `etat_contenu` PUIS `lecons_visees` — deux passes sur
    `lessons_by_skill` pour deux moitiés du même parcours. Ce test le verrait."""
    from sqlalchemy import event
    from sqlalchemy.engine import Engine

    from app.modules.progress import service as progress_service

    _client, TestSession = client_db
    _seed_gestes(TestSession)

    requetes: list[str] = []

    def _compter(_conn, _cursor, statement, *_args) -> None:
        requetes.append(statement)

    event.listen(Engine, "before_cursor_execute", _compter)
    try:
        with TestSession() as db:
            student = db.query(m.StudentProfile).first()
            requetes.clear()
            lignes = progress_service.open_gaps(db, student_id=student.id)
    finally:
        event.remove(Engine, "before_cursor_execute", _compter)

    assert len(lignes) == 4
    # gaps · missions actives · leçons en lot. Rien par ligne.
    assert len(requetes) <= 4, f"{len(requetes)} requêtes pour 4 lacunes :\n" + "\n".join(requetes)
