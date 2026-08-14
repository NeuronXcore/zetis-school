"""L'atelier — la fiche que Massimo fabrique lui-même (addendum ADR-0015).

Séparé de `service.py`, qui est le service de GÉNÉRATION (LLM, prompt versionné, réparation).
Ici, **aucun modèle n'intervient** : la slice 1 est intégralement déterministe. Ce n'est pas une
simplification provisoire, c'est la règle 7 du §5 — *« ZETIS n'écrit jamais dans la fiche à la
place de Massimo »* : il propose des phrases **tirées du cours**, et le geste de les y mettre est
toujours un clic de Massimo.

Cycle de vie, tel que le §1 bis et le §7 le fixent :

    (rien) ──POST /draft──▶ brouillon ──PATCH──▶ brouillon ──finish──▶ fiche personnelle v1
                               ▲                                              │
                               └──────────── rework (nouvelle version) ◀──────┘

- **rouvrir un brouillon** = reprise EN PLACE, aucune version créée ;
- **rouvrir une fiche finie** = nouvelle version, l'ancienne reste lisible.
"""

import re

from fastapi import HTTPException, status
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import (
    Chapter,
    Fiche,
    Lesson,
    LessonSkill,
    QuizAnswer,
    QuizAttempt,
    QuizQuestion,
    Skill,
    SpacedReviewAttempt,
    SpacedReviewCard,
)
from app.modules.fiches.population import (
    AUTHOR_MASSIMO,
    AUTHOR_ZETIS,
    STATUS_DRAFT,
    STATUS_PERSONAL,
    draft_of_student,
)
from app.modules.memory.population import CARD_TYPE_DEFINITION_PERSO
from app.modules.memory.service import schedule_review
from app.modules.fiches.schemas import (
    MAX_DEFINITIONS,
    MAX_ERREURS,
    MAX_POINTS_CLES,
    MAX_TERME,
    FicheDraft,
    FicheSpec,
)
from app.modules.subjects.resolver import subject_of_lesson

# Combien de phrases on propose au choix. Le rapport 12 → 5 est la pédagogie de la slice :
# assez large pour que choisir soit un vrai tri, assez court pour être balayé du regard.
NB_CANDIDATES = 12

DEFAULT_LEVEL = "4e"

# Bornes de ce qui peut faire une phrase candidate. Trop court = un fragment de titre ; trop long
# = une phrase qui déborderait la ligne de fiche (`_MAX_LIGNE` = 160).
_MIN_CANDIDATE_LEN = 30
_MAX_CANDIDATE_LEN = 160


def _lesson_or_404(db: Session, lesson_id: int) -> Lesson:
    lesson = db.get(Lesson, lesson_id)
    if lesson is None or lesson.status != "validated":
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Leçon introuvable.")
    return lesson


