# Addendum ADR-0034 — Le Journal dit sous quel régime, mène à ce qui débloque, et sait ce qui l'est déjà

## Statut

Proposé — 2026-08-04. Écrit sur **trois reproches faits à l'écran**, le même jour, sur les mêmes
lots : le Journal ne disait pas sous quel régime ZETIS avait travaillé (#21, #22), une ligne
« non produit » ne menait nulle part (#21, #22), et une ligne dont la cause avait été levée
continuait de se lire comme un problème actuel (#23).

> Les trois tiennent en une phrase : **le Journal savait raconter, il ne savait pas situer.** Ni
> dans quel régime, ni vers où, ni à quand.

> S'appuie sur : `adr-0034` (le Journal, le veto), `adr-0032` (les paliers — et son refus de
> persister le préréglage), `adr-0037` (la leçon canonique d'une notion), `adr-0031 §4`
> (« les colonnes disent POURQUOI, jamais SUR QUOI »), la convention `pilotageLinks`.
>
> **Ne révoque rien.** Il ajoute une colonne et un champ de lecture. **Une migration.**

## Contexte

Le Journal répondait à *quand · quoi · notion · produit par · validé par · demandé par*. Deux
questions manquaient, et les deux se posent devant un lot qui n'a rien produit.

### 1. « Sous quel régime ? » — sans quoi un gate ressemble à une panne

Un lot qui n'équipe rien sous **Manual** n'est pas en panne : c'est le gate du §7 qui a fonctionné,
exactement comme il doit. Le même écran, sur un lot qui a réellement échoué, affiche la même chose.

Le régime n'est ni sur le lot ni dans le Journal — et l'ADR-0032 a **délibérément refusé** de le
persister : *« un mode stocké plus six clés donnerait deux réponses à une seule question »*.
`niveau_de()` le **dérive** des réglages courants.

> ⚠️ **Mais dériver à l'affichage, c'est expliquer un lot d'hier par les réglages d'aujourd'hui.**
> Papa passe en *Autonom* ce soir, et tous ses lots relus d'hier se relisent « servis sans
> relecture ». Le Journal aurait menti sur le seul point où on lui demande la vérité.

### 2. « Où est ce qu'il faut débloquer ? » — le motif sans la destination

> *« Cours à valider — ZETIS ne valide pas les cours à votre place »*, et rien d'autre.

Papa doit alors retrouver la leçon à la main sur une autre page. C'est le reproche que la
convention `pilotageLinks` avait déjà tranché ailleurs : *« une cellule qui affiche un état sans y
donner accès oblige Papa à retrouver l'objet à la main »*. Le Journal, lui, ne l'avait pas reçu.

## Décision

### 1. Le lot CAPTURE son régime au démarrage — deux paliers, jamais le nom

`production_runs.a0a_level` et `a1_level`, écrits par `runner.execute` à l'instant où il lit déjà
les paliers pour s'exécuter. C'est le patron de `authorized_by` : ce qui a autorisé un lot
s'**écrit** sur lui, ne se déduit pas après coup.

**Les paliers, pas le nom**, et c'est l'ADR-0032 tenue et non contournée : on stocke les FAITS, le
nom se redérive à la lecture **par `niveau_de` elle-même**. Deux clés suffisent — `NIVEAUX` n'en
nomme que deux, et ce sont exactement celles qui commandent la production.

Trois réponses possibles à la lecture, et les trois disent quelque chose de différent :

| Valeur | Sens |
|---|---|
| `manuel` / `semi` / `autonome` | un régime nommé |
| `sur_mesure` | des paliers qui ne composent aucun préréglage — état légitime |
| `null` | **non enregistré** : lot antérieur à la colonne |

⚠️ **Aucune rétro-attribution** (doctrine §F.4) : les anciens lots affichent « régime non
enregistré », ce qui est la vérité. Leur plaquer le réglage du jour serait le défaut qu'on ferme.

### 1bis. Ce que la capture ne couvre pas se DÉDUIT des actes du lot — jamais des réglages

La décision §1 laisse tous les lots antérieurs en « régime inconnu ». Vu à l'écran le même jour :
**22 lots sur 23** portaient cette mention. *« Je veux connaître dans quel mode était ZETIS à la
production. »*

Le refus du §1 porte sur **une** source : les réglages d'aujourd'hui, qui ont pu changer. Il ne
porte pas sur les **actes du lot**, qui, eux, n'ont pas changé — un cours que ZETIS a rédigé reste
un cours que ZETIS a rédigé. On peut donc reconstituer sans mentir, à condition de ne lire que ça.

| Preuve laissée par le lot | Ce qu'elle FORCE | Régime |
|---|---|---|
| `trigger = request` | le scan n'émet cette origine que sous ***Autonome*** (ADR-0036 §1) | `autonome` |
| il a **rédigé un cours** | le gate du §7 était tombé → A1 = 3, donc A0a = 3 par monotonie | `autonome` |
| un dérivé laissé **à relire** | A0a = 2 — et A1 = 3 forcerait A0a = 3, donc A1 = 2 | `manuel` |
| un dérivé **servi** + une notion écartée faute de cours | A0a = 3 et A1 < 3 | `semi` |

⚠️ **La capture PRIME toujours.** Un lot qui a enregistré son régime ne se fait pas réinterpréter
par ses artefacts — sinon la capture ne protégerait plus rien. Verrouillé par son test.

⚠️ **« Déduit » n'est pas « enregistré », et l'écran le DIT.** `zetis_mode_source` voyage avec la
réponse, et la pastille porte une mention discrète. Une reconstitution qui se ferait passer pour un
fait serait pire que l'absence qu'elle remplace.

⚠️ **Le cas ambigu reste INCONNU, et c'est le cœur de la décision.** Un lot qui a servi ses dérivés
sans jamais croiser un cours manquant ne dit rien d'A1 : *Semi* et *Autonome* y sont indiscernables.
On ne répond pas. Mesuré sur la base de dev : **2 lots sur 9** obtiennent une réponse — c'est peu,
et c'est la vérité disponible. Un défaut qui aurait rempli les sept autres aurait eu l'air bien
meilleur en étant faux.

> **Ce qui resterait possible sans mentir** : afficher le fait PARTIEL sur ces lots-là — *« dérivés
> servis sans relecture »* (A0a = 3, certain) sans nommer le régime. Non fait : ce serait un
> troisième vocabulaire à l'écran, pour une information dont on n'a pas montré qu'elle manque.

### 2. Une ligne bloquée porte SA destination — résolue serveur

Chaque événement `blocked` porte `target: {lesson_id, chapter_id, subject_id}`, et l'écran en fait
un « Ouvrir la leçon → » vers `pilotageLink("cours", …)` — **la convention existante**, pas une
quatrième façon de désigner un cours.

⚠️ **La résolution est SERVEUR.** *« Quelle est la leçon de cette notion »* a une seule réponse
dans le dépôt (`lessons_of_skill`, ADR-0037) — elle a coûté un ADR entier parce que trois modules
répondaient différemment. Laisser le front la deviner depuis un `skill_id` en referait une
quatrième. Résolution **groupée pour toute la page** : un aller-retour par ligne referait le mal du
2026-08-02.

⚠️ **Élargi aux lignes PRODUITES le jour même.** La première version ne portait de destination que
sur `blocked`, au motif qu'*« une pièce produite n'a rien à débloquer »*. C'était vrai de la
destination d'alors — le référentiel, pour écrire le cours. Ce n'est pas le bon motif : sur une
ligne produite on ne va pas **réparer** la leçon, on va **voir la pièce**, et c'est le geste suivant
le plus naturel. Deux sens de lecture, deux destinations, une seule forme (`target`) ; c'est le
`piece` de la ligne qui décide laquelle, côté écran.

⚠️ **`error` et `skipped` restent sans destination.** Une erreur se lit dans son message ; l'ouvrir
désignerait la mauvaise cause. Et « déjà présent » veut dire que **ce lot-là n'a rien produit** : y
rattacher la pièce ferait croire le contraire. Une notion **orpheline** non plus n'en porte aucune —
il n'y a rien à ouvrir, ce que son motif dit déjà.

⚠️ **Les cartes SRS sont un cas à part, et il est traité explicitement.** La matrice de Couverture
n'a que quatre colonnes leçon-centrées : faire passer les cartes par la branche générique de
`pilotageLink` les enverrait sur `/quiz`. Leur page attend en plus un **`skill_id`** en `focus`, pas
un id d'objet. Deux différences dans un seul cas → une branche nommée dans `journalLink`, plutôt
qu'une cinquième entrée forcée dans un type qui ne la veut pas.

### 3. Une cause levée est ANNOTÉE au présent — la ligne, elle, ne bouge jamais

Constat du même jour, une heure après les deux premiers : le lot #23 a été bloqué à **15:18:58**
par un cours inexistant ; le cours a été écrit à **15:20:51** et validé à **15:35:33**. Sa ligne —
*« non produit — Cours jamais rédigé »* — est **exacte**, et elle se lit comme un problème
**actuel**.

> Les deux lectures sont légitimes et elles ne parlent pas du même temps. Le motif dit **ce qui
> s'est passé** ; il manquait quelqu'un pour dire **où on en est**.

Décision : chaque ligne bloquée porte `resolved`, calculé **à la lecture**, et l'écran en fait un
« · **depuis résolu** » posé **à côté** du motif.

⚠️ **Le motif d'origine n'est jamais réécrit** — c'est la moitié qui compte, et elle est tenue par
un test qui vérifie que la ligne est intacte *après* la résolution. Corriger la ligne ferait perdre
la raison pour laquelle le lot n'a rien produit ; c'est le §F.4, et il ne bouge pas.

⚠️ **Rien n'est stocké.** Même forme que `stale` (§2) et que `target` : une lecture. Rejouer
l'histoire en base, c'est la perdre.

⚠️ **`resolved` = plus AUCUN blocage**, pas « le motif d'origine a disparu ». Une notion passée de
*cours jamais rédigé* à *cours à valider* a changé de cause et resterait bloquée : annoncer
« résolu » ferait renoncer Papa au geste qui reste. Verrouillé par son propre test.

⚠️ **Sous le palier D'AUJOURD'HUI**, et c'est l'inverse assumé de `zetis_mode` : la question posée
est *« un lot lancé maintenant passerait-il ? »*. Les deux cohabitent sur la même ligne sans se
contredire — l'un est au passé, l'autre au présent, et chacun le dit.

### 4. L'état d'une ligne se lit à la CASE, plus au mot

*« "non produit" porte à confusion »*, dit à l'écran le 2026-08-04 — et c'est juste : la formule se
lit comme un échec alors que, sur une ligne bloquée, c'est un gate qui a fonctionné. Chaque ligne
porte donc une **case** : cochée pour ce qui est fait, vide pour ce qui reste, une croix pour une
erreur.

| Issue | Case | Mot |
|---|---|---|
| `generated` | ☑ | produit |
| `skipped` | ☑ (atténué) | déjà présent |
| `blocked` | ☐ | à faire |
| `error` | ✕ | erreur |

⚠️ **Ce n'est pas un `<input type="checkbox">`, et c'en est le contraire exact.** Un journal est un
registre : rien ne s'y coche à la main. Une vraie case laisserait croire qu'on peut la cocher — un
contrôle qui ne contrôle rien, et un mensonge pour les lecteurs d'écran. Le glyphe est décoratif ;
le mot reste, rendu au clavier par `aria-label`.

⚠️ **La case d'une ligne bloquée reste VIDE même quand la cause est levée.** Ce que le lot a fait ne
change pas ; c'est le badge « depuis résolu » (§3) qui dit le présent. La cocher réécrirait le passé
par l'image après avoir renoncé à le réécrire par le texte.

## Ce que cet addendum ne fait pas

- **Aucun compteur, aucun ratio** par régime. Le §F.2 tient : la provenance est un fait, elle ne se
  totalise pas. « 14 lots servis sans relecture » resterait un bulletin de retard.
- **Aucune surface de réglage depuis le Journal.** On lit le régime d'un lot passé ; on ne le
  change pas d'ici — les paliers ont leur page.
- **Aucune rétro-attribution**, ni au déploiement ni à la lecture.
- **Rien pour Massimo.** Le Journal reste un écran de Papa.

## Le signal qui dirait qu'on s'est trompé

Papa lisant le régime d'un lot et **agissant sur les réglages d'après lui**, croyant y voir l'état
courant. Ce serait le signe que la page mélange deux temps ; la réponse serait de dater le régime à
l'écran (« le 4 août, ZETIS était en Manual »), jamais de le retirer — l'information manquait
vraiment.
