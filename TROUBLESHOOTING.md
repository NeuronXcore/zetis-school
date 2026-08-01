# TROUBLESHOOTING.md — Écarts réels rencontrés

> Journal des divergences concrètes (API inattendue, pièges d'intégration, crashs) rencontrées en
> cours de chantier, avec la cause et la solution retenue. Complète `MEMORY.md` (raisonnement) et
> les ADR (décisions). Une entrée = un piège qui ferait perdre du temps à la prochaine session.

## Chantier `feat/page-matiere` — index de notions, slice A — 2026-08-01

### `app.routes` n'est pas à plat : un test « cette route n'existe pas » passe **à vide**

**Symptôme** : le test qui vérifie l'absence de `GET`/`PATCH` élève sur `content_requests`
échouait en trouvant… **rien du tout**, pas même le `POST` qui fonctionne pourtant dans les
tests voisins.

**Cause** : dans cette version de FastAPI, `app.include_router()` ne déplie pas les routes dans
`app.routes` — il y range un objet **`_IncludedRouter`** sans attribut `path`. Sur les 45 entrées
de `app.routes`, 41 sont de ce type.

```python
# ❌ Ce filtre renvoie TOUJOURS un ensemble vide — donc un test d'absence toujours vert.
{r.path for r in app.routes if getattr(r, "path", "").startswith("/api/student/…")}
```

**Danger réel** : écrit dans l'autre sens (« la route interdite n'est pas là »), ce test **passe
même si la route existe**. Il ne protège de rien tout en donnant l'impression du contraire.

**Solution** : interroger le contrat déclaré, `app.openapi()["paths"]`. C'est aussi la bonne
source sémantiquement — une 403 ou une 405 masquerait une route bel et bien montée.

### Le plafond d'un vocabulaire fermé ne borne rien s'il est appliqué après déduplication

`CONTENT_REQUEST_MAX_KINDS = 7` est décrit comme « la panoplie entière ». Mais la panoplie
affiche **7 activités** alors que `CONTENT_KINDS` n'en compte que **6** : `eli5` se demande sous
la forme `cours`, `revision` sous la forme `card`. Une liste dédupliquée ne peut donc jamais
atteindre 7 — le garde-fou était inatteignable, donc intestable, donc décoratif.

Le plafond est mesuré sur la charge **brute**, avant dédup : il borne la **taille** de l'appel,
là où le vocabulaire borne son **contenu**. Deux garde-fous, deux risques différents.

### Modèles : les noms de colonnes qui ne sont pas ceux qu'on suppose

Pièges rencontrés en semant des fixtures (ils échouent en `TypeError`, pas en erreur SQL) :

- `SpacedReviewCard` → **`front_markdown` / `back_markdown`** (pas `front`/`back`), et le statut
  actif est `scheduled` (`INACTIVE_CARD_STATUSES` définit le reste) ;
- `Capsule` → **`subject_id` est requis** en plus de `skill_id`.

## Chantier `feat/galaxy-animations` — galaxie animée — 2026-07-31 (soir)

### Ce que `react-force-graph-3d` 1.29.1 permet vraiment — vérifié ligne à ligne

**Le constat le plus coûteux du chantier : il a réécrit le §2 d'un ADR.** À ne pas re-chercher.

| fait, dans `three-forcegraph` 1.43.4 | conséquence |
|---|---|
| `d3ReheatSimulation()` = `d3ForceLayout.alpha(1)`, **sans argument** | « réchauffer à alpha bas » est **impossible** |
| `d3AlphaTarget` existe dans le kapsule (patron du drag) mais **n'est relayé nulle part** | ni prop React, ni méthode du ref |
| `graphData.onChange` fait `stop().alpha(1)` — « re-heat the simulation » dit la lib | **tout** changement de données réchauffe à fond |
| `graphData` n'est **pas** dans les 18 méthodes liées au ref (`methodNames`) | `graphRef.current.graphData` vaut `undefined` |

**Conséquence** : une croissance nœud par nœud sur simulation vivante ré-explose à chaque étoile,
quoi qu'on fasse. Préserver l'identité des objets nœuds sauve les **positions de départ**, pas la
convergence. D'où la solution retenue partout : **positions calculées, nœuds épinglés
(`pinned`), moteur neutralisé**.

⚠️ **Ne pas « rallumer les forces » en croyant simplifier.** C'est parce qu'elles restent
éteintes que toute la galaxie peut être affichée.

### Réassigner `graphData` à chaque image → le graphe ne s'affiche jamais

**Symptôme** : le rejeu ne se voyait pas se construire. Rien dans la console.

**Cause** : le graphe rendu se recalculait sur l'horloge (`elapsed`), qui avance à chaque frame.
60 réassignations de `graphData` par seconde, donc 60 `stop().alpha(1)` : le graphe passait sa
vie à se réinitialiser. **C'est le défaut même que l'ADR corrige, réintroduit par la porte de
derrière.**

**Solution** : un **compte discret** de nœuds nés (`bornCount`) sert de clé de mémoïsation ; le
graphe garde la même identité entre deux naissances. Test-verrou dans
`GalaxyReplayModal.test.tsx` : le temps est piloté à la main (rAF stubé, `performance.now`
mocké) et on compte les tableaux de nœuds **distincts** reçus par le canvas sur 25 images.

### `zoomToFit` à chaque naissance → la galaxie naît en gros plan puis recule

**Symptôme** : sur l'Accueil, la galaxie se construisait « en grand » puis dézoomait par à-coups.

**Cause** : `onEngineStop` se déclenche à **chaque changement de données**, donc à chaque
naissance. Au début il n'y a que trois étoiles : cadrées serré, puis la caméra recule.

**Solution** : sur un graphe **épinglé**, l'étendue finale est connue d'avance — la caméra est
posée **une seule fois**. Les trois recadrages (`onEngineStop`, redimensionnement) sont
neutralisés quand `pinned` est fourni. Hors graphe épinglé, comportement inchangé.

### `hasWebGL()` est faux sous jsdom → un test qui passe sans rien exercer

**Symptôme** : un test de la modale de rejeu passait, mais n'enregistrait **aucun** rendu du
canvas.

