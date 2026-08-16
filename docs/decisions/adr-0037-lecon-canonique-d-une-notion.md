---
id: "0037"
titre: "« La leçon d'une notion » : trois règles, trois réponses, un substrat"
type: architecture
statut: propose
date: 2026-08-03
pr: null
revoque: []        # à remplir à la main — voir annexes/rapport-revocations.md
revoque_par: []
refs: ["0024", "0031", "0032", "0035", "0036"]
---
# ADR-0037 — « La leçon d'une notion » : trois règles, trois réponses, un substrat

## Statut

Proposé — 2026-08-03.

> S'appuie sur : `adr-0011` (le substrat canonique partagé et son « on paie la requête, pas la
> divergence »), `adr-0031 §2` (`scope.plan` réutilise `notions_by_lesson` au lieu d'en écrire une
> jumelle), `addendum adr-0024` (« un seul prédicat de disponibilité dans le dépôt »),
> `adr-0036 §2` (le lot-pièce, par lequel le défaut s'est manifesté).

## Contexte

### Une notion peut être portée par plusieurs leçons — et trois modules ne désignent pas la même

`lesson_skills` est une liaison **n-n**. Rien n'interdit qu'une notion soit rattachée à deux
leçons, et c'est même normal : un référentiel qui évolue crée une seconde leçon sur un sujet déjà
couvert, une notion transversale est enseignée dans deux chapitres.

Trois modules répondent alors à la question « quelle est LA leçon de cette notion ? », et **aucun
ne répond comme les autres** :

| Module | Ordre retenu | Filtres |
|---|---|---|
| `production` — `runner.select_notions`, `runner._stamp_course`, `equipment._skill_lesson` | `Lesson.id DESC` | `status != 'archived'` — **aucun filtre d'année** |
| `galaxy._course_lessons_by_skill` | max sur `(updated_at, id)` | `validated` + chapitre `validated` + **année active** |
| `ai.resolve_canonical_context` | `updated_at DESC` | `validated` + `content_markdown IS NOT NULL` |

*(`memory._has_validated_course` partage le prédicat du troisième, mais ne résout rien — c'est un
test d'existence. Il n'est pas concerné.)*

### La manifestation observée — 2026-08-03, en vrai

La notion **« Discours direct »** est portée par deux leçons validées : la **n°5**, qui a un cours
rédigé, et la **n°12**, qui n'en a pas.

- `production` retient la **12** (id le plus haut) → le gate répond « Cours à valider » → **le lot
  est bloqué**, alors que rien ne manque.
- `galaxy` retient la **5** → Massimo voit le cours **et** la fiche produite sur cette leçon.

Papa lit donc « ZETIS refuse de produire » sur une notion que son fils consulte normalement.

### ⚠️ Le pire cas n'est pas celui-là

Le refus est **bruyant** : il porte son motif au journal. Le cas symétrique est **silencieux**, et
c'est lui qui justifie cet ADR.

Si la production retient la leçon **A** quand la galaxie oriente vers la leçon **B**, alors une
fiche produite sur A **n'est atteignable par personne**. Aucune erreur, aucun événement de journal,
aucun test rouge : du contenu payé en temps GPU, validé, tamponné — et invisible.

> Ce n'est pas une hypothèse d'école : c'est exactement la même famille que la porte ouverte sur du
> vide du 2026-07-30, où le cours était annoncé disponible sur `lesson_id is not None` d'un côté et
> sur `content_markdown IS NOT NULL` de l'autre. L'addendum ADR-0024 en avait tiré « **un seul
> prédicat de disponibilité dans le dépôt** ». La même leçon n'a pas été appliquée à la résolution
> de leçon.

### Ce qui rend le sujet moins simple qu'il n'en a l'air

**Les trois filtres ne sont pas trois négligences.** Chacun est juste pour son appelant :

- `galaxy` ne doit montrer que ce que Massimo peut atteindre → `validated` + année active ;
- `canonical_context` alimente un LLM avec du texte de cours → il lui faut un cours **rédigé** ;
- `production` doit pouvoir travailler sur un **brouillon** : au palier 3 (A1 = 3), `equip_notion`
  a précisément le droit de rédiger puis valider le cours d'une leçon qui n'en a pas. Lui imposer
  le filtre `validated` de la galaxie **supprimerait le palier 3**.

**Le désaccord n'est donc pas sur le filtre. Il est sur l'ORDRE et sur le PÉRIMÈTRE** — et ces
deux-là n'ont aucune raison de différer.

⚠️ **Et `production` n'a aucun filtre d'année scolaire.** Une notion réutilisée d'une année sur
l'autre peut lui faire équiper la leçon de **l'an dernier**. Aucune manifestation observée à ce
jour, mais c'est un fait de code, pas une crainte.

## Décision

### 1. Un résolveur unique, qui porte l'ORDRE et le PÉRIMÈTRE — pas le filtre de statut

> ⚠️ **CETTE SECTION A ÉTÉ CORRIGÉE LE JOUR MÊME, au read-before-code de sa propre slice**
> (précédent ADR-0032, ADR-0036 §3). Deux hypothèses étaient fausses, et il faut dire lesquelles :
>
> 1. **La signature annoncée était MONO-NOTION** — `lessons_of_skill(db, skill_id)`. Or
>    `_course_lessons_by_skill` est **par LOT**, et `resolve_panoply` en fait une promesse
>    explicite : *« le nombre de requêtes est constant, indépendant du nombre de notions »*, ce qui
>    rend la page matière tenable sur une matière entière. L'appeler par notion l'aurait fait passer
>    à N requêtes. **Le résolveur est donc PAR LOT d'abord**, avec un raccourci mono-notion.
> 2. **Le périmètre d'année lève un 404.** `_active_year_or_404` porte son comportement dans son
>    nom. La production n'a aujourd'hui aucun filtre d'année, donc ne lève jamais ; lui faire
>    adopter ce gate ferait remonter un code HTTP **dans un job RQ** — ce que l'ADR-0035 a déjà
>    jugé absurde (« le code de statut ne part vers personne »). **Le résolveur rend donc du VIDE
>    quand il n'y a pas d'année active** ; l'appelant décide si c'est un 404, un blocage journalisé,
>    ou rien.

Un module neutre expose :

```python
lessons_by_skill(db, skill_ids) -> dict[int, list[Lesson]]   # par LOT — le contrat de base
lessons_of_skill(db, skill_id)  -> list[Lesson]              # raccourci, pour un appelant isolé
```

- **périmètre** : les leçons de l'**année active**, dans un chapitre `validated`, non archivées ;
- **ordre** : `(updated_at, id)` décroissant — celui de la galaxie, parce que c'est **elle qui
  décrit ce que Massimo atteint**, et que produire ailleurs revient à produire dans le vide ;
- **aucun filtre de statut de leçon**, et c'est le cœur de la décision : c'est là que les trois
  appelants diffèrent **légitimement**, donc c'est ce qui reste chez eux.

Chaque appelant garde son gate, appliqué sur la liste rendue :

| Appelant | Ce qu'il retient |
|---|---|
| `galaxy` | la première `validated` |
| `canonical_context` | la première `validated` **avec** `content_markdown` |
| `production` | la première non archivée — **brouillon compris**, pour que le palier 3 existe |

> **Le patron est déjà dans le dépôt** : `scope.plan` ne réécrit pas l'étape leçon → notions, il
> appelle `notions_by_lesson`, celle que la Couverture utilise. *« Deux résolutions jumelles se
> paieraient comme le prédicat de disponibilité s'est payé le 2026-07-30 — une porte ouverte sur du
> vide. »* On applique la même règle un cran plus haut.

### 2. L'ordre par `id` est ABANDONNÉ — et il faut dire ce qu'on perd

`id DESC` signifie « la dernière **créée** ». `(updated_at, id) DESC` signifie « la dernière
**touchée** ». Ce n'est pas la même chose, et le second peut surprendre : rattacher une notion à
une vieille leçon la fait remonter.

**On l'assume**, pour une raison qui n'est pas esthétique : la galaxie utilise déjà cet ordre, elle
est **la surface que Massimo voit**, et une production qui viserait une autre leçon que celle qu'il
atteint produirait du contenu invisible (§Contexte). Entre « surprendre Papa » et « perdre du
contenu en silence », le choix est fait.

### 3. Le périmètre « année active » s'applique AUSSI à la production

Conséquence directe et voulue : ZETIS cesse de pouvoir équiper une leçon d'une année archivée.

⚠️ **C'est un changement de comportement, pas seulement un partage de code**, et il doit être
couvert par un test-verrou : une notion dont la seule leçon appartient à une année close n'est
**pas** équipable, et le motif le dit.

### 4. `equip_notion` n'est PAS modifié dans son comportement

L'addendum ADR-0031 l'interdit, et le motif tient : le Conseil de classe et la composition champion
en dépendent. `_skill_lesson` **délègue** au résolveur partagé au lieu d'écrire sa requête ; aucune
autre ligne de l'orchestrateur ne bouge.

> ⚠️ **Le test de non-régression est nommé d'avance** : les deux appelants historiques doivent
> équiper **exactement les mêmes notions qu'avant** sur un référentiel où chaque notion n'a qu'une
> leçon — c'est-à-dire le cas courant. Ce qui change ne doit changer que là où il y avait
> **ambiguïté**.

### 5. Ce que ce chantier ne fera pas

- **Aucune migration.** Le problème est une divergence de lecture, pas un défaut de modèle.
- **Aucune fusion des trois GATES.** Ils sont justes séparément (§Contexte) ; les unifier
  supprimerait le palier 3.
- **Aucune interdiction de la notion à deux leçons.** L'état est légitime ; ce qui manquait, c'est
  une réponse unique à « laquelle ? ».
- **Pas de préférence pour « la leçon qui a un cours ».** Tentant — ça aurait résolu le cas observé
  — mais ce serait une **quatrième** règle, propre à la production, donc le défaut recommencé.

## Périmètre

**Dans cet ADR** : le résolveur partagé (ordre + périmètre), le branchement des trois appelants,
le test d'accord entre eux, le test-verrou de l'année active, le test de non-régression des deux
appelants historiques.

**Hors de cet ADR** :

- **La notion ORPHELINE** (aucune leçon) — famille voisine, dette distincte, surface Papa à
  concevoir.
- **La duplication `equip_notion` / `equip_piece`** — refactor sans décision produit, son propre
  chantier.
- **`resolve_canonical_context` reçoit un `skill_id`, les générateurs un `lesson_id`** — piège déjà
  documenté (patron quiz), non rouvert ici.

## Conséquences

### Positives

- Le contenu produit est, **par construction**, celui que Massimo atteint. La classe de défaut
  « production invisible » disparaît au lieu d'être surveillée.
- Le cas observé se répare de lui-même : la notion « Discours direct » redevient équipable.
- Un seul endroit à relire le jour où la règle changera.

### Négatives / coûts assumés

- **Changement de comportement de la production** : périmètre d'année, et ordre par `updated_at`.
  Non couvert par les tests existants — d'où les trois verrous du §Périmètre.
- **Une requête de plus** dans les chemins qui filtraient en SQL et filtreront désormais en Python
  sur une petite liste. *On paie la requête, pas la divergence* (ADR-0031 §2, verbatim).
- **La galaxie devient la référence**, donc un module de LECTURE dicte l'ordre à un module
  d'ÉCRITURE. Inhabituel, et pourtant juste : c'est la surface de l'enfant qui définit ce qui
  compte comme « la » leçon.

## Suivi

**Le signal qui dirait qu'on s'est trompé** : Papa constatant que ZETIS équipe une leçon qu'il ne
considère pas comme la bonne. La réponse serait alors de rendre le choix **explicite** (une leçon
canonique désignée sur la notion, donc une migration) — jamais de réintroduire une seconde règle
implicite.
