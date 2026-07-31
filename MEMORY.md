# MEMORY.md — Mémoire de reprise (raisonnement)

> Mémoire du **raisonnement** au sens `docs/WORKFLOW.md` §3/§6.3 : fait / en cours / à-faire /
> décisions actives / prochain pas. Écrit pour la **prochaine session, sans contexte**.
> L'état du **code** se lit dans Git ; les **décisions figées** dans `DECISIONS.md`/les ADR ;
> le modèle de données dans `DATA_MODEL.md`. Ce fichier ne duplique pas ces sources.

## État à la reprise

**Branche : `feat/accueil-vivant`** — **ouverte PAR-DESSUS `feat/accueil-galaxy`**, qui n'est ni
poussée ni mergée. ⚠️ **Les deux PR devront partir dans l'ordre** : `feat/accueil-galaxy` d'abord.

**FAIT dans cette branche, dans l'ordre** : « Accueil vivant » (route
`GET /api/gamification/history`, « Mon ciel », « Tes derniers gains », retour de la frise) →
**« Mon ciel » devient un calendrier** sans cases vides → **rejeu animé** (ADR-0029) →
**`/galaxy` devient un système solaire** (cerveau au centre, matières en orbite, matières vides
comprises) → **bandeau de planètes** au fond spatial, couronne solaire dorée.
**649 tests backend + 221 Massimo, `tsc -b` et builds verts. Tout vérifié dans le vrai
navigateur** (session de Massimo, Chrome du user).

**Prochain pas = push + les deux PR.** Rien n'est poussé.

> ⚠️ **Reste dû, jamais vérifié en vrai** : le **cahier de bord de Papa** — le mapping
> `routeLabels` qui doit rendre le même libellé pour `/progression` et `/galaxy`. Couvert par
> 5 tests unitaires ; l'app Papa n'a pas de serveur branché sur `:8003`, dont le CORS n'autorise
> que `:5179`. Demande un port de plus.

### `/galaxy` = système solaire (révision de l'addendum §C) — FAIT, non poussé

**La vue d'arrivée n'affiche plus tout le graphe.** Servir `root` + matières + chapitres +
notions à une simulation de forces produisait un **amas** : cerveau à moitié enseveli, libellés
superposés. Désormais : **cerveau au centre** (il existait déjà — `brainGeometry.ts`, deux lobes
à circonvolutions générés par le code, grossi ×2.4 en mode orbite pour faire soleil) et
**matières seules**, chacune **posée** sur une orbite dessinée (`orbitLayout`, pure et
déterministe), plan aplati, caméra en surplomb à ~35°.

- **Un placement, pas un équilibre** : `GalaxyCanvas` gagne `layout="orbit"` — forces à zéro,
  positions imposées via `fx/fy/fz` **dans les données** (⚠️ `graphData()` n'est PAS exposée par
  cette version de la lib — constaté à l'exécution, l'API du ref ne marche pas pour ça).
- **Les matières VIDES ont aussi leur planète** : `galaxy/all` les exclut volontairement, mais la
  vue les rajoute depuis l'overview (déjà chargé). Une matière absente se lirait comme une
  matière qui n'existe pas ; une planète éteinte se lit « pas encore ». **Contrat serveur
  inchangé.**
- La rotation lente était **déjà acquise** (`controls.autoRotate`, coupée par
  `prefers-reduced-motion`) — rien à écrire.
- **Bandeau de planètes CSS PERMANENT au-dessus du graphe** (`SubjectConstellations
  variant="band"`), présent sur la galaxie **et** dans une constellation — c'est aussi le
  **sélecteur de matière** : la planète ouverte porte son anneau. **Une seule ligne, sans
  défilement** — les planètes se partagent la largeur (`flex-1`) et rétrécissent avec leur nombre
  (globe 44 px, emblème 24 px, nom tronqué, tuile de relief mise à l'échelle via `--tile`).
- ⚠️ **UN SEUL CLIC ouvre la matière.** Une version intermédiaire demandait un 1ᵉʳ tap pour
  « viser » puis un 2ᵉ pour entrer : geste que personne n'avait demandé, et toucher une matière
  sans voir son graphe se lit comme un clic qui n'a pas marché. **Ne pas réintroduire.**
- **`SubjectKpiRow` SUPPRIMÉ** : le bandeau rend le même service et montre en plus les matières
  vides, que les puces filtraient (`s.total > 0`).
- **Cadre au fond spatial animé** : nébuleuses qui respirent, bande laiteuse en diagonale, deux
  champs d'étoiles à vitesses différentes — **seul le champ proche scintille** (si tout clignote
  ensemble, le fond respire d'un bloc et vole l'attention aux planètes). Tout en CSS, zéro 3D.