def _mine_or_404(db: Session, fiche_id: int, student_id: int, *, statuses: tuple[str, ...]) -> Fiche:
    """La pièce demandée, si elle est bien à cet élève et dans l'état attendu.

    Le contrôle d'appartenance est ici plutôt que dans la route : une fiche personnelle n'a pas de
    cycle éditorial, donc rien d'autre ne la protège.
    """
    row = db.get(Fiche, fiche_id)
    if (
        row is None
        or row.author != AUTHOR_MASSIMO
        or row.student_id != student_id
        or row.validation_status not in statuses
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Fiche introuvable.")
    return row


def assert_draft_is_mine(db: Session, *, draft_id: int, student_id: int) -> None:
    """404 si ce brouillon n'est pas le sien. Utile aux routes qui ne lisent pas la pièce.

    La dictée en a besoin : elle ne renvoie que du texte, mais elle consomme du calcul local et
    laisse une trace `ai_jobs` — la faire sur le brouillon d'un autre n'aurait aucun sens.
    """
    _mine_or_404(db, draft_id, student_id, statuses=(STATUS_DRAFT,))


def _context(db: Session, lesson: Lesson) -> dict:
    """Le décor de la fiche (titre, matière, niveau, chapitre), résolu une fois."""
    # ⚠️ `subject_of_lesson` prend la LEÇON, pas son id — la forme « id seul » est
    # `subject_id_for_lesson`. Deux résolveurs voisins, deux signatures : payé au premier essai.
    subject = subject_of_lesson(db, lesson)
    chapter = db.get(Chapter, lesson.chapter_id) if lesson.chapter_id else None
    return {
        "title": lesson.title,
        "subject": subject.name if subject else "",
        "subject_slug": subject.slug if subject else "",
        "level": DEFAULT_LEVEL,
        "chapter": chapter.name if chapter else None,
    }


#: Au-delà de ce nombre d'éléments énumérés dans UN point-clé, il y a « une liste à retenir ».
_SEUIL_LISTE = 3


def occasion_mnemonique(points_cles: list[str]) -> bool:
    """Y a-t-il une OCCASION de moyen mnémotechnique ? (addendum ADR-0015 §10)

    🔴 **Déterministe, et c'est le critère qui borne l'ADR-0055** : la règle 7 du §5 fonde tout
    l'atelier sur le déterminisme, et un appel LLM rendrait l'apparition de l'étape **non
    reproductible d'une session à l'autre**.

    Un mnémonique marche sur une **liste ou un ordre arbitraire** ; sur un concept il ne marche
    pas. **Un seul signal : un point-clé qui ÉNUMÈRE** au moins 3 éléments — « qui, que, dont, où ».

    🔴 **Un second signal a existé et il a été RETIRÉ le 2026-08-14 : « au moins 3 points-clés ».**
    Mesuré en base, il répondait vrai sur **27 fiches sur 27** — le prompt demande jusqu'à cinq
    points-clés et le modèle les remplit, donc ce signal ne distinguait **rien**. L'étape ⑥ se
    serait affichée sur « Division de fractions » pour annoncer *« il y a une liste à retenir »*
    là où il n'y a qu'une méthode. C'est exactement l'acronyme forcé que le §10 refuse.

    Avec l'énumération seule : **4 leçons sur 27**, et ce sont les bonnes — les pronoms relatifs,
    les quatre nations, leurs capitales, et une fiche où ZETIS avait déjà écrit « MOULIN » en plein
    milieu d'un point-clé faute d'endroit où le mettre.

    🔴 **On coupe sur la VIRGULE, jamais sur « et ».** Mesuré : ajouter « et » aux séparateurs
    faisait passer de **4 à 7 leçons**, en attrapant des phrases françaises ordinaires — *« Résumer
    **et** reformuler un texte »*, *« Lire **et** comprendre un texte poétique »*. Une conjonction
    n'est pas une énumération ; une virgule répétée, si.

    ⚠️ **Le vide reste le cas fréquent et normal** (§10). Une étape qui n'apparaît pas n'est pas
    un manque.
    """
    lignes = [p.strip() for p in points_cles if p and p.strip()]
    return any(
        len([m for m in re.split(r"[,;]", ligne) if m.strip()]) >= _SEUIL_LISTE
        for ligne in lignes
    )


def _points_cles_de_zetis(db: Session, lesson_id: int) -> list[str]:
    """Les points-clés de la fiche ZETIS validée d'une leçon — vide si elle n'existe pas.

    C'est là que vit l'occasion la plupart du temps : la leçon contient une liste (les pronoms
    relatifs, les conjonctions de coordination), et ZETIS l'a déjà repérée en écrivant sa fiche.
    """
    row = db.scalar(
        select(Fiche)
        .where(
            Fiche.lesson_id == lesson_id,
            Fiche.author == AUTHOR_ZETIS,
            Fiche.validation_status == "validated",
        )
        .order_by(Fiche.id.desc())
    )
    spec = (row.spec_json or {}) if row else {}
    return [str(p) for p in (spec.get("points_cles") or [])]


def _draft_out(db: Session, row: Fiche) -> dict:
    lesson = db.get(Lesson, row.lesson_id)
    ctx = _context(db, lesson) if lesson else {}
    draft = FicheDraft.model_validate(row.spec_json or {}).model_dump()
    return {
        "id": row.id,
        "lesson_id": row.lesson_id,
        "subject_slug": ctx.get("subject_slug", ""),
        "lesson_title": ctx.get("title", ""),
        "chapter": ctx.get("chapter"),
        "version": row.version,
        "draft": draft,
        # Recalculé à CHAQUE sauvegarde — et l'atelier sauvegarde à chaque geste. C'est ce qui
        # fait apparaître l'étape ⑥ pendant qu'il choisit ses points-clés, sans dupliquer la
        # règle côté client (elle resservira au §11, surface Papa, qui n'est pas de ce chantier).
        #
        # 🔴 **DEUX sources, et la première est celle de la LEÇON** (corrigé le 2026-08-14, au
        # doigt sur l'écran). La version initiale ne regardait que le brouillon de Massimo : sur
        # une leçon pleine de listes, l'étape n'apparaissait pas tant qu'il n'avait pas lui-même
        # choisi trois points. **Mesuré : 27 leçons présentent une occasion côté ZETIS, contre 1
        # côté brouillons.** L'occasion est une propriété de la LEÇON — le §10 dit « ZETIS détecte
        # l'occasion », et le §11 la cherche dans les `points_cles` des fiches de ZETIS.
        "mnemonique_occasion": (
            occasion_mnemonique(draft.get("points_cles") or [])
            or occasion_mnemonique(_points_cles_de_zetis(db, row.lesson_id))
        ),
    }


# ── Le cycle de vie du brouillon ───────────────────────────────────────────────


def open_or_get_draft(db: Session, *, student_id: int, lesson_id: int) -> dict:
    """Ouvre le brouillon d'une leçon — ou **retrouve** celui qui existe déjà.

    ⚠️ Idempotent par construction : deux ouvertures ne font pas deux brouillons. C'est ce qui
    tient la promesse de l'écran (« tu peux fermer et revenir demain ») même si Massimo ouvre
    l'atelier deux fois de suite, ou depuis deux entrées différentes (la tuile, ou le cours).
    """
    lesson = _lesson_or_404(db, lesson_id)
    # 🔴 `ORDER BY id` n'est pas cosmétique. Sans lui, `db.scalar` rend une ligne ARBITRAIRE dès
    # qu'il en existe plusieurs — et il en existe : deux ouvertures simultanées (StrictMode monte
    # deux fois en dev, et un double-tap fait pareil en vrai) créent deux brouillons, aucune des
    # deux requêtes ne voyant l'autre. Constaté en base le 2026-08-13 : 4 brouillons pour 2
    # leçons, l'atelier lisant le rempli pendant que la tuile lisait le vide.
    #
    # L'ordre stable fait au moins que **tous les lecteurs voient le même**. La création en double
    # reste possible tant qu'aucun index unique ne l'interdit — dette nommée.
    existing = db.scalar(
        select(Fiche).where(draft_of_student(student_id, lesson_id)).order_by(Fiche.id)
    )
    if existing is not None:
        return _draft_out(db, existing)

    ctx = _context(db, lesson)
    # La version d'un NOUVEAU brouillon suit ses fiches finies : la 1re est v1, celle qui suit
    # une fiche déjà finie est v2 — le §7 veut que l'ancienne reste lisible, pas écrasée.
    deja = db.scalar(
        select(func.count())
        .select_from(Fiche)
        .where(
            Fiche.lesson_id == lesson_id,
            Fiche.author == AUTHOR_MASSIMO,
            Fiche.student_id == student_id,
        )
    )
    row = Fiche(
        lesson_id=lesson_id,
        # Le décor est pré-rempli (il n'est pas le travail de Massimo) ; les SECTIONS sont vides.
        spec_json=FicheDraft(
            title=ctx["title"],
            subject=ctx["subject"],
            level=ctx["level"],
            chapter=ctx["chapter"],
        ).model_dump(),
        validation_status=STATUS_DRAFT,
        author=AUTHOR_MASSIMO,
        student_id=student_id,
        source="manual",
        version=(deja or 0) + 1,
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        # 🔴 L'AUTRE moitié de l'idempotence. L'index unique `uq_fiches_brouillon_par_lecon`
        # interdit désormais le doublon — mais interdire n'est pas gérer : sans ce rattrapage,
        # la seconde des deux ouvertures simultanées rendrait une **500** à Massimo alors qu'il
        # a simplement ouvert son atelier deux fois. On rejoue la lecture : l'autre transaction
        # a gagné, son brouillon est le bon, et il est le sien.
        db.rollback()
        gagnant = db.scalar(
            select(Fiche).where(draft_of_student(student_id, lesson_id)).order_by(Fiche.id)
        )
        if gagnant is None:  # pragma: no cover — l'index a mordu pour une autre raison
            raise
        return _draft_out(db, gagnant)
    db.refresh(row)
    return _draft_out(db, row)


def patch_draft(db: Session, *, draft_id: int, student_id: int, draft: FicheDraft) -> dict:
    """Sauvegarde PARTIELLE — appelée à chaque geste, c'est elle qui rend la reprise possible.

    Remplacement franc du `spec_json` (le client renvoie l'état complet du brouillon), et non une
    fusion champ à champ : une fusion rendrait impossible de VIDER un emplacement, or retirer une
    phrase d'un emplacement est la moitié du geste « je choisis ».
    """
    row = _mine_or_404(db, draft_id, student_id, statuses=(STATUS_DRAFT,))
    row.spec_json = draft.model_dump()
    db.commit()
    db.refresh(row)
    return _draft_out(db, row)


def finish_draft(db: Session, *, draft_id: int, student_id: int) -> dict:
    """`FicheDraft` → `FicheSpec`. **422 si le schéma strict ne passe pas.**

    C'est le moment où la fiche existe. Le 422 n'est pas un échec technique à masquer : il dit
    qu'il manque quelque chose d'obligatoire (un `essentiel`, au minimum), et l'écran doit le
    traduire en langage d'enfant — jamais en erreur de validation.
    """
    row = _mine_or_404(db, draft_id, student_id, statuses=(STATUS_DRAFT,))
    try:
        spec = FicheSpec.model_validate(row.spec_json or {})
    except ValidationError as err:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "message": "Il manque encore quelque chose pour que ta fiche soit finie.",
                "champs": sorted({str(e["loc"][0]) for e in err.errors() if e.get("loc")}),
            },
        ) from err
    row.spec_json = spec.model_dump()
    row.validation_status = STATUS_PERSONAL
    db.commit()
    db.refresh(row)
    return _draft_out(db, row)


