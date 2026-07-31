# CHANGELOG.md — Historique ZETIS

## 0.34.0 — La galaxie devient un système solaire

Date : 2026-07-31 · branche `feat/accueil-vivant` · addendum ADR-0024 §C (révisé)

> Servir tout le graphe d'un coup à une simulation de forces produisait un **amas** : le cœur
> à moitié enseveli sous les sphères, des libellés qui se chevauchent, aucune lecture possible.

- **`/galaxy` s'ouvre sur un système solaire** : le **cerveau de Massimo au centre** (deux lobes
  à circonvolutions, générés par le code, aplatis) et les **matières seules**, chacune **posée**
  sur une orbite dessinée, dans un plan aplati vu en surplomb à ~35°.
- **Un placement calculé, pas un équilibre** : un moteur de forces cherche une position stable,
  pas une composition. `orbitLayout` (brique partagée, pure et **déterministe**) pose les orbites ;
  l'ordre reste celui du programme, **jamais un classement**.
- **Les matières encore VIDES ont aussi leur planète.** `galaxy/all` les exclut volontairement —
  ce raisonnement valait pour un graphe dense ; dans un système solaire il s'inverse : une
  matière absente se lirait comme une matière **qui n'existe pas**, une planète éteinte se lit
  comme **« pas encore »**. Le clic reste honnête (« 🌱 Les étoiles de cette matière arrivent
  bientôt »).
- **Rien n'est perdu** : les notions restent atteignables en entrant dans une constellation —
  elles cessent seulement d'être servies toutes en même temps. **Contrat serveur inchangé.**
- Effet de bord heureux : ~10 planètes au lieu de 60 nœuds, le **plafond adaptatif ne mord plus**
  sur cet écran (la dette ADR-0024 §6 subsiste pour les constellations).

La rotation lente était déjà acquise (`controls.autoRotate`, coupée par `prefers-reduced-motion`).
649 tests backend + 220 Massimo, `tsc -b` et build verts.

## 0.33.0 — Revoir sa galaxie grandir

Date : 2026-07-31 · branche `feat/accueil-vivant` · ADR-0029

> « Mon ciel » et « Mon chemin » disent *combien*, jamais *comment c'est arrivé*. Le rejeu animé
> montre la galaxie s'allumer étoile par étoile, du premier jour à aujourd'hui.

- **« Revoir ma galaxie grandir »** depuis « Mon ciel » : une modale plein écran qui rejoue la
  galaxie en 3D. Bouton Lecture / Rejouer, et **la frise devient la barre de lecture** — Massimo
  peut la tirer pour revenir en arrière.
- **`?with_skills=true` sur `/api/student/galaxy/timeline`** : le même calcul cessait simplement
  de renvoyer le `skill_id` qu'il produisait déjà. **Aucune table, aucune migration, aucune
  requête de plus.** Opt-in strict : sans le paramètre, la clé est **absente** — la frise ne voit
  aucun changement de charge utile, et un test le verrouille.
- **DOUBLE `lazy()`** : la modale l'est, et elle seule charge le canvas, également en `lazy()`.
  C'est ce qui garde l'Accueil à **zéro Three.js au premier paint** — vérifié en vrai : aucun
  chunk 3D avant le clic, canvas monté après.
- **Deux états seulement** — pas encore née, allumée. L'état de maîtrise passé existe
  (`skill_mastery_history`) mais il **régresse** : un rejeu bâti dessus montrerait des étoiles
  s'éteindre. Dérivé de `learning_events` (append-only), le rejeu ne peut que monter.
- **Aucune date lisible, aucun autoplay, aucune comparaison entre périodes.**
  `prefers-reduced-motion` → état final et curseur manipulable à la main.

649 tests backend + 220 Massimo, `tsc -b` et build verts. Rejeu vérifié dans le navigateur :
curseur 0 → 11 → 22 → 37 étoiles.

## 0.32.0 — Un Accueil vivant, sans cadrage de perte

Date : 2026-07-31 · branche `feat/accueil-vivant` · addendum ADR-0024 « Accueil vivant »

> L'Accueil recomposé le matin même était calme — c'était le but — mais **pauvre** : hors la
> mission du jour, Massimo n'y lisait qu'une semaine de sept cases. La demande était une page
> plus vivante, avec la **heatmap de Papa** en référence. Elle est **refusée par écrit**, et
> remplacée par la même idée retournée.

- **La heatmap est refusée, avec ses trois murs indépendants** : sa route a été supprimée
  (ADR-0028) et vit dans un agrégat `require_parent` ; `CLAUDE.md` interdit le « décompte de
  jours manqués, sous quelque forme que ce soit », et les cases vides d'une grille **sont** ce
  décompte ; `WeekDots.test.tsx:32` le verrouille par un test. Écrit dans l'ADR pour ne pas être
  redemandé dans six mois.
- **« Mon ciel » — la heatmap retournée** : une case par jour où Massimo a gagné du XP, sur un
  **calendrier** (semaines en colonnes, jours en lignes, comme chez Papa) — mais **aucune case
  vide n'est dessinée** : un jour sans gain n'a **aucun élément dans le DOM**. Chez Papa la case
  grise *est* l'information d'absence et elle y est légitime (c'est du pilotage) ; ici l'absence
  n'existe ni dans les données ni dans le rendu. Intensité ∝ XP du jour, rampe indigo → cyan →
  blanc, libellés de mois posés seulement s'ils ne se chevauchent pas,
  `prefers-reduced-motion` respecté. La grille démarre au **premier jour d'activité**.
  > La première version posait les jours en **constellation libre**, sans repère temporel. Ce qui
  > manquait n'était pas la densité mais le **repère de temps** : l'interdit est reporté de la
  > géométrie vers le **rendu**. Ce que `CLAUDE.md` bannit — un décompte, une iconographie du
  > vide — reste absent ; ce qui est assumé, c'est que l'œil perçoive les intervalles par la
  > position.
- **Brique partagée `buildSparseCalendar`** (`packages/ui`), avec `toLocalIso` et `startOfWeek`
  **remontés depuis la heatmap de Papa** : deux `startOfWeek` dans un même dépôt finiraient par
  diverger sur les bords de semaine. `buildHeatmapGrid` reste chez Papa — c'est lui qui
  reconstruit les jours vides, et cela ne se partage pas.
- **`GET /api/gamification/history` — première route élève d'historique.** Les **jours sans XP
  sont OMIS** du payload, jamais renvoyés à zéro : le garde-fou est dans le **contrat**, pas dans
  l'UI, donc aucun client futur ne pourra dessiner une case vide sans avoir lu l'ADR. Aucune
  minute, aucune session, aucun `event_type` — on ne chronomètre pas l'enfant. Regroupement en
  **Europe/Paris**, le défaut exact qui avait été relevé sur le streak retiré. Fenêtre bornée
  serveur. **Aucune migration.**
- **« Tes derniers gains », à coût nul** : `recent` et `badges` étaient déjà servis par
  `/api/gamification/summary` — que le bandeau XP appelle **déjà sur cette page** — et n'étaient
  **rendus nulle part**. Aucune requête ajoutée. Le mapping des `reason` passe de **3 à 8** : il
  ne couvrait qu'un tiers des valeurs, sans conséquence tant que rien ne les affichait.
- **La frise revient sur l'Accueil.** Elle en était partie le matin même, emportée par
  association avec le canvas 3D — le coût à annuler était **Three.js**, pas quelques lignes de
  SVG. Le motif tient : le test de budget de bundle reste vert, aucun moteur 3D ne revient.
- **Les pastilles de matières portent leur compte.** Un **compte**, jamais un pourcentage ;
  l'ordre reste celui du programme — trier par étoiles en ferait un palmarès.

**Test-verrou de la slice** : le ciel ne rend **aucun élément** pour un jour sans activité — le
pendant, sur la nouvelle surface, de l'invariant `WeekDots`. Aucune date n'est affichée nulle
part : une date rendrait le temps lisible, et les intervalles vides avec lui.

646 tests backend + 206 Massimo, `tsc -b` et build verts.

## 0.31.0 — La Galaxy prend sa route, l'Accueil cesse de payer la 3D

Date : 2026-07-31 · branche `feat/accueil-galaxy` · addendum ADR-0024

> Trois jours après la livraison de la Galaxy, deux décisions du même ADR sont rouvertes. L'URL
> et le libellé décrivaient encore l'ancien contenu, et l'aperçu 3D posé sur l'Accueil le
> 2026-07-28 s'était installé au mauvais endroit : la page la plus visitée, la première peinte au
> réveil de l'app, chargeait **1,37 Mo (368 Ko gzip)** pour une vue contemplative dont aucun
> élément n'est la prochaine action de Massimo. Le coût est **annulé, pas atténué**.

- **`/progression` devient `/galaxy`** — un **renommage**, pas un ajout : `/progression` ne
  survit qu'en **redirection permanente**, jamais en page. Libellé de sidebar « **Ma Galaxie** »
  🌌 **à la même position** ; le nombre d'entrées ne bouge pas (l'ADR-0024 §1 interdit une 6ᵉ).
  Bandeau XP, page Matières et panneau d'actions repointés. `ProgressionPage.tsx` est renommé
  `GalaxyPage.tsx` (`git mv` — l'historique suit).
- **L'Accueil ne charge plus Three.js**, ni directement ni transitivement. Le canvas 3D et la
  frise **quittent la page** au profit d'une **carte-bouton statique** : un **compte** d'étoiles
  allumées et des pastilles de matières en CSS pur, la carte entière cliquable vers `/galaxy`.
- **Un test de budget de bundle** constate la sortie du moteur 3D. ⚠️ Il vérifie les `import()`
  **autant que** les imports statiques : le canvas était **déjà** code-splitté le 2026-07-28 — ce
  qui coûtait, c'était le **montage**. Un test qui n'aurait regardé que les imports synchrones
  n'aurait pas attrapé la régression qu'il est censé prévenir. Contre-épreuve incluse.
- **Le graphe global change d'adresse, il n'est pas supprimé** : `GET /api/student/galaxy/all`
  alimente désormais la **vue par défaut de `/galaxy`** — la galaxie complète, toutes matières.
  Clic sur une matière → sa constellation. Les **planètes CSS cessent d'être un écran** : elles
  deviennent l'**état d'attente** du chunk 3D et le **repli sans WebGL**. La frise suit le graphe.
- **Accueil recomposé** : salutation + message ZETIS verbatim, mission du jour (**seule action
  accentuée** de la page), « Ma semaine » et « Ma Galaxie » côte à côte, trois raccourcis, et un
  **slot** pour le héros ZETIS — structuré mais **non rendu** tant que le chat n'existe pas ici,
  pour que le Groupe 1 (ADR-0026) le remplisse sans rouvrir la composition.
- **Continuité de télémétrie côté Papa** : `lib/routeLabels.ts` traduit enfin les routes en mots
  (« Navigation · Ma Galaxie » au lieu de « Navigation · /eli5 »), et rend **le même libellé**
  pour `/progression` et `/galaxy`. `learning_events` est append-only : sans cela, trois jours de
  fréquentation réelle seraient devenus une page distincte, pour toujours.
- **Zéro backend, zéro migration** : aucune route API créée, renommée ni supprimée.

**Écarts assumés** (documentés dans `TROUBLESHOOTING.md`) : le **bandeau Agenda reste** sur
l'Accueil — la spec et la maquette ne le montraient pas, mais c'est le seul accès à `/agenda` en
phase 0 ; et le raccourci **Capsule** affiche un **compte de nouveautés** et non « la capsule
recommandée avec sa durée », qu'aucune route ne sert.

## 0.30.0 — Connexion : une intro de marque, puis la porte de chacun

Date : 2026-07-30, mergée le 2026-07-31 · branche `feat/login-intro-avatars`

> Renumérotée de 0.29.0 à 0.30.0 : ce chantier et le Dashboard Papa v2 avançaient en parallèle et
> revendiquaient tous deux 0.29.0. Le dashboard ayant été mergé en premier, il garde le numéro ;
> deux chantiers distincts ne peuvent pas porter la même version.

> La page de connexion faisait trois choses à la fois : jouer l'animation ZETIS dans une demi-colonne,
> proposer un choix de profil que l'app ne pouvait pas honorer, et connecter. On sépare les moments :
> **la marque d'abord, l'identité ensuite**.

- **Intro de marque plein écran (`BrandIntro`, `packages/auth`)** : l'animation `zetis-logo.mp4` sort
  de la colonne et prend tout l'écran, fondu vers le wordmark puis fondu de sortie qui révèle le login
  déjà monté derrière. **Jouée une fois par session et par espace** (`sessionStorage`, cloisonné par
  origine) — pas de rejeu après une erreur de mot de passe ou un retour sur `/login`.
- **Coupable à tout moment** : clic, n'importe quelle touche, ou bouton « Passer ». `prefers-reduced-motion`
  la saute d'office.
- **L'intro ne peut jamais empêcher de se connecter** : autoplay refusé, onglet en arrière-plan, mp4
  absent ou vidéo bloquée → repli sur le poster puis sortie (garde-fou 8 s). Le double `play()` du
  StrictMode en dev (AbortError) est neutralisé.
- **Une page de connexion par profil** : `/login` de Papa affiche **l'avatar de Papa**, celle de Massimo
  **l'avatar de Massimo**, en héros — avec le nom, l'espace et une accroche propre au rôle. Les deux
  espaces restent sur **deux ports distincts** (Massimo 5173, Papa 5174).
- **Retrait du sélecteur croisé** : l'auth étant par app, la tuile « autre profil » n'était qu'un lien
  vers l'autre port. Les variables `VITE_MASSIMO_URL` / `VITE_PAPA_URL` disparaissent (wrappers
  `LoginPage` et `infra/docker/frontend.Dockerfile`).
