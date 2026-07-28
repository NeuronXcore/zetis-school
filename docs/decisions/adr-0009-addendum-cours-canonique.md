# Addendum à l'ADR-0009 — Cours validé comme source canonique des dérivés + lien `lesson_skills`

## Statut

Accepté — 2026-07-03. **Complète** l'ADR-0009 (passe 2) sans modifier ses décisions
§1–§10. Purement documentaire : aucune table, aucune migration, aucun code ne découle
de cet addendum tant que la passe 2 (Lot 2 du référentiel) n'est pas ouverte.

> S'appuie sur : `adr-0009` §1–§3 (deux passes, génération dans la hiérarchie existante,
> co-construction par nœud avec `pending → validated`), §6 (ancrage RAG optionnel).
> Ne modifie pas `adr-0004` (embeddings/pgvector inchangés).

## Contexte

La genèse ZETIS a **deux étages**, et le modèle n'en outille qu'un :

1. **Le référentiel (structure)** — chapitres → leçons → notions. C'est l'objet de
   l'ADR-0009. Il dit *quoi* apprendre.
2. **Le cours (contenu)** — `Lesson.content_markdown`, le texte pédagogique lui-même.
   Il dit *ce qu'il y a* à apprendre. Le champ existe dans `DATA_MODEL.md` mais rien
   ne le remplit ni ne le consomme aujourd'hui.

Conséquence sur l'existant : les dérivés (ELI5, capsule, quiz, mindmap, fiches de
révision, cartes SRS) vont **chacun chercher leur contexte de leur côté** — ELI5
s'ancre sur `skill_id` + chunks RAG, le diagnostic génère par notion, la capsule part
d'une `instruction` libre + `chapter_id`. Ça fonctionne, mais deux dérivés d'une même
notion peuvent raconter des choses différentes (vocabulaire, notations, méthode de
résolution), et aucun ne bénéficie de la validation que Papa aurait faite sur un cours.

Il manque le chaînon intermédiaire : un **cours validé** qui serve de contexte commun,
prioritaire, à tous les dérivés — prolongeant la même cascade de confiance
`pending → validated` déjà en place partout.

## Décision

### A. Le cours validé est la source canonique des dérivés

Quand un `Lesson.content_markdown` **validé** existe pour une notion, il devient le
contexte **prioritaire** de tous les dérivés de cette notion — avant les chunks RAG
bruts, avant la connaissance interne du modèle.

