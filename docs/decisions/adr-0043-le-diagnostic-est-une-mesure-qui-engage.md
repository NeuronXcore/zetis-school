# ADR-0043 — Le diagnostic est une mesure qui engage : il sort de l'évaluation éphémère

## Statut

**Accepté — 2026-08-08.** Les huit décisions sont **gelées**.

> Historique : Proposé — 2026-08-08, **le même jour**. Le chantier a été cadré par la maquette puis
> la spec avant l'ADR (rituel `mockup → spec → ADR → prompt`), et l'amendement de l'`adr-0014` a été
> soumis au commanditaire **avant** toute écriture de code — c'est ce qui autorise l'acceptation
> sans délai.

⚠️ **Accepté ≠ livré.** La décision est figée ; **rien n'est implémenté**. Le chantier est décrit
par `prompts/claude-code/prompts-claude-code-adr-0043.md`, en trois sessions, et n'a pas démarré.
Ne pas lire ce statut comme « c'est en place ».

> **Amende l'`adr-0014` Décision 2** (voir Décision 1). Ne la révoque pas : il en sort **un seul**
> type de quiz, sur un motif que la décision d'origine n'avait pas examiné.
>
> S'appuie sur : `adr-0014` (le moteur de quiz unifié et sa doctrine de validation),
> `adr-0039` (la file de relecture et ses cinq familles), `adr-0042` (la notion orpheline devient
> équipable — prérequis de ce chantier), `adr-0011 §1` (le substrat canonique),
> `adr-0040` (Progression nomme les notions et date leurs mouvements),
> `adr-0028 §9` (aucune note globale, aucun classement).
>
> Maquette : `docs/frontend-papa/mockup/mockup-papa-diagnostic-v3.html`.
> Spec : `docs/frontend-papa/page-diagnostic.md`.

## Contexte

Le diagnostic est la porte d'entrée du cycle pédagogique : il **ouvre les lacunes** qui deviennent
des missions. C'est la seule source de `Gap` avec le chat, et la seule à écrire `SkillMastery` en
**écrasement brut** — le « signal fort », par opposition au signal faible du quiz de fin de cours,
pondéré à `0.4` et qui n'ouvre jamais de lacune.

Sa page Papa, elle, n'a jamais dépassé l'étape 14 : 149 lignes, un `<select>`, un bouton, des
cartes. Elle **transmet et n'affiche pas** la date d'une passation, le palier de maîtrise, le
palier « acquise ». Elle ne sait comparer aucune passation à une autre.

Le chantier `adr-0042` vient de lever le verrou en amont : une lacune ouverte sur une notion de
niveau antérieur peut désormais se refermer. Il devient donc utile de regarder ce que le
diagnostic mesure — et à quel titre.

## Constat read-before-code

Établi contre le code réel les 2026-08-07 et 08, **avant** toute écriture. Trois constats
commandent la décision ; les autres sont consignés au `BACKLOG.md` sans être traités.

### 1. 🔴 L'exemption de l'ADR-0014 repose sur une prémisse fausse pour le diagnostic

L'`adr-0014` Décision 2 sort les questions de quiz du gate de validation. Sa phrase exacte :

> *« Les **questions de quiz** sont du contenu d'évaluation éphémère : **dérivées d'un substrat
> déjà validé**, elles sont servies sans relecture unitaire, en contrepartie de trois garanties :
> (a) traçabilité complète (`ai_jobs` + `lesson_id`/`lesson_title` source dans `output_json`) ;
> (b) passe d'auto-vérification à la génération ; (c) inspection a posteriori côté Papa avec
> retrait d'une question défectueuse. »*

**Le diagnostic ne dérive d'aucun substrat validé.** `generate_diagnostic` construit son prompt sur
**quatre scalaires** (`diagnostics/service.py:112-117`) :

```python
prompt = DIAGNOSTIC_GEN_PROMPT_V1.format(
    n=QUESTIONS_PER_SKILL, subject=subject.name, skill=skill.name,
    level=skill.level or level or "4e",
)
```

Ni `resolve_canonical_context`, ni cours, ni chunk RAG, ni la moindre leçon. Un quiz de fin de
cours, lui, force sa leçon dans le contexte (`quizzes/service.py:144`). **La condition de
l'exemption est vraie pour le quiz de cours et fausse pour le diagnostic.**

### 2. 🔴 Et les trois garanties de contrepartie sont **toutes** inhonorées