def rework(db: Session, *, fiche_id: int, student_id: int) -> dict:
    """Rouvrir une fiche FINIE : nouvelle version, l'ancienne reste lisible (§7).

    ⚠️ Asymétrie voulue avec `open_or_get_draft` : un brouillon se reprend EN PLACE (aucune
    version), une fiche finie se **retravaille** (nouvelle version). La trajectoire dans le temps
    — longue et recopiée → courte et dans ses mots — est le seul endroit du produit qui montre
    « sait-il ce qui compte » plutôt que « sait-il répondre ». L'écraser la détruirait.
    """
    ancienne = _mine_or_404(db, fiche_id, student_id, statuses=(STATUS_PERSONAL,))
    en_cours = db.scalar(
        select(Fiche)
        .where(draft_of_student(student_id, ancienne.lesson_id))
        .order_by(Fiche.id)  # même raison qu'`open_or_get_draft` : un ordre stable
    )
    if en_cours is not None:
        # Il retravaillait déjà : on ne fabrique pas une seconde version en parallèle.
        return _draft_out(db, en_cours)

    nouvelle = Fiche(
        lesson_id=ancienne.lesson_id,
        spec_json=dict(ancienne.spec_json or {}),  # elle repart de ce qu'il avait écrit
        validation_status=STATUS_DRAFT,
        author=AUTHOR_MASSIMO,
        student_id=student_id,
        source="manual",
        version=ancienne.version + 1,
    )
    db.add(nouvelle)
    db.commit()
    db.refresh(nouvelle)
    return _draft_out(db, nouvelle)


# ── Les phrases candidates — tirées du cours, jamais écrites par ZETIS ──────────


