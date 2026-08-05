"""Page « Progression » (ADR-0038) : un test par invariant du contrat.

Ce que ces tests protègent tient en une phrase : **cette page ne peut pas contredire le constat
qui pointe vers elle.** `/progression` est la cible de la branche `up` de la Lecture ZETIS, et elle
rendait jusqu'ici un mock — un pourcentage, un XP et un compte de lacunes qui ne venaient d'aucune
mesure. Le motif « un constat annonce N, sa preuve en montre un autre » a déjà coûté un bug sur la
branche `watch` ; c'est ce motif que ce fichier ferme sur la branche `up`.

100 % offline : SQLite in-memory, aucun LLM.
"""

import app.db.models as m
from app.main import app
from app.modules.auth.deps import get_current_user
from app.modules.dashboard import projections as p

ROUTE = "/api/parent/progress/overview"

# ⚠️ Le `conftest` sème DÉJÀ une notion dans Mathématiques (« Nombres relatifs »), sans ligne de
# maîtrise. Elle compte donc au programme et dans les « non abordées ». L'ignorer a fait tomber
# deux de ces tests au premier passage — on la nomme plutôt que d'ajuster les nombres en silence.
NOTIONS_DU_CONFTEST = 1


def _as_papa() -> None:
    app.dependency_overrides[get_current_user] = lambda: {"username": "papa", "role": "papa"}


def _notions(TestSession, *, statuses: list[str], extra_skills: int = 0) -> tuple[int, list[int]]:
    """Pose des notions dans la matière du `conftest`, dont `len(statuses)` ont une maîtrise.

    `extra_skills` ajoute des notions AU PROGRAMME sans ligne de maîtrise : ce sont les « non
    abordées », le dénominateur moins le numérateur.

    Rend `(subject_id, skill_ids CRÉÉS ICI)` — sans la notion du `conftest`, pour qu'un test qui
    sème des lacunes ne les pose que sur ce qu'il a lui-même mis en place.
    """
    with TestSession() as db:
        student = db.query(m.StudentProfile).first()
        subject = db.query(m.Subject).first()
        skills = [
            m.Skill(subject_id=subject.id, name=f"Notion {i}", level="4e")
            for i in range(len(statuses) + extra_skills)
        ]
        db.add_all(skills)
        db.flush()
        for skill, status in zip(skills, statuses):
            db.add(
                m.SkillMastery(
                    student_id=student.id, skill_id=skill.id, status=status, mastery_score=50
                )
            )
        db.commit()
        return subject.id, [s.id for s in skills]


def _matiere(TestSession, *, name: str, slug: str) -> int:
    with TestSession() as db:
        subject = m.Subject(name=name, slug=slug)
        db.add(subject)
        db.commit()
        return subject.id


def _referentiel(TestSession, *, subject_id: int, avec_chapitre: bool = True) -> None:
    """Rattache la matière à l'année active, avec ou sans chapitre.

    `has_referentiel` du dashboard = « au moins un CHAPITRE dans l'année active ». Une matière
    rattachée mais sans chapitre est donc SANS référentiel — c'est la nuance que ce helper permet
    de mettre à l'épreuve.
    """
    with TestSession() as db:
        student = db.query(m.StudentProfile).first()
        year = db.query(m.SchoolYear).filter_by(status="active").first()
        if year is None:
            year = m.SchoolYear(
                student_id=student.id, label="2026-2027", level="4e", status="active"
            )
            db.add(year)
            db.flush()
        sys_row = m.SchoolYearSubject(school_year_id=year.id, subject_id=subject_id)
        db.add(sys_row)
        db.flush()
        if avec_chapitre:
            db.add(m.Chapter(school_year_subject_id=sys_row.id, name="Chapitre 1"))
        db.commit()


def _ligne(body: dict, slug: str) -> dict:
    return next(s for s in body["subjects"] if s["slug"] == slug)


# --- La route ------------------------------------------------------------------------------------


def test_route_interdite_a_l_enfant(client_db) -> None:
    """Analyse parentale : jamais servie à Massimo (CLAUDE.md, séparation des domaines)."""
    client, _ = client_db
    assert client.get(ROUTE).status_code == 403


