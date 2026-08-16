---
id: "0011"
titre: "Contexte canonique partagé pour les dérivés (résolveur + convention de prompt à deux sections)"
type: architecture
statut: accepte
date: 2026-07-04
pr: null
revoque: []        # à remplir à la main — voir annexes/rapport-revocations.md
revoque_par: []
refs: ["0008", "0009", "0010", "0014", "0017", "0018", "0021", "0022", "0023", "0027", "0031", "0032", "0033"]
---
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

> ### Amendements
>
> | # | Date | Titre | Statut | Révoque |
> |---|---|---|---|---|
> | 1 | 2026-07-28 | Fraîcheur des dérivés (péremption) | Accepté | — |
> | 2 | 2026-07-28 | Provenance de la validation | Accepté | — |
> | 3 | 2026-08-02 | L'autorité monte d'un cran : `parent_rule` et le veto paresseux | Proposé | — |
>
> *Tableau généré par `scripts/fusion_addendums.py` — ne pas éditer à la main.*

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

---

## Amendement 1 — Fraîcheur des dérivés (péremption) — 2026-07-28

> Fusionné depuis **Amendement 1** le 2026-08-16. Statut d'origine : **Accepté**.

> À concaténer à la fin de `docs/decisions/adr-0011-contexte-canonique-partage.md`.
> Statut : **Accepté — 2026-07-28**. Ne modifie aucune décision §1–§5 ; les **complète**
> sur l'axe temporel. Prérequis du chantier « Couverture de production » (page Papa).
> **Amende l'ADR-0021 §5** (idempotence de l'équipement) — voir §E.6.

### Contexte

Le §1 garantit qu'un dérivé **naît** d'un cours `validated` : le gate vit dans la clause
`where` du résolveur, il est impossible à contourner. Il ne garantit **rien après la
naissance**.

Or le cours bouge. L'addendum ADR-0009 §A l'a prévu côté source — toute (re)génération de
`content_markdown` repasse la leçon en `status='draft'`, donc elle cesse d'alimenter les
dérivés *futurs* et disparaît de la lecture élève. Mais les dérivés **déjà `validated`
restent servis à Massimo** : la fiche, la mindmap et le quiz continuent de décrire une
version du cours qui n'existe plus. Rien ne le signale, ni côté Papa ni côté élève.

C'est l'angle mort exact du contrat gelé : le gate est un **événement**, la cohérence est
un **état**. Il manque la seconde.

Cas concret observé sur le référentiel actuel : une leçon dont le cours est régénéré après
coup porte une fiche et un quiz validés antérieurement. Aucune vue ne les rapproche.

### Décision

#### E.1 — Définition : un dérivé est *périmé* si sa source a changé après lui

Fonction **pure**, sans effet de bord, dans le module neutre partagé
(`app/modules/ai/canonical_context.py` — jamais réimplémentée par un dérivé, même règle
que §1) :

```python
def is_stale(derived_at: datetime | None, content_updated_at: datetime | None) -> bool:
    """Un dérivé est périmé si le cours source a été réécrit après sa production."""
    if derived_at is None or content_updated_at is None:
        return False          # pas de dérivé, ou cours jamais rédigé → rien à dire
    return content_updated_at > derived_at
```

Trois états de dérivé cohabitent donc désormais, et la page Couverture les rend visibles :
`absent` · `pending` · `validated` · **`validated + périmé`**. Le quiz n'ayant pas de gate
(doctrine ADR-0014 §2), il connaît `absent` · `présent` · **`présent + périmé`**.

#### E.2 — Le périmé est **signalé**, jamais déclassé automatiquement

Un déclassement automatique en `pending` retirerait du contenu à Massimo sans acte de
Papa — exactement ce que la co-construction (ADR-0009 §3) refuse, et un effet de bord dans
un module dont le §1 dit qu'il est *read-only*. Le périmé produit donc :

- un **badge** dans la page Couverture et dans les pages de pilotage concernées ;
- une **action proposée** (↻ Régénérer), jamais exécutée d'office ;
- **aucune modification** du service à Massimo.

Corollaire assumé : un dérivé périmé continue d'être servi tant que Papa n'a pas tranché.
C'est le prix de la règle « ZETIS ne retire rien unilatéralement ». Il est acceptable
parce que la dérive est désormais **visible** — c'est tout ce qui manquait.

