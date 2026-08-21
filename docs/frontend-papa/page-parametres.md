# Page Papa — Paramètres

> 🔴 **Réécrite par l'`adr-0062` (2026-08-19) : la page est devenue une CARTE et des ONGLETS.**
> Tout ce qui suit le §« La page, dans son gabarit » décrit l'onglet ⚡ **Autonomie**, et reste
> **intégralement en vigueur** : ZETIS LEVELS a été **déplacé, jamais réécrit**.

## La page, dans son gabarit (`adr-0062`)

```
Paramètres                                    [N réglages s'écartent du défaut →]

🗺 La carte │ ⚡ Autonomie │ 🧠 La machine │ 💾 Données     (+ 🎒 Massimo · 👤 Papa à venir)
─────────────
```

Maquette de référence du gabarit :
`docs/frontend-papa/mockup/maquette-papa-parametres-v2.html`.

### 🗺 La carte — la vue par défaut, et la navigation

Ce n'est pas un réglage : c'est l'outil qui empêche d'en oublier un. **67 lignes** — 25 ici,
7 ailleurs, 5 nulle part, 30 à décider. Chaque ligne « ici » ouvre son onglet, chaque ligne
« ailleurs » ouvre sa page.

> **Pourquoi la vue par défaut et pas un septième onglet.** Un onglet pair qu'on n'ouvre jamais ne
> répond à personne — et celui-là est précisément l'outil qui dit ce que l'écran **ne** couvre pas.
> Mis en atterrissage, il devient la façon dont on traverse la page.

Deux listes d'honnêteté, sans lesquelles « rien d'oublié » est invérifiable : **« ailleurs »** (le
réglage existe, mais pas ici — sans cette ligne, Papa le cherche et conclut qu'il n'existe pas) et
**« nulle part »** (ce qui ne se règle qu'en `.env` ou en dur).

🔴 **Une ligne « à décider » n'est pas une ligne à construire.** Le défaut est *ne pas construire*.

### « N réglages s'écartent du défaut » — une ligne permanente, pas une case

`GET /api/settings/ecarts` rend les clés `app_settings` **qui portent une ligne**. Aucun calcul,
aucun défaut recopié : la table pose que *l'absence de ligne EST la valeur par défaut*, donc
« modifié » = « une ligne existe ». C'est la question qu'on se pose six mois plus tard devant un
comportement inexpliqué.

### 🧠 La machine — Moteurs et Santé fusionnés

Deux panneaux de lecture pure pour **une seule question de Papa** : *est-ce que ça marche ?* Quand
une génération échoue, il faut « Ollama est-il joignable ? » **et** « quel modèle ? » dans la même
seconde. `GET /api/settings/machine` rend un **instantané cohérent** ; `POST /machine/test` est le
seul geste, et il ne persiste rien.

🔴 **Aucun champ éditable** : le routage vit en variables d'environnement lues au démarrage.
🔴 **Trois états pour Ollama**, jamais un ❌ muet : injoignable / joignable mais modèle absent /
présent — c'est le piège du lien symbolique, où un SSD débranché rend le message d'un modèle mal
nommé.

### 💾 Données — la sauvegarde qui se mérite (`adr-0065`, livré le 2026-08-19 ; administration `adr-0066`, slice 2)

Trois blocs, aucun contenu d'archive : le badge **certificat** (valable + le chemin de la cible,
ou le motif du refus — le même texte que le 409), le geste **💾 Sauvegarder** (202 → travail de
file, la barre du header suit ; grisé AVEC le motif quand la cible n'est pas certifiée), et la
liste des **archives** (nom, date du nom, taille, empreinte du sidecar, statut) avec **trois
gestes** par ligne : **✓ Vérifier**, **↺ Restaurer**, **🗑 Supprimer**.

🔴 **Le mot « sauvegarde » se mérite** : une archive jamais restaurée à blanc s'affiche
« **export non vérifié** » ; « Sauvegarde vérifiée · date » n'apparaît qu'après un verdict
`reussie` de `backup_verify` ; un verdict d'échec se dit « vérification en échec (N écarts) ».
Un test-verrou tient les trois libellés.

🔴 **Restaurer se mérite dans les deux sens** (`adr-0066` §7) : le bouton **n'apparaît que** sur
les archives au verdict `reussie` (test-verrou) ; la compatibilité de schéma défavorable (§5) le
**grise avec son motif** — deux verdicts, deux traitements. Sa confirmation est un dialogue
`danger` qui **nomme l'archive**, énonce la séquence (sauvegarde-filet comprise, réveil
suspendu) et **exige la saisie de `RESTAURER`** (classe A4 — un clic seul ne part jamais,
test-verrou). **🗑 Supprimer** : dialogue qui nomme l'archive, **sans saisie** — le serveur garde
de toute façon la dernière archive vérifiée (409 « jamais zéro filet », `adr-0066` §6).

