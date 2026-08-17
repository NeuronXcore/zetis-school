---
id: "0020"
titre: "Conseil de classe IA (narration LLM sur substrat d'évidence + recommandations typées)"
type: surface
statut: accepte
date: 2026-07-06
pr: 46
revoque: []        # à remplir à la main — voir annexes/rapport-revocations.md
revoque_par: []
refs: ["0007", "0008", "0009", "0011", "0014", "0017", "0018", "0021", "0028"]
---
# ADR-0020 — Conseil de classe IA (narration LLM sur substrat d'évidence + recommandations typées)

## Statut

Accepté — 2026-07-06. Ouvert après clôture du chantier Missions (Lots 1+2 mergés,
PR #46/#47). Deuxième consommateur du **service d'évidence** extrait au Lot 2
(ADR-0017 §Suivi) — le premier étant le scoring des missions.

> S'appuie sur : `adr-0008` (frontière locale : aucune donnée de Massimo vers le
> cloud), `adr-0009` (dérogation cloud **étroite** limitée à `curriculum_*` — ne
> s'applique pas ici), `adr-0007`/`adr-0015` (patron de sortie IA **typée et
> versionnée**, jamais de prose à re-parser), `adr-0011` (substrat neutre, plusieurs
> consommateurs), `adr-0017` (le sélecteur quotidien n'est **jamais** transversal ;
> la vue transversale légitime est ici), `adr-0018` (flux Commander preview/confirm,
> réutilisé comme pont d'actionnabilité).

> ### Amendements
>
> | # | Date | Titre | Statut | Révoque |
> |---|---|---|---|---|
> | 1 | 2026-08-05 | Le Conseil de classe peut ne parler que d'une matière | Accepté | — |
>
> *Tableau généré par `scripts/gen_tableau_amendements.py` — ne pas éditer à la main.*

## Contexte

`PRODUCT_SPEC.md` (§Conseil de classe IA) et la maquette
`docs/frontend-papa/page-conseil-classe-ia.md` décrivent une **synthèse périodique
par matière** pour Papa : points forts, points fragiles, évolution, recommandations,
plan d'action. Aujourd'hui la page `ConseilClasseIAPage.tsx` (55 lignes) affiche des
**données mock** (`CLASS_COUNCIL`) ; aucun backend n'existe.

Le Lot 2 des missions a extrait un **service d'évidence** neutre
(`app/modules/evidence/service.py`) : par élève, read-only, déterministe, zéro LLM —
mastery par skill, lacunes ouvertes, verdicts pondérés (ADR-0014), pression SRS,
signal quiz pondéré. L'ADR-0017 le désignait explicitement comme substrat partagé
dont « le Conseil de classe IA sera le second consommateur ».

Le sujet de cet ADR : **comment ZETIS produit cette synthèse sans trahir ses
principes** — évidence calculée (pas hallucinée), narration bienveillante, 100 %
local (données privées de Massimo), et un **pont typé vers les missions** plutôt
qu'un mur de texte inerte.

Deux tensions structurent la décision :
1. **Le conseil doit décider peu et narrer beaucoup.** Le sélecteur de missions
   (ADR-0017) est déterministe et rejouable *parce qu'il ne parle pas*. Le conseil,
   lui, *parle* — donc il introduit du LLM. La ligne de partage : le LLM **narre et
   hiérarchise** une évidence **déjà calculée** ; il ne calcule ni n'invente aucune
   donnée pédagogique.
2. **Le conseil n'est pas l'élection.** L'élection ne stocke rien (déterministe →
   rejouable). Le conseil **ne peut pas** être rejoué à l'identique (deux générations
   LLM diffèrent) : son auditabilité exige de **figer** l'artefact et l'évidence qui
   l'a produit. C'est la différence qui impose une persistance ici, refusée là-bas.

## Alternatives considérées

- **LLM calcule l'évaluation lui-même** (on lui donne les traces brutes, il déduit
  mastery/lacunes) : inauditable, non ancré, réintroduit l'hallucination que le
  substrat d'évidence existe précisément pour éliminer. → Écarté (même motif que le
  refus du planificateur LLM en ADR-0017).
