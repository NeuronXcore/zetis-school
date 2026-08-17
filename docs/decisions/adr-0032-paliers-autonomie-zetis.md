---
id: "0032"
titre: "Les paliers d'autonomie de ZETIS : le panneau de réglage, et la levée du gel d'A1"
type: architecture
statut: propose
date: 2026-08-02
pr: 66
revoque: []        # à remplir à la main — voir annexes/rapport-revocations.md
revoque_par: []
refs: ["0011", "0021", "0022", "0023", "0027", "0030", "0031", "0033", "0035"]
---
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

> ### Amendements
>
> | # | Date | Titre | Statut | Révoque |
> |---|---|---|---|---|
> | 1 | 2026-08-04 | L'état de ZETIS se lit sans ouvrir les Paramètres | Accepté | — |
> | 2 | 2026-08-04 | ZETIS LEVELS : le réglage passe en tête, et il dit ce qu'il fait | Accepté | oui |
>
> *Tableau généré par `scripts/gen_tableau_amendements.py` — ne pas éditer à la main.*

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

---

## Amendement 1 — L'état de ZETIS se lit sans ouvrir les Paramètres — 2026-08-04

> Fusionné depuis **Amendement 1** le 2026-08-16. Statut d'origine : **Accepté**.

> À concaténer à la fin de `docs/decisions/adr-0032-paliers-autonomie-zetis.md`.
> Statut : **Accepté — 2026-08-04**. Ne rouvre aucune des décisions §1–§6.
> Complète le §6 (« ce que le panneau ne fera jamais ») par ce que la **sidebar** fera — et par
> les quatre choses qu'elle ne fera jamais non plus.
> Emprunte son second axe à l'**ADR-0035 §5** (`auto_trigger_enabled`).
> N'ouvre aucune décision de l'**ADR-0030** : le témoin d'état n'est pas un témoin de nouveauté,
> et le §7.5 dit pourquoi il ne doit surtout pas lui ressembler.

### Contexte

L'ADR-0032 a livré un régime réglable et un régime **dérivé** (`preset`), mais **aucune surface de
lecture hors de `/parametres`**. Papa change de page vingt fois par session ; savoir dans quel
régime ZETIS travaille lui coûte à chaque fois de quitter ce qu'il fait.

Ce n'est pas un simple confort. L'ADR-0035 §5 a livré un **second axe** — `auto_trigger_enabled` —
qui rend le régime, à lui seul, **insuffisant** pour répondre à la seule question que Papa se pose
vraiment : *« est-ce que ZETIS travaille tout seul en ce moment ? »*

Le §6 de l'ADR-0032 a écrit ce que le panneau ne ferait jamais. Il n'a rien dit de ce qui pourrait
se lire ailleurs, parce qu'à l'époque il n'y avait qu'un axe et qu'il tenait sur sa page. Sans cet
addendum, la sidebar afficherait un état **sans qu'aucun document ne dise lequel, ni ce qu'il n'a
pas le droit de faire** — et le premier relecteur y lirait une entorse au §6.

### Décision

#### 7.1 — Deux axes, deux signes. Un signe unique mentirait.

La table de vérité, en toutes lettres, parce que c'est **elle** qui interdit le signe unique :

| Régime | Déclencheur | Ce que ça veut dire |
|---|---|---|
| Manuel | désarmé | ZETIS ne démarre pas, et ne sert rien sans vous |
| Manuel | **armé** | ZETIS **démarre seul** — mais tout passe devant vous |
| Autonome | **désarmé** | ZETIS sert seul — **mais il attend votre clic pour commencer** |
| Autonome | armé | ZETIS travaille et sert entièrement seul |

**Deux lignes sur quatre** sont invisibles à un signe unique. Un avatar « pleinement autonome »
affiché sous *Autonome + désarmé* dirait à Papa que ZETIS produit tout seul alors que **rien ne
partira sans son clic** — c'est exactement le mensonge d'écran que `page-parametres.md` §États
proscrit sur la page des réglages, et il coûte ici plus cher, parce que la sidebar est visible
partout.

**Donc :** l'avatar porte le **régime**, et un **glyphe distinct** porte le **déclencheur** —
⏸ ou ⚡, dans le badge à cheval sur l'avatar (§7.2ter) — doublé d'un point qui orbite quand il est
armé. **Aucun des deux ne se déduit de l'autre**, et c'est la raison d'être de la séparation : la
même que celle du §5 de l'ADR-0035 (« deux questions, deux sources »), rendue visible.

⚠️ **Le glyphe seul ne suffit pas à un lecteur d'écran** : le nom accessible du lien porte les
deux axes en toutes lettres, et l'infobulle les redonne en phrases. Un pictogramme est un raccourci
pour l'œil, jamais l'unique porteur d'une information.

#### 7.2 — Le halo est gradué par le régime

| Régime | Halo |
|---|---|
| Manuel | fixe — rien ne bouge |
| Semi-autonome | un souffle de 4 s |
| Autonome | le souffle **et** une rotation de 6 s |

