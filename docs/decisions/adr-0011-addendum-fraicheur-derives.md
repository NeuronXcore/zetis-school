# Addendum ADR-0011 — §E · Fraîcheur des dérivés (péremption)

> À concaténer à la fin de `docs/decisions/adr-0011-contexte-canonique-partage.md`.
> Statut : **Accepté — 2026-07-28**. Ne modifie aucune décision §1–§5 ; les **complète**
> sur l'axe temporel. Prérequis du chantier « Couverture de production » (page Papa).
> **Amende l'ADR-0021 §5** (idempotence de l'équipement) — voir §E.6.

## Contexte

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

## Décision

### E.1 — Définition : un dérivé est *périmé* si sa source a changé après lui

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

### E.2 — Le périmé est **signalé**, jamais déclassé automatiquement

Un déclassement automatique en `pending` retirerait du contenu à Massimo sans acte de
Papa — exactement ce que la co-construction (ADR-0009 §3) refuse, et un effet de bord dans
un module dont le §1 dit qu'il est *read-only*. Le périmé produit donc :

- un **badge** dans la page Couverture et dans les pages de pilotage concernées ;
- une **action proposée** (↻ Régénérer), jamais exécutée d'office ;
- **aucune modification** du service à Massimo.

Corollaire assumé : un dérivé périmé continue d'être servi tant que Papa n'a pas tranché.
C'est le prix de la règle « ZETIS ne retire rien unilatéralement ». Il est acceptable
parce que la dérive est désormais **visible** — c'est tout ce qui manquait.

### E.3 — Une colonne, et une seule : `lessons.content_updated_at`

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

### E.4 — Côté dérivé, la référence temporelle est `updated_at`

`fiches.updated_at`, `mindmaps.updated_at`, `quizzes.updated_at`. Conséquence assumée :
si Papa **édite** un dérivé après un changement de cours, celui-ci redevient « frais » sans
avoir été relu contre le nouveau cours. Approximation acceptée — Papa a touché l'objet
postérieurement au changement, on le présume informé. Le cas inverse (faux négatif) est
sans danger ; c'est le faux positif que E.3 élimine.

### E.5 — Hors périmètre : les dérivés notion-centrés

Cartes SRS et capsules ne dérivent pas d'**une** leçon mais d'une notion, dont le résolveur
peut désigner une leçon différente au fil du temps (tie-break par récence, §C / cf.
« Négatives » de l'ADR-0011). La règle de péremption ne s'y applique pas telle quelle. En
V1 : la page Couverture les affiche en **fraction de notions couvertes**, sans état de
fraîcheur. Une extension exigerait de persister le `lesson_id` réellement utilisé à la
génération — la trace existe déjà dans `ai_jobs.output_json` (§3), mais l'exploiter comme
donnée métier est un choix à part. **Addendum ultérieur si le besoin se confirme.**

## À vérifier sur pièce avant implémentation

- Les routes élève des dérivés filtrent-elles la **chaîne** (`lesson.status == 'validated'`)
  ou seulement le statut du dérivé ? Si seul le dérivé est filtré, une leçon repassée en
  `draft` (ou archivée) laisse ses fiches/mindmaps servies — un second angle mort, plus
  grave que la péremption, à traiter dans le même geste.
- `quizzes` porte-t-il bien un `updated_at` exploitable (les questions ont le leur) ?

## Conséquences

**Positives** — la cohérence de la lignée de dérivés devient un état **observable** et non
plus un espoir ; la règle est écrite une fois, en fonction pure testable, au même endroit
que le gate qu'elle complète ; la page Couverture obtient sa quatrième colonne d'état sans
logique dispersée ; toute nouvelle famille de dérivés leçon-centrés en hérite gratuitement.

**Négatives / coûts** — une colonne et une migration (l'ADR-0011 n'en demandait aucune) ;
deux chemins d'écriture à ne pas oublier (verrouillés par test) ; un dérivé périmé reste
servi jusqu'à décision humaine (E.2) ; les dérivés notion-centrés restent sans signal (E.5).

### E.6 — Premier consommateur réel : l'idempotence de l'équipement (ADR-0021 §5)

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

## Suivi

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

## Décisions validées (commanditaire, 2026-07-28)

1. **Le périmé est signalé, jamais déclassé automatiquement** — ZETIS ne retire rien
   unilatéralement à Massimo ; le coût (un dérivé périmé reste servi jusqu'à arbitrage) est
   assumé parce que la dérive est désormais visible — retenu.
2. **Colonne dédiée `content_updated_at`** plutôt que `lessons.updated_at` (trop bruyant :
   un renommage marquerait périmés tous les dérivés) — retenu, malgré la migration.
3. **§E.6 — amendement de l'ADR-0021 §5** : l'idempotence de l'équipement devient « déjà
   validé **et frais** » ; une pièce `pending` **et** périmée est **régénérée, jamais
   validée** — retenu. Changement de comportement sur du code livré, assumé.
4. **Dérivés notion-centrés (cartes SRS, capsules) hors périmètre** de la fraîcheur — retenu.
