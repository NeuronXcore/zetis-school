# TROUBLESHOOTING.md — Écarts réels rencontrés

> Journal des divergences concrètes (API inattendue, pièges d'intégration, crashs) rencontrées en
> cours de chantier, avec la cause et la solution retenue. Complète `MEMORY.md` (raisonnement) et
> les ADR (décisions). Une entrée = un piège qui ferait perdre du temps à la prochaine session.

## Chantier `feat/dashboard-periode-annee` — vue à l'année + « Où agir » (addendum ADR-0028) — 2026-08-05

### 🔴 Deux bornes qui coïncidaient par accident, dont l'une bornait l'autre en silence

Le dashboard Papa chargeait ses événements sur `CALENDAR_WEEKS = 26` semaines, et **toutes** les
fenêtres (7/30/90) n'étaient que des filtres en mémoire sur cette liste. 182 jours couvrent tout
juste 90 jours **plus** les 90 de la fenêtre précédente qui sert le delta : les deux nombres étaient
d'accord **par hasard**, et personne n'avait écrit que le calendrier bornait le chargement.

Ajouter une fenêtre de 365 jours sans toucher au chargement donnait un écran parfaitement crédible
et faux : **182 jours vus sur 365 annoncés**, et un delta calculé contre J-366 → J-730 valant **0
pour toujours** — pas « stable », jamais mesuré. **Aucun test n'échouait**, tous les jeux d'essai
tenant dans les dernières semaines.

**Parade** : `projections.HISTORY_DAYS = max(PERIODS) × 2` pour le chargement, `CALENDAR_WEEKS`
pour la seule heatmap — **deux bornes explicites et séparées**, plus une garde explicite côté
calendrier, sans laquelle il héritait de la nouvelle profondeur et rendait quatre fois plus de jours
que la carte n'en dessine.

**Le signe à guetter** : quand deux constantes ont la même valeur effective et qu'une seule est
citée dans le code, l'autre borne quelque chose sans le dire. Changer l'une casse l'autre.

### 🔴 Un verrou VERT À TORT parce qu'il assertait sur l'ensemble VIDE

Test : « aucun jour du calendrier ne déborde des 26 semaines ». Il seedait **un** événement à
J-300 et **un** à J-3, puis assertait `all(jour >= limite for jour in jours)`.

Il passait — **y compris après sabotage de la borne**. Cause : un événement **isolé** porte **0
minute** (`event_minutes` mesure l'écart au suivant *dans la même journée*), et le calendrier **omet
les jours vides**. La liste `jours` sortait donc **vide**, et `all([])` vaut `True`.

**Parade** : deux événements espacés de 10 min **par jour** pour que la journée porte des minutes,
**et** une assertion de non-vacuité (`assert jours`) avant le `all(...)`. Ce second garde-fou est le
vrai : il transforme un faux témoin en échec bruyant.

**Généralisable** : tout `all(...)` / `any(...)` sur une collection construite par le code sous test
doit être précédé d'une assertion de non-vacuité. Sinon le test ne prouve rien le jour où la
collection se vide pour une raison sans rapport.

### 🔴 Un test de non-régression qui cesse de mordre quand une constante bouge

`test_le_decrochage_regarde_AU_DELA_de_la_fenetre_du_calendrier` seedait un événement à **400 jours
en dur**, pour vérifier qu'un décrochage plus ancien que la fenêtre chargée est quand même compté.
Le jour où la fenêtre est passée à 730 jours, 400 est tombé **dedans** : le test restait vert **en
ne prouvant plus rien**.

**Parade** : dériver la valeur de la constante — `outside = p.HISTORY_DAYS + 35` — et asserter au
passage que l'événement est bien **hors** du chargement (`last_activity_at is None`), ce qui rend le
test auto-vérifiant.

**Le signe à guetter** : un littéral numérique dans un test dont l'intention est « au-delà de la
limite X ». Il devient faux dès que X bouge, sans jamais rougir.

### 🔴 Un `Record<string, string>` neutralise le filet du typage

Élargir une union (`DashboardPeriod` += `"365"`) est censé être **volontairement cassant** : chaque
`Record<DashboardPeriod, …>` devient incomplet et `tsc` les désigne un par un. Ce filet a fonctionné
partout — sauf dans `ConseilClasseIAPage`, dont la table de libellés était typée
`Record<string, string>`. Ce type accepte **n'importe quelle clé** : `?period=365` tombait dans le
repli `?? "Trimestre 1"` et le Conseil racontait un trimestre pendant que Papa regardait l'année.

**Parade** : toute table indexée par une union se type **par cette union**, et vit **une seule
fois** (ici `COUNCIL_PERIOD_LABEL` + garde `isDashboardPeriod` dans `lib/dashboardDerive.ts`, source
unique du sélecteur, du hook et du lien profond). Il y avait **trois** copies de cette connaissance.

**La formule à retenir** : *le filet n'est pas dans l'union, il est dans le `Record` typé **par**
l'union.*

### ⚠️ `closest("clipPath")` ne trouve rien sous jsdom

Filtrer les `<circle>` d'un SVG pour exclure ceux qui vivent dans un `<clipPath>` :
`c.closest("clipPath")` rend `null` pour **tous**, y compris les bons. jsdom compare les sélecteurs
en **minuscules** et ne reconnaît pas le camelCase des éléments SVG.

**Parade** : regarder le parent directement —
`(c.parentNode as Element)?.tagName?.toLowerCase() !== "clippath"`.

### ⚠️ L'ordre des boutons vient de `Object.keys`, qui trie les clés numériques

`Object.keys({"7":…, "30":…, "90":…, "365":…})` rend `["7","30","90","365"]` — **ordre numérique
croissant**, pas ordre d'écriture : le langage énumère d'abord les clés qui ressemblent à des
entiers. Ici cela tombe juste, mais une clé non numérique (« annee ») passerait **derrière** toutes
les autres et casserait la progression du sélecteur, sans erreur.

**Parade** : si l'ordre porte du sens, l'écrire dans un tableau explicite — ou, a minima, le
verrouiller par un test qui lit les libellés rendus dans l'ordre du DOM.

### ⚠️ Un SVG en `w-full` déplace ses points quand son conteneur change de largeur

Envisagé puis **rejeté** : élargir la carte « Où agir » de 5 à 12 colonnes quand une matière est
sélectionnée. Le `<svg viewBox="0 0 400 250" className="w-full">` s'étire avec son conteneur —
doubler la largeur déplace **chaque bulle horizontalement**, y compris celle que l'utilisateur vient
de cliquer, **sous son curseur**, dans le même frame.

**Parade** : un geste de lecture ne recompose pas la page. Faire adapter le **contenu** à la largeur
disponible plutôt que la largeur au contenu.

## Chantier `feat/journal-tri-et-filtre` — tri et filtre du Journal (addendum ADR-0034) — 2026-08-04

### 🔴 `tsc -b` est VERT sur un contrat qu'il n'a pas reconstruit

Après avoir ajouté un champ obligatoire à `Journal` dans `packages/types`, `npm run typecheck` est
passé **vert** côté Papa. Six littéraux de test étaient pourtant invalides : `tsc -b` compilait
contre le `.d.ts` **en cache** de `packages/types`, non reconstruit.

**Parade** : après tout changement de `packages/types`, relancer le typecheck **une seconde fois**
(la première reconstruit le paquet), ou lancer `npm run build`, qui ne peut pas mentir. Et lire le
**code de sortie**, pas la sortie : `npm run typecheck | tail -4` rend le code de `tail`, donc `0`
quoi qu'il arrive — le `&&` qui suit s'exécute sur un typecheck rouge.

### 🔴 Un verrou de pagination qui reste VERT quand on retire la queue de tri

Le test vérifiait « aucun doublon, aucun lot disparu » sur deux pages. En **retirant** la queue
`created_at DESC, id DESC`, il restait vert : un **ensemble** ne dit rien d'un **ordre**, et la base
rendait par hasard l'ordre d'insertion.

**Parade** : insérer les lots du plus ANCIEN au plus récent (l'ordre d'insertion devient l'inverse
de l'ordre attendu) et asserter l'**ordre exact**, pas l'ensemble. Vérifié par sabotage : il rougit.

### 🔴 `getByText` global trouve le libellé de la mauvaise zone

Le verrou « la ligne de synthèse NOMME les critères actifs » cherchait `getByText("Mathématiques")`.
Ce texte existe **aussi** dans la rangée de pastilles de matière juste au-dessus, toujours visible :
le test aurait été vert sans que la ligne de synthèse existe.

**Parade** : `data-testid` sur la zone, puis `within(screen.getByTestId(...))`. Le test dit alors ce
qu'il vérifie. Même famille que « `findByRole` attrape le premier arrivé ».

### ⚠️ Une valeur arbitraire Tailwind ne se vérifie pas sur la chaîne qu'on a écrite

`border-[rgba(212,175,55,0.55)]` **est** généré, mais Tailwind écrit `#d4af378c` dans le CSS.
Chercher `rgba(212,175,55` dans `dist/assets/*.css` ne rend rien et fait conclure — à tort — que la
règle n'a pas été produite. Deux fausses alertes émises pour cette seule raison.

**Parade** : chercher la forme **hexadécimale** (`d4af37`), ou mieux, lire l'élément **rendu** :
`getComputedStyle(el).borderTopColor`. ⚠️ Et ne pas tronquer `boxShadow` : Tailwind y place
d'abord quatre emplacements vides (`rgba(0,0,0,0) 0px 0px 0px 0px`) avant les vraies ombres — une
troncature à 80 caractères ne montre que le vide.

### ⚠️ Le rechargement d'une maquette en `file://` sert la version en CACHE

Trois corrections successives de la maquette n'apparaissaient pas : `location.reload()` sur une URL
`file://` rendait l'ancienne page, et les mesures faites dessus décrivaient un état révolu.

**Parade** : naviguer avec un paramètre qui change (`?v=2`, `?v=3`). Un `reload()` ne suffit pas.

### ⚠️ `production_events.piece` est `NULL` sur `outcome='blocked'`

Un filtre par type de contenu ne peut **pas** retenir un lot bloqué avant d'avoir touché une pièce :
il n'a pas de type à comparer. Ce n'est pas un défaut à réparer, c'est un constat de code
(`runner.py`, `piece=None, outcome="blocked"`).

⚠️ **Et un second angle mort, mesuré** : les lots **antérieurs à la table** `production_events` n'ont
aucun événement du tout — le lot #3 de la base de dev porte **4 fiches et 0 événement**, donc aucun
filtre de type ne le retient. **Parade** : l'état vide de l'écran le DIT ; ne pas « réparer » en
filtrant les cinq tables de pièces, ce qui perdrait toutes les lignes bloquées, sautées et en erreur.

### ⚠️ `lessons_by_skill` scope l'année par une jointure sur `SchoolYearSubject`

Un `Chapter` rattaché **seulement** par `theme_id` (`school_year_subject_id IS NULL`) n'a aucun
chemin vers une année scolaire : il est invisible de la production, de la galaxie **et** de
`canonical_context`. `Theme` porte une matière, **jamais une année** — il n'existe donc aucune
réparation locale.

**Parade retenue** : fermer la **porte** (`POST /subjects/themes/{id}/chapters` pose désormais aussi
la matière d'année, ou refuse). ⚠️ Le verrou de test porte sur l'**atteignabilité** (`lessons_by_skill`
rend la leçon), pas sur la colonne — vérifier `school_year_subject_id is not None` serait un test de
schéma qui ne prouve rien.

### ⚠️ Le veto SUPPRIME la ligne `Lesson` d'un cours retiré

`veto._delete_one` fait `delete(Lesson).where(id == piece_id)`. Toute logique qui lit
`Lesson.production_run_id` comme une **preuve** (ici : « ce lot a rédigé un cours ») est donc
**rétractable** par un geste que le dispositif autorise.

**Parade** : ne pas re-dériver à la lecture ce qu'un veto peut effacer — écrire une fois, marqué de
sa provenance.

### ⚠️ Un `cd` chaîné ne survit pas à la commande suivante

`cd apps/frontend-papa && npm run build`, puis dans une commande **séparée** `npx vitest ...` a rendu
`exit 127` (commande introuvable) et un `tsc exit=1` trompeurs. Ce n'étaient pas des pannes.

**Parade** : relancer avec le `cd` explicite avant de conclure quoi que ce soit d'un code de sortie.

## Chantier `fix/production-trois-verites` — la production — 2026-08-04

### 🔴 Patcher `enqueue_production` est VERT et SANS EFFET

`runs_router.py:11` fait `from app.core.queue import enqueue_production` — **au niveau module**. Le
nom y est lié à l'import : `monkeypatch.setattr(queue_mod, "enqueue_production", …)` ne rebinde
rien chez lui. Le garde-fou évident passe donc au vert **en laissant fuir**.

`capsules/service.py:390`, lui, importe **dans le corps de la fonction** — c'est pour ça que les
cinq monkeypatchs de `test_capsule_render` marchent, et ça masque le piège.

**Parade** : greffer sur la **fabrique** (`production_queue` / `render_queue`). `enqueue_production`
la résout dans les globals de **son** module, **à l'appel** : tous les appelants sont attrapés,
quelle que soit la façon dont ils ont importé. Fixture `autouse` `file_rq_factice` dans `conftest`,
plus un `_redis` qui **lève**.

### 🔴 Une contre-épreuve peut viser le mauvais CADRAN

Fixture désarmée pour prouver la fuite → `len(production_queue())` = **0**. Conclusion tentante :
« il n'y avait pas de fuite ». Faux — **le worker qu'on venait de lancer consommait les jobs à la
milliseconde**. La preuve était dans `FailedJobRegistry` : **18 → 21**, avec
`ValueError: production_run 1 introuvable`.

**Parade** : quand un sabotage ne fait rien tomber, se demander d'abord si l'instrument regarde au
bon endroit. Deuxième occurrence le même jour : le `target` du Journal a **deux gardes** (le filtre
SQL `outcome == "blocked"` **et** le ternaire) — en casser une seule ne casse rien.

### 🔴 39 leçons `validated` SANS une ligne de contenu

`validate_all_lessons` passe en `validated` **toutes** les leçons `draft` d'un chapitre, sans
regarder s'il y a un texte. `Lesson.status` porte donc deux sens : « au programme validé » et « le
cours est relu ». La production lit le second là où le curriculum a écrit le premier — d'où un motif
qui disait *« Cours à valider »* d'une leçon **déjà validée, seulement vide**, dans la majorité des
cas où il s'affichait.

**Parade immédiate** : deux motifs (`BLOCKED_COURSE_MISSING` / `BLOCKED_COURSE_PENDING`). **La
conflation du champ reste entière** — c'est une dette, avec migration.

### ⚠️ Les pièces leçon-centrées n'ont PAS de `skill_id`

`_pieces_of_run` met `skill_id = None` sur cours, fiche, carte mentale et quiz : ces quatre familles
sont **leçon-centrées**. Seules les cartes SRS portent une notion. Un index `(skill_id, kind)` pour
rattacher une ligne de journal à sa pièce rend donc `None` **partout**.

**Parade** : clé `(lesson_id, kind)`, et `(skill_id, "srs")` pour les cartes. `lesson_id` ajouté aux
dicts internes de `_pieces_of_run` — absent de `JournalPieceOut`, donc jamais exposé.

### ⚠️ Le contenu d'un `<details>` FERMÉ reste dans le DOM

`screen.queryByText(/à faire/)` trouve la ligne d'événement même repliée. Un test qui vérifie
« le résumé ne dit pas *à faire* » passait donc pour la mauvaise raison.

**Parade** : viser ce qui distingue les deux — ici le **chiffre** (`/\d+ à faire/`). Et penser à
`aria-hidden` sur les icônes dupliquées : deux éléments au même nom accessible cassent
`getByLabelText`.

### ⚠️ `☐` et `☑` (U+2610/U+2611) sont INVISIBLES sur fond sombre

Rendus en trait d'un demi-pixel par les polices système. Les tests passaient (l'élément existait,
avec son `aria-label`) et l'écran ne montrait **rien**.

**Parade** : dessiner (SVG, `currentColor`). Règle générale — **un caractère dont l'apparence dépend
de la police installée n'est pas un élément d'interface.**

### 💡 Vérifier une page Papa à l'écran SANS se connecter

Déposer une page statique dans `apps/frontend-papa/public/`, l'ouvrir via le serveur Vite déjà lancé
(`localhost:5175/x.html`) — aucun login requis — screenshot, **puis la supprimer** (`public/` part
dans le build). Sinon : le MCP `claude-in-chrome` utilise la session déjà connectée de Chrome.

## Chantier `feat/bandeau-*` — les bandeaux des deux frontends — 2026-08-04

### 🔴 Un test de budget qui part d'une PAGE ne voit pas le LAYOUT

`accueil.bundle.test.ts:40` part de `pages/AccueilMassimoPage.tsx`, `matiere.bundle.test.ts:33` de
`pages/MatiereDetailPage.tsx`. `reachable()` ne suit que les imports **depuis son entrée** :
`MassimoLayout.tsx` et `MassimoBannerHeader.tsx` ne sont dans **aucun des deux graphes**.

Un `import("@zetis/ui/galaxy/canvas")` dans le header aurait donc chargé **1,37 Mo sur les 21
routes** — y compris `/subjects/:slug`, dont le budget est écrit ZÉRO — en laissant **les deux
suites 12/12 vertes**.

**Démontré, pas supposé.** Sabotage joué : ajout de la ligne, `accueil` et `matiere` restent
vertes, `layout.bundle.test.ts` et `app.bundle.test.ts` virent au rouge **en nommant
`MassimoBannerHeader.tsx`**. Puis fichier restauré, `git diff` vide.

**Parade** — le chrome est une unité de sens distincte d'une page : il est payé PARTOUT. Deux
suites de plus, avec le même moteur `bundleGraph.ts` : `layout.bundle.test.ts` (entrée
`MassimoLayout.tsx`, budget zéro) et `app.bundle.test.ts` (entrée `App.tsx`, **liste épinglée** des
points de montage — toute apparition d'un troisième fait échouer le test).

### 🔴 Le header Massimo était INTESTABLE sous jsdom, et ce n'était pas un oubli

Il n'avait **aucun** test, contrairement à `PapaLayout`. La cause : `NeuralLinks.tsx:30` faisait
`new ResizeObserver(...)`, que jsdom n'implémente pas et que `apps/frontend-massimo/src/test/setup.ts`
**ne polyfille pas** (il ne contient que `@testing-library/jest-dom/vitest`). Monter le header
jetait `ReferenceError: ResizeObserver is not defined`.

**Parade** — le remplaçant teste `typeof ResizeObserver === "undefined"` et retombe sur un écouteur
de `resize`. Le header devient montable, et onze test-verrous ont pu être écrits d'un coup. ⚠️ Ne
pas polyfiller `ResizeObserver` dans le `setup.ts` global : ça masquerait le même piège ailleurs.

### Un budget de particules calculé sur la MOYENNE est faux

`revealSchedule` place les ancêtres à `born − hauteur × ANCESTOR_LEAD`, donc les naissances
arrivent **en grappes**. Une durée de traînée dérivée du débit moyen
(`IN_FLIGHT_BUDGET × durée / naissances`) donnait **34 étoiles en vol pour un budget de 32** —
attrapé par le test, pas à l'œil.

**Parade** — mesurer le **pic** : `peakInFlight(sorted, window)` en deux pointeurs, puis une
bissection sur la durée. O(n) par essai, 24 essais, une seule fois. Ne pas revenir à la moyenne
« parce que c'est plus simple » : elle sous-estime toujours.

### `bg-cover` rogne ; un masque sur `inset-0` ne fond rien

Deux pièges enchaînés sur le bandeau Papa, tous deux vus à l'écran :

1. `bg-cover` met l'image à l'échelle de la **largeur**. Sur un header bien plus large que haut,
   l'image déborde en hauteur et se fait couper par le haut. `bg-contain` cale sur la **hauteur**.
2. Le fondu latéral (`maskImage: linear-gradient(90deg, …)`) se mesure sur la largeur du **calque**.
   Posé sur `inset-0`, ses zones de fondu tombaient **hors de l'image** (qui n'occupe que le centre
   en `contain`) : le rectangle sombre de l'image se voyait comme une couture. Le calque doit porter
   l'`aspect-[10/3]` de l'image.

### `StrictMode` tue une animation verrouillée « une seule fois » si le verrou se pose au DÉBUT

`main.tsx` monte l'app dans `<StrictMode>`, qui monte, démonte et remonte chaque effet en dev. Un
`let alreadyPlayed = false` de module positionné **au démarrage** de l'animation est donc vrai au
second montage : plus rien ne s'anime en développement, et seulement là.

**Parade** — poser le verrou **à la fin**. Bonus : une construction interrompue (déconnexion,
remontage) n'est alors pas comptée, ce qui est aussi le bon comportement en production.

### Deux tests réécrits parce que la DÉCISION a changé — et pourquoi ce n'est pas une régression masquée

`la boucle S'ARRÊTE` et `le coût par image est indépendant de N` encodaient fidèlement la
conception du matin. En cours de session, deux décisions les ont invalidés : la galaxie ne se fige
plus (elle tourne), donc le calque posé ne sert plus.

**Règle appliquée** — un test qu'on modifie pour qu'il passe est une régression masquée ; un test
qu'on réécrit parce que la règle a changé doit **encoder la nouvelle règle et dire l'ancienne**.
Les deux portent désormais un bloc `⚠️ CE CAS A CHANGÉ DE NATURE LE …` qui explique quoi et
pourquoi. Le second **avoue** que le coût est proportionnel à N — c'est un aveu, pas un
assouplissement.

### Le témoin d'état existe parce qu'un compte d'images ne prouve plus rien

Tant que la boucle s'arrêtait, « la construction n'a pas rejoué » se vérifiait en comptant les
`requestAnimationFrame`. Depuis qu'une boucle permanente tourne, ce compte ne distingue plus rien.
D'où `canvas.dataset.state` (`growing` → `alive`), lu par le test-verrou. ⚠️ Ce n'est pas du
débogage laissé traîner : c'est la seule surface observable de l'invariant.

## Chantier `fix/starlette-*` — dépendances et constantes HTTP — 2026-08-04

### 🔴 Une dépréciation qui ne se plaint PAS est la plus dangereuse

`HTTP_413_REQUEST_ENTITY_TOO_LARGE` était déprécié **au même titre** que le 422, mais n'a produit
**aucun warning** : son chemin (`eli5`, fichier trop lourd à l'upload) n'est exercé par aucun test,
et la dépréciation ne se déclenche qu'**à l'accès à l'attribut**.

**Parade** — ne pas corriger « ce qui crie ». Demander à la lib installée sa table de renommages :

```bash
apps/backend/.venv/bin/python -c "
import inspect, re
from starlette import status
for a, b in re.findall(r'\"(HTTP_[A-Z0-9_]+)\": \"(HTTP_[A-Z0-9_]+)\"', inspect.getsource(status)):
    print(a, '->', b)"
```

Starlette 1.3.1 en annonce **quatre** ; nous en utilisions deux, dont un muet.

### Un warning qu'on laisse traîner ne fait pas une panne — il fait un fichier incohérent

`curriculum/service.py` portait **déjà** un `HTTP_422_UNPROCESSABLE_CONTENT` au milieu de ses
dépréciés, hérité d'un chantier antérieur. La lecture suivante croit l'écart intentionnel et le
recopie. C'est le vrai coût d'une dépréciation ignorée.

### `tsc -b` échoue depuis la racine — et `npx tsc` attrape le mauvais binaire

Deux pièges enchaînés en voulant vérifier le typage :

| Commande | Ce qui se passe |
|---|---|
| `npx tsc -b` | attrape le paquet `tsc` du registre, **pas TypeScript** : *« This is not the tsc command you are looking for »* |
| `./node_modules/.bin/tsc -b` à la racine | `error TS5083: Cannot read file '<racine>/tsconfig.json'` — il n'y a **que** `tsconfig.base.json` |

**Parade** — `pnpm --filter @zetis/frontend-papa typecheck` (idem Massimo). ⚠️ Ici l'outil échoue
**franchement** au lieu de mentir ; c'est le bon comportement, à ne pas « réparer » en ajoutant un
`tsconfig.json` racine qui ne compilerait rien.

### `uv lock --resolution lowest-direct` ne tourne pas sur ce dépôt

Voulant **prouver** que le plancher déclaré cassait, la résolution basse échoue pour une raison sans
rapport : `faster-whisper` (extra `stt`) tire `av==11.0.0`, qui ne compile pas sans `pkg-config`.

**Conséquence assumée** : la casse sous le plancher est **raisonnée, pas démontrée**. C'est écrit
tel quel dans la PR #77 — ne pas la présenter comme vérifiée.

**Ce qui marche, en revanche**, pour dater l'apparition d'un symbole, sans toucher au projet :

```bash
uv run --no-project --with "starlette==0.47.3" python -c "from starlette import status; print(hasattr(status,'HTTP_422_UNPROCESSABLE_CONTENT'))"
```

C'est ainsi que `>=0.48` a été **mesuré** (faux en 0.47.1/2/3, vrai en 0.48.0) plutôt que choisi.

### Graphify n'oriente pas sur une constante lexicale

Interrogé sur `HTTP_422_UNPROCESSABLE_ENTITY`, il a rendu les sections « Statut » des ADR-0005/0007
— il indexe des **concepts**, pas des identifiants. Le grep est légitime **après** cette tentative,
pas à sa place.

## Chantier `feat/etat-zetis-sidebar` → `refactor/vocabulaire-niveau-palier` — 2026-08-04

### 🔴 Un renommage de clé JSON ne peut PAS être vu par les tests unitaires

Le plus coûteux des cinq, et le plus contre-intuitif. `preset` → `niveau` a été renommé côté
serveur **et** côté front. À aucun moment les **805 tests backend + 377 front** n'auraient pu voir
une rupture : le backend se teste contre lui-même, le front **mocke** `fetchAutonomy`. Renommez
d'un seul côté, tout reste vert — et l'écran retombe silencieusement sur « Sur mesure », un régime
**faux**, sans la moindre erreur.

**Parade posée** : `packages/types/contracts/autonomy.example.json`, une réponse **capturée** du
serveur réel, relue par deux tests qui n'ont que ce fichier en commun — côté back « la réponse a
exactement ces clés », côté front « les composants **rendent** à partir de ce fichier, **sans
mock** ». Trois contre-épreuves jouées. ⚠️ Le fichier se **capture** ; écrit à la main ce n'est
qu'un mock de plus. Et seules les **clés** engagent : figer des valeurs le rendrait rouge au premier
réglage changé en base de dev.

⚠️ **Piège dans le piège** : renommer la clé dans `router.py` seul **ne change rien** à la réponse.
Pydantic filtre sur les champs du `response_model` — la clé inconnue est **jetée**, l'ancienne
repasse à `None`. La mutation qui prouve le test doit toucher **`schemas.py`**.

### Un verrou anti-sondage qui ne pouvait pas mordre

`vi.useFakeTimers()` posé **après** `renderHook` ne contrôle **que** les minuteurs créés ensuite.
Le test « 60 s de timers avancés → un seul appel » passait au vert **avec** un `setInterval(load,
15000)` ajouté exprès dans le hook. Parade : installer les faux timers **avant** le rendu, attendre
la promesse par `await act(async () => { await Promise.resolve() })`, puis
`advanceTimersByTimeAsync`. ⚠️ Ce patron est **copié de `useNewsSummary` (ADR-0030) dans tout le
dépôt** — les autres copies sont probablement aussi creuses.

### `onMouseLeave` cesse de se déclencher si l'infobulle est FILLE de l'élément survolé

L'infobulle restait ouverte indéfiniment. Son apparition ajoutait un nœud **dans le sous-arbre
survolé**, et React cessait d'émettre le `leave`. **Trouvé à l'écran, aucun test ne le voyait.**
Parade : écouter le survol sur un **conteneur** dont l'arbre ne bouge pas, l'infobulle étant sa
sœur du lien. Un verrou le tient désormais.

### Une infobulle en `absolute` est coupée par le `overflow-hidden` de la sidebar

La colonne **et** son conteneur clippent leur contenu — c'est ce qui permet à la nav de défiler
seule. Toute surface qui déborde doit être en `position: fixed`, avec sa position mesurée sur
l'ancre au survol.

### `role="group"` homonyme : quatre tests tombés d'un coup

`NiveauDetail` a repris le `role="group" aria-label={cls.label}` de `ClassRow`, à quelques centaines
de pixels. **Deux groupes du même nom** rendent les lignes indiscernables pour un lecteur d'écran
comme pour `getByRole`. Parade : `list`/`listitem` ici — et c'est plus juste, `group` annonçant un
ensemble de **contrôles** que ces lignes n'ont pas.

### `vi.clearAllMocks()` manquait : les compteurs d'appels étaient CUMULATIFS

Dans `ParametresPage.test.tsx`, toute assertion `toHaveBeenCalledTimes(n)` dépendait de la
**position du test dans le fichier**. Deux tests écrits ce jour-là sont tombés dessus. Corrigé à la
source, dans le `beforeEach`.

### Renommage automatique : un regex qui protège les clés protège aussi les déclarations

`(?<!\.)\bpreset\b(?!\s*:)` — écrit pour épargner `{ preset: … }` — épargne **aussi** les
déclarations de props (`preset: AutonomyNiveau | null;`) et les paramètres annotés
(`fn(preset: T)`). Il renomme donc les **usages** sans les **déclarations**, et le fichier ne
compile plus. Les raccourcis d'objet `{ preset }` alimentant un champ réseau ne doivent pas suivre
non plus. **Les deux ont été rattrapés par `tsc`, jamais par les tests.**

### Erreurs Vite fantômes après suppression de fichiers

Après avoir supprimé `RegimeToday.tsx` et renommé `PresetCards.tsx`, la console montrait
« Failed to reload » pour ces fichiers — **même après redémarrage du serveur**. Ce sont des entrées
mortes du **tampon console de l'onglet**. Un **onglet neuf** rend zéro erreur. Ne pas partir en
chasse : le `build` de production le confirme d'un coup, un module manquant l'aurait fait échouer.

### `sips -c … -Z …` en une passe ne donne pas la taille demandée

`sips -c 900 900 -Z 128` rend du **112 px** : l'échelle est calculée sur la dimension d'origine, pas
sur le recadrage. Il faut **deux passes** (recadrer, puis réduire).

## Outillage — graphify (2026-08-04)

### `graphify explain` ment par omission sur un nom dupliqué

Mesuré le 2026-08-04. `graphify explain "_active_year"` rend **un seul** nœud —  celui de
`dashboard/service.py` — présenté comme LA réponse, avec sa source, sa communauté et ses voisins.

Or le graphe en contient **sept** (vérifié dans `graph.json`) : `curriculum`, `mindmaps`,
`missions`, `dashboard`, `fiches`, `quizzes`, `production.coverage`.

⚠️ **Aucun avertissement, aucune mention des six autres.** C'est le pire comportement possible
quand la question posée EST la duplication : la commande ne se contente pas de manquer l'info,
elle **affirme** sur une occurrence arbitraire.

**Parade** : pour une question de duplication, `grep -rn "def <nom>"` dit la vérité. `explain` sert
à comprendre UN nœud dont on sait déjà qu'il est unique.

> À l'inverse, `graphify query` s'en sort : c'est lui qui a fait apparaître le **3ᵉ** résolveur de
> leçon (`resolve_canonical_context`) que le cadrage de l'ADR-0037 ignorait — il rend une liste de
> nœuds, pas une réponse unique.

### `graphify affected` remplace le grep d'impact — et n'était pas utilisé

`graphify affected "<fn>"` rend les appelants d'une fonction, en une commande. Sur les helpers des
modules neutres (`provenance`, `lesson_resolution`, `canonical_context`, `equipment`), **cette
liste EST le périmètre de non-régression**.

Six commandes de `graphify --help` n'avaient jamais servi (`affected`, `path`, `explain`,
`diagnose multigraph`, `save-result`, `reflect`). `affected` est entrée dans `/slice` §1bis le
2026-08-04.


### ⚠️ 32 jobs RQ identiques pour un lot supprimé — multiplication NON ÉLUCIDÉE

Constaté au désarmement du 2026-08-04 : la file de production portait **32 exemplaires** de
`run_production(1)`, plus 3 échoués — pour un `production_run` **supprimé** lors d'un nettoyage
antérieur. Ils ne pouvaient qu'échouer.

**Ce qui est établi :**

- ils sont arrivés **par paires**, réparties sur **13 heures** ;
- les deux dernières paires portent les heures **exactes** des merges des PR #73 (`03:21` UTC) et
  #74 (`04:47` UTC) — donc à des instants où `uvicorn --reload` a redémarré ;
- **aucun de nos trois appelants** de `enqueue_production` n'est un hook de démarrage
  (`runs_router` ×2 sur un geste HTTP, `jobs.scan_triggers` sur un lot créé) ;
- `enqueue_production` ne pose **aucune politique de réessai**.

**Ce qui n'est PAS établi : la cause.** Les paires et la corrélation aux redémarrages suggèrent un
mécanisme de RQ (nettoyage de registres au démarrage d'un worker ?), mais je ne l'ai pas prouvé.
**Consigné comme observation, pas comme diagnostic** — inventer une cause plausible serait pire que
d'admettre le trou.

**Parade appliquée** : purge de tout job dont le `production_run` visé n'existe plus, dans la file
**et** dans les registres `Failed` / `Deferred`.

> **À re-mesurer si la file regrossit.** Si le motif se reproduit, compter les jobs avant/après un
> redémarrage isolé d'`uvicorn` tranchera en une minute.


## Chantier `fix/sidebar-massimo-mobile` — le tiroir de navigation — 2026-08-04

### 🔴 La sidebar Massimo n'avait AUCUN point de rupture — l'app était inutilisable sur téléphone

Trouvé en allant vérifier **autre chose** : la dette « la galaxie n'a jamais été vue sur trois
appareils ». Au premier viewport mobile, ce n'est pas la galaxie qui a cassé.

`MassimoSidebar.tsx:17` portait `className="flex w-60 shrink-0 flex-col …"` — **largeur fixe de
240 px, jamais repliée, jamais masquée**. Mesuré à 375 px :

| | |
|---|---|
| sidebar | **240 px** |
| reste pour le contenu | **135 px** |
| canevas de la galaxie | **170 × 800** — un ruban vertical |

⚠️ **`CLAUDE.md` exige pourtant** : *« UI responsive desktop/tablette/mobile. Prévoir une version
iPhone pour Massimo. »* Le défaut est pré-existant (dernier commit sur le fichier : ADR-0030).

**Pourquoi 453 tests ne l'ont pas vu** : jsdom n'a pas de viewport, les classes Tailwind ne sont
jamais évaluées, et aucun test ne rendait le layout à une largeur donnée. **Une classe CSS absente
ne casse aucun test — elle casse l'écran.**

> C'est le seul cas où un test au viewport de navigateur est **concluant** pour un iPhone : le
> défaut est une largeur fixe en CSS, pas une question de GPU ou de WebGL. Il se comporte donc
> identiquement sur l'appareil réel. Tout ce qui touche la **performance** (FPS, WebGL) reste, lui,
> invérifiable sans l'appareil.

### La spec prescrivait la solution — et l'appliquer aurait cassé trois ADR

`docs/frontend-massimo/navigation.md` dit : *« sidebar latérale sur desktop/tablette, bottom-nav
sur iPhone (les 5 verbes) »*. Décision déjà prise, jamais construite.

**Mais la spec date de l'étape 2 et ne connaît que 5 verbes**, quand la navigation en porte **13** —
Agenda placé en position 2 par l'ADR-0025, « Ma Galaxie » par l'addendum ADR-0024 §A **qui interdit
d'en faire un 6ᵉ onglet**, six témoins par l'ADR-0030 avec test-verrou. Appliquer la lettre de la
spec aurait **masqué 8 sections sur mobile**.

**Stop-on-blocker joué.** Correctif retenu : un **tiroir** — l'`aside` sort du flux (`fixed`) sous
`md` et coulisse ; `md:static md:translate-x-0` annule tout au-dessus. **Rien n'est retiré**, aucun
ADR contredit, et l'écart avec la spec est consigné dans la spec elle-même.

> **Une spec qui n'a jamais été construite vieillit sans qu'on s'en aperçoive.** Avant d'appliquer
> une prescription datée, vérifier ce que les décisions POSTÉRIEURES en ont fait.


## Chantier `feat/lecon-canonique` — la leçon d'une notion (ADR-0037) — 2026-08-03

### 🔴 DEUX de mes tests passaient pour la MAUVAISE raison — les deux démasqués par la contre-épreuve

C'est la leçon la plus chère du chantier, et elle est arrivée **deux fois dans la même heure**.

**1. Le verrou du périmètre d'année ne seedait aucune année ACTIVE.** Il créait une année
`archived` et vérifiait que la notion n'était pas équipable. Vert — mais par la garde *« pas
d'année active → rendre vide »*, **pas** par le filtre d'année qu'il prétendait tenir. Sabotage :
filtre d'année supprimé → **805 verts**. Remède : seeder une année active *en plus*, sans leçon
pour cette notion.

**2. Le test d'accord entre les trois appelants était aveugle.** Il posait deux leçons, la plus
récemment touchée créée **en second** — donc avec l'id le plus haut. `id DESC` et
`(updated_at, id) DESC` désignaient alors la **même** leçon : débrancher un appelant du substrat ne
cassait rien. Sabotage : `_skill_lesson` réécrit avec son ancienne requête → **805 verts**.
Remède : inverser l'ordre de création pour que **les deux tris se contredisent**, et l'affirmer
dans le test (`assert ancienne.id > recente.id`).

> **La règle qui en sort** : un test qui compare deux règles doit poser un décor où **elles ne
> peuvent pas tomber d'accord par hasard**. Sinon il ne teste que la moitié qui marche.

### Trois règles pour « la leçon d'une notion » — l'inventaire, pas la mémoire

Le `MEMORY.md` de la veille en annonçait **deux**. Il y en avait **trois**, trouvées en cherchant
les jointures qui *résolvent* (et non celles qui vérifient une existence) :

| Module | Ordre | Filtres |
|---|---|---|
| `production` (`select_notions`, `_stamp_course`, `_skill_lesson`) | `Lesson.id DESC` | `status != 'archived'`, **aucun filtre d'année** |
| `galaxy._course_lessons_by_skill` | max `(updated_at, id)` | `validated` + chapitre validé + année active |
| `ai.resolve_canonical_context` | `updated_at DESC` | `validated` + `content_markdown IS NOT NULL` |

⚠️ **`memory._has_validated_course` partage le prédicat du troisième mais ne résout rien** — c'est
un test d'existence. Le compter aurait fait chercher un quatrième bug inexistant.

### Le module partagé ne peut PAS vivre dans `curriculum` — cycle d'imports

`galaxy` et `production` importent tous deux `curriculum`, ce qui en faisait le domicile évident.
Mais `curriculum` importe `ai`, et `ai.canonical_context` est **l'un des trois appelants** :
`ai → curriculum → ai`.

D'où un **module PLAT** sous `modules/`, patron `provenance.py`, qui n'importe que `app.db.models`.
Voir `PROJECT_STRUCTURE.md` § « Les modules plats ».

### Une fixture peut cacher un périmètre qui n'existait pas

`test_canonical_context.py` et `test_eli5.py` posaient `chapter_id=1` sur un chapitre
**inexistant**, avec ce motif écrit : *« SQLite n'applique pas les FK »*. Ça tenait tant qu'aucun
résolveur ne joignait `Chapter → SchoolYearSubject → SchoolYear`. Le périmètre d'année devenu réel,
la jointure ne trouvait plus rien : **4 tests rouges, aucun défaut de code**.

> Une fixture qui contourne une contrainte que la base n'applique pas **documente une hypothèse**.
> Le jour où le code la prend au sérieux, c'est la fixture qui tombe — et on la lit comme une
> régression.

Remède : un helper `_chapitre()` qui crée une vraie année + un vrai chapitre validé. **Aucune
assertion modifiée** — c'est le décor qui devient vrai, pas l'attente qui s'assouplit.

### Le gate `validated` de `canonical_context` a quitté le SELECT

L'addendum ADR-0009 §C insistait : *« une clause du SELECT — impossible de recevoir un cours non
validé »*. Le substrat partagé rend les brouillons (la production en a besoin au palier 3), donc le
filtre est passé en Python.

**La garantie tient autrement, et il faut savoir laquelle** : ce n'est plus « impossible par
construction » mais « impossible par **unicité** » — un seul chemin, un seul filtre, un test qui
n'a pas bougé d'un caractère. Si un second chemin d'accès au cours canonique apparaît un jour, la
garantie s'évapore sans bruit.

### Mesurer un changement de comportement AVANT de le merger

Une règle de résolution qui change touche potentiellement tout le référentiel. Plutôt que de
l'espérer borné, on l'a **compté** sur la base de dev (278 notions) :

```txt
leçon inchangée           : 273   (98 %)
leçon changée             :   5   ← exactement les notions à deux leçons
devenue inéligible        :   0   ← le périmètre d'année ne coûte rien ici
```

Et sur les 5 : **4 gagnent un cours, 1 neutre, 0 en perd**. Puis vérification d'accord des trois
lecteurs sur les 278 : **0 désaccord**.

> Ce contrôle prend dix minutes et remplace une conviction par un chiffre. À refaire pour tout
> chantier qui change une règle de sélection.


## Chantier `feat/demande-vers-production` — la demande devient une production (ADR-0036) — 2026-08-03

### ⚠️ DEUX RÈGLES pour « la leçon de cette notion » — et elles ne donnent pas la même leçon

**Pré-existant, rendu visible par ce chantier.** Une notion peut être rattachée à plusieurs leçons,
et deux résolveurs du dépôt en choisissent une **différemment** :

| Résolveur | Règle | Filtre |
|---|---|---|
| `runner.select_notions`, `equipment._skill_lesson` | `ORDER BY Lesson.id DESC LIMIT 1` | `status != 'archived'` |
| `galaxy._course_lessons_by_skill` | max sur `(updated_at, id)` | année active, chapitre + leçon `validated` |

**Constaté en vrai le 2026-08-03.** La notion « Discours direct » porte la leçon 5 (validée, **avec**
cours) et la leçon 12 (validée, **sans** cours). Le lot-pièce a retenu la **12** et s'est bloqué —
« Cours à valider » — alors que la galaxie considère le cours de cette notion **disponible** et le
sert à Massimo.

⚠️ **Piège de diagnostic** : une requête SQL qui joint `lessons` en filtrant `content_markdown IS
NOT NULL` désigne une notion « prête » que le runtime bloquera. Pour reproduire la sélection réelle,
il faut `DISTINCT ON (skill_id) … ORDER BY skill_id, lesson.id DESC` **sans** filtre de contenu.

Non corrigé : un lot-chapitre a exactement le même comportement, donc ce n'est pas une régression.
Mérite sa propre décision — voir les dettes de `MEMORY.md`.

### `create_capsule` n'est pas symétrique des cinq autres générateurs

Les cinq générateurs du kit prennent un identifiant et produisent :

```python
generate_lesson_content(db, llm, lesson_id)          # pas d'embedder
generate_fiche(db, llm, embedder, *, lesson_id)
generate_mindmap(db, llm, embedder, *, lesson_id)
generate_quiz(db, llm, embedder, *, lesson_id, count, difficulty)
generate_cards_for_skill(db, llm, embedder, *, skill_id)
```

`create_capsule(db, llm, subject_id, instruction: str, …)` exige en plus une **instruction en texte
libre** — l'intention pédagogique de Papa. Une demande `(skill_id, content_kind)` ne la porte pas, et
l'inventer serait produire une vidéo que personne n'a pensée. **Stop-on-blocker joué au
read-before-code** ; l'ADR-0036 §3 a été corrigé en place le jour même.

⚠️ **Quatre générateurs sur cinq sont LEÇON-centrés, la demande est NOTION-centrée.** La résolution
existe (`equipment._skill_lesson`) — c'est un partage à faire, pas un mécanisme à écrire.

### Une contrainte SQL neuve peut rendre vert un verrou voisin

`ck_production_runs_exactly_one_scope` fait échouer toute insertion sans scope. Le helper `_run` de
`test_production_runs.py` n'en posait aucun — donc **le test voisin**, qui attend une
`IntegrityError` de `ck_production_runs_manual_has_no_reference`, aurait continué à passer **en
vérifiant une tout autre règle**.

> Quand une contrainte nouvelle touche une table, relire **tous** les tests qui attendent une
> `IntegrityError` sur cette table : ils ne disent pas laquelle ils attendent.

Le helper pose désormais un chapitre par défaut. ⚠️ Le `conftest` ne sème **aucun** `Chapter` : il
faut le créer (avec son `Theme`).

### `progress_pct` ne dit rien d'un lot-pièce — et ce n'est pas un bug

Il vaut `done_notions / total_notions`. Un lot-pièce a **une** notion : 0 % pendant toute sa durée,
puis le lot disparaît. L'indicateur d'en-tête restait donc **figé à 0 %** — constaté à l'écran, pas
par les tests, qui tournent sur des lots mockés.

Règle retenue : là où le serveur a de la granularité (`total_notions > 1`), il fait foi ; là où il
n'en a pas, l'affichage bascule sur `useEstimatedProgress`. Le champ ne ment pas — il n'a rien à
dire.

⚠️ Deux libellés « ZETIS produit **un chapitre** » étaient écrits **en dur** (pastille d'en-tête et
`ActiveProductionModal`). Faux dès qu'un lot vise une pièce.

### Le sondage d'en-tête était plus lent que les lots qu'il surveille

`useActiveProductionRun` sondait toutes les **20 s**. Un lot-pièce dure **15 à 17 s** (mesuré) :
l'indicateur pouvait naître et mourir **entre deux sondages**, donc n'apparaître jamais. Ramené à
4 s — `GET /runs/active` est une requête indexée qui rend un état, pas l'agrégat par page qui avait
tué le sondage d'en-tête le 2026-08-02.

### 🔴 Le réveil périodique se duplique à chaque redémarrage du worker

Deux mécanismes justes séparément, faux ensemble :

- `production_worker.py` **amorce** `scan_triggers` au démarrage (sans quoi une file vide ne se
  remplirait jamais) ;
- `jobs.scan_triggers` **se replanifie lui-même** en `finally` (sans quoi un scan qui échoue
  arrêterait le dispositif définitivement et en silence).

Résultat : **chaque redémarrage ajoute une récurrence permanente**. Constaté en vrai le 2026-08-03 —
`ScheduledJobRegistry` contenait **4 `scan_triggers`** après quatre démarrages dans la journée,
chacun à +180 min de son propre lancement.

⚠️ **Pas dangereux** : l'idempotence (`run_exists_for`) et les quotas empêchent la double
production. Mais c'est une **croissance non bornée** de la cadence, et en production un worker
redémarre (déploiement, crash, OOM).

**Correctif retenu** — `jobs.scan_already_planned(queue)` interroge **les deux registres** (la file
*et* les planifiés : un réveil est en file quand son heure est venue, planifié le reste du temps),
et `production_worker.py` n'amorce que s'il n'y a rien. **Ni l'amorçage ni l'auto-replanification
ne sont supprimés** — ils répondent chacun à un mode de panne réel ; on ajoute seulement la question
qui manquait.

⚠️ **Le correctif ÉVIDENT était piégeux**, et c'est pourquoi il a été écarté : donner au job un
`job_id` fixe (`queue.enqueue(scan_triggers, job_id="production:scan")`) le ferait se replanifier
sous **son propre identifiant** pendant qu'il tourne — or RQ efface le hash du job terminé après son
`finally`, et l'entrée planifiée pointerait vers un job mort. Le dispositif s'arrêterait
définitivement et en silence, exactement ce que le `finally` existe pour éviter.

Vérifié en vrai : **3 redémarrages → 1 seul réveil planifié**, et **file vide → l'amorçage a bien
lieu**. Les deux sens comptent — une garde qui n'amorcerait jamais serait pire que le défaut.

⚠️ **Piège de lecture** : `ScheduledJobRegistry.get_scheduled_time()` rend de l'**UTC**, les logs RQ
du **local**. Un écart de 2 h fait croire à un mauvais intervalle alors qu'il est juste.

### Des jobs RQ survivent aux lots qu'ils référencent

Cinq jobs `run_production` attendaient dans Redis en pointant un `production_run` **supprimé** au
nettoyage du chantier précédent. Un worker relancé les aurait exécutés et fait échouer en série.

> **Nettoyer un lot de test, c'est aussi vider sa file.** Redis n'a aucune clé étrangère.

⚠️ **Et vider `queue.jobs` ne suffit pas** : un job en échec part au `FailedJobRegistry`, d'où le
nettoyage de registres au démarrage du worker peut le ramener. Deux fantômes sont ainsi réapparus
le 2026-08-03 après une première purge. Balayer **les trois registres** (`Failed`, `Scheduled`,
`Deferred`) en plus de la file.

### `redis-cli` absent ne veut pas dire Redis éteint

`redis-cli ping` échouait ; Redis répondait parfaitement via `redis.Redis.from_url(...).ping()`. Le
binaire n'est simplement pas installé. Tester le service, jamais son client.


## Chantier `feat/declencheur-agenda` — le déclencheur automatique (ADR-0035) — 2026-08-03

### `massimo_is_active` comptait un LOGIN comme du travail

Elle ne filtrait que `NON_ACTIVITY_EVENTS` (les deux événements d'agenda), alors que son docstring
promet une activité **pédagogique**. Or `agenda/service.py` avait déjà tranché la question en
privé — `_NON_TRACE_EVENTS = {LOGIN, PAGE_VIEWED} | NON_ACTIVITY_EVENTS`, avec ce motif : *« la
navigation n'est pas du travail (sans quoi ouvrir la page allumerait une trace) »*. **Deux lecteurs
de la même question lisaient deux listes différentes.**

Mesuré en vrai : **se connecter suffisait à suspendre la production cinq minutes**. Anodin tant que
Papa cliquait (le lot attendait entre deux notions) ; **bloquant depuis l'ADR-0035 §7**, où cette
réponse décide si un lot AUTOMATIQUE démarre — un `login` faisait sauter un réveil entier du scan,
jusqu'à trois heures.

Constante promue en `NON_WORK_EVENTS` (`activity/events.py`) et partagée ; l'agenda la consomme au
lieu de sa copie.

### `create_run` lève des `HTTPException` — absurde dans un job RQ

Juste dans une requête, sans destinataire dans un worker : le code de statut ne part vers personne.
Le scan **rattrape et journalise** (`triggers.scan_agenda`), et **un lot refusé ne consomme pas la
référence** — l'échéance redevient éligible au réveil suivant. Un refus n'est pas une production.

### La convention pour un booléen dans `app_settings` est `"true"`/`"false"`

L'ADR-0035 §5 annonçait `0|1`. `agenda.service.student_entry_enabled` compare `row.value == "true"`
depuis l'ADR-0025. **Deux conventions pour stocker un booléen dans la même table, c'est une de
trop** — l'ADR avait tort, l'existant a gagné.

### `SubjectOption.sysId` est `number | null`

Une matière peut exister sans être rattachée à l'année active. Le typecheck l'a rattrapé sur le
câblage du Commander ; une garde `=== undefined` ne suffit pas.

### ⚠️ Une contre-épreuve peut viser à côté et rassurer à tort

En branchant `openFor` (hook `useCommandMission`), le piège annoncé était : `selectSubject` remet
`chapterId` à `null`, et `selectChapter` lit `gate` dans sa **fermeture**.

Premier sabotage — réintroduire `selectSubject` dans l'ordre des `setState` : **les 4 tests sont
restés verts**, parce que React batche et que le dernier `setChapterId` gagnait. J'ai failli
conclure que le piège n'existait pas.

Second sabotage, sur le vrai mécanisme — remplacer le `runPreview("deadline", …)` explicite par
`selectChapter(…)` : **les 4 tombent**. C'est cette version-là qui compte.

**Leçon : un sabotage qui ne casse rien ne prouve pas que le code est bon — il prouve que le
sabotage était mal choisi.**

### ⚠️ `create_request` (notion_requests) déduplique sur `lower(text)`

Un test écrit pour vérifier « pas d'avertissement si la notion a déjà une leçon » créait deux
demandes au texte presque identique en les croyant distinctes. Elles n'en faisaient qu'une : le
test empruntait la branche `already_processed` et **passait quoi qu'il arrive**. Pour tester un
état préexistant, poser la donnée **directement** (`create_manual_lesson`), pas via une seconde
demande.

## Chantier `feat/journal-production` — le Journal et le veto (ADR-0034) — 2026-08-03

### `Lesson.production_run_id` n'était JAMAIS écrit — le filigrane ne peut structurellement pas le voir

`_stamp` attribue au lot **les lignes NÉES depuis le filigrane** (`model.id > watermark`). Or
`equip_notion` **ne crée aucune `Lesson`** : il écrit `content_markdown` dans une ligne que le
référentiel a créée bien avant. `Lesson` figurait donc dans `_PRODUCED` sans jamais pouvoir y être
attribuée.

**Conséquence, trouvée en écrivant les tests et pas au cadrage : le veto sur le cours n'aurait
identifié AUCUN cours** — c'est-à-dire exactement la classe (A1) dont le palier 3 justifie tout le
chantier d'autonomisation.

Réparé par `_stamp_course`, appelé **uniquement** quand `equip_notion` rapporte `cours` dans
`generated` : c'est la seule situation où ZETIS a écrit le texte. Un cours rédigé par Papa, ou
seulement validé en lot, n'appartient à aucun lot et **ne doit pas être retirable**.

> **Corollaire à ne pas oublier** : un cours n'appartient à un lot **qu'au palier 3** (au palier 2
> le gate ne laisse passer que les notions dont le cours existe déjà). Les tests du veto sur le
> cours doivent donc écrire `a1 = 3` directement en base — l'API l'accepte depuis le 2026-08-03,
> mais le scénario reste celui du palier 3.

### `Fiche` et `Mindmap` n'ont AUCUNE colonne `title`

Vu seulement à l'écran : le Journal affichait « fiche #18 ». Les deux dérivés sont **leçon-centrés
par construction** (ADR-0015/0016 : une fiche = une leçon = une page), donc leur identité est celle
de leur **leçon**. `Quiz` a bien un `title`, `Lesson` aussi. Résoudre les titres **en une requête**
(`_lesson_titles`), jamais une par pièce.

### SQLite rend un datetime NAÏF là où Postgres rend un datetime AWARE

`is_stale` comparait `datetime.now(timezone.utc)` à `run.heartbeat_at` relu de la base :
`TypeError: can't subtract offset-naive and offset-aware datetimes`. **Le piège est qu'il ne se
manifeste que d'un côté** — en test (SQLite) ou en prod (Postgres) selon lequel voit le cas en
premier. Normaliser en `tzinfo=utc` avant toute soustraction sur une valeur relue.

### Le §G.3 énumérait « quatre familles » consommables et oubliait le COURS

Sa liste — `SpacedReviewAttempt`, `QuizAttempt`, `CapsuleView`, `fiche_views` / `mindmap_views` —
ne couvrait pas `Lesson`. Le signal existait pourtant (`EVENT_LESSON_VIEWED`, émis par
`student_lesson_cours`) mais sous une **cinquième forme** : `payload_json->>'lesson_id'`, **non
indexé** (l'index de `learning_events` est `(student_id, created_at)`). D'où la table
`lesson_views`, quatrième du patron. **`lesson_viewed` continue d'être émis en parallèle** — il
sert la heatmap et les sessions, pas le veto.

### `app.routes` ne rend rien d'introspectable dans cette version de FastAPI

`[r.path for r in app.routes]` lève `AttributeError: '_IncludedRouter' object has no attribute
'path'`, et le filtre `isinstance(r, APIRoute)` renvoie **0**. Pour vérifier qu'une route est bien
montée, passer par `/openapi.json` (ou un `TestClient`), pas par l'introspection de `app.routes`.

### Le bouton « Passer » de l'écran de login n'appartient pas à ZETIS

Cherché dans `apps/frontend-papa/src` : introuvable. C'est un élément du navigateur (gestionnaire
de mots de passe), pas un contournement d'authentification de l'app. Pour vérifier une page Papa
sans saisir de mot de passe : forger un jeton avec `create_access_token('papa','papa')` et le
poser dans `localStorage` sous la clé **`zetis_papa_token`** (`authClient.ts`).

## Chantier `feat/paliers-autonomie` — les paliers d'autonomie (ADR-0032) — 2026-08-02

### `set_lesson_validation` tamponnait `parent` sur un cours que personne n'avait ouvert

`equip_notion` auto-valide le cours en appelant `set_lesson_validation(db, id, "validate")`, et
cette fonction écrivait `mark_validated(lesson, PARENT, field="status")`. Résultat : une leçon
validée **par la machine** repartait marquée « relu pièce à pièce par Papa ».

**Pourquoi personne ne l'a vu pendant cinq semaines** : le verrou §F.3
(`test_no_validated_row_without_provenance`) vérifie qu'aucun `validated` n'est **sans**
provenance — pas qu'elle est la **bonne**. Une valeur fausse le satisfait parfaitement.

**Solution** : `by=` explicite sur la fonction (défaut `PARENT` pour la route humaine, qui ne
change pas), et `equip_notion` passe son `authority`. Verrou comportemental ajouté
(`test_aucune_auto_validation_necrit_parent`).

⚠️ **Ne pas écrire ce verrou comme `test_system_is_reserved_to_quizzes`** : celui-là est un **scan
statique de source**, et il aurait flaggé `curriculum/service.py`, qui écrit `parent`
**légitimement** pour la route humaine. Le seul verrou correct ici est comportemental : équiper une
notion, puis lire la provenance de sa leçon.

### Un fixture `autouse` s'exécute AVANT le fixture qu'il croit suivre → 403 partout

```python
# ❌ tous les appels Papa répondent 403 : `client_db` s'exécute APRÈS et réécrit l'override
@pytest.fixture(autouse=True)
def _papa() -> None:
    _as(PAPA)

# ✅ la dépendance impose l'ordre
@pytest.fixture(autouse=True)
def _papa(client_db) -> None:
    _as(PAPA)
```

`conftest.client_db` pose `app.dependency_overrides[get_current_user]` sur le rôle **`child`**. Un
`autouse` sans dépendance passe avant lui et se fait écraser. Symptôme : **12 tests d'un coup en
403**, ce qui ressemble à un problème d'authentification alors que c'est un problème d'ordre.

### `vite build` ne typecheck rien — seul `tsc -b` le fait

Le script `build` de `frontend-papa` est `tsc -b && vite build`. Lancer `vite build` seul passe au
vert avec un paramètre inutilisé, une prop manquante, un type faux. **Lancer `pnpm --filter
@zetis/frontend-papa build`**, jamais `vite build` seul. (Corollaire déjà noté ailleurs :
`tsc --noEmit` à la racine ne vérifie rien non plus.)

### Le front répétait mot pour mot le motif renvoyé par le serveur

`ClassRow` portait une table `DESCRIPTION` par classe, et le serveur envoie `reason` par classe. Sur
A3 et A4 les deux disaient la même phrase : la ligne s'affichait **deux fois**. Invisible en test
(chaque source est correcte prise seule), évident à l'écran en une seconde.

**Règle retenue** : le front dit **ce que la classe EST**, le serveur dit **pourquoi elle est
verrouillée**. Une idée, une source.

### Remonter le DOM avec `.closest("div").parentElement` pour cibler une ligne

Fragile et faux dès que la balise change : `getByText("Rédaction de cours").closest("div")`
attrapait un conteneur qui englobait plusieurs lignes, d'où des `getByRole` multiples. **Poser
`role="group"` + `aria-label`** sur la ligne et la cibler par son nom — utile au lecteur d'écran
autant qu'au test.

### Cliquer « Enregistrer » dans le même tick que le changement d'état ne fait rien

En vérification live, `preset.click(); save.click();` dans le même script : React n'a pas encore
re-rendu, le bouton est **encore `disabled`**, le second clic est un no-op silencieux. Attendre un
tour (`await new Promise(r => setTimeout(r, 250))`) avant de lire ou cliquer ce qui dépend du
rendu. Ce n'est pas un défaut de l'app — c'est un piège de scénario de vérification.

## Chantier `feat/page-matiere` — affinage au vu de l'écran — 2026-08-01

### `prettifySlug` ampute les accents — et ça se voit comme une faute de frappe

`prettifySlug("mathematiques")` rend **« Mathematiques »**. Sur un slug anglais ou court le repli
passe inaperçu (« Svt ») ; sur un mot français, il produit un mot mal orthographié, en gros, dans
un titre de page. Un enfant qui apprend l'orthographe lit ça.

Constaté en vrai sur QUATRE surfaces à la fois — `/fiches/:slug`, `/mindmaps/:slug`, `/revision`
et `/quiz` — parce que la bande de la page matière naviguait avec un simple slug d'URL. Aucun
test ne l'attrapait : ils vérifiaient la DESTINATION du lien, jamais le mot affiché.

**Règle** : un slug ne se ré-humanise pas. Le nom doit voyager — soit dans le `state` du lien
(les pages fiches/mindmaps le lisent déjà), soit résolu depuis une liste déjà chargée
(`/revision` a `summary.subjects`, `/quiz` a `subjects`). `prettifySlug` reste le dernier repli,
pour l'arrivée par URL partagée — et là, un accent manquant vaut mieux qu'un titre vide.

### Un test qui lit `window.location` sous `MemoryRouter` est vert À VIDE

`MemoryRouter` garde l'historique **en mémoire** : il ne touche jamais `window.location`. Un test
qui vérifie une URL par ce biais lit donc une chaîne **vide**, et passe pour de mauvaises raisons.

```tsx
// ❌ Vert quoi qu'il arrive — window.location.search vaut "" sous MemoryRouter.
const params = new URLSearchParams(window.location.search);
expect(params.get("subject")).toBeNull();
```

Parade : monter une **sonde** dans le routeur, qui lit l'URL par `useSearchParams` et la rend.

```tsx
function Sonde() {
  const [params] = useSearchParams();
  return <output data-testid="url">{params.toString()}</output>;
}
```

Rencontré en vérifiant que le nettoyage d'URL de `QuizPage` ne mange que `subject` et laisse
`from` (le rétrolien). Le faux positif est passé à un cheveu d'être livré.

### « Ça ne marche pas » : auditer la DONNÉE avant de toucher au calcul

Signalement : « le KPI 1 quiz dans mathématiques ne marche pas ». Le réflexe est de suspecter le
comptage. Un audit lecture seule de la base — en appelant le **vrai** service, pas une
reconstitution — a montré que **le compte était juste** sur les 8 matières.

Ce qui était cassé, c'était l'**affordance** : la pastille était non cliquable **par décision**
(aucune route par matière n'existait alors pour `quiz`), mais rendue exactement comme les
cliquables. **Une chose qui ressemble à un lien doit être un lien** — sinon elle se lit comme une
panne, et le signalement est justifié même quand le code fait ce qui était prévu.

Deux corollaires : une pastille inerte doit se **distinguer à l'œil** (pointillés, atténuation,
`aria-label` qui le dit) ; et quand une route par matière manque, la question à se poser est
« peut-on l'ajouter ? » avant « comment afficher qu'elle manque ? ». Ici `?subject=` existait déjà
comme patron sur `/revision` et `/eli5` : il suffisait de l'appliquer à `/quiz`.

### Compter depuis la panoplie : deux pièges qui gonflent les nombres

La charge utile `/subjects/{slug}/panoply` porte les ids de chaque activité disponible, ce qui
permet de compter les ressources d'une matière **sans requête**. Deux réserves, toutes deux
vérifiées dans le code :

**1. Plusieurs notions partagent la même leçon.** `_course_lessons_by_skill` renvoie
`skill_id → lesson_id` : rien n'empêche deux notions de retomber sur la même leçon, et
`_validated_fiche_ids` est indexé **par leçon**. Le même `fiche_id` sort donc sur chaque notion
de cette leçon. Compter les notions « fiche disponible » gonfle le nombre d'autant de notions que
la leçon enseigne. **Dédupliquer par `Set` sur l'id, jamais compter les notions.**

**2. `MAX(id)` ne rend qu'UNE ressource par clé.** Les quatre résolveurs
(`galaxy/service.py:436,452`, `missions/service.py:94,126`) utilisent `func.max(...)` groupé, pour
reproduire l'`ORDER BY id DESC LIMIT 1` d'origine. Si une leçon a **3 fiches validées**, la
panoplie n'expose que **la plus récente**.

⚠️ **Conséquence : une matière affichera « 1 fiche » sur la page matière et « 3 fiches » sur
`/fiches`.** Les deux nombres sont **justes** — « ce que je peux ouvrir depuis mes notions »
contre « ce que le catalogue contient ». **Ne pas “corriger” l'écart** : le premier est le bon
pour la page matière, puisqu'il annonce exactement ce que Massimo trouvera en dépliant ses
chapitres juste en dessous.

Corollaire moins visible : une leçon validée **sans aucune `LessonSkill`** n'apparaît jamais dans
la panoplie — sa fiche est donc invisible du comptage dérivé, alors que `fiches/summary` la compte.

### La teinte de la demande n'a pas de marge : bouger la LUMINOSITÉ, pas la teinte

L'or `#ffcf47` de « ZETIS parle » est à **18° de teinte** de l'orange de la demande, et le rouge
est banni (ADR-0024 §5). Chercher un orange « plus électrique » revient donc à choisir laquelle
des deux frontières franchir : plus clair glisse vers l'or, plus foncé frôle le rouge.

L'axe libre est la **luminosité**, et c'est déjà la grammaire de l'app (`NeonBackdrop`,
`starStyle.glow`, `NEON_TEXT`) : le cyan ne paraît pas électrique parce qu'il est saturé, mais
parce qu'il **brille** sur du bleu nuit. D'où `--shadow-request`, un halo en `color-mix` sur le
token — une seule source de vérité, déplacer la couleur déplace sa lueur.

### Un libellé accessible en matche un autre : `getByRole` trouve deux boutons

Dans le panneau de notion, le bouton d'activité (« Voir le cours ») et son bouton de demande
(« Demander Voir le cours à ZETIS ») contiennent le même texte. `getByRole("button", { name:
/Voir le cours/ })` lève « found multiple elements ». Ancrer la regex en début de libellé
(`^Voir le cours`) — c'est ce que fait le helper `activite()` de `MatiereDetailPage.test.tsx`.

## Chantier `feat/page-matiere` — index de notions, slice B — 2026-08-01

### `normalizeSearch` change la LONGUEUR de la chaîne : on ne peut pas surligner avec ses index

`normalizeSearch` (`packages/ui/.../galaxyGraph.ts:85`) fait `NFD` puis supprime les
diacritiques. « è » devient « e » + accent combinant, puis « e » : la chaîne pliée n'a plus la
même longueur que l'originale, et un index trouvé dedans **ne désigne pas le bon caractère**.

La galaxie ne s'en apercevait pas : elle ALLUME des étoiles, elle n'a rien à surligner. Dès
qu'on veut un `<mark>`, le décalage apparaît — **d'un cran par accent**, donc précisément sur
les mots que Massimo tape sans accent.

Parade : plier **point de code par point de code** en tenant une carte d'offsets
(`lib/searchFold.ts`). `for…of` sur la chaîne et non un index numérique : un caractère hors BMP
compte pour 2 unités UTF-16 et couperait le pli en deux.

⚠️ Le **filtre** et le **surlignage** doivent partager le même pli. Le pli global et le pli par
caractère peuvent diverger (réordonnancement canonique, sigma final grec) : si le filtre
utilisait `normalizeSearch` et le surlignage `fold`, une notion pourrait apparaître dans les
résultats **sans être surlignée**. Un test-verrou compare les deux sur un corpus accentué.

### `staticImports` du moteur de budget prend `export const X = "from"` pour un import

Sa regex est `/(?:^|\n)\s*(?:import|export)[^;\n]*?from\s*["']([^"']+)["']/g`. Sur

```ts
export const SUBJECT_BACK_PARAM = "from";
```

elle matche `export … from "` et capture tout jusqu'au guillemet suivant — souvent une
apostrophe dans un commentaire français, d'où des captures absurdes.

**Ne pas corriger le moteur** : il est partagé, et le modifier changerait le comportement du
budget de l'Accueil (dont le vert est la preuve que l'extraction était neutre). Vérifier
autrement, comme le fait `matiere.bundle.test.ts` pour la pureté de `notionRoutes.ts`.

### `NotionActionPanel` ne tire PAS three.js — le prompt de slice l'affirmait à tort

Chaîne tracée : le baril `@zetis/ui/galaxy` ré-exporte 8 modules, **zéro occurrence de `three`**
dans leur fermeture transitive. Three vit derrière `@zetis/ui/galaxy/canvas` (sous-chemin dédié)
et `brainGeometry.ts`, **tous deux hors baril** — et le baril le documente explicitement.

Conséquence : `normalizeSearch` et `starStyle` s'importent depuis `@zetis/ui/galaxy` sans coût
3D. Le baril reste léger en three.js, **pas en octets** (il traîne `GalaxyFallbackList`,
`constellationLayout`, `replayLayout`…). Si le poids gêne un jour, la sortie propre est un
sous-chemin `@zetis/ui/galaxy/search` — jamais une recopie de `normalizeSearch`.

### Le rétrolien d'ELI5 était annoncé bloquant : il ne l'est pas

`/eli5?skill_id=` porte une notion, et ni l'URL ni la réponse serveur ne gardent le slug de
matière. Mais les deux nettoyages d'URL de la page **ne suppriment que leurs propres clés** :
`Eli5Page.tsx` retire `skill_id`+`name`, `useEli5Page.ts` retire `subject`, et tous deux
reconstruisent depuis `new URLSearchParams(searchParams)`.

Un paramètre tiers survit donc aux deux. `?from=` était libre (l'app ne lisait que `name`,
`skill`, `skill_id`, `subject`). **Pas `?subject=`** : il est déjà lu sur `/eli5` et
`/revision`, où il DÉCLENCHE une action — le réutiliser ferait d'un retour un lancement.

### Modèles : deux noms de colonnes qui ne sont pas ceux qu'on suppose

Ils échouent en `TypeError` à la construction, pas en erreur SQL :
`SpacedReviewCard` → **`front_markdown` / `back_markdown`** (statut actif : `scheduled`) ;
`Capsule` → **`subject_id` requis** en plus de `skill_id`.

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