**L'échelle du mouvement suit l'échelle qu'elle signale.** Le régime le plus prudent est le plus
silencieux. C'est le seul endroit du dépôt où une animation **porte de l'information** plutôt que
de décorer — et c'est pour cette raison qu'elle est graduée et non uniforme.

⚠️ `prefers-reduced-motion` **fige tout sans rien retirer** : le halo reste, le point reste, seul
le mouvement part. Couper l'animation effacerait le signal ; le parti pris est celui de
`couverture-breathe`, qui garde son halo et perd son battement.

#### 7.2bis — Le bloc prend toute la place du bandeau ; l'identité déménage dans le header

Le bandeau de marque en tête de sidebar faisait deux lignes : *ZETIS **Papa*** en 18 px, puis
*Cockpit de pilotage*. Le bloc d'état prend **toute** sa place. *Cockpit de pilotage* disparaît :
c'était la ligne qui n'apprenait rien.

Mais l'identité, elle, ne disparaît pas — **elle passe dans le header**.
`docs/frontend-papa/README.md` exige que les deux interfaces ne se confondent pas, et **le bloc
d'état est identique des deux côtés du miroir** : sans ce mot, une capture d'écran de Papa ne se
distingue plus d'une capture de Massimo, qui garde avatar *et* wordmark.

**Pourquoi le header et non la sidebar** : la sidebar est la colonne rare — 22 entrées à faire
tenir — et le header, devenu fixe le même jour, ne coûte rien. Une signature d'application est du
*chrome*, pas de la navigation ; elle était mal placée depuis le début.

**Deux verrous, pas un** : l'un exige le mot dans le header, l'autre exige son **absence** de la
sidebar — sans le second, quelqu'un l'y remettrait en croyant réparer un oubli, et on aurait la
signature deux fois.

> **Deux contre-motifs restent au dossier.** (1) *Aucune signature nulle part* : l'avatar porte
> déjà le sceau ZETIS sur son front, et personne n'ouvre sa propre application en se demandant
> comment elle s'appelle. Vrai de l'examen d'une interface, faux de la **comparaison** des deux —
> et c'est la comparaison qui tranche. (2) *La signature au-dessus du bloc, dans la sidebar* :
> tenue une heure, écartée parce qu'elle consommait ~20 px de la seule colonne qui en manque.

#### 7.2ter — Un logo et un badge, aucun texte à côté

Le bloc est **un avatar de 88 px et une pastille à cheval sur son bas**. Rien d'autre. La colonne
fait 256 px : toute ligne de texte posée à côté du logo le bride à une vignette où l'illustration
devient bouillie.

Le badge porte **les deux axes en une pastille** — le mot du régime, et le glyphe ⏸/⚡ du
déclencheur. Le mot est celui du **code**, pas celui cuit dans l'illustration (§7.7) : c'est le
seul endroit de l'écran où la divergence pourrait remonter, et c'est là qu'un test la verrouille.

**Le détail vit dans l'infobulle** — libellé, description complète, phrase du déclencheur — au
survol **et au focus clavier**. Son cadre est teinté par le régime, comme le halo et le badge :
trois surfaces, une seule grammaire de couleur. ⚠️ Elle est en `position: fixed`, parce que la
sidebar et son conteneur clippent leur contenu pour que la nav défile seule ; ancrée, elle serait
coupée net au bord de la colonne.

⚠️ **L'infobulle n'est pas fille du lien** — piège payé le 2026-08-04 : une infobulle qui apparaît
*dans* le sous-arbre survolé empêche `onMouseLeave` de se déclencher de façon fiable, et la bulle
restait ouverte indéfiniment. Le survol s'écoute sur un conteneur dont l'arbre ne bouge pas.

> **Contre-motif au dossier** : une ligne de texte a existé une heure à côté du logo, portant le
> déclencheur. Écartée — elle bridait le logo à 72 px, et la même information tient dans un glyphe.

#### 7.2quater — La page des réglages parle la même langue que la sidebar

C'est sur `/parametres` qu'on **choisit** un régime : c'est là que son visage doit être celui qu'on
verra ensuite en tête de colonne. Les trois cartes portent donc l'**avatar** du régime, tiré de la
**même table** que la sidebar (`lib/regimeVisuals.ts`) — deux tables divergeraient au premier ajout
de régime, et Papa choisirait un visage pour en voir un autre.

⚠️ **Ni halo ni animation sur les cartes.** Le halo est la grammaire de la sidebar, où il n'y en a
qu'un et où il signale l'état *courant*. Trois cartes qui respireraient en même temps seraient une
fête foraine.

**Trois incohérences corrigées au passage**, toutes nées du fait que le §7 a donné un sens à des
signes qui n'en avaient pas :

- Le titre du panneau portait un **⚡ décoratif**. Depuis le §7.1, ⚡ veut dire « ZETIS démarre
  seul » — le laisser faisait lire une **affirmation sur l'état** à l'endroit même où l'état se
  règle. Remplacé par l'avatar neutre, qui ne désigne aucun régime donc n'affirme rien.