# Phrases qui S'ADRESSENT à l'élève ou qui annoncent la suite. Elles sont vraies — ce ne sont
# simplement pas des idées à retenir, et les proposer revient à faire trier l'introduction du
# cours. Relevé à l'écran le 2026-08-13 : cinq des douze candidates d'une vraie leçon étaient de
# ce type, et les définitions n'entraient qu'en position 10 à 12.
_DEBUTS_DISCOURS = (
    "aujourd'hui", "imagine", "tu ", "vous ", "on va", "nous allons", "maintenant", "regarde",
    "essaie", "à toi", "c'est là que", "commençons", "voyons", "retiens", "par exemple",
    "exemple", "prenons", "dans ce cours", "dans cette leçon",
)
_MARQUEURS_DISCOURS = (
    "on va apprendre", "tu connais", "tu vas", "tu dois", "tu as", "à ton tour", "nous verrons",
)
# En dessous, le filtre a trop mordu (cours court, ou très narratif) : mieux vaut des candidates
# imparfaites qu'un atelier vide. On repart alors du texte non filtré.
_MIN_CANDIDATES_UTILES = 5


def _est_du_discours(phrase: str) -> bool:
    p = phrase.lower()
    if p.startswith(_DEBUTS_DISCOURS) or any(m in p for m in _MARQUEURS_DISCOURS):
        return True
    # « Phrase simple : « Je suis en retard. » » — une illustration annoncée par deux-points,
    # pas un énoncé. C'est l'exemple, pas l'idée.
    if re.search(r":\s*«", phrase):
        return True
    # Une phrase ENTIÈREMENT entre guillemets est l'exemple lui-même — « Le vent soufflait, les
    # arbres dansaient. » n'est pas une idée à retenir, c'est ce sur quoi l'idée porte. Vu à
    # l'écran le 2026-08-13, après la première passe de filtrage.
    return phrase.startswith("«") and phrase.rstrip().endswith("»")


def _decouper_en_phrases(texte: str) -> list[str]:
    """Coupe sur la ponctuation finale, **jamais à l'intérieur d'une citation `« … »`**.

    🔴 Le naïf `(?<=[.!?])\\s+` coupait sur le point INTERNE d'une citation française et rendait
    « Phrase simple : « Je suis en retard. » » en deux morceaux : une phrase tronquée sans son
    guillemet fermant, et un fragment commençant par un `»` orphelin. Vu à l'écran le
    2026-08-13 — et invisible à mes tests, dont le cours d'exemple n'avait aucun guillemet.
    """
    phrases, courant, dans_citation = [], [], False

    def _fin_de_phrase(i: int) -> bool:
        return i + 1 >= len(texte) or texte[i + 1].isspace()

    for i, c in enumerate(texte):
        courant.append(c)
        if c == "«":
            dans_citation = True
        elif c == "»":
            dans_citation = False
            # ⚠️ Sinon la phrase ne se ferme JAMAIS : dans « Je suis en retard. », la ponctuation
            # finale est DANS la citation, donc c'est le guillemet fermant qui termine. Sans ce
            # cas, trois phrases restaient collées en un bloc de 187 caractères, écarté par la
            # borne de longueur — et l'idée qui suivait disparaissait avec lui.
            if "".join(courant[:-1]).rstrip().endswith((".", "!", "?")) and _fin_de_phrase(i):
                phrases.append("".join(courant))
                courant = []
        elif c in ".!?" and not dans_citation and _fin_de_phrase(i):
            phrases.append("".join(courant))
            courant = []
    if courant:
        phrases.append("".join(courant))
    return phrases


def _phrases_du_cours(markdown: str) -> list[str]:
    """Découpe le cours en phrases utilisables comme candidates. **Déterministe.**

    Volontairement sans LLM : ces phrases sont l'objet du travail de Massimo, et la règle 7
    interdit à ZETIS de les écrire. Les tirer du cours mot pour mot est donc le contrat, pas un
    raccourci — et ça rend la liste **stable d'une session à l'autre**, ce dont la reprise a
    besoin (les emplacements retenus renvoient à des index).
    """
    sans_titres = re.sub(r"^#{1,6}\s+.*$", "", markdown, flags=re.MULTILINE)
    sans_code = re.sub(r"```.*?```", "", sans_titres, flags=re.DOTALL)
    # ⚠️ Les marques d'emphase se RETIRENT, elles ne se remplacent pas par une espace : `**mot**.`
    # donnait « mot . », et toutes les phrases dont le cours met la fin en gras sortaient avec
    # cette cicatrice. Les autres marques, elles, séparent bien deux mots → espace.
    sans_emphase = re.sub(r"[*_`]", "", sans_code)
    nettoye = re.sub(r"[>\[\]()]|^\s*[-–•]\s*", " ", sans_emphase, flags=re.MULTILINE)

    brutes: list[str] = []
    for paragraphe in re.split(r"\n{2,}", nettoye):
        brutes.extend(_decouper_en_phrases(paragraphe))

    retenues: list[str] = []
    ecartees: list[str] = []
    vues: set[str] = set()
    for brut in brutes:
        phrase = " ".join(brut.split())
        # Espace avant `.` ou `,` : jamais correct en français. On ne touche PAS à `; : ! ? »`,
        # qui en prennent une légitimement.
        phrase = re.sub(r"\s+([.,])", r"\1", phrase)
        if not (_MIN_CANDIDATE_LEN <= len(phrase) <= _MAX_CANDIDATE_LEN):
            continue
        cle = phrase.lower()
        if cle in vues:
            continue
        vues.add(cle)
        (ecartees if _est_du_discours(phrase) else retenues).append(phrase)

    if len(retenues) < _MIN_CANDIDATES_UTILES:
        return retenues + ecartees
    return retenues