- **Correctifs d'affichage** : le masque radial du wordmark est resserré (plus de bord rectangulaire
  visible sur le fond noir) ; « Se souvenir de moi » et « Mot de passe oublié ? » ne se chevauchent
  plus à 375 px.
- **Vérifié** : 7 tests `@zetis/auth` (dont 4 sur le portail d'intro) · 182 Massimo · 231 Papa,
  `tsc -b` + `vite build` verts ; **connexion live jouée de bout en bout sur les deux ports**
  (mauvais mot de passe → message, puis `papa` et `massimo` → leurs dashboards), rendu contrôlé en
  1280 px et 375 px, zéro erreur console. Aucun changement backend, aucune migration.

## 0.29.1 — La boucle de révision peut enfin se refermer

Date : 2026-07-31 · amendement `ADR-0017 §5bis` · branche `feat/dashboard-papa-v2`

> Parti d'un symptôme du dashboard — « 1 notion à renforcer sans mission active » à côté d'une carte
> qui ne proposait rien — l'enquête a trouvé un défaut de fond du moteur de missions.

- **Le relais désigné par la doctrine était inopérant.** `adr-0017 §5bis` promet qu'après un verdict
  « à revoir » la notion **revient d'elle-même** par le SRS. Or le template `revision` composait
  `[carte] → [quiz] → relire` **sans étape de réexplication**, alors que le verdict l'exige — et
  `eli5` est une étape de *consultation* qui n'émet aucune trace de réexplication. Une mission de
  révision rendait donc **toujours** « à revoir » : la lacune restait ouverte à vie. La
  contradiction était figée par un test qui asserait « pas de verbalisation ».
- **Et elle abîmait la mesure à chaque passage** : sans réexplication mesurée, le verdict écrivait
  `mastery_score = 0`. Massimo faisait sa révision, sa maîtrise s'effondrait, et la carte revenait
  le lendemain (intervalle du score 0). Désormais, **une absence de mesure n'est plus un zéro** :
  on n'écrit que ce qu'on a mesuré, et l'intervalle se calcule sur la maîtrise connue. Filet qui
  couvre aussi les parcours édités par Papa sans étape vocale.
- **Le générateur de remédiation n'est pas élargi** aux lacunes `in_progress` : la doctrine
  désignait le SRS, elle tient — il fallait le réparer, pas le contourner. Bump
  `MISSION_SCORING_VERSION` v3 → v4 (le versionnage couvre les templates de parcours).
- **`/lacunes` devient la surface de décision qu'elle prétendait être** : la page était un mock
  inerte alors que le dashboard y renvoyait. Elle sépare maintenant ce qui appelle une
  consolidation (notion jamais travaillée) de ce qui revient par la révision, et n'utilise que les
  deux générateurs existants — aucune route nouvelle.
- **Deux surfaces qui se contredisaient, réconciliées** : le KPI « lacunes sans mission » ne
  regardait que les missions de *remédiation*, si bien qu'une notion déjà couverte par une mission
  commandée par Papa était annoncée « sans mission active ». Définition unique et partagée
  désormais — n'importe quelle mission active répond à la question « reste-t-il un geste à faire ? ».
- **Le mode focus fait enfin ce qu'il annonce.** La page promettait que « ZETIS priorisera les
  missions, capsules et révisions sur cette notion jusqu'à sa consolidation » ; son bouton
  n'écrivait qu'un état local, et **aucun état « focus » n'existe côté backend**. Elle s'appuie
  maintenant sur le seul levier réel — `Mission.force_priority`, le plancher de score du sélecteur
  (ADR-0018) — via la route Commander déjà en place. La promesse est réécrite pour dire exactement
  ce que le moteur fait : *« sa mission passera devant les autres »*, ni plus ni moins.
- Les entrées mortes de `data/mock.ts` (`Gap`, `GAPS`) disparaissent : plus aucun consommateur. Leur
  vocabulaire de façade (« forte », « en cours ») ne correspondait de toute façon à aucune valeur du
  backend (`high`, `in_progress`) — le mock ne pouvait pas être branché tel quel.

## 0.29.0 — Dashboard Papa : un cockpit, pas un bulletin

Date : 2026-07-31 · ADR-0028 · branche `feat/dashboard-papa-v2`

> La maquette historique du dashboard contredisait **sept décisions déjà prises**. Elle est
> remplacée par une page qui répond à trois questions dans l'ordre : *qu'est-ce qui attend une
> décision de moi ?*, *où en est Massimo ?*, *qu'est-ce que ZETIS propose ?*

- **Un agrégat unique, zéro requête au filtrage (§1, §2)** : `GET /api/parent/dashboard` renvoie les
  **trois fenêtres** (7/30/90) **non filtrées**, séries livrées **par matière** — « toutes matières »
  est une somme que le client calcule. Changer de période, de matière ou de focus ne touche plus le
  réseau. Vérifié dans l'onglet Réseau : cinq gestes, dix requêtes avant, dix après.
- **Les KPI deviennent des contrôles (§5)** : cliquer un KPI conserve les cartes qui **répondent à
  cette question** et atténue les autres. Ce n'est pas décoratif — c'est la carte de dépendance
  entre une mesure et ses preuves, et c'est ce qui rend huit diagrammes praticables sur une page.
- **L'XP quitte le pilotage parent** : un KPI de Papa doit être décisionnel. L'XP reste le levier
  de Massimo, sur Progression. Partent avec lui : « sessions », « missions terminées », le
  « taux de réussite » global, le radar de compétences (aucune source dans le modèle) et le
  panneau Obsidian.
- **Une seule carte heatmap, deux vues** : *Calendrier* (est-ce régulier ?) et *Créneaux* (quand
  travaille-t-il ?), **échelle émeraude unique — pas de gradient vers le rouge**. Une case dense
  n'est pas une bonne note, une case vide n'est pas une faute.
- **Historique de maîtrise (§3 ter, migration `a9b8c7d6e5f4`)** : `skill_mastery` n'écrivait que
  l'état courant, rendant la courbe des régressions impossible à tracer. La table
  `skill_mastery_history` la rend calculable — et donnera au Conseil de classe la notion de
  régression qui lui manque.
- **Read-before-code : deux vérifications sur quatre sont tombées**, plus six écarts non anticipés.
  « Consolidée » avait **déjà** une définition serveur, différente de celle de l'ADR ; « fragile »
  n'en avait **aucune** — les deux sont désormais figées sur les **six** statuts réels.
  `GET /api/parent/dashboard` **existait déjà** (réécriture cassante), les quiz **ne peuvent pas**
  entrer dans la file de validation (pas de `validation_status`, doctrine ADR-0014), et
  `/activity/heatmap` **n'avait aucun consommateur** hors du dashboard → supprimée.
- **Deux contradictions que seul le rendu réel a révélées** : le donut totalisait 42 min à côté
  d'un KPI annonçant 7 h 05 (le temps sans matière — connexion, navigation, chat — n'était compté
  nulle part) ; et le KPI des lacunes portait le même libellé que le segment « fragiles » des
  cartes voisines, affichant « 1 » à côté de « 9 » pour deux mesures différentes.
- **Zéro dépendance ajoutée** : ni react-query, ni lib de graphes. Les huit diagrammes sont en SVG
  inline et CSS Grid. Deux briques rejoignent `@zetis/ui` : `Sparkline` et `subjectColorFor`.
- **Mission proposée, sans qu'un affichage n'écrive (§10)** : la carte compose son parcours **en
  lecture** via le moteur de missions (patron preview/confirm, ADR-0010) et la confirmation appelle
  la route de création **déjà en place** — aucune surface d'écriture ajoutée. Prévisualisation et
  création voient les mêmes lacunes, sinon la carte proposerait une notion que le bouton ne
  créerait pas.
- **Hors v1, assumé** : le bandeau de fraîcheur du Conseil de classe.

## 0.28.0 — Chat ZETIS : un compagnon incarné, qui se souvient et qui parle

Date : 2026-07-30 · ADR-0026 · branche `feat/chat-memoire`

> ZETIS devient un compagnon. Il se souvient de ce que Massimo **travaille** — jamais de ses
> **mots** — et, désormais, il l'écoute et lui répond à voix haute. Toute la voix reste **locale** :
> celle de l'enfant ne quitte jamais la machine.

- **Mémoire éphémère par construction (backend, §1)** : le verbatim de conversation vit dans **Redis**
  (TTL glissant, purge à la clôture), **jamais** en PostgreSQL/MinIO. Le pipeline est **aveugle au
  contenu** : un tour ne trace qu'un `ai_jobs` de métadonnées, jamais un message. La question « le
  journal de chat est-il lisible par Papa ? » se dissout — **il n'y a pas de journal**.