**Cause** : sans contexte WebGL, la modale rend son repli « il faut un écran qui sait dessiner en
3D » et ne monte jamais `GalaxyCanvas`.

**Solution** : mocker `hasWebGL` **en gardant le reste du module réel**
(`vi.mock("@zetis/ui/galaxy", async (actual) => ({ ...(await actual()), hasWebGL: () => true }))`)
dès qu'un test doit monter le canvas.

### Le repli du plafond de nœuds existait — contrairement à ce que supposait l'ADR

L'addendum le disait « probablement jamais écrit ». **Il était atteint et rendu** : `GalaxyPage`
ne rendait plus que les chapitres au-delà du seuil (bannière « Beaucoup d'étoiles ici »), et la
modale de rejeu retirait **toutes les étoiles** — un rejeu de galaxie sans étoile. Les deux sont
partis avec le plafond. **Leçon : vérifier la présomption d'un ADR avant de s'y fier.**

## Chantier `/galaxy` — système solaire et bandeau — 2026-07-31

### `graphData()` n'est pas exposée par cette version de `react-force-graph-3d`

Pour imposer des positions (vue en orbite), le réflexe est de lire les nœuds vivants par
`graph.graphData()` et d'y écrire `fx/fy/fz`. **`TypeError: graph.graphData is not a function`.**
Les positions voyagent donc **dans les données** passées à `graphData={...}` — chaque nœud porte
son `fx/fy/fz`, et la lib les respecte. Vérifier ce qu'expose réellement le ref avant de bâtir
dessus : `scene()`, `cameraPosition()`, `d3Force()` et `zoomToFit()` existent, `graphData()` non.

### Une tuile de relief qui ne suit pas la taille du globe fige la rotation

Les planètes CSS ont une tuile de **160 px pour un globe de 80** : il faut que du relief entre et
sorte du champ. Réduites à 44 px dans le bandeau **sans toucher la tuile**, une seule tache
remplissait la sphère et sa dérive se lisait comme une **variation de luminosité**, pas comme une
rotation. Tuile, taches et pas du keyframe sont maintenant mis à l'échelle ensemble via
`--tile` — le déplacement DOIT valoir exactement la largeur de la tuile, sinon la boucle saute.

C'est la **deuxième** fois que cet invariant casse. Le test qui le garde a été réécrit pour
couvrir les deux tailles.

### Un halo en `absolute` sans ancêtre `relative` part ailleurs

La couronne solaire des planètes flottait **à côté** des sphères : le bouton n'était pas
`relative`, donc le halo se calait sur un ancêtre lointain. Centrage à la main ensuite (padding +
demi-globe − demi-halo) — un `top-1/2 -translate-y-1/2` aurait visé le centre du **bouton**,
libellé compris, pas celui du globe.

### Deux sélecteurs de test devenus faux en silence

Ajouter une couche animée (le halo) a cassé quatre tests d'un coup : le helper sélectionnait
`span[class*="animate-"]`, ce qui attrapait désormais le halo comme s'il était une texture de
planète. Et un `b.querySelector("span")` visait « la sphère » — devenue le **second** span depuis
que le halo la précède.

**Leçon** : un sélecteur de test doit désigner ce qu'il veut dire (`--tile` pour une texture,
`overflow-hidden` pour le globe), jamais « le premier élément qui ressemble ».

## Chantier `Accueil vivant` — passage au calendrier — 2026-07-31

### jsdom garde `grid-column`, le navigateur le normalise en `grid-area`

Le test de « Mon ciel » sélectionnait les cases par `span[style*="grid-column"]`. **Vert en test,
0 case trouvée en vrai** : React écrit bien `gridColumn`/`gridRow`, jsdom les conserve tels quels,
mais le navigateur les fusionne en `grid-area: 2 / 1`.

Le test n'était pas faussement vert (il aurait échoué sur le compte), mais il mesurait **une chose
en test et une autre en production** — ce qui revient à ne rien garantir. Corrigé par un ancrage
explicite `data-day` sur chaque case : identique dans les deux environnements, et il dit ce que
le test veut dire (« un élément par jour qui a eu lieu »).

**Règle générale** : ne jamais sélectionner sur une propriété CSS que le navigateur peut
raccourcir (`grid-area`, `background`, `margin`, `font`…). jsdom ne normalise presque rien.

### Trois défauts que seul le rendu réel pouvait montrer

Aucun n'était détectable en test — ils tiennent tous à des tailles en pixels :

- **Libellés de mois superposés** : « juin » et « juil. » à une colonne d'écart (11 px)
  s'écrivaient l'un sur l'autre. `buildSparseCalendar` saute désormais un libellé à moins de
  3 colonnes du précédent — mieux vaut un repère de moins qu'un repère illisible.
- **Grille perdue dans sa carte** : 5 semaines × 11 px = 70 px dans une carte de 480. La taille
  des cases suit maintenant le nombre de semaines (22 / 16 / 11 px).
- **Initiales de jours désalignées** : la colonne « L M M J V S D » ne compensait pas la ligne
  des libellés de mois, qui ne surmonte que la grille. `marginTop` explicite.

Leçon : un composant dont la mise en page dépend de dimensions fixes ne se valide pas en jsdom.
Le voir avec **les vraies données** (6 jours, pas 34) est ce qui a révélé les trois.

## Chantier `Accueil vivant` (2ᵉ addendum ADR-0024) — 2026-07-31

### Un mapping de libellés incomplet, invisible tant que rien ne l'affiche

`lib/gamification.ts` traduisait **3 `reason` sur 8**. Aucun symptôme pendant des mois : `recent`
était servi par `/api/gamification/summary` mais **rendu nulle part**. Dès qu'on l'affiche
(« Tes derniers gains »), Massimo lit `mission_champion` en brut.

Les huit valeurs réellement écrites par `award_xp` : `mission_remediation`, `mission_champion`,
`eli5_reverse`, `diagnostic`, `review`, `review_consolidation`, `quiz_completed`,
`mindmap_reconstruction`. Un repli neutre a été ajouté — un identifiant technique ne doit jamais
atteindre l'écran de l'enfant, même si une neuvième valeur apparaît demain.

