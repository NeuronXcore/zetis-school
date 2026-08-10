"""« Quelle est LA leçon de cette notion ? » — une seule réponse pour tout le dépôt (ADR-0037).

`lesson_skills` est une liaison **n-n** : une notion peut être portée par plusieurs leçons, et
c'est un état légitime (un référentiel qui évolue, une notion transversale). Trois modules
répondaient différemment à la question, et **aucun ne répondait comme les autres** :

| Module | Ordre | Filtres |
|---|---|---|
| `production` | `Lesson.id DESC` | `status != 'archived'` — **aucun filtre d'année** |
| `galaxy` | max `(updated_at, id)` | `validated` + chapitre validé + année active |
| `ai.canonical_context` | `updated_at DESC` | `validated` + cours rédigé |

## Pourquoi c'est grave, et pas seulement inélégant

Le cas **observé** le 2026-08-03 est bruyant : la production s'est bloquée (« Cours à valider »)
sur une notion dont Massimo consultait le cours — deux leçons validées, l'une avec cours, l'autre
sans, et les deux modules n'ont pas retenu la même.

**Le cas symétrique est SILENCIEUX, et c'est lui qui justifie ce module** : produire une fiche sur
la leçon que la galaxie n'oriente pas la rend **atteignable par personne**. Aucune erreur, aucun
événement de journal, aucun test rouge — du temps GPU payé, du contenu validé, et invisible. Même
famille que la porte ouverte sur du vide du 2026-07-30, dont l'addendum ADR-0024 avait tiré
« un seul prédicat de disponibilité dans le dépôt ».

## Ce que ce module partage — et ce qu'il ne partage PAS

Il porte **l'ORDRE et le PÉRIMÈTRE**, qui n'ont aucune raison de différer d'un appelant à l'autre.

Il ne porte **aucun filtre de statut de leçon**, et c'est le cœur de la décision : c'est là que les
appelants diffèrent **légitimement**. Imposer le `validated` de la galaxie à la production
**supprimerait le palier 3** — celui où `equip_notion` a précisément le droit de rédiger puis de
valider le cours d'un brouillon. Chaque appelant garde donc son gate, appliqué sur la liste rendue.

## Deux propriétés qui sont des décisions, pas des détails

**1. Par LOT d'abord.** `resolve_panoply` promet *« un nombre de requêtes constant, indépendant du
nombre de notions »* — c'est ce qui rend la page matière tenable sur une matière entière. Un
résolveur mono-notion l'aurait fait passer à N requêtes.

**2. Pas d'année active → du VIDE, jamais une exception.** `curriculum._active_year_or_404` porte
son comportement dans son nom, et un 404 remonté depuis un job RQ ne part vers personne
(ADR-0035). Ici on rend `{}` ; l'appelant décide si c'est un 404, un blocage journalisé, ou rien.
"""

from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Chapter, Lesson, LessonSkill, SchoolYear, SchoolYearSubject


def active_year(db: Session) -> SchoolYear | None:
    """L'année scolaire active, ou `None`. **Ne lève jamais.**

    ⚠️ **Sept copies privées de cette question existent** dans le dépôt (`curriculum`, `mindmaps`,
    `missions`, `dashboard`, `fiches`, `quizzes`, `production.coverage`), dont certaines scopées
    par élève et d'autres non. Les unifier n'est **pas** ce chantier — leurs signatures diffèrent
    pour de vraies raisons. Celle-ci est publique pour offrir une destination à qui voudra
    converger, pas pour créer une huitième divergence en silence.
    """
    return db.scalars(
        select(SchoolYear).where(SchoolYear.status == "active").order_by(SchoolYear.id.desc())
    ).first()