def _passages_en_gras(markdown: str) -> list[str]:
    """Ce que le cours lui-même met en avant — `**gras**`. Déterministe, et c'est le point."""
    return [" ".join(m.split()).lower() for m in re.findall(r"\*\*(.+?)\*\*", markdown)]


def _mots_normalises(texte: str) -> list[str]:
    """Mots en minuscules, sans ponctuation — la forme sur laquelle on compare."""
    return re.findall(r"\w+", texte.lower())


# Longueur de la suite de mots qui fait la preuve. Huit est un choix mesuré : en dessous, une
# tournure banale (« il y a plusieurs types de ») suffirait à accuser Massimo de recopier ; au
# dessus, une phrase reprise mais légèrement raccourcie passerait entre les mailles.
_NGRAMME = 8


def _passage_recopie(texte: str, cours: str) -> str | None:
    """Le passage de `texte` repris MOT POUR MOT du cours, ou `None`. **Déterministe, 0 faux positif.**

    C'est le signal le plus important pédagogiquement — la phrase recopiée est le mode d'échec du
    résumé non entraîné — et c'est aussi le moins cher : ni LLM, ni jugement. On ne dit jamais
    « c'est faux », on dit « ces mots viennent de ton cours ». C'est **vérifiable**.

    ⚠️ Ne s'applique QU'AUX sections qui s'ÉCRIVENT. Sur `points_cles`, où Massimo **choisit**
    des phrases du cours, il flaguerait les cinq — et lui dirait que tout son travail est du
    copiage alors qu'il a fait exactement ce qu'on lui demandait.
    """
    # ⚠️ On compare sur la forme normalisée, mais on RENVOIE le texte d'origine. Vu à l'écran le
    # 2026-08-13 : citer la forme normalisée renvoyait à Massimo sa propre phrase en minuscules et
    # sans ponctuation — « …une proposition est un groupe de mots qui… ». Il doit se reconnaître
    # dans ce que ZETIS lui cite, sinon la remarque parle de quelqu'un d'autre.
    positions = list(re.finditer(r"\w+", texte))
    if len(positions) < _NGRAMME:
        return None
    reference = " ".join(_mots_normalises(cours))
    for i in range(len(positions) - _NGRAMME + 1):
        fenetre = positions[i : i + _NGRAMME]
        suite = " ".join(m.group(0).lower() for m in fenetre)
        if suite in reference:
            return texte[fenetre[0].start() : fenetre[-1].end()]
    return None


def review_draft(db: Session, *, draft_id: int, student_id: int) -> dict:
    """« ZETIS, regarde ma fiche » — réussites d'abord, puis 2 remarques au maximum.

    **Jamais pendant la frappe** : cette fonction ne tourne que sur demande. Un correcteur qui
    commente chaque phrase au moment où elle sort est un évaluateur par-dessus l'épaule — l'enfant
    cesse d'écrire, ou écrit pour plaire (§6).

    Composition, et l'ordre compte : **une réussite d'abord, toujours** (règle 2 du §5 — le
    compliment générique est du bruit, le précis est une information), puis **0 à 2 remarques**.
    Sept remarques ne sont pas de l'aide, c'est un bulletin — et un enfant abandonne.
    """
    row = _mine_or_404(db, draft_id, student_id, statuses=(STATUS_DRAFT,))
    draft = FicheDraft.model_validate(row.spec_json or {})
    choisis = [p for p in draft.points_cles if p.strip()]
    essentiel = (draft.essentiel or "").strip()
    definitions = [d for d in draft.definitions if (d.definition or "").strip()]

    if not (choisis or essentiel or definitions):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="Commence par quelque chose — une idée, une phrase — et je regarde.",
        )

    lesson = db.get(Lesson, row.lesson_id)
    cours = (lesson.content_markdown or "") if lesson else ""
    reussites: list[str] = []
    remarques: list[dict] = []

    # ── Les réussites, par ordre de valeur ──────────────────────────────────────
    gras = _passages_en_gras(cours)
    for phrase in choisis:
        cible = phrase.lower()
        if any(g and g in cible for g in gras):
            reussites.append(
                f"« {_extrait(phrase)} » — c'est une des idées que ton cours met en gras. "
                "Tu as attrapé une des plus importantes."
            )
            break

    if essentiel and not _passage_recopie(essentiel, cours):
        # Écrire l'essentiel AVEC SES MOTS est l'acte le plus difficile des six : il ne se
        # trouve nulle part dans le cours, il faut le fabriquer. Le nommer quand il est réussi.
        reussites.append(
            "Ton essentiel est écrit avec tes mots — c'est la partie la plus dure, "
            "et tu l'as faite."
        )

    if len(reussites) < 2:
        zetis = db.scalar(
            select(Fiche)
            .where(
                Fiche.lesson_id == row.lesson_id,
                Fiche.author == "zetis",
                Fiche.validation_status == "validated",
            )
            .order_by(Fiche.id.desc())
        )
        siennes = (zetis.spec_json or {}).get("points_cles", []) if zetis else []
        for phrase in choisis:
            if any(_se_recoupent(phrase, p) for p in siennes):
                reussites.append(
                    f"« {_extrait(phrase)} » — moi aussi je l'avais gardée. On est d'accord."
                )
                break

    if not reussites:
        # Toujours vraie, donc jamais vide : c'est ce qui tient la borne `min_length=1`.
        faits = len(choisis) + len(definitions) + (1 if essentiel else 0)
        reussites.append(
            f"Tu as déjà rempli {faits} chose{'s' if faits > 1 else ''} sur ta fiche. "
            "Elle existe, maintenant."
        )

    # ── Les remarques : `recopie` seul, et seulement sur ce qui s'ÉCRIT ─────────
    if essentiel:
        passage = _passage_recopie(essentiel, cours)
        if passage:
            remarques.append(
                {
                    "section": "essentiel",
                    "index": 0,
                    "type": "recopie",
                    "message": (
                        f"« …{_extrait(passage, 70)}… » — ces mots viennent de ton cours, "
                        "mot pour mot."
                    ),
                    "piste": "Tu peux le dire avec les tiens ?",
                }
            )

    for i, d in enumerate(draft.definitions):
        if len(remarques) >= 2:
            break
        texte = (d.definition or "").strip()
        passage = _passage_recopie(texte, cours) if texte else None
        if passage:
            remarques.append(
                {
                    "section": "definitions",
                    "index": i,
                    "type": "recopie",
                    "message": (
                        f"Pour « {d.terme} », tu as repris la phrase du cours mot pour mot."
                    ),
                    "piste": "C'est quoi, avec tes mots à toi ?",
                }
            )

    return {"reussites": reussites[:2], "remarques": remarques[:2]}