- Le bloc du déclencheur portait un **⏰ fixe**, qui décrivait la fonctionnalité. Il porte
  maintenant **le glyphe de la sidebar, et il suit la case** : ce que Papa coche ici, il le
  retrouve en tête de colonne sur les 22 pages.
- La pastille « validation groupée » était en **lime**, à un cheveu de l'émeraude qui veut dire
  « vous ». C'est précisément la ligne où ZETIS a servi **sans** que Papa ouvre : lui donner la
  couleur de Papa était le contresens le plus coûteux des quatre. Passée au violet des régimes.
  La grammaire des pastilles devient : **violet = ZETIS seul · ardoise = aucune étape n'existe ·
  émeraude = vous**.

Et l'encadré d'observation, **ambre avec un ⚠️ pour une phrase qui dit « ce n'est pas un retard »**,
passe en cyan informatif : l'ambre appartient aux files de validation (ADR-0030 §6), et prévenir en
signalant une alerte contredit le texte qu'on écrit. Le chiffre, lui, ne bouge pas — daté, mesuré,
jamais recalculé (§F.2).

#### 7.3 — La sidebar LIT. Elle ne règle pas.

Le bloc est un **lien vers `/parametres`**, rien d'autre. Aucun réglage ne se change depuis là :
un régime ne doit pas pouvoir bouger d'un clic dans un coin d'écran, quand la page dédiée exige
elle-même un bouton « Enregistrer » explicite (§États : *« un réglage d'autonomie ne se change pas
par inadvertance au survol »*).

Corollaire : le régime affiché vient **toujours** du serveur (`preset`, dérivé par
`settings/service.py`). Le front ne le recalcule jamais, sous peine de créer la seconde source de
vérité que le §2 a refusée en interdisant de stocker un mode à côté des six clés.

#### 7.4 — Ce que le bloc ne fera jamais

- **Aucun régime affiché avant la réponse du serveur.** Reprise littérale de la règle du §États —
  *un régime faux affiché une seconde est un mensonge*. Le chargement montre un squelette et un
  avatar **neutre**, qui ne désigne aucun régime.
- **Aucune valeur de repli à l'erreur.** Ni « Manuel » par prudence, ni la dernière valeur connue.
  Un état illisible se **dit** ; il ne se devine pas.
- **Aucun sondage.** Un appel au montage du layout, un rafraîchissement par écriture réussie. La
  règle de l'ADR-0030 s'applique telle quelle, et son test-verrou est recopié.
- **Aucune surface côté Massimo** (rappel du §6, inchangé).

**Coût accepté, écrit plutôt que découvert** : si Papa change le régime dans un **second onglet**,
la sidebar du premier reste périmée jusqu'au rechargement. C'est la conséquence directe de
l'absence de sondage, et elle est préférable à une requête toutes les N secondes sur les 22 pages.

#### 7.5 — Ce témoin n'est pas un témoin de nouveauté (ADR-0030)

L'ADR-0030 §6 réserve la sidebar Papa aux **files de validation** — du travail que Papa a lui-même
demandé — et leur donne l'**ambre**. Un état de régime n'est pas une file : il ne se compte pas, il
ne décroît pas, il n'attend rien de personne.

Conséquences, pour que les deux objets ne se confondent jamais à l'œil :

- **pas d'ambre** dans le bloc d'état — elle reste la couleur des files ;
- **pas de pastille chiffrée** — le §F.2 interdit tout total de provenance, et un régime n'est pas
  un nombre ;
- l'interdiction d'animation du §6 de l'ADR-0030 vise **les badges de nouveauté** (« ce badge
  informe, il n'alerte pas ») et **ne s'étend pas** ici : le halo n'attire pas vers une action, il
  **est** l'information.

#### 7.6 — L'exception chromatique, écrite pour ne pas être lue comme un bug