def test_une_seule_requete_sert_toute_la_page(client_db) -> None:
    """Les quatre colonnes sortent de la MÊME réponse — rien à recharger, aucune période."""
    client, TestSession = client_db
    _notions(TestSession, statuses=["mastered", "weak", "solid"], extra_skills=1)
    _as_papa()

    ligne = _ligne(client.get(ROUTE).json(), "mathematiques")

    assert set(ligne) >= {"notions", "engaged", "xp", "gaps_open", "has_referentiel"}
    # Aucune période nulle part : ce qui est servi est un stock (ADR-0038 §6). Un `period` passé
    # à tout hasard ne change rien — il n'y a aucun axe temporel à faire bouger.
    assert client.get(f"{ROUTE}?period=30").json()["subjects"] == client.get(ROUTE).json()[
        "subjects"
    ]


# --- Verrou 1 : « engagées » = consolidées ∪ fragiles ∪ en cours ----------------------------------


def test_engagees_comptent_les_TROIS_segments(client_db) -> None:
    """LE verrou de la mesure : `in_progress` est le segment que tout mapping manuel oublie.

    L'oublier ferait une barre qui RECULE quand une notion consolidée redevient fragile puis
    « en cours » — un écran qui punirait Massimo d'avoir été réévalué."""
    client, TestSession = client_db
    # 1 consolidée, 2 fragiles, 3 en cours, 4 jamais abordées → 6 engagées sur 10 au programme.
    _notions(
        TestSession,
        statuses=["mastered", "weak", "weak", "solid", "solid", "solid"],
        extra_skills=4,
    )
    _as_papa()

    ligne = _ligne(client.get(ROUTE).json(), "mathematiques")

    # Anti-vacuité : sans notion « en cours » dans la fixture, l'égalité tiendrait même en les
    # omettant — le test passerait sans rien prouver.
    assert ligne["notions"]["in_progress"] == 3
    assert ligne["notions"]["consolidated"] == 1
    assert ligne["notions"]["fragile"] == 2
    assert ligne["engaged"] == 6
    assert ligne["notions"]["total"] == 10 + NOTIONS_DU_CONFTEST, (
        "le dénominateur est le PROGRAMME, pas les engagées"
    )


def test_engagees_et_acquises_ne_fusionnent_JAMAIS(client_db) -> None:
    """Deux mesures, deux nombres. « Avancé » n'est pas un raffinement d'« acquis ».

    Il y a 1 notion consolidée sur 280 en base réelle : une barre bâtie sur les acquis afficherait
    zéro pour sept matières sur huit pendant des mois."""
    client, TestSession = client_db
    _notions(TestSession, statuses=["weak", "solid"], extra_skills=2)
    _as_papa()

    ligne = _ligne(client.get(ROUTE).json(), "mathematiques")

    assert ligne["engaged"] == 2
    assert ligne["notions"]["consolidated"] == 0, "aucune acquise, et pourtant l'avancement bouge"


# --- Verrou 2 : une matière sans référentiel RESTE dans la liste ----------------------------------


def test_une_matiere_sans_referentiel_garde_sa_ligne(client_db) -> None:
    """La masquer ferait croire qu'elle n'existe pas, au lieu de dire qu'elle n'a rien encore."""
    client, TestSession = client_db
    maths, _ = _notions(TestSession, statuses=["weak"])
    _referentiel(TestSession, subject_id=maths, avec_chapitre=True)
    _matiere(TestSession, name="Espagnol", slug="espagnol")  # jamais rattachée à l'année
    _as_papa()

    body = client.get(ROUTE).json()

    slugs = [s["slug"] for s in body["subjects"]]
    assert "espagnol" in slugs, "une matière sans référentiel n'est pas une matière absente"
    assert _ligne(body, "espagnol")["has_referentiel"] is False
    assert _ligne(body, "mathematiques")["has_referentiel"] is True


# --- Verrou 3 : `notions.total == 0` n'est PAS « pas de référentiel » -----------------------------