def _extrait(phrase: str, largeur: int = 60) -> str:
    """Une citation courte : la réussite doit se lire d'un coup d'œil, pas se relire."""
    phrase = " ".join(phrase.split())
    return phrase if len(phrase) <= largeur else phrase[: largeur - 1].rstrip() + "…"


def _se_recoupent(a: str, b: str, seuil: int = 4) -> bool:
    """Deux phrases parlent-elles de la même chose ? Recouvrement de mots longs, déterministe.

    Volontairement grossier : on l'utilise pour NOMMER un accord, jamais pour juger une erreur.
    Un faux positif produit ici un compliment un peu à côté — pas une injustice.
    """
    mots = lambda s: {m for m in re.findall(r"\w{5,}", s.lower())}  # noqa: E731
    return len(mots(a) & mots(b)) >= seuil


def _termes_de_la_lecon(db: Session, lesson: Lesson) -> list[str]:
    """Les mots que ZETIS propose de définir — **notions d'abord, gras du cours ensuite**.

    Deux sources, dans cet ordre voulu (arbitrage du 2026-08-13) : les **notions** rattachées à la
    leçon sont le référentiel, elles portent le programme ; le **gras du cours** complète, parce
    qu'une leçon n'en porte souvent que deux ou trois alors que la fiche en accepte quatre.

    🔴 **Le bornage se fait ICI, à la source.** `Skill.name` accepte 160 caractères quand
    `FicheDefinition.terme` en accepte 80 : proposer un terme trop long ferait échouer la
    validation **au `finish`**, c'est-à-dire APRÈS que Massimo a écrit sa définition. Le défaut
    serait tardif, invisible pendant tout le travail, et injuste. On écarte à l'entrée.
    """
    notions = list(
        db.scalars(
            select(Skill.name)
            .join(LessonSkill, LessonSkill.skill_id == Skill.id)
            .where(LessonSkill.lesson_id == lesson.id)
            .order_by(Skill.id)
        )
    )
    gras = re.findall(r"\*\*(.+?)\*\*", lesson.content_markdown or "")

    termes: list[str] = []
    vus: set[str] = set()
    for brut in [*notions, *gras]:
        terme = " ".join(brut.split()).strip(" .,:;—-")
        if not terme or len(terme) > MAX_TERME:
            continue
        cle = terme.lower()
        if cle in vus:
            continue
        vus.add(cle)
        termes.append(terme)
        if len(termes) >= MAX_DEFINITIONS:
            break
    return termes