- **Le chat n'a pas de mémoire propre, il écrit dans le journal commun** : trois `learning_events`
  exactement (`chat_topic`, `chat_tool_response`, `chat_difficulty_declared`), non probants, **zéro
  XP**. Premier producteur de `Gap.source=ai_observation` — **signal faible** (`severity=low`,
  corroboration par la maîtrise, jamais d'escalade).
- **Résolution notion partagée** : `ai/skill_resolution.py` (texte libre → `skill_id` par embeddings),
  promue de différé ELI5 à **prérequis** — ELI5 en héritera.
- **Page Massimo `/chat` — avatar vivant** : brique partagée **`@zetis/ui/avatar`** (rig canvas —
  paupières, iris or, mâchoire, onde spectrale, horloges indépendantes), machine à états
  repos/écoute/réflexion/parole, sous-titres karaoké, phrase de transparence fixe (« ZETIS retient
  les notions que tu travailles, pas tes mots »), quota doux.
- **Voix complète, 100 % locale (Lot 2)** : entrée **micro appui-pour-parler** transcrite par
  **Whisper local** (réutilise la dictée ELI5) ; sortie **voix Piper** via `POST /api/student/chat/tts`
  (audio éphémère, jamais persisté). La **bouche de l'avatar est pilotée par le vrai audio** (un
  `AnalyserNode` remplace la pseudo-phonétique — le contrat de flux d'articulation était fait pour ça).
  Aucune API vocale du navigateur (la voix de l'enfant reste local-first). Repli propre vers le
  karaoké muet si le moteur manque.
- **Vérifié** : 577 tests backend · 175 Massimo, `tsc -b` + `vite build` verts ; voix serveur **prouvée
  en live** (Piper, WAV réel). Zéro table, zéro migration.
- Reportés (chantier chat) : streaming SSE, karaoké aux bornes de mots réelles, migration Rive de
  l'avatar. Le **routage/orchestration** (« montre mes fiches sur X ») est **cadré** par l'ADR-0027.

## 0.27.0 — Agenda scolaire : ZETIS apprend ce que le collège demande

Date : 2026-07-29 · ADR-0025 · branche `feat/agenda-scolaire`

> Tout ce que ZETIS savait planifier, il l'avait inventé lui-même. L'agenda est sa première
> source **exogène** : les dates viennent du collège, jamais de ZETIS — et ce qui est
> déclaratif le reste, sans jamais devenir une preuve.

- **Backend** : table `agenda_items` (migration `a1b2c3d4e5f7`) + module `agenda`. Deux
  routeurs, deux schémas jamais mélangés (`/api/student/agenda` et `/api/agenda`). Co-édition
  sous quatre règles serveur : seul Massimo coche (403 explicite côté Papa), corrections
  marquées (`edited_by_parent_at` posé par le service), archivage jamais suppression, doublons
  tolérés. Traçabilité **non probante** : deux `learning_events`, pas d'`agenda_item_missed`
  (« l'absence n'est pas un événement »), zéro XP, zéro effet sur l'évidence (test-verrou).
- **Étanchéité des projections** : trois lecteurs de `learning_events` ne filtraient pas par
  `event_type` (heatmap/minutes/sessions, décrochage, jours de venue) — sans garde, cocher un
  devoir aurait compté comme du travail. Frozenset `NON_ACTIVITY_EVENTS` appliqué aux trois.
- **Page Papa `/agenda`** : saisie **en lot** (matière · chapitre du référentiel · intitulé ·
  date · type, un seul envoi), charge de la semaine en 7 colonnes, panneau de détail, note
  privée jamais servie à Massimo, archivage sous ConfirmDialog, filtres. **Aucune case à
  cocher, nulle part** — et l'UI énonce les trois refus. Interrupteur d'ouverture de la saisie
  élève **persisté en base** (table `app_settings`, migration `b2c3d4e5f8a0`) : la bascule est
  un geste de Papa, jamais un seuil calculé.
- **Page Massimo `/agenda`** : bande **glissante** 14 jours (3 passés / aujourd'hui / 10 à
  venir — tout l'horizon va vers l'avant), traces positives sans réceptacle vide, sections
  Aujourd'hui / Demain / la suite / Ce qui arrive / À reprendre (3 max, sans compteur), coche
  optimiste **sans XP ni célébration**. Entrée de sidebar en position 2 + résumé sur l'Accueil
  au-dessus du canvas Galaxy. Phase 0 : ni composer, ni bouton grisé — l'ouverture de la
  saisie sera un événement positif, pas la fin d'une privation affichée.
- **Vérifié à l'écran de bout en bout** : saisie Papa → apparition chez Massimo (« ajouté par
  papa » en émeraude) → coche persistée → « cochés par Massimo : 1 » côté Papa. 560 tests
  backend · 224 Papa · 167 Massimo.
- Hors périmètre tenu : composer élève (Lot 1 bis, derrière le verrou), plan de préparation et
  analyse par chapitre (Lot 3), bottom bar mobile (arbitrage ouvert).

## 0.26.0 — ZETIS Galaxy : la progression de Massimo devient une galaxie

Date : 2026-07-28

> La page Progression affichait des pourcentages **mockés** « par matière ». Elle affiche
> désormais le vrai graphe des connaissances — et l'or n'y est pas un décor : il ne coule que
> vers ce que Massimo a réellement travaillé.

### Ajouté

- **Module backend `galaxy`** (ADR-0024) : 4 routes ÉLÈVE — vue d'ensemble, graphe global,
  constellation d'une matière, panneau d'actions d'une notion — plus la frise de progression.
  **Aucune table, aucune migration** : tout se dérive de l'existant via
  `evidence.mastery_by_skill()` (6ᵉ consommateur du substrat, ADR-0011 §1).
- **Page `/progression` = la galaxie** : canvas 3D (`react-force-graph-3d` en `lazy()`), soleil
  de matière, amas par chapitre, étoiles par notion, drag élastique, rotation orbitale.
  La section « par matière » **mockée** disparaît — c'était sa donnée qui manquait.
- **Panneau d'actions par notion** : toute la panoplie ZETIS (cours · ELI5 · fiche · capsule ·
  mindmap · révision · quiz), l'indisponible **grisé et non cliquable**.
- **KPI d'états cliquables** : les 5 états portent leur compte et filtrent la constellation ;
  ce qui n'est pas concerné est **atténué, jamais masqué**.
- **Recherche de notion** : locale, insensible à la casse **et aux accents**, cadre toutes les
  correspondances d'un coup ; message transitoire quand rien ne correspond.
- **Aperçu sur l'Accueil** : graphe global en deux colonnes, badges matières cliquables, frise
  de progression, plein écran **dans la page** (sidebar et bandeau préservés).
- **Frise de progression MONOTONE** : dérivée de `learning_events` (append-only) et non de
  `SkillMastery`, qui peut régresser — la courbe ne peut donc que monter.

### Modifié

- **ADR-0024 amendé trois fois en cours de chantier**, chaque fois par décision explicite :
  le graphe global sur l'Accueil (§9 rouvert), la panoplie complète avec grisé (§4 révisé),
  et le revirement 2D → 3D acté avec son coût.
- `MassimoBannerHeader` : le niveau/XP devient un lien vers la galaxie.

### Pièges rencontrés (documentés dans la spec)

- **`SkillMastery.status` a SIX valeurs**, pas cinq : `in_progress` ne sort d'aucun
  `_status_from_score()` et serait manqué en silence par un mapping à 5 branches.
- **Le `lazy()` ne suffit pas** : ré-exporter le canvas depuis le baril `@zetis/ui/galaxy`
  faisait entrer Three.js dans le bundle de départ (3,6 Mo). D'où le sous-chemin
  `@zetis/ui/galaxy/canvas`.
