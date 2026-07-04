# ADR-0011 — Contexte canonique partagé pour les dérivés (résolveur + convention de prompt à deux sections)

## Statut

Accepté — 2026-07-04. Contrat validé par Papa et **gelé** : le résolveur
`resolve_canonical_context` (gate `status='validated'` DANS la requête), le module neutre
`app/modules/ai/canonical_context.py`, la convention de prompt à deux sections et la
traçabilité `lesson_id`/`lesson_title` constituent le contrat que le chantier
« substrat + ELI5 v2 » implémente et que les dérivés suivants consomment sans le modifier.

> Historique : Proposé — 2026-07-03.

> Numérotation : ADR-0010 est pris (génération skills-only / rattrapage, référencé dans
> `DATA_MODEL.md`) ; cet ADR est donc 0011. À renuméroter si 0010 s'avérait libre.

> S'appuie sur : `adr-0009` addendum (§A cours validé = source canonique, §B table
> `lesson_skills` + index `ix_lesson_skills_skill`, §C contrat de résolution),
> `adr-0008` (tâches pédagogiques quotidiennes = 100 % local), `adr-0007` (pattern
> génération structurée `fmt` + 1 réparation). Ne modifie pas `adr-0004` (embeddings).

## Contexte

L'addendum ADR-0009 §A a posé le principe : quand une leçon **validée** existe pour une
notion, son `content_markdown` est le **contexte prioritaire** des dérivés (ELI5,
capsule, quiz, mindmap, fiches, SRS), avant les chunks RAG bruts, avant la connaissance
du modèle. Le §C en a esquissé la requête de résolution, en la laissant « consommée plus
tard par ELI5 v2 et les futurs dérivés ».

On s'apprête à câbler ces dérivés **un par un**. Le piège du câblage naïf : chaque dérivé
réimplémente *sa propre* résolution de contexte et *sa propre* injection de prompt, avec
des variations. Résultat — on recrée exactement l'incohérence que le §A voulait tuer :
l'ELI5 et la capsule d'une même notion peuvent employer des notations et un vocabulaire
différents, alors qu'ils devraient raconter la même histoire que le cours que Massimo a
sous les yeux.

État de l'existant (déterminant) :

- ELI5 possède déjà `retrieve_for_skill(skill_id)` (recherche cosinus RAG) et injecte un
  contexte **plat** ; il expose `sources_used` (compteur de passages RAG).
- Le diagnostic génère par notion, la capsule part d'une `instruction` + `chapter_id`.
  Chaque dérivé va chercher son contexte de son côté.
- `lesson_skills` + `ix_lesson_skills_skill` + le gate `status='draft'` à la régénération
  sont (ou seront) verrouillés par le chantier d'invariants — prérequis de cet ADR.

Il manque **une** couche partagée : un résolveur unique et une convention de prompt
unique, pour que tous les dérivés parlent le même langage « cours d'abord ».

## Décision

### 1. Un résolveur unique, partagé, en lecture seule

Un seul point d'entrée, dans un module **neutre partagé** (recommandation :
`app/modules/ai/canonical_context.py`, à côté des providers — surtout **pas** dans
`eli5/`, sinon le prochain dérivé le réécrit) :

```python
@dataclass(frozen=True)
class CanonicalContext:
    lesson: Lesson | None        # cours validé, source canonique
    chunks: list[str]            # complément RAG (BO, sources Papa)

    @property
    def has_course(self) -> bool:
        return self.lesson is not None

def resolve_canonical_context(db, skill_id, *, k_with_course=3, k_without=5) -> CanonicalContext:
    lesson = db.scalars(
        select(Lesson)
        .join(LessonSkill, LessonSkill.lesson_id == Lesson.id)
        .where(
            LessonSkill.skill_id == skill_id,
            Lesson.status == "validated",           # ← le gate, appliqué DANS la requête
            Lesson.content_markdown.isnot(None),
        )
        .order_by(Lesson.updated_at.desc())
        .limit(1)
    ).first()
    chunks = retrieve_for_skill(db, skill_id, k=k_with_course if lesson else k_without)
    return CanonicalContext(lesson=lesson, chunks=chunks)
```

- **Cascade de dégradation** : cours validé → RAG seul → connaissance du modèle. Les deux
  derniers crans existent déjà ; cet ADR ajoute le premier, une fois pour tous.
- **Read-only, aucun effet de bord** : le résolveur ne valide rien, ne trace rien. Le
  **gate est dans la requête** (`status == 'validated'`) — un dérivé ne *peut pas*
  physiquement recevoir un cours non validé. C'est le point d'application unique du §A.
- Requête = celle du §C verbatim ; l'index `ix_lesson_skills_skill` la sert.
- `k` réduit quand un cours existe (le RAG devient complément), plus large sinon.

### 2. Une convention de prompt à deux sections

Un helper partagé compose le **bloc de contexte** (pas le prompt entier) :

```python
def build_canonical_sections(ctx: CanonicalContext) -> str:
    parts = []
    if ctx.lesson:
        parts.append(f"## COURS VALIDÉ (source canonique)\n{ctx.lesson.content_markdown}")
    if ctx.chunks:
        parts.append("## EXTRAITS COMPLÉMENTAIRES\n" + "\n\n".join(ctx.chunks))
    parts.append(
        "Règle : appuie-toi d'abord sur le COURS VALIDÉ. Si tes connaissances ou les "
        "extraits le contredisent, le cours fait foi (vocabulaire, notations, méthode)."
    )
    return "\n\n".join(parts)
```