def lessons_by_skill(db: Session, skill_ids: Sequence[int]) -> dict[int, list[Lesson]]:
    """Les leçons de chaque notion, de la plus récemment TOUCHÉE à la plus ancienne.

    **UNE requête**, quel que soit le nombre de notions — la propriété que `resolve_panoply`
    promet et sur laquelle repose la page matière.

    Périmètre : **année active**, chapitre `validated`, leçon non archivée. Le statut de la leçon
    n'est **pas** filtré ici (voir l'en-tête du module) : un brouillon est rendu, et c'est
    l'appelant qui décide s'il l'accepte.

    Ordre : `(updated_at, id)` décroissant — « la dernière touchée », pas « la dernière créée ».
    ⚠️ C'est un changement pour la production, qui triait par `id`. Assumé : la galaxie est la
    surface que Massimo voit, et produire ailleurs qu'où il est orienté produit dans le vide.

    Une notion absente du résultat n'a **aucune** leçon exploitable — orpheline, ou rattachée
    seulement à des leçons hors de l'année active. Les deux cas se lisent pareil ici ; c'est
    l'appelant qui sait quoi en dire.
    """
    ids = [skill_id for skill_id in skill_ids if skill_id is not None]
    if not ids:
        return {}
    year = active_year(db)
    if year is None:
        # Pas d'année active : rien n'est atteignable, donc rien n'est équipable. On le RÉPOND,
        # on ne le lève pas — un job de fond n'a personne à qui remonter un code de statut.
        return {}

    rows = db.execute(
        select(LessonSkill.skill_id, Lesson)
        .join(Lesson, Lesson.id == LessonSkill.lesson_id)
        .join(Chapter, Chapter.id == Lesson.chapter_id)
        .join(SchoolYearSubject, SchoolYearSubject.id == Chapter.school_year_subject_id)
        .where(
            LessonSkill.skill_id.in_(ids),
            SchoolYearSubject.school_year_id == year.id,
            Chapter.validation_status == "validated",
            Lesson.status != "archived",
        )
    ).all()

    out: dict[int, list[Lesson]] = {}
    for skill_id, lesson in rows:
        out.setdefault(skill_id, []).append(lesson)
    for lecons in out.values():
        # Tri en Python, sur des listes courtes (une notion a une ou deux leçons) : le faire en SQL
        # obligerait à un `DISTINCT ON` par notion, illisible pour un gain nul à cette taille.
        lecons.sort(key=lambda l: (l.updated_at, l.id), reverse=True)
    return out


def lessons_of_skill(db: Session, skill_id: int) -> list[Lesson]:
    """Raccourci mono-notion. Même règle, exactement — c'est `lessons_by_skill` qui décide."""
    return lessons_by_skill(db, [skill_id]).get(skill_id, [])


def ordered_chapter_skill_ids(db: Session, chapter_id: int) -> list[int]:
    """« Quelles notions ce chapitre enseigne-t-il ? » — sans doublon, en ordre curriculum.

    Le sens INVERSE des fonctions ci-dessus : de la leçon vers la notion, à partir d'un chapitre.
    Deux appelants aujourd'hui, et ils doivent répondre pareil :

    - `missions.command.resolve_chapter_notions` (ADR-0018) — le preview de notions que Papa décoche ;
    - `memory.service` (ADR-0049) — le scope du deck de révision par chapitre.

    🔴 **Elle vit ICI, et pas dans `missions`, à cause d'un CYCLE d'import** : `missions.service`
    importe déjà `memory.service`, si bien que `memory → missions.command` inverse la couche et
    casse `app.main` (`ImportError: partially initialized module`). Le cycle n'était pas un accident
    mécanique — c'était le découpage qui disait que cette traversée n'appartient pas à `missions`.

    ⚠️ **EXCEPTION ASSUMÉE à la règle de l'en-tête** (*« il ne porte aucun filtre de statut de
    leçon »*). Cette fonction en porte un — `status == 'validated'`. La règle existe parce que
    `production` et `galaxy` diffèrent **légitimement** sur ce gate ; ici les deux appelants
    **s'accordent**, et « quelles notions ce chapitre enseigne » n'a de sens que sur des leçons
    validées. Le paramétrer aujourd'hui serait l'abstraction prématurée que `CLAUDE.md` n°7 écarte.
    **Le jour où un appelant diverge, le paramètre apparaît** — pas avant, et pas en silence.

    ⚠️ **Ce n'est PAS le même ensemble que `memory.generation._target_skill_ids_for_subject`**, qui
    ajoute `Lesson.content_markdown IS NOT NULL`. Les 39 leçons `validated` au contenu vide de la
    base entrent ici et sortent là-bas — voulu des deux côtés : la génération de cartes a besoin
    d'un cours à lire, le scope d'un chapitre non. Pour le deck de révision, le gating réel est le
    filtre de CARTES (`memory.service.chapter_card_conditions`), pas celui-ci.

    Rend `[]` sur un chapitre inexistant, sans leçon validée, ou dont aucune leçon ne porte de
    notion. **Les trois cas se lisent pareil** ; c'est l'appelant qui sait quoi en dire.
    """
    rows = db.execute(
        select(LessonSkill.skill_id)
        .join(Lesson, Lesson.id == LessonSkill.lesson_id)
        .where(Lesson.chapter_id == chapter_id, Lesson.status == "validated")
        .order_by(Lesson.sort_order, LessonSkill.skill_id)
    ).all()
    ordered: list[int] = []
    seen: set[int] = set()
    for (skill_id,) in rows:
        if skill_id not in seen:
            seen.add(skill_id)
            ordered.append(skill_id)
    return ordered
