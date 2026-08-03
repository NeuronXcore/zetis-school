# Addendum ADR-0035 — Les devoirs déclenchent aussi, et l'échéance commande enfin ses missions

## Statut

Proposé — 2026-08-03, **écrit après la livraison de l'ADR-0035 le jour même**, à partir de quatre
questions posées à la relecture. Elles ont mis au jour un écart entre ce que Papa **croit**
déclencher et ce qui se passe réellement.

> **Ce document RÉVOQUE le §1 de l'ADR-0035**, vieux de quelques heures. Une révocation aussi
> rapide mérite d'être expliquée plutôt que dissimulée : le §1 n'était pas faux, il était **trop
> étroit pour être utile**.

## Contexte — les quatre écarts

1. **Un devoir ne déclenchait rien**, alors que `devoir` est le `kind` **par défaut** de la saisie.
   Le déclencheur ne se serait donc presque jamais mis en route.
2. **Un contrôle sans chapitre ne déclenchait rien non plus, en silence** — et le sélecteur de
   chapitre n'existait **qu'à la création**. Un item mal saisi, ou saisi par Massimo, restait
   **définitivement stérile** alors que l'API acceptait déjà la correction.
3. **Une échéance produisait du contenu mais ne commandait aucune mission**, alors que
   l'ADR-0025 §11 avait décidé l'inverse **en premier** (« couplage 1 — direct »).
4. **Ce que Papa écrit à la main n'avait pas de provenance**, et **« + Programme » créait une
   notion que ZETIS ne pourra jamais servir** — deux défauts trouvés au read-before-code.

## Décision

### 1. `devoir` déclenche comme `controle` — et le contre-motif reste au dossier

**Ce qui est révoqué** : « `kind == 'controle'` — un contrôle justifie d'équiper un chapitre. Un
devoir du lendemain, non : il reviendrait tous les jours et noierait le régulateur. »

**L'objection est maintenue, parce qu'elle est juste** :

> Un devoir est le `kind` **par défaut** de la saisie, et le mode d'usage réel est « je relève
> l'ENT du dimanche soir » (ADR-0025 §9). Plusieurs par semaine, contre un contrôle toutes les deux
> ou trois semaines. Sans garde-fou, les devoirs consomment le plafond en un jour et **les
> contrôles ne passent plus jamais**.

**Elle est traitée, pas effacée** : `eligible_items` trie désormais par
`(priorité de kind, échéance, id)`. Le scan crée les lots dans l'ordre et s'arrête quand le
régulateur refuse — **trier décide qui passe en dernier, et ce n'est pas le contrôle**.

Conséquence voulue et contre-intuitive, verrouillée par un test : **un contrôle dans 6 jours passe
avant un devoir de demain.**

> Le tri vit en Python, pas en SQL : la priorité est un **vocabulaire du domaine**, pas une
> colonne. Un `CASE WHEN` la dupliquerait en base et la ferait diverger au premier `kind` ajouté.

**Coût assumé, écrit et non masqué** : un devoir fait produire le **chapitre entier**, ce qui est
disproportionné. Le scope à la notion supposerait un `skill_id` sur `agenda_items`, qui n'existe
pas. À rouvrir si l'observation montre du gaspillage.

`rendu` reste **légal et non émis**.

### 2. La porte « échéance » du Commander — implémentation, pas décision

L'ADR-0025 §11 avait tranché le couplage 1 ; il n'a jamais été branché. Il l'est.

⚠️ **AUCUNE ligne de backend**, et l'ADR-0025 avait raison d'écrire « le pont ne demande aucun
mécanisme neuf » — il était même plus proche qu'annoncé :

- `resolve_chapter_notions(db, student, chapter_id)` est **déjà** scopé par chapitre ;
- `create_command_missions(..., due_date, force_priority)` prend **déjà** la date et le plancher ;
- `CommandPreviewRequest` porte `gate: "deadline"` **depuis l'origine** — la porte était
  **déclarée, jamais alimentée** ;
- `reports/service.py` a **déjà** construit ce pont depuis le Conseil de classe. Le nôtre est le
  **second exemplaire**, pas le premier.

**C'est un geste de PAPA, jamais le scan**, et la frontière est nette :

> ZETIS **produit du contenu** sans clic (ADR-0035) ; il ne **prescrit pas du travail à Massimo**
> sans clic. `command.py` fonde la validation des missions sur « le preview/confirm avec notions
> décochables **EST** l'approbation humaine ». Un scan qui les créerait produirait des missions
> `validated` que personne n'a approuvées.

`force_priority` est armé par la porte — plancher, jamais plafond (ADR-0018 §4). Papa peut le
retirer, comme il peut décocher des notions.

### 3. Le chapitre s'attache après coup, et l'échéance dit quand ZETIS ne fera rien

Le chapitre ouvre **les deux** portes. Il n'était posable qu'à la saisie en lot ; il l'est
maintenant dans le panneau de détail — l'API l'acceptait déjà.

Une échéance sans chapitre **le dit**. Sans ça, le déclencheur paraît en panne : Papa saisit un
contrôle, rien ne se passe, et rien à l'écran ne l'explique.