**Leçon générale** : un champ servi mais jamais rendu ne prouve rien sur sa présentabilité. Avant
d'afficher une donnée qui dormait dans un contrat, vérifier ce qu'elle contient *réellement* en
base, pas ce que le type promet.

### Regrouper par jour en UTC, le défaut qu'on venait déjà de corriger une fois

`xp_history` bucketise en **Europe/Paris** via `activity.timeutils.local_day`, pas en UTC. C'est
précisément le défaut relevé sur le **streak retiré** (`gamification/service.py`, docstring) : un
travail à 23h30 heure française tombait la veille.

Le module `activity` est importé pour cette seule fonction — pure, sans DB, sans domaine. Ce
n'est pas une entorse à la doctrine de séparation : ce qui est interdit, c'est de faire remonter
son **tracking** chez Massimo, pas de réutiliser son utilitaire de fuseau.

### Un test qui visait un texte trop générique

`AccueilMassimoPage.test.tsx` vérifiait la galaxie à zéro par `getByText("0")`. Dès que les
pastilles de matières ont porté leur propre compte, plusieurs « 0 » ont coexisté légitimement à
l'écran et le test est tombé sur « Found multiple elements ».

Réécrit sur l'`aria-label` de la carte (`Ma galaxie : 0 étoiles allumées`) : **plus précis**, pas
plus permissif. Un test qui échoue parce que l'écran s'est enrichi n'est pas forcément un test à
assouplir — souvent c'est une assertion qui n'avait jamais désigné ce qu'elle croyait désigner.

## Chantier `Accueil & Galaxie` — slice B (addendum ADR-0024) — 2026-07-31

### Le test de budget qui n'aurait PAS attrapé la régression qu'il vise

Réflexe naturel : vérifier qu'aucun import statique de l'Accueil n'atteint Three.js. Ce test
serait passé **avant comme après** le chantier — et n'aurait donc rien protégé.

Le canvas était **déjà** code-splitté le 2026-07-28 :
`lazy(() => import("@zetis/ui/galaxy/canvas"))`. Le coût ne venait pas d'un import synchrone mais
d'un **MONTAGE** : l'Accueil montait `HomeGalaxyPreview`, qui déclenchait le chargement du chunk
à l'atterrissage. Massimo téléchargeait 1,37 Mo malgré le `lazy()`.

`accueil.bundle.test.ts` interdit donc les **deux formes** — `import ... from` **et** `import()` —
sur tout fichier atteignable depuis la page. Il porte en plus deux garde-fous, parce qu'un test
de budget qui passe pour de mauvaises raisons est pire que pas de test : un minimum de fichiers
analysés (une résolution cassée rendrait le graphe vide, donc vert), et une **contre-épreuve** qui
vérifie que le détecteur voit bien le déclenchement légitime de `GalaxyPage`.

Vérifié en réintroduisant la régression : le test échoue. Puis retirée.

### Deux choses que la spec demandait et que le backend ne sert pas

- **« La capsule recommandée, avec sa matière et sa durée »** : `/api/capsules/library` ne porte
  **aucune durée**, et « recommandée » n'existe nulle part. La calculer côté client serait une
  règle métier dans la page, que la slice interdit explicitement. Le raccourci affiche donc
  `new_count` (`/api/capsules/stats`) et n'est pas rendu si `total === 0`.
- **Le compte global d'étoiles** de la carte Galaxie : `GET /api/student/galaxy` sert `lit` et
  `total` **par matière**. Le total est une **somme de présentation** — la seule addition tolérée
  dans une page qui refuse tout calcul métier.

### Le bandeau Agenda : une régression fonctionnelle à un cheveu

La spec réécrite et la maquette v2 composent l'Accueil en cinq blocs, **sans** `HomeAgendaBanner`.
Le suivre à la lettre aurait rendu `/agenda` **inatteignable** : en phase 0 l'agenda n'a pas
d'entrée de sidebar, et ce bandeau est son seul accès (ADR-0025).

C'est exactement la dette que l'addendum reprochait à la version précédente de cette même spec —
elle était en retard sur le code, à trois jours d'intervalle et sur le même fichier. Le bandeau
est conservé, la spec et la maquette corrigées.

### La « brique à déplacer » du §C était deux implémentations concurrentes

L'addendum décrit un « graphe global deux colonnes + badges + frise » à déplacer tel quel.
`HomeGalaxyPreview.tsx` (~420 lignes) était en réalité une **expérience Galaxy complète** :
canvas, recherche, `SubjectKpiRow`, frise, légende, panneau d'actions **et son propre plein écran
à deux niveaux** — soit un doublon de ce que `GalaxyPage` fait déjà.

Le « déplacement » est donc une **fusion** : `GalaxyPage` a absorbé la galaxie complète comme vue
par défaut (via `useGalaxy`, qui tire maintenant `fetchFullGraph` et `fetchGalaxyTimeline`), les
composants ont été réutilisés tels quels, et `HomeGalaxyPreview` a été **supprimé** — c'est son
orchestration en double qui disparaît, pas son contenu.

## Chantier `Accueil & Galaxie` — slice A (addendum ADR-0024) — 2026-07-31

### Une route qui n'existe pas et qui ne renvoie même pas le bon 404

La spec de page annonçait `GET /api/student/galaxy/overview`. Le vrai chemin est
`GET /api/student/galaxy` — **chemin vide** (`galaxy/router.py:29`), la fonction cliente
s'appelant `fetchGalaxyOverview`, d'où la confusion.

Le piège n'est pas le 404, c'est **lequel** : `/overview` serait absorbé par
`@student_router.get("/{subject_slug}")`, déclarée en dernier. On aurait donc obtenu
« matière inconnue » — un message qui envoie chercher un bug de données là où c'est le **chemin**
qui est faux. L'ordre de déclaration des routes de ce module est *load-bearing* et commenté comme
tel : toute route littérale doit passer **avant** `/{subject_slug}`.

Second écart du même contrat : il ne porte **aucun compte global** d'étoiles, seulement `lit` et
`total` **par matière**. Tout affichage « toutes matières confondues » est une somme client.

### Une redirection compte comme une page vue, et fabrique un doublon dans le cahier de bord