Cascade de dégradation gracieuse (identique en esprit à l'ADR-0009 §6) :

```txt
cours validé  →  RAG seul (BO, sources Papa)  →  connaissance du modèle
```

Les deux derniers crans existent déjà (couture `retrieve_for_skill` d'ELI5) ; cet
addendum ajoute le premier. Même porte partout : un cours que Papa repasse en édition
(`status != validated`) **cesse immédiatement** d'alimenter les dérivés, sans mécanisme
supplémentaire — le filtre de statut suffit.

> **Deux précisions apportées le 2026-07-28.**
>
> **1. Le gate vaut à la naissance, pas dans la durée (addendum ADR-0011 §E).** Ce §A garantit
> qu'un dérivé *naît* d'un cours validé. Il ne dit rien de la suite : régénérer un cours
> repasse la leçon en `draft`, mais les dérivés déjà `validated` **restent servis** dans leur
> version obsolète. La notion de **dérivé périmé** (`is_stale`, colonne
> `lessons.content_updated_at`) comble ce trou — signalée à Papa, jamais déclassée
> automatiquement, et utilisée comme **prédicat d'orchestration** par l'équipement (ADR-0021 §5
> corrigé : « déjà validé *et frais* »).
>
> **2. Exception — mission engagée (chantier « invariants de lecture des dérivés »).** Une
> ressource référencée par le `resource_id` d'une étape d'une **mission active** de Massimo
> reste servable jusqu'à la fin de cette mission, même si sa leçon repasse en `draft`. Le gate
> porte sur la **découverte**, jamais sur l'**achèvement d'un parcours engagé** : sans cette
> exception, une régénération de cours par Papa bloque une mission en cours et empêche son
> verdict d'être calculé. L'exception est nommée et testée côté serveur.

**Contrainte de design portée en avant** : tout prompt de dérivé écrit à partir de
maintenant doit prévoir une section « cours validé » distincte de la section « extraits
RAG », avec la règle explicite *le cours fait foi* (vocabulaire, notations, méthode).
C'est ce qui garantit qu'ELI5, capsule et quiz d'une même leçon restent cohérents.

### B. Lien `Lesson ↔ Skill` = table N-N `lesson_skills`

La résolution « quelle leçon enseigne cette notion » exige un lien qui n'existe pas
encore. Trois formes possibles, une seule est retenue :

- **`Lesson.skill_id` (1-N)** — écarté. Force *une* notion par leçon, alors qu'une leçon
  couvre naturellement plusieurs notions (« Théorème de Pythagore » = énoncé + calcul de
  l'hypoténuse + réciproque). Perte d'information dès le premier cas réel.
- **Détour par le chapitre (`Lesson → chapter → skill`)** — écarté. Il n'existe aucun
  lien `Chapter ↔ Skill`, et il ne faut pas le créer : `Chapter` est **annuel**
  (`school_year_subject_id`), `Skill` est **persistante** (ADR-0009 §2). Relier une
  notion persistante à un chapitre annuel recrée le problème de copie-par-année que
  l'ADR-0009 a écarté.
- **Table N-N `lesson_skills`** — **retenu**. Seule forme honnête : une leçon touche N
  notions, une notion est enseignée par N leçons (curriculum en spirale, cross-années).
  Cardinalité juste : `Lesson` est annuelle, `Skill` est persistante → la table répond
  exactement à « quelle leçon *(cette année)* a enseigné cette notion persistante ».
  Une table de jointure fine est la représentation *minimale correcte*, pas une couche
  en trop (sobriété `TECH_STACK.md` respectée).

Modèle (SQLAlchemy 2.0, style `Mapped`/`mapped_column`) :

```python
class LessonSkill(Base):
    __tablename__ = "lesson_skills"

    lesson_id: Mapped[UUID] = mapped_column(
        ForeignKey("lessons.id", ondelete="CASCADE"), primary_key=True
    )
    skill_id: Mapped[UUID] = mapped_column(
        ForeignKey("skills.id", ondelete="CASCADE"), primary_key=True
    )
```

- **Clé primaire composite `(lesson_id, skill_id)`** : interdit les doublons sans colonne
  `id` de surface.
- **Pas de `is_primary`, pas de poids en V1.** Voir §C pour l'échappatoire documentée.
- **Index requis** : la PK composite est ordonnée `(lesson_id, skill_id)` et n'aide donc
  pas les requêtes filtrant par `skill_id` (le cas des dérivés). Ajouter :

  ```python
  Index("ix_lesson_skills_skill", "skill_id")
  ```

### C. Contrat de résolution du cours canonique

Résolveur de référence (consommé par les dérivés, à commencer par ELI5 v2) :

```python
lesson = db.scalars(
    select(Lesson)
    .join(LessonSkill, LessonSkill.lesson_id == Lesson.id)
    .where(
        LessonSkill.skill_id == skill_id,
        Lesson.status == "validated",
        Lesson.content_markdown.isnot(None),
    )
    .order_by(Lesson.updated_at.desc())
    .limit(1)
).first()
```

Tie-break quand une notion mappe plusieurs leçons validées : **la plus récente**
(`updated_at.desc()`) — zéro colonne ajoutée, défaut sensé (traitement le plus frais).

Cas où ce défaut peut se tromper : une notion enseignée dans plusieurs chapitres de la
*même* année, où « la plus récente » pointerait vers une mention tangentielle plutôt que
le cours de fond. **Échappatoire documentée, non implémentée** : ajouter `is_primary`
(bool) sur `lesson_skills` pour désigner LA leçon de référence d'une notion. À poser
seulement si le tri par récence se révèle insuffisant en usage réel.

### D. Stratégie d'injection : verbatim, pas ré-indexation

Le `content_markdown` d'une leçon validée est injecté **entier** dans le prompt du
dérivé, pas ré-indexé dans le RAG.

- Une leçon cycle 4 fait ~500–1500 mots → tient dans le contexte de qwen. Déterministe,
  zéro infra nouvelle, le cours arrive complet (pas de chunk pertinent raté par la
  similarité cosinus).
- **Alternative écartée** : indexer les leçons validées dans le RAG (avec
  `metadata_json.lesson_id` + boost par `source_type`). Plus élégant à grande échelle,
  mais sur-ingénierie pour des leçons courtes et introduit un problème de synchronisation
  (leçon éditée → ré-embedder). Documentée comme option si les cours grossissent.

### E. Rattachement à la passe 2

- `lesson_skills` est créée par la **migration Alembic qui crée `lessons`** (table encore
  inexistante, cf. avertissement `DATA_MODEL.md`), dans la même migration passe 2 qui
  ajoute `program_version` sur `Lesson`.
- La **passe 2 écrit** dans la table (upsert `Skill` + insertion des liens leçon↔notion).
- Les **dérivés lisent** la table plus tard (ELI5 v2 en premier consommateur). Le
  résolveur consomme le lien, il ne le crée pas.

## Conséquences

### Positives

- **Cohérence inter-dérivés** : un même cours validé → même vocabulaire, mêmes notations
  dans ELI5, capsule, quiz, mindmap d'une même leçon.
- **Traçabilité gratuite** : `output_json` des dérivés peut porter `lesson_id` +
  `lesson_title` en plus de `sources_used`. Le badge Massimo passe de « 📚 D'après ton
  cours » à « 📚 D'après ta leçon *Théorème de Pythagore* » — ce qui résout le
  reste-reporté de l'étape 13 (afficher le titre/chapitre précis de la source).
- **Invalidation automatique** : le filtre `status == "validated"` fait qu'une leçon en
  ré-édition disparaît des dérivés sans code supplémentaire.

### À surveiller

- Le tie-break par récence (§C) est un pari ; `is_primary` est l'antidote prêt.
- La contrainte de design §A doit être rappelée dans **chaque** futur prompt de dérivé,
  sinon la cohérence promise n'est pas tenue.

## Hors périmètre (mono-chantier)

Aucune implémentation ne découle de cet addendum aujourd'hui. Il fige la cible pour :

1. le **prompt Claude Code de la passe 2** (création `lessons` + `lesson_skills` +
   `program_version`), quand ce chantier s'ouvrira ;
2. le **prompt Claude Code d'ELI5 v2** (résolveur §C + prompt v2 à deux sections),
   encore après.

Chacun de ces prompts devra, selon la règle read-before-code, relire les définitions
réelles de `Lesson`, `Skill`, `LLMRequest`/`LLMResponse` avant d'écrire quoi que ce soit.
