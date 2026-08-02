# ADR-0032 — Les paliers d'autonomie de ZETIS : le panneau de réglage, et la levée du gel d'A1

## Statut

Proposé — 2026-08-02. **Troisième document du chantier d'autonomisation**, après l'addendum
ADR-0011 §G (l'autorité et le veto) et l'ADR-0031 (l'exécution en lot et le journal).

> **Ce document RÉVOQUE deux décisions écrites**, et il faut le dire en tête plutôt qu'en note de
> bas de page :
>
> 1. le §G.2 fixait **A1 — rédaction de cours à « 2 — figé »** ;
> 2. il s'appuyait pour cela sur l'ADR-0023 §7 (« le seul endroit du dispositif où le gate humain
>    reste obligatoire et bloquant, **et il ne bouge pas** »).
>
> La révocation est une **décision du commanditaire**, prise le 2026-08-02 au vu de l'observation
> du chapitre « Fractions ». Elle est bornée (§2), outillée (le veto du §G.3), et **désarmée par
> défaut** : deux préréglages sur trois laissent A1 au palier 2.

> S'appuie sur : `adr-0011 §F` (provenance), `adr-0011 §G` (autorité, matrice, veto),
> `adr-0031` + son addendum (le gate vit dans la sélection), `adr-0021` (orchestrateur
> d'équipement), `adr-0014 §2` (le quiz servi sans relecture par doctrine).

## Contexte

### Ce que l'observation a répondu — et pourquoi elle change le cahier des charges

Le lot du 2026-08-02 (chapitre « Fractions », 11 notions, 12 min 35 s, 0 erreur) devait répondre à
« 15 objets d'un coup sont-ils relisables ? ». **La question ne s'est pas posée, et la raison
inquiète plus qu'elle ne rassure** : sur 33 objets produits, **2** sont arrivés en attente de
relecture. Les 31 autres ont atteint Massimo sans qu'aucun humain les voie — 8 auto-validés
`parent_bulk` par l'équipement, 5 quiz en `system` (sans relecture **par doctrine**), 20 cartes SRS
**sans aucun gate de validation**.

> Le §8 du cadrage décrivait un panneau qui **fait monter Papa d'un palier**. Il est déjà au palier
> 3 pour les dérivés, sans l'avoir choisi. **Le premier travail de ce panneau n'est donc pas de
> laisser Papa monter : c'est de lui montrer où il est déjà.** Un écran qui propose « Laisser ZETIS
> servir » à quelqu'un qui sert déjà sans relecture serait un mensonge de plus.

### Cinq constats de read-before-code (2026-08-02, code réel)

**1. `app_settings` existe et suffit — aucune migration.** Table `key` (PK, `String(60)`) / `value`
(`String(200)`), sérialisation texte assumée. ⚠️ Mais ses **seules routes sont namespacées**
`/api/agenda/settings` : un réglage d'autonomie servi depuis le routeur de l'agenda serait une
dette immédiate. **Un routeur de settings neutre est à créer.**

**2. La surface existe déjà, et elle ment bientôt.** `ParametresPage.tsx` porte une section
« Autonomie de ZETIS » marquée **indisponible**, avec la phrase : *« tant que ce n'est pas le cas,
ZETIS ne produit rien sans votre validation »*. Elle est **déjà fausse** au regard de l'observation
(31 objets sur 33). Elle tombe dans le même commit que la livraison — pas après.

**3. ⚠️ DÉFAUT BLOQUANT — l'équipement tamponne `parent`, pas `parent_bulk`.**
`equip_notion` auto-valide le cours par `set_lesson_validation(db, lesson_id, "validate")`
(`equipment.py:126` et `:130`), et cette fonction écrit `mark_validated(lesson, PARENT,
field="status")` (`curriculum/service.py:1085`).

> Un cours que **personne n'a ouvert** est donc tamponné **« relu pièce à pièce par Papa »**.

C'est une violation directe du §F.3 (« toute action groupée écrit `parent_bulk` **sans
exception** »), et le test-verrou existant ne la voit pas : il vérifie qu'aucun `validated` n'est
**sans** provenance, pas que la provenance est la **bonne**. En base de dev : **13 leçons** portent
`parent`, mêlant les validations réelles de Papa (page Programme, même fonction) et les
auto-validations de l'équipement — **plus séparables après coup**.

Ce défaut est bloquant pour ce chantier précis : tout le dispositif de paliers et de veto repose
sur l'idée que `validated_by` **dit la vérité**. Émettre une quatrième valeur au-dessus d'une
troisième qui ment reviendrait à construire sur du sable.

**4. Le palier se branche en UN point, sans toucher l'orchestrateur.** L'addendum ADR-0031 a placé
le gate du §7 dans la **sélection** (`runner.select_notions`) et a laissé `equip_notion` intact —
ses deux chemins d'auto-validation du cours sont devenus *inatteignables depuis un lot*, pas
supprimés. Lever le gel d'A1 ne demande donc **aucune modification du moteur** : c'est ne pas
appliquer le filtre de sélection. L'addendum avait raison de refuser de toucher l'orchestrateur —
c'est précisément ce qui rend ce document possible sans rouvrir l'ADR-0021 §2.

**5. Le veto n'a aucun consommateur.** `parent_rule` est modélisée et non émise ; **aucune surface
ne liste « ce que ZETIS a servi sans moi »**. Le §G nommait ce coût (« le veto est un droit sans
notification ») et renvoyait la question à l'ADR-0031, **qui ne l'a pas tranchée**. Elle échoit
ici : livrer le palier 3 sans surface de veto, c'est livrer un droit qui n'existe pas.

## Décision

### 1. Trois préréglages, six clés plates — et le préréglage n'est PAS stocké

Six clés dans `app_settings`, une par classe du §G.2 :

```txt
zetis_autonomy_a0a_derives     # fiche, mindmap, quiz, capsule
zetis_autonomy_a0b_cards       # cartes SRS
zetis_autonomy_a1_course       # rédaction de cours
zetis_autonomy_a2_curriculum   # référentiel (Skill, Lesson, Chapter)
zetis_autonomy_a3_missions     # création de mission
zetis_autonomy_a4_terminal     # supprimer, archiver, dévalider
```

Valeurs : `"1"` (ZETIS propose, Papa fait) · `"2"` (ZETIS fait, Papa valide) · `"3"` (ZETIS fait et
sert, Papa dispose d'un veto) · `"0"` (jamais autonome, réservé à A4).

**Jamais un blob JSON** : une clé plate se lit, se journalise et se corrige seule ; un blob fait
d'un changement de réglage une réécriture de tous les autres.

**Les préréglages *Manuel · Semi-autonome · Autonome* sont un RACCOURCI D'ÉCRITURE, pas un état.**
Rien ne stocke « le mode ». L'interface **dérive** l'étiquette des six valeurs, et affiche
**« Sur mesure »** quand elles ne correspondent à aucun préréglage.

> Motif, et il est déjà connu : un mode stocké **plus** six clés donnerait **deux réponses à une
> seule question** — exactement le mal que le §G.1 a évité en refusant une colonne `authority` à
> côté de `validated_by`. Le jour où les deux divergent, laquelle fait foi ?

| Préréglage | A0a | A0b | A1 | A2 | A3 | A4 |
|---|---|---|---|---|---|---|
| **Manuel** | 2 | 3 | 2 | 1 | 2 | 0 |
| **Semi-autonome** | 3 | 3 | 2 | 1 | 2 | 0 |
| **Autonome** | 3 | 3 | **3** | 1 | 2 | 0 |

**A2 et A4 ne bougent dans aucun préréglage** : ils sont **lisibles et non écrivables**, le serveur
refuse toute autre valeur (§G.2, classe C de l'ADR-0027). Un préréglage qui les déplacerait serait
une porte dérobée sur une décision figée.

⚠️ **A0b est verrouillé à 3, et ce n'est pas un choix — c'est un constat** (trouvé en dessinant la
maquette) : `spaced_review_cards` **n'a ni `validation_status` ni `validated_by`**. Aucune étape de
validation n'existe pour les cartes de révision. Proposer « vous validez » les mettrait dans un
état que le code ne sait pas produire — un interrupteur sans effet, exactement le piège que le lot
de corrections du 2026-08-02 est venu solder sur cette page. **Descendre A0b suppose de construire
son gate d'abord** ; tant qu'il n'existe pas, la ligne est verrouillée **avec son motif à
l'écran**.

**Corollaire : il ne reste que DEUX réglages libres en v1** (A0a et A1). Les trois préréglages
couvrent donc exactement les trois états cohérents, et **« Sur mesure » est inatteignable** — l'état
reste implémenté (les clés peuvent diverger par édition directe, et d'autres classes s'ouvriront),
mais il ne doit pas être présenté comme un quatrième régime.

**Monotonie — une règle, pas une préférence** : passer A1 à 3 **force A0a à 3**. On ne sert pas un
cours sans relecture tout en relisant les fiches qui en dérivent ; l'état inverse (A0a=2, A1=3) est
incohérent et n'est pas offert.

### 2. A1 : le gel est levé jusqu'au palier 3, sous veto — révocation assumée

**Ce qui est révoqué** : « A1 en palier 2 — figé », et avec lui la lettre de l'ADR-0023 §7.

**Le contre-motif est maintenu au dossier**, parce qu'une révocation qui efface son objection n'est
pas une décision, c'est un oubli :

> Le cours est **le seul contenu que Massimo lit vraiment**. Après l'observation du 2026-08-02, il
> est aussi **le dernier gate humain réel** du dispositif — les dérivés inertes, les quiz et les
> cartes SRS passent déjà sans relecture. Mettre A1 au palier 3 ne fait donc pas « monter d'un
> palier » : **ça retire le dernier**.

**Trois bornes rendent la levée légale :**

1. **Désarmée par défaut.** *Manuel* et *Semi-autonome* laissent A1 à 2. Seul *Autonome*, choisi
   explicitement, le porte à 3.
2. **La provenance suit `authorized_by`, pas le palier** — corrigé le 2026-08-02 au
   read-before-code de la slice A, une version antérieure de cet ADR disait l'inverse.

   > Le §G.1 définit `parent_rule` par l'**absence de clic** : « aucun humain n'a ouvert cette
   > pièce, **ni cliqué pour ce lot** ». Or un lot lancé depuis la Couverture **est** un clic. À
   > A1 = 3, la provenance juste reste donc **`parent_bulk`**, que le §F.4 couvre déjà.

   **Deux questions, deux sources, et le modèle les portait déjà** : le **palier** dit si ZETIS a
   le droit de servir sans relecture ; **`production_runs.authorized_by`** dit qui a autorisé *ce*
   lot — `parent_direct` (un clic) ou `parent_rule` (une règle permanente). Les lier serait
   refaire l'erreur que le §G.1 a évitée en refusant une colonne `authority`.

   **Conséquence : `parent_rule` reste LÉGALE et NON ÉMISE**, exactement comme le §G l'a posée.
   Elle s'écrira le jour où un lot démarrera sans que personne l'ait demandé — pas avant, et ce
   n'est pas ce chantier.
3. **Le palier 3 d'A1 n'existe pas sans son veto branché** (§4). Verrou de livraison, pas vœu.

**Ce qui ne change pas** : au palier 2, le gate de la sélection tient tel quel — un chapitre neuf
ne produit rien et l'écran le dit (addendum ADR-0031).

### 3. Où le palier se branche — et la réparation du défaut n°3

**Le palier se lit dans la SÉLECTION** (`runner.select_notions`), jamais dans l'orchestrateur :

- A1 = 2 → filtre actuel (leçon `validated` **avec** contenu), les notions restantes sont **rendues
  bloquées avec leur motif** ;
- A1 = 3 → pas de filtre ; les deux chemins d'auto-validation d'`equip_notion` redeviennent
  atteignables, **sans qu'une ligne de l'orchestrateur bouge**.

**L'autorité devient un PARAMÈTRE, elle ne se lit pas dans les réglages.**

```txt
equip_notion(db, skill_id, llm, embedder, authority=PARENT_BULK)
set_lesson_validation(db, lesson_id, action, by=PARENT)
```

- ⚠️ **Un service qui lirait les réglages lui-même deviendrait inappelable** : le Conseil de classe
  (ADR-0021) et la composition champion (ADR-0022) équipent sur un **geste explicite de Papa** —
  leur autorité est `parent_bulk` **quel que soit le palier**, et elle doit le rester.
- `set_lesson_validation` garde `PARENT` **par défaut** : c'est la route humaine de la page
  Programme, et elle ne change pas. **C'est l'équipement qui passait la mauvaise valeur**, pas la
  fonction qui écrivait la mauvaise par nature.
- **Aucune rétro-attribution** sur les 13 leçons déjà tamponnées `parent` (doctrine §F.4) : on ne
  réécrit pas l'histoire pour la rendre propre. Le défaut est daté, sa correction aussi.

### 4. Le veto a enfin une surface — sinon c'est un droit qui n'existe pas

**Décision : le veto s'exerce sur le Journal de production** (chantier suivant), pas sur la
Couverture que le §G suggérait.

> Motif : la Couverture est une **matrice d'état** — elle répond à « qu'est-ce qui manque ». Le
> veto a besoin d'un **flux daté** et d'un geste par pièce : « ZETIS a servi ceci, hier, sans
> vous ». Ce sont deux questions différentes, et les mélanger rendrait la matrice illisible.

- **Non consommé → *Retirer*** : suppression franche, aucune trace, **aucun signal à Massimo**
  (invariant V1).
- **Consommé → *Corriger* / *Régénérer*** : l'objet vit, il est amendé.
- ⚠️ **Ce « Retirer » n'ouvre pas A4.** A4 dit que **ZETIS** ne supprime jamais tout seul. Ici
  c'est **Papa** qui supprime : la classe n'est pas concernée. À écrire, sinon quelqu'un lira une
  contradiction là où il y a une symétrie.

Le panneau des paliers **renvoie** au Journal ; il n'affiche aucune liste lui-même (§F.2 : la
provenance s'affiche par objet, jamais totalisée).

### 5. Le régulateur du palier 3 est DIFFÉRÉ, et sa condition d'ouverture est nommée

`PRODUCTION_MAX_PENDING` ne régule rien au palier 3 : plus rien ne devient `pending`, le compteur
reste à zéro dans le seul régime où il serait vital (déjà écrit à l'ADR-0031 §5).

**Décision : on n'invente pas son remplaçant maintenant.** Tant que **tout** lot part d'un clic de
Papa, **le geste est le régulateur** — le volume est borné par le nombre de fois où un humain
appuie.

> **La condition d'ouverture, à écrire pour qu'on la reconnaisse** : le jour où un déclencheur
> **non humain** existe (`agenda`, `evidence`, `derived`, ou un cron), un plafond de **volume par
> fenêtre** devient obligatoire — et ce jour-là, c'est un ADR, pas un réglage de plus. Le palier 3
> **sans** déclencheur automatique est un régime sûr ; avec, il ne l'est plus.

### 6. Ce que le panneau ne fera jamais

- **Aucun compteur d'arriéré, aucun ratio ZETIS/Papa** (§F.2 : la provenance est un fait, jamais un
  reproche ; elle ne se totalise pas). L'état des lieux d'ouverture montre **des faits par classe**,
  pas un score de délégation.
- **Aucune surface côté Massimo.** Lui montrer le palier, ce serait lui apprendre qu'un contenu
  peut disparaître — et rendre l'invariant V1 impossible.
- **A4 jamais réglable**, quel que soit le préréglage.

## Périmètre

**Dans cet ADR** : le routeur de settings neutre et les six clés ; le panneau « Autonomie de
ZETIS » (état des lieux → préréglage → détail dépliable) ; la levée du gel d'A1 avec ses trois
bornes ; **la déclaration de `parent_rule`** (légale, non émise — son émission suppose un lot sans
clic, qui n'existe pas) ; le paramètre d'autorité d'`equip_notion` /
`set_lesson_validation` **et la réparation du défaut n°3** ; la quatrième teinte du nuancier **avec
la correction du `null` confondu avec `parent_bulk`** (dette §G constat 5 — l'ajouter sans corriger
laisserait trois valeurs sur quatre se ressembler).

**Hors de cet ADR** : le journal détaillé et la page `/journal`, qui portera le veto (chantier
suivant) ; la page Demandes, `trigger='request'` et le scope notion (chantier d'après) ; le
régulateur de volume (§5, différé avec sa condition) ; l'action « Corriger » renforcée d'A0b (§G.3,
toujours due) ; l'indicateur d'autonomie de Massimo (ADR-0033) ; A2 et A3, qui ne bougent pas.

## Conséquences

### Positives

- **Papa voit d'abord où il est**, et ce qu'il change ensuite est un choix, plus un état subi.
- **Aucune table, aucune migration** : six lignes dans une table existante.
- Le palier se branche en **un point** ; le Conseil de classe et la composition champion sont
  **inchangés**, autorité comprise.
- Un **défaut de provenance actif depuis l'ADR-0021** est réparé au passage — et il ne se serait
  vu qu'ici, parce que c'est le premier chantier qui a besoin que `validated_by` dise vrai.
- Le veto cesse d'être théorique.

### Négatives / coûts assumés

- **Le dernier gate humain devient optionnel.** Réversible (V2 : la dé-escalade ne rétroagit
  jamais — elle arrête la production future, elle ne retire pas ce qui est servi), mais réel.
- **Le veto reste un droit sans notification.** Il a maintenant une surface, mais Papa doit
  l'ouvrir ; Massimo consomme en 24-48 h. La fenêtre sera souvent fermée avant qu'il ait su
  qu'elle s'ouvrait. **Partiellement soldé, pas soldé.**
- **13 leçons resteront tamponnées `parent` à tort**, sans moyen de les distinguer des vraies.
- **« Sur mesure » est un état normal**, pas une anomalie : l'interface doit le dire sans le
  présenter comme une erreur de configuration.

## Suivi

**Tests-verrous exigés** (un verrou muté est un verrou prouvé — cf. la méthode de la PR #66) :

1. **`A4` et `A2` sont refusés en écriture** côté serveur, y compris via un préréglage.
2. **`parent_rule` n'est écrite par AUCUN chemin** tant que tout lot part d'un clic : un lot en
   `authorized_by='parent_direct'` tamponne `parent_bulk`, **y compris à A1 = 3**. Patron du
   verrou `system`, et il désigne littéralement le moment où il devra tomber.
3. **Les appelants existants d'`equip_notion` (Conseil de classe, champion) écrivent toujours
   `parent_bulk`** : leurs tests passent **sans modification**. Un test retouché invalide le
   paramètre d'autorité.
4. **Aucune auto-validation n'écrit `parent`** — le verrou qui manquait, et qui aurait attrapé le
   défaut n°3 le jour où il est né. Symétrique du verrou `system` du §F.
5. Le **palier 3 d'A1 est refusé tant que le veto n'a pas de surface** : les deux se livrent
   ensemble ou pas du tout.
6. `app_settings` contient **six lignes, six clés** — aucun blob JSON (test de forme).
6bis. **Les quatre classes verrouillées (A0b, A2, A3, A4) refusent l'écriture**, et la monotonie
   tient : aucun chemin ne produit `A0a=2` avec `A1=3`.
7. Le panneau **n'affiche aucun total de provenance** (§F.2).
8. **Aucune route élève ne lit ces clés** (V1).

**Observation attendue après livraison** : combien de fois Papa change de préréglage dans le
premier mois, et dans quel sens. Une descente (Autonome → Semi) est une information plus utile
qu'une montée : elle dit que le veto n'a pas suffi.