def test_referentiel_vide_et_absence_de_referentiel_sont_DEUX_etats(client_db) -> None:
    """Une matière peut avoir ses chapitres sans qu'aucune notion y soit rattachée.

    Confondre les deux ferait écrire « référentiel non généré » sur un référentiel qui existe mais
    reste vide — et enverrait Papa générer un programme qu'il a déjà."""
    client, TestSession = client_db
    vide = _matiere(TestSession, name="Physique", slug="physique")
    _referentiel(TestSession, subject_id=vide, avec_chapitre=True)  # chapitre, aucune notion
    orpheline = _matiere(TestSession, name="Espagnol", slug="espagnol")
    _referentiel(TestSession, subject_id=orpheline, avec_chapitre=False)  # rattachée, sans chapitre
    _as_papa()

    body = client.get(ROUTE).json()

    avec_chapitre = _ligne(body, "physique")
    assert avec_chapitre["has_referentiel"] is True
    assert avec_chapitre["notions"]["total"] == 0, "un référentiel peut exister et être vide"

    sans_chapitre = _ligne(body, "espagnol")
    assert sans_chapitre["has_referentiel"] is False
    assert sans_chapitre["notions"]["total"] == 0
    # Les deux ont `total == 0` et pourtant NE SE LISENT PAS pareil : c'est tout l'invariant.
    assert avec_chapitre["has_referentiel"] != sans_chapitre["has_referentiel"]


# --- Verrou 4 : les statuts viennent de `projections`, non rejoués --------------------------------


def test_la_repartition_est_celle_de_l_agregat_du_dashboard(client_db) -> None:
    """LE verrou du chantier : les deux écrans reliés par un lien comptent la MÊME chose.

    Rejouer les ensembles de statuts à la main ici — même « correctement » — ferait deux vérités
    qui divergeraient au premier statut ajouté à `projections`."""
    client, TestSession = client_db
    _notions(
        TestSession, statuses=["mastered", "weak", "solid", "solid"], extra_skills=2
    )
    _as_papa()

    progression = _ligne(client.get(ROUTE).json(), "mathematiques")
    dashboard = next(
        s
        for s in client.get("/api/parent/dashboard").json()["subjects"]
        if s["slug"] == "mathematiques"
    )

    # Anti-vacuité : une répartition toute à zéro serait égale des deux côtés sans rien prouver.
    assert progression["notions"]["consolidated"] > 0
    assert progression["notions"]["fragile"] > 0
    assert progression["notions"]["in_progress"] > 0
    assert progression["notions"] == dashboard["notions"]
    assert progression["has_referentiel"] == dashboard["has_referentiel"]


def test_les_statuts_ne_sont_pas_reecrits_a_la_main(client_db) -> None:
    """Un statut INCONNU tombe dans « en cours » — la règle de `notions_breakdown`, pas la nôtre.

    « Mieux vaut une notion mal rangée qu'une notion invisible » : une notion perdue en route
    creuserait l'écart entre `engaged` et ce que la matière contient vraiment."""
    client, TestSession = client_db
    _notions(TestSession, statuses=["mastered", "statut_inedit"])
    _as_papa()

    ligne = _ligne(client.get(ROUTE).json(), "mathematiques")

    assert "statut_inedit" not in p.CONSOLIDATED_STATUSES | set(p.FRAGILE_STATUSES)
    assert ligne["notions"]["in_progress"] == 1, "le statut inconnu est rangé, jamais perdu"
    assert ligne["engaged"] == 2


# --- Les deux colonnes qui viennent d'ailleurs ---------------------------------------------------