- **Rapport transient, régénéré à la demande** (comme l'élection) : séduisant par
  symétrie, mais faux — l'élection est déterministe (rejouable sans stockage), une
  génération LLM ne l'est pas. Un rapport « Trimestre 1 » qui change à chaque
  affichage n'est pas un compte rendu. L'« évolution récente » et l'export exigent en
  outre un historique. → Écarté au profit d'un artefact **figé**.
- **Narration cloud** (meilleure qualité de prose) : le conseil lit l'évidence privée
  de Massimo (mastery, lacunes, verdicts). Aucune de ces données ne sort du serveur
  (ADR-0008). La dérogation ADR-0009 est **étroite** (`curriculum_*`, zéro donnée
  élève) et ne couvre pas ce cas. → Écarté ; 100 % local via `get_provider()`.
- **Sortie en prose libre à re-parser pour créer des missions** : fragile, non typé,
  contraire au patron ADR-0007/0015. → Écarté ; recommandations **typées**.
- **Le conseil crée directement des missions croisées multi-matières** : les croisées
  cassent l'invariant de verdict mono-notion (ADR-0017 §5bis) et attendent leur ADR
  dédié. → Hors périmètre ; v1 = recommandations **mono-notion** via le fan-out
  Commander existant.

## Décision

1. **Nature : artefact analytique Papa-only.** Massimo ne voit **jamais** le conseil
   (CLAUDE.md — analyses parentales, diagnostics : réservés à Papa). La page vit dans
   `frontend-papa` uniquement. Aucun schéma de sortie côté élève.

2. **Architecture : narration LLM posée sur le substrat d'évidence.** Le service du
   conseil (nouveau module `app/modules/reports`) **compose l'évidence calculée**
   (`evidence.mastery_by_skill`, `open_gaps`, `recent_verdicts`, `weighted_quiz_signal`,
   `srs_pressure`) en un **contexte structuré**, le passe au LLM local, et n'attend de
   lui que : (a) une **narration** par matière + globale, (b) une **hiérarchisation**
   des notions fragiles en recommandations. Le LLM **ne choisit pas de `skill_id`
   librement** : il sélectionne et justifie **parmi les notions fragiles fournies**
   (id + nom + mastery + signaux). Tout `skill_id` de sortie est **validé contre
   l'évidence** ; un id absent est ignoré (garde-fou anti-hallucination, patron des
   notions décochables ADR-0018).

3. **100 % local, sortie typée versionnée** (patron ADR-0007/0015) :
   - provider via `get_provider()` (Ollama/MLX) — **jamais** `get_curriculum_provider()` ;
   - prompt **pur et versionné** `app/prompts/council.py` (`COUNCIL_PROMPT_VERSION`) ;
   - schéma Pydantic `CouncilReportSpec` (`extra="forbid"`), appel `generate(fmt=schema)`,
     **une** réparation sur échec de validation, puis erreur explicite ;
   - trace `AIJob` (`job_type="council_generate"`, version prompt + bornes de période) ;
   - `think:false` (qwen3) hérité du provider.

4. **Contrat de sortie (typé, deux niveaux)** :
   ```txt
   CouncilReportSpec:
     global_summary: str                      # narration globale, vocabulaire bienveillant
     subjects: [
       { subject_id, subject_name,
         strengths: str, to_reinforce: str,    # narration par matière
         recent_evolution: str,                # texte (comparatif = slice 2)
         recommendations: [
           { skill_ids: [int],                 # ancrés sur l'évidence, validés serveur
             mission_type: "manual",           # mono-notion en v1 (voir déc. 6)
             template_hint: str | null,        # "recall_first" | "discovery_first" | null
             justification: str }              # « maîtrise en construction, 2 quiz sous le seuil »
         ] }
     ]
   ```
   Le **vocabulaire bienveillant** (CLAUDE.md : « notion à renforcer », jamais « nul »/
   « échec ») est **exigé par le prompt** — mais **non garanti par construction** (c'est
   du LLM). Mitigation : Papa est le **seul lecteur** (aucun enfant exposé), et le
   prompt cadre strictement le registre. Pas de gate anti-exposition-enfant nécessaire.

5. **Persistance (nouvelle table `council_reports`, migration dédiée)** — car un
   artefact LLM n'est pas rejouable et doit être figé pour être auditable, comparé et
   exporté :
   ```txt
   council_reports:
     id, student_id, period (str, ex. "2026-T1"),
     period_start_at, period_end_at,
     global_summary (text), subjects_json (jsonb),      # la Spec validée
     prompt_version (str), evidence_snapshot_json (jsonb),  # évidence figée = auditabilité
     created_by ("ai"), created_at
   ```
   `evidence_snapshot_json` fige l'évidence au moment de la génération : on peut
   répondre après coup à « sur quelles données ce conseil s'appuyait-il ? ». Routes :
   `POST /api/reports/class-council` (génère + persiste), `GET /api/reports/class-council?period=`
   (liste/dernier), `GET /api/reports/class-council/{id}` (détail), export Markdown
   **dérivé côté client** (pas de nouvelle route).