L'illustration du régime *Autonome* est **rouge**. Or le rouge, dans ce dépôt, veut dire refus ou
erreur (les boîtes d'erreur du panneau), et l'ambre veut dire file de validation (ADR-0030).

**L'exception est assumée et bornée** : dans ce bloc, le rouge veut dire *« ZETIS a tous les
droits »*, pas *« quelque chose a cassé »*. Elle ne tient qu'à trois conditions, qui font partie de
la décision :

1. le **halo** d'Autonome est indigo→fuchsia, **jamais rouge** — il ne double pas la teinte de
   l'image, il la corrige ;
2. l'état **d'erreur** du bloc est en **gris muet**, sans une seule classe rouge — sinon les deux
   messages deviennent indiscernables ;
3. aucun autre rouge n'entre dans le bloc.

Échappatoire nommée, si le rouge se lit malgré tout comme une alarme à l'écran : une règle CSS de
teinte sur la seule image d'Autonome — **réversible, sans retoucher l'asset**.

#### 7.7 — Le vocabulaire des avatars l'emporte à l'écran ; celui du serveur, dans la donnée

Les images portent leurs propres mots, cuits dans le pixel : **MANUEL**, **HYBRIDE**, **FULL ZETIS
AUTONOME**. Le §3 de l'ADR-0032, lui, dit *Manuel · Semi-autonome · Autonome*. Deux vocabulaires
pour trois régimes.

**Décision : à l'écran, ce sont les mots des avatars.** Les trois libellés deviennent **Manual ·
Hybrid · Autonom**, dans la sidebar **et** sur la page des réglages — une seule constante, donc
une seule vocabulaire. Motif : le régime a un **visage** avant d'avoir un mot, et un écran qui
nomme autrement ce que l'image montre oblige à traduire mentalement à chaque coup d'œil.

⚠️ **Les CLÉS ne bougent pas** : `manuel | semi | autonome` viennent du serveur et sont l'identité
du régime. Renommer l'affichage n'est pas renommer la donnée — les deux ne se croisent qu'en un
seul point du code, et c'est délibéré. Les fichiers d'images suivent les **clés**
(`zetis-regime-semi`), pas les libellés : une divergence de vocabulaire ne doit jamais remonter
jusqu'à un identifiant.

> **Contre-motif maintenu au dossier.** Cette section a d'abord décidé l'inverse, le matin même :
> *« le vocabulaire du code l'emporte, les libellés restent ceux du §3 »*, au motif qu'un mot
> illisible à 44 px ne justifie pas de renommer une interface. L'argument reste vrai sur la
> **sidebar** — et faux partout ailleurs : les mêmes libellés servent la page des réglages, où les
> cartes sont grandes et où le décalage se voit. Révoqué le 2026-08-04 par le commanditaire.
>
> Conséquence assumée : **les documents de décision et l'interface ne disent plus les mêmes mots.**
> Les ADR continuent d'écrire *Manuel · Semi-autonome · Autonome* — les réécrire reviendrait à
> corriger des décisions figées, ce que ce dépôt refuse. La correspondance est établie ici, une
> fois, et c'est le seul endroit où elle a besoin de l'être.

### Périmètre

**Dans :** un bloc de lecture en tête de la sidebar Papa, portant les deux axes ; le rafraîchissement
par événement ; les quatre rendus d'état (chargement, erreur, régime, sur mesure).

**Hors :**

- **la migration des deux pastilles héritées** de la sidebar Papa (missions à valider, demandes de
  Massimo), qui font encore leur propre appel réseau depuis le composant — voir Conséquences ;
- le **repli responsive** de la sidebar Papa, qui reste à largeur fixe (chantier distinct, celui
  déjà mené côté Massimo) ;
- toute **modification** d'un réglage depuis la sidebar (§7.3) ;
- toute surface côté Massimo (V1).

### Conséquences

#### Positives

- La question *« est-ce que ZETIS travaille tout seul ? »* se répond **sans quitter sa page**, et
  elle se répond **juste** sur les quatre lignes de la table, pas sur deux.
- Le second axe de l'ADR-0035, jusqu'ici enterré sous une case à cocher en bas d'une page, devient
  **visible en permanence** — ce qui est cohérent avec le fait qu'il commande, à lui seul, si ZETIS
  démarre.
- Le régime cesse d'être une chose qu'on va vérifier : il devient une chose qu'on **sait**.

#### Négatives / coûts assumés

- **La sidebar Papa porte désormais deux motifs contradictoires** : l'état d'autonomie arrive en
  *prop* depuis le layout (motif ADR-0030), tandis que les deux pastilles héritées font encore leur
  propre appel au montage. Ces deux pastilles **n'ont aucun test aujourd'hui** ; les migrer au
  milieu de ce chantier, c'est refactorer du code non couvert dans une feature — la façon canonique
  de livrer une régression silencieuse sur *missions à valider* et *demandes de Massimo*. Chantier
  **nommé, daté, pas oublié**. En attendant, le verrou fort de l'ADR-0030 (« la sidebar ne fait
  aucun appel réseau ») est ici **réduit** à « la sidebar ne lit jamais l'autonomie elle-même », et
  le verrou fort est porté par le composant d'état, qui est pur.
  ⚠️ Ce chantier **n'aggrave pas** la dette : l'état passe par le layout dès le premier jour — le
  compte d'appels dans la sidebar reste à trois, il ne monte pas à quatre.
- **Trois animations simultanées** (souffle, rotation, orbite) vivent en permanence dans le coin de
  l'œil, sur les 22 pages. C'est plus que tout ce que ce dépôt s'est autorisé jusqu'ici —
  `CouvertureIcon` refuse explicitement de faire respirer son icône **en sidebar**, au motif qu'un
  halo qui pulse à petite taille devient un clignotement parasite. Atténué (44 px et non 20, flou,
  opacité plafonnée, **rien du tout pour Manuel**), mais **la mesure est à faire à l'œil après
  livraison** : si ça distrait, le correctif est de **ralentir** (doubler les durées), pas de
  retirer l'axe.