def test_fragiles_et_lacunes_ouvertes_restent_DEUX_populations(client_db) -> None:
    """La colonne « À renforcer » lit `notions.fragile` ; `gaps_open` compte autre chose.

    Les fondre serait le bug de juillet à l'envers : un constat annonce les FRAGILES, sa preuve
    montrerait les LACUNES. Sur la base réelle, Français porte 8 fragiles et 1 lacune ouverte —
    les deux nombres doivent pouvoir diverger dans la même charge utile."""
    client, TestSession = client_db
    maths, skill_ids = _notions(TestSession, statuses=["weak", "weak", "weak"])
    with TestSession() as db:
        student = db.query(m.StudentProfile).first()
        # UNE seule lacune, pour TROIS notions fragiles : l'écart est le sujet du test.
        db.add(
            m.Gap(
                student_id=student.id,
                skill_id=skill_ids[0],
                subject_id=maths,
                severity="high",
                status="open",
            )
        )
        db.commit()
    _as_papa()

    ligne = _ligne(client.get(ROUTE).json(), "mathematiques")

    assert ligne["notions"]["fragile"] == 3
    assert ligne["gaps_open"] == 1
    assert ligne["notions"]["fragile"] != ligne["gaps_open"], (
        "deux champs, deux mesures — jamais l'un pour l'autre"
    )


def test_les_lacunes_sont_comptees_COMME_la_page_lacunes(client_db) -> None:
    """`gaps_open` doit égaler ce que `/progress/gaps` sert pour la matière — sa cible de clic."""
    client, TestSession = client_db
    maths, skill_ids = _notions(TestSession, statuses=["weak", "weak"])
    with TestSession() as db:
        student = db.query(m.StudentProfile).first()
        for skill_id in skill_ids:  # PAS `db.query(m.Skill).all()` : la notion du conftest
            # en ferait une troisième, et le test compterait autre chose que ce qu'il pose.
            db.add(
                m.Gap(
                    student_id=student.id,
                    skill_id=skill_id,
                    subject_id=maths,
                    severity="high",
                    status="open",
                )
            )
        db.commit()
    _as_papa()

    ligne = _ligne(client.get(ROUTE).json(), "mathematiques")
    lacunes = [
        g for g in client.get("/api/parent/progress/gaps").json()
        if g["subject_slug"] == "mathematiques"
    ]

    assert ligne["gaps_open"] == len(lacunes) == 2


def test_le_xp_par_matiere_est_celui_du_grand_livre(client_db) -> None:
    """Le XP revient sur Progression (ADR-0028 §5) — cumulé, sans fenêtre, jamais recalculé."""
    from datetime import datetime, timedelta, timezone

    client, TestSession = client_db
    maths, _ = _notions(TestSession, statuses=["weak"])
    autre = _matiere(TestSession, name="Français", slug="francais")
    with TestSession() as db:
        student = db.query(m.StudentProfile).first()
        now = datetime.now(timezone.utc)
        db.add_all(
            [
                # 400 jours : au-delà de toute fenêtre du dépôt. Un stock ne s'oublie pas.
                m.XPEvent(student_id=student.id, subject_id=maths, amount=30,
                          reason="mission_remediation", created_at=now - timedelta(days=400)),
                m.XPEvent(student_id=student.id, subject_id=maths, amount=12,
                          reason="mission_remediation", created_at=now),
            ]
        )
        db.commit()
    _as_papa()

    body = client.get(ROUTE).json()

    assert _ligne(body, "mathematiques")["xp"] == 42
    assert _ligne(body, "francais")["xp"] == 0, "une matière sans XP rend 0, pas l'absence"
    assert autre  # la matière existe bien : la ligne au-dessus teste un zéro, pas un trou


# --- Le dépliage d'une ligne recompose ses nombres (addendum ADR-0038 §2) -------------------------
#
# Le chantier a fermé le motif « un constat annonce N, sa preuve en montre un autre » ENTRE les
# écrans. Ces tests le ferment À L'INTÉRIEUR d'une ligne : ce que le dépliage nomme doit valoir
# exactement ce que la ligne compte, sur les quatre colonnes.

ANALYSE = "/api/parent/progress/subjects/{}/analysis"


