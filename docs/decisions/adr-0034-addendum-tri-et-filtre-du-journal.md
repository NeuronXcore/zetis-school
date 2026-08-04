# Addendum ADR-0034 — Le Journal se trie et se filtre, et pour ça son passé cesse de bouger

## Statut

Proposé — 2026-08-04.

> S'appuie sur : `adr-0034` (le Journal, le veto, `stale` comme lecture),
> `adr-0034-addendum-regime-et-destination` (la capture des paliers, la déduction du régime),
> `adr-0032` (les paliers, `NIVEAUX`, `niveau_de`), `adr-0036` (le lot-pièce, l'origine `request`),
> `adr-0037` (la leçon canonique d'une notion — une seule réponse serveur).
>
> **Révoque une phrase**, nommément, au §5. **Une migration + un script de reprise.**

## Contexte

Le Journal rend les lots du plus récent au plus ancien, vingt par page, sans autre entrée. Ça a
suffi tant qu'il y avait vingt lots. Il y en a maintenant assez pour que la question *« qu'est-ce
que ZETIS a fait en maths ce mois-ci »* n'ait aucune réponse autre que faire défiler.

Quatre décisions ont été prises par Papa avant ce document, et elles ne se rouvrent pas :

1. **un filtre garde des LOTS ENTIERS**, jamais les pièces à l'intérieur ;
2. **le filtrage est SERVEUR**, sur toute l'histoire — la pagination s'applique **après** ;
3. **critères v1** : date · matière · chapitre · statut · mode ZETIS · type de contenu ;
4. **plusieurs clés de tri** (date · matière · mode · statut), inversables.

> ⚠️ Sur la 4, l'avertissement a été donné et **accepté** : *un journal qui n'est plus
> chronologique cesse d'être un journal*. Le §7 en tire la seule conséquence qui protège encore
> quelque chose — le défaut, et le retour au défaut.

### Le point dur, et pourquoi il précède tout le reste

Le critère « mode ZETIS » n'est pas un critère comme les autres, parce que **le régime d'un lot
n'est pas une donnée : c'est un calcul refait à chaque lecture.** L'addendum précédent l'a construit
en deux étages — la **capture** (`a0a_level` / `a1_level`, écrits au démarrage) et, à défaut, la
**déduction** à partir de ce que le lot a laissé derrière lui.

C'est le second étage qui pose problème.

> 🔴 **La déduction repose sur des artefacts que le veto peut retirer.** Le veto de l'ADR-0034
> permet à Papa de supprimer une pièce produite. Retirer la fiche `pending` d'un lot efface la
> preuve « un dérivé laissé à relire », donc la preuve « A0a = 2 », donc **le régime affiché de ce
> lot change** — un lot lu *Manuel* hier se lit « inconnu » demain, ou pire, se lit *Semi*.
>
> Un historique qui bouge quand on exerce un droit prévu par le dispositif n'est pas un historique.

Et il y a pire, trouvé en relisant le code plutôt qu'en s'en souvenant :

> 🔴 **Une des quatre preuves est une chaîne de caractères d'affichage.** `lot_evidence` établit
> `bloque_sur_cours` par `detail.lower().startswith("cours")` — sur le **motif rendu à l'écran**.
> Le chantier du 2026-08-04 a précisément *« réécrit les motifs en état + geste »*. La prochaine
> reformulation d'un motif changera donc le régime déduit de lots vieux de six mois, sans que
> personne ne fasse le lien.

Ces deux fragilités sont indépendantes du langage : les traduire en SQL les emporterait telles
quelles. Le filtre n'est que l'occasion — le défaut, lui, existe déjà et se lit aujourd'hui à
l'écran.

### Trois affirmations à corriger avant de décider

Le cadrage précédent notait, dans `MEMORY.md`, trois choses que la lecture du code contredit :

| Ce qui était noté | Ce qui est vrai |
|---|---|
| *« `zetis_mode` n'est pas filtrable en SQL »* | **Faux, et déjà corrigé** : les quatre preuves vivent toutes en base. La déduction est en Python parce que les objets étaient **déjà chargés pour l'affichage**. |
| *« une **vraie colonne** `zetis_mode_source` »* | Le champ **existe déjà** dans le contrat d'API et dans `packages/types` — il est *calculé* (`journal.py`), pas stocké. Ce chantier ne l'ajoute pas : il le **matérialise**. ⚠️ Conséquence : **l'écran n'a rien à changer** sur ce point. |
| *« aucun index sur `production_run_id` »* | **Vrai** — vérifié sur les cinq modèles. Mais `production_events`, lui, en porte **deux** (`run_id` + `ix_production_events_run_created`), ce qui change le §4. |

## Décision

### 1. Un filtre garde des LOTS ENTIERS — et le lot gardé s'affiche entier

Un lot qui répond au filtre est rendu **avec toutes ses pièces et tous ses événements**, y compris
ceux qui ne répondent pas au critère.

⚠️ **C'est le contraire d'un réflexe naturel**, et c'est délibéré. Filtrer sur *fiche* puis
n'afficher que les fiches ferait dire au Journal que le lot n'a produit que ça. Le Journal est un
**registre** : il rend compte de ce qu'un lot a fait, en entier, ou il n'en rend pas compte. Le
filtre choisit **quels lots on regarde**, jamais **ce qu'on voit d'un lot**.

### 2. Le filtrage et le tri sont SERVEUR, sur toute l'histoire ; la pagination vient APRÈS

`WHERE` puis `ORDER BY` puis `LIMIT/OFFSET`, dans cet ordre, en une seule requête.

⚠️ **Filtrer une page déjà paginée serait un défaut silencieux** — la forme la plus coûteuse à
diagnostiquer : l'écran répondrait *« rien en maths »* alors que les lots de maths sont page 4. Le
`has_more` et le total portent sur **l'ensemble filtré**, jamais sur l'ensemble total.

### 3. Six critères, et chacun a une définition écrite

| Critère | Paramètre | Ce qu'il interroge |
|---|---|---|
| **date** | `depuis` / `jusqu_a` (dates) | `production_runs.created_at` |
| **matière** | `subject_id` | résolu en identifiants avant le SQL — voir §6 |
| **chapitre** | `chapter_id` | idem §6 |
| **statut** | `queued`·`running`·`stale`·`done`·`failed` | colonne + lecture `stale` — voir §8. ⚠️ **`failed`, pas `error`** : `error` est une issue d'**événement**, les confondre créerait un sixième mot |
| **mode ZETIS** | `manuel`·`semi`·`autonome`·`sur_mesure`·`inconnu` | les deux paliers — voir §5 |
| **type de contenu** | `cours`·`fiche`·`mindmap`·`quiz`·`srs` | `production_events.piece` — voir §4 |

Les critères se **cumulent** en `ET`. Plusieurs valeurs d'un même critère se cumulent en `OU` — un
filtre qui n'accepterait qu'une matière obligerait à quatre lectures pour une question qui en vaut
une.

### 3bis. Les CONTRÔLES se replient ; les critères ACTIFS, jamais

Ajouté après avoir **regardé la maquette dans un navigateur** : à plat, la barre des six critères
faisait **385 px**, et le premier lot commençait à **578 px** sur un écran de 720 — plus de la
moitié du pli consommée avant d'avoir vu un lot.

Décision : la rangée **matière** et la **ligne de synthèse** restent affichées en toutes
circonstances ; les cinq autres critères vivent derrière un « Plus de filtres », dont le bouton
porte **le nombre de critères repliés encore actifs**. Repliée, la barre fait **227 px**, premier
lot à **438 px**.

⚠️ **Ce qui ne se replie jamais, c'est la liste des critères ACTIFS** — *« 7 lots sur 23 · Maths ✕ ·
Fiche ✕ · Tout effacer »*. C'est elle qui répond à *« pourquoi mon journal est-il si court ? »* ;
replier un filtre actif serait exactement le défaut que cette barre existe pour éviter, et le
signal d'échec du dernier §.

> On aurait pu ne rien replier et vivre avec 385 px. Le contre-motif est au dossier : une barre
> partiellement repliée demande de se souvenir qu'il y a autre chose dessous. La réponse est le
> compteur sur le bouton — il rend l'oubli visible sans rouvrir la barre.

### 4. Le type de contenu se lit dans les ÉVÉNEMENTS, pas dans les cinq tables de pièces

`EXISTS (SELECT 1 FROM production_events WHERE run_id = … AND piece IN (…))`.

⚠️ **Une table au lieu de cinq, et elle est déjà indexée** (`run_id`, plus
`ix_production_events_run_created`). Interroger les cinq tables de pièces aurait ajouté cinq
`EXISTS` non indexés par lot — c'est le §9, et on l'évite plutôt que de le payer.

⚠️ **Et surtout : ça répond à la bonne question.** L'événement existe pour ce qui a été *produit*
comme pour ce qui a été *sauté* ou ce qui a *échoué*. Filtrer sur les tables de pièces n'aurait rendu
que les succès — c'est-à-dire exactement l'inverse de ce qu'on cherche quand on filtre un journal.

⚠️ **Un lot bloqué AVANT d'avoir touché une pièce ne répond à aucun filtre de type, et c'est
inévitable** : `production_events.piece` est `NULL` quand l'événement porte sur la notion entière
(`outcome='blocked'`) — constat de code, pas un oubli. Un lot écarté faute de cours n'a jamais
atteint le stade où un type existe. **L'écran doit le dire** dans son état vide, sans quoi le filtre
donnera l'impression que ces lots n'existent pas.

### 5. 🔴 Le régime CESSE d'être re-dérivé — une écriture unique, marquée, et l'histoire se fige

**C'est la décision qui commande le chantier.**

- une colonne **`zetis_mode_source`** (`capture` | `deduit` | `NULL`) sur `production_runs`, à côté
  des deux paliers ;
- `runner.execute` continue d'écrire les paliers au démarrage et marque **`capture`** ;
- un **script de reprise, lancé UNE fois**, écrit `a0a_level` / `a1_level` sur les lots antérieurs
  **là où leurs actes le prouvent**, et marque **`deduit`** ;
- ce que rien ne prouve **reste `NULL`** — aucune rétro-attribution, la doctrine §F.4 ne bouge pas ;
- la lecture ne déduit **plus rien** : elle lit deux entiers et une source.

⚠️ **C'est un SCRIPT, pas une migration.** Une migration qui importerait `deduire_regime` ferait
dépendre le schéma de la logique métier, et se rejouerait différemment selon la version du code au
moment du déploiement. La migration ajoute la colonne, vide. Le script la remplit, une fois, et son
résultat est vérifiable avant d'être gardé.

⚠️ **La capture PRIME toujours**, et le script ne touche **jamais** un lot qui porte déjà ses
paliers. Verrou de test dédié : un lot `capture` reste `capture`, quels que soient ses artefacts.

#### Ce que cette décision révoque, exactement

> **Révoqué** : *« la déduction est une lecture »* — l'implicite du §1bis de
> `adr-0034-addendum-regime-et-destination`. Elle devient une **écriture unique et datée**.

> **NON révoqué** : la phrase *« ⚠️ Rien n'est stocké »* du **§3** du même addendum. Elle porte sur
> `resolved` (« depuis résolu »), et `resolved` reste calculé à la lecture — c'est une annotation
> **au présent**, elle doit bouger. Il en va de même de `stale` et de `target`.
>
> ⚠️ `MEMORY.md` attribuait la révocation au §1bis en citant une phrase du §3. Les deux paragraphes
> ne parlent pas de la même chose, et le chantier n'en touche qu'un.

#### Pourquoi stocker ici n'est PAS ce que le §F.4 interdit

Le §F.4 interdit de **reconstituer le passé depuis les réglages d'aujourd'hui**, parce que ceux-là
ont changé. Écrire **une fois** ce que les **actes** prouvent, avec sa provenance, est le geste
inverse : c'est ce qui **fige** l'histoire au lieu de la laisser dériver.

| | re-dériver à chaque lecture | écrire une fois, marqué `deduit` |
|---|---|---|
| Source | des artefacts **rétractables** (veto) et un **motif d'affichage** | les mêmes, mais **lus une seule fois**, à une date connue |
| Un veto exercé demain | **change le régime affiché d'hier** | ne change rien |
| Une reformulation de motif | **change le régime de lots anciens** | ne change rien |
| Filtrable, triable, paginable | non sans réimplémenter la règle | oui, en SQL, sur deux entiers |

C'est le patron de `authorized_by`, et déjà celui de la capture : **ce qui caractérise un lot
s'écrit sur lui.**

### 6. La matière et le chapitre se résolvent en IDENTIFIANTS, une fois, avant le SQL

Un lot porte **soit** un `chapter_id` (scope chapitre), **soit** un `scope_skill_id` (lot-pièce,
ADR-0036 §2) — la contrainte `ck_production_runs_exactly_one_scope` l'impose. Les deux doivent
répondre au même filtre, sans quoi filtrer par chapitre **cacherait précisément les demandes de
Massimo sur ce chapitre**.

Le patron, et il vaut pour les deux critères :

> **le filtre hiérarchique est d'abord traduit en ensembles d'identifiants — par les résolveurs qui
> existent — puis passé au SQL comme un `IN`.**

- `chapitre = C` → `WHERE chapter_id = C OR scope_skill_id IN (les notions dont C est la leçon)` ;
- `matière = M` → les chapitres de M, plus `Skill.subject_id = M` pour le côté lot-pièce.

⚠️ **Ce n'est pas une deuxième implémentation, et c'est tout l'enjeu.** La règle *« quelle est la
leçon de cette notion »* reste `lessons_by_skill` (ADR-0037) — appelée **une fois par requête**, pas
une fois par lot, et son résultat devient un paramètre. Récrire la jointure en SQL aurait refait le
défaut qui a coûté un ADR entier.

⚠️ **`Skill.subject_id` existe en direct** : le côté lot-pièce du filtre matière ne demande aucune
résolution. Ne pas le faire passer par les leçons « pour l'uniformité » — ce serait payer une
jointure pour une colonne.

### 7. Le tri est multi-clés et inversable — et il RETOURNE toujours au chronologique

Clés : `date` · `matière` · `mode` · `statut`. Chacune inversable.

⚠️ **`date` décroissant est le défaut, et le retour au défaut est TOUJOURS à un geste.** C'est la
seule protection qui reste après l'avertissement accepté : un journal réordonné par matière n'est
plus un journal, il est une liste — acceptable tant qu'on peut en sortir, dangereux s'il faut le
deviner.

⚠️ **Toute clé de tri est départagée par `created_at DESC, id DESC`.** Sans cette queue, deux lots
de même matière s'ordonnent différemment d'une page à l'autre, et la pagination **perd ou répète des
lots** silencieusement. C'est un défaut de pagination classique, pas une élégance.

⚠️ **Trier par `mode` trie sur les PALIERS**, pas sur le mot — l'ordre est celui de l'autonomie
croissante (`manuel` < `semi` < `autonome`), qui est le seul qui veuille dire quelque chose. Les
lots `sur_mesure` et `inconnu` vont **en fin**, dans les deux sens : ils ne sont pas « plus » ni
« moins » autonomes, ils sont hors de l'échelle.

### 8. `stale` reste une LECTURE — et devient un statut de filtre à part entière

`stale` = `status = 'running' AND heartbeat_at < now() - :délai`. Exprimable en SQL sans rien
stocker : l'ADR-0034 §2 est tenue, pas contournée.

⚠️ **`running` EXCLUT `stale`.** Sans ça, un lot zombie répondrait à deux filtres et Papa le
compterait deux fois. Le rendu le sépare déjà (`run_status`) ; le filtre doit dire la même chose que
l'affichage, ou l'un des deux ment.

### 9. Les index manquants sont posés dans le même geste

Aucun index sur `production_run_id`, dans **aucune** des cinq tables produites (`lessons`, `fiches`,
`mindmaps`, `quizzes`, `spaced_review_cards`) — vérifié sur les modèles.

Le §5 retire ces tables du **chemin de lecture** du régime (le script les lit une fois, plus la
page). Mais `_pieces_of_run` les interroge toujours **par lot** pour l'affichage, et le script de
reprise les balaiera en entier. Les index se posent, dans la migration du §5.

⚠️ **Un index sur `production_runs.created_at`** aussi : c'est la clé de tri par défaut, et elle
commande la pagination de toutes les lectures.

## Ce que cet addendum ne fait pas

- **Aucun filtre sur les PIÈCES à l'intérieur d'un lot** — c'est la décision n°1, et elle est nette.
- **Aucun compteur, aucun ratio par régime.** Le §F.2 tient : la provenance est un fait, elle ne se
  totalise pas. Le total qui apparaît est celui des **lots filtrés**, pour la pagination.
- **Aucune réécriture d'une ligne passée.** Le §5 écrit une colonne restée vide ; il ne touche ni un
  motif, ni un événement, ni une pièce.
- **Aucune recherche plein texte.** Chercher un mot dans les motifs est une autre question, et elle
  n'a pas été posée.
- **Aucune sauvegarde de filtre**, aucun filtre par défaut autre que « rien ». Un journal qui
  s'ouvre déjà filtré cache son contenu à celui qui a oublié qu'il l'avait filtré.
- **Aucun correctif de `Lesson.status`** (les 39 leçons validées-vides) — dette nommée, chantier à
  part, avec migration.
- **Rien pour Massimo.** Le Journal reste un écran de Papa.

## Le trou trouvé en chemin, et qui doit être bouché ici

🔴 **`lesson_targets` ne résout la matière d'un chapitre que par `school_year_subject_id`.** Un
chapitre rattaché par `theme_id` (l'autre rattachement, légitime depuis le module `subjects` :
Subject → Theme → Chapter) rend `subject_id: None`.

Aujourd'hui, ça coûte un lien manquant. **Avec un filtre par matière, ça coûterait des lots qui
disparaissent sans que rien ne le dise** — le pire mode d'échec pour un filtre.

Décision : **une seule fonction répond à « de quelle matière est ce chapitre »**, couvrant les deux
rattachements, et `lesson_targets` l'appelle comme le filtre. Ce n'est pas un refactor élargi :
c'est une extraction, et c'est exactement l'ADR-0037 appliquée une fois de plus — deux réponses à
une même question finissent toujours par diverger.

## Le signal qui dirait qu'on s'est trompé

**Papa filtrant, puis concluant que ZETIS n'a rien fait.** Un filtre qui rend vide sans dire
*pourquoi* il rend vide est indiscernable d'une panne — et le §4 garantit qu'il y aura des cas
légitimes (un lot bloqué avant toute pièce, un lot au régime inconnu). La réponse serait de rendre
l'état vide **bavard** — « 3 lots écartés par le filtre *type = fiche* : ils n'ont produit aucune
pièce » — jamais de retirer le filtre, qui répond à une vraie question.

Le second signal serait un **`sur_mesure` fréquent** après la reprise : il voudrait dire que les
paliers dérivent des préréglages plus souvent qu'on ne le croit, et que `NIVEAUX` ne décrit plus les
usages réels.