- **`preset: null` (« Sur mesure ») est rendu et reste inatteignable par l'API** : seules deux
  classes sont libres et la monotonie interdit le quatrième couple. Le rendu existe pour le jour où
  une septième classe entrerait dans les préréglages. **Son test unitaire est sa seule preuve** — et
  c'est écrit ici pour que personne ne le supprime en le croyant mort.
- Le mot **HYBRIDE** reste cuit dans une image livrée (§7.7).

### Suivi

**Tests-verrous exigés** (un verrou muté est un verrou prouvé) :

1. **Rien n'est affiché avant la réponse serveur** : à l'état de chargement, aucun des quatre
   libellés (*Manuel, Semi-autonome, Autonome, Sur mesure*) n'est dans le DOM, et le halo est
   **absent**, pas invisible.
2. **Le déclencheur désarmé n'affiche JAMAIS « démarre seul »**, régime *Autonome* compris — et le
   point orbitant est **absent du DOM**.
3. **Le symétrique** : *Manuel* + armé affiche « démarre seul » **et** le point. Les deux ensemble
   prouvent que les axes sont indépendants ; l'un seul ne prouve rien.
4. **Aucun sondage** : 60 s de timers avancés sans événement → toujours **un** appel. Copie du
   verrou ADR-0030.
5. **Un enregistrement refusé n'émet rien** — un refus ne change pas d'état, et faire relire la
   sidebar serait un appel de plus sans fait de plus.
6. **Les libellés ne sont pas redéclarés** : le test compare à la constante importée. Une recopie
   en dur casse.
7. **La sidebar ne lit jamais l'autonomie elle-même** (verrou réduit, cf. Conséquences), et le
   composant d'état ne fait **aucun** appel réseau, dans aucun de ses états.
8. **L'identité de l'interface est dans le header** (§7.2bis) — le mot n'a pas d'autre gardien
   qu'un test, et sa disparition ne casserait rien d'autre.
8bis. **Et elle n'est PAS dans la sidebar** — sans ce second verrou, on l'y remettrait en croyant
   réparer un oubli, et la signature apparaîtrait deux fois.
9. **Aucun texte ne vit à côté du logo** (§7.2ter) : tout le texte du bloc est celui du badge.
10. **Le badge dit le mot du CODE, pas celui de l'illustration** — l'image `semi` porte « HYBRIDE »
   dans le pixel, le badge dit « HYBRID ». Sans ce verrou, la divergence du §7.7 remonterait à
   l'écran au premier copier-coller.
11. **L'infobulle se referme quand le pointeur s'en va** — le défaut du 2026-08-04, qu'aucun test
   ne couvrait et que seul l'écran a montré.
12. **Chaque carte de régime porte l'avatar de son régime**, tiré de la même table que la sidebar,
   et **aucune carte ne respire** (§7.2quater).
13. **Le titre du panneau ne porte plus de ⚡**, et **le glyphe du bloc déclencheur suit la case** —
   les deux verrous tiennent la même règle : un glyphe qui veut dire quelque chose ne décore plus.

**Observation attendue après livraison** : si Papa cesse d'ouvrir `/parametres` pour vérifier — ce
qui est le but — alors la page ne sert plus qu'à **changer** le régime, et son bloc « où vous en
êtes » devient redondant. Ce serait le signe qu'il faut alléger la page, pas enrichir la sidebar.

---

## Amendement 2 — ZETIS LEVELS : le réglage passe en tête, et il dit ce qu'il fait — 2026-08-04

> Fusionné depuis **Amendement 2** le 2026-08-16. Statut d'origine : **Accepté**.