🔴 **La fin d'un geste se dit** (`adr-0067`, livré le 2026-08-21). Jusque-là, l'écran renvoyait
Papa surveiller : *« ⟳ ensuite pour relire l'état »*. C'était une consigne de surveillance, et
elle a disparu du geste **↺ Restaurer**.

- **L'attente armée** (§1) : après un 202 **parti de cette page** — jamais au montage — l'onglet
  relit `GET /donnees` toutes les **4 s** (la cadence déjà mesurée du dépôt, `adr-0041`), meurt au
  **premier verdict**, meurt si Papa quitte l'onglet, et **renonce** au bout de ~1 min. 🔴 Le
  renoncement ne rend **aucun verdict** : « je n'ai pas vu la fin » n'est pas « ça a échoué » — il
  rend la main au ⟳. Ce n'est pas le sondage que l'`adr-0062` §5 interdit : le §5 vise une page
  qui se rafraîchit **toute seule** et *« ferait bouger un champ sous les doigts »* — cet onglet
  n'a aucun champ hors du dialogue, déjà fermé quand l'attente commence.
- **L'histoire de la restauration** vit sur **sa propre ligne, pleine largeur, sous celle de
  l'archive** — et cet emplacement vient de l'écran, pas d'un avis : dans la cellule « Archive »,
  mesurée à **117 px** le 2026-08-21, la mention se coupait en deux sous un nom de fichier qui se
  coupe déjà, et le commanditaire ne la voyait pas (elle était pourtant contrastée à 5,73:1 — ce
  n'était **pas** un problème de couleur). L'état d'interruption étant **plus long** que le
  succès, y rester aurait rendu un échec **moins visible** qu'une réussite.
- **Trois issues** (`adr-0067` Amendement 1), lues du sidecar `.restauration.json` via le GET — la
  ligne du travail meurt au swap, le sidecar est le seul survivant du geste :

  | Issue | Ce que l'écran en fait |
  |---|---|
  | `reussie` (au bout, zéro écart) | un **toast** éphémère + « ↺ restaurée le … » sur la ligne |
  | `avec_ecarts` (au bout, N écarts) | 🔴 **les deux** : le toast (c'est un succès) **et** la marque durable en **ambre** (un écart est un fait qui reste vrai). Jamais le vocabulaire de la panne : la base est remplacée, les médias sont en place |
  | `interrompue` (une étape a échoué) | 🔴 **jamais un toast** — l'état persistant sur la ligne, avec l'**étape** et le **motif** rendus **tels quels**, **sans acquittement** : ce n'est pas une notification, c'est l'état de l'archive (`adr-0041` §8) |

  ⚠️ Un journal **ouvert et jamais clos, sans étape en échec**, n'est **ni** l'un **ni** l'autre :
  c'est un geste en vol — ou tué net. L'écran le dit sans conclure, en gris.
- **Le toast** est le composant existant (`role="status"`, 6 s). Il **nomme l'archive**, ne porte
  ni pourcentage ni durée ni promesse, et rappelle que **ZETIS s'est réveillé suspendu** — la
  levée appartient à Papa (`adr-0063`). Le taire ferait croire que le produit est reparti.

🔴 **Les trois gestes disent leur fin** (`adr-0067` §6, **Amendement 2**, livré le 2026-08-21) —
et par **deux mécaniques**, parce que la frontière est un fait de données, pas un goût :

| Nature du travail | Mécanique | Pourquoi elle |
|---|---|---|
| **Sauvegarder**, **Vérifier** — leur ligne `ai_jobs` **survit** | le suiveur partagé `lib/travaux.ts` (`adr-0041` §4/§9), déjà utilisé par quinze routes | il relit le travail **par son id** et rend le **motif du serveur** |
| **Restaurer** — sa ligne **meurt au swap** | l'attente armée du §1 ci-dessus | il n'y a plus de ligne à relire : le sidecar est le seul survivant |

- Le toast de **Sauvegarder** dit « **Export écrit** » — 🔴 *jamais* « sauvegarde » : le tar vient
  de naître, personne ne l'a rejoué à blanc (`adr-0065` §7).
- 🔴 **Vérifier a TROIS issues**, et c'est le piège du chantier : `verifier_sauvegarde` **retourne**
  son verdict (`reussie` / `echec`) au lieu de lever, donc un travail qui constate des écarts
  **réussit**. Plantage → **Échecs** · `reussie` → **toast** (le seul endroit où le mot
  « sauvegarde » se gagne) · `echec` → 🔴 **jamais de toast**, la ligne le dit déjà et durablement.

🔴 **Le bouton de vérification est un VERBE, jamais un état** — et il **emprunte la couleur du
badge de sa ligne**, pour que l'œil relie l'action à ce qu'elle vise :

| Statut de la ligne | Bouton | Rendu |
|---|---|---|
| export non vérifié | **✓ Vérifier** | ambre **rempli** — le seul du tableau, c'est l'action due |
| Sauvegarde vérifiée | **↻ Re-vérifier** | cadre émeraude, sans remplissage |
| vérification en échec | **↻ Re-vérifier** | cadre rose |

⚠️ **Il ne se grise jamais**, et c'est le point : une vérification n'est pas une propriété acquise
mais une **observation datée** — une archive vérifiée en août peut être corrompue en décembre. Une
case à cocher « vérifié » a été proposée puis écartée pour deux raisons : elle redirait un fait que
la colonne « Statut » porte déjà mieux (avec sa date et son compte d'écarts), et elle dirait « plus
rien à faire » d'une chose qui se périme.

🔴 **Une vérification dit son ÂGE, et ne le juge pas** (2026-08-21). Sous la pastille, en petit et
dans sa teinte : « il y a 2 j », « il y a 4 mois ». Le badge garde le **jour** (l'heure est partie —
pour une vérification, la minute est une précision que personne n'utilise, et elle reste en pied de
section).

⚠️ **AUCUN seuil de péremption, et c'est une décision, pas un oubli.** Trois raisons :

- **aucune mesure ne le justifierait** — poser un nombre ici inventerait un risque ;
- 🔴 le verdict `reussie` est une **précondition fail-closed du serveur**, deux fois : il ouvre
  **↺ Restaurer** et **protège la dernière archive de la suppression**. Une péremption « qui
  compte » bloquerait Papa au pire moment et affaiblirait l'invariant « jamais zéro filet » en
  silence ;
- rien ne pourrait l'exploiter : l'`adr-0023` §4 refuse tout ordonnanceur, donc une péremption ne
  peut **rien déclencher** — seulement se rendre.

⚠️ Et n'afficher l'âge que « quand il est grand » serait un **seuil déguisé** : il s'affiche
toujours, uniformément, jusqu'à « à l'instant ». Un test-verrou tient l'absence de seuil — le rendu
d'une vérification de 900 jours est **identique** à celui d'une vérification de ce matin, Restaurer
compris.

🔴 **Aucun octet d'archive ne passe par HTTP** (`adr-0065` §1) : pas de bouton « Télécharger »,
et le pied de page dit pourquoi. La **destination ne se choisit pas ici** — elle se certifie sur
l'hôte (`ZETIS_BACKUP_DIR` + `scripts/certifier-cible-sauvegarde.sh`), l'écran affiche le chemin
et l'explique. Un refus (409) s'affiche en **ambre avec son motif**, jamais en panne rouge
(`estRefus` distingue au code, pas au texte). Purger en masse, rotation, export lisible : phase E,
hors de cette page ; annuler une restauration = runbook `TROUBLESHOOTING.md` (re-swap
`zetis_avant`), pas un bouton.

### Les règles transverses (`adr-0062` §6)

| Règle | Ce qu'elle interdit |
|---|---|
| Un onglet = une transaction | Un « Enregistrer » global couvrant quatre domaines n'est pas lisible. |
| Jamais d'auto-save | Aucun réglage ne change au survol ni au clic. |
| L'onglet vit dans l'URL (`?onglet=`) | Un rechargement qui ramène ailleurs. |
| Le brouillon survit à la navigation | Une modale « voulez-vous quitter » qui punit un geste innocent. |
| Chargement : squelette par onglet | Une valeur affichée « au hasard » avant la réponse. |
| Erreur de lecture ⇒ **aucun réglage** | Un repli sur les défauts — un réglage faux affiché une seconde est un mensonge. |
| Aucun sondage | Un champ qui bouge sous les doigts. |
| Un onglet vide n'existe pas | Une surface promise qui n'existe pas. |

---

## Objectif de l'onglet ⚡ Autonomie

Répondre à une question que personne ne pose à voix haute : **jusqu'où ZETIS produit le contenu de
Massimo tout seul, et Papa le sait-il ?**

L'observation du 2026-08-02 a montré que sur 33 objets produits en un lot, **2 seulement**
arrivaient en relecture. Le reste atteint Massimo sans qu'aucun humain les voie. Ce n'est pas une
panne : c'est le régime en vigueur, jamais choisi explicitement.

> **Le premier travail de cette page n'est donc pas de laisser Papa monter d'un palier. C'est de
> lui montrer où il est déjà.** Un écran qui proposerait « Laisser ZETIS servir » à quelqu'un qui
> sert déjà sans relecture serait un mensonge de plus.

Maquette de référence : `docs/frontend-papa/mockup/maquette-papa-parametres-autonomie.html`.
Décisions : `adr-0032` (les paliers, la levée du gel d'A1), `adr-0011` **addenda §F (provenance)
et §G (autorité, matrice, veto)**, `adr-0031` + son addendum (le gate vit dans la sélection).

## Principes

- ~~**L'état des lieux précède le réglage.** Le bloc « où vous en êtes » est au-dessus des
  préréglages, toujours, et il n'est pas repliable.~~
  > ⚠️ **RÉVOQUÉ le 2026-08-04** (addendum §8.1). Le réglage passe en tête sous le nom **ZETIS
  > LEVELS**, et le constat le suit **dans le même objet** : le panneau de détail montre le niveau
  > sélectionné, et **au repos celui qui est actif**. On révoque la position, on garde l'intention —
  > Papa voit où il est sans le chercher. Révocation **conditionnée par le §7** : elle n'est
  > défendable que parce que l'état vit désormais en tête de sidebar, sur les 22 pages. Le
  > contre-motif reste au dossier dans l'addendum.
- **Le réglage dit ce qu'il fait.** Choisir un niveau montre **ce qu'il déplace**, classe par
  classe — calculé depuis les données du serveur, jamais rédigé en dur (addendum §8.2). Et il dit
  aussi **ce qu'aucun niveau ne change** : quatre classes sur six sont verrouillées, les taire
  promettrait une richesse que la donnée n'a pas.
- **Un régime, jamais un score.** La provenance s'affiche par objet et **ne se totalise jamais**
  (§F.2). Cette page décrit *comment ça marche aujourd'hui*, pas *combien Papa a délégué*.
- **Aucun interrupteur sans effet.** La page précédente en portait quatre ; ils ont été retirés le
  2026-08-02 parce qu'*« une page où trois interrupteurs ne font rien est un piège le jour où six
  engagent l'autonomie de ZETIS »*. **Ce jour est arrivé.** Tout ce qui est affiché ici est branché,
  ou visiblement verrouillé **avec son motif**.
- **Un cadenas dit pourquoi.** Aucune ligne verrouillée sans sa raison à l'écran : un cadenas muet
  se lit comme une panne.
- **Rien de cette page n'atteint Massimo.** `require_parent` côté serveur ; aucune donnée, aucun
  composant partagé avec `frontend-massimo` (invariant V1 : un retrait doit rester invisible).
  > ⚠️ **VRAI aujourd'hui, et daté** (`adr-0062` §7). Cette phrase cessera de l'être avec l'onglet
  > 🎒 **Massimo** — accessibilité, voix, rythme — et avec toute remise à zéro de la progression.
  > La décision est **déjà prise** : on **assume et on marque**. Chaque réglage qui traverse
  > portera 🎒, et cette phrase s'amendera **dans le commit** du premier d'entre eux — jamais à
  > côté d'un bouton qui la contredit. Le précédent est au dossier : *« ZETIS ne produit rien sans
  > votre validation »* est restée affichée après être devenue fausse.

## Structure

### En-tête

Inchangé : titre « Paramètres », sous-titre « Ce qui se règle ici, et ce qui se règle là où la
décision se prend. »

### Section « Réglages actifs » (dans l'onglet ⚡ Autonomie depuis l'`adr-0062`)

Renvoi vers l'agenda. ⚠️ **La phrase *« tant que ce n'est pas le cas, ZETIS ne produit rien sans
votre validation »* disparaît dans le même commit que cette livraison** — elle est déjà fausse au
regard de l'observation, et la laisser à côté d'un panneau qui dit l'inverse serait la pire des
deux options.

### Section « ⚡ Autonomie de ZETIS » (remplace le placeholder `indisponible`)

Quatre blocs, dans cet ordre — **révisé le 2026-08-04** (addendum §8.1) : le réglage est passé en
tête, et le bloc « Où vous en êtes aujourd'hui » a **fusionné** avec lui.

#### 1. « ZETIS LEVELS » — les trois niveaux, et ce que chacun fait

Trois cartes cliquables, une seule active : **Manual · Hybrid · Autonom**.

| Régime | Ce qu'il dit |
|---|---|
| 🔒 **Manual** | ZETIS produit, **vous validez tout** avant que Massimo le voie — fiches et cartes mentales comprises. |
| ⚖️ **Hybrid** | ZETIS sert les dérivés seul. **Les cours passent toujours par vous.** |
| 🚀 **Autonom** | ZETIS rédige et sert **y compris les cours**. Vous pouvez retirer, tant que Massimo n'a pas ouvert. |

> **Ce sont les mots des avatars, pas ceux des ADR** (décision du 2026-08-04, addendum §7.7). Les
> documents de décision continuent de dire *Manuel · Semi-autonome · Autonome* — ce sont les mêmes
> régimes, et les **clés** de l'API (`manuel | semi | autonome`) ne bougent pas. Le nom à l'écran
> suit l'image ; l'identité de la donnée suit le serveur.

**Le préréglage n'est pas un état stocké.** Six clés plates en base ; l'étiquette est **dérivée**
des six valeurs à l'affichage. Un badge **« Sur mesure »** s'affiche si elles ne correspondent à
aucun régime — **inatteignable en v1** (deux réglages libres seulement), mais l'état existe et se
rend.

~~⚠️ **Phase 1 : le régime Autonome est indisponible**, grisé, avec son motif.~~

✅ **LEVÉ le 2026-08-03** (ADR-0034 §8) : le Journal est livré **avec son geste *Retirer***, donc
`VETO_SURFACE_AVAILABLE = True` et *Autonome* est offert. Le palier 3 et son veto se sont livrés
ensemble, comme le verrou n°5 de l'ADR-0032 l'exigeait — **aucune ligne du front n'a changé**,
`choices` venant du serveur.

##### Sous les cartes — « ce que fait ce niveau »

Un panneau **en lecture seule**, qui suit la carte sélectionnée et, **au repos, montre le niveau
actif**. C'est lui qui a remplacé le bloc « Où vous en êtes aujourd'hui » (addendum §8.1).

Il est **calculé**, jamais rédigé : pour chaque classe, `label` du serveur → libellé de son
**palier**. ⚠️ *niveau* = l'un des trois régimes ; *palier* = le degré 0-3 d'une classe. La
convention est fixée à l'addendum **§8.0**, et elle vaut pour toute cette page.
Écrire une prose *classe × niveau* recopierait la matrice du §G.2 sous une forme que le serveur ne
peut pas refuser — un 422 protège une valeur, jamais un texte (addendum §8.2).

**Deux groupes, et le second est une information, pas une omission** (addendum §8.3) :

| Groupe | Contenu |
|---|---|
| **Ce que ce niveau décide** | Les **deux** classes libres (A0a, A1). Leur **palier** change à la sélection. |
| **Ce qu'aucun niveau ne change** | Les **quatre** verrouillées, en retrait, **avec leur motif serveur**. |

En pied, l'observation — **et c'est toujours le seul chiffre de la page** :

> 📊 Sur le chapitre produit le 2 août, **2 contenus sur 33** vous sont arrivés en relecture.
> **Ce n'est pas un retard** — c'est le régime ci-dessus.

⚠️ Daté, attaché à une observation, **non recalculé et non répété** — et surtout **il ne suit pas le
niveau sélectionné** : il dirait alors ce qui *serait* arrivé, et deviendrait une projection
déguisée en fait. Un compteur vivant ferait de ce bloc un reproche permanent (§F.2). Les faits par
objet vivent sur le Journal.

⚠️ Hors matrice, en note : **les quiz sont servis sans relecture, par doctrine (ADR-0014)**. Le quiz
n'est pas une classe d'autonomie — le taire pour une raison de forme perdrait une information vraie.

#### 2. Modale de confirmation — à l'ENREGISTREMENT

Choisir un niveau ne fait qu'**afficher** ce qu'il déciderait : aucune friction, Papa compare les
trois librement. C'est **« Enregistrer »** qui ouvre la modale, et elle montre **ce qui va être
écrit**, avec **l'avatar du niveau visé**.

Son corps est l'**écart** — un `avant → après` sur les seules classes qui bougent — et non le
panneau, qui reste affiché derrière elle. ⚠️ **On ne confirme pas ce qui ne change pas** : les
classes verrouillées n'y figurent pas.

⚠️ **Toute écriture se confirme, descente comprise.** *« On ne freine pas un retour au contrôle »*
survit dans le **TON**, pas dans l'absence de modale : une descente s'annonce « vous rendent du
contrôle », sans avertissement. Un « Enregistrer » qui ouvrirait parfois une modale serait moins
prévisible qu'un qui confirme toujours.

| Enregistrement | Modale |
|---|---|
| Rien à écrire | **aucune** — le bouton est désactivé |
| Descente | sobre, ton positif — « vous rendent du contrôle » |
| Montée ordinaire | sobre — « retirent du contrôle » |
| Montée du **cours** vers « ZETIS sert » | **la modale forte, inchangée** (voir plus bas) |

⚠️ Renoncer **n'annule pas le brouillon** : Papa n'a pas retiré son intention, il a refusé de la
graver. Le bouton « Annuler » de la page reste le seul retour à l'état serveur.

#### 3. « Détail par type de contenu » — `<details>` replié par défaut

Six lignes. Deux réglables, quatre verrouillées **avec leur motif visible**.

| Classe | Intitulé | État |
|---|---|---|
| **A0a** | Dérivés inertes — fiches, cartes mentales, quiz, capsules | segmenté **Vous validez / ZETIS sert** |
| **A0b** | Cartes de révision | 🔒 **ZETIS sert** — *aucune étape de validation n'existe pour les cartes ; « vous validez » serait un mensonge tant qu'elle n'est pas construite* |
| **A1** | Rédaction de cours | segmenté **Vous validez / ZETIS sert** (✅ les deux offerts depuis le 2026-08-03) |
| **A2** | Programme — notions, leçons, chapitres | 🔒 **ZETIS propose** — *une erreur ici redessine la carte* |
| **A3** | Création de missions | 🔒 **Vous validez** — *élire n'est pas créer : le sélecteur est déjà autonome* |
| **A4** | Supprimer, archiver, dévalider | 🚫 **Jamais** — *définitif* |

**Monotonie** : passer A1 à « ZETIS sert » **force A0a à « ZETIS sert »**. On ne sert pas un cours
sans relecture tout en relisant les fiches qui en dérivent ; l'état inverse n'est pas offert.

#### 4. Le veto

Un encart, pas un réglage :

> **Vous pouvez retirer ce que ZETIS a servi.** Tant que Massimo ne l'a pas ouvert, un contenu se
> retire **sans trace et sans qu'il le sache**. Une fois ouvert, il ne se retire plus — il se
> corrige. Rien à faire pour accepter : le silence vaut accord.

Lien : **📓 Voir ce que ZETIS a servi →** (vers le Journal). ⚠️ **Aucune liste ici** : la page des
réglages renvoie, elle n'énumère pas — sinon elle redevient un compteur.

### Modale de confirmation — passage d'A1 à « ZETIS sert »

Obligatoire, et **jamais un `confirm()` générique** : c'est la révocation d'une décision écrite.

- Titre : **« ⚠️ Vous retirez le dernier contrôle humain »**
- Corps : *« Aujourd'hui, le cours est le seul contenu de ZETIS qui passe devant vous avant
  d'atteindre Massimo. Les fiches, les cartes, les quiz partent déjà sans relecture. »*
- Quatre conséquences listées : publication immédiate · marquage « servi par une règle que vous avez
  posée » · retrait possible tant que Massimo n'a pas ouvert · **revenir en arrière arrête la suite,
  ça ne retire pas ce qui est déjà servi** (invariant V2).
- Boutons : *Garder mon contrôle* (fantôme) / *Je comprends, laisser ZETIS servir* (ambre).

Le passage **inverse** (3 → 2) ne demande aucune confirmation : on ne met pas de friction sur le
retour au contrôle.

## Données API

- `GET /api/settings/autonomy` → les six clés et leurs valeurs, plus, par clé, `locked: bool` et
  `locked_reason: string | null` — **et, à part, `auto_trigger_enabled`** (ADR-0035 §5). **Le verrou vient du serveur**, jamais d'une liste en dur dans le
  front : c'est lui qui refuse l'écriture, l'UI ne fait que le rendre lisible.
- `PUT /api/settings/autonomy` → écrit une ou plusieurs clés. **422/409 sur toute classe
  verrouillée**, y compris via un préréglage. Le message du serveur est relayé tel quel.
  `auto_trigger_enabled` voyage dans **son propre champ**, jamais dans `values` — le serveur
  rejette toute clé hors des six paliers, et le déclencheur n'en est pas un.
- Routeur **neutre** (`/api/settings`), pas `/api/agenda/settings` : un réglage d'autonomie servi
  depuis le routeur de l'agenda serait une dette immédiate.

## Le déclencheur automatique — un bloc à part (ADR-0035 §5, livré le 2026-08-03)

Sous les six classes, visuellement **séparé** d'elles : *« ⏰ ZETIS peut démarrer sans vous »*, une
case à cocher, **défaut NON**.

> **Deux questions, deux sources.** Le palier dit si ZETIS a le droit de **servir** sans relecture ;
> cette clé dit s'il a le droit de **démarrer** sans clic. Les fusionner rendrait impossible le
> régime intermédiaire le plus naturel — « ZETIS sert seul, mais il attend que je demande » — et son
> symétrique, qui est **le plus sûr des deux**.

⚠️ **Un préréglage ne la touche dans aucun sens** : elle n'est pas dans `AUTONOMY_CLASSES`, sinon
`niveau_de()` ferait qu'un régime armerait le déclencheur au passage. Deux test-verrous le tiennent,
back et front.

Le bloc « où vous en êtes » est **statique** : ses quatre phrases sont du texte, pas un calcul.
Rien à interroger, rien qui puisse dériver en compteur.

## États

- **Chargement** : la section entière en squelette ; jamais de préréglage affiché « au hasard »
  avant la réponse (un régime faux affiché une seconde est un mensonge). ⚠️ **Vaut aussi pour le
  bloc de la sidebar** (addendum §7.4), où le mensonge coûte plus cher : il est visible partout.
- **Erreur de lecture** : la section affiche l'erreur et **aucun réglage** — pas de valeurs par
  défaut inventées. Même règle en sidebar, où le bloc dit « État indisponible » et **rien
  d'autre** — ni « Manuel » par prudence, ni la dernière valeur connue.
- **Erreur d'écriture** : l'état revient à la valeur serveur, le message est affiché tel quel.
- **Enregistrement** : bouton explicite (pas d'auto-save). Un réglage d'autonomie ne se change pas
  par inadvertance au survol.

## Navigation

**Deux** points d'entrée depuis le 2026-08-04 : l'entrée sidebar existante `⚙️ Paramètres`
(`/parametres`), en bas, `startsGroup` — et le **bloc d'état en tête de sidebar**, ci-dessous. Le
veto renvoie au Journal ; aucun autre lien sortant.

## Le régime se lit aussi dans la sidebar (addendum §7 — 2026-08-04)

En tête de la sidebar Papa, **à la place du bandeau de marque** : un **bloc de lecture** cliquable
qui mène ici. Il porte **les deux axes**, jamais un seul — *Autonome + déclencheur désarmé* veut
dire « ZETIS sert seul mais attend votre clic », et un signe unique le dirait faux (addendum §7.1).

> La signature `ZETIS Papa` n'a pas disparu : **elle est passée dans le header**, qui est fixe. Le
> bloc d'état est identique des deux côtés du miroir — sans ce mot, une capture d'écran de Papa ne
> se distingue plus d'une capture de Massimo (addendum §7.2bis). *Cockpit de pilotage*, lui, ne
> revient pas.

**Aucun texte à côté du logo** : un avatar de 88 px, et un **badge à cheval sur son bas** qui porte
les deux axes à la fois — le mot du régime et le glyphe du déclencheur.

| État | Avatar | Halo | Badge |
|---|---|---|---|
| Chargement | neutre | **aucun** | squelette (aucun mot) |
| Erreur de lecture | neutre | **aucun** | gris — **ILLISIBLE** |
| `manuel` | manuel | fixe | bleu — ⏸/⚡ **MANUAL** |
| `semi` | semi | souffle 4 s | bleu→violet — ⏸/⚡ **HYBRID** |
| `autonome` | autonome | souffle + rotation 6 s | indigo→fuchsia — ⏸/⚡ **AUTONOM** |
| `null` | neutre | fixe | cyan — ⏸/⚡ **SUR MESURE** |

Le **glyphe est indépendant du mot** : il lit `auto_trigger_enabled` (⏸ *démarre sur clic* / ⚡
*démarre seul*), et un point qui orbite l'avatar le double quand le déclencheur est armé.

Au **survol** (et au **focus clavier**) : une infobulle au cadre teinté par le régime, portant le
libellé, sa description complète et la phrase du déclencheur. Elle est en `position: fixed` — la
sidebar clippe son contenu pour que la nav défile seule, et une infobulle ancrée y serait coupée.

> **La sidebar LIT, elle ne règle pas.** Aucun réglage ne se change depuis là — le bloc est un lien,
> rien de plus. Un régime ne doit pas pouvoir bouger d'un clic dans un coin d'écran quand cette
> page exige elle-même un bouton « Enregistrer ».

Le régime affiché vient **toujours** du serveur (`niveau`) ; le front ne le recalcule jamais.
Rafraîchi au montage et après un enregistrement réussi — **jamais par sondage** : deux onglets
ouverts divergent jusqu'au rechargement, et c'est accepté (addendum §7.4).

## Hors périmètre

**De la tranche 1 de l'`adr-0062`** (la carte + Autonomie + La machine) : les onglets 🎒 Massimo,
👤 Papa et 💾 Données · tout geste destructif · sauvegarde et restauration · code parental et
verrou d'inactivité · alertes et SMTP · SSD, UUID de volume et occupation disque · le commit git
(pas baké dans l'image) · « Suspendre ZETIS ».

**Jamais bâti**, motif dans l'`adr-0062` : journal technique · sélecteur de modèle de génération ·
réinitialisation totale à l'écran · sessions ouvertes et révocation.

**De la livraison d'origine (`adr-0032`)** :

- ~~Le **Journal** et sa page — donc le régime Autonome reste indisponible en phase 1.~~
  > ✅ **LEVÉ le 2026-08-03** (ADR-0034). Le Journal est livré **avec son geste *Retirer***, donc
  > `VETO_SURFACE_AVAILABLE = True` : le serveur rouvre le palier 3 d'A1 et le régime *Autonome*
  > est offert. **Aucune ligne du front n'a changé** — `choices` vient du serveur, comme prévu.
  > Vérifié à l'écran le jour même : *Autonome* sélectionnable, modale de révocation affichée pour
  > la première fois, monotonie appliquée (A1 = 3 a forcé A0a = 3), `PUT` accepté et relu en base.
- ~~La liste des contenus servis, le geste *Retirer*~~ — livrés par l'ADR-0034 (page `/journal`).
  Reste hors périmètre : le geste *Corriger*.
- Le **gate de validation des cartes SRS** (A0b reste verrouillé) et l'action « Corriger » renforcée
  du §G.3.
- Le régulateur de volume du palier 3 (différé, ADR-0032 §5).
- Toute évolution d'A2 et A3.
- Toute surface côté Massimo.