def _erreurs_de_la_lecon(db: Session, lesson: Lesson, student_id: int) -> list[tuple[str, str]]:
    """Les pièges que Massimo a RÉELLEMENT rencontrés sur les notions de cette leçon.

    Deux sources mesurées, additionnées par notion :

    | Source | Ce qui compte comme erreur |
    |---|---|
    | quiz | `QuizAnswer.is_correct is False` sur une question rattachée à la notion |
    | révision espacée | un essai noté **`again`** sur une carte de la notion |

    ⚠️ **Les re-tours de consolidation sont exclus** (`is_consolidation`) : ils veulent dire
    *« cet essai n'a pas mesuré l'oubli »* (ADR-0049), les compter gonflerait le nombre sans
    qu'aucune erreur nouvelle n'ait eu lieu.

    Rendu trié par **nombre d'erreurs décroissant** — ce sur quoi il bute le plus vient en
    premier —, puis par ordre du programme à égalité. Aucune invention : le texte nomme la
    notion, la raison donne le compte. C'est exactement l'exemple du §8 (« tu t'es trompé deux
    fois sur foyer / épicentre, on le met en piège ? »).

    Rend `[]` quand rien n'a été mesuré, et c'est un état LÉGITIME : un enfant qui n'a pas
    encore travaillé cette leçon n'a pas de piège à en tirer. L'écran doit le dire ainsi, et
    surtout pas inventer un piège pour remplir la section.
    """
    notions = db.execute(
        select(Skill.id, Skill.name)
        .join(LessonSkill, LessonSkill.skill_id == Skill.id)
        .where(LessonSkill.lesson_id == lesson.id)
        .order_by(Skill.id)
    ).all()
    if not notions:
        return []
    par_id = {sid: nom for sid, nom in notions}

    ratees: dict[int, int] = {}
    for skill_id, n in db.execute(
        select(QuizQuestion.skill_id, func.count(QuizAnswer.id))
        .join(QuizAnswer, QuizAnswer.question_id == QuizQuestion.id)
        .join(QuizAttempt, QuizAttempt.id == QuizAnswer.attempt_id)
        .where(
            QuizAttempt.student_id == student_id,
            QuizAnswer.is_correct.is_(False),
            QuizQuestion.skill_id.in_(par_id),
        )
        .group_by(QuizQuestion.skill_id)
    ).all():
        ratees[skill_id] = ratees.get(skill_id, 0) + n

    for skill_id, n in db.execute(
        select(SpacedReviewCard.skill_id, func.count(SpacedReviewAttempt.id))
        .join(SpacedReviewAttempt, SpacedReviewAttempt.card_id == SpacedReviewCard.id)
        .where(
            SpacedReviewAttempt.student_id == student_id,
            SpacedReviewAttempt.rating == "again",
            SpacedReviewAttempt.is_consolidation.is_(False),
            SpacedReviewCard.skill_id.in_(par_id),
        )
        .group_by(SpacedReviewCard.skill_id)
    ).all():
        ratees[skill_id] = ratees.get(skill_id, 0) + n

    ordre = {sid: rang for rang, (sid, _) in enumerate(notions)}
    classees = sorted(ratees.items(), key=lambda kv: (-kv[1], ordre[kv[0]]))
    return [
        (
            f"Attention à : {par_id[sid]}",
            "tu t'es trompé une fois là-dessus"
            if n == 1
            else f"tu t'es trompé {n} fois là-dessus",
        )
        for sid, n in classees[:MAX_ERREURS]
    ]


def _amorce_essentiel(titre: str) -> str:
    """Le début de phrase posé dans le champ — règle 1 des champs libres (§9).

    Une zone de saisie vide est ce qui fait recopier le cours : devant la page blanche, un élève
    non entraîné copie. L'amorce ne dit rien du CONTENU — elle enlève seulement le premier pas,
    et c'est pour ça qu'elle ne viole pas la règle 7.

    ⚠️ **On coupe au sous-titre.** Les titres de leçon du référentiel portent très souvent la
    forme « Notion : précisions » — vu à l'écran le 2026-08-13 sur « La phrase complexe :
    juxtaposition et coordination », qui donnait une amorce illisible. Seule la tête du titre est
    un groupe nominal qu'on peut suffixer par « , c'est… ».
    """
    tete = re.split(r"\s*[:—–]\s*", titre.strip(), maxsplit=1)[0].strip()
    return f"{tete or titre.strip()}, c'est…"


def candidates(db: Session, *, draft_id: int, student_id: int, section: str) -> dict:
    """Ce que la section offre pour DÉMARRER — le tableau est dans `FicheCandidatesOut`.

    **Les six sections sont ouvertes** depuis l'ADR-0055 (2026-08-14). Une section non implémentée
    **refuserait explicitement** plutôt que de rendre une liste vide, qui se lirait « il n'y a rien
    ici » — le garde-fou reste, il n'a simplement plus personne à refuser.

    ⚠️ Ce texte annonçait « trois sections ouvertes (slices 1 et 2) » alors que le tuple en portait
    **quatre** depuis la slice 3 : `erreurs_a_eviter` y avait été ajouté sans que la phrase suive.
    Corrigé au read-before-code du 2026-08-14.
    """
    if section not in (
        "points_cles",
        "definitions",
        "essentiel",
        "erreurs_a_eviter",
        "mini_exemple",
        "mnemonique",
    ):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=f"La section « {section} » ne se prépare pas à cette étape.",
        )
    row = _mine_or_404(db, draft_id, student_id, statuses=(STATUS_DRAFT,))
    lesson = _lesson_or_404(db, row.lesson_id)

    if section == "essentiel":
        # Aucune candidate, et ce n'est pas un manque : `essentiel` est une SYNTHÈSE, elle
        # n'existe nulle part dans le cours. C'est la section la plus difficile des six, et la
        # seule aide légitime est de ne pas laisser la page blanche.
        return {
            "section": "essentiel",
            "candidates": [],
            "slots": 1,
            "amorce": _amorce_essentiel(lesson.title),
        }

    if section == "mini_exemple":
        # Même nature qu'`essentiel` : un exemple ne se CHOISIT pas dans le cours, il s'invente.
        # Zéro candidate, et ce n'est pas un manque. L'amorce ne dit rien du contenu — elle
        # enlève seulement le premier pas (règle 1 des champs libres, §9).
        return {
            "section": "mini_exemple",
            "candidates": [],
            "slots": 1,
            "amorce": "Par exemple, ",
        }

    if section == "mnemonique":
        # 🔴 **Ni candidate, ni amorce, et c'est le seul endroit de la fiche où c'est voulu.**
        # Le §10 : *le meilleur moyen mnémotechnique est celui que Massimo invente* — celui d'un
        # autre est une chose de plus à mémoriser. Une amorce orienterait déjà son invention.
        #
        # ⚠️ **La DÉTECTION de l'occasion ne vit pas ici** : elle est calculée côté client sur les
        # points-clés du brouillon, pour que l'étape apparaisse **pendant** qu'il les choisit
        # plutôt qu'à la sauvegarde suivante. Cette route ne décide donc pas de la visibilité de
        # l'étape ; elle répond simplement au lieu de refuser.
        return {"section": "mnemonique", "candidates": [], "slots": 1}

    if section == "erreurs_a_eviter":
        # 🔴 **La seule section que ZETIS peut pré-remplir sans enfreindre la règle 7** (§8) :
        # il ne propose pas une idée, il rappelle **un fait de Massimo**. Un piège ne se rédige
        # pas, ça se constate — et écarter une proposition n'efface aucune mesure : l'erreur
        # reste dans son historique, elle ne va simplement pas sur la fiche.
        #
        # ⚠️ Aucun gate sur le cours : un piège vient de ses ERREURS, pas du texte de la leçon.
        # Refuser ici faute de cours serait un refus sans rapport avec la question posée.
        erreurs = _erreurs_de_la_lecon(db, lesson, student_id)
        return {
            "section": "erreurs_a_eviter",
            "candidates": [
                {"index": i, "texte": texte, "raison": raison}
                for i, (texte, raison) in enumerate(erreurs)
            ],
            "slots": MAX_ERREURS,
        }

    if not lesson.content_markdown:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="Ce cours n'est pas encore écrit : il n'y a rien à choisir dedans.",
        )

    if section == "definitions":
        termes = _termes_de_la_lecon(db, lesson)
        if not termes:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                detail="Je n'ai pas trouvé de mot à définir dans cette leçon.",
            )
        return {
            "section": "definitions",
            "candidates": [{"index": i, "texte": t} for i, t in enumerate(termes)],
            "slots": len(termes),
        }

    phrases = _phrases_du_cours(lesson.content_markdown)[:NB_CANDIDATES]
    return {
        "section": "points_cles",
        "candidates": [{"index": i, "texte": p} for i, p in enumerate(phrases)],
        "slots": MAX_POINTS_CLES,
    }