> À concaténer à la fin de `docs/decisions/adr-0032-paliers-autonomie-zetis.md`, après le §7.
> Statut : **Accepté — 2026-08-04**.
> ⚠️ **RÉVOQUE une décision écrite** — la primauté du bloc « où vous en êtes » sur le réglage
> (§Contexte, relayé par `docs/frontend-papa/page-parametres.md` §Principes et par un test-verrou
> commenté « l'ordre est la décision »). Voir §8.1, qui garde le contre-motif au dossier.
> Ne rouvre ni le §F.2 (aucun compteur), ni le §6, ni aucune décision §1–§5, ni le §7.

### Contexte

Le panneau d'autonomie a été dessiné pour **désarmer une illusion** : Papa croyait valider, il
servait déjà. D'où sa structure — un constat d'abord, un réglage ensuite.

Deux choses ont changé depuis.

**L'illusion est levée.** Le §7 a posé l'état de ZETIS en tête de sidebar, visible sur les 22 pages.
Papa n'a plus besoin d'ouvrir `/parametres` pour savoir où il en est — c'était le but, et
l'Observation attendue du §7 l'avait prévu : *« la page ne sert plus qu'à changer le régime, et son
bloc "où vous en êtes" devient redondant »*.

**Le panneau ne dit toujours pas ce qu'il fait.** Trois cartes, trois phrases de prose, et rien qui
montre ce qu'un niveau **déplace** réellement. Papa choisit un mot, pas un effet. C'est le défaut
que le §Contexte n'avait pas vu, parce qu'à l'époque le problème était de *montrer l'état*, pas de
*rendre le réglage lisible*.

### Décision

#### 8.0 — Deux mots, deux objets : **niveau** et **palier**

Ce chantier a introduit « ZETIS LEVELS » à l'écran, à côté d'un mot qui existait déjà pour tout
autre chose. La convention est fixée ici, **une fois**, et vaut pour tout le dossier ADR-0032 :

| Mot | Ce qu'il désigne | Valeurs | Où il vit |
|---|---|---|---|
| **niveau** (*level*) | l'un des **trois régimes** | `manuel · semi · autonome` → *Manual · Hybrid · Autonom* | `AutonomyNiveau`, `NIVEAU_LABEL`, `NIVEAUX` |
| **palier** | le degré d'autonomie **d'une classe** | `0` Jamais · `1` ZETIS propose · `2` Vous validez · `3` ZETIS sert | `AutonomyPalier`, `PALIER_LABEL`, les six clés d'`app_settings` |

Le test qui les sépare : **un niveau se choisit, un palier se subit.** Papa clique un *niveau* ;
celui-ci décide les *paliers* de deux classes, et les quatre autres ne l'écoutent pas.

**Le code dit désormais la même chose** (2026-08-04) : `AutonomyLevel` → `AutonomyPalier`,
`AutonomyPreset` → `AutonomyNiveau`, `LEVEL_LABEL` → `PALIER_LABEL`, `levelsForPreset` →
`paliersPourNiveau`, `PresetCards` → `NiveauCards`. ~50 occurrences, 15 fichiers, **zéro surface
d'API** — les 377 tests prouvent la non-régression.

**La clé JSON a suivi, elle aussi.** Le champ de la réponse serveur s'appelait `preset` des deux
côtés ; il s'appelle **`niveau`**. Je l'avais d'abord déclaré irréductible — à tort : le SEUL
consommateur de `GET/PUT /api/settings/autonomy` est `frontend-papa`. Il n'y avait pas de contrat
externe à protéger, seulement une habitude.

⚠️ **Ce que ça implique, et qui n'est pas rien** : un renommage de clé JSON est un changement de
contrat, et **les tests unitaires ne peuvent pas le voir** — le backend se teste contre lui-même,
le front **mocke** l'appel. Renommez d'un seul côté : les deux suites restent vertes.

**Un dispositif a donc été posé le même jour** — `packages/types/contracts/autonomy.example.json`,
une réponse **capturée** du serveur réel, relue par **deux** tests :

| Où | Ce qu'il tient | Ce qui le casse |
|---|---|---|
| `test_settings_autonomy.py` | la réponse réelle a **exactement** les clés du contrat | un renommage côté serveur |
| `contrat-autonomy.test.tsx` | les composants **rendent** à partir du contrat, **sans mock** | un contrat re-capturé sans adapter le front |

⚠️ **Le fichier se CAPTURE, il ne s'écrit pas.** Un contrat rédigé à la main n'est qu'un mock de
plus : il prouverait seulement qu'on est d'accord avec soi-même. Et seules les **clés** engagent —
figer des valeurs rendrait le test rouge au premier réglage changé en base de dev.

Les trois contre-épreuves ont été jouées : clé renommée côté serveur seul → le premier tombe ;
contrat mis à jour seul → le second tombe ; clé de classe (`reason`) renommée → le verrou des
cadenas tombe.

Aucune migration : rien de tout ça n'est stocké, le niveau est **dérivé** (§2).

> **Règle pratique pour la suite** : dans un document, `LEVEL_LABEL[…]` se lit *« le libellé du
> palier »*, jamais *« le libellé du niveau »*. Et une phrase comme « le niveau de cette classe »
> est fautive : une classe a un **palier**.

#### 8.1 — Le réglage passe en tête. Le constat le suit, dans le même objet.

La section devient **« ZETIS LEVELS »** et occupe la **première** place du panneau. Sous les trois
cartes, un **panneau unique** montre le détail du niveau sélectionné — et **au repos, il montre le
niveau actuel**.

C'est une **révocation partielle, et la nuance est la décision** : on révoque la **lettre** (la
position du bloc), on garde l'**esprit** (Papa voit où il est sans le chercher). Le constat n'est
pas relégué : il devient l'**état par défaut** du panneau de réglage. Les deux questions — *où
suis-je* et *qu'est-ce que je changerais* — se répondent dans la même surface, parce que la seconde
n'a de sens que rapportée à la première.

> **Le contre-motif reste au dossier, parce qu'il est juste.** Le §Contexte écrivait : *« Le premier
> travail de ce panneau n'est donc pas de laisser Papa monter : c'est de lui montrer où il est
> déjà. Un écran qui propose "Laisser ZETIS servir" à quelqu'un qui sert déjà sans relecture serait
> un mensonge de plus. »* Cette phrase reste vraie. Ce qui change, c'est qu'une garantie
> **positionnelle** devient une garantie **d'état par défaut** — plus faible, parce qu'elle suppose
> que Papa lise le panneau plutôt qu'il ne le rencontre. Si l'observation montre qu'il change de
> niveau sans le lire, l'objection aura eu raison et il faudra revenir.

