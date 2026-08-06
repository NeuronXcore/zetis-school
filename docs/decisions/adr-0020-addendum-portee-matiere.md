# Addendum ADR-0020 — Le Conseil de classe peut ne parler que d'une matière

## Statut

Accepté — 2026-08-05.

> S'appuie sur : `adr-0020` (le Conseil, la narration LLM sur évidence calculée, l'ancrage
> anti-hallucination, le rapport figé), `adr-0021` (l'équipement auto-validé avant création),
> `adr-0028-addendum-analyse-par-matiere` (le panneau d'où part le bouton), `adr-0008` (le
> provider local).
>
> **Une migration Alembic** — `council_reports.subject_id`, nullable, sans backfill.
> **Une version de prompt** — `COUNCIL_PROMPT_VERSION` passe à `v2`.

## Contexte

Le Conseil de classe rend une synthèse de **toutes** les matières ayant de l'évidence. C'est ce
qu'on voulait : un bilan trimestriel se lit d'un bloc.

Le panneau d'analyse par matière change la question. Papa y regarde **une** matière, notion par
notion, et veut une phrase écrite sur **celle-là**. Aujourd'hui il n'a que deux choix : lire la
section correspondante du dernier rapport figé — qui peut dater — ou régénérer une synthèse de huit
matières pour en lire une.

### Trois faits vérifiés qui cadrent la décision

1. 🔴 **Aucun filtrage par matière n'existe, à aucun niveau.** `GenerateCouncilRequest` n'a que
   `period`, en `model_config = ConfigDict(extra="forbid")` — envoyer un `subject_id` provoque
   aujourd'hui un **422**. `_build_context` prend `(db, student, period)`. `GET /class-council` ne
   filtre que par `period`. Le rapport figé contient toutes les matières.

2. 🔴 **Le `period` transmis ne sélectionne AUCUNE donnée.** `reports/service.py` le dit en
   commentaire : *« Évidence à l'instant (v1 : état courant, pas de fenêtre temporelle). »* Aucune
   fonction d'évidence ne le reçoit. Il est injecté dans le prompt et stocké dans
   `CouncilReport.period` — c'est une **étiquette**, rien de plus.

   > ⚠️ L'ADR-0028 §7 justifie pourtant le transport de la période par *« sinon le Conseil
   > raconterait un trimestre quand Papa regardait sept jours »*. Dans les faits, **le Conseil
   > raconte toujours l'état courant**, quelle que soit la période transmise ; seul le vocabulaire
   > du modèle change. La divergence est **constatée ici**, et tranchée au §6.

3. **Il n'existe aucun mode aperçu.** `POST /class-council` fige systématiquement un
   `CouncilReport` avec son `evidence_snapshot_json`. C'est assumé par le module : *« un rapport
   LLM n'est pas rejouable, l'auditabilité vient du figeage. »* Un bouton « conseil sur cette
   matière » est donc un bouton qui **écrit**, avec 1 à 2 appels LLM locaux à 120 s de timeout
   chacun.

## Décision

### §1 — `subject_id` optionnel, et `extra="forbid"` n'y fait pas obstacle

`extra="forbid"` rejette les champs **non déclarés**. Un champ **déclaré et optionnel** ne casse
rien : `{}` et `{"period": "T1"}` restent valides, et le client existant continue de passer sans
une ligne de modification.

```
period: str | None = None
subject_id: int | None = None   # None = conseil GLOBAL, comportement historique inchangé
```

### §2 — Un seul point de filtrage, et il porte sur `Skill.subject_id`

La restriction se fait dans `_build_context`, juste après la résolution de la notion, en écartant
celles dont la matière ne correspond pas.

**Sur `skill.subject_id`, et non sur la colonne du `Gap`** : c'est déjà la clé de groupement de
`per_subject`, donc de `subjects_ctx`, donc de `allowed_subject_ids`. Filtrer ailleurs laisserait
passer une notion dont le rapport ne saurait plus de quelle matière elle est.

> ⚠️ **Le panneau d'analyse, lui, attribue les lacunes par `Gap.subject_id`** — comme le dashboard
> et `/lacunes`. Les deux conventions coexistent et peuvent diverger, l'écriture ne les contraignant
> pas (`diagnostics/service.py` écrit `subject_id=quiz.subject_id`). Cet addendum **ne résout pas**
> cette divergence : il la **nomme**, et un test la borne.

### §3 — L'ancrage n'a rien à changer, et c'est précisément pour ça qu'il faut un test

`allowed_subject_ids` est **dérivé** de `subjects_ctx`. Restreindre le contexte restreint donc
l'ancrage **gratuitement** : un modèle qui nommerait une autre matière verrait sa sortie rejetée
sans une ligne de code dédiée.

> 🔴 Cette gratuité est exactement le genre de propriété qu'un refactor casse en silence. Il suffit
> que quelqu'un calcule `allowed_subject_ids` avant le filtrage « pour clarifier », et l'ancrage
> laisse passer toutes les matières sans qu'aucun test ne rougisse. **Un verrou dédié est donc
> obligatoire** : un provider factice qui renvoie une matière valide mais hors portée doit produire
> un rapport vide.

### §4 — Le plafond de notions s'élève en portée matière, et la troncature se déclare

`_MAX_NOTIONS_PER_SUBJECT = 8` borne un prompt où huit matières se partagent le budget de jetons.
En portée matière, il n'y a plus qu'une matière : le budget libéré permet d'en montrer davantage.
**16.**

Le panneau d'analyse, lui, reste **non plafonné**. Les deux nombres diffèrent donc, et cette
différence doit être **écrite, pas gommée** :

```
context["scope"] = { subject_id, subject_name, notions_available, notions_considered }
```

> Sans ces deux compteurs dans `evidence_snapshot_json`, un rapport ciblé qui ignore 7 notions sur
> 23 est **indiscernable** d'un rapport complet. L'auditabilité du figeage est le seul argument qui
> justifie l'absence de mode aperçu — elle ne tient que si ce qui a été écarté est consigné.

L'interface le dit à Papa : *« le conseil s'est appuyé sur 16 des 23 notions »*.

### §5 — La portée vit dans une COLONNE, pas dans le libellé de période

Migration : `council_reports.subject_id`, entier **nullable**, clé étrangère vers `subjects`, index
`(student_id, subject_id)`. **`NULL` = rapport global** — donc aucun backfill, tous les rapports
existants sont déjà corrects.

Deux options écartées :

| Option | Pourquoi non |
|---|---|
| Encoder la portée dans `period` (« Mathématiques · Bilan ») | `list_reports` filtre sur l'égalité de `period` et le client l'affiche en titre. On polluerait le filtre **et** la portée resterait non requêtable |
| La lire dans `evidence_snapshot_json["scope"]` | Il faudrait charger le JSON de chaque ligne pour filtrer une liste. Non indexable. **On l'y écrit quand même**, pour l'audit — mais ce n'est pas la source de la requête |

`GET /class-council` gagne un `subject_id` optionnel. **Absent = tout, global et ciblés
confondus** — rétrocompatible : le client actuel ne passe rien et continue de tout voir. Chaque
élément de liste porte `subject_id` / `subject_name`, pour que le client puisse grouper sans un
troisième état d'API.

> ⚠️ **Aucun test n'exercera cette migration** : le `conftest` construit le schéma par
> `Base.metadata.create_all`, jamais par `alembic upgrade`. Un `alembic upgrade head` manuel sur la
> base de dev fait partie du lot, et un test de fumée sur le modèle ORM attrape au moins l'oubli de
> la colonne côté Python.

### §6 — Le prompt change, donc sa version change

`COUNCIL_PROMPT_VERSION = "v2"`. Les rapports existants gardent `v1` — aucune migration de données,
et la comparaison entre générations reste possible.

Le prompt reçoit une contrainte de périmètre explicite : *ce conseil porte uniquement sur X ;
n'inclus aucune autre matière ; le résumé global résume CETTE matière seule et ne la compare pas à
d'autres dont tu n'as pas les données.* La borne « au plus 2 recommandations par matière » monte à
3 en portée matière — deux, c'était le partage d'un budget entre huit sujets.

**Sur le `period` (fait n°2 du contexte), la décision est de ne pas mentir** : tant que l'évidence
reste sans fenêtre temporelle, ni le panneau ni le rapport ciblé n'écrivent « sur la période » à
côté des notions à renforcer. La spec de la page dit désormais que le `period` est un **libellé**.
Lui donner un vrai effet est un chantier à part, qui rouvrirait le service d'évidence.

### §7 — Dégradation gracieuse, recadrée

Quand le contexte est vide, le Conseil n'appelle pas le modèle et rend un message serein. En portée
matière, ce message doit être **cadré sur la matière** : dire « pas encore assez de données pour un
conseil de classe » à propos d'une seule matière laisserait croire que toute la scolarité est
muette.

### §8 — Deux boutons, deux libellés, et ce n'est pas de la cosmétique

Le CTA existant du nuage — *« Analyser X dans le conseil de classe »* — ne fait que **naviguer**.
L'ADR-0028 §7 est explicite : *« le clic n'ouvre jamais une génération LLM. »*

> 🔴 Ajouter dans le panneau un bouton qui **génère**, sous un libellé voisin, c'est fabriquer le
> clic accidentel à quatre minutes.

- CTA de navigation → **« Ouvrir le conseil de classe — {matière} »**
- Bouton de génération → **« Demander une synthèse écrite sur {matière} »**, avec son ordre de
  grandeur (`~18 s`) et une confirmation.

La confirmation n'est **pas** `danger` : rien n'est détruit, un rapport est ajouté. Elle annonce en
revanche trois choses — la durée réelle possible, le fait que le rapport ira dans l'historique, et
que **Papa peut quitter la page**.

> ⚠️ **Limite connue, assumée** : la génération n'a **aucun identifiant de run** côté backend. Il
> n'existe pas de `/runs/active` pour le Conseil, donc **aucun sondage n'est possible** et rien ne
> peut signaler ailleurs qu'une synthèse est en cours. La phrase de la confirmation *remplace* un
> dispositif absent — c'est un contrat annoncé avant l'engagement, pas une fonctionnalité.
>
> **Déclencheur de réouverture** : le jour où une génération ciblée est lancée puis oubliée, il
> faudra doter le Conseil d'un `ProductionRun` comme la production en lot.

## Ce que cet addendum ne fait pas

- **Il ne donne pas de fenêtre temporelle à l'évidence.** Le `period` reste un libellé, et c'est
  maintenant écrit.
- **Il n'ajoute pas de mode aperçu.** Le figeage systématique reste la doctrine de l'ADR-0020 : un
  rapport LLM n'est pas rejouable.
- **Il ne touche ni à `equip-notion`, ni à `create-missions`, ni à `create-champion`** : ces routes
  travaillent sur des `skill_ids` déjà ancrés.
- **Il ne résout pas la divergence `Gap.subject_id` / `Skill.subject_id`** — nommée au §2, bornée
  par un test.
- **Il ne rouvre pas l'ADR-0021** (équipement auto-validé avant création de missions).

## Le signal qui dirait qu'on s'est trompé

- **Plus personne ne génère de conseil global.** Le bilan trimestriel transversal serait mort de sa
  belle mort, remplacé par huit synthèses qui ne se parlent pas — or la valeur du Conseil était de
  **croiser** les matières. Il faudrait alors reposer la question de ce que le Conseil est.
- **L'historique se remplit de rapports ciblés jetables.** Le figeage sert l'auditabilité ; s'il ne
  sert plus qu'à empiler, c'est le mode aperçu qu'il faut rouvrir, pas la portée qu'il faut
  restreindre.
- **`notions_considered` reste durablement inférieur à `notions_available`.** Le plafond de 16
  serait mal calibré, ou la matière trop large pour un seul rapport.
- **Quelqu'un lance deux synthèses sur la même matière parce qu'il a oublié la première.** Le
  déclencheur du §8 est atteint : il faut un identifiant de run.