# --- Le pont : ses définitions deviennent ses cartes (addendum ADR-0015 §13) ---------------
#
# 🔴 **Pourquoi ce sont les DÉFINITIONS et pas les points-clés.** Le périmètre de la slice 1
# prévoyait que « la sélection retenue devient ses cartes SRS ». `definitions` a depuis donné au
# pont sa forme **naturelle** : recto le terme de ZETIS, verso la phrase de Massimo, aucune
# transformation. Un point-clé est une phrase du cours, pas une question — en faire un recto
# demanderait de l'inventer, donc d'écrire à la place de Massimo (règle 7).

# Une carte qui vient d'être écrite se revoit VITE : il a la formulation en tête, le premier
# rappel doit tomber pendant qu'elle est encore fraîche. Le moteur reprend la main ensuite.
INTERVALLE_PREMIERE_CARTE = 1


def _cle_terme(brut: str) -> str:
    """Même normalisation que `_termes_de_la_lecon`, sinon le rapprochement rate en silence."""
    return " ".join(brut.split()).strip(" .,:;—-").lower()


def cartes_depuis_la_fiche(db: Session, *, fiche_id: int, student_id: int) -> dict:
    """« 🃏 En faire des cartes » — une carte `definition_perso` par définition écrite.

    ⚠️ **Seulement depuis une fiche FINIE** (§13 décision 4) : un brouillon n'est pas dérivable,
    une définition à moitié écrite n'a rien à faire dans un circuit de révision.

    🔴 **Toutes les définitions ne peuvent PAS devenir des cartes, et c'est structurel.** Une
    carte exige un `skill_id` (NOT NULL) : elle est accrochée à une **notion**. Or ZETIS propose
    les termes en deux temps — les notions de la leçon **puis le gras du cours** — et un terme
    venu du gras n'a aucune notion derrière lui. Ceux-là ne peuvent pas donner de carte.

    Le compte est donc **rendu au client**, jamais deviné : `cartes` et `termes_sans_notion`.
    Annoncer « 4 cartes » pour en créer 2 serait exactement le défaut que l'`adr-0039` a payé
    sur la file de relecture.

    **Idempotent par construction** : `schedule_review` retrouve la carte par
    `(élève, notion, type)` et la met à jour. Rejouer le geste après avoir corrigé une définition
    met la carte à jour au lieu d'en créer une seconde — et la contrainte `e5f6a7b8c9d4` le
    garantit désormais en base.
    """
    fiche = _mine_or_404(db, fiche_id, student_id, statuses=(STATUS_PERSONAL,))
    definitions = (fiche.spec_json or {}).get("definitions") or []

    notions = {
        _cle_terme(nom): sid
        for sid, nom in db.execute(
            select(Skill.id, Skill.name)
            .join(LessonSkill, LessonSkill.skill_id == Skill.id)
            .where(LessonSkill.lesson_id == fiche.lesson_id)
            .order_by(Skill.id)
        ).all()
    }

    cartes, sans_notion = 0, []
    for definition in definitions:
        terme = str(definition.get("terme") or "")
        texte = str(definition.get("definition") or "")
        skill_id = notions.get(_cle_terme(terme))
        if skill_id is None or not texte:
            sans_notion.append(terme)
            continue
        schedule_review(
            db,
            student_id=student_id,
            skill_id=skill_id,
            interval=INTERVALLE_PREMIERE_CARTE,
            front=terme,
            back=texte,
            card_type=CARD_TYPE_DEFINITION_PERSO,
        )
        cartes += 1
    db.commit()
    return {"cartes": cartes, "termes_sans_notion": sans_notion}