`usePageviewTelemetry` envoie le `pathname` à chaque changement de route, et ne dédupe que les
routes **consécutives identiques** (le serveur fait pareil, sur la route brute). Une redirection
`<Navigate to="/galaxy" replace />` posée sur `/progression` traverse donc **deux** routes
différentes pour **une** visite : Papa aurait vu la même page deux fois de suite dans son cahier
de bord, sans rien pour l'expliquer.

Correctif : `REDIRECT_ONLY_ROUTES` dans le hook — une route qui ne rend aucune page n'est pas une
page vue. À alimenter si une autre redirection est ajoutée un jour.

### Le mapping route → libellé côté Papa n'existait pas — il n'y avait rien à « étendre »

L'addendum §D demandait de faire accepter **deux** valeurs à un mapping supposé existant. Il
n'existait **nulle part** : le serveur sert la route **brute** comme `detail`
(`activity/service.py:_detail_for`) et `ActivityEntryRow` la rendait **verbatim** — Papa lisait
« Navigation · /eli5 ».

Conséquence à ne pas sous-estimer : `learning_events` est **append-only** et rien ne réécrit
l'historique. Sans traduction, les visites d'avant le renommage (`/progression`, du 2026-07-28 au
2026-07-31) et celles d'après (`/galaxy`) resteraient **deux pages distinctes pour toujours**.
Créé en `apps/frontend-papa/src/lib/routeLabels.ts` — donc **sans backend**, comme annoncé, mais
c'est du travail **neuf**, pas une extension.

## Chantier `Dashboard Papa v2` (ADR-0028) — 2026-07-31

### Un test peut verrouiller une contradiction

Le pire piège du chantier. `test_step_order_depends_on_mission_type` assertait
`rev == ["mindmap","quiz","eli5"]` avec le commentaire « pas de verbalisation ». Or le verdict
(`_complete_mission`) exige `reverse_score is not None`, que **seule** l'étape `vocal_explain`
produit — `STEP_ELI5` est une étape de *consultation* (`_CONSULT_STEPS`) qui n'émet qu'un
`mission_step_view`. Une mission `revision` ne pouvait donc **jamais** conclure `acquired`.

Le test passait au vert en décrivant fidèlement un comportement faux. **Un test qui fige un
template doit être confronté à ce qui LIT ce template.** Corrigé par l'amendement `adr-0017 §5bis`.

### Absence de mesure ≠ zéro

Corollaire du précédent : `_apply_verdict` faisait `measured = float(reverse_score) if ... else 0.0`
puis écrasait `mastery_score` avec ce 0. Un parcours sans étape vocale (éditeur de steps de Papa,
notion d'une champion croisée) faisait donc **s'effondrer la maîtrise** de l'élève au moment précis
où il venait de travailler, et replanifiait la carte SRS à 1 jour (intervalle du score 0).
Distinguer « pas mesuré » de « mesuré à 0 » est la règle.

### Deux définitions de « lacune traitée » qui divergeaient en silence

`dashboard._gaps_without_mission` ne comptait que les missions `mission_type == "remediation"`,
alors que la page Lacunes regardait **tous** les types. Une notion couverte par une mission `manual`
(commandée par Papa lui-même) était annoncée « sans mission active » sur le dashboard et « prise en
charge » sur `/lacunes`. Source unique désormais :
`progress.service.skills_with_active_mission`.

⚠️ À ne pas confondre avec l'écart **voulu** entre `OPEN_GAP_STATUSES` (`open` + `in_progress`, ce
que comptent tous les affichages) et le filtre `status == "open"` du générateur de remédiation :
celui-là est doctrinal (`adr-0017 §5bis` — une lacune `in_progress` revient par la **révision**).
`preview_remediation` et `generate_remediation` **doivent** filtrer à l'identique, sinon la carte
du dashboard propose une notion que le bouton ne créera pas. Test-verrou en place.

### Deux conventions de statut de validation coexistent en base

`lessons` utilise **`status`** (`draft|validated|archived`) ; `fiches`, `mindmaps`, `capsules`,
`chapters` utilisent **`validation_status`** (`pending|validated|rejected`). Interroger la mauvaise
colonne rend un ensemble vide **sans lever d'erreur**. Et `quizzes` n'a **ni l'une ni l'autre** —
servis sans gate par doctrine (`adr-0014 §2`), donc impossibles à mettre dans une file « à valider ».

### Un composant qui semble exclusif à une page ne l'est pas (piège rencontré deux fois)

`KpiBreakdown` / `lib/kpiBreakdown` paraissaient propres au dashboard : ils sont consommés par
`CahierBordPage`. `GAPS` de `data/mock.ts` paraissait propre à `/lacunes` : `ModeFocusPage` le
lisait aussi. **Toujours grep le symbole dans tout `src/` avant de supprimer**, pas seulement dans
la page qu'on refait.

### Une fenêtre de chargement peut tronquer un signal global

Le dashboard déduisait `days_inactive` de la liste d'événements bornée aux **26 semaines** du
calendrier. Un dernier événement plus ancien rendait la liste vide, donc un décrochage à **0** —
soit « tout va bien » au moment précis où il faut alerter. Délégué à
`activity.trailing_inactive_days`, qui interroge le dernier événement sans borne.

### Ce que seul le rendu réel révèle

Deux chiffres du même écran se contredisaient, et **aucun test ne pouvait le voir** : le donut
totalisait 42 min à côté d'un KPI annonçant 7 h 05 (le temps sans `subject_id` — connexion,
navigation, chat — n'était compté nulle part : 90 % du total en dev), et le KPI des lacunes portait
le même libellé que le segment « fragiles » des cartes voisines. **Assembler la page et la lire**
reste une étape de vérification à part entière.

### Le mode focus ne faisait rien

`ModeFocusPage` promettait « ZETIS priorisera les missions, capsules et révisions » ; son bouton
n'écrivait qu'un `useState` local. **Aucun état « focus » n'existe côté backend** (zéro occurrence).
Le seul levier de priorité réel est `Mission.force_priority` (plancher de score du sélecteur,
ADR-0018). ⚠️ La route Commander qui le pose **n'a pas de garde d'idempotence**, contrairement aux
générateurs : un second clic crée un doublon.