⚠️ La révocation est **conditionnée par le §7** : sans l'état en sidebar, elle ne serait pas
défendable. On ne déplace le constat que parce qu'il existe désormais ailleurs, en permanence.

#### 8.2 — Le panneau est CALCULÉ, jamais rédigé

Pour chaque classe, l'écran compose deux données que le serveur envoie déjà :

```
libellé de la classe (cls.label)  →  libellé du palier (LEVEL_LABEL[palier])
palier = levelsForPreset(niveau)[cls.key] ?? cls.value
```

**Aucune prose décrivant une classe n'est écrite au front.** Ce n'est pas une préférence de style :
une table en dur *classe × régime* serait la matrice du §G.2 recopiée **sous une forme que le
serveur ne peut pas refuser**. Un 422 protège une valeur, jamais un texte. `PRESET_LEVELS` n'est
toléré que parce que le serveur arbitre quand même ; un miroir en prose n'aurait pas ce filet.

C'est la doctrine de `lib/settings.ts` appliquée à la lettre : *« recopier la matrice du §G.2 côté
front en ferait une seconde source de vérité, qui divergerait au premier ADR »*.

#### 8.3 — Quatre lignes sur six ne bougent pas, et l'écran le DIT

Un préréglage n'écrit que **deux** classes — A0a et A1. Les quatre autres sont verrouillées et
identiques dans les trois niveaux. C'est le corollaire déjà écrit au §3 : *« il ne reste que DEUX
réglages libres en v1 »*.

Le panneau rend donc **deux groupes**, et le second n'est pas une omission mais une information :

- **Ce que ce niveau décide** — les deux classes libres, en pleine intensité, dont le palier change
  à la sélection.
- **Ce qu'aucun niveau ne change** — les quatre autres, en retrait, **avec leur motif serveur**.

Les taire ferait promettre à l'écran une richesse que la donnée n'a pas. Les noyer parmi les autres
ferait croire que tout bouge, et Papa chercherait un effet qui n'existe pas. Un cadenas dit
pourquoi — c'est déjà un principe de cette page.

#### 8.4 — La modale garde l'ENREGISTREMENT, jamais le brouillon

**Choisir un niveau ne fait qu'afficher ce qu'il déciderait.** Aucune friction : un brouillon ne
coûte rien, et Papa doit pouvoir comparer les trois niveaux librement avant de trancher.

C'est **« Enregistrer »** qui ouvre la modale, et elle montre **ce qui va être écrit** — le panneau
du §8.2, tel qu'il est à l'écran.

> **Première version révoquée le jour même.** La modale s'ouvrait au clic sur une carte. Papa
> confirmait, puis devait *encore* cliquer « Enregistrer » : **deux validations pour une intention**,
> dont la première ne portait sur **rien d'irréversible**. Une confirmation qui garde un brouillon
> ne garde rien.

⚠️ La garde compare au **serveur**, pas au brouillon précédent : ce qu'on protège est l'écart qui va
être écrit, pas le chemin qui y a mené. Monter puis redescendre avant d'enregistrer ne déclenche
rien, et c'est juste — rien n'a changé.

⚠️ **TOUTE écriture se confirme, descente comprise** — et ça ne contredit *« on ne freine pas un
retour au contrôle »* que si l'on oublie ce qui a changé : la modale ne garde plus le **geste**,
elle garde l'**écriture**. Ce n'est plus une friction sur l'intention, c'est un récapitulatif de ce
qui va être écrit. Et un bouton « Enregistrer » qui ouvrirait parfois une modale et parfois non
serait **moins prévisible** qu'un bouton qui confirme toujours.

**Le motif d'origine est honoré par le TON, pas par l'absence :**

| Enregistrement | Modale |
|---|---|
| Rien à écrire | **aucune** — le bouton est désactivé |
| Descente | sobre — « Ces réglages **vous rendent du contrôle** ». Aucun ⚠️, aucune mise en garde |
| Montée ordinaire | sobre — « Ces réglages **retirent du contrôle** » |
| Montée du **cours** vers « ZETIS sert » | **la modale forte, inchangée** — « ⚠️ Vous retirez le dernier contrôle humain » |

Chaque modale porte **l'avatar du niveau visé** — le même que sur la carte et dans la sidebar :
Papa reconnaît ce qu'il s'apprête à devenir avant de lire la phrase.

**Son corps est l'ÉCART, pas le panneau.** La modale reprenait `NiveauDetail` — donc elle répétait
mot pour mot ce qui restait affiché **derrière elle**. Elle montre désormais, pour les seules
classes qui bougent, un **avant → après** : la seule chose que la page ne dit pas, puisque le
panneau n'affiche que l'état cible.