- **Un matériau très émissif aplatit une sphère** (plus d'ombrage, plus de reflet) — vrai pour
  le soleil comme pour le cerveau.
- **Sans nœud racine, les composantes se disloquent** ; et la remontée de l'or doit être
  **transitive**, sinon elle s'arrête aux matières dans le graphe global.
- **Tailwind v4 met `cursor: default` sur les `<button>`** : `cursor-pointer` est désormais
  explicite là où l'interactivité doit se voir.

### Dépendances

`react-force-graph-3d` 1.29.1, `three-spritetext` 1.10.0, `three` 0.185.1 (peer de
`three-spritetext`, déclarée explicitement) + `@types/three` en dev. Trois épinglées à la
version exacte, convention ADR-0016. Chunk 3D isolé : 1,39 Mo, chargé à l'ouverture d'une
galaxie seulement.


## 0.25.0 — Couverture de production : voir le stock, et pouvoir agir dessus

Date : 2026-07-28

> Cinq pages de pilotage donnaient cinq vues partielles du même objet. Cette page en est
> l'**union** — et elle assume de dire des choses inconfortables : ce qui dort sans être relu,
> ce qui atteint Massimo dans une version obsolète, ce qui est passé sans que personne l'ouvre.

### Ajouté

- **Page Papa « Couverture de production »** (`/couverture`) : matrice une-ligne-par-leçon,
  colonnes Cours · Quiz · Fiche · Mindmap (leçon-centrées) + Cartes · Capsules (notion-centrées,
  fond distinct). KPI, bandeaux d'anomalie, filtres client, encart orphelins, 4 notes de lecture.
- **Module backend `production`** : `GET /api/production/coverage` et `/orphans`, `require_parent`,
  lecture seule. Une requête agrégée par matière — vérifié sur Postgres réel (69 leçons,
  18 requêtes, 79 ms).
- **Fraîcheur des dérivés** (addendum ADR-0011 §E) : `is_stale` en fonction pure dans le module
  neutre `canonical_context`, appuyée sur `lessons.content_updated_at` — colonne préexistante,
  bougée par les deux seuls écrivains de `content_markdown`. Un renommage ne périme rien.
- **Provenance de la validation** (addendum ADR-0011 §F) : `validated_at` / `validated_by`
  (`parent` | `parent_bulk` | `system`) sur `fiches`, `mindmaps`, `capsules`, `chapters`,
  `lessons` **et `quizzes`** — migration `d5e6f7a8b9c0`, reprise `NULL` (aucune rétro-attribution).
  Module `provenance` = unique point d'écriture ; nuancier visible sur chaque ✓ de la matrice.
- **Invariants de lecture des dérivés** : module neutre `engagement` + exception « mission
  engagée » sur les chemins d'achèvement des mindmaps. Le gate porte sur la découverte, jamais
  sur l'achèvement d'un parcours engagé.
- **Validation en lot des leçons d'un chapitre** : `POST /api/chapters/{id}/lessons/validate-all`
  + bouton dans l'en-tête de chapitre de la Couverture (provenance `parent_bulk`).
- **Liens ciblés** : chaque cellule renseignée ouvre SON objet sur sa page de pilotage
  (`?subject=&focus=`), avec défilement + surlignage ; le quiz et la mindmap ouvrent directement
  leur modale. Le badge « À valider → » d'une leçon en brouillon mène à Programme, chapitre
  déplié et ligne surlignée. Une notion « ✓ couverte » ouvre ses cartes, aperçu déplié.
- **Génération depuis la matrice** : `+` sur une cellule absente ; détail par notion sur les
  fractions (cartes en un clic ; capsules via le compositeur pré-rempli — l'instruction reste
  à Papa, l'API l'exige).
- **Sidebar Papa** : entrée « Couverture » en tête du groupe production + séparateurs de groupe.
  Aucune entrée existante déplacée. Carte d'alerte au Dashboard (masquée si tout est à zéro).

### Corrigé

- **`fiches` / `mindmaps` : horodatages sans défaut serveur** (migration `e6f7a8b9c0d1`).
  `created_at`/`updated_at` étaient nullable sans `DEFAULT now()`, contrairement à `quizzes` et
  `capsules` — le `TimestampMixin` n'avait jamais été suivi par leur migration de création. Une
  fiche naissait donc à `NULL`, la matrice la lisait « absente », et chaque clic empilait un
  doublon. Colonnes alignées + reprise, et `absent` se déduit désormais de **l'existence de la
  ligne**, jamais d'une date.
- **Capsules non rattachées à une notion** : le compositeur n'envoyait jamais `skill_id`, si
  bien qu'une capsule créée depuis la page Capsules IA ne pouvait compter dans aucune fraction.
- **`.claude/launch.json`** : les configs `backend-dev`/`backend-dev2` lançaient `uvicorn` sans
  `--reload` — le serveur servait un code antérieur sans le dire (404 sur des routes existantes).


## 0.24.0 — Auto-motivation de Massimo : régularité douce, engagement choisi, ZETIS qui se souvient

Date : 2026-07-28

> « ZETIS doit avoir une main de fer dans un gant de velours. » Le principe *« un enfant
> chronométré travaille pour le chronomètre »* est **amendé partiellement** : il reste vrai pour
> le TEMPS (aucune minute, aucune session, aucun calendrier chez Massimo — ça reste du pilotage
> Papa), il est levé pour l'EFFORT. La main de fer, c'est que ZETIS revienne vers l'enfant avec
> quelque chose de **vrai** à dire ; le velours, c'est que **rien ne casse jamais**.

### Ajouté

- **Module backend `motivation`** (`/api/student/motivation`, `require_child` — Papa reçoit 403
  même en lecture) : `GET`/`PUT /week` (régularité + engagement), `GET /welcome`, `GET /wrap-up`.
- **Régularité douce** : un COMPTE de jours dans la semaine courante, servi en 7 cases toujours
  complètes. Source `learning_events` (jamais `xp_events`), bucketing Europe/Paris — la connexion
  seule coche la journée : « j'étais là et ça n'a pas compté » est l'effet à éviter.
- **Engagement hebdomadaire choisi par l'enfant** (`student_weekly_goals`) : 7 pastilles, un tap
  suffit. La semaine est toujours déduite serveur (ni triche rétroactive, ni reproche sur une
  semaine passée) ; réviser à la baisse est autorisé, sans confirmation ni trace.
- **Messages composés SERVEUR et déterministes** — aucun LLM, aucun aléa : deux appels sur le même
  état rendent la même phrase. Dix codes d'accueil, cinq de clôture ; le client affiche
  `title`/`subtitle` verbatim et n'utilise le `code` que pour choisir une illustration.
- **`skill_mastery.mastered_at` et `gaps.resolved_at`** (migration `f1a2b3c4d5e6`) : sans eux,
  « notions consolidées cette semaine » n'est pas calculable honnêtement.
- **Frontend Massimo** : carte ZETIS et « Ma semaine » sur l'accueil, mot de la fin sur les trois
  écrans de fin de séance (révision, quiz, mission).

### Modifié

- **L'accueil de Massimo ne ment plus.** Il affichait TROIS nombres inventés — dont « Tu as
  consolidé 3 notions cette semaine », une constante codée en dur — et son bouton « Commencer »
  n'avait aucun handler. Tout vient désormais du serveur, ou n'est pas affiché. Le raccourci
  « Révision rapide » affiche `flash_size` (plafonné) et non `total_due` : « 83 cartes en retard »
  sur l'écran d'accueil serait la pression quotidienne anxiogène interdite par CLAUDE.md.
- `QuizEndCard` lit `result.strengths` au lieu de refiltrer sur `score >= 70` — une règle
  pédagogique dupliquée dans un composant de présentation.
- `CLAUDE.md` §gamification : « streak raisonnable » → « régularité douce qui ne peut pas casser »,
  et trois interdits ajoutés (série qui se casse, décompte de jours manqués, objectif imposé).

### Retiré

- **Le streak** (`_compute_streak`, `streak_days`, `active_today`, badge `streak_3` 🔥). Il tombait
  à zéro dès un jour entier manqué et se calculait en UTC. Pris en flagrant délit en vérification
  live : `0` affiché à un enfant venu **deux jours** cette semaine. Frontend basculé AVANT la
  suppression backend, pour qu'aucun écran ne casse entre les deux commits.
- Tuile « Objectifs de la semaine » (Matières) : second nombre inventé **et** doublon sémantique
  de l'engagement — deux « objectifs de la semaine » différents ne pouvaient pas coexister.

### Invariants (testés, pas seulement documentés)

- **Aucune donnée punitive n'est persistable ni servie** : pas de clé `missed`/`failed`/
  `remaining`/`streak`/`best`, pas de colonne d'atteinte sur `student_weekly_goals`.
- **Un jour passé sans activité et un jour à venir sont rendus À L'IDENTIQUE** — mêmes classes,
  même `aria-label` : aucun signe ne désigne les jours manqués.
- **Le nombre de jours d'absence n'apparaît dans aucun texte** ; deux verrous parcourent tous les
  templates (aucun mot d'échec, aucun décompte de jours). La clôture ne dit jamais ce qu'il reste
  à faire pour tenir l'engagement.

### Pièges

- `quizzes/scoring.py` rejoue à chaque quiz : sans non-re-tamponnage de `mastered_at`,
  « consolidées cette semaine » recompterait éternellement les mêmes notions. D'où le helper
  unique `progress/mastery.py`, point de passage des 4 sites d'écriture.
- Le `login` est journalisé AVANT l'appel à l'accueil : l'absence se mesure sur les événements
  **strictement antérieurs à aujourd'hui**, sinon elle vaut toujours 0.
- `gamification` (bas niveau) ne doit pas importer `motivation` (haut niveau) : cycle
  `motivation → memory → gamification`. La composition vit dans le routeur.
- Une prop **optionnelle** a laissé passer un câblage manquant à travers `tsc` ET les tests — vu
  seulement en jouant une vraie séance.

488 tests backend · 111 Massimo · 166 Papa.

## 0.23.0 — Activité : journal `learning_events`, projections Papa, cahier de bord

Date : 2026-07-27

> Papa n'avait aucune vue de ce que Massimo fait réellement dans ZETIS. Le journal d'activité
> existait en table depuis le schéma initial, sans être alimenté ni lu.

### Ajouté

- **Module `activity`** : helper `log_learning_event` (calqué sur `award_xp`), dédupe des
  consultations (1/élève/ressource/jour Paris), projections **pures** (`bucket_days`,
  `build_sessions`, `active_minutes`, `group_reviews`), bucketing Europe/Paris.
- **7 hooks** : login, page_viewed, lesson_viewed, fiche_viewed, quiz_attempted (deux surfaces),
  eli5_requested, review_attempted.
- **`POST /api/telemetry/pageview`** (`require_child`, créé pour l'occasion) : seule écriture
  cliente du journal. Le serveur horodate ; route consécutive identique ignorée.
- **Lectures Papa** : `GET /api/parent/activity/{heatmap,days/{date},sessions}` et
  `GET /api/parent/dashboard` (surface neuve — aucun endpoint dashboard n'existait).
- **Module `progress`** : `GET /api/parent/progress/{gaps,consolidated}`. Les routes `/gaps` et
  `/progress/summary` de la spec produit n'ont **jamais existé** en code.
- **Frontend Papa** : bloc Régularité (heatmap 26 semaines en CSS pur), page Cahier de bord en
  **calendrier mensuel cliquable**, six KPI tous dépliables sur leur détail.
- **Frontend Massimo** : télémétrie de navigation, invisible (aucun compteur à l'écran).
- Migration `d0e1f2a3b4c5` : index `(student_id, created_at)` — la table n'en avait aucun hors PK.

### Modifié

- `subjectIcons` et ses 17 PNG étaient **dupliqués dans les deux apps** : extraits vers
  `@zetis/ui`, les anciens chemins ré-exportent (14 sites d'import inchangés).
- Résolveur « leçon → matière » unifié : il existait en **trois** exemplaires (−88/+12 lignes).
- « Lacune ouverte » existait en **quatre** définitions dupliquées → source unique.

### Décisions

- **Sessions jamais stockées** : reconstruites à la lecture (seuil 15 min). Changer la constante
  recalcule tout l'historique, sans migration.
- **`xp_events` et `learning_events` jamais en UNION** : deux journaux, deux sémantiques.
- **Deux `event_type` préexistants réutilisés** (`reverse_eli5`, `mission_verdict`) au lieu d'être
  dupliqués — les ajouter aurait double-compté ; les renommer aurait cassé leurs lecteurs.
- `POST /api/missions/{id}/complete`, cité par la spec, **n'existe pas** et n'a pas été créé.

## 0.22.0 — Mindmaps : brique canvas partagée + aperçu de fidélité Papa (addendum ADR-0016)

Date : 2026-07-27

> Papa validait une carte mentale **sans la voir** : ni la lisibilité de la disposition, ni la
> faisabilité de *Mémorise*, ni la difficulté de *Reconstruis* ne s'inspectent dans un arbre
> textuel. **Un seul renderer pour les deux interfaces** — ce que Papa valide est, par
> construction, ce que Massimo verra.

### Ajouté

- **Brique partagée `@zetis/ui/mindmap`** : `MindmapWorkspace`, `MindmapNode`, `ModeSegmented`,
  `LayoutSelector`, `NodeBank`, `mindmapLayout.ts`, `mindmapTree.ts`, `mindmap.css`. Contrat :
  **zéro fetch** (la carte descend en prop, le gate `validated` reste dans la requête serveur) et
  **zéro logique métier** (évaluation injectée par la prop `evaluator`). Export **en sous-chemin**
  volontaire — depuis la racine `@zetis/ui`, React Flow entrerait dans le bundle de toutes les
  pages Papa.
- **`POST /api/mindmaps/{id}/evaluate-preview`** (`require_parent`) : même barème que `/evaluate`
  (fonction pure partagée), **sans gate `validated`** (Papa prévisualise du `pending`) et **sans
  aucune écriture** — ni `mindmap_attempts`, ni `xp_events`, ni `learning_events`.
- **`GET /api/mindmaps/pilotage/{subject_id}`** expose `attempt_count` / `avg_score` (une requête
  d'agrégat). Champs portés par `MindmapPilotageCard`, **pas** par `MindmapOut` servi aux routes
  élève : le suivi est parent-side.
- **Page Papa `/mindmaps`** : chapitres repliables + recherche, métrique « reconstruite N fois ·
  moyenne X % », **signal avant destruction** dans les confirmations (nouvelle prop
  `destructionNotice` de `ContentLifecycleActions`), mention explicite « cours non validé ».
- **`MindmapPreviewModal`** — 4 onglets (Regarde · Mémorise · Reconstruis · Éditer),
  `min(1400px, 95vw) × 90vh`, hublot sombre encadré rendant la brique avec le style Massimo
  (exception cadrée à la frontière visuelle), brique en `lazy()`.
- **`MindmapOutlineEditor`** extrait de `MindmapEditorModal` et monté aux deux endroits ; dans
  l'onglet Éditer, canvas re-layouté sur le brouillon (debounce 300 ms) et raccourcis
  `⇥` / `⇧⇥` / `⏎` / `⌫`.

### Modifié

- `@xyflow/react` et `elkjs` **déplacés** de `frontend-massimo` vers `packages/ui` — versions
  épinglées inchangées, **aucune dépendance nouvelle**.
- `pilotage_tree` : le N+1 (une requête de cartes par leçon) est remplacé par une requête groupée.

### Écarts assumés avec l'addendum

- **Aucune migration** : l'`ON DELETE CASCADE` demandé est déjà couvert par `delete_mindmap`, qui
  purge les tentatives avant la carte.
- `score_reconstruction` était **déjà** une fonction pure — seule la mise en forme du résultat est
  factorisée (`_evaluation_out`).
- `MindmapEditorModal` était **déjà** un éditeur structuré (l'addendum supposait du JSON brut) →
  réutilisé, pas réécrit.

### Vérifié

413 tests backend · 81 Massimo · 129 Papa. Live sur Postgres réel : reconstruction **complète**
jouée dans l'aperçu Papa → score serveur 100 % affiché et `mindmap_attempts` / `xp_events` /
`learning_events` **strictement inchangés** (11 / 68 / 38 avant et après). Non-régression Massimo
vérifiée sur les **deux** points de montage (page mindmaps + étape mindmap d'une mission).

---

## 0.21.0 — `zetis-clip` Lot 2 : transcription vidéo → RAG (Papa) — étape 20

Date : 2026-07-01 (mergé dans `main` le 2026-07-27)

> Note de versionnage : livré à l'origine en `0.12.0` (étape 20), **renuméroté `0.21.0` au merge**
> (`0.12.0` avait été réutilisé sur `main` — Moteur LLM). Cf. ADR-0006 addendum.

### Ajouté

- **Backend `POST /api/rag/clip-url`** : importe la **transcription** d'une vidéo →
  `ingest_document(validation_status="pending", source_type="video_transcript")` (pipeline
  étape 12 réutilisé). Fetch sortant **borné à une allowlist** (`youtube.com`,
  `www.youtube.com`, `youtu.be`), URL validée avant tout appel réseau. Langue d'origine
  conservée (transcription humaine préférée à l'auto-générée, jamais de traduction).
  `400` structuré `{code, message}` : `unsupported_url` / `transcript_unavailable`.
- **`app/modules/rag/transcript.py`** : `validate_video_url`, abstraction `TranscriptFetcher`
  (mockable — `FakeTranscriptFetcher` en tests offline), impl réelle `YouTubeTranscriptFetcher`
  (import paresseux de `youtube-transcript-api`). Dépendance backend ajoutée.
- **Extension (Lot 2)** :
  - Popup : détection d'onglet vidéo (allowlist locale) → « Vidéo détectée — importer la
    transcription », matière/chapitre/niveau, titre éditable (nettoyé), envoi + feedback
    « Importé en attente ». Cas « transcription indisponible » géré (message + repli).
  - Orchestration **hybride** : `POST /clip-url` (serveur) d'abord ; si `transcript_unavailable`,
    **repli DOM** — le content script scrape le panneau « Transcription » de l'onglet actif
    (`activeTab`, action utilisateur) puis `POST /clip`.
  - Menu contextuel « Importer la transcription de cette vidéo » (restreint aux pages YouTube).
  - `api.ts` : `postClipUrl` + `ApiError.code` (detail structuré) pour piloter le repli.
- Tests backend : `clip-url` → `pending` (récupérateur mocké), `400 unsupported_url` (hôte hors
  allowlist), `400 transcript_unavailable`, + unit `validate_video_url`.

### Décisions

- ADR-0006 **addendum étape 20** : exception SSRF bornée (fetch serveur limité aux hôtes vidéo
  allowlistés, URL validée avant appel), architecture hybride serveur→repli client, ingestion
  `pending`, dépendance `youtube-transcript-api`.
- Aucune nouvelle `host_permissions` large (repli via `activeTab`) ; token toujours dans
  `chrome.storage.local` ; contrats `/rag/documents` et `/rag/clip` inchangés.
- Reporté (étapes 21+) : OCR image, audio/podcast, file d'attente offline, multi-onglets,
  autres plateformes vidéo.

## 0.20.0 — Extension navigateur `zetis-clip` : capture de sources RAG (Papa) — étape 19 (Lot 1)

Date : 2026-07-01 (mergé dans `main` le 2026-07-27)

> Note de versionnage : livré à l'origine en `0.11.0` (étape 19), **renuméroté `0.20.0` au merge**
> (`0.11.0` avait été réutilisé sur `main` — Capsules IA). Cf. ADR-0006.

### Ajouté

- **Nouvelle app `apps/extension-zetis-clip`** (Manifest V3, Vite + `@crxjs/vite-plugin`, TS strict, Tailwind v4) — outil **Papa** de capture de sources vers le RAG. Réutilise `@zetis/ui` et la logique d'auth de `@zetis/auth`. Tout arrive en statut **`pending`** (relecture obligatoire dans « Sources de cours »).
  - **Popup** : type détecté (page / sélection / PDF), aperçu éditable du texte, titre, sélecteur de matière (`GET /subjects`), chapitre en texte libre autocomplété, niveau optionnel, envoi + feedback « Importé en attente ».
  - **Content script** : extraction `@mozilla/readability` (anti-SSRF : pas de fetch backend d'URL arbitraire), capture de la sélection, détection PDF.
  - **Service worker** : menus contextuels « Envoyer la sélection / la page à ZETIS », client API, `POST /api/rag/clip` (texte) ou `POST /api/rag/upload` (PDF), feedback par badge.
  - **Page Options** : URL backend (+ permission d'hôte à la volée) et connexion Papa.
  - Token JWT dans `chrome.storage.local` (jamais `localStorage`).
- **Backend `POST /api/rag/clip`** : endpoint mince qui réutilise `ingest_document(validation_status="pending")` (pipeline étape 12, inchangé). `400` si texte vide. Provenance (`source_url`) conservée dans le contenu — aucune migration. Tests : `test_clip_lands_pending_and_keeps_provenance`, `test_clip_rejects_empty_text`.

### Décisions

- ADR-0006 (Accepté) : nouvelle app + dépendances `@crxjs/vite-plugin` et `@mozilla/readability`, capture côté Papa, ingestion `pending`, extraction client (anti-SSRF), token en `chrome.storage.local`.
- Aucune auto-validation : le contrat de `POST /api/rag/documents` (= `validated`) n'est pas modifié. Pas de nouvelle table, pas de worker, pas de modification du CORS backend.
- Reporté (étape 20+) : transcript vidéo, OCR image, audio, file d'attente offline, import multi-onglets.

## 0.19.0 — Missions : sources, sélecteur déterministe, pilotage Papa (ADR-0017 lot 2)

Date : 2026-07-05

### Ajouté

- **Module neutre `evidence/`** (patron ADR-0011, read-only, sans import `missions`/conseil) :
  `mastery_by_skill`, `open_gaps`, `recent_verdicts`, `weighted_quiz_signal` (poids ADR-0014
  consommé, jamais réécrit), `srs_pressure`. Test-verrou de neutralité.
- **Générateurs par source** (idempotents, `pending`) : `generate-revision` (cartes SRS dues par
  matière, `lesson|eli5 → quiz`), `generate-progression` (prochaine notion non maîtrisée d'un
  chapitre actif / rattrapage jamais travaillé, `eli5 → vocal_explain → quiz`).
- **Sélecteur déterministe versionné** (`selector.py`, `MISSION_SCORING_VERSION=v1`, zéro LLM) :
  facteurs `severity`/`due_pressure`/`continuity`/`variety`(malus)/`forced_priority`, pondérations
  en config ; `reason_code` = facteur dominant → **phrase template figée**.
- **Frontière pilotage Papa** (`MissionPilotOut`, router dédié) : `GET /missions/pending`,
  `POST /missions/{id}/reject`, `GET /missions/election/today` (recalcul à la demande, facteurs +
  alternatives), `GET /missions/pilot?type=&subject=` (preuves brutes par étape),
  `GET /missions/verdicts/recent`, `GET /missions/pilot/summary` (KPI). `generation_reason`
  **calculé** au read (non stocké).
- **Trace verdict** — `LearningEvent` `mission_verdict` à la complétion (source de `recent_verdicts`).
- **Tests invariants 7–11** (sélecteur jamais pending, déterminisme, variety, reason ∈ dict figé,
  aucun champ pilot chez student) + générateurs + pilotage. **340 back verts.**

### Modifié — cassant

- **`GET /missions/today`** : de liste triée à `{ elected, reason, reason_code, scoring_version,
  alternatives }` (ADR-0017 §3). Split de schémas `MissionStudentOut` / `MissionPilotOut`
  (deux routers, gate en requête). Lib frontend Massimo adaptée a minima (refonte visuelle =
  slice séparée).
- **`config` / `.env.example`** : `MISSION_SCORING_VERSION` + pondérations des facteurs.

### Noté

- `Mission.available_from` (DATA_MODEL) n'existe pas sur le modèle réel → toutes les validées
  `planned|active` sont candidates (aucune migration ajoutée).

## 0.18.0 — Missions à preuves serveur + verdict d'acquisition (ADR-0017 lot 1)

Date : 2026-07-05

### Ajouté

- **Preuves serveur des étapes** — `POST /api/missions/{id}/start` (`planned → active`, idempotent,
  horodate `started_at`) et `POST /api/missions/{id}/steps/{step_id}/complete` : une étape ne se
  valide que si sa **preuve** existe (`eli5`/`lesson` = consultation tracée ; `vocal_explain` = score
  reverse ; `quiz` = `QuizAttempt` `context=mission`), **postérieure au `start`** et **dans l'ordre**
  (`sort_order`) — sinon **409**. Fin de la complétion déclarative de l'étape 15.
- **Verdict d'acquisition découplé** (§5bis) — la dernière étape crédite **+50 XP inconditionnels**
  (effort) puis calcule un verdict : `acquired` (reverse ≥ `MISSION_REVERSE_THRESHOLD` **et** quiz ≥
  `MISSION_QUIZ_THRESHOLD` → mastery↑, lacune `resolved`) ou `review_later` (mastery honnête, lacune
  `in_progress`, **carte SRS (re)programmée**). Deux issues, toutes deux positives.
- **Validation Papa** (§5ter) — missions générées naissent `validation_status = pending` ; gate
  `validated` **dans la requête** des routes student (invisible même par id) ;
  `POST /api/missions/validate {ids}` (validation en lot, minimal — pilotage complet = Lot 2).
- **Config** — `MISSION_XP_REWARD` (50), `MISSION_REVERSE_THRESHOLD`, `MISSION_QUIZ_THRESHOLD`.
- **Tests d'invariants** (6) — pending jamais exposé, preuve absente/antérieure/hors-ordre → 409,
  XP même si `review_later`, `review_later` ⇒ lacune `in_progress` + carte SRS, `failed` jamais écrit
  par un flux enfant, aucune pénalité de temps ; + verdict `acquired` (quiz + reverse).

### Modifié

- **Migration `f3a4b5c6d7e8`** — `missions.validation_status` (NOT NULL, backfill existant →
  `validated`), `missions.subject_id` → nullable, `missions.started_at`, `mission_steps.resource_id`.
- **Générateur `generate_remediation`** — missions `pending`, `step_type` alignés ADR
  (`eli5`/`vocal_explain`/`quiz`), `resource_id` réels ; l'étape `quiz` réutilise un quiz de mission
  prêt couvrant la notion, sinon est omise (auto-génération = Lot 2).
- **Frontend Massimo minimal** — `MissionsPage` : démarrer + valider chaque étape (409 parlant) ;
  refonte visuelle complète = slice frontend séparée.

### Retiré

- `POST /api/missions/{id}/complete` (complétion déclarative + résolution directe de lacune).

## 0.17.0 — Fiches de révision (ADR-0015) : backend + viewer Massimo + pilotage Papa

Date : 2026-07-05

### Ajouté

- **Backend — module `fiches`** — `FicheSpec` à budgets (const `FICHE_BUDGETS` : `essentiel` ≤ 600,
  `definitions` ≤ 4, `points_cles` ≤ 5, `erreurs_a_eviter` ≤ 3, `mini_exemple` ≤ 400) + miroir
  Pydantic strict ; prompt versionné `app/prompts/fiche.py` (`v1`) ; service `generate_fiche`
  **leçon-centré** dérivé du **cours canonique** (ADR-0011, force le cours de la leçon + complément
  RAG, comme le quiz de fin de cours) ; migration `d3e4f5a6b7c8` (tables `fiches` + `fiche_views`) ;
  trace `ai_jobs` `fiche_generate`.
- **Endpoints** — Papa (`require_parent`) `/api/fiches/*` (generate, `PUT` revalide→`pending`,
  regenerate, validate, delete, `lessons/{id}`, `pilotage/{subject_id}` = arbre matière→leçons→fiches,
  miroir quiz-pilotage) ; Massimo (`/api/student/fiches/*`, gate `validated`, 404 sinon) :
  `summary` (decks), `subjects/{slug}/fiches`, `{id}`, `{id}/seen`.
- **Briques `@zetis/ui` factorisées** — `GenerationProgress` (variant `bar`|`ring` +
  `useEstimatedProgress` déplacé de frontend-papa), `ContentLifecycleActions` (quatuor
  Générer · Régénérer · Éditer · Supprimer) et `ContentStatusBadge`. `ProgressBar.tsx` (Papa)
  ré-exporte `GenerationProgress` → **capsules intactes** (preuve de réutilisation). Réutilisées
  ensuite par les mindmaps (ADR-0016).
- **Viewer Massimo** (`/fiches`, `/fiches/:slug`) — decks `SubjectDeckGrid` (badge « ✨ nouveau »),
  `FicheCard` (⭐/📖/🔑/⚠️/💡 + badge « 📚 D'après ton cours »), bouton **« 📖 Voir le cours »**
  (panneau du cours source **à côté** de la fiche, même page ; réutilise
  `/api/student/lessons/{id}/cours` + `react-markdown`), **export A5** « 🖼️ Image A5 » (PNG) et
  « 🖨️ Imprimer » (document A5 autonome) via `html-to-image` — corrige la page blanche de
  l'impression du shell.
- **Pilotage Papa** (`/fiches`, émeraude) — arbre matière→leçons→fiches, génération par leçon +
  célébration, `ContentLifecycleActions` par fiche, **éditeur structuré** `FicheEditorModal`
  (formulaire + compteurs de budget) remplaçant l'édition du `spec_json` brut.

### Décisions

- La fiche est un **objet leçon** (« 1 leçon = 1 page », budgets = contrat structurel), distinct de
  la flashcard SRS (qui porte une *notion*) ; pont SRS différé ; génération par Massimo différée.

304 tests backend + 104 (Papa) + 73 (Massimo) verts ; `tsc -b` et `vite build` verts ; migration
appliquée sur le Postgres de dev. Dépendance ajoutée : `html-to-image` (frontend-massimo).

## 0.16.0 — ELI5 v2 : entrée par decks matières + composant partagé + emblème animé

Date : 2026-07-05

### Ajouté

- **Routes élève « notions validées »** (module `curriculum`, lecture seule, aucune migration)
  — `GET /api/student/notions/summary` (compteurs par matière de l'année active, une requête
  agrégée) et `GET /api/student/subjects/{slug}/notions` (notions dédupliquées par `skill_id`,
  `chapter_title` de la leçon la plus récente ; 404 hors année, `[]` si rien de validé). Même
  chaîne de filtrage que les cours élève (chapitre `validated` → leçon `validated` → `Skill`).
  Types dans `packages/types/src/curriculum.ts`.
- **Refonte ELI5 en 3 écrans** (frontend Massimo, `/eli5`) : écran 1 **decks matières**
  (compteurs de notions, matière vide = « bientôt », deck « ✨ Question libre » en tête) → écran 2
  **chips de notions** (nom + `chapter_title`) + champ « pose ta question » → écran 3 = **la
  session ELI5 existante, inchangée** (explain → reverse, badge « D'après ta leçon »). Chip →
  `explain` avec `skill_id` réel (badge leçon déterministe) ; question libre → résolution client
  (le moteur n'accepte que `skill_id`). Deep-link `?subject=slug`. Le moteur ELI5 n'est pas touché.
- **Composant partagé `SubjectDeckGrid`** — extrait de la grille « Par matière » de la page
  Révision (enveloppe `DeckDisc`), **Révision migrée dessus à l'identique** (parité visuelle
  préservée) ; les Mélanges restent locaux à Révision. `DeckDisc` gagne des options
  rétro-compatibles (deck atténué mais cliquable, `soonHint`, `hideBadge`).
- **Badge « ✨ new » sur les decks ELI5** — `new_count` par matière dans `/notions/summary` :
  notions dont une leçon validée porteuse a été créée dans les 7 derniers jours (récence de
  création, signal global ; `Lesson.created_at` faute d'horodatage sur `Skill`/`Chapter`).
- **Emblème animé ELI5** dans l'en-tête de l'écran decks — symboles de complexité (❓🔢🧩🌀) en
  orbite autour de l'ampoule 💡 qui s'illumine par à-coups (« aha ! ») en projetant des
  étincelles ; 4 `@keyframes` en `motion-safe:` (figé sous `prefers-reduced-motion`).

## 0.15.0 — Moteur de quiz unifié (ADR-0014, Lot 1) : backend + pilotage Papa + client Massimo

Date : 2026-07-05

### Ajouté

- **Moteur de quiz unifié** (ADR-0014, module `quizzes`) — quiz de fin de cours en premier
  client, **deuxième client du substrat canonique** (ADR-0011). Génération **locale** depuis le
  cours validé d'une leçon (formats choisis par le modèle), **auto-vérification à l'aveugle**
  (question dont le modèle ne retrouve pas sa clé → écartée), **correction déterministe serveur**
  (7 formats : `mcq`, `mcq_multi`, `true_false`, `cloze`, `numeric`, `ordering`, `matching`),
  **scoring pondéré** (`mission` = signal faible, **n'ouvre jamais de lacune**). XP = base
  d'effort + bonus score (0 %→10, 100 %→30).
- **Page Papa « Quiz — pilotage »** (`/quiz`, endpoints `/api/quiz-pilotage/*` + `/api/quizzes/*`)
  : inventaire par matière, génération par leçon (popover volume/difficulté + barre de progression),
  inspection avec clés, édition (→ `manual`)/ajout manuel/retrait, régénération (préserve les
  `manual`), suppression (hard/archivage), KPI + santé de l'auto-vérification par matière.
- **Client Massimo** (`/quiz`, `/quiz/session`, endpoints `/api/student/quiz*`) : grille des
  matières (grisée si aucun quiz) → lecteur question par question (7 formats), **feedback immédiat
  bienveillant** (jamais la clé), résumé de fin (XP + forces / « à revoir bientôt ») ; bouton
  « 🎯 Quiz » sur la page Cours quand un quiz existe ; hero animé sur la page Quiz.
- **Migration `b1c2d3e4f5a6`** : `quizzes.lesson_id`, `quiz_questions.source` + `.status`
  (`question_type` reste `varchar` → extension des formats sans DDL).
- **Lot 2 — format `open` (jugement LLM)** — clôt l'ADR-0014. Réponse écrite libre **jugée par
  le moteur local** contre des critères (opt-in manuel Papa, hors mix auto-généré) : évaluation
  **critère par critère** (persistée dans `quiz_answers.ai_evaluation_json`, migration
  `c2d3e4f5a6b7`), **bénéfice du doute** si le juge n'est pas sûr (élève crédité, ambiguïté
  remontée à Papa), feedback toujours bienveillant. Player Massimo (zone de texte) + authoring
  Papa (bascule QCM / Réponse ouverte + critères). Vérifié live (Ollama réel).

### UI Massimo (retouches)

- En-tête sidebar refondu (logo `zetis-avatar.png` + halo animé + wordmark `zetis-texte.png`),
  aligné sur l'avatar du header ; header : profil Massimo à gauche ; fond sidebar = fond header
  (`#000010`) ; icônes agrandies.

## 0.14.0 — Cartes SRS : génération page-driven + pilotage Papa + refonte UI Révision Massimo

Date : 2026-07-05

### Ajouté

- **Génération des cartes SRS** (ADR-0013, module `memory`) : contenu dérivé du **cours
  validé** de chaque notion, 100 % local (Ollama), upsert réconciliateur à 3 branches
  (A régénère en préservant la planif / B crée / C suspend les orphelines, réactivables).
  Page Papa **« Cartes de révision »** (`/cartes-revision`) : arbre matière→chapitre→notion,
  KPI, aperçu recto/verso, génération par matière.
- **Pilotage Papa — évolutions** (endpoints `/api/memory/cards/*`, `require_parent`) :
  - Bouton **« ↻ Régénérer »** par matière, même quand rien n'est « à générer »
    (réconciliation non destructive) ; **barre de progression estimée (%)** pendant la
    génération (patron partagé `ProgressBar` + `useEstimatedProgress`).
  - **Édition d'une carte** en place (`PATCH /api/memory/cards/{card_id}`, recto/verso,
    planification préservée) et **suppression d'une carte** unitaire
    (`DELETE /api/memory/cards/{card_id}`), avec `ConfirmDialog` — distinctes du retrait de
    toute une notion (`DELETE /skills/{id}`).
- **Surface Massimo** : `GET /api/student/reviews/summary` renvoie **toutes** les matières
  avec un booléen `has_cards`.
- **Refonte UI page Révision Massimo** (`/revision`) :
  - « Par matière » affiche **toutes** les matières ; celles sans carte apparaissent
    **grisées** avec leur **emoji** (« à venir » / « pas encore de cartes »), non lançables.
  - Decks = **simples cercles** avec l'icône/emoji de la matière (suppression de l'effet
    pile et de l'anneau conique coloré / « halo »).
  - Bannière motivante **« SRS · Révision espacée »** (`SpacedMemoryHero`) : illustration
    `SRS-cards.png` animée + courbe SVG de mémoire (points espacés 1j→3j→7j→14j).
  - `FlipCard` recto/verso **color-codés** : recto bleu « Question », verso émeraude
    « Réponse ».
  - Icône de la sidebar « Révision » = `SRS-cards.png` (au lieu de l'emoji 🗂️).

### Décisions

- Contrat `summary` étendu : `has_cards` distingue « aucune carte active » de « cartes
  présentes » (grisé vs « à jour ✓ ») — cf. ADR-0013 (addendum).
- L'édition d'une carte ne touche **jamais** la planification (`interval_days`,
  `ease_factor`, `due_at`) : seul le contenu change (invariant ADR-0013 §3).
- La régénération d'une matière est **non destructive** (réécrit le contenu, préserve
  l'historique de révision de Massimo).

## 0.13.0 — Référentiel : rattrapage « skills-only » + verrous du cours canonique

Date : 2026-07-03

### Ajouté

- **Génération « skills-only » pour un niveau antérieur** (rattrapage, `docs/decisions/adr-0010-generation-skills-only-rattrapage.md`) :
  Papa peut alimenter le référentiel de notions (`Skill`) d'un niveau du même cycle
  (ex. français 5e) sans créer d'année scolaire rétroactive. Flux **stateless** en deux
  temps : `POST /api/curriculum/skills-backfill/generate` enchaîne les passes 1 et 2
  **en mémoire** (chapitres et leçons ne servent que d'échafaudage et ne sont **jamais
  persistés**) et renvoie une prévisualisation des notions groupées + dédupliquées ;
  après revue, `POST /api/curriculum/skills-backfill/confirm` upserte les notions en
  `Skill` au niveau cible (réutilise l'upsert de la passe 2 — aucune leçon ni liaison
  créée). Garde parent, niveau borné au cycle 4 (5e/4e/3e → sinon 400), trace `ai_jobs`
  `curriculum_skills_backfill`, invariant vie privée testé. Miroir de types dans
  `packages/types`.

### Décisions

- **Cours validé = source canonique des dérivés** (addendum `docs/decisions/adr-0009-addendum-cours-canonique.md`) :
  un `Lesson.content_markdown` **validé** devient le contexte prioritaire des dérivés
  (ELI5, capsule, quiz…), avant le RAG brut et la connaissance du modèle ; le lien
  `Lesson ↔ Skill` est la table N-N `lesson_skills`.
- **Passe 1 strictement mono-niveau** (précision ADR-0010) : le débordement du few-shot
  SVT est corrigé et `CURRICULUM_PROMPT_VERSION` passe à `v2`.

### Corrigé / verrouillé

- **Gate du cours canonique** : `POST /api/lessons/{id}/generate-content` remet désormais
  la leçon en `draft` après une (re)génération réussie (même si elle était `validated`) —
  un cours réécrit non relu ne doit plus alimenter les dérivés ni Massimo avant
  revalidation par Papa. (`archived` reste 409 ; l'édition manuelle du cours par Papa,
  `PATCH /lessons/{id}`, ne touche pas le statut : Papa est l'autorité de validation.)
- **Index `ix_lesson_skills_skill`** sur `lesson_skills(skill_id)` (migration
  `e1f2a3b4c5d6`) : la PK composite `(lesson_id, skill_id)` ne couvre pas la résolution
  du cours canonique par notion (filtre `skill_id`).

## 0.12.0 — Moteur LLM (MoE), lancement prod-like « tout Docker » + UX capsules (étape 21)

Date : 2026-07-03

### Ajouté

- **Lancement prod-like « tout containerisé »** (`pnpm prod:up`, `docker-compose.prod.yml`) : backend,
  worker-media et les **2 frontends servis par nginx**, en une commande, à côté du dev natif
  (`pnpm dev`, inchangé). **Ollama reste sur l'hôte** (GPU Metal) ; le backend le joint via
  `host.docker.internal`. Cf. `infra/docker/README.md`.
- **Voix Piper (TTS) dans l'image backend** : `piper-tts` + modèle FR `fr_FR-siwis-medium` bakés →
  la narration des capsules fonctionne en conteneur.
- **Célébration « mini-victoire »** (brique partagée `@zetis/ui`, réutilisable) : petit surgissement
  joyeux (halo néon + particules, CSS) + **carillon doux synthétisé** (Web Audio, aucun asset
  binaire), **désactivable** via un `SoundToggle` persistant. Papa : à la génération réussie
  (« Capsule créée ! ») ; Massimo : quand une **nouvelle capsule** apparaît (dédup une-fois-par-capsule).
  Respecte `prefers-reduced-motion`.
- **Compteur de visionnages de Massimo** sur les 2 frontends : `CapsuleStats.view_count` (somme des
  visionnages, répétitions incluses) ; badge « 🎬 N visionnages ».

### Décisions

- **Moteur d'inférence LLM** (`docs/decisions/adr-0008-inference-mlx-vs-ollama.md`) : benchmark sur les
  vrais prompts ZETIS (vitesse + qualité + % JSON valide) → **MLX rejeté** (plus lent qu'Ollama sur
  M3 Max) ; **adopté `qwen3.6:35b-a3b`** (MoE : qualité ≈ 72b à la vitesse la plus rapide ;
  `OllamaProvider` passe `think:false` pour les modèles Qwen3). Référence cloud (GPT-4o, Claude
  Sonnet 5) : le local égale/dépasse → **production 100 % locale** confirmée (vie privée de Massimo).
- **Embeddings découplés** de la génération (`EMBED_PROVIDER`, défaut `ollama`) → changer de modèle de
  génération ne casse pas le RAG (zéro migration pgvector).

### Corrigé

- **Rendu MP4 en conteneur** : le worker-media lisait la DB via le défaut `localhost:5432`
  (connection refused) → clé d'env corrigée en **`ZETIS_DATABASE_URL`** (préfixe attendu par la
  config) ; sans ça la capsule restait `rendering` (invisible côté Massimo). Ajout de `shm_size: 1gb`
  (fiabilité Chromium/Remotion sur capsules longues).

## 0.11.0 — Capsules IA : Remotion + rendu MP4 + voix Piper (étape 20)

Date : 2026-07-01

### Ajouté

- **Rendu MP4 sandboxé** (ADR-0007) : le **worker-media** consomme une file **RQ** et rend chaque capsule en vidéo via **Remotion/Node** (Chromium + ffmpeg), isolé du backend. La vidéo est stockée sur **MinIO** (repli disque) et **lue côté Massimo**.
- **Voix off Piper par scène** : synthèse vocale locale (abstraction TTS, provider Piper) — la **narration pilote la durée de chaque scène**.
- **Vocabulaire de scènes étendu à 9 types** : ajout de `barmodel`, `geometry`, `steps`, `timeline`, `diagram`.
- **Regroupement matière → chapitre** de la bibliothèque de capsules (Massimo), avec **recherche** et **icônes de matière**.
- **Difficulté** (facile / moyen / difficile) et option de **durée ≈ 1 min** pilotant la génération (**prompt v5**).
- **Suivi des visionnages** Massimo : marquage vu / nouvelles capsules / **compteur de répétitions**.
- **Pilotage Papa** : modale de création (badge **capsule-AI**), **édition JSON** du spec, **barres de progression live** (génération / voix / rendu) et **rendu automatique à la validation**.

### Décisions

- Capsule = **spec typé** (JSON versionné) rendu par un **moteur Remotion** : Player à l'écran (Lot 1) puis rendu **MP4** hors-ligne (Lot 2), cf. `docs/decisions/adr-0007-capsules-ia-remotion.md`.
- Rendu vidéo **sandboxé** dans le worker-media (RQ), jamais dans le process backend ; artefacts sur MinIO.
- Routes capsules **réservées à Papa** ; Massimo ne consulte que la bibliothèque validée et enregistre ses visionnages.

## 0.10.0 — Refonte page Matières + header global animé Massimo (étape 19)

Date : 2026-06-30

### Ajouté

- **Page Matières refondue** dans le style du login (glassmorphique / néon) : bandeau « Progression globale » (niveau, XP, barre vers le niveau suivant, lien Progression), carte « Capsule IA dispo », grille des 8 matières, bande « Cette semaine » (série, objectifs, meilleure matière). Logique sortie du composant dans le hook **`useMatieres`** (gamification live + mock typé avec repli pour `subjects` / objectifs de semaine / capsule recommandée).
- **Header global animé** (`MassimoBannerHeader`, monté dans `MassimoLayout`) sur **toutes** les pages : emblème ZETIS (cercle + livre) cadré depuis la bannière, **cubes neuronaux** montant du livre (`NeuralCubes`), **réseau de connexions** cercle → bords avec impulsions (`NeuralLinks`), halo pulsant, et avatar Massimo + niveau·XP **live** (gamification, repli `PROFILE`) + Déconnexion. Remplace l'ancienne barre du haut (corrige l'incohérence mock vs live).
- **Primitives & assets** : `glass.tsx` (surfaces/halos/dégradés extraits du `LoginScreen`), `SubjectTile` (carte matière, **cadre teinté par la couleur de la matière**), `lib/subjectIcons.ts` (icônes PNG via `import.meta.glob`), `headerFx.css`, icônes matières `src/assets/subjects/`, `public/zetis-banner.png`.

### Décisions

- Réutilisation stricte des tokens/classes du `LoginScreen` (verre, halos indigo/cyan/fuchsia, dégradés, `LogoZetis`, avatar) — pas de CSS dupliqué hors `headerFx.css` (effets dédiés).
- Animations en CSS + SVG/SMIL, responsive (ResizeObserver pour le réseau neuronal), **`prefers-reduced-motion` respecté**.
- Liens câblés vers les **routes existantes uniquement** (`/progression`, `/subjects/:slug`, `/capsules`) ; pas de route lecture-capsule → repli propre vers `/capsules`. Aucune route ni fuite vers l'interface Papa.
- Endpoints `/subjects`, objectifs de la semaine et capsule recommandée encore **mockés** (repli typé isolé dans `useMatieres`, `TODO(api)`), à brancher ensuite. Aucune donnée pédagogique durable stockée côté front.

### Retiré

- `SubjectCard` (remplacé par `SubjectTile`) et les composants d'itération visuelle `BannerWave` / `HeaderOscilloscope` / `KnowledgeSparks` (remplacés par `NeuralCubes` + `NeuralLinks`).

## 0.9.0 — Page de login / démarrage ZETIS unifiée (étape 18)

Date : 2026-06-30

### Ajouté

- **`LoginScreen` partagé** (`@zetis/auth`) : page d'accueil + connexion soignée — panneau de marque (animation de marque ZETIS jouée à l'arrivée, fondu final vers le logo) + carte glassmorphique (identifiant, mot de passe avec œil, « se souvenir de moi », bouton dégradé, séparateur « ou », bouton Apple *bientôt*, lien d'aide) + avatars Massimo/Papa dans le sélecteur de profil.
- **Sélecteur de profil Massimo / Papa** avec **redirection croisée** : le profil de l'app active se connecte sur place, l'autre profil renvoie vers son frontend (`VITE_PAPA_URL` / `VITE_MASSIMO_URL`, défauts `localhost:5174` / `5173`). L'auth reste par app (chaque app n'accepte que son rôle).
- **Composant `LogoZetis`** (wordmark néon Syncopate) + setup Vitest/Testing Library. Les `LoginPage` des deux apps se réduisent à `<LoginScreen role=… otherAppUrl=… />` ; `@source packages/auth` ajouté aux thèmes Tailwind.

### Décisions

- Design unifié (même look dans les deux apps), réutilisant la palette par défaut Tailwind (indigo/cyan/fuchsia) indépendamment du thème d'app.
- Reportés : « Mot de passe oublié » réel, Sign in with Apple, mutualisation de `LogoZetis` dans `packages/ui`.

## 0.8.0 — Design system partagé `@zetis/ui` (étape 17)

Date : 2026-06-30

### Ajouté

- **Package `@zetis/ui`** : design system partagé (shadcn-style) — `Button`, `Card`, `Badge`, `Spinner`, `EmptyState` + util `cn` (clsx + tailwind-merge, `class-variance-authority`). Consommé en source TS comme `@zetis/auth`.
- **Théming par tokens sémantiques** : `primary`, `card`, `border`, `muted`, `foreground`… définis dans le `@theme` de chaque app et mappés sur sa palette (Massimo indigo `#6366f1` / Papa émeraude `#10b981`). `@source` ajouté pour que Tailwind v4 scanne `packages/ui`.
- **Première adoption** : `MissionsPage` (Massimo + Papa) refondues sur les primitives.
- **Feuille de route frontend** : `FRONTEND_ROADMAP.md` (état des pages, lots priorisés, quick wins).

### Décisions

- Base **shadcn/ui** (cva + Tailwind, tokens CSS) plutôt que primitives ad hoc ; **un seul composant, deux thèmes** via tokens sémantiques par app.
- Vérifié au runtime : `bg-primary` rend la bonne couleur dans chaque app.
- Reportés : généraliser aux pages live (Lot B), composants Radix (Dialog/Select), dark/light, mobile Massimo.

## 0.7.0 — Gamification : XP, niveaux, streak, badges (étape 16)

Date : 2026-06-30

### Ajouté

- **Module gamification** (`app/modules/gamification`) : `GET /api/gamification/summary` → total XP, **niveau** (100 XP/niveau), barre vers le niveau suivant, **streak** (jours consécutifs, tolérance d'un jour), **badges** déterministes, activité récente. Aucune migration (lit/écrit `xp_events`).
- **Crédit d'XP** via helper partagé `award_xp` : mission terminée (+20, déjà en place), **verbalisation ELI5 reverse** (+10), **diagnostic passé** (+15).
- **Frontend Massimo** : `ProgressionPage` branchée (niveau, barre XP, streak, badges, activité récente) ; section « par matière » laissée indicative.

### Décisions

- Gamification au service de l'apprentissage (CLAUDE.md) : pas de loot box, pas de classement social, streak raisonnable.
- Reportés : vue Papa de la régularité/XP, niveaux nommés, XP par matière, garde-fou anti-spam d'XP.

## 0.6.0 — Remédiation : lacunes → missions (étape 15)

Date : 2026-06-30

### Ajouté

- **Moteur de remédiation** (`app/modules/missions`) : `generate-remediation` transforme chaque **lacune ouverte** (`gaps`) du diagnostic en **mission de remédiation** (3 étapes : expliquer → réexpliquer → quiz, priorité ∝ sévérité). Idempotent. Aucune migration (réutilise `missions`/`mission_steps`/`gaps`/`xp_events`).
- **Complétion** : `POST /api/missions/{id}/complete` → mission `completed`, étapes `done`, **lacune liée résolue**, **XP crédité** (`xp_events`).
- **Endpoints** : `POST /api/missions/generate-remediation` (Papa), `GET /api/missions`, `GET /api/missions/today` (Massimo), `POST /api/missions/{id}/complete`.
- **Frontend Papa** : `MissionsPage` branchée — bouton « Générer la remédiation », liste statut/priorité/étapes.
- **Frontend Massimo** : `MissionsPage` (remplace le placeholder) — missions du jour + « J'ai terminé » (message + XP).

### Décisions

- Étapes de mission **déterministes** (template pédagogique), pas d'appel IA — robustes et testables.
- Vocabulaire bienveillant (CLAUDE.md) : « renforcer », « consolidation », jamais d'échec.
- Reportés : étapes reliées à ELI5/quiz réels, niveaux/streak XP, missions manuelles Papa.

## 0.5.0 — Diagnostic complet (étape 14, Phase 4)

Date : 2026-06-30

### Ajouté

- **Moteur de diagnostic** (`app/modules/diagnostics`) : QCM générés par IA par notion (prompt versionné `app/prompts/diagnostic.py`, via `LLMProvider`, trace `ai_jobs`), correction automatique, **score par notion**, upsert `skill_mastery` et ouverture de **lacunes** (`gaps`) pour les notions < 70 %. Aucune migration (réutilise `quizzes`/`quiz_questions`/`quiz_attempts`/`quiz_answers`).
- **Endpoints** : `GET /api/diagnostics/subjects`, `POST /api/diagnostics/generate` (Papa), `GET /api/diagnostics/quizzes`, `GET /api/diagnostics/quizzes/{id}`, `POST /api/diagnostics/quizzes/{id}/submit` (Massimo), `GET /api/diagnostics/results` (Papa).
- **Frontend Massimo** : `DiagnosticPage` branchée (liste → QCM → forces + prochaines étapes, ton bienveillant). Les bonnes réponses ne sont jamais exposées à l'enfant.
- **Frontend Papa** : `DiagnosticsPapaPage` — lancer un diagnostic par matière, suivre le score par notion (barres) et les lacunes.

### Décisions

- Questions **générées par IA** (pas de banque figée) ; le `FakeLLMProvider` renvoie aussi des QCM pour des tests offline déterministes.
- Vocabulaire bienveillant (CLAUDE.md) : « notion à renforcer », jamais d'échec.
- Reportés : génération de missions de remédiation depuis les lacunes, diagnostic multi-matières en une session, difficulté adaptative.

## 0.4.0 — RAG sémantique + sources Papa (étapes 11 → 12)

Date : 2026-06-30

### Ajouté

- **RAG sémantique pgvector** (Étape 11) : modèles `rag_documents` / `rag_chunks` (`vector(768)`) + index ivfflat cosinus (migration `a1b2c3d4e5f6`) ; `OllamaEmbeddingProvider` (`/api/embed`, `nomic-embed-text`) ; module `rag` (chunking, ingestion vectorisée, recherche cosinus, `retrieve_for_skill`) ; endpoints `POST/GET /api/rag/documents`, `POST /api/rag/search`. ELI5 `explain` injecte le contexte récupéré (renvoie `[]` sans appel embeddings si aucune source → contrat intact).
- **Ingestion de fichiers + validation Papa** (Étape 12) : `POST /api/rag/upload` (MD/TXT/PDF, extraction via **pypdf**) → source en statut **`pending`** ; `POST /api/rag/documents/{id}/validate|reject` (synchronise document + chunks). Page Papa **« Sources de cours »** (upload + liste + Valider/Rejeter). Seuls les chunks `validated`/`official` alimentent l'IA (relecture humaine, cf. CLAUDE.md).
- **RAG visible côté Massimo** (Étape 13) : ELI5 `explain` expose `sources_used` dans `output_json` (= nombre de passages de cours injectés) ; le front Massimo affiche le badge **« 📚 D'après ton cours »** quand l'explication s'appuie sur une source validée.

### Décisions

- Embeddings et LLM restent des **providers abstraits** distincts (ollama en local), trace `ai_jobs` conservée.
- Les sources uploadées par Papa ne sont **jamais** utilisées avant validation manuelle.
- Reportés : réponse RAG sourcée dédiée (`/rag/answer`) + citations/confiance, stockage du fichier brut (MinIO), RAG sur les productions de Massimo, import des programmes officiels.

### Dépendances

- Backend : `python-multipart`, `pypdf`.

## 0.3.0 — MVP fonctionnel (étapes 2 → 10)

Date : 2026-06-30

### Ajouté

- **Frontend Massimo** (Étapes 2, 7) : React 19 + Vite + TypeScript strict + Tailwind v4 ; auth, layout + sidebar, pages Accueil, Matières (+ matière dédiée `/subjects/:slug`), Diagnostic, ELI5 (branchée sur l'IA), Mindmaps, Capsules IA, Progression. Données mockées sauf ELI5.
- **Frontend Papa** (Étapes 3, 8) : cockpit analytique — Dashboard (KPIs/alertes/reco), Progression, Lacunes, Missions, Diagnostics, Conseil de classe IA, Cahier de bord IA, Années scolaires, Matières & programmes, Capsules pilotage, Mode focus, Paramètres.
- **Backend FastAPI** (Étapes 4-6) : `/health`, `/health/db`, `/api/version`, CORS, **auth JWT** (rôles papa/massimo), tests pytest.
- **Connexion front ↔ back** (Étape 5) : statut backend affiché dans les deux apps.
- **Base de données** (Étape 9) : PostgreSQL + **SQLAlchemy 2.0** + Alembic + psycopg3 ; 22 tables (+ `ai_jobs`) ; seed de dev idempotent.
- **Boucle IA / mémoire** (Étape 10) : ELI5 explain + reverse via abstraction **`LLMProvider`** + **`OllamaProvider`** (qwen2.5) ; trace **`ai_jobs`** à chaque appel ; écriture `learning_events` + upsert `skill_mastery` + 1 carte de révision espacée (intervalles fixes 1/3/7) ; extension `pgvector` activée.
- **Package partagé `@zetis/auth`** : logique auth + client API factorisée entre les deux frontends.

### Décisions

- ORM : **SQLAlchemy 2.0** (typé) + Alembic + psycopg3.
- IA : **un seul provider** abstrait (ollama / qwen2.5 en local), prompts versionnés (`apps/backend/app/prompts`), trace `ai_jobs` obligatoire, feedback bienveillant.
- Reportés post-MVP : RAG (ingestion/embeddings), capsules vidéo, jobs IA asynchrones, lien auth ↔ utilisateur en base.

## 0.2.0 — Squelette monorepo + outillage

Date : 2026-06-29

### Ajouté

- Squelette du monorepo (Étape 1) : `apps/{frontend-massimo,frontend-papa,backend,worker-ai,worker-media}`, `packages/{ui,types,prompts}`, `infra/{docker,nginx}`, `storage/`, `scripts/` avec un README par dossier.
- Fichiers de configuration racine : `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json` (TypeScript strict), `docker-compose.yml`, `.env.example`.
- `.gitignore` et `.graphifyignore`.
- Outillage Graphify : skill + hook `PreToolUse`, knowledge graph dans `graphify-out/` (local, non versionné).

### Modifié

- Unification de la convention de nommage du monorepo sur `apps/` (frontends, backend et workers), alignée sur le SUIVI ; correction des docs divergentes (`PROJECT_STRUCTURE`, `ARCHITECTURE`, `README`, `CLAUDE.md`, etc.).

## 0.1.0 — Initialisation documentation

Date : 2026-06-29

### Ajouté

- Documentation racine projet.
- Instructions Claude Code.
- Architecture globale.
- Stack technique.
- Roadmap.
- Backlog.
- Spécification produit.
- Modèle de données.
- API spec.
- Sécurité.
- Déploiement.
- Documentation frontend Massimo.
- Documentation frontend Papa.
- Documentation IA/RAG/mémoire/capsules.
- Prompts Claude Code.

### Décisions

- Projet renommé ZETIS.
- Obsidian non obligatoire.
- Deux frontends séparés : Massimo et Papa.
- Backend FastAPI.
- PostgreSQL + pgvector.
- MinIO pour fichiers.
- Docker Compose pour développement.