- **Couronne solaire dorée** ∝ étoiles allumées, **absente sur une matière vide** : le canvas
  pose déjà la règle (« l'or ne coule que vers ce que Massimo a vraiment travaillé ») et la
  maquette galaxie dit « aucun or ». **Doré = travaillé, jamais « joli »** — ne pas l'étendre
  aux planètes vides.
- Une matière vide affiche « Bientôt » au lieu d'un compte ; l'ouvrir mène à l'écran d'attente
  honnête (« 🌱 Les étoiles de cette matière arrivent bientôt »).

### Chantier « Accueil vivant » (2ᵉ addendum ADR-0024) — FAIT, non poussé

**La demande** : un Accueil plus vivant, avec la **heatmap de Papa** en référence.
**La heatmap est REFUSÉE par écrit**, avec ses trois murs **indépendants** (route supprimée par
l'ADR-0028 et vivant dans un agrégat `require_parent` ; `CLAUDE.md` interdit le décompte de jours
manqués « sous quelque forme que ce soit » ; `WeekDots.test.tsx:32` le verrouille). Ne pas la
redemander sans rouvrir ces trois-là.

**Ce qui la remplace** : « Mon ciel », la même idée **retournée** — une case par jour de gain sur
un **calendrier** (semaines en colonnes, jours en lignes, comme chez Papa), mais **aucune case
vide n'est dessinée** : un jour sans gain n'a **aucun élément dans le DOM**. Chez Papa la case
grise **est** l'information d'absence et elle y est légitime (c'est du pilotage) ; ici l'absence
n'existe ni dans les données ni dans le rendu.

> ⚠️ **Révisé le jour même, après un premier rendu.** La v1 posait les jours en **constellation
> libre**, sans repère temporel. Le user a redemandé la heatmap : ce qui manquait n'était **pas
> la densité, c'était le repère de TEMPS**. D'où le calendrier — l'interdit passe de la
> **géométrie** vers le **rendu**. Ce qui est assumé : sur un calendrier, l'œil perçoit les
> intervalles par la **position**. Ce que `CLAUDE.md` bannit — un décompte, une iconographie du
> vide — reste absent. **Ne pas re-proposer la constellation** : elle a déjà été essayée.

**Brique partagée créée** : `packages/ui/src/lib/calendarGrid.ts` (`buildSparseCalendar`, +
`toLocalIso`/`startOfWeek` **remontés depuis `heatmap.ts` de Papa**, qui les ré-exporte). Deux
`startOfWeek` dans un même dépôt finiraient par diverger sur les bords de semaine.
`buildHeatmapGrid` **reste chez Papa** — c'est lui qui reconstruit les jours vides, et cela ne se
partage pas.

**La décision qui compte, et pourquoi elle tient** : `GET /api/gamification/history` marche sur
un refus déjà écrit (`motivation/router.py:38` : « un historique d'objectifs manqués serait le
streak déguisé »). Ce refus est **maintenu** — un **objectif** porte un attendu, donc son
historique est un relevé d'échecs ; un **XP** est un gain obtenu, et un jour sans gain n'est pas
un jour raté. **Le garde-fou est dans le CONTRAT** : les jours sans XP sont **omis du payload**,
donc aucun client futur ne peut dessiner une case vide sans avoir lu l'ADR. Route dans
`gamification` et **surtout pas** dans `activity`, dont le module porte la doctrine inverse
(« un enfant chronométré travaille pour le chronomètre »).

**Pièges rencontrés** :
- le mapping `REASON_LABEL` ne couvrait que **3 `reason` sur 8** — invisible tant que `recent`
  n'était affiché nulle part, à l'écran de l'enfant dès qu'on l'affiche ;
- regrouper les XP **en Europe/Paris** (`local_day`), pas en UTC : c'est exactement le défaut
  relevé sur le streak retiré ;
- les pastilles portant leur compte ont créé plusieurs « 0 » à l'écran → un test existant visait
  `getByText("0")`, réécrit sur l'`aria-label` de la carte (précisé, pas assoupli) ;
- **jsdom garde `grid-column`, le navigateur le normalise en `grid-area`** : un test qui
  sélectionnait sur le style passait en test et trouvait 0 case en vrai → ancrage `data-day` ;
- **trois défauts visibles seulement au rendu réel, avec les VRAIES données** (6 jours, pas 34) :
  libellés de mois superposés, grille minuscule dans une carte large, initiales de jours
  désalignées. Un composant dont la mise en page dépend de tailles en pixels ne se valide pas en
  jsdom — il faut l'ouvrir.

**Décisions actives, à ne pas rouvrir** : la frise est REVENUE sur l'Accueil (le §B du 1ᵉʳ
addendum voulait sortir **Three.js**, pas du SVG maison) ; aucune date n'est affichée nulle part
sur cette page ; les matières ne sont **jamais** triées par étoiles (ce serait un palmarès).

> ⚠️ **Ce qui n'a PAS été vérifié en vrai** : `/galaxy` et l'Accueil sont derrière
> `RequireAuth`, et la session de développement n'a pas ouvert de session Massimo. Tout est
> couvert par des tests (200 Massimo + 270 Papa, builds et `tsc -b` verts), mais **le rendu réel
> n'a été vu par personne** — en particulier : la galaxie complète en vue par défaut, la
> bascule planètes CSS → canvas, et la carte « Ma Galaxie » sur l'Accueil.

> ✅ **Connexion MERGÉE** — PR [#59](https://github.com/NeuronXcore/zetis-school/pull/59) et
> **Dashboard Papa v2** PR [#60](https://github.com/NeuronXcore/zetis-school/pull/60) sont
> **toutes deux mergées** : `origin/main` = **`96becd8`** (2026-07-31). **NE PAS RÉ-IMPLÉMENTER.**
> Migration **`a9b8c7d6e5f4`** (`skill_mastery_history`) appliquée sur Postgres dev — elle se
> rejoue seule au démarrage.

### Chantier en cours — Accueil & Galaxie (addendum ADR-0024, 2026-07-31)

**Slice A — renommage `/progression` → `/galaxy`. FAITE.** `git mv ProgressionPage.tsx →
GalaxyPage.tsx`, `/progression` réduite à `<Navigate to="/galaxy" replace />` (**premier
`<Route element={<Navigate>}>` du repo côté Massimo**), sidebar « **Ma Galaxie** » 🌌 **à la même
position** (11ᵉ sur 13 — le renommage ne devient PAS une 6ᵉ entrée, ADR-0024 §1), bandeau XP,
`MatieresPage`, `motivationVisuals.ROUTES` (**la clé reste `progression`** : c'est un `target`
servi par le backend, pas une URL) et `NotionActionPanel.returnTo` repointés.
188 tests Massimo + 270 Papa + les 2 builds **verts**.

**Cinq écarts réels trouvés au read-before-code** (les documents étaient en avance ou en retard
sur le code) :

1. **`GET /api/student/galaxy/overview` n'existe pas** — c'est `GET /api/student/galaxy` (chemin
   vide, `galaxy/router.py:29`). Et `/overview` **serait capturé** par
   `GET /student/galaxy/{subject_slug}` : 404 « matière inconnue », pas 404 de route. La fonction
   client s'appelle `fetchGalaxyOverview`, d'où la confusion. `page-accueil.md` corrigée.
2. **Le contrat ne porte aucun compte GLOBAL** d'étoiles : `lit`/`total` sont **par matière**.
   La carte Galaxie de la slice B devra **sommer côté client**.
3. **`ProgressionPage.test.tsx` n'existait pas** — le prompt de slice A supposait de le déplacer.
   Couverture indirecte seulement (`components/galaxy/*.test.tsx`).
4. **Le mapping route → libellé du §D n'existait NULLE PART** (ni Papa, ni serveur) : le serveur
   sert la route **brute** comme `detail` (`activity/service.py:_detail_for`) et Papa la rendait
   **verbatim**. Il n'y avait rien à étendre — il y avait quelque chose à **créer**. Fait côté
   client Papa (`lib/routeLabels.ts`), donc **« zéro backend » tient**.
5. **Ni outillage de bundle, ni CI** (`.github/workflows` absent) : le « test de budget » de la
   slice B est **à concevoir de zéro** (Vitest sur le graphe d'imports).

**Slice B — refonte de l'Accueil. FAITE.** `HomeGalaxyPreview` **supprimé** ; Accueil recomposé
(salutation verbatim → bandeau Agenda → mission du jour → « Ma semaine » + carte « Ma Galaxie »
côte à côte → 3 raccourcis → **slot** du héros ZETIS non rendu) ; `useGalaxy` tire maintenant
`fetchFullGraph` + `fetchGalaxyTimeline`, et `/galaxy` s'ouvre sur la **galaxie complète**, les
planètes CSS devenues **état d'attente + repli sans WebGL**. 200 tests Massimo + 270 Papa verts.

**Décisions prises pendant ce chantier, à ne pas rouvrir :**

- **`HomeAgendaBanner` RESTE sur l'Accueil.** La spec réécrite et la maquette v2 ne le montrent
  pas, mais c'est le **seul accès à `/agenda`** en phase 0 (l'agenda n'a pas d'entrée de sidebar,
  ADR-0025). **La spec et la maquette ont été corrigées**, pas le code.
- **Le §C n'était pas un déplacement mais une FUSION.** `HomeGalaxyPreview.tsx` (~420 lignes)
  n'était pas un graphe : c'était une **expérience Galaxy complète** (canvas `lazy()`, recherche,
  `SubjectKpiRow`, frise, légende, panneau d'actions, **son propre plein écran à deux niveaux**),
  soit un doublon de ce que `GalaxyPage` fait déjà. Arbitrage retenu : **`GalaxyPage` absorbe la
  galaxie complète**, les composants sont réutilisés tels quels, et c'est l'**orchestration en
  double** qui disparaît — pas le contenu.
- **Le test de budget interdit les `import()` autant que les imports statiques.** Le canvas était
  DÉJÀ code-splitté le 2026-07-28 : ce qui coûtait, c'était le **montage**. Un test limité aux
  imports synchrones serait passé avant comme après, donc n'aurait rien protégé. Contre-épreuve
  incluse dans le fichier (`accueil.bundle.test.ts`), et vérifiée en réintroduisant la régression.
- **Deux choses que la spec demandait et que le backend ne sert pas** : la « capsule recommandée
  avec sa durée » (aucune durée dans `/api/capsules/library`, aucune notion de recommandation) →
  remplacée par `new_count` ; et le **compte global** d'étoiles → **somme client** des `lit`.

**Pièges de renommage (vérifiés, ne pas y toucher)** : Papa a **sa propre route `/progression`**
(`frontend-papa/src/App.tsx:42`, `lib/navigation.ts:30`) — homonyme ; et
`backend/modules/dashboard/service.py:472` fabrique `href: /progression?subject=…` qui pointe la
route **Papa** (dashboard `/api/parent/dashboard` → `ZetisReadingCard.tsx:75`). `packages/ui` ne
contient **aucune** référence à la route. `interface Progression` de `hooks/useMatieres.ts` et
`mission_type='progression'` sont des homonymes de domaine.

> ⚠️ **Versions du CHANGELOG** : les deux chantiers avançaient en parallèle et revendiquaient tous
> deux `0.29.0`. Le dashboard ayant été mergé en premier garde `0.29.0` (+ `0.29.1` pour le
> correctif du relais SRS) ; la connexion est **renumérotée `0.30.0`**.

### Chantier « Dashboard Papa v2 » (ADR-0028) — MERGÉ, détail conservé pour les pièges

`b758580` doc · `6479985` historique de maîtrise · `7b63f62` agrégat · `ae4fd42` temps hors matière
· `bd82fe5` front · `6518094` Conseil query params · `6682aeb` nettoyage · `3fa8baa` mission
proposée · `bdbe5f4` **relais SRS réparé** · `0353507` **/lacunes réelle** · `ee3a2f4` **/focus réel**.

**Ce que ça fait** : `GET /api/parent/dashboard` devient l'**unique requête du premier rendu** et
sert les **trois fenêtres** (7/30/90) **non filtrées**, séries **par matière** — « toutes matières »
est une somme client. Conséquence : changer de période, de matière ou de focus **ne déclenche aucune
requête** (prouvé dans l'onglet Réseau : 5 gestes, 10 requêtes avant, 10 après). Les 4 KPI
deviennent des **filtres de focus** (§5) ; 8 visualisations en **SVG maison** (zéro dépendance
ajoutée : ni react-query, ni lib de graphes).

**Migration `a9b8c7d6e5f4`** (`skill_mastery_history`) **appliquée sur Postgres dev**. Backfill
partiel assumé (seules les bascules `mastered` datables) — il a rendu 0 ligne en dev, c'est correct :
les 15 lignes de `skill_mastery` ont toutes `mastered_at` à NULL.

**Read-before-code : 2 vérifications sur 4 sont tombées**, + 6 écarts non anticipés par l'ADR (tous
reportés dans l'ADR et la spec) :
- « consolidée » avait **déjà** une définition serveur (`SkillMastery.status == "mastered"`), pas
  celle qu'écrivait l'ADR ; « fragile » n'en avait **aucune** → mapping figé sur les **6** statuts
  réels (`in_progress` inclus, écrit par `missions/service.py`, absent de tout `_status_from_score`) ;
- `GET /api/parent/dashboard` **existait déjà** → réécriture **cassante** (un seul consommateur) ;
- Conseil : `generated_at` **n'existe pas** (c'est `created_at`), route **`/conseil`** (pas
  `/conseil-classe`), aucun query param → étendue en commit révocable seul ;
- les **quiz ne peuvent pas** entrer dans la file « À valider » (`quizzes` n'a pas de
  `validation_status`, doctrine ADR-0014 §2) ; `lessons` utilise `status`, les autres
  `validation_status` — **deux conventions coexistent en base** ;
- `/api/parent/activity/heatmap` **sans consommateur hors dashboard** → **supprimée** (le Cahier de
  bord utilise `/activity/sessions`).

**Deux contradictions que seul le rendu réel a révélées** (invisibles en test) : le donut totalisait
42 min à côté d'un KPI annonçant 7 h 05 → champ **`unattributed_minutes`** + part « Hors matière »
(connexion, navigation, chat portent du temps sans `subject_id` — 90 % du total en dev) ; et le KPI
des lacunes portait le **même libellé** que le segment « fragiles » des cartes voisines, affichant
« 1 » à côté de « 9 » pour deux mesures différentes → « Lacunes ouvertes ».

### Le vrai défaut trouvé en creusant (le plus important de ce chantier)

Parti d'un symptôme — « 1 notion à renforcer sans mission active » à côté d'une carte qui ne
proposait rien — le diagnostic « `generate_remediation` ne reprend que les lacunes `open` » était
**exact mais superficiel**.

**Le relais que l'`adr-0017 §5bis` désigne était INOPÉRANT.** Le template `revision` composait
`[carte] → [quiz] → relire` **sans étape de réexplication**, alors que le verdict exige
`reverse_score` — et `STEP_ELI5` est une étape de **consultation** qui n'en produit aucun. ⇒ une
mission `revision` rendait **toujours** `review_later` : la lacune restait `in_progress` à vie.
Pire, sans mesure la branche écrivait **`mastery_score = 0`** et replanifiait la carte à 1 jour :
Massimo faisait sa révision et sa maîtrise s'effondrait. **La contradiction était figée par un
test** qui assertait « pas de verbalisation ».

Corrigé (`bdbe5f4`) : (a) `vocal_explain` ajouté au template `revision` — ses *types* d'étape
coïncident désormais avec `remediation`, assumé (la distinction reste la source, la formulation, le
plafond, la priorité) ; (b) **une absence de mesure n'est plus écrite comme un zéro**. **Bump
`MISSION_SCORING_VERSION` v3 → v4.** Le générateur de remédiation n'est **PAS** élargi aux lacunes
`in_progress` : la doctrine tenait, elle ne fonctionnait pas.

⚠️ **Deux surfaces se contredisaient** : le KPI `without_mission` ne comptait que les missions
`remediation` → une notion couverte par une mission **`manual` commandée par Papa** était annoncée
« sans mission active ». Définition unique désormais :
`progress.service.skills_with_active_mission` (tous types), partagée dashboard + `/lacunes`.

**Deux pages ont cessé d'être des mocks** : `/lacunes` (sépare « jamais travaillée » → consolidation
de « revenue par la révision » → révision, via les **deux générateurs existants**) et `/focus`, qui
promettait « ZETIS priorisera missions, capsules et révisions » alors qu'**aucun état « focus »
n'existe côté backend** (zéro occurrence) et que le bouton n'écrivait qu'un `useState`. Réécrite sur
le seul levier réel, **`Mission.force_priority`** (plancher de score du sélecteur, ADR-0018), via
`commandConfirm` déjà écrit. ⚠️ La route Commander **n'a pas de garde d'idempotence** → les notions
déjà couvertes ne sont pas proposées.

**Vérifications faites** : 641 backend + 265 papa + 182 massimo verts ; typecheck et build verts ;
**zéro requête sur un geste de filtrage prouvé dans le navigateur** ; Cahier de bord non régressé.
Les manipulations de la base de dev (bascules de statut pour voir les branches actives) ont toutes
été **annulées** — 50 missions avant, 50 après.

**Hors v1, assumé** : bandeau de fraîcheur du Conseil ; bug d'échelle `mastery_score` 0–100 traité
comme 0–1 (antérieur, `missions/command.py`, `champion.py`, `reports/service.py` + 2 modales).

---

## Historique — chantier précédent

**Étape 2 (content_requests + correctifs orchestrateur + volet hors-programme + panneau notions
orphelines)** : **✅ COMPLET, ULTRAREVIEWÉ, MERGÉ ET POUSSÉ.**
**PR [#57](https://github.com/NeuronXcore/zetis-school/pull/57) mergée en squash → `origin/main` =
`9b53af1`** (2026-07-30) ; branche `feat/content-requests` **supprimée** (local + remote).
Migration **`c3d4e5f6a1b2`** appliquée sur Postgres dev (`alembic current` = head) — elle se rejoue
seule au démarrage (entrypoint Docker / `scripts/dev.sh`). **NE PAS RÉ-IMPLÉMENTER.**

> ⚠️ **Déploiement : il n'y a AUCUNE CI ni environnement distant.** Merger ne teste et ne déploie
> rien. Les migrations passent au (re)démarrage du backend. Variable de DB = **`ZETIS_DATABASE_URL`**
> (préfixe `ZETIS_`) — `DATABASE_URL` de `.env.example`/`DEPLOYMENT.md` est **ignoré**.

**✅ TOUT LE CHAT EST MERGÉ SUR `main` ET POUSSÉ** (`origin/main` = `9b53af1`) :
- **ADR-0026** (mémoire éphémère Redis + texte/avatar `@zetis/ui/avatar` + voix STT Whisper/TTS Piper
  locale) — commits `d03918c`→`6672df9`.
- **ADR-0027 orchestrateur** (intent typé **ancré serveur** + exécuteur voix→direct/clavier→carte +
  données inline agenda/reviews/missions + menu de notion + repli robuste) — `ff353b6`, `4fce7d6`,
  `1d3d66a`. Branches `feat/chat-memoire` + `feat/chat-orchestrateur` **supprimées** (local+remote).
  **NE PAS RÉ-IMPLÉMENTER.**

### ÉTAPE 2 — `content_requests` : MERGÉ (détail conservé pour les pièges)
Massimo réclame un contenu qui MANQUE → **liste d'attente DÉDUPLIQUÉE** que Papa traite. Résout le
**Point ouvert n°4 ADR-0027**. **Décisions figées** : `docs/decisions/adr-0027-addendum-content-requests.md`
(Accepté) + ligne `DECISIONS.md` + `adr-0027 §Points ouverts n°4` (tranché) + `page-chat.md §Garde-fous`
(« différé » → « content_requests ») + prompt `prompts/claude-code/prompt-content-requests.md`.

**Backend (module `content_requests`, patron `notions/`)** : modèle `ContentRequest`
(`db/models/progress.py`, à côté de `NotionRequest`) — `skill_id` **NOT NULL** (≠ notion_requests),
`content_kind`/`status`/`source`, `UniqueConstraint(student, skill, kind)`. Migration
**`c3d4e5f6a1b2`** (down `b2c3d4e5f8a0`) **appliquée + réversible sur Postgres dev**. Service
`create_request` **idempotent + RÉ-ACTIVANT** (une ligne triée redevient `pending`), `list_requests`
(jointure Skill → skill_name/subject_id), `set_status`, `pending_count`. Router `GET·PATCH
/api/content-requests` (`require_parent`, monté dans `main.py`, **aucune route enfant**). ✅ route
live = **401 sans token** (montée + protégée).

**Émission chat** (aveugle au contenu §1c, **best-effort non bloquant**) : `chat/actions.py` pose
`ActionResult.meta["content_request"]={skill_id, content_kind}` — mapping `_TOOL_TO_CONTENT_KIND`
(`fiche→fiche, mindmap→mindmap, cours/eli5→cours, revision→card`) sur (a) `_open_notion` contenu non
`available`, (b) `_notion_menu` vide → `cours`. `chat/service.py` : `content_signal` capté sur
`action_result.meta` **ET sur le repli** (`fallback.meta` quand LLM=intent none + notion vide) →
`_maybe_request_content` (try/except qui n'échoue JAMAIS le tour ; `create_request` fait `flush`, pas
`commit`).

**Papa = BADGE Couverture** : `production/coverage.py` **NON TOUCHÉ** (invariant read-only). Nouveau
type `@zetis/types` `ContentRequest`, lib `contentRequests.ts` (fetch/patch), `useCoverage` charge la
file en +3e `Promise.all` → `requestsBySkill: Map<skill_id, ContentRequest[]>` + `setRequestStatus`
**optimiste**. `CoverageMatrix.lessonRequestsOf(lesson, map)` fusionne par `skill_id` via
`lesson.notions.items` → badge **« ⭐ réclamé (n) »** (jamais à zéro) → `RequestedPopover` (notion +
type, Fait/Ignorer). Mutations via `content_requests`, **PAS `production`**.

**Tests** : **597 back** (+16) + round-trip **live Postgres** + 226 Papa (+2 badge) + tsc -b + build
**verts**. **Test live end-to-end JOUÉ ET VERT** (backend redémarré, Ollama réel) : émission path (a)
fiche manquante, dédup, triage Papa `done`, ré-activation — tous prouvés.

**⚠️ 4 CORRECTIFS + 1 AJOUT après 2 tests live (2026-07-30), tous validés user + VÉRIFIÉS LIVE
(backend redémarré, Ollama réel, UI Papa)** — détail `TROUBLESHOOTING.md` §content_requests + addendum
ADR §Correctifs :
- **n°2 — `galaxy.notion_panel` mentait sur le cours** (`available = lesson_id is not None` →
  `content_markdown IS NOT NULL`). Leçon validée sans cours rédigé annoncée dispo → porte vide +
  aucune demande. + signal « notion vide → cours » sur **tous** les chemins via `DURABLE_NOTION_TOOLS`.
- **n°3 — le chat GÉNÉRAIT le contenu dans `reply`** (qwen3 écrivait la leçon). `CHAT_SYSTEM`/
  `CHAT_TURN_PROMPT` durcis (« jamais écrire le cours, oriente »), `CHAT_PROMPT_VERSION → chat_v2`.
  Mitigation (petit moteur), pas garantie dure — le LLM ouvre encore parfois « Voici ta fiche… »
  mais la note honnête + l'action portent la vérité.
- **n°1 FAIT (2e test live) — résolveur strict** : `chat_skill_resolution_min_score` **0.55 → 0.72**
  (`config.py`). `nomic` donnait ~0.68 à des requêtes SANS RAPPORT (« espagnol » → « Registre de
  langue »), vrais matchs à 0.83+ ; la MARGE ne sépare pas, le score absolu si. Prouvé live :
  « verbe être en espagnol » → `skill_id null` → « je ne le trouve pas », **fini le mauvais contenu**.
- **ELI5-orchestrateur** : ELI5 dégrade vers le MODÈLE sans cours (ADR-0011) → l'orchestrateur ne
  route plus vers ELI5 quand AUCUN cours validé (il inventerait) ; honnête + demande de cours. ELI5
  offert **seulement si `cours` available** (`_notion_menu`/`_open_notion`, `chat/actions.py`). ELI5
  l'outil (galaxie) intouché.
- **AJOUT (2e message user) — Papa : NOTIFICATIONS + LISTE des demandes** : endpoint
  `GET /api/content-requests/count`, `subject_name` ajouté à la liste, **pastille de notification**
  sidebar (`PapaSidebar` sur `/demandes`, event `CONTENT_REQUESTS_CHANGED_EVENT`), **page inbox
  `/demandes` (`DemandesPage`)** groupée par matière + Fait/Ignorer + lien Couverture. **Vérifié UI
  live** (badge 1→0, triage, boucle chat→Papa).

**⚠️ VOLET HORS-PROGRAMME AJOUTÉ (2026-07-30, 3e demande user)** — ferme la moitié symétrique du Point
ouvert n°4 (« notion PAS au programme »). Détail addendum ADR §Volet hors-programme :
- **Chat émet en OPT-IN** : `resolve_skill`→None → action **`request_notion`** (carte « Demander à
  Papa d'ajouter « X » », `confirm`) ; le tap → `POST /api/ai/eli5/request-notion` (producteur ELI5
  existant). `chat/actions.py` `_open_notion` branche None + `fallback_text`=message ; `ChatAction`
  `+kind request_notion +text`. Massimo : carte + confirmation dans `ChatPage.tsx`.
- **Découverte** : « ✓ Ajoutée » ne faisait QUE le statut — **aucune création**. Deux **ponts** neufs
  (réutilisent `_upsert_skills` / `create_manual_lesson`) : `POST /api/notion-requests/{id}/add-to-program
  {subject_id}` (→ Skill) et `/create-lesson {chapter_id, generate_course?}` (→ Skill+Leçon+lien,
  cours local optionnel → leçon `draft`). Une notion hors-programme n'a pas de matière → **modale**
  Papa (matière/chapitre).
- **Inbox `/demandes` UNIFIÉE** : 2 sections (« À ajouter au programme » `notion_requests` + « Contenu
  à créer » `content_requests`) ; **pastille sommée** (`GET /api/notion-requests/count` +
  `fetchContentRequestsCount`, event `DEMANDES_CHANGED_EVENT` partagé, `lib/demandesEvents.ts`).
- **VÉRIFIÉ LIVE** (UI Papa) : chat espagnol → carte → notion_request → inbox → « Créer la leçon »
  (Français/Grammaire) → leçon 83 + Skill créées + `added` (nettoyé après).

- **Correctif UX notions orphelines** : « Ajouter au programme » (comme skills-backfill) crée une
  `Skill` SANS leçon → invisible dans la page Programme (leçon-centrée). Panneau **« 🧩 Notions sans
  leçon »** par matière (`GET /api/subjects/{id}/orphan-notions`, `OrphanNotionsPanel` dans
  `ProgrammePage`) → répare aussi le trou pré-existant du skills-backfill. **Vérifié live** (« les
  nombres complexes » visible sous Maths).

**⚠️ ULTRAREVIEW PR #57 (2026-07-30) : 5 findings `nit`, TOUS confirmés et CORRIGÉS** (commit de
suivi) — détail addendum ADR §Correctifs de revue : (1) fausse promesse « je le note pour Papa » sur
un outil hors mapping (quiz/capsule/halluciné) → repli `cours` obligatoire ; (2) fausse confirmation
Massimo si `requestNotion` échoue → confirmation dans le `try`, carte conservée ; (3) demande
réactivée non remontée → tri `updated_at` ; (4) doublon de leçon au retry après panne Ollama →
`added` marqué AVANT la rédaction + garde d'idempotence + `course_error` ; (5) émission sans rollback
→ **SAVEPOINT** `begin_nested`. 5 tests-verrous ajoutés (dont une **vraie** `IntegrityError`).
⚠️ piège test : `func.now()` a une granularité d'1 s sur SQLite → poser les dates explicitement.

**Tests : 610 back + 231 Papa + 182 Massimo + tsc + builds VERTS.** **✅ MERGÉ `main` via PR #57**
(squash `9b53af1`) — 2 commits d'origine (`2ba1a1b` chantier, `b52fb77` correctifs de revue).
⚠️ données de test en DB dev : notion orpheline « Nombres relatifs » (Maths, **non supprimable** car
historique Massimo) + quelques `notion_requests` `added` résiduelles.
Perso : [[chat-orchestrateur-adr0027]].

### NEXT (prochain chantier, à décider)
Le chantier **Dashboard Papa v2** est complet mais **non poussé** — c'est lui le prochain pas.
Pistes ouvertes ensuite : production **en lot** depuis l'inbox/la Couverture (« ⚡ Compléter le
chapitre » est encore désactivé) ; suppression du `NotionRequestsPanel` de la page Programme
(doublon avec l'inbox `/demandes`) ; quiz par notion (hors v1 ADR-0027, `location.state`) ;
**correction du bug d'échelle `mastery_score`** (0–100 traité comme 0–1) ; `/progression` est encore
100 % mockée alors que `/api/parent/progress/*` existe.

---

### Historique — Orchestrateur (ADR-0027, MERGÉ), détail conservé pour les pièges :
- **A (backend)** : le chat produit un **intent typé** que le serveur **ancre** — `resolve_action`
  (`app/modules/chat/actions.py`) : `resolve_skill` → `galaxy.notion_panel(skill_id)` (matière +
  contenus `available` + ids) → route depuis un id **validé** (fiche→`/fiches/<slug>`,
  mindmap→`/mindmaps/reconstruire/<id>`, eli5→`/eli5?skill_id=`, révision→`/revision?subject=<slug>`) ;
  cible non ancrable → `action=None` **et ZETIS le dit** ; contenu absent → note « je le note pour
  Papa » (mécanisme différé). `show_data` = le front fetch. `ChatMessageOut.action` =
  navigate|show_data|None ; `chat_turn_schema` +`intent` ; `ai_jobs` métadonnées seules (+`action`,
  jamais de texte). **581 back verts** (test-verrou « jamais de route hallucinée »).
- **B (frontend)** : `ChatPage.tsx` exécuteur — **voix→`navigate()` direct**, **clavier→carte-action
  à taper**, **`show_data`→carte inline** (`components/ChatDataCard.tsx` récupère agenda/reviews/
  missions). `lib/chatActions.ts` (`surfaceOf`, `DATA_ROUTE`), `ChatReply.action`. Le geste émet
  `chat_tool_response` (surface dérivée de la route, zéro nouvel event). **178 Massimo + tsc + build
  verts** (3 neufs : voix→navigate, clavier→carte→navigate+trace, show_data→carte). Backend relancé
  `:8000` avec l'orchestrateur.
- **Correctif post-test live (2026-07-30)** : « nommer une notion » (ex. « addition et soustraction de
  fractions ») ne redirigeait pas — qwen3 classait `intent=none`. Fix : (a) `skill_resolution` aligné sur
  la VISIBILITÉ (`Chapter`/`Lesson` validés) — évite les « pas dans ton programme » contradictoires ;
  (b) **repli serveur** : notion résolue + aucune action LLM → ZETIS **propose une carte ELI5**
  (`confirm=True`) ; (c) drapeau `confirm` → offre implicite = carte même à la voix, **auto-nav vocale
  réservée aux demandes explicites** ; (d) exemple dans le prompt. Vérifié : « fractions » → skill 127 →
  action `/eli5?skill_id=127`. 582 back + 179 Massimo verts.
- **Slice B + correctif COMMITÉS** (`4fce7d6`). **Q1 « menu de notion » FAIT (non commité)** : notion
  nommée sans outil → `notion_panel` → action **`notion_menu{name, items:[{kind,route,label}]}`** (contenus
  `available` seulement, chacun ancré via `_notion_route`) ; 1 item → carte simple, ≥2 → menu. Front :
  `ACTION_UI` extrait dans **`lib/notionActionUi.ts`** (module léger — NE PAS importer `NotionActionPanel`
  dans le chat, ça traînerait three.js) ; rendu boutons + `goMenuItem` (trace `chat_tool_response`). 583 back
  + 180 front + build verts (chat sans three). **NEXT = commit Q1 → Étape 2 : file `content_requests`**
  (nouvelle table + migration + émission chat + badge Couverture Papa + addendum ADR-0027 = Point ouvert n°4).

---

### Historique (chantier chat mémoire+voix ADR-0026, MERGÉ) — conservé pour les pièges

**Slice A backend FAITE** (commit `d03918c`) :

- **Zéro table, zéro migration** (invariant de l'ADR : le verbatim est éphémère par construction).
- **`app/modules/chat/`** : `store.py` (sessions Redis, TTL glissant `chat:{student}:{session}`,
  `InMemoryChatStore` pour les tests + dépendance `get_chat_store`), `service.py` (orchestrateur
  d'un tour), `schemas.py`, `router.py` (3 routes `require_child` sous `/api/student/chat` —
  sessions / messages / close ; **aucune route parent, aucune méthode GET**).
- **Module PARTAGÉ** `app/modules/ai/skill_resolution.py` : texte libre → `skill_id` par cosinus
  d'embeddings (nomic-embed-text, notions de l'année active + repli sur toutes), best-effort
  absolu (ne lève jamais). ELI5 en héritera (différé promu prérequis, ADR-0026 §6).
- **3 `learning_events`** dans `activity/events.py` (`chat_topic`, `chat_tool_response`,
  `chat_difficulty_declared`), émis serveur, non probants, **zéro XP**.
- **Règle Gap §3** : `source=ai_observation` (1er producteur), `severity=low` toujours,
  corroboration = `SkillMastery ∈ {unknown,weak,learning}` **et ligne existante** (sans ligne →
  pas de Gap), lacune ouverte → rien, jamais d'escalade.
- **`ai_jobs` de métadonnées seules** pour un tour (`chat_turn`) : `input=`{session,index},
  `output=`{skill_id,kind,tool_type,duration} — **jamais un texte** (pipeline aveugle §1c).
- Constantes versionnées dans `core/config.py` (`CHAT_SESSION_TTL_MINUTES=120`,
  `CHAT_MAX_TURNS_PER_SESSION=40`, `CHAT_CONTEXT_TOKEN_BUDGET=300`,
  `CHAT_SKILL_RESOLUTION_MIN_SCORE=0.55`, `CHAT_RECALL_WINDOW_DAYS=7`). Prompt versionné
  `app/prompts/chat.py` (`chat_v1`, sortie structurée — point ouvert n°1 tranché en JSON).
- **`app/tests/test_chat.py` : 16 tests d'invariants verts** (metadata sans table chat, ai_jobs
  sans verbatim, dédupes, matrice Gap, TTL, purge, anti-spam 429, zéro XP, frontière parent).
  **Suite complète : 576 back verts, zéro régression.** App démarre (40 routers).

**Slice B FRONTEND FAITE (Lot 1 texte + avatar), NON commitée** — même branche `feat/chat-memoire` :
- **Brique `@zetis/ui/avatar`** (sous-chemin dédié, patron `@zetis/ui/mindmap`) : `AvatarCanvas.tsx`
  (moteur canvas transposé de la maquette — bruit apériodique, spectre radial, coquilles
  directionnelles, horloges indépendantes iris/paupières/mâchoire), `constants.ts` calibrées,
  `phonetics.ts` (flux gelé `[ouverture, grave, médium, aigu]`), `avatar.css`, image webp extraite
  de la maquette en asset réel (`assets/zetis-face.webp`). Contrat : zéro fetch, zéro métier.
- **Page `/chat`** (`ChatPage.tsx` + `chat.css` + `lib/chat.ts` + `lib/karaoke.ts`) : états 1→5,
  karaoké piloté par la pseudo-phonétique, tap-pour-couper, carte outils APRÈS la parole seulement,
  phrase de transparence fixe, 429 doux, toggle « animations réduites », deep-link ELI5 seul câblé.
- ⚠️ **Patron réseau = INLINE, PAS le polling `/ai/jobs`** : la réponse revient dans le POST
  `messages` (la spec/prompt supposaient ELI5-polling, impossible ici car `ai_jobs.output_json`
  est durable + lisible sans contrôle → violerait §1c). Stop-on-blocker tranché par l'ADR.
- ⚠️ **Recall chip d'ouverture NON fait** : slice A n'expose aucune route « notions récentes »
  (le rappel est composé serveur pour le LLM, pas renvoyé au client). Différé, pas inventé.
- **Vérifs** : `tsc -b` propre, **173 tests Massimo verts** (6 sur `ChatPage`, dont test-verrou
  source = aucune API vocale navigateur ni stockage local), `vite build` vert. Avatar **non vu
  à l'écran** (canvas nul en jsdom ; verif live = user une fois loggé).

**Slice B Lot 1 COMMITÉE** (`71f8094`). **Lot 2 VOIX FAIT, NON commité** (même branche) — voix
complète 100 % locale, zéro nouvelle dépendance :
- **Entrée (STT)** : bouton micro appui-pour-parler → réutilise l'endpoint ELI5 Whisper
  (`/api/ai/eli5/transcribe`, local) → texte → tour de chat. `lib/dictation.ts` (MediaRecorder)
  réutilisé. Micro masqué si non supporté ou STT 503.
- **Sortie (TTS)** : route backend **`POST /api/student/chat/tts`** (Piper local, `service.synthesize_speech`,
  audio éphémère jamais persisté, 503→repli muet). Front `lib/voice.ts` : lit le WAV via un
  **`AnalyserNode`** qui pilote la bouche de l'avatar depuis le VRAI audio (la source promise du flux
  d'articulation — le consommateur `AvatarCanvas` n'a pas changé). Karaoké calé sur la durée réelle.
- Repli propre : sans `AudioContext` (jsdom/ancien navigateur) ou sur 503 → karaoké muet du Lot 1.
  iOS : `primeAudio()` sur geste (envoi/micro).
- **Vérifs** : `tsc -b` + **175 tests Massimo** + `vite build` verts ; **577 back** (test route TTS) ;
  **TTS prouvé LIVE** (`POST /tts` → HTTP 200 audio/wav 148 Ko, Piper réel). UI voix/micro **non vue**
  (canvas + audio nuls en jsdom ; login = user).

- **prochain pas : vérif humaine (tests + diff) + essai live voix/micro par le user → commit Lot 2
  → PR `feat/chat-memoire`.** Puis lots restants (hors ADR-0026) : streaming SSE, bornes de mots
  réelles pour le karaoké (TTS à timestamps), migration Rive.
  Classifieur de difficulté pas encore éprouvé sur le vrai 4B (Ollama).

**CHANTIER SUIVANT CADRÉ (docs, non commité) — Chat ORCHESTRATEUR (ADR-0027, Proposé)** : le chat
pilote toute l'app en langage naturel (« montre mes fiches sur les fractions », « c'est quoi mes
devoirs »). Cadrage écrit ce jour (fichiers **neufs**, pas de chevauchement avec le code voix) :
`docs/decisions/adr-0027-chat-orchestrateur.md`, addendum `page-chat.md §Orchestration`, 2 prompts
`prompt-chat-orchestrateur-slice-{a-backend,b-frontend}.md`, ligne `DECISIONS.md`. Cœur : intent LLM
typé **ancré serveur** (`resolve_skill` → `galaxy/notion/{skill_id}` → route depuis un id **validé** ;
cible non ancrable → `action=null`, jamais de route hallucinée) ; `ChatMessageOut.action` =
navigate|show_data|null ; **nav modale** (voix→direct, clavier→carte) ; **données dans le chat** (front
fetch, pipeline aveugle §1c) ; **orienter vers l'existant validé jamais générer** ; réutilise
`chat_tool_response` (aucun event neuf). **4 décisions à VALIDER par le user avant slices.**
Séquencement : merge chat voix d'abord → cadrage sur `main` → implémenter sur `feat/chat-orchestrateur`.