| Garantie exigée par l'ADR-0014 | État réel pour le diagnostic |
|---|---|
| (a) traçabilité complète, `lesson_id`/`lesson_title` dans `output_json` | `output_json = {"questions_count": total}` (`service.py:160`). **Rien d'autre**, et aucune leçon puisqu'il n'y en a pas |
| (b) passe d'auto-vérification à la génération | **Zéro occurrence** de l'auto-vérification dans le module. Le seul filtre est `len(choices) < 2` (`service.py:124`) |
| (c) retrait a posteriori d'une question défectueuse par Papa | **Aucune route.** Les six routes du module ne portent aucun geste Papa sur une question |

L'`adr-0014` conclut : *« Ceci régularise le précédent de l'étape 14 (diagnostic) **sans le
modifier**. »* Il l'a régularisé **administrativement**, sans vérifier que la justification s'y
appliquait. Elle ne s'y appliquait pas.

### 3. Ce que la page ne peut pas dire aujourd'hui, et pourquoi

- **La date** — `completed_at` transmis, jamais affiché : deux diagnostics d'une même matière sont
  indistinguables.
- **Le palier** — `status` transmis, jamais lu ; la page recolorie depuis le score avec ses propres
  bornes, et le palier `acquise` (≥ 90) **n'existe pas à l'écran**.
- **L'état d'une lacune** — `_per_skill_for_attempt` (`service.py:439-442`) **recalcule** les
  lacunes depuis les réponses de la passation et **ne lit jamais la table `gaps`**. Une lacune
  résolue continue de s'afficher, à jamais, alors que le docstring promet « lacunes ouvertes ».
- **Toute comparaison** entre passations.

### 4. La granularité des scores est de trois valeurs

`QUESTIONS_PER_SKILL = 2` ⇒ un score par notion ne peut valoir que **0, 50 ou 100**. Et si le
modèle n'en rend qu'une exploitable, une notion peut être déclarée **lacune grave sur une seule
question ratée**.

### 5. Le diagnostic mesure toujours les huit mêmes notions

`select(Skill).where(subject_id).order_by(Skill.id)[:MAX_SKILLS]` — les **8 plus petits `id`**,
c'est-à-dire les 8 premières entrées au référentiel. Aucune rotation. Sur ~280 notions au
catalogue, une passation ne dit rien des 272 autres. Ce n'est pas une sélection : c'est un accident
d'ordre d'insertion.

### 6. ✅ La comparaison entre passations est calculable, y compris pour le passé

**Pas** depuis `SkillMastery` (écrasé, `UniqueConstraint(student_id, skill_id)`, une ligne à vie),
**ni** depuis `skill_mastery_history` (n'écrit **qu'au changement de statut** : 34 → 38 % ne produit
aucune ligne).

**Depuis `quiz_answers`**, jamais écrasée : `submit()` écrit une réponse **par question, y compris
non répondue**, donc le dénominateur par notion est complet. La clé inter-passations est
`quiz_questions.skill_id`, stable même si chaque passation est un `quiz_id` neuf.

⚠️ L'agrégat par notion est **déjà écrit trois fois** (`submit`, `_per_skill_for_attempt`,
`quizzes.complete_attempt`). En écrire un quatrième serait la faute que l'`adr-0037` nomme.

### 7. 🔴 Aucune route `diagnostics` n'exige de rôle

Les six utilisent `Depends(get_current_user)` seul, alors que `require_parent` / `require_child`
existent et que l'`API_SPEC.md` annote pourtant « (Papa) » / « (Massimo) » par route. **N'importe
quel compte authentifié peut soumettre un diagnostic** — donc écraser `SkillMastery` et ouvrir des
`Gap` sur une mesure qui n'est pas celle de Massimo.

## Alternatives considérées

### (a) Ne rien changer à l'ADR-0014, refaire seulement la page — écartée

Cohérent et peu cher. Mais la page ne pourrait **pas** montrer le témoin à trois crans, puisque
« généré » et « proposé » sont physiquement le même instant : `list_diagnostics` sert tout
`quiz_type='diagnostic'` sur un seul prédicat, et le worker crée le quiz en `status="ready"`.
On dessinerait un témoin à deux crans en laissant intacte la vraie anomalie — un contenu qui
**écrit la maîtrise de Massimo** sans que personne ne l'ait ouvert.

### (b) Révoquer l'exemption pour TOUS les quiz — écartée