#### E.3 — Une colonne, et une seule : `lessons.content_updated_at`

`lessons.updated_at` ne peut pas servir de référence : il bouge sur un renommage, un
`sort_order`, un rattachement de notion. L'utiliser marquerait périmés tous les dérivés
d'une leçon simplement réordonnée. **Un badge « périmé » qui se déclenche à tort détruit
la crédibilité de toute la page** — et la page ne vaut que par sa crédibilité.

Donc : **une colonne nullable `content_updated_at` sur `lessons`**, écrite par les deux
seuls chemins qui touchent `content_markdown` :

- `POST /api/lessons/{id}/generate-content` (rédaction et régénération, `lesson_content`) ;
- `PATCH /api/lessons/{id}` **uniquement** quand le champ `content` est présent dans le
  corps (édition manuelle du cours).

Reprise des lignes existantes : `content_updated_at = updated_at` là où
`content_markdown IS NOT NULL`, `NULL` sinon — approximation documentée, la seule
disponible rétroactivement.

Alternative écartée : stocker un hash du cours sur chaque table de dérivé (`fiches`,
`mindmaps`, `quizzes`, …) — exact, mais **quatre** migrations et une colonne à maintenir
par dérivé futur, contre une seule ici qui les sert tous et servira les suivants sans
migration supplémentaire. Sobriété `TECH_STACK.md`.

#### E.4 — Côté dérivé, la référence temporelle est `updated_at`

`fiches.updated_at`, `mindmaps.updated_at`, `quizzes.updated_at`. Conséquence assumée :
si Papa **édite** un dérivé après un changement de cours, celui-ci redevient « frais » sans
avoir été relu contre le nouveau cours. Approximation acceptée — Papa a touché l'objet
postérieurement au changement, on le présume informé. Le cas inverse (faux négatif) est
sans danger ; c'est le faux positif que E.3 élimine.

#### E.5 — Hors périmètre : les dérivés notion-centrés