def test_les_notions_engagees_recomposent_la_barre(client_db) -> None:
    """LE verrou du dépliage : la liste nommée vaut le numérateur, et liste + reste vaut le total."""
    client, TestSession = client_db
    maths, _ = _notions(
        TestSession,
        statuses=["mastered", "weak", "weak", "solid", "solid"],
        extra_skills=3,
    )
    _as_papa()

    ligne = _ligne(client.get(ROUTE).json(), "mathematiques")
    detail = client.get(ANALYSE.format(maths)).json()

    # Anti-vacuité : les trois segments sont peuplés ET des notions restent non abordées. Des
    # listes vides recomposeraient n'importe quoi.
    assert len(detail["engaged"]) > 0 and len(detail["not_started"]) > 0
    assert {n["segment"] for n in detail["engaged"]} == {"consolidated", "fragile", "in_progress"}

    assert len(detail["engaged"]) == ligne["engaged"]
    assert len(detail["engaged"]) + len(detail["not_started"]) == ligne["notions"]["total"]


def test_chaque_segment_nomme_vaut_son_compteur(client_db) -> None:
    """Consolidées, fragiles et en cours : trois listes, trois nombres, aucun décalage."""
    client, TestSession = client_db
    maths, _ = _notions(
        TestSession, statuses=["mastered", "mastered", "weak", "solid"], extra_skills=1
    )
    _as_papa()

    n = _ligne(client.get(ROUTE).json(), "mathematiques")["notions"]
    engaged = client.get(ANALYSE.format(maths)).json()["engaged"]

    for segment, attendu in (
        ("consolidated", n["consolidated"]),
        ("fragile", n["fragile"]),
        ("in_progress", n["in_progress"]),
    ):
        assert sum(1 for x in engaged if x["segment"] == segment) == attendu, segment


def test_un_statut_inconnu_est_range_jamais_perdu(client_db) -> None:
    """La règle est celle de `notions_breakdown`, pas la nôtre : mieux vaut mal rangé qu'invisible.

    Une notion perdue en route creuserait l'écart entre la liste et le nombre — donc referait le
    défaut que ce dépliage existe pour fermer."""
    client, TestSession = client_db
    maths, _ = _notions(TestSession, statuses=["mastered", "statut_inedit"])
    _as_papa()

    ligne = _ligne(client.get(ROUTE).json(), "mathematiques")
    detail = client.get(ANALYSE.format(maths)).json()

    inedit = [n for n in detail["engaged"] if n["mastery_status"] == "statut_inedit"]
    assert len(inedit) == 1, "le statut inconnu doit être PRÉSENT"
    assert inedit[0]["segment"] == "in_progress"
    assert len(detail["engaged"]) == ligne["engaged"]


def test_le_xp_par_motif_recompose_le_xp_de_la_ligne(client_db) -> None:
    """⚠️ Par MOTIF, jamais par notion : `XPEvent` n'a pas de `skill_id` (addendum §3)."""
    from datetime import datetime, timedelta, timezone

    client, TestSession = client_db
    maths, _ = _notions(TestSession, statuses=["weak"])
    with TestSession() as db:
        student = db.query(m.StudentProfile).first()
        now = datetime.now(timezone.utc)
        for reason, amount, days_ago in (
            ("mission_remediation", 20, 0),
            ("mission_remediation", 20, 400),  # au-delà de toute fenêtre : un stock ne s'oublie pas
            ("quiz", 30, 3),
        ):
            db.add(
                m.XPEvent(
                    student_id=student.id,
                    subject_id=maths,
                    amount=amount,
                    reason=reason,
                    created_at=now - timedelta(days=days_ago),
                )
            )
        db.commit()
    _as_papa()

    ligne = _ligne(client.get(ROUTE).json(), "mathematiques")
    motifs = client.get(ANALYSE.format(maths)).json()["xp_by_reason"]

    # Anti-vacuité : deux motifs distincts, et le plus fourni d'abord.
    assert [x["reason"] for x in motifs] == ["mission_remediation", "quiz"]
    assert next(x for x in motifs if x["reason"] == "mission_remediation")["count"] == 2
    assert sum(x["amount"] for x in motifs) == ligne["xp"] == 70


def test_une_matiere_sans_xp_ne_rend_aucun_motif(client_db) -> None:
    """Zéro motif, pas un motif à zéro : on n'invente pas une ligne pour dire « rien »."""
    client, TestSession = client_db
    maths, _ = _notions(TestSession, statuses=["weak"])
    _as_papa()

    assert client.get(ANALYSE.format(maths)).json()["xp_by_reason"] == []