⚠️ **Piège dev (2026-07-30)** : « impossible de se loguer sur Massimo, `massimo1234` ne marche
plus » = **backend éteint**, PAS un mot de passe changé. Le front pointe `VITE_API_URL=:8000` ;
sans backend, le login échoue avec une erreur d'auth trompeuse. Fix : relancer
`uv run uvicorn app.main:app --port 8000` depuis `apps/backend`. Aucun override `MASSIMO_*` en
`.env` — le mot de passe reste `massimo1234` (dev_users, `config.py`).

⚠️ **Écarts read-before-code du chat, à ne pas re-débattre** :
- **`ai_jobs` n'est PAS asynchrone** (ni worker ni polling) : ELI5 exécute le LLM en synchrone
  dans le POST. Le chat suit ce patron synchrone — d'où « aveugle au contenu » trivial.
- **Aucun embedding stocké par `Skill`**, pas de lien direct Skill→année active : la résolution
  vectorise les notions candidates à la volée (jointure SchoolYear active → LessonSkill → Skill,
  repli toutes notions si vide).
- **Redis n'avait aucune convention session/TTL** (seul RQ média l'utilisait) : `store.py` la
  crée (doctrinalement prévu, ARCHITECTURE §Redis).

⚠️ **Chantier précédent — Agenda scolaire (ADR-0025) : COMPLET, MERGÉ `main` PR #56** (squash
`f8c5e28`), branche supprimée. Backend + page Papa + page Massimo. **Ne pas ré-implémenter.**
Piège hérité, toujours vrai et réutilisé par le chat : trois lecteurs de `learning_events`
n'étaient **pas** filtrés par `event_type` (`activity._load_events`,
`activity._trailing_inactive_days`, `motivation._active_days`) → frozenset `NON_ACTIVITY_EVENTS`
(`activity/events.py`). Les 3 événements de chat sont **non probants** parce qu'`evidence` ne lit
que `mission_verdict` (test-verrou) — pas besoin de les ajouter au frozenset (qui ne concerne que
les projections d'activité, pas l'évidence).