Cartes SRS et capsules ne dérivent pas d'**une** leçon mais d'une notion, dont le résolveur
peut désigner une leçon différente au fil du temps (tie-break par récence, §C / cf.
« Négatives » de l'ADR-0011). La règle de péremption ne s'y applique pas telle quelle. En
V1 : la page Couverture les affiche en **fraction de notions couvertes**, sans état de
fraîcheur. Une extension exigerait de persister le `lesson_id` réellement utilisé à la
génération — la trace existe déjà dans `ai_jobs.output_json` (§3), mais l'exploiter comme
donnée métier est un choix à part. **Addendum ultérieur si le besoin se confirme.**

### À vérifier sur pièce avant implémentation

- Les routes élève des dérivés filtrent-elles la **chaîne** (`lesson.status == 'validated'`)
  ou seulement le statut du dérivé ? Si seul le dérivé est filtré, une leçon repassée en
  `draft` (ou archivée) laisse ses fiches/mindmaps servies — un second angle mort, plus
  grave que la péremption, à traiter dans le même geste.
- `quizzes` porte-t-il bien un `updated_at` exploitable (les questions ont le leur) ?

### Conséquences

**Positives** — la cohérence de la lignée de dérivés devient un état **observable** et non
plus un espoir ; la règle est écrite une fois, en fonction pure testable, au même endroit
que le gate qu'elle complète ; la page Couverture obtient sa quatrième colonne d'état sans
logique dispersée ; toute nouvelle famille de dérivés leçon-centrés en hérite gratuitement.

**Négatives / coûts** — une colonne et une migration (l'ADR-0011 n'en demandait aucune) ;
deux chemins d'écriture à ne pas oublier (verrouillés par test) ; un dérivé périmé reste
servi jusqu'à décision humaine (E.2) ; les dérivés notion-centrés restent sans signal (E.5).

#### E.6 — Premier consommateur réel : l'idempotence de l'équipement (ADR-0021 §5)

L'ADR-0021 §5 pose : *on ne régénère jamais l'existant — on complète*. Une pièce déjà créée
n'est jamais rappelée au LLM ; une pièce `pending` est **simplement validée** pour rendre la
mission jouable.

Cette règle a un trou que la fraîcheur comble. Un dérivé **périmé** est `validated` : il est
donc considéré comme acquis, jamais régénéré, et la mission créée s'appuie dessus — une fiche
qui décrit un cours réécrit depuis. La règle correcte est **« déjà validé *et frais* »** :

```python
if exists and not is_stale(piece.updated_at, lesson.content_updated_at):
    skip()          # acquis, on complète ailleurs
else:
    regenerate()    # absent ou périmé
```

`is_stale` n'est donc pas qu'un badge d'affichage : c'est un **prédicat d'orchestration**.
C'est sa justification la plus forte, et elle impose que l'équipement (ADR-0021) l'adopte en
même temps que la page Couverture — sinon l'équipement continue de propager du périmé.

Corollaire sur le `pending` : l'ADR-0021 §5 valide une pièce `pending` sans la relire. Si
cette pièce est **périmée**, la valider est pire que ne rien faire — on promeut activement un
contenu obsolète. Une pièce `pending` **et** périmée doit être **régénérée**, pas validée.

### Suivi

- Migration Alembic dédiée (`lessons.content_updated_at`) + reprise ; note sous `Lesson`
  dans `DATA_MODEL.md` (« bumpé uniquement par les deux écrivains de `content_markdown`,
  cf. ADR-0011 §E.3 »).
- `is_stale` + tests exhaustifs (les 4 combinaisons de `None`, égalité stricte, ordre) —
  livrée **avec** la fonction pure d'état de cellule de la page Couverture, qui la consomme.
- **Test-verrou** : réordonner une leçon (`sort_order`) ou la renommer ne rend **aucun**
  dérivé périmé. C'est le test qui protège la crédibilité de la page.
- Ligne à ajouter dans `DECISIONS.md` sous ADR-0011 (« + addendum §E — fraîcheur des
  dérivés »).
- Commit suggéré : `feat(curriculum): track lesson content_updated_at for derivative staleness`.

### Décisions validées (commanditaire, 2026-07-28)

1. **Le périmé est signalé, jamais déclassé automatiquement** — ZETIS ne retire rien
   unilatéralement à Massimo ; le coût (un dérivé périmé reste servi jusqu'à arbitrage) est
   assumé parce que la dérive est désormais visible — retenu.
2. **Colonne dédiée `content_updated_at`** plutôt que `lessons.updated_at` (trop bruyant :
   un renommage marquerait périmés tous les dérivés) — retenu, malgré la migration.
3. **§E.6 — amendement de l'ADR-0021 §5** : l'idempotence de l'équipement devient « déjà
   validé **et frais** » ; une pièce `pending` **et** périmée est **régénérée, jamais
   validée** — retenu. Changement de comportement sur du code livré, assumé.
4. **Dérivés notion-centrés (cartes SRS, capsules) hors périmètre** de la fraîcheur — retenu.

---

## Amendement 2 — Provenance de la validation — 2026-07-28

> Fusionné depuis **Amendement 2** le 2026-08-16. Statut d'origine : **Accepté**.

> À concaténer après le §E dans `docs/decisions/adr-0011-contexte-canonique-partage.md`.
> Statut : **Accepté — 2026-07-28**. Même migration que §E.3.

### Contexte

Besoin exprimé (Papa) : *savoir a posteriori ce que j'ai validé moi et ce que ZETIS a laissé
passer* — question qui devient structurante dès que la production en lot existe.

`source` (`generated` | `manual`) dit **qui a produit**. `validation_status` dit **si c'est
passé**. Aucune colonne ne dit **qui a laissé passer**. Trois situations très différentes
portent aujourd'hui la même valeur `validated`, ou aucune :

1. Papa a ouvert l'objet, l'a lu, l'a validé ;
2. Papa a cliqué une validation groupée — `POST /chapters/validate-all` existe déjà, à
   l'échelle d'une matière ou de l'année entière ;
3. personne n'a rien relu : le quiz, servi sans gate (ADR-0014 Décision 2).

Les cas 1 et 2 sont indiscernables. Le cas 3 est muet. Et la file de relecture à venir
comportera nécessairement une action groupée face à des dizaines d'objets : sans marquage,
le cas 1 deviendra rare et le cas 2 massif, sans que rien ne le montre.

### Décision

#### F.1 — Deux colonnes, sur chaque table de contenu validable

`fiches`, `mindmaps`, `capsules` (dérivés) **et `chapters`, `lessons`** (référentiel) :

| colonne | type | sens |
|---|---|---|
| `validated_at` | `datetime`, nullable | horodatage du passage à `validated` |
| `validated_by` | enum, nullable | provenance de la décision |

**Pourquoi `chapters` et `lessons`.** `POST /chapters/validate-all` et
`POST /school-years/active/chapters/validate-all` existent depuis l'ADR-0009 et valident une
matière — voire l'année entière — d'un clic. C'est le chemin le plus « en lot » de tout ZETIS,
et ce serait précisément celui qu'on ne tracerait pas. De plus, le **cours est le seul contenu
que Massimo lit vraiment** : savoir s'il a été relu ou expédié dans un `validate-all` importe
davantage que la même information sur une fiche.

**Pourquoi pas `missions`.** Elles naissent `validated` **par construction**, toujours par le
même chemin (ADR-0018 déc. 2, ADR-0021 §2, ADR-0022 §5), sans exception. La colonne vaudrait
invariablement `parent_bulk`. Une colonne à valeur unique n'est pas de la traçabilité, c'est du
bruit — l'information vit déjà dans `mission_type` + `created_by`.

Valeurs de `validated_by` :

- **`parent`** — objet ouvert et relu individuellement avant validation ;
- **`parent_bulk`** — passé dans une validation groupée, jamais ouvert pièce par pièce.
  Décision humaine, attention non individuelle : les deux sont vraies, la colonne le dit ;
- **`system`** — servi sans relecture par doctrine assumée (le quiz). Écrit à la génération ;
- **`NULL`** — antérieur à la traçabilité, ou non validé.

Reprise : `NULL` pour toutes les lignes existantes. **On ne rétro-attribue pas.** Prétendre
savoir ce qui a été relu avant l'existence de la colonne serait exactement le mensonge que
cette décision corrige.

#### F.2 — La provenance est un **fait**, jamais un reproche

Elle s'affiche comme `source` s'affiche : information neutre de traçabilité. La page Couverture
et les pages de pilotage la montrent ; **aucune ne compte, ne classe ni ne relance sur cette
base**. Pas de « N objets jamais relus » en KPI, pas d'alerte, pas de badge d'incitation.

Un compteur qui reproche à Papa une tâche qu'il a délibérément choisi de ne pas faire n'est pas
un outil de pilotage, c'est une dette morale affichée. La distinction est structurelle et non
cosmétique : la provenance sert à **expliquer** un objet quand une question se pose sur lui,
pas à réclamer du travail.

#### F.3 — Toute action groupée écrit `parent_bulk`, sans exception

Les écrivains sont : `POST /chapters/validate-all` (existant, à mettre en conformité), la
validation groupée de la future file de relecture, et toute action de lot ultérieure.
La validation unitaire depuis une page de pilotage écrit `parent`.

**Aucun chemin ne doit écrire `validated` sans renseigner `validated_by`.** Un test-verrou
garantit qu'il n'existe pas de ligne `validation_status='validated' AND validated_by IS NULL`
créée après la migration.

#### F.4 — L'auto-validation existe déjà, et `parent_bulk` la couvre

**Correction d'une erreur d'une version antérieure de cet addendum**, qui affirmait qu'une
auto-validation exigerait un nouvel ADR. Elle est actée depuis l'ADR-0021 §2 : lors de
l'équipement d'une notion depuis le Conseil de classe, le kit généré est marqué `validated`
immédiatement, *la popup de confirmation Papa valant acte d'approbation*. C'est la soupape
§5ter de l'ADR-0017, ouverte étroitement.

Aucune valeur nouvelle n'est requise : ce flux est exactement **`parent_bulk`** — un geste
humain unique, N objets, aucune relecture pièce par pièce. Les autres écrivains de cette
valeur sont l'équipement d'une mission champion (ADR-0022 §5) et `validate-all` (§F.3).

Deux cas de ce flux méritent d'être visibles, et c'est la raison d'être du §F :

- l'ADR-0021 §5 **valide une pièce `pending` préexistante** pour rendre la mission jouable —
  y compris un brouillon que Papa avait délibérément laissé en attente. Sans traçabilité,
  ce basculement est indétectable ;
- un kit entier atteint Massimo sans qu'aucune de ses pièces ait été ouverte.

`system` reste strictement réservé au contenu d'évaluation éphémère sorti du gate par
l'ADR-0014 (le quiz). **Aucun autre chemin ne doit l'écrire** — un test dédié le garantit,
faute de quoi une future auto-validation pourrait s'y déguiser sans ADR.

### Conséquences

**Positives** — la question « qui a laissé passer ceci » devient répondable, pour chaque objet,
définitivement ; la validation groupée cesse d'être un raccourci invisible ; quand Massimo
signale un contenu douteux, on sait immédiatement s'il avait été relu ; la file de relecture
peut offrir une action groupée sans dissoudre l'information.

**Négatives / coûts** — deux colonnes par table de dérivé (mêmes migration et chantier que
§E.3) ; tous les chemins de validation existants à mettre en conformité, y compris
`validate-all` ; un historique définitivement `NULL`, assumé.

### Suivi

- Colonnes ajoutées **dans la migration du §E.3** — une seule migration pour les deux
  addenda, pas deux.
- Note sous chaque table de dérivé dans `DATA_MODEL.md`.
- **Backlog, non planifié** : signalement par Massimo (« cette question est bizarre »)
  remontant l'objet à Papa. C'est le complément naturel de F.2 — plutôt qu'un contrôle
  exhaustif improbable, un signal rare et réel, qui donne de l'agentivité à Massimo au lieu
  de le laisser encaisser une clé fausse en silence. Coût : une table minuscule.
- Ligne à ajouter dans `DECISIONS.md` sous ADR-0011 (« + addenda §E fraîcheur, §F provenance »).

### Décisions validées (commanditaire, 2026-07-28)

1. **Portée des colonnes** : `fiches`, `mindmaps`, `capsules`, **`chapters`, `lessons`** —
   `missions` **exclues** (valeur invariable) — retenu.
2. **`parent_bulk` couvre l'auto-validation ADR-0021 §2** sans valeur nouvelle — retenu.
3. **La provenance est un fait, jamais un reproche** : affichée par objet, **jamais totalisée,
   jamais relancée** (aucun KPI, aucune alerte, aucun filtre « jamais relu ») — retenu.
4. **Aucune rétro-attribution** : l'historique reste `NULL` — retenu.

---

## Amendement 3 — L'autorité monte d'un cran : `parent_rule` et le veto paresseux — 2026-08-02

> Fusionné depuis **Amendement 3** le 2026-08-16. Statut d'origine : **Proposé**.

### Statut

Proposé — 2026-08-02. Premier document du chantier d'**autonomisation progressive de ZETIS**
(paliers 1 → 2 → 3). Ne dépend d'aucun autre ; l'ADR-0031 (`production_runs`, déclencheurs,
surface Papa) s'appuiera sur lui.

> S'appuie sur : `adr-0011 addendum §F` (provenance de la validation — **ce §G en est la suite
> directe**), `adr-0011 addendum §E` (fraîcheur, `is_stale`), `adr-0014 §2` (`system`, quiz),
> `adr-0021 §2` (équipement auto-validé), `adr-0023 §7` (le gate humain sur la rédaction de cours
> **ne bouge pas**), `adr-0027` (classe C, actes destructifs fermés). **Ne rouvre aucune décision.**

### Contexte

Papa produit aujourd'hui tout le contenu de Massimo, manuellement. C'est le goulot du dispositif.
On veut que ZETIS puisse, **avec l'accord de Papa et acte par acte**, en prendre une part
croissante — sans jamais faire de « rien n'atteint Massimo sans validation » un mensonge.

Trois paliers, par classe d'objet :

| Palier | Nom | Fonctionnement |
|---|---|---|
| 1 | ZETIS off | Papa crée. Massimo reçoit. |
| 2 | ZETIS semi-autonome | ZETIS crée, Papa valide, puis Massimo reçoit. |
| 3 | ZETIS autonome | ZETIS crée et sert. Papa est informé après coup : lire, corriger, régénérer, retirer. |

**Le but final n'est pas de produire plus, c'est d'optimiser le niveau scolaire de Massimo.** Une
fois la production libérée, le goulot suivant est son **attention** (30 à 60 min/jour), qui ne se
multiplie pas. Produire cinq fois plus fabriquerait de l'inventaire, pas de l'apprentissage.

Ce §G pose **le vocabulaire d'autorité et le régime de retrait**. Il ne livre aucun palier 3 : il
rend possible de l'écrire sans mentir.

### Constat read-before-code

**1. `validated_by` pose déjà littéralement la question de l'autorité.** Le §F existe pour
« savoir a posteriori ce que j'ai validé moi et ce que ZETIS a laissé passer ». Créer une colonne
`authority` à côté donnerait **deux réponses à une seule question** — exactement le mal que le §F
élimine. `provenance.mark_validated` est le **seul** chemin d'écriture (test-verrou §F.3).

**2. ⚠️ Le §F.4 a DÉJÀ tranché l'auto-validation — et le cadrage le lisait mal.** §F.4 corrige une
version antérieure qui affirmait qu'une auto-validation exigerait un nouvel ADR : l'équipement de
l'ADR-0021 §2 est **exactement `parent_bulk`** (« un geste humain unique, N objets, aucune
relecture pièce par pièce »).