### Divers

- **Collision d'identifiant Alembic** : `d4e5f6a7b8c9` existait déjà. Toujours vérifier l'unicité
  avant d'écrire une révision — la collision se manifeste par un `CycleDetected` illisible sur tout
  le graphe, pas par un message clair.
- Le test `ProgrammePage` (barre de progression temporisée) reste **flaky sous charge parallèle** :
  il passe seul, échoue parfois dans la suite complète. Déjà connu, non causé par ce chantier.

## Chantier `content_requests` (addendum ADR-0027) — 3 constats au test live (2026-07-30)

Test live « le verbe être en espagnol » (notion sans cours) : ZETIS **a généré une leçon ser/estar
dans sa réponse**. Diagnostic (`ai_jobs`) → **3 causes distinctes**, dont 2 corrigées :

- **[CORRIGÉ n°2] `galaxy.notion_panel` mentait sur le cours** : `cours available = lesson_id is not
  None` — il confondait « leçon validée » et « cours rédigé ». Une leçon validée **sans
  `content_markdown`** (ex. skill 121 « Registre de langue », leçon 42) était annoncée `cours: True`.
  Conséquence directe : le chat proposait une **porte vide** ET n'enregistrait **aucune** demande
  (l'émission fait confiance à `available`). → `available = content_markdown IS NOT NULL`
  (`galaxy/service.py`, patron `coverage.py`). ELI5 reste **toujours** `available` (génératif à la
  volée, décision ADR-0024). Test : `test_cours_indisponible_si_lecon_validee_sans_contenu_redige`.
- **[CORRIGÉ n°2bis] Le signal « notion vide → cours » ne valait que dans le menu** : quand le LLM
  propose `tool=eli5` (chemin `_open_notion`, ELI5 dispo), on routait sans jamais réclamer le cours.
  → `content_request(cours)` posé sur **tous** les chemins dès qu'aucun contenu **durable**
  (`DURABLE_NOTION_TOOLS` = cours/fiche/mindmap/revision) n'existe — ELI5 ne compte pas.
- **[CORRIGÉ n°3] Le chat GÉNÉRAIT du contenu dans `reply`** : l'orchestrateur ancre l'ACTION mais le
  `reply` restait du texte LLM brut → qwen3 écrivait la leçon. → Garde-fou « jamais générer » (ADR-0027
  §3) **porté dans le prompt** : `CHAT_SYSTEM`/`CHAT_TURN_PROMPT` durcis (« tu n'écris jamais le cours/
  les définitions/la conjugaison ; tu orientes vers ELI5 ou une ressource validée »), `CHAT_PROMPT_
  VERSION → chat_v2`. **Mitigation, pas garantie dure** (petit moteur local) ; prouvé live : la
  réponse est passée d'une leçon ser/estar complète à « je t'oriente vers une ressource validée ».
- **[CORRIGÉ n°1] `resolve_skill` matchait une notion SANS RAPPORT** : « verbe être en espagnol » →
  skill 121 « Registre de langue ». Seuil relevé **0.55 → 0.72** (`config.chat_skill_resolution_min_score`).
  `nomic` donne ~0.68 à des requêtes sans rapport (langue/domaine communs), vrais matchs à 0.83+ ; la
  MARGE top-1/top-2 ne sépare pas (cluster de notions proches), seul le score absolu le fait. Prouvé
  live : « verbe être en espagnol » et « les nombres complexes » → `None` (hors-programme).

### Volet hors-programme (addendum ADR-0027) — le piège « Ajouter ne créait rien »

- **`notion_requests` « ✓ Ajoutée » ne faisait QUE `status='added'`** — zéro création (ni Skill, ni
  leçon, ni cours ; le `text` n'allait nulle part). Papa devait tout refaire à la main (skills-backfill
  puis chaîne ADR-0009), sans lien. → **2 ponts réels** ajoutés (`add-to-program` = `_upsert_skills` ;
  `create-lesson` = `create_manual_lesson` + cours local optionnel). Une notion hors-programme n'ayant
  **pas de matière**, Papa la fournit (modale matière/chapitre) — sans quoi rien n'est plaçable.
- **`generate_lesson_content` repasse la leçon en `draft`** (gate ADR-0009 : un cours généré non relu
  ne se sert pas). Donc « Créer la leçon » **+ cours** → leçon `draft` à valider ; **sans** cours →
  leçon `validated` mais cours à écrire (visible Couverture). Assumé, pas d'auto-validation.
- **Test fake-embedder fragile** : `FakeEmbeddingProvider` est basé sur `hash()` ; un texte NON égal au
  nom de la Skill donne un cosinus pseudo-aléatoire. Après le passage du seuil à 0.72, les tests chat
  qui envoyaient « addition et soustraction de fractions » ont cassé → utiliser le **nom EXACT** de la
  Skill seedée (`RESOLVING = "Nombres relatifs"`, cosinus 1.0) quand le test porte sur l'orchestrateur,
  pas sur la résolution.

## Chantier `mindmap` (ADR-0016)

### Données / backend

- **Table `mindmaps` préexistante = vestige notion-centré inutilisé** (créée par le schéma initial
  `96c52d4ba103` : `subject_id`/`skill_id`/`student_id`/`title`/`mode`/`status`, aucun code ne
  l'utilisait). La Slice A la voulait leçon-centrée. → **Reshape** (drop + recreate) + table
  `mindmap_attempts`, migration `e4f5a6b7c8d9`. Reshape destructif assumé (table vide de tout usage).
- **La Slice A n'a pas livré d'endpoint `/summary`** que la Slice B (grille de decks Massimo) exige.
  → Ajout d'un `GET /api/student/mindmaps/summary` (counts only). Décidé avec le user malgré le
  périmètre « frontend uniquement » du prompt.
- **`resolve_canonical_context` prend un `skill_id`, pas un `lesson_id`** (piège commun aux dérivés
  leçon-centrés). On force le cours = LA leçon validée et on n'utilise le résolveur que pour son
  complément RAG (même patron que fiches/quiz). Rien de neuf ici mais à re-vérifier pour tout dérivé.

### React Flow (`@xyflow/react` 12.11.1) — plusieurs pièges non évidents

- **`pathOptions.borderRadius: 18` sur une arête `smoothstep` → CRASH silencieux de toute la couche
  d'arêtes** : chemin invalide pour les segments courts, 0 arête rendue, **aucune erreur console
  claire** (juste « An error occurred in component »). `rfEdges` contenait bien les 8 arêtes. →
  Ramené à `borderRadius: 10`. Diagnostiqué en testant `type: "straight"` (qui, lui, rendait).
- **Un `onClick` posé sur le `<div>` d'un nœud NON draggable ne se déclenche JAMAIS** : React Flow met
  `pointer-events: none` sur ces nœuds (pour laisser passer le pan). → Router les clics par le
  `onNodeClick` de `<ReactFlow>` (qui réactive aussi les pointer-events). Symptôme : cliquer un
  `· · ·` en mode Mémorise ne révélait rien.
- **Adresser des handles multiples par `sourceHandle`/`targetHandle` (id) ne résout pas les arêtes**
  (8 handles enregistrés, `rfEdges` peuplé, mais 0 arête rendue, sans erreur). → Revenir à **UN
  handle source + UN cible** par nœud, avec `position` calculée par côté (`sideTo`) selon la
  géométrie → routage orthogonal propre dans toutes les présentations.
- **Recréer les objets nœuds à chaque render (système à deux effets `setRfNodes` qui « préserve la
  data ») strippe les mesures internes RF (`measured`)** → re-mesure perpétuelle → **arêtes jamais
  rendues** (nœuds pourtant présents et mesurés dans le DOM). → **Un seul effet** `setRfNodes(derivedNodes)` ;
  les positions viennent de `livePos` (donc recréer les nœuds ne perd pas l'agencement).
- **Boucle infinie « Maximum update depth exceeded » → écran noir** : `const currentChunk =
  buildPasses[buildPass] ?? []` recrée un **tableau vide neuf à chaque render** quand `buildPasses`
  est vide (ex. en mode Regarde), ce qui fait recalculer `currentSlotSet` → `derivedNodes` →
  `setRfNodes` en boucle. → **`useMemo` sur `currentChunk`** (référence stable).

### Extraction de la brique `@zetis/ui/mindmap` (addendum, 2026-07-27)

- **Le prompt parlait de `MindmapCanvas` — le composant réel s'appelle `MindmapWorkspace`**, et il
  a **deux** points de montage, pas un : `MindmapSubjectPage` **et** `MindmapMissionModal` (step
  mindmap ADR-0019). La non-régression porte sur les deux ; ne conclure qu'après avoir ouvert
  l'étape mindmap d'une mission sur `/missions`.
- **Export en SOUS-CHEMIN obligatoire** (`@zetis/ui/mindmap`, pas la racine `@zetis/ui`) : la brique
  embarque React Flow + elkjs (~1,6 Mo). Ré-exportée depuis `src/index.ts`, elle entrerait dans le
  bundle de **toutes** les pages Papa et le `lazy()` de la modale ne servirait plus à rien.
  Contrôle : après `vite build` de Papa, React Flow doit être dans un **chunk séparé**.
- **Les keyframes CSS ne suivent pas automatiquement le composant.** `mm-gold-pop`, `mm-dot-active`
  et `mm-cheer` vivaient dans `apps/frontend-massimo/src/index.css` ; Papa ne les avait pas → le
  nœud doré et le toast de félicitation auraient été muets côté aperçu, **sans erreur**. Résolu par
  un `mindmap.css` co-localisé, importé par la brique elle-même. Le `@source
  "../../../packages/ui/src"` des deux `index.css` couvre déjà les **classes** Tailwind ; il ne
  couvre pas les `@keyframes`.
- **Simuler un drag dans la brique : `left_click_drag` ne suffit pas.** Il émet des `MouseEvent`,
  or la banque écoute `onPointerDown` → aucun dépôt, et React Flow pan à la place. Il faut
  dispatcher de vrais `PointerEvent` (`pointerdown` sur la puce, puis `pointermove`+`pointerup` sur
  `window`), en **deux evals** avec ~250 ms entre chaque dépôt (React doit re-render entre deux).

### Backend `:8001` sans `--reload` (config `backend-dev`)

- La configuration `backend-dev` de `.claude/launch.json` lance `uvicorn` **sans `--reload`** : un
  backend démarré avant une modification sert l'**ancien code** en silence. Symptôme vécu : les
  champs `attempt_count`/`avg_score` fraîchement ajoutés absents de la réponse `pilotage`, sans
  aucune erreur. → **Redémarrer le serveur après toute modification backend** (`preview_stop` puis
  `preview_start`). Complète le piège du `:8000` stale ci-dessous.

### Harnais de vérification (preview)

- **Le harnais isolé (`mmpreview.html/tsx`) est instable pour les simulations de drag intensives** :
  états de pointeur résiduels après ~30 dispatches, clic juste après un reload qui ne s'enregistre
  pas, et surtout **le tab bascule en `chrome-error://` sur TOUTE erreur d'eval** (même attrapée).
  → Toujours garder les evals (try/catch + null-checks), faire chaque drag en 2 evals
  (pointerdown puis pointermove+pointerup), et redémarrer le serveur si l'état est pollué. Un
  `fetch` mocké dans le harnais permet de tester `/evaluate` + `/attempts` sans backend.

### Divers

- **Fichier mockup supprimé par accident du working tree** (`docs/frontend-massimo/mockup/
  mockup-page-mindmaps.html`) alors qu'on ne devait qu'en corriger le titre. → Restauré via
  `git checkout HEAD -- <fichier>` puis re-application du correctif de titre (« Mes mindmaps »).
  Vérifier `git status` avant tout commit pour ne pas embarquer une suppression involontaire.

## Chantier `mission` (ADR-0017/0018/0019)

### Backend / dev

- **Le backend `:8000` reste STALE toute la session** : démarré avant les Lots missions, il rend en
  **404** toutes les routes récentes (`/pilot/*`, `/command/*`, `/{id}/regenerate`…) alors qu'elles
  sont commitées et enregistrées dans `main.py`. → Un **backend-dev sur `:8001`** (hot-reload actif,
  `--reload`) sert de source de vérité. **Toujours vérifier quel backend répond avant de conclure à un
  bug de routing.** (Le front dev `papa-dev :5175` / `massimo-dev :5176` pointe déjà sur `:8001`.)
- **`ADR-0017` supposait `Skill` cherchable par embeddings** (pour la porte « thématique texte libre »
  de Commander). FAUX : **seul `RagChunk` porte une colonne `embedding` (pgvector) ; `Skill` n'en a
  pas.** → texte-libre reporté (ADR-0018), v1 = sélection référentiel. Annoté dans ADR-0017 §1 (iii).
- **`ADR-0017` déclarait « zéro migration de ciblage »** — faux aussi : `mission_steps.resource_id` et
  `missions.started_at` n'existaient pas (Lot 1, migration `f3a4b5c6d7e8`), et Commander a exigé
  `missions.force_priority` + `missions.due_date` (migration `a7b8c9d0e1f2`). Lire le modèle réel avant
  de se fier à la prémisse « zéro migration » d'un ADR.
- **Cycle d'import** : `pilot.py` fait `from ... import service as msvc`. Donc **`service.py` ne doit PAS
  importer `pilot`** (les fonctions cycle-de-vie renvoient l'objet `Mission`, et c'est le **router** qui
  sérialise via `pilot._to_pilot_out`). Sinon `ImportError` circulaire au démarrage.
- **Le sélecteur plancher-isait TOUTE mission `manual` par son TYPE** (`forced_priority = 1.0 if
  mission_type == "manual"`). Incompatible avec « l'urgence passe par `force_priority` » (ADR-0018). →
  lire le **flag** `mission.force_priority` ⇒ **changement de facteur ⇒ bump `MISSION_SCORING_VERSION`**
  (v1→v2, puis v2→v3 pour le step mindmap). Toute assertion de test sur `scoring_version` à mettre à jour.
- **`MindmapAttempt` n'a ni `context` ni `completed_at`** (contrairement à `QuizAttempt`) : une tentative
  n'existe qu'une fois **scorée serveur** → l'existence vaut complétion. La preuve d'un step mindmap se
  gate donc sur `created_at > started_at` + `score > 0`, sans filtre `context="mission"`.

### Frontend Papa / preview

- **`useState` placé au milieu d'un hook (après des `useCallback`)** → React « change in order of Hooks »
  **au HOT-RELOAD** (Fast Refresh préserve l'état de l'instance montée dont l'ordre diffère) + **white
  screen**. Pas visible au reload complet, donc trompeur. → **Grouper tous les `useState` en tête** du
  hook. (Vu sur `busyMission` dans `useMissionsPilotage`.)
- **`ContentLifecycleActions` (@zetis/ui) n'est pas réutilisable pour les missions** : sa copie de
  ConfirmDialog est figée pour le contenu LLM (« le contenu repassera à valider », « depuis la leçon »),
  fausse pour une mission (regenerate déterministe, pas de reset de validation). → rangée d'actions
  dédiée + `ConfirmDialog` brut.
- **Le runner de mission Massimo n'a AUCUN deep-link de step** (eli5/quiz compris) : l'enfant navigue
  manuellement puis « Valide » (preuve serveur). Le step mindmap ajoute le **premier** CTA de deep-link
  (« Reconstruire → » vers `/mindmaps/reconstruire/:id`). `fetchMindmap(id)` renvoyant déjà `subject_slug`,
  aucune route/schéma supplémentaire n'a été nécessaire pour résoudre le slug côté client.

## Chantier `mission` — frontend Massimo (page decks + modales in-page)

- **⚠️ `backdrop-filter`/`transform` sur un panneau de modale casse les enfants `position: fixed`.**
  Le `MindmapWorkspace` rend son fantôme de drag en `position: fixed; left/top = clientX/clientY`
  (viewport). Dans `ActivityModal`, `backdrop-blur-xl` (et l'ancienne animation `translate/scale`)
  sur le PANNEAU créent un **bloc conteneur** pour les descendants fixed → le fantôme se positionne
  par rapport au panneau centré, pas au viewport (« nœud loin de la souris, hors plan »). Idem pour
  le toast XP d'ELI5. → **Aucun `backdrop-filter`/`transform` sur le panneau** (fond `zetis-surface`
  opaque, le flou n'y servait à rien) ; entrée en **opacité seule**. Le backdrop de l'*overlay*
  (`inset-0`, à 0,0) est inoffensif. Piège de coord classique React Flow / drag custom.
- **Bascule deep-link → modales in-page** (remplace l'entrée « le runner n'a aucun deep-link » plus
  haut) : les 3 activités (ELI5 / quiz / mindmap) s'ouvrent EN MODALE sur `/missions` ; l'étape se
  valide dans la modale (`completeStep`), fin du marqueur `sessionStorage` + de la redirection. Une
  seule modale ELI5 couvre `eli5` + `vocal_explain` (complète `eli5` à `status="explained"`, `vocal`
  à `feedback`+reverse, stop au 1er 409). UI d'activité **extraites** (`Eli5Session`/`QuizRunner`) →
  `Eli5Page.test.tsx` garde le DOM identique (mouvement pur, à relancer après extraction).
- **Étape mindmap absente alors qu'une carte existe** : `_resolve_mission_mindmap_id` résout la carte
  à la **création** de la mission ; une carte validée *après* coup n'est pas rétro-ajoutée. → **régénérer
  le parcours** (`POST /missions/{id}/regenerate`, planned seulement — une mission `active` refuse,
  409). Pas besoin de générer si la carte existe déjà.

## Chantier `couverture` (ADR-0023) — pièges rencontrés

### Le serveur dev sert un code antérieur, sans le dire

**Symptôme** : une route existe dans le fichier, l'appel renvoie `404`. Ou pire — un champ
ajouté au modèle de lecture arrive vide, et l'UI qui en dépend paraît inerte.

**Cause** : `.claude/launch.json` lançait `backend-dev`/`backend-dev2` **sans `--reload`**.
Le processus gardait le code de son démarrage.

**Diagnostic en une commande** — comparer le code au processus :

```bash
curl -s localhost:8002/openapi.json | python3 -c "import sys,json;print([p for p in json.load(sys.stdin)['paths'] if 'ma-route' in p])"
```

Corrigé : `--reload` ajouté aux deux configs. **Réflexe à garder** : vérifier ses ajouts backend
contre le serveur que l'humain utilise, pas seulement par les tests et des appels directs à la base.

### `fiches` / `mindmaps` : horodatages nullable sans défaut serveur

**Symptôme** : une fiche générée n'apparaît jamais dans la matrice (cellule `+` permanente), et
chaque clic en crée une de plus. Cinq doublons avant qu'on comprenne.

**Cause** : ces deux tables ont été créées avec `created_at`/`updated_at` **nullable et sans
`DEFAULT now()`**, contrairement à `quizzes`/`capsules`. Le `TimestampMixin` déclare pourtant le
défaut : la migration de création ne l'a jamais suivi. Toute ligne insérée sans horodatage
explicite naissait à `NULL`.

**Vérifier** :

```sql
select table_name, column_name, column_default, is_nullable from information_schema.columns
where column_name in ('created_at','updated_at') and table_name in ('fiches','mindmaps','quizzes','capsules');
```

Corrigé par `e6f7a8b9c0d1`. **Leçon de conception** : ne jamais déduire l'absence d'un objet
d'une date manquante. `absent` se déduit de l'existence de la ligne ; une date nulle rend
seulement le *périmé* indécidable, ce qui est un défaut acceptable, pas un mensonge.

### Une capsule créée sans `skill_id` ne compte nulle part

La Couverture compte les capsules **par notion** (`Capsule.skill_id`). Le compositeur de la page
Capsules IA n'envoyait pas ce champ : les capsules créées là n'étaient rattachées à aucune notion
et restaient invisibles dans les fractions, quel que soit le travail fourni.

### Les tests de page cassent quand on ajoute `useSearchParams`

`ProgrammePage.test.tsx` rendait `<ProgrammePage />` nu ; le hook exige un Router (26 tests
tombés d'un coup). Passer par un helper `renderPage(route)` qui enveloppe dans `<MemoryRouter>` —
c'est d'ailleurs plus fidèle à l'app réelle.

Autre piège du même ordre : **jsdom n'implémente pas `scrollIntoView`**. L'appeler dans un
`useEffect` jette et démonte l'arbre. Toujours `ref.current?.scrollIntoView?.({...})` — sur la
méthode aussi, pas seulement sur la ref.

## Chantier `couverture` — passe visuelle + rangement des assets (2026-07-28, session 2)

### `?subject_id=` filtre aussi la LISTE des matières renvoyée

`GET /api/production/coverage?subject_id=N` restreint `subject_query` (`coverage.py:352`), donc
`coverage.subjects` ne contient plus que la matière sélectionnée. Le `<select>` d'origine se vidait
ainsi de ses options dès le premier choix : il fallait repasser par « Toutes les matières » pour en
changer. Bug **présent depuis l'origine**, invisible tant que le sélecteur était un menu déroulant,
criant dès qu'on est passé à des pastilles.

Correctif **client** (`CouverturePage`) : mémoriser la liste du chargement non filtré. Pas de
changement backend — l'endpoint fait ce qu'on lui demande.

### Une `drop-shadow` animée sur un PNG opaque est invisible

L'icône de la Couverture est livrée **sans canal alpha** (fond noir aplati jusqu'aux bords). Une
`filter: drop-shadow()` épouse la silhouette alpha : sur un rectangle plein, elle se dessine
derrière l'image et reste intégralement masquée. L'animation tournait — `getAnimations()` le
confirmait — sans qu'on en voie rien.

Deux corrections : `border-radius` pour rogner les coins noirs (sinon un carré noir sur le fond
bleu nuit), et **halo en `box-shadow`**, qui se dessine hors de la boîte en suivant le rayon.

Règle générale : `drop-shadow` pour un PNG détouré, `box-shadow` pour une image opaque.

### Vérifier une animation sans session authentifiée

Le navigateur intégré n'était pas connecté à l'espace Papa, et l'agent ne saisit pas de mot de
passe. Plutôt que de livrer sans regarder : **banc d'essai isolé** — un HTML dans le scratchpad
avec le CSS copié à l'identique et le vrai fichier image, servi par un `python3 -m http.server`,
puis capture d'écran + `getAnimations()` / `getComputedStyle()` pour prouver que la valeur change
dans le temps. Démonté après coup. Utile pour tout ce qui est purement visuel et sans données.

### Une section repliée sort de l'arbre d'accessibilité

Les expanders par matière ont cassé 2 tests d'un coup : `getByRole("link"|"button")` ne trouve plus
rien sous un conteneur `hidden`, alors que `getByText` **continue** de le trouver (RTL n'ignore que
`script`/`style`). D'où des échecs qui semblent incohérents entre deux tests voisins. Ouvrir la
section d'abord (helper `expandSubject()`).

### `findByRole` attrape le premier arrivé, pas le bon

La pastille de filtre « Mathématiques » et l'en-tête de matrice du même nom sont deux boutons. La
liste des pastilles est posée par un `useEffect`, donc **un cran après** le premier rendu de la
matrice : `findByRole` résolvait sur l'en-tête, avec un `aria-pressed` à `null`. Scoper la requête
(`within(getByRole("group", …))`) au lieu de se fier à l'unicité du libellé.

### `import.meta.glob` aspire tout le dossier

`packages/ui/src/assets/subjects/` contenait `logos_matieres_zetis_apercu.png`, une planche de
contact de 264 ko qu'aucun slug ne résout. Le glob `*.png` du résolveur l'embarquait quand même —
**dans les deux apps**, soit 528 ko de bundle mort. Déplacée dans `assets/brand/references/`.

Un dossier lu par un glob n'est pas un dossier de rangement : tout ce qu'on y pose part dans le
bundle, résolu ou non.

### Test temporisé instable

`ProgrammePage.test.tsx` › « pendant la génération : barre de progression estimée avec % » a échoué
une fois (1029 ms) puis est repassé vert **5 fois de suite**. Flaky sur la temporisation de la
barre, sans rapport avec le chantier. Non traité.