**Chantier précédent — ZETIS Galaxy : MERGÉ** dans `main` (PR #55, merge `af039d0`).
La section ci-dessous est conservée pour ses pièges, pas pour son état.

Le chantier a été ouvert comme un cadrage (maquette → spec → ADR-0024 → prompts), puis le user a
demandé d'enchaîner l'exécution dans la même session. Les deux slices y sont : backend `galaxy`
(4 routes + frise, **aucune migration**) et frontend Massimo (page Progression refondue + aperçu
sur l'Accueil). **Vérifié à l'écran sur la vraie base**, pas seulement en test.
Voir §« Chantier ZETIS Galaxy » plus bas pour les pièges — ils sont coûteux à re-découvrir.

Le chantier « Couverture de production »
(ADR-0023) est **MERGÉ** : PR [#54](https://github.com/NeuronXcore/zetis-school/pull/54), merge
commit `dc82f9c`, **7 commits conservés individuellement** (merge commit délibéré, pas de squash :
chacun est autonome et revertable seul, ce qui comptait surtout pour `chore(assets)`). Branche
`docs/couverture-production` supprimée en local et sur `origin`.

⚠️ **Ne pas ré-implémenter** la Couverture : elle est complète et sur `main` — backend
(`production` + `engagement` + provenance), page Papa, passe visuelle, convention d'assets.

### Dépôt nettoyé (2026-07-28) — 4 branches et 2 stashes, rien de perdu

**État : `main` seule, local et distant. Zéro branche, zéro stash.**

Les 4 branches supprimées étaient toutes vérifiées fusionnées **avant** suppression, et leurs tips
restent restituables à vie par les refs de PR que GitHub conserve
(`git fetch origin refs/pull/<n>/head`) :

| Branche supprimée | Preuve | Tip archivé |
|---|---|---|
| `feat/activite-backend` | PR #52 · SHA fusionné = tip | `refs/pull/52/head` → `1284deb` |
| `feat/motivation-massimo` | PR #53 · SHA fusionné = tip | `refs/pull/53/head` → `befe91e` |
| `mindmap` | tip ancêtre de `main` | `refs/pull/51/head` → `3d2b499` |
| `mission` | PR #46 · tip ancêtre de `main` | `refs/pull/46/head` → `cb3d581` |

**Les 2 stashes ont été récupérés avant d'être vidés** (commits `08c5723` + `d1b70ba`) :

- `stash@{1}` (4 semaines, `feat/design-system`) portait **deux specs jamais atterries** —
  `docs/frontend-massimo/navigation.md` et `zetis-galaxy.md`, 265 lignes. Vérifié : « galaxy »
  n'existait nulle part ailleurs dans le dépôt. ⚠️ Elles arrivent avec un **bandeau de réserve** :
  elles se déclarent normatives alors qu'elles n'ont jamais été confrontées au code, et 4 semaines
  de développement ont passé. **Ne pas les faire appliquer sans les vérifier ligne à ligne.**
  ZETIS Galaxy reste une conception **non implémentée**.
- `stash@{0}` (24 h) enrichissait l'index des ADR. Repris : les descriptions 0001→0005 et les
  amendements ADR-0017. Le reste (0012→0019) existait déjà dans `main` sous une formulation plus
  récente — sa version de `DECISIONS.md` était antérieure à l'ADR-0023, la restaurer en bloc aurait
  fait régresser le fichier. Écart connu et assumé : pour ADR-0018 et ADR-0019, la ligne d'index du
  stash était plus longue que celle de `main` ; les ADR eux-mêmes sont intacts.

⚠️ **Deux pièges de diagnostic**, à connaître avant de refaire ce contrôle :

- **`git branch --merged` ne liste PAS `activite` ni `motivation`.** Les PR #52 et #53 ont été
  **squashées** : les commits d'origine ne sont donc pas ancêtres de `main`, seul leur contenu y
  est (`6e7cb78`, `40bcef8`). L'outil dit vrai sur la topologie et faux sur le fond — s'y fier
  seul ferait conclure à du travail perdu.
- **Le diff de contenu vs `main` n'est pas un test** : 1188 et 484 lignes d'écart, mais c'est
  `main` qui a avancé depuis sur les mêmes fichiers. Comparer un tip figé à une trunk qui bouge ne
  prouve rien.

Le seul test qui tranche pour une branche squashée : **`gh pr view <n> --json headRefOid`** (le SHA
que GitHub a réellement fusionné) comparé au tip local **et** distant. S'ils sont identiques, rien
n'a été poussé après la fusion.

### Session 2 (2026-07-28) — passe visuelle `/couverture` + rangement des assets

La passe visuelle demandée au « prochain pas » a été faite, **pilotée par le user** qui regardait
la page dans son propre navigateur (l'agent n'a jamais eu de session Papa : il ne saisit pas de
mot de passe). Quatre retours, quatre livrables — détail dans `docs/frontend-papa/page-couverture.md`
§Passe visuelle :

1. **KPI cliquables** → chacun ouvre son complément (« 27/78 cours » ouvre les 51 restants). La
   pilule « 🔒 Bloquées » a été **scindée** en `🔒 Non validées` / `📝 Sans cours` : elle mélangeait
   les deux causes, or `blocked_no_course` ne contient que des leçons *validées* — « Leçons
   validées » ne pouvait pas pointer dessus sans se contredire.
2. **Pictogrammes de matière** sur les en-têtes de matrice **et** en pastilles de filtre (le
   `<select>` a disparu). `SubjectPictogram` extrait de `SubjectFilterChips` → un seul rendu.
3. **Expanders par matière** : repliés en vue d'ensemble, dépliés dès qu'un filtre ou une matière
   est demandé, avec rappel d'anomalies (`🔒 4  ⏳ 2`) calculé sur la matière **entière**.
4. **Icône `CouvertureIcon`** (fournie par le user) + respiration lumineuse, aux 3 endroits qui
   désignent la Couverture (en-tête animé, sidebar, relais Dashboard).

**Rangement des assets, hors chantier mais demandé explicitement** (« mets de l'ordre », puis
« go ») : ~9,8 Mo retirés des bundles (Massimo 10,3 Mo → 1,6 Mo ; Papa 2,1 Mo → 1,0 Mo), 11
originaux rapatriés dans `assets/brand/icons/`, 2 doublons exacts supprimés, planche de contact
sortie du glob. La **règle a été inversée** dans `assets/brand/README.md` : les visuels importés
vivent dans `src/assets/`, pas dans `public/assets/` — c'est ce que le code faisait déjà, la doc
avait tort. Voir §DÉCISIONS ACTIVES.

**Vérifié** : 212 Papa + 111 Massimo verts, `tsc -b` et `vite build` verts sur les deux apps.
L'icône et son animation ont été prouvées sur un **banc d'essai isolé** (le navigateur intégré
n'étant pas connecté) : capture + `getAnimations()`. Le reste de la page **n'a toujours pas été vu
de bout en bout par l'agent**.

### Chantier « Couverture de production » (ADR-0023) — CLOS

Quatre commits, dans cet ordre (chacun dépend du précédent) :

1. **`8c993b6` docs** — ADR-0023 + addenda ADR-0011 §E (fraîcheur) et §F (provenance), 4 ADR
   amendés, maquette + spec + 2 prompts de slice.
2. **`02f37a9` engagement** — prérequis : module neutre `engagement` + exception « mission
   engagée » sur les chemins d'achèvement des mindmaps.
3. **`586b202` production (backend)** — `is_stale`, provenance (migration `d5e6f7a8b9c0`),
   modèle de lecture + 2 endpoints `require_parent`.
4. **(ce commit) frontend + correctifs** — page Couverture, liens ciblés, validation en lot,
   et deux défauts de schéma/UX corrigés (voir ci-dessous).

**Migrations appliquées sur la DB de dev** : `d5e6f7a8b9c0` (provenance, 6 tables, reprise NULL)
et `e6f7a8b9c0d1` (horodatages `fiches`/`mindmaps`).

**Vérifié** : 518 back + 203 Papa verts, `tsc -b` et `vite build` verts, un seul head alembic.
Modèle de lecture éprouvé sur **Postgres réel** (69 leçons, 18 requêtes, 79 ms — aucun N+1).

⚠️ **Ce chantier n'a PAS été vérifié à l'écran de bout en bout** : la session Papa du navigateur
intégré a expiré en cours de route, et l'agent ne saisit pas de mot de passe. Le user a testé
manuellement et a remonté 3 défauts réels que les tests ne voyaient pas (cf. `TROUBLESHOOTING.md`
§ chantier `couverture`). **La prochaine session doit commencer par une passe visuelle.**

### Ce que le user a remonté et qui reste ouvert

- **Colonne Fiche** : le lien ciblé surligne la carte mais n'ouvre pas sa modale — volontaire
  (c'est un ÉDITEUR, pas une vue), à trancher si la symétrie avec quiz/mindmap est préférée.
- **Ouverture auto de la modale mindmap** : ajoutée sur un malentendu de ma part (le user parlait
  de la colonne *Cartes*, pas *Mindmap*). Défendable en soi — à confirmer ou retirer.
- **5 générations non voulues** dans la DB dev (jobs #316→#320), **gardées** sur décision du user.
  « Calculs avec priorités et nombres relatifs » reste en `draft` : son cours vient d'être rédigé,
  le gate ADR-0009 §A joue son rôle — **ne pas la revalider mécaniquement**.

### Derniers chantiers mergés (repères)

- **Conseil de classe IA (ADR-0020) + équipement de mission (ADR-0021)** — PR #48 (`639209e`).
  Module backend `reports` : narration LLM **locale** sur le service d'évidence, rapport **persisté**
  (`council_reports` + `evidence_snapshot_json`, migration `b8c9d0e1f2a3`), recommandations typées →
  missions via Commander ; **équipement** = « Créer ces missions » génère + auto-valide le kit
  (cours/fiche/SRS/quiz/mindmap), **jamais de régénération** de l'existant. Front Papa
  (`ConseilClasseIAPage` + `lib/councilClass.ts` + `hooks/useCouncilClass.ts`) + liste missions
  Massimo (`origin` papa/zetis + badge ✨ new).
- **Missions ADR-0017/0018/0019** (moteur, Commander, step mindmap, frontends) — PR #46.
- **`generate_revision` mono-notion** (ADR-0017 §5) — PR #47.

### DÉCISIONS ACTIVES (figées — ne pas rouvrir ; détail dans les ADR)

- **Couverture** : `absent` se déduit de **l'existence de la ligne**, jamais d'une date — une
  date nulle rend seulement le *périmé* indécidable. Le **cours n'entre pas** dans le pourcentage
  de dérivés (il en est la condition). **Aucun agrégat de provenance** (§F.2), aucun tri, aucun
  score par matière : la page répond à « où j'en suis », elle ne produit pas un classement.
- **§F** : `mark_validated` est l'**unique** point d'écriture de `validated` ; toute action
  groupée écrit `parent_bulk` **sans exception** ; `system` est **strictement réservé au quiz**
  (test-verrou). Une leçon déjà validée n'est jamais re-tamponnée par un lot.
- **Assets (session 2)** — l'original pleine résolution va dans `assets/brand/`, la **réduction**
  (suffixe `_256` / `_384`, dimensionnée sur le rendu réel **× 3** car Massimo tourne sur iPhone)
  va là où le code l'importe : `packages/ui/src/assets/` si les deux interfaces s'en servent,
  `apps/frontend-<app>/src/assets/` sinon. **`public/assets/` n'est plus le point de dépôt** — un
  `import` TS fait échouer le build si le fichier manque, hashe le nom pour le cache, et sort du
  bundle ce qui n'est plus utilisé. Règle complète : `assets/brand/README.md`.
- **Couverture — KPI** : un KPI ouvre son **complément**, pas ce qu'il compte (un chiffre atteint
  ne se travaille pas). Les cartes restent cliquables même à zéro (choix du user).
- **Couverture — expanders** : repliés en vue d'ensemble, **dépliés dès qu'on demande quelque
  chose d'explicite** (pilule d'état ou matière). On ne cache jamais ce qui vient d'être demandé.
  Les rappels d'anomalies sont des **comptes**, jamais un pourcentage — le « aucun score par
  matière » ci-dessus tient toujours.
- **Vocabulaire** : « Mindmap » ≠ « carte (de révision) ». Ne jamais écrire « carte mentale »
  dans l'UI Papa — les deux colonnes sont voisines dans la matrice.
- **Capsules** : non générables en un clic **par construction** (l'API exige une `instruction`
  écrite par Papa). Depuis la Couverture, on ouvre le compositeur pré-rempli — avec `skill_id`,
  sans quoi la capsule ne compte dans aucune fraction.

- **Activité — 2 `event_type` RÉUTILISÉS au lieu d'être dupliqués.** La spec demandait
  `eli5_reverse` et `mission_completed` ; le code émettait déjà, au même instant et pour le même
  acte, `reverse_eli5` (`eli5/service.py`) et `mission_verdict` (`missions/service.py`, posé là
  où `mission.status` passe à `completed`). Les ajouter aurait créé **deux événements pour un
  seul acte** → double comptage dans la heatmap ; les renommer aurait cassé leurs lecteurs
  (`evidence.VERDICT_EVENT`, `completed-today`). Constantes `EVENT_ELI5_REVERSE` /
  `EVENT_MISSION_COMPLETED` dans `activity/events.py`. **7 hooks neufs, pas 9.**
- **Activité** : `POST /api/missions/{id}/complete` de la spec **n'existe pas** et n'a pas été
  créé — les missions se terminent par étape (`/{id}/steps/{step_id}/complete`).
- **Activité** : sessions **jamais stockées** (reconstruites à la lecture) ; `xp_events` et
  `learning_events` **jamais en UNION** ; `days_inactive` toujours calculé **toutes matières**,
  même sous filtre.
- **ADR-0020** : rapport Conseil **persisté** (LLM non rejouable) ; `skill_id` **ancrés** sur
  l'évidence ; 100 % local ; Papa-only ; recommandation → missions **mono-notion** via Commander.
- **ADR-0021** : popup Papa = approbation → **auto-validation** du kit (soupape §5ter bornée) ;
  **jamais de régénération** d'une pièce déjà créée (même `pending`) — on valide l'existant + génère
  le manquant ; équiper **avant** de créer la mission.
- **Missions Massimo** : champ d'affichage `origin` (papa/zetis), **pas** l'enum `created_by`
  (pilot-only) ; badge « new » = mission `planned`.

### Chantier ZETIS Galaxy — CADRÉ **ET LIVRÉ** le 2026-07-28

Branche `feat/galaxy`, poussée. **PR à ouvrir.** 157 tests Massimo + 542 backend, typecheck
Massimo + Papa, build — verts. Vérifié **à l'écran sur la vraie base** (Postgres + backend :8003).

**Livré** : cadrage complet (maquette, spec réécrite, ADR-0024, 2 prompts) **+** module backend
`galaxy` (4 routes élève + frise, **aucune migration**) **+** frontend Massimo (page Progression
refondue, aperçu Accueil 2 colonnes, brique `@zetis/ui/galaxy` + sous-chemin `/canvas`).

⚠️ **Ne pas ré-implémenter.** Détail des routes : `API_SPEC.md` §ZETIS Galaxy.

**Trois amendements de l'ADR-0024, tous par décision explicite du user en cours de session** —
ils sont écrits dans l'ADR avec leur date et leur coût, ne pas les rouvrir sans raison :

1. **§9 rouvert** : un graphe **global** existe sur l'Accueil, alors que l'ADR l'excluait. Coûts
   bornés (canvas en `lazy()`, repli sur matières+chapitres au plafond), pas ignorés.
2. **§4 révisé** : la panoplie **complète** est renvoyée avec `available`, au lieu d'omettre
   l'indisponible. Justification : une fiche manquante n'est pas un échec de l'enfant.
3. **2D → 3D** : `@xyflow/react` avait été retenu pour son coût nul, puis disqualifié par
   l'exigence 3D. Deux moteurs graphe coexistent ; **ADR-0016 non rouvert**, les mindmaps gardent
   React Flow.

**Ce que le read-before-code a invalidé dans le brouillon** — à ne pas re-découvrir :

1. **`Skill.prerequisite_skill_ids` n'existe pas** (ni colonne, ni table) et **`parent_skill_id` est
   NULL partout** (`curriculum/service.py:501-521` ne l'écrit jamais). Les « liens stellaires »
   n'avaient **aucune source de données**. → arêtes dérivées de
   `Skill ← lesson_skills → Lesson → Chapter`, rien d'autre.
2. **`GET /progress/skills` n'existe pas**, et `progress` est **Papa-only** (`require_parent`).
   → trois routes élève neuves sous `/api/student/galaxy`.
3. **`/progression` est déjà un onglet** avec une page XP/badges, dont la section « par matière »
   est **mockée**. → la Galaxy prend sa place, l'existant prime sur `navigation.md`.
4. **Seul ELI5 est notion-adressable par URL** (`/eli5?skill_id=N`) ; Quiz et Révision passent par
   `location.state`, Cours/Fiches/Mindmaps par matière. Et **aucune fonction backend** ne dit « pour
   ce `skill_id`, quels contenus validés existent » (`production/coverage.py` est leçon-centrée
   **et** Papa-only). → 3ᵉ route `galaxy/notion/{skill_id}`, réutilisant les résolveurs de
   `missions/service.py:76,98`.

**Pièges rencontrés À L'EXÉCUTION** — chacun a coûté un aller-retour, aucun n'est théorique :

- `SkillMastery.status` a **SIX** valeurs, pas cinq : `in_progress` est écrit par
  `missions/service.py:859` et ne sort d'aucun `_status_from_score()`. Un mapping à 5 branches le
  manque **en silence**.
- `mastery_score` est sur **0–100** ; `evidence.mastery_by_skill()` renvoie la valeur **brute**.
- **Massimo a trois postes, pas un** (précisé par le user le 2026-07-28) : **iPhone, iPad et un
  MacBook dédié à l'école**. Ne pas re-rédiger « l'iPhone est la cible » — c'est le poste le plus
  **contraint**, et ce sont l'iPad et le MacBook qui donnent son sens à la 3D. D'où un plafond de
  nœuds **adaptatif** (40 / 90 / 150, provisoire) et l'interdiction de faire dépendre quoi que ce
  soit d'essentiel du **survol**, qui n'existe pas au tactile.
- **Le `lazy()` ne suffit pas à isoler Three.js.** Ré-exporter le canvas depuis le baril
  `@zetis/ui/galaxy` le faisait entrer dans le bundle de départ (**3,6 Mo**, mesuré). D'où le
  sous-chemin dédié `@zetis/ui/galaxy/canvas`. Ne pas « simplifier » ce baril.
- **Un matériau très émissif APLATIT une sphère** : elle s'éclaire uniformément, plus d'ombrage
  ni de reflet, elle se lit comme un disque. Vrai pour le soleil comme pour le cerveau — garder
  l'émission basse et mettre l'éclat dans les **aures**.
- **Un panneau face caméra est plat par construction** : le pictogramme de matière plaqué sur le
  soleil masquait le limbe ombré. Il a été retiré du soleil (il reste sur l'écran d'ensemble).
- **Sans nœud racine, les composantes se disloquent** (le moteur de forces éloigne les
  composantes disjointes) — d'où `subject` dans une constellation et `root` dans le graphe global.
- **La remontée de l'or doit être TRANSITIVE** : un seul cran suffit dans une constellation mais
  pas dans le graphe global (3 niveaux) — les liens du cerveau restaient éteints.
- **Tailwind v4 pose `cursor: default` sur les `<button>`** (changement vs v3) : `cursor-pointer`
  est explicite partout où l'interactivité doit se voir.
- **En construisant soi-même les objets 3D, `nodeVal`/`nodeColor`/`nodeRelSize` cessent de
  s'appliquer** — reproduire la formule de la lib (`∛volume × rayon`), sinon les nœuds
  rapetissent d'un coup et deviennent inatteignables au doigt.
- **`GalaxyCanvas` ne filtre plus les clics** : il filtrait sur `kind === "skill"` et avalait les
  clics sur les soleils. C'est l'appelant qui décide du sens d'un clic.

**Vérification : mesurer que ça BOUGE ne prouve pas que ça se VOIT.** Trois rendus ont dû être
repris parce que je validais une propriété calculée (`background-position` qui change, animation
déclarée) au lieu de comparer deux captures d'écran. Les captures comparées sont le seul test
utile sur du visuel.

**Vérifié par le user (2026-07-28)** : **MacBook OK**, l'animation est fluide au plafond desktop
(150 nœuds). C'était le poste le plus confortable des trois.

**Reste ouvert** :

- **iPhone et iPad non essayés.** L'iPhone est le poste contraint : c'est lui qui décide si le
  palier `compact` (40) doit baisser. Si ça coince, on baisse CE palier — on ne retire pas la 3D
  des deux autres.
- **`prefers-reduced-motion` toujours non vérifié à l'écran.** Le panneau navigateur ne l'émule
  pas, et le retour « ça bouge sur mon Mac » prouve justement que l'option est **désactivée**
  chez le user — donc le chemin où tout doit se figer n'a jamais été exercé en vrai. Couvert par
  tests unitaires (`particlesFor`) et par la variante `motion-safe:`, rien de plus.
  Pour l'essayer : Réglages Système → Accessibilité → Affichage → Réduire les animations.

### PROCHAIN PAS

**0 bis. MERGER LA PR [#59](https://github.com/NeuronXcore/zetis-school/pull/59)** (connexion) —
`main` est rapatriée dans la branche, le conflit `CHANGELOG` est résolu et la version renumérotée
en `0.30.0`. C'est la dernière PR ouverte.

> ~~Pousser `feat/dashboard-papa-v2` et ouvrir la PR~~ → **fait, mergé** (PR #60, `04b6814`).
> Reste à la charge du user, que l'agent ne peut pas faire : relire l'**amendement de l'ADR-0017
> §5bis** — c'est un changement de **doctrine** du moteur de missions, pas un correctif
> d'affichage.

0. **Ouvrir la PR de `feat/galaxy`** — la branche est poussée, rien n'est mergé.
   Vérifications à la charge du user, que l'agent ne peut pas faire : **MacBook ✅ fait**,
   restent **iPhone + iPad** (plafonds 40/90 provisoires) et **`prefers-reduced-motion`**.
1. **Trancher le sort de la photo de Massimo** —
   `apps/frontend-massimo/src/assets/app/ChatGPT Image 5 juil. 2026, 14_36_01.png` (2 Mo, 1254 px)
   est une **photo du visage de l'enfant** montée dans une icône de progression. Elle est
   versionnée, **importée nulle part** (elle ne pèse que dans git). Laissée intacte
   volontairement : l'agent ne décide pas seul du sort d'une image d'un mineur. Trois options —
   garder / renommer et ranger dans `assets/brand/icons/` / sortir du dépôt.
2. **Une fois la Galaxy mergée**, au choix : **file de relecture** (prérequis dur du cron
   ADR-0023 — automatiser la fabrication d'un goulot est le seul vrai risque), ou **production
   en lot** (§7 : deux passes non fusionnables, cours puis équipement), dont le bouton
   « ⚡ Compléter le chapitre » marque déjà l'emplacement, désactivé.
3. ~~ZETIS Galaxy = chantier à ouvrir~~ → **LIVRÉ le 2026-07-28**, cadrage et code.
   Voir §« Chantier ZETIS Galaxy ». Suites possibles, hors v1 : graphe de **prérequis** (la
   donnée n'existe pas, c'est un chantier pédagogique à part), annonce « +1 étoile » en fin de
   mission, animation temps réel poussée par événement, réconciliation de `navigation.md`.
4. Restent ouverts, sans urgence : le **test flaky** `ProgrammePage` (barre de progression
   temporisée, cf. `TROUBLESHOOTING.md`), et la **vérification à l'écran de bout en bout** de la
   Couverture, que l'agent ne peut pas faire sans session Papa.

### Repères (orientation)

- `graphify explain "production"` / `"provenance"` / `"engagement"`. Back :
  `app/modules/production/` (modèle de lecture), `app/modules/provenance.py` (unique écrivain de
  la validation), `app/modules/engagement/` (exception mission engagée). Front papa :
  `CouverturePage.tsx`, `components/couverture/`, `lib/pilotageLinks.ts`, `hooks/useCoverage.ts`,
  `lib/coverageFilters.ts` (fonctions pures : pilules + `subjectAnomalies`),
  `components/CouvertureIcon.tsx`. Partagé : `packages/ui/src/components/subject-pictogram.tsx`.
- Visuels : `assets/brand/README.md` §Règle principale (source de vérité de la convention).
- Décisions : `DECISIONS.md` (index ADR complet 0001→0023, avec les 3 addenda ADR-0009/0011) +
  `docs/decisions/`. Modèle : `DATA_MODEL.md`. API : `API_SPEC.md`. Pièges : `TROUBLESHOOTING.md`.
- Données de test laissées en DB dev (council_report id 1, missions manual, kits générés) — sans
  conséquence.