Ce serait rouvrir la question que l'`adr-0014` a tranchée avec un vrai argument : la relecture
question par question de tous les quiz est *« intenable en bande passante »*. Le quiz de fin de
cours **satisfait** la prémisse (il dérive d'un cours validé) et **honore** les trois garanties.
Rien ne justifie de le toucher.

### (c) Un gate maison sur le diagnostic, hors `/relecture` — écartée

Un simple horodatage « relu par Papa » sur `quizzes`, sans passer par la file. Plus léger. Mais
cela créerait **une seconde surface de validation** à côté de celle qui existe — exactement le
motif que l'`adr-0037` nomme, et que l'`adr-0039` a résolu en réunissant cinq familles au même
endroit. Papa relirait à deux endroits selon le type de contenu.

### (d) Augmenter `MAX_SKILLS` pour couvrir la matière — écartée

À 5 questions par notion, mesurer 30 notions ferait **150 questions** en une passation. C'est
inadministrable pour un enfant, et le diagnostic deviendrait le contrôle qu'il n'est pas.
Le budget réel d'une passation est de l'ordre de 40 questions.

## Décision

### 1. Le diagnostic sort de l'exception « évaluation éphémère » — et lui seul

L'`adr-0014` Décision 2 est **amendée** : son exemption vaut pour les quiz **dérivés d'un substrat
validé**. Le diagnostic n'en est pas un ; il rejoint le contenu soumis au gate.

**Motif, en une phrase** : l'exemption a été accordée en échange de trois garanties, le diagnostic
n'en honore **aucune**, et il ne satisfait pas non plus la condition qui l'ouvrait. Ce n'est pas un
changement d'avis — c'est la constatation que l'exemption ne s'y est jamais appliquée.

Conséquences mécaniques :

- `quizzes.validation_status` (`pending|validated|rejected`, défaut `pending`) — **migration**.
  ⚠️ Les quiz **existants** sont backfillés à `validated` : ils sont déjà servis, les déclarer
  `pending` rétroactivement ferait apparaître une file de relecture inventée.
- `/relecture` accueille une **6ᵉ famille**, `diagnostic` — pas « quiz ». Les quiz de mission et de
  fin de cours **restent hors de la file**, et le test qui le verrouille est **conservé**, reformulé
  sur `quiz_type` au lieu de la table.
- `list_diagnostics` filtre sur `validation_status == 'validated'` : c'est le gate de service.

> 🔴 **`validated_by='system'` reste strictement réservé aux quiz NON gatés.** Un diagnostic relu
> par Papa porte `parent`, comme tout contenu relu. Le test `test_system_is_reserved_to_quizzes`
> doit être resserré, pas supprimé : sans lui, une auto-validation future pourrait se déguiser.

### 2. Les rôles sont exigés sur les six routes

`require_parent` sur `generate` et `results` ; `require_child` sur `submit`. Le reste en lecture
authentifiée.

**Ce n'est pas une dérive de périmètre** : un gate de relecture n'a aucun sens si n'importe quel
compte peut soumettre à la place de Massimo. On protégerait l'entrée en laissant la sortie ouverte.

### 3. `QUESTIONS_PER_SKILL` passe de 2 à 5

Six valeurs possibles au lieu de trois. Le seuil de lacune à 70 cesse d'être binaire, et une notion
ne peut plus être déclarée lacune grave sur une seule réponse.

⚠️ **N'améliore que les passations futures.** Les anciennes restent à trois valeurs : la page
affiche donc une granularité **mixte**, et **le dit**.

### 4. La sélection des notions devient une décision, pas un ordre d'insertion

Les 8 notions sont choisies **par ancienneté de mesure** : d'abord celles jamais mesurées, puis les
plus anciennement mesurées (`SkillMastery.last_seen_at`, qui existe déjà et est écrit à chaque
passation).

**Motif** : un diagnostic sert à **réduire l'incertitude**. Remesurer ce qui vient de l'être n'en
réduit aucune. Cette règle fait tourner le périmètre toute seule, sans tirage aléatoire — donc sans
rendre deux passations incomparables.

⚠️ **Le nombre reste 8**, et la page **dit que c'est un échantillon** : une passation ne prétend
pas couvrir la matière.

### 5. Les lacunes affichées sont lues en base

Le panneau lit `gaps` (filtré `source='diagnostic'`, état à aujourd'hui), il ne les recalcule plus
depuis les réponses. Une lacune résolue cesse de s'afficher comme ouverte.

### 6. Palier de maîtrise et lacune sont deux colonnes distinctes

Populations **disjointes**, jamais fusionnées, jamais dérivées l'une de l'autre. La page emploie le
vocabulaire produit — `acquise` / `en cours` / `à renforcer` / `non abordée` — et fait apparaître
`acquise` (≥ 90), aujourd'hui invisible à l'écran.

### 7. La station « Ce que ZETIS en a produit » dit la raison de son vide

Aucun code. `trigger='evidence'` **reste fermé** : ZETIS ne se commande pas de production sur sa
propre mesure. L'écran l'explique au lieu de le regretter, et le bouton manuel devient la réponse
normale.

### 8. Ce qui ne change pas

- **`adr-0014` Décision 2 pour les quiz de cours et de mission** — intacte, y compris ses trois
  garanties et le « par échantillonnage plutôt que par gate ».
- **`adr-0028 §9`** — aucune note globale, aucun classement de matières.
- **L'agrégat par notion** — on **extrait** `_per_skill_for_attempt`, on n'en écrit pas un quatrième.
- **Massimo ne voit pas la machinerie** : le mot « Diagnostic » lui reste montré (c'est déjà le cas,
  sur sa propre page), mais rien de la relecture ni de la provenance.
- **Aucun compteur d'attente côté Massimo**, aucune relance, aucune pastille de retard.

## Périmètre

**Dedans** : les huit points ci-dessus, la refonte de `DiagnosticsPapaPage`, l'endpoint de détail
d'une passation, le pivot de comparaison entre passations, et leurs tests.

**Dehors, explicitement** :

- le **T0 sur les prérequis** — le graphe de prérequis n'existe pas (ni colonne ni table,
  `parent_skill_id` NULL sur 432 notions) ; c'est un chantier pédagogique à part ;
- l'ouverture de `trigger='evidence'` ;
- la page Diagnostic **de Massimo** ;
- le multi-enfant (le JWT n'est relié à aucun `StudentProfile`) ;
- les **onze autres défauts** du module consignés au `BACKLOG.md` — fermeture de lacune, dédup de
  `Gap` sur `"open"` seul, `severity` écrasée, double `AIJob`, N+1, `API_SPEC` périmé,
  `routeLabels` singulier, `_status_from_score` en quatre exemplaires.

## Conséquences

### Positives

- Un contenu qui écrit la maîtrise de Massimo **cesse de l'atteindre sans qu'un humain l'ait
  ouvert**.
- Papa relit **au même endroit** que les cinq autres familles.
- La page dit enfin la date, le palier, l'état réel d'une lacune, et l'évolution entre passations.
- La faille de rôle est fermée.

### Négatives / coûts assumés

- **Une migration** (`quizzes.validation_status` + backfill).
- **Un délai nouveau** : un diagnostic généré n'atteint plus Massimo tant que Papa ne l'a pas relu.
  C'est le but, mais c'est une friction réelle.
- **Deux tests-verrous à reformuler** (`test_les_quiz_ne_sont_JAMAIS_dans_la_file`,
  `test_system_is_reserved_to_quizzes`) — délibérément, et cet ADR en est la trace.
- **40 questions au lieu de 16** par diagnostic : ~2,5× le temps de génération et de passation.
- **Granularité mixte** entre passations anciennes et nouvelles, pour toujours.

## Le signal qui dirait qu'on s'est trompé

- **Les diagnostics non relus s'accumulent.** Le gate serait devenu un frein plutôt qu'une
  garantie. La réponse serait de rapprocher la relecture de la génération — **jamais** de rouvrir
  le gate.
- **Massimo abandonne un diagnostic en cours.** 40 questions seraient trop pour une séance : il
  faudrait scinder la passation, pas revenir à 2 questions par notion.
- **Une notion importante n'est jamais mesurée** parce que la rotation la repousse indéfiniment.
  La règle « la plus anciennement mesurée » aurait un angle mort ; il faudrait pouvoir épingler une
  notion, pas supprimer la rotation.
- **La colonne Lacune et le palier finissent par dire la même chose** sur toutes les lignes.
  La disjonction ne serait pas réelle en pratique, et il faudrait la remettre en question — mais
  c'est le contraire qui est mesuré aujourd'hui.
- **Papa relit les diagnostics sans jamais rien y changer.** La relecture serait un tampon ; il
  faudrait alors se demander ce qu'elle protège vraiment, et l'écrire.

## Suivi

- **Docs** : ligne dans `DECISIONS.md` ; `page-diagnostic.md` à mettre à jour une fois l'ADR
  accepté (elle porte aujourd'hui une section « ce que l'ADR doit trancher » qui devra disparaître) ;
  `API_SPEC.md` §Diagnostics ; `DATA_MODEL.md` sous `Quiz`.
- **Migration** : `quizzes.validation_status` + backfill des existants à `validated`.
- **Tests exigés** :
  - un **test-verrou** sur l'invariant central : un diagnostic **non relu** n'est servi par aucune
    route élève ;
  - un test que les quiz de **mission** et de **fin de cours** restent hors de `/relecture` — le
    verrou existant, reformulé sur `quiz_type` ;
  - un test que `validated_by='system'` n'est **jamais** écrit sur un diagnostic ;
  - la **contre-épreuve** : le parcours du quiz de fin de cours ne change en rien ;
  - un test du **pivot de comparaison** sur des passations à granularité mixte (2 et 5 questions).
- **Vérification à l'écran** obligatoire, sur les sept états du rail et les quatre de la modale.
- **Ordre** : la migration et le gate d'abord (ils changent un contrat), la page ensuite.