> ⚠️ Le message est **volontairement indépendant du `kind`**. Recopier `TRIGGERING_KINDS` côté
> front en ferait une seconde source de vérité — elle aurait divergé le jour même, quand `devoir`
> y est entré. Et c'est exact pour tous les types : la porte du Commander ne regarde aucun `kind`.

### 4. Deux corrections de provenance

**a) Ce que Papa écrit à la main porte enfin son nom.** `create_manual_chapter` et
`create_manual_lesson` écrivaient `validated` **en littéral**, hors de `mark_validated` — alors que
`provenance.py` se déclare « le SEUL chemin d'écriture […] garantit qu'aucun objet ne devient
`validated` sans provenance » (§F.3). Résultat : `validated_by IS NULL` sur des objets que Papa
venait d'écrire.

Invisible jusqu'au Journal (ADR-0034), qui affiche la provenance **par objet** : **les leçons
écrites par Papa y apparaissaient « provenance inconnue »**. Sur une leçon, c'est le cas qui coûte
le plus cher — c'est le seul contenu que Massimo lit vraiment.

`PARENT` est la valeur juste : **écrire une chose, c'est l'avoir vue.** Ni un lot, ni une doctrine.
Aucune rétro-attribution (§F.4).

**b) « + Programme » dit ce qu'il ne fait pas.** Il crée une `Skill` et rien d'autre : sans leçon,
`equip_notion` renvoie `has_lesson=False` et **ZETIS ne produira jamais rien** pour cette notion.
Le bouton, lui, se lit « traité ».

> **L'état orphelin n'est PAS le défaut** — il est légitime et documenté (« la leçon/le cours
> suivent via les outils habituels »), et Papa peut vouloir rattacher la notion à une leçon
> existante. **Le défaut était le silence.** On ne fusionne donc pas les deux actions.

Le signal `needs_lesson` est **calculé, jamais supposé** : une notion déjà portée par une leçon ne
déclenche aucun avertissement. Un avertissement systématique s'apprend à s'ignorer.

## Périmètre

**Dans cet addendum** : `TRIGGERING_KINDS` élargi + tri par priorité de `kind` ; le sélecteur de
chapitre à l'édition et l'indice d'échéance non déclenchable ; le bouton « Commander les missions »
et `openFor` ; les deux corrections de provenance. **Aucune migration, aucune dépendance.**

**Hors de cet addendum** :

- **L'idempotence du Commander.** Papa peut commander **deux fois** la même échéance :
  `Mission` n'a aucune référence à l'agenda, et `resolve_chapter_notions` n'exclut pas les notions
  déjà couvertes par une mission active — alors que `_skill_has_active_mission` existe. Rendre ça
  exact demande une colonne `missions.agenda_item_id`, donc **une migration**. Obligatoire le jour
  où le scan suggérerait des missions ; tolérable tant que le geste est manuel.
- **Le pont demande → production.** `trigger='request'` et `content_request_id` restent
  **modélisés, migrés, contraints et non émis**. « Fait » sur une `content_request` ne produit
  **rien** — c'est une déclaration, et le seul garde-fou est en aval (`chat/announce.py` refuse
  d'annoncer un `done` non servable).
- **`skills-backfill` crée lui aussi des notions orphelines** (`confirm_skills_backfill` n'écrit
  aucune ligne `lesson_skills`). Même famille que le §4b, autre surface.
- Le panneau d'analyse à trois compteurs du §11 (« n notions fragiles · n quiz sous le seuil ·
  n cartes en attente ») : les deux premiers se composent avec l'existant, le troisième non —
  `evidence.srs_pressure` est **par matière**, pas par chapitre.
- La session de révision pré-contrôle et le quiz blanc (ADR-0025 §11, couplages 2 et 3).

## Conséquences

### Positives

- **Le déclencheur sert enfin.** Restreint à `controle`, il ne se serait presque jamais mis en
  route — le `kind` par défaut ne le réveillait pas.
- **Une échéance fait maintenant les deux choses que le dispositif sait faire** : préparer le
  contenu, et proposer le travail. Elles étaient décidées à quinze jours d'intervalle et ne se
  parlaient pas.
- **Le Journal cesse d'attribuer à personne ce que Papa a écrit.**
- **Un item mal saisi devient réparable** au lieu d'être un cul-de-sac silencieux.

### Négatives / coûts assumés

- ⚠️ **Un devoir fait produire un chapitre entier** — disproportionné, et c'est le prix du « même
  traitement qu'un contrôle ».
- ⚠️ **La priorité aux contrôles est contre-intuitive** : un contrôle lointain passe avant un
  devoir imminent. C'est voulu, et il faudra le réexpliquer à chaque relecture.
- ⚠️ **Le Commander reste non idempotent** (ci-dessus).
- **Le plafond de 2 lots/semaine devient plus serré** puisque deux `kind` y prétendent désormais.
  Calibrage à revoir **avec l'observation**, pas avant.

## Suivi

1. Observer la première semaine : combien de lots par `kind`, combien de refus du régulateur,
   et **si un contrôle a été refusé après des devoirs** — c'est le signal qui dirait que le tri ne
   suffit pas et qu'il faut relever le plafond.
2. Vérifier que Papa rattache spontanément les chapitres, maintenant qu'il le peut après coup.
3. Décider de l'idempotence du Commander **quand elle se sera produite en vrai**, pas avant.