⚠️ **On ne confirme pas ce qui ne change pas.** Les classes verrouillées et celles qui restent en
place n'apparaissent nulle part dans la modale : elles sont du contexte de page.

⚠️ L'écart se calcule contre le **serveur**, pas contre un préréglage : le brouillon peut venir des
cartes **ou** du détail classe par classe, et c'est l'écriture réelle qu'on met sous les yeux.

La modale forte ne se dilue pas dans la nouvelle : elle est la seule qui garde au dossier la
révocation d'une décision écrite (le gel d'A1). Lui donner le même ton qu'à un passage en *Hybrid*
reviendrait à l'effacer par banalisation.

⚠️ *Pas d'auto-save* n'est pas rouvert : rien ne part sans que Papa clique « Enregistrer ». La
modale est le dernier pas de ce geste, pas un geste de plus.

⚠️ **Renoncer n'annule pas le brouillon** : Papa n'a pas retiré son intention, il a refusé de la
graver. L'écran garde ce qu'il avait choisi ; « Annuler » (le bouton de la page) reste le seul
moyen de revenir à l'état serveur.

#### 8.5 — Ce que ce panneau ne fera jamais

- **Aucun compteur, aucun total, aucun ratio** (§F.2) : le panneau est qualitatif, classe par
  classe. La provenance est un fait, jamais un reproche.
- **Aucun chiffre recalculé.** Le constat daté — *2 contenus sur 33, le 2 août* — reste une mesure
  attachée à une observation. Il ne suit **pas** le niveau sélectionné : il dirait alors ce qui
  *serait* arrivé, et deviendrait une projection déguisée en fait.
- **Aucune ambre** : c'est la couleur des files de validation (ADR-0030 §6).
- **Aucune requête au changement de niveau** : tout se calcule sur des données déjà en main.

### Périmètre

**Dans :** l'ordre des blocs du panneau, le panneau de détail par niveau, la modale des montées, le
renommage de la section.

**Hors :** le bloc du veto et celui du déclencheur (intouchés, sauf leur position relative) ; le
`<details>` « Détail par type de contenu », qui reste le seul endroit où l'on règle **classe par
classe** ; toute évolution serveur — **aucune ligne de backend, aucune migration**.

### Conséquences

#### Positives

- Papa choisit un **effet**, plus un mot. Les trois cartes portaient trois phrases de prose ; elles
  portent maintenant un changement visible, ligne à ligne.
- Le fait que **deux réglages seulement soient libres** cesse d'être une note d'ADR : c'est à
  l'écran, et ça se voit en cliquant.
- La modale des montées met la même exigence sur tous les gestes qui **retirent du contrôle**, alors
  qu'un seul en bénéficiait.

#### Négatives / coûts assumés

- **La primauté du constat disparaît** (§8.1). Garantie affaiblie, contre-motif au dossier.
- **« Quiz — servi sans relecture, par doctrine »** disparaît de la matrice : le quiz **n'est pas
  une classe d'autonomie**, le bloc précédent le décrivait en dur. Repêché en note de pied de
  panneau, hors matrice — sinon on perdrait une information vraie pour une raison de forme.
- **Collision de vocabulaire, TRANCHÉE puis RÉSORBÉE au §8.0** : documentation, code **et clé JSON**
  disent maintenant la même chose — il ne reste aucune divergence. Coût : un changement de contrat,
  vérifié par un appel réel plutôt que par des tests mockés.
- **Le renommage casse mécaniquement une vingtaine de tests** qui attendent le titre « Régime » via
  un helper partagé. Coût de bascule, pas de conception.

### Suivi

**Tests-verrous exigés** :

1. **Les deux classes libres voient leur PALIER suivre le niveau ; les quatre autres affichent la
   valeur SERVEUR**,
   identique dans les trois niveaux.
2. **Aucun total de provenance** dans le panneau — reprise du verrou n°7 du §Suivi de l'ADR-0032.
3. **Les libellés de palier viennent de la constante importée**, jamais recopiés.
4. **« Sur mesure » ne fabrique rien** : tout retombe sur la valeur serveur.
5. **Descendre n'ouvre AUCUNE modale**, depuis n'importe quel niveau.
6. **La montée vers *Autonom* garde SON texte fort** — le test échoue si les deux modales fusionnent.
7. **L'ordre nouveau est verrouillé** : ZETIS LEVELS précède le détail par type de contenu. On ne
   supprime pas le verrou d'ordre révoqué — **on le retourne**.
8. **Le constat daté survit à la fusion.**
9. **La réponse réelle a exactement les clés du contrat capturé** — et **les composants rendent à
   partir de ce même fichier, sans mock**. C'est la seule paire qui peut voir un renommage de clé :
   tout le reste est mocké d'un côté ou de l'autre.

**Observation attendue** : si Papa change de niveau **sans que le panneau de détail ait été
déplié du regard** — ce qu'on ne peut pas mesurer, mais qu'une question de sa part révélerait
(« qu'est-ce que ça a changé ? ») — alors le §8.1 aura eu tort et la primauté devra revenir.