- **On partage le contexte, pas la tâche.** Chaque dérivé garde ses propres consignes
  (ELI5 explique simplement, le quiz interroge, la mindmap cartographie) et *insère* ce
  bloc. Séparation des responsabilités : contexte commun, tâche propre à chacun.
- La ligne « le cours fait foi » est la garantie de cohérence inter-dérivés : même cours
  → mêmes notations partout.

### 3. Traçabilité uniforme

Chaque dérivé enrichit son `output_json` (et sa trace `ai_jobs`) de `lesson_id` +
`lesson_title` (nullables) quand un cours canonique a été utilisé, en plus du
`sources_used` existant. Bénéfices : le badge Massimo passe de « 📚 D'après ton cours » à
« 📚 D'après ta leçon *…* » **partout** (résout le reste-reporté de l'étape 13), et Papa
peut auditer quel dérivé s'est appuyé sur quel cours.

### 4. Moteur local, frontière ADR-0008 inchangée

Les dérivés tournent sur le moteur **local** (`get_provider`, ADR-0008) — la richesse
pédagogique reste locale. Seule la génération de *structure* de programme
(`curriculum_*`) garde la dérogation cloud. Cet ADR ne touche pas cette frontière.

### 5. Dégradation gracieuse = adoption incrémentale, pas de big-bang

Pour une notion **sans** cours validé, le résolveur retombe sur RAG/modèle — le
comportement actuel. Donc un dérivé peut adopter le résolveur **avant** que tous les
cours aient du contenu ; il « s'allume » notion par notion au fil des validations de
Papa. Aucune dépendance bloquante, aucune migration de données, aucun ordre imposé entre
« remplir les cours » et « câbler les dérivés ».

## Alternatives considérées

- **Résolution dupliquée dans chaque dérivé** : c'est le mal que cet ADR existe pour
  empêcher — variations de wording → incohérence inter-dérivés. → Écarté (§1).
- **Un « super-prompt » unique pour tous les dérivés** : non, chaque dérivé a une tâche
  distincte (expliquer ≠ interroger ≠ cartographier). On mutualise le *contexte*, jamais
  la *tâche*. → Écarté (§2).
- **Ré-indexer les leçons validées dans le RAG** au lieu de l'injection verbatim : déjà
  écarté par l'addendum §D (sur-ingénierie pour des cours courts, problème de
  synchronisation à l'édition). Le résolveur lit `lesson_skills` + injecte le cours
  entier. → Écarté.
- **Faire du résolveur un service qui gate/valide** : non, read-only ; le gate vit dans
  le filtre `status` de la requête, pas dans une logique séparée qu'on pourrait oublier
  d'appeler. → Écarté (§1).

## Conséquences

### Positives

- Cohérence inter-dérivés **mécanique** : même contexte, même règle « cours fait foi ».
- **Un seul** point d'application du gate → impossible à contourner ou oublier.
- Chaque dérivé devient un adaptateur mince (~30 lignes + tests) au lieu d'un
  réimplémenteur de contexte.
- Traçabilité `lesson_id` uniforme → badge précis et audit partout.
- Adoption incrémentale sûre (dégradation gracieuse).

### Négatives / coûts

- Un module partagé de plus (léger, sans état).
- **Couplage assumé** : tous les dérivés dépendent du résolveur ; un changement de
  contrat les impacte tous. C'est le but (cohérence), mais ça impose de versionner le
  contrat si on le fait évoluer.
- Le tie-break par récence (§C) peut mal choisir si une notion est enseignée par
  plusieurs leçons de la même année ; `is_primary` reste l'antidote documenté, non
  implémenté.

## Suivi

- **Préalable dur** : chantier d'invariants (`ix_lesson_skills_skill` + gate
  régénération `draft`) **mergé** — le résolveur repose sur les deux.
- **Ce ADR gèle le contrat** ; le prompt Claude Code « substrat + ELI5 v2 » l'implémente :
  `canonical_context.py` (résolveur + helper) **+ ELI5 v2 comme premier client** (prompt
  ELI5 v2 à deux sections, `output_json` enrichi `lesson_id`/`lesson_title`). Un seul
  chantier : ELI5 prouve le substrat sur un cas réel.
- **Séquence des dérivés suivants** (un par un, mono-chantier) : quiz/diagnostic →
  mindmap → cartes SRS → capsule.
- **Cas capsule** : elle part d'un `chapter_id`, pas d'un `skill_id` → il lui faudra une
  **variante chapitre** du résolveur (agréger les cours validés du chapitre). Addendum à
  cet ADR quand son tour viendra — hors périmètre ici.
- **Docs** : ligne dans `DECISIONS.md` ; note dans `DATA_MODEL.md` (règle « Cours
  canonique » déjà présente, à référencer vers cet ADR).
- Commit suggéré du chantier d'implémentation :
  `feat(ai): shared canonical-course context resolver + ELI5 v2 as first consumer`.