6. **Actionnabilité = pont vers les missions via Commander (ADR-0018), mono-notion.**
   Une recommandation → bouton « Créer ces missions » → réutilise
   `missions.command.create_command_missions(skill_ids=…)` **tel quel** : fan-out
   d'**une mission `manual` mono-skill par notion** (`validation_status='validated'`
   par construction — l'humain a cliqué). **La validation Papa exigée pour le contenu
   scolaire (CLAUDE.md) se matérialise à ce clic**, pas sur le rapport narratif. Aucune
   mission croisée multi-notions en v1 (attend l'ADR croisées). Priorité forcée /
   échéance optionnelles, comme Commander.

7. **Période : minimale, non sur-modélisée (YAGNI).** La génération reçoit un `period`
   (label + bornes, dérivables de l'année scolaire active) ; on **ne crée pas** de
   modèle `SchoolPeriod` riche en v1. Un tel modèle viendra si/quand plusieurs
   consommateurs en auront besoin.

## Périmètre

**v1** : module `reports` + service de composition d'évidence + prompt versionné +
génération typée locale + persistance `council_reports` + 3 routes Papa + pont
Commander (recommandations → missions mono-notion) + branchement de la page
`ConseilClasseIAPage` (mock → réel, fetchers + hook, style Papa sombre) + export
Markdown client.

**Hors v1** (slices/ADR ultérieurs) : « évolution récente » **comparative** (nécessite
≥2 rapports — narration simple en v1, diff calculé plus tard) ; « attitude de travail »
(pas de données comportementales fiables aujourd'hui) ; **missions croisées** (ADR
dédié — le conseil en sera le porteur légitime) ; porte (i) « Recommandation retenue »
d'ADR-0018 (elle dépend de cette page — se débloque avec cet ADR).

## Conséquences

### Positives
- Le **substrat d'évidence** trouve son second consommateur sans duplication (ADR-0011
  tenu) : un calcul, deux usages (sélecteur + conseil).
- Débouché **actionnable** : la synthèse n'est pas un mur de texte, elle crée des
  missions par le flux humain déjà validé (Commander).
- **Auditable** : version de prompt + snapshot d'évidence figés → « pourquoi ce conseil
  ce jour-là » a une réponse.
- Débloque la porte (i) d'ADR-0018 (recommandation → mission).

### Négatives / coûts
- **Coût LLM par génération** (contrairement à l'élection gratuite) : assumé, c'est une
  action Papa ponctuelle, pas quotidienne.
- **Narration non garantie bienveillante** (LLM) : mitigée par le prompt + Papa seul
  lecteur ; pas de garantie-par-construction comme les `reason` templates des missions.
- **Nouvelle table + migration** ; premier objet IA **persisté** validé sans gate
  enfant (le gate humain est au confirm des missions).
- Les premières générations demanderont un **réglage de prompt** (registre, densité) —
  chaque changement = bump `COUNCIL_PROMPT_VERSION`.

## Suivi

- **Docs** : ligne dans `DECISIONS.md` ; `API_SPEC.md` (nouvelles routes `reports`) ;
  la maquette `page-conseil-classe-ia.md` reste valable (sections inchangées).
- **Slice A backend** : module `reports` (schemas + service + prompt versionné +
  migration `council_reports` + 3 routes + réutilisation `create_command_missions`),
  100 % local, tests (composition d'évidence déterministe, validation typée +
  réparation, ancrage `skill_id` sur l'évidence, pont Commander). Prompt Claude Code
  dédié à écrire **après validation de cet ADR**.
- **Slice B frontend Papa** : `lib/councilClass.ts` + `hooks/useCouncilClass.ts` +
  refonte `ConseilClasseIAPage` (mock → réel, boutons « Générer » / « Créer ces
  missions » / « Exporter Markdown »), style sombre `papa-*`.
- Ordre roadmap ADR-0017 respecté : `Lot 2 → Conseil de classe → Lot 3`.

## Décisions validées (commanditaire, 2026-07-06)

1. **Persistance** : **persister** (table `council_reports`, déc. 5) — retenu. Motif :
   artefact LLM non rejouable + export + évolution.
2. **Actionnabilité v1** : recommandations → missions **mono-notion** via Commander
   (déc. 6) — retenu ; croisées différées à leur ADR.
3. **« Évolution récente »** : narration simple en v1, **diff comparatif reporté**
   (déc. 7 / Hors v1) — retenu.

---

## Amendement 1 — Le Conseil de classe peut ne parler que d'une matière — 2026-08-05

> Fusionné depuis **Amendement 1** le 2026-08-16. Statut d'origine : **Accepté**.

### Statut

Accepté — 2026-08-05.

> S'appuie sur : `adr-0020` (le Conseil, la narration LLM sur évidence calculée, l'ancrage
> anti-hallucination, le rapport figé), `adr-0021` (l'équipement auto-validé avant création),
> `adr-0028-dashboard-papa-agregat-unique` (Amendement 1) (le panneau d'où part le bouton), `adr-0008` (le
> provider local).
>
> **Une migration Alembic** — `council_reports.subject_id`, nullable, sans backfill.
> **Une version de prompt** — `COUNCIL_PROMPT_VERSION` passe à `v2`.

### Contexte

Le Conseil de classe rend une synthèse de **toutes** les matières ayant de l'évidence. C'est ce
qu'on voulait : un bilan trimestriel se lit d'un bloc.

Le panneau d'analyse par matière change la question. Papa y regarde **une** matière, notion par
notion, et veut une phrase écrite sur **celle-là**. Aujourd'hui il n'a que deux choix : lire la
section correspondante du dernier rapport figé — qui peut dater — ou régénérer une synthèse de huit
matières pour en lire une.

#### Trois faits vérifiés qui cadrent la décision

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

### Décision

#### §1 — `subject_id` optionnel, et `extra="forbid"` n'y fait pas obstacle

`extra="forbid"` rejette les champs **non déclarés**. Un champ **déclaré et optionnel** ne casse
rien : `{}` et `{"period": "T1"}` restent valides, et le client existant continue de passer sans
une ligne de modification.

```
period: str | None = None
subject_id: int | None = None   # None = conseil GLOBAL, comportement historique inchangé
```

#### §2 — Un seul point de filtrage, et il porte sur `Skill.subject_id`

La restriction se fait dans `_build_context`, juste après la résolution de la notion, en écartant
celles dont la matière ne correspond pas.

**Sur `skill.subject_id`, et non sur la colonne du `Gap`** : c'est déjà la clé de groupement de
`per_subject`, donc de `subjects_ctx`, donc de `allowed_subject_ids`. Filtrer ailleurs laisserait
passer une notion dont le rapport ne saurait plus de quelle matière elle est.

> ⚠️ **Le panneau d'analyse, lui, attribue les lacunes par `Gap.subject_id`** — comme le dashboard
> et `/lacunes`. Les deux conventions coexistent et peuvent diverger, l'écriture ne les contraignant
> pas (`diagnostics/service.py` écrit `subject_id=quiz.subject_id`). Cet addendum **ne résout pas**
> cette divergence : il la **nomme**, et un test la borne.

#### §3 — L'ancrage n'a rien à changer, et c'est précisément pour ça qu'il faut un test

`allowed_subject_ids` est **dérivé** de `subjects_ctx`. Restreindre le contexte restreint donc
l'ancrage **gratuitement** : un modèle qui nommerait une autre matière verrait sa sortie rejetée
sans une ligne de code dédiée.

> 🔴 Cette gratuité est exactement le genre de propriété qu'un refactor casse en silence. Il suffit
> que quelqu'un calcule `allowed_subject_ids` avant le filtrage « pour clarifier », et l'ancrage
> laisse passer toutes les matières sans qu'aucun test ne rougisse. **Un verrou dédié est donc
> obligatoire** : un provider factice qui renvoie une matière valide mais hors portée doit produire
> un rapport vide.

#### §4 — Le plafond de notions s'élève en portée matière, et la troncature se déclare

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

#### §5 — La portée vit dans une COLONNE, pas dans le libellé de période

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

#### §6 — Le prompt change, donc sa version change

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

#### §7 — Dégradation gracieuse, recadrée

Quand le contexte est vide, le Conseil n'appelle pas le modèle et rend un message serein. En portée
matière, ce message doit être **cadré sur la matière** : dire « pas encore assez de données pour un
conseil de classe » à propos d'une seule matière laisserait croire que toute la scolarité est
muette.

#### §8 — Deux boutons, deux libellés, et ce n'est pas de la cosmétique

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

### Ce que cet addendum ne fait pas

- **Il ne donne pas de fenêtre temporelle à l'évidence.** Le `period` reste un libellé, et c'est
  maintenant écrit.
- **Il n'ajoute pas de mode aperçu.** Le figeage systématique reste la doctrine de l'ADR-0020 : un
  rapport LLM n'est pas rejouable.
- **Il ne touche ni à `equip-notion`, ni à `create-missions`, ni à `create-champion`** : ces routes
  travaillent sur des `skill_ids` déjà ancrés.
- **Il ne résout pas la divergence `Gap.subject_id` / `Skill.subject_id`** — nommée au §2, bornée
  par un test.
- **Il ne rouvre pas l'ADR-0021** (équipement auto-validé avant création de missions).

### Le signal qui dirait qu'on s'est trompé

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