> **Ce qui est nouveau au palier 3 n'est donc PAS « du contenu non relu atteint Massimo » — c'est
> déjà vrai, et c'est honnête.** Ce qui est nouveau, c'est la disparition du **geste par lot**,
> qui est aujourd'hui le seul régulateur de volume existant. Le §G ne franchit qu'une frontière,
> et il faut la nommer exactement.

**3. `system` est verrouillé, et le verrou tiendra.** `test_system_is_reserved_to_quizzes` cible
les deux formes d'écriture (`provenance import SYSTEM`, ou `validated_by` + `system` littéral).
Une valeur nouvelle ne le déclenche pas. Sa raison d'être écrite — « une future auto-validation
pourrait s'y déguiser sans ADR » — désigne précisément ce moment.

**4. Le « trou » de traçabilité de la consommation n'existe pas.** Les quatre familles de dérivés
tracent déjà : `SpacedReviewAttempt`, `QuizAttempt`, `CapsuleView`, et **`fiche_views` /
`mindmap_views`** (`seen_at`, unique par élève × ressource). Une analyse antérieure avait conclu
l'inverse, induite en erreur par un docstring périmé. **Le veto ci-dessous n'a aucune dette à
payer d'abord.**

**5. ⚠️ Le nuancier Papa confond déjà deux états.** `CoverageCellView.tsx` rend `null` **comme**
`parent_bulk` (« il date d'avant la traçabilité »). Une provenance inconnue et une validation
groupée y sont donc indistinguables à l'œil. Ce n'est pas bloquant, mais ajouter une quatrième
teinte sans corriger cela laisserait deux valeurs sur trois se ressembler.

### Décision

#### G.1 — Une valeur de plus sur `validated_by`, pas une colonne de plus

> **`parent_rule`** — aucun humain n'a ouvert cette pièce, **ni cliqué pour ce lot** ; un humain a
> autorisé la **règle permanente** qui l'a produite.

Alignement de nommage volontaire : `parent` (pièce) → `parent_bulk` (lot) → `parent_rule` (règle).
**La même échelle, un cran de plus.** Les trois disent « décision humaine », à des granularités
d'attention décroissantes. La quatrième valeur, `system`, n'est pas sur cette échelle : elle dit
« servi sans relecture **par doctrine** » et reste strictement réservée au quiz.

C'est ce qui rend le palier 3 racontable sans casser l'invariant :

> **La validation ne disparaît pas. Elle remonte du contenu vers le règlement.**

**Ne pas réutiliser `system`** (constat 3). **Ne pas créer de colonne `authority`** (constat 1).

Conséquences gratuites : le test-verrou « aucun `validated` sans `validated_by` »
(`test_no_validated_row_without_provenance`) continue de tenir **sans modification** —
`parent_rule` est une valeur non nulle comme les autres.

Coûts réels, à ne pas passer sous silence : le type partagé `ValidatedBy`
(`packages/types/src/production.ts`) et le nuancier `CoverageCellView` gagnent une entrée. Le
constat 5 est à corriger dans la même passe, sinon trois valeurs sur quatre se ressemblent.

#### G.2 — La matrice : l'autonomie se dose par classe d'objet, pas par un interrupteur global

L'autonomie ne se dose pas par « niveau de confiance en ZETIS ». Elle se dose par **coût d'erreur
× réversibilité avant exposition**.

| Classe | Objets | L'erreur… | Palier visé |
|---|---|---|---|
| **A0a — dérivés inertes** | fiche, mindmap, quiz, capsule | dort jusqu'à consultation | **3** |
| **A0b — dérivés en boucle** | cartes SRS | **se compose semaine après semaine** | **3** (voir G.3) |
| **A1 — rédaction de cours** | `lessons.content_markdown` | atteint le seul contenu vraiment lu | **2 — figé** |
| **A2 — référentiel** | `Skill`, `Lesson`, `Chapter` | redessine la carte | **1** |
| **A3 — création de mission** | `missions` | consomme l'attention, ressource rare | **2** |
| **A4 — terminal** | supprimer, archiver, dévalider | définitive | **jamais** |

**Pourquoi A0a et A0b sont séparés** : une fiche fausse reste inerte jusqu'à ce qu'on l'ouvre ;
une carte SRS fausse **entre dans une boucle de planification** et sera révisée pendant des
semaines. C'est le seul dérivé dont l'erreur ne dort pas — elle travaille.

**Trois cellules ne sont pas libres, elles sont déjà tranchées ailleurs :**

- **A1 en palier 2** — ADR-0023 §7 : « le seul endroit du dispositif où le gate humain reste
  obligatoire et bloquant, **et il ne bouge pas** ». Y toucher = rouvrir l'ADR-0023.
- **A3** — nuance à préserver : **élire ≠ créer**. Le sélecteur quotidien élit déjà de façon
  autonome et déterministe. Ce qui n'est pas autonome, c'est la *création*.
- **A4** = classe C de l'ADR-0027, déjà fermée.

**Le palier est porté par la donnée, jamais par le code.** Les deux classes figées sont lisibles
et non écrivables : le serveur refuse toute valeur autre que celle fixée par ADR.

#### G.3 — Le veto est passif et paresseux : la consommation ferme la fenêtre, pas l'horloge

**Ce qu'on écarte : la quarantaine temporelle.** « Invisible de Massimo pendant N heures » a trois
défauts, le troisième disqualifiant : elle exige un ordonnanceur pour libérer à expiration (que
l'ADR-0023 a refusé) ; elle ment sur ce qu'elle mesure (N heures ne mesure pas la disponibilité de
Papa — produit vendredi soir, libéré samedi matin, la fenêtre a expiré sans que le veto ait été
possible) ; et elle réintroduit `pending` sous un autre nom, **en échappant à son régulateur**.

> Un contenu produit en `parent_rule` est **servi immédiatement**. Il est **rétractable sans
> trace** tant que Massimo ne l'a pas consommé. **La consommation — pas l'horloge — ferme la
> fenêtre.**

- **Papa n'a rien à faire pour accepter.** Le silence vaut accord : c'est ce qui rend l'autonomie
  réelle.
- **Aucun ordonnanceur.** Pas de tâche de libération, pas d'état transitoire.
- **La fenêtre dure aussi longtemps qu'elle est utile.** Un contenu jamais consulté reste
  rétractable des semaines ; un contenu ouvert dans l'heure en sort dans l'heure.

| État | Geste de Papa | Effet |
|---|---|---|
| **Non consommé** | *Retirer* | suppression franche, aucune trace, aucun signal à Massimo |
| **Consommé** | *Corriger* / *Régénérer* | l'objet vit, il est amendé (`is_stale` existe déjà) |

La bascule est traçable pour les **quatre** familles (constat 4) : `SpacedReviewAttempt`,
`QuizAttempt`, `CapsuleView`, `fiche_views` / `mindmap_views`.

**A0b se résout par ce régime, sans état nouveau.** Une carte non révisée n'a aucun
`SpacedReviewAttempt` : elle est non consommée, donc rétractable sans trace. La première révision
ferme la fenêtre. Aucune valeur nouvelle dans `INACTIVE_CARD_STATUSES`.

**Mais l'inversion doit être assumée** : la fenêtre se ferme au moment précis où le danger
commence. Avant la première révision, la carte est inoffensive *et* retirable ; après, nuisible
*et* verrouillée. La sortie n'est pas de rouvrir le veto (V1 protège Massimo d'un trou
inexpliqué) — c'est que, **pour A0b seul, « Corriger » doit pouvoir remettre la planification à
zéro** : la carte survit, son historique fautif non.

#### G.4 — Deux invariants

- **V1 — le retrait est invisible de Massimo.** Un contenu non consommé qui disparaît n'a jamais
  existé pour lui. Aucun message, aucun trou signalé.
- **V2 — la dé-escalade ne rétroagit jamais.** Repasser une classe en validation arrête la
  production **future** ; le contenu déjà servi reste servi. Même principe que « l'XP déjà crédité
  n'est jamais rembobiné ».

### Périmètre

**Dans ce §G** : la valeur `parent_rule` (**modélisée, NON ÉMISE**), la matrice classe × palier,
le régime de veto, les deux invariants. Le type partagé `ValidatedBy` et le nuancier
`CoverageCellView` gagnent leur entrée, **avec** la correction du constat 5.

> **Le modèle anticipe, le code n'anticipe pas.** `parent_rule` naît légal et non émis — patron
> `content_kind` (six valeurs au modèle, quatre émises en v1). Aucun chemin ne l'écrit tant que
> l'ADR-0031 n'a pas livré son régulateur et sa surface Papa.

**Hors de ce §G** : `production_runs` et les déclencheurs (ADR-0031) ; le régulateur du palier 3 et
le panneau des paliers (ADR-0031) ; l'émission effective de `parent_rule` et les plafonds de
missions (ADR-0032) ; l'indicateur d'autonomie de Massimo (ADR-0033).

### Conséquences

#### Positives

- Le palier 3 devient **racontable sans mensonge** : la validation ne disparaît pas, elle change
  de granularité — et l'échelle `parent` → `parent_bulk` → `parent_rule` le dit dans la donnée.
- **Aucune colonne, aucune table, aucune migration.** Une valeur de plus sur une colonne texte.
- Le veto ne demande **aucun ordonnanceur** — ce qui préserve le refus de `launchd`/`pmset` de
  l'ADR-0023.
- Les deux test-verrous existants (§F.3, `system`) continuent de tenir sans modification.

#### Négatives / coûts

- **Le veto est un droit sans notification.** Papa n'apprend qu'un contenu existe qu'en ouvrant
  la surface qui le liste ; Massimo consomme en 24-48 h. La fenêtre nominale est, en pratique,
  souvent fermée avant que Papa ait su qu'elle s'ouvrait. **L'ADR-0031 doit trancher où cette
  information apparaît** — la piste la moins coûteuse est la Couverture, que Papa ouvre déjà et
  où la provenance s'affiche **par objet** (§F.2 respecté à la lettre : jamais totalisée).
- Une quatrième teinte dans un nuancier qui en confond déjà deux (constat 5).
- L'inversion d'A0b (G.3) exige une action « Corriger » plus puissante que l'édition actuelle.

### Suivi

Tests-verrous exigés :

1. `parent_rule` est une valeur **légale et non émise** : aucun chemin du dépôt ne l'écrit
   (patron du verrou `system`, inversé).
2. `test_no_validated_row_without_provenance` continue de passer **sans modification**.
3. `test_system_is_reserved_to_quizzes` continue de passer **sans modification** — `parent_rule`
   ne s'y déguise pas.
4. Les deux classes figées (A1, A4) sont **refusées côté serveur** à l'écriture, quelle que soit
   la valeur envoyée.
5. Le nuancier distingue **quatre** provenances plus l'inconnu — `null` cesse d'être rendu comme
   `parent_bulk` (constat 5).

Point ouvert, à trancher dans l'ADR-0031 et **pas ici** : la surface où Papa voit ce qui a été
produit en `parent_rule` assez tôt pour exercer son veto (§Conséquences négatives).
