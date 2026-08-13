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
from sqlalchemy.orm import Session

from app.db.models import Chapter, Fiche, Lesson
from app.modules.fiches.population import (
    AUTHOR_MASSIMO,
    STATUS_DRAFT,
    STATUS_PERSONAL,
    draft_of_student,
)
from app.modules.fiches.schemas import (
    MAX_POINTS_CLES,
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


def _draft_out(db: Session, row: Fiche) -> dict:
    lesson = db.get(Lesson, row.lesson_id)
    ctx = _context(db, lesson) if lesson else {}
    return {
        "id": row.id,
        "lesson_id": row.lesson_id,
        "subject_slug": ctx.get("subject_slug", ""),
        "lesson_title": ctx.get("title", ""),
        "chapter": ctx.get("chapter"),
        "version": row.version,
        "draft": FicheDraft.model_validate(row.spec_json or {}).model_dump(),
    }


# ── Le cycle de vie du brouillon ───────────────────────────────────────────────


def open_or_get_draft(db: Session, *, student_id: int, lesson_id: int) -> dict:
    """Ouvre le brouillon d'une leçon — ou **retrouve** celui qui existe déjà.

    ⚠️ Idempotent par construction : deux ouvertures ne font pas deux brouillons. C'est ce qui
    tient la promesse de l'écran (« tu peux fermer et revenir demain ») même si Massimo ouvre
    l'atelier deux fois de suite, ou depuis deux entrées différentes (la tuile, ou le cours).
    """
    lesson = _lesson_or_404(db, lesson_id)
    existing = db.scalar(select(Fiche).where(draft_of_student(student_id, lesson_id)))
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
    db.commit()
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
    en_cours = db.scalar(select(Fiche).where(draft_of_student(student_id, ancienne.lesson_id)))
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


def review_draft(db: Session, *, draft_id: int, student_id: int) -> dict:
    """« ZETIS, regarde ma fiche » — **en slice 1, des réussites, et rien d'autre.**

    🔴 Pourquoi aucune remarque ici, alors que le périmètre annonçait `recopie` : en mode
    « je choisis », les points-clés **sont** des phrases du cours, mot pour mot, par construction.
    `recopie` flaguerait donc les cinq — ZETIS dirait à Massimo que tout son travail est du
    copiage alors qu'il a fait exactement ce qu'on lui demandait. Le type n'a de sens qu'à partir
    de la première section qui s'ÉCRIT (`essentiel`, slice 2) ; il y arrivera avec elle.

    Les réussites sont **précises et déterministes** — jamais « bravo ! », qui est du bruit. Trois
    sources, dans cet ordre de valeur, et la dernière ne peut pas échouer : ce qu'il a retenu et
    que son cours met en gras ; ce qu'il a retenu et que ZETIS avait retenu aussi ; et le tri
    lui-même, qui est le travail visé.
    """
    row = _mine_or_404(db, draft_id, student_id, statuses=(STATUS_DRAFT,))
    draft = FicheDraft.model_validate(row.spec_json or {})
    choisis = [p for p in draft.points_cles if p.strip()]
    if not choisis:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="Choisis au moins une idée, et je regarde.",
        )

    lesson = db.get(Lesson, row.lesson_id)
    reussites: list[str] = []

    gras = _passages_en_gras(lesson.content_markdown or "") if lesson else []
    for phrase in choisis:
        cible = phrase.lower()
        if any(g and g in cible for g in gras):
            reussites.append(
                f"« {_extrait(phrase)} » — c'est une des idées que ton cours met en gras. "
                "Tu as attrapé une des plus importantes."
            )
            break

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

    if not reussites or len(reussites) < 2:
        # Toujours vraie, donc jamais vide : c'est ce qui tient la borne `min_length=1`.
        reussites.append(
            f"Tu as gardé {len(choisis)} idée{'s' if len(choisis) > 1 else ''} "
            "et laissé les autres de côté. Choisir, c'est exactement le travail."
        )

    return {"reussites": reussites[:2], "remarques": []}


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


def candidates(db: Session, *, draft_id: int, student_id: int, section: str) -> dict:
    """Les 12 phrases parmi lesquelles Massimo choisit, pour la section demandée.

    ⚠️ La slice 1 n'ouvre que `points_cles` : c'est la seule section qui se **choisit**.
    `essentiel` ne peut pas se choisir — c'est une synthèse, par définition absente du cours,
    donc aucune phrase candidate ne peut la porter (§8).
    """
    if section != "points_cles":
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Seule la section « points_cles » se choisit à cette étape.",
        )
    row = _mine_or_404(db, draft_id, student_id, statuses=(STATUS_DRAFT,))
    lesson = _lesson_or_404(db, row.lesson_id)
    if not lesson.content_markdown:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="Ce cours n'est pas encore écrit : il n'y a rien à choisir dedans.",
        )
    phrases = _phrases_du_cours(lesson.content_markdown)[:NB_CANDIDATES]
    return {
        "section": "points_cles",
        "candidates": [{"index": i, "texte": p} for i, p in enumerate(phrases)],
        "slots": MAX_POINTS_CLES,
    }
