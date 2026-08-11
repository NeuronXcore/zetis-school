# BACKLOG.md — Backlog fonctionnel ZETIS

## Priorité P0 — indispensable MVP

### Initialisation projet

- Créer monorepo.
- Créer `apps/frontend-massimo`.
- Créer `apps/frontend-papa`.
- Créer `apps/backend`.
- Créer `docker-compose.yml`.
- Ajouter PostgreSQL.
- Ajouter Redis.
- Ajouter MinIO.
- Ajouter healthchecks.
- Ajouter `.env.example`.

### Frontend Massimo

- Dashboard enfant.
- Sidebar avec : Accueil, Matières, Cours, Révision, Diagnostic, ELI5, Capsules IA, Missions, Quiz, Progression, Mindmaps, Chat ZETIS.
- Page matières.
- Page matière dédiée.
- Page cours. **(FAIT 2026-07-03** : `/subjects/:slug/cours` branchée sur le bouton
  « Cours » de MatiereDetailPage, via les routes élève `GET /api/student/cours/{slug}` et
  `GET /api/student/lessons/{id}/cours` — validé uniquement, filtrage serveur, spec
  `docs/frontend-massimo/page-cours.md`. Reste : XP à la lecture, quiz de fin de cours ;
  notions → skill_mastery.)
- Page quiz.
- Page progression XP.

### Frontend Papa

- Dashboard parent.
- Vue progression Massimo.
- Vue lacunes.
- Vue matières (thèmes/chapitres persistants ; renommée depuis « Matières & programmes » le 2026-07-03).
- Vue diagnostics.
- Cahier de bord IA.
- Paramètres.

### Backend

- Modèles users.
- Modèles school years.
- Modèles subjects.
- Modèles lessons.
- Modèles quizzes.
- Modèles attempts.
- Modèles progress.
- Modèles missions.
- Routes health.
- Routes auth simple.
- Routes subjects.
- Routes lessons.
- Routes quizzes.
- Routes progress.

## Priorité P1 — vraie valeur pédagogique

### Diagnostic

- ✅ Diagnostic initial 5e/4e (QCM générés par IA, par notion).
- ✅ Score par notion (+ upsert maîtrise `skill_mastery`).
- ✅ Priorisation lacunes (`gaps` ouvertes, sévérité medium/high).
- ✅ Génération missions de remédiation depuis les lacunes (étape 15 ; complétion → gap résolue + XP).
- ✅ Réutilisation du diagnostic plusieurs fois dans l’année (re-passation marquée `taken`).
- Diagnostic multi-matières en une session + difficulté adaptative.

### ELI5

- Génération explication simple.
- Questions de compréhension.
- Mode reverse écrit.
- Mode reverse vocal.
- Feedback bienveillant.
- Score compréhension.

### Spaced memory

- Cartes par notion (1–3 par skill via `card_type`, validées par Papa). *(à faire —
  chantier dérivé du cours canonique, ADR-0011)*
- Intervalles de révision. **(FAIT 2026-07-04** : moteur MVP, module `memory`.)
- Prochaine révision. **(FAIT 2026-07-04** : replanification `due_at` selon le rating.)
- Révision automatique dans missions. *(à faire)*
- Page Révision Massimo `/revision` : decks circulaires par matière + mélanges
  (spec `docs/frontend-massimo/page-revision.md`, mockup validé 2026-07-04). *(à faire —
  slice UI ; backend prêt : `GET/POST /api/student/reviews/*`)*
- Plafonds de session serveur (mélange 12 / matière 8 / éclair 5) + entrelacement
  des matières côté serveur. **(FAIT 2026-07-04** : `build_session` + helper pur `interleave`.)
- Popups de fin de session à 3 paliers *(à faire — UI)* + re-tour des cartes fragiles
  (1× max, sans effet SRS, XP réduit, détection consolidation côté serveur). **(Backend
  FAIT 2026-07-04** : consolidation détectée serveur, XP +2 ; le « 1× max » reste côté UI.)
- **Unifier ou renommer les deux `new_count` de `memory`** — `get_reviews_summary()["new_count"]`
  (cartes dues **et** jamais révisées, badge des decks EN PAGE) et `new_cards_count` (jamais
  révisées, témoin de NAVIGATION) portent le même mot pour deux choses. La divergence est
  volontaire, et documentée dans les deux docstrings (ADR-0030 §3) — mais deux fonctions voisines
  au même nom se font fusionner au premier refactor. Un renommage suffirait probablement.
  *(ouvert le 2026-08-01)*

  ### Agenda scolaire (ADR-0025)

- ~~Lot 1 — l'objet~~ : **FAIT (2026-07-29)** — table `agenda_items`, co-édition, bande
  glissante, « ce qui arrive », page Papa, page Massimo. Vérifié à l'écran de bout en bout.
  Deux ajouts non prévus par le cadrage : le frozenset `NON_ACTIVITY_EVENTS` (trois lecteurs de
  `learning_events` n'étaient pas filtrés par `event_type`) et la table `app_settings` (le
  verrou de phase devait être un geste de Papa, pas une variable d'env).
- Lot 1 bis — ouverture de la saisie élève : composer + garde-fou doublon, derrière
  `AGENDA_STUDENT_ENTRY_ENABLED`, + interrupteur côté Papa. *(sur décision, pas sur calendrier —
  revue de la phase 0 à 4 semaines)*
- Lot 3 — l'analyse (ADR-0025 §11) : `chapter_id` + sélection référentiel, panneau d'analyse
  Papa, pont vers le Commander, session de révision sans écriture SRS, quiz blanc.
  *(ne dépend que du Lot 1)*
- ~~Lot 2 — parsing~~ : **supprimé** (ADR-0025 §Périmètre). À rouvrir uniquement si la saisie
  élève est ouverte.

## Priorité P2 — IA avancée

### RAG

- ✅ Import PDF (+ MD/TXT) — `POST /api/rag/upload`.
- ✅ Extraction texte (`modules/rag/extract.py`, pypdf).
- ✅ Chunking.
- ✅ Embeddings (ollama `nomic-embed-text`, 768d).
- ✅ Recherche vectorielle (pgvector cosinus).
- ✅ Validation Papa des sources (`validate`/`reject`, page « Sources de cours »).
- Réponse sourcée dédiée (`/rag/answer` + citations/confiance).
- Stockage du fichier brut (MinIO).
- RAG sur productions de Massimo.

### Capsules IA

- Génération script.
- Storyboard.
- Audio TTS.
- Slides.
- Publication.
- Quiz post-capsule.

### Mindmaps

- Mindmap remplie.
- Mindmap à compléter.
- Reproduction par Massimo.
- Export image/JSON.
- Score de restitution.
- **Suivi de vue réel** — `POST /api/student/mindmaps/{id}/seen` était un **no-op** (ADR-0016) :
  la route existait, la donnée non. **FAIT le 2026-08-01** (ADR-0030 §4) : table `mindmap_views`
  calquée sur `fiche_views`, migration `d2e3f4a5b6c7`, `service.mark_seen` persiste désormais.
  Mindmaps porte son témoin de nouveauté en navigation ; plus aucune famille de dérivés n'en est
  dépourvue.

### ZETIS Galaxy — vue graphe des connaissances (Massimo)

**LIVRÉ le 2026-07-28** — branche `feat/galaxy`, PR à ouvrir. ⚠️ **Ne pas ré-implémenter.**
Décisions : **ADR-0024** (amendé 3 fois en cours de chantier). Spec :
`docs/frontend-massimo/zetis-galaxy.md`. Routes : `API_SPEC.md` §ZETIS Galaxy.
Pièges d'exécution : `MEMORY.md` §Chantier ZETIS Galaxy.

Reste à la charge du user, non vérifiable par l'agent. **MacBook vérifié le 2026-07-28** (fluide
au plafond desktop de 150). Restent l'**iPhone** et l'**iPad** (paliers 40/90 provisoires), et
**`prefers-reduced-motion`** — non exercé, l'option étant désactivée sur la machine du user.

Idée : la page de progression de Massimo rendue comme une galaxie qu'on allume. Étoile = `Skill`,
constellation = matière, amas = chapitre, luminosité = `SkillMastery.status`. **Pas de rouge,
jamais de manque** — une notion non vue est une étoile pas encore née, pas un échec.

Décisions prises (détail et justifications dans l'ADR) :

- **Emplacement** — la Galaxy est la **surface unique** de progression, sur **`/galaxy`** (même
  onglet, renommé « Ma Galaxie » le 2026-07-31 ; `/progression` redirige). La section « par
  matière » **mockée** disparaît. Depuis le 2026-07-31, `/galaxy` s'ouvre sur la **galaxie
  complète, toutes matières** — l'Accueil, lui, n'en porte qu'une **carte-bouton statique** et ne
  charge plus Three.js (addendum ADR-0024).
- **Moteur de rendu** — **`react-force-graph-3d`**, en `lazy()`. Le user a demandé un graphe **3D
  animé, aux nœuds étirables** : `@xyflow/react` (canvas 2D) est techniquement disqualifié. Deux
  moteurs graphe coexistent désormais — React Flow reste celui des mindmaps (ADR-0016, non rouvert).
- **Arêtes** — dérivées de la **structure réelle uniquement** (`Skill ← lesson_skills → Lesson →
  Chapter`). ⚠️ Le read-before-code a montré que **`prerequisite_skill_ids` n'existe pas** et que
  `parent_skill_id` est **NULL partout** : les « liens stellaires » du brouillon n'avaient aucune
  source. Un graphe de prérequis reste possible, mais c'est un chantier pédagogique à part.
- **Contrat API** — `GET /progress/skills` **n'existe pas** et `progress` est Papa-only. Trois
  routes élève neuves sous `/api/student/galaxy`, assises sur `evidence.mastery_by_skill()`.
  Aucune table, **aucune migration**.
- **Clic sur une étoile** → panneau d'actions. ⚠️ Seul ELI5 est notion-adressable par URL
  aujourd'hui, d'où une troisième route dédiée. Une action sans contenu validé **n'est pas
  proposée**.
- **Doctrine** — l'ADR fige rétroactivement : pas de rouge, **aucun score ni pourcentage par
  matière** (un **compte** d'étoiles allumées), **aucun capital perdable** (pas de streak, une
  étoile allumée ne s'éteint pas).

Prompts prêts : `prompts/claude-code/prompt-galaxy-slice-a-backend.md` (backend, zéro migration)
puis `prompt-galaxy-slice-b-frontend.md` (Massimo).

Risques connus, à surveiller : poids de Three.js (~600 Ko-1 Mo, isolé par `lazy()`) et **perf 3D
sur le poste le plus contraint** — Massimo travaille sur **iPhone, iPad et un MacBook dédié à
l'école**, et ce sont les deux derniers qui donnent son sens à une vue 3D. Plafond de nœuds
**adaptatif** (compact 40 / tablette 90 / desktop 150, valeurs **provisoires non mesurées**) et
repli sans WebGL prévus, **à essayer sur les trois appareils réels**.

Reste ouvert (hors v1) : graphe de prérequis, aperçu sur l'Accueil, annonce « +1 étoile » en fin de
mission, animation temps réel, et la **réconciliation de `docs/frontend-massimo/navigation.md`**
(autre brouillon du même stash, qui décrit une nav à 5 verbes contredite par les 12 entrées réelles).

## Priorité P3 — polish

- Animations gaming sobres.
- Avatar ZETIS.
- Onde vocale.
- Sons de feedback.
- ✅ Badges (étape 16 : XP, niveaux, streak, badges — affichés côté Massimo).
- Mode focus.
- Version iPhone optimisée.

## Priorité P4 — extension

- Accès distant sécurisé.
- Multi-enfant.
- Multi-parent.
- Exports PDF.
- Notifications.
- App iOS native.
- Mode SaaS éventuel.

## ✅ CHANTIER FAIT — le worker de production est un service (ADR-0046)

> **Cadré et livré le 2026-08-08.** `docs/decisions/adr-0046-le-worker-de-production-est-un-service.md`,
> spec `docs/devops/worker-production.md`, prompt `prompts/claude-code/prompts-claude-code-adr-0046.md`.
> Trois slices sur `feat/worker-supervise`. **Le texte ci-dessous est conservé comme trace du
> constat d'origine, pas comme une tâche ouverte.**
>
> ⚠️ **Deux de ses trois décisions se sont révélées FAUSSES au read-before-code**, et l'ADR le dit :
> la moitié « dev » était **déjà faite** (`dev.sh` étape 4/5) — ce qui l'a contournée est une
> **seconde porte d'entrée** née à côté ; et la notification demandait une infrastructure
> **inexistante** dans tout le dépôt (« Notifications » est en P4). Le commanditaire l'a maintenue
> au périmètre après lecture du constat.
>
> 🔴 **Reste dû, non délégable** : que l'e-mail atteigne une vraie boîte (les 4 lignes SMTP du
> `.env` racine).

## 🔴 CONSTAT D'ORIGINE — le worker de production n'était un service NULLE PART

**Décidé le 2026-08-08, après que trois diagnostics soient restés bloqués.** Rituel complet attendu
(`mockup → spec → ADR → prompt`) : ça touche le **déploiement**, pas un écran.

### Ce qui a été mesuré, pas supposé

- **3 `ai_jobs` `diagnostic_generate` en `queued`**, `started_at` NULL — deux du 2026-08-07
  (Mathématiques), un du 2026-08-08 (Histoire-Géo).
- **`rq:queue:production-priority` en contient exactement 3** : `run_ai_job(749|750|755)`. Les
  trois autres files (`media`, `ai`, `production`) sont à **zéro**.
- **Aucun worker de production ne tourne** (`pgrep` → rien). Le seul worker enregistré dans Redis
  est **mort** — sa clé ne rend ni battement ni liste de files — et c'était un worker `media`.
- 🔴 **`docker-compose.prod.yml` n'a AUCUN service de worker de production.** Sept services :
  `postgres`, `redis`, `minio`, `backend`, `worker-media`, `frontend-massimo`, `frontend-papa`. Et
  l'unique `restart: unless-stopped` du fichier appartient à `worker-media`.
- `ARCHITECTURE.md:152` le dit déjà : le worker de production est *« lancé à part »*.
- 🔴 **La panne est DÉJÀ au `TROUBLESHOOTING.md:1450`**, diagnostiquée une première fois avec le
  même `ps aux | grep production_worker → rien`. **Elle est revenue.** Une panne qui revient après
  avoir été documentée n'est pas un incident : c'est une absence de structure.
- 🔴 **Le même soir, TROIS workers tournaient en même temps** — pids `29543`, `31814`, `32002`,
  démarrés à 21:09, 21:17 et 21:17 dans trois terminaux distincts. Un quatrième a failli s'ajouter :
  le `pgrep` de contrôle était écrit `pgrep -fl "production_worker\|rq worker"`, et `\|` **n'est pas
  une alternance en ERE** — il cherchait un `|` littéral. **Le contrôle censé dire « il en tourne
  déjà un » répondait « aucun » quoi qu'il arrive.** Le contrôle qui marche :
  `pgrep -fl "python -m app.production_worker"`.
  🔴 Trois workers sont interdits par le module lui-même : *« **Concurrence 1, et ce n'est pas
  provisoire** : un seul Ollama, un seul GPU »* (`production_worker.py`, en-tête) — ils se
  disputaient un GPU unique.
  **C'est le MÊME défaut que les six lignes ci-dessus, vu par l'autre face** : un démarrage qui
  dépend d'une commande à taper est aussi une commande qu'on tape trois fois, faute de surface qui
  dise qu'elle tourne déjà. Zéro worker et trois workers ne sont pas deux problèmes — la
  **décision 3 les referme tous les deux**.
  ⚠️ Un point rassurant au passage : le worker a écrit *« un réveil du scan est déjà prévu — pas de
  nouvel amorçage »*. **Le correctif du 2026-08-03 a tenu** — c'est lui qui a empêché quatre
  démarrages de fabriquer quatre récurrences permanentes.

### Les trois décisions du commanditaire

**1. 🔴 PAS de bouton de relance sur les lignes du journal — pas pour ce défaut.** Le travail **est**
en file ; l'y remettre ne changerait rien et donnerait l'illusion d'un geste. Le dépôt a déjà nommé
ce motif — *« bouton cul-de-sac »*. Un bouton qui ne peut pas agir sur la cause est pire que pas de
bouton.
⚠️ Un bouton **« abandonner »** garde du sens et reste ouvert : un travail bloqué reprendra dès
qu'un worker démarrera, des jours plus tard, sans qu'on s'y attende. À décider séparément.

**2. La détection EXISTE — c'est l'alerte qui n'est pas atteignable.** Le bandeau mesure déjà
`worker_alive` et écrit *« aucun moteur de production actif — personne ne viendra »*. Il ne devine
pas, il mesure. Le manque est que **ça ne se voit qu'en ouvrant l'app**.
→ Une **notification poussée** quand la file porte des travaux et qu'aucun worker ne répond depuis
N minutes. **Pas un agent qui re-détecte** : ce serait une seconde source de vérité sur le même
fait, ce que le dépôt évite partout ailleurs.

🔴 **N ne peut pas descendre sous 8 minutes, et c'est mesuré — pas supposé (2026-08-08).** Un worker
**idle** ne rebat qu'à chaque tour de boucle de dequeue : relevé à **3,8 min d'ancienneté de
battement**, pour un TTL de clé Redis de **8 min**. Un seuil plus court ferait sonner l'alarme sur un
worker en parfaite santé — et une alerte qui crie à tort est celle qu'on apprend à ignorer.
⚠️ **`production_worker_alive()` n'est PAS le maillon faible**, et il ne faut pas le « renforcer » en
passant : son docstring consigne deux pannes déjà payées (`Worker.count()` qui ment là où `all()` dit
vrai ; la seconde file non interrogée, 2026-08-06) et il interroge bien **toutes** les files. La
détection est solide ; ce qui manque reste son **atteignabilité**.

**3. Le worker devient un service supervisé.** C'est le vrai défaut, et le seul qui referme les
deux autres :
- service `worker` dans `docker-compose.prod.yml`, avec `restart: unless-stopped` ;
- et en dev, un démarrage qui ne dépende plus d'une **commande à taper** — c'est ce qui a fait
  revenir la panne.

### Ce que la même cause a produit d'autre, et qui n'est PAS un bug

**Les pourcentages du popover de l'en-tête Papa ont disparu — c'est correct.**
`ProductionStrip.tsx:139` ne mesure que si `status === "running"` **et** que le couloir est vivant.
Trois travaux `queued` + aucun worker → aucun chiffre. Le commentaire au-dessus rappelle pourquoi :
retirer cette garde avait fait afficher « 37 % · 7/19 pièces » **sur un lot en file** (défaut du
2026-08-07). L'en-tête refuse de chiffrer ce qui n'a pas démarré. **Ne pas « réparer » ça.**

### Le geste immédiat — ✅ FAIT le 2026-08-08. Ne pas le rejouer à l'aveugle.

🔴 **Vérifier AVANT de lancer quoi que ce soit** — c'est l'omission de ce contrôle qui a produit
trois workers concurrents :

```bash
pgrep -fl "python -m app.production_worker"
```

S'il ne rend rien, et seulement alors :

```bash
pnpm dev:worker
```

Draine `production-priority` puis `production`.

**Ce que le geste a produit, le 2026-08-08 de 21:09 à 21:14** : les travaux `749`, `750` et `755`
sont `succeeded` et ont créé les quiz **55** et **56** (Mathématiques) et **57** (Histoire-Géo). La
jauge `2 / 8` et le focus `non-mesurees` ont bougé comme annoncé.

✅ **Le gate de l'ADR-0043 a tenu, et c'est vérifié en base** — la prédiction ci-dessus n'est plus
une attente : les trois quiz sont nés `pending`, puis `validated_by = 'parent'` à 21:16. La
validation est un **geste humain postérieur**, pas un effet de la production. Le diagnostic
n'atteint donc Massimo que par la main de Papa.

## La page Lacunes énonce sans permettre d'agir — ✅ CADRÉE, `adr-0047` (2026-08-09)

> **Ce n'est plus au backlog : c'est un chantier.** Voir
> `docs/decisions/adr-0047-la-page-lacunes-permet-d-agir.md` (**Accepté**), la spec
> `docs/frontend-papa/page-lacunes.md` (passages `[0047]`), la maquette
> `mockup-papa-lacunes-v1.html` et le prompt
> `prompts/claude-code/prompts-claude-code-adr-0047.md`, en deux sessions. Le texte ci-dessous est
> conservé **comme trace du constat d'origine**, pas comme une tâche ouverte.
>
> 🔴 **Le read-before-code du cadrage a démenti QUATRE points de ce texte**, dont deux qui
> changeaient la conception — ils sont détaillés dans l'ADR § *Constat read-before-code*, et les
> deux qui comptent sont rappelés en place ci-dessous.

**Trouvé le 2026-08-08 par le commanditaire**, en vérifiant la slice C de l'ADR-0045.

### Le constat, vérifié dans le code

**La ligne d'une lacune est un `<li>` nu** (`LacunesPage.tsx`) : pictogramme, nom, statut, date,
badge de sévérité. **Aucun `Link`, aucun `onClick`, aucun dépliage.** Il n'y a même pas d'expander
inerte — il n'y a rien.

Les seuls éléments cliquables de la page sont les deux boutons de filtre, « Réessayer », et les
deux boutons de génération **au niveau de la SECTION**, jamais de la ligne.

### 🔴 Ce qui rend le défaut gênant : une autre page fait déjà mieux

La **station ② du Diagnostic** rend, par lacune, le motif en clair **et un geste qui dépend de
l'état** :

| `content_state` | Geste proposé par la station ② |
|---|---|
| `aucune_lecon` | **Produire le quiz de cette notion →** |
| `cours_brouillon` | **Valider le cours de cette leçon →** |
| ouverte / résolue | Voir la lacune → |

**La page DÉDIÉE aux lacunes en dit donc moins qu'une section d'une autre page.**

> 🔴 **Ce tableau est FAUX sur le grain, vérifié le 2026-08-09.** La station ② envoie sur
> `/quiz?subject=<id>` et `/programme?subject=<id>` (`PanneauPassation.tsx:266-277`) : **la
> matière**, jamais la notion ni la leçon. Elle promet un grain que ses liens ne livrent pas.
> L'`adr-0047` ne la copie donc pas — **il la corrige** (Décision 8).

Et le cul-de-sac se referme sur lui-même : ce dernier geste, « **Voir la lacune →** », pointe sur
`/lacunes` (`PanneauPassation.tsx`). Papa quitte un écran qui lui donnait le motif et l'action pour
atterrir sur **une ligne inerte**. C'est exactement le motif que l'ADR-0045 a traité deux fois —
une surface qui énonce sans permettre d'agir — laissé intact sur la page qui en porte le nom.

### ⚠️ La réparation est devenue presque gratuite le 2026-08-08

La **slice C** a mis **`content_state` sur `OpenGap`** pour tout autre chose. La page a donc déjà en
main, sans **aucune** ligne de backend, de quoi rendre les trois mêmes gestes que la station ② —
plus `severity`, `has_active_mission` et `source`.

**Ce qui manque encore, et qui coûterait un champ** : la **leçon ou le chapitre** à ouvrir, et la
**mission** qui couvre déjà la notion (pour un « voir la mission → » sur les lignes « déjà prises en
charge », qui sont aujourd'hui les plus inertes de toutes).

> 🔴 **Deux corrections, mesurées le 2026-08-09.**
> **(a) Ça coûte ZÉRO requête**, pas « un champ » : `etat_contenu` obtient les `Lesson` en lot puis
> **les jette** (`content_state.py:62`), et `skills_with_active_mission` réduit des `Mission` à un
> `set[int]` (`progress/service.py:73`). Deux fois le motif de `source` dans l'`adr-0045`.
> ⚠️ Mais la leçon **n'est pas un singleton** : une notion en porte jusqu'à **quatre**
> (« Priorités opératoires » : #151 `draft`, #145 `draft`, #48 `validated`, #23 `validated`).
> **(b) « les plus inertes de toutes » est en dessous de la vérité** : les **10** lacunes ouvertes
> ont **toutes** `has_active_mission`, donc les deux autres sections **ne s'affichent pas** et cette
> section est **la seule visible**. La page entière est un cul-de-sac — c'est ce qui a fait passer
> son geste en **prioritaire** (`adr-0047` Décision 2).

⚠️ **Hors périmètre de l'ADR-0045**, qui porte sur la page Diagnostic. À cadrer à part — mais tant
que c'est frais : c'est maintenant que c'est le moins cher.

## La refonte T0 / T_n du diagnostic — 🟡 EN LISTE D'ATTENTE (2026-08-09)

> **Annoncée « prochain chantier » par l'`adr-0042`** (« la refonte du diagnostic — T0 sur les
> prérequis, sonde T_n dans les missions — dont cet ADR est le prérequis. Il ne commence pas ici »),
> et tenue hors périmètre par l'`adr-0043`, la spec `page-diagnostic.md` et `DECISIONS.md` ×2.
>
> **Cadrage ouvert le 2026-08-09, ARRÊTÉ au read-before-code, sur décision du commanditaire.** Ce
> n'est pas un chantier : c'en est **trois empilés**, et le premier n'est pas du code. **Pas d'ADR
> pour l'instant** — un ADR fige des décisions, et figer aujourd'hui celles d'un chantier qu'on
> n'exécutera pas les rendrait périmées le jour de l'ouverture. Le rituel
> `mockup → spec → ADR → prompt` reprendra à l'ouverture, à partir du constat ci-dessous.

Ce qui suit est le **read-before-code, mesuré en base de dev le 2026-08-09**. ⚠️ Les chiffres sont
datés : à la reprise, ils se **re-mesurent**, ils ne se recopient pas.

### 🔴 Ce que le hors-périmètre annoncé dit, et ce qui est faux dedans

Quatre documents énoncent la même phrase : *« le graphe de prérequis n'existe pas (ni colonne ni
table, `parent_skill_id` NULL sur 432 notions) »*.

1. ❌ **« ni colonne » est faux, et le dépôt se contredit lui-même.** La colonne existe :
   `Skill.parent_skill_id`, FK nullable vers `skills.id`
   (`apps/backend/app/db/models/school.py:117`). `docs/frontend-massimo/zetis-galaxy.md:78`,
   l'`adr-0024` et le `BACKLOG.md:488` le disent **correctement** ; l'`adr-0043:247` et
   `docs/frontend-papa/page-diagnostic.md:503` disent « ni colonne ». C'est la version fausse qui a
   été recopiée dans `DECISIONS.md`.
2. 🔴 **La colonne est structurellement insuffisante — et c'est plus grave que son vide.**
   `parent_skill_id` est **1-à-1**. Une notion a en général **plusieurs** prérequis. Le graphe
   demande donc une **table de liaison n-n**, donc une **migration** — pas un backfill de colonne.
   Une lecture rapide de « la colonne est là, il suffit de la remplir » enverrait le chantier dans
   le mur.
3. 🔴 **LE VRAI BLOCAGE N'EST PAS LE GRAPHE : C'EST QU'IL N'Y A RIEN À POINTER.** 440 notions en
   base — **439 en `4e`, UNE en `5e`** (id 436, « Les fractions », Mathématiques : l'artefact de la
   vérification de l'`adr-0042`). L'unique année scolaire est `2026-2027`, niveau `4e`. **Le
   référentiel des niveaux antérieurs n'existe pas.** Un T0 sur les prérequis mesurerait donc le
   vide, quel que soit le graphe posé au-dessus. `parent_skill_id` renseigné à 0 sur 440 n'est pas
   la cause : c'est la conséquence.
4. ⚠️ **`learning_objectives` est VIDE (0 ligne).** La table qui porte `expected_mastery_level` —
   la seule notion d'« attendu de fin de cycle » du modèle — n'a jamais été peuplée.
5. ⚠️ **« 432 notions » est périmé (440), et la couverture est très inégale** : Français 207,
   SVT 89, Mathématiques 86, Histoire-Géo 34, Anglais 24 — et **3 matières sur 8 n'ont AUCUNE
   notion** (Technologie, Espagnol, Physique-Chimie). Un T0 « sur le programme » ne veut pas dire
   la même chose en Français et en Espagnol.

### ⚠️ Le piège qui se déclenchera TOUT SEUL, sans une ligne de code

`notions_a_mesurer` (`apps/backend/app/modules/diagnostics/service.py:119`) filtre sur
`Skill.subject_id` **et rien d'autre** — **aucun filtre de niveau**. Le jour où le référentiel 5e
existe, **ses notions entrent silencieusement dans les diagnostics de 4e**, et l'ordre « jamais
mesurées d'abord » (`adr-0043` Décision 4) les fera passer **en premier**. Le premier geste du
chantier 0 casserait donc la mesure du chantier en cours, sans erreur et sans test rouge.

Et `MAX_SKILLS = 8` (`service.py:59`) : une passation mesure 8 notions. Sur les 207 de Français,
c'est un échantillon de 4 %. Augmenter `MAX_SKILLS` a déjà été **écarté** par l'`adr-0043`
(à 5 questions par notion, 30 notions = 150 questions, « inadministrable »). Un T0 qui veut couvrir
des prérequis devra donc **résoudre ce que l'`adr-0043` a explicitement refusé de résoudre**.

### ✅ Ce qui est DÉJÀ posé, et qui réduit le chantier

Le hors-niveau n'est pas un terrain vierge — l'`adr-0042` a fait la moitié du travail de socle :

- `orphan_notions` a **perdu son filtre `Skill.level == year.level`** (Décision 5,
  `curriculum/service.py:925`) : une notion de niveau antérieur est **visible et équipable** par
  Papa, avec son niveau rendu à l'écran ;
- `missions/service.py:622` **cible déjà** `Skill.level != year.level` en branche « rattrapage » —
  ZETIS sait donc déjà fabriquer une mission sur une notion d'un niveau précédent ;
- `curriculum/service.py:515` sélectionne par `Skill.level == level` : la **génération d'un
  référentiel à un niveau donné est un chemin qui existe**.

### Le chiffrage — pourquoi c'est en attente

| # | Ce qu'il faut faire | Coût | Migration |
|---|---|---|---|
| **0** | **Le référentiel des niveaux antérieurs** (5e, voire 6e) sur les matières concernées — génération `curriculum_*` → `claude-sonnet-5` (dérogation ADR-0009), puis **validation Papa obligatoire avant activation** (gate ADR-0009) | 🔴 le plus lourd, et **l'essentiel n'est pas du code** : ~400 notions à relire à la main | non |
| **1** | **Le graphe de prérequis** — table n-n, et la question ouverte de **qui le produit** | 1 session | 🔴 oui |
| **2** | **Le T0** — sélection par prérequis, sort de `MAX_SKILLS`, filtre de niveau à poser dans `notions_a_mesurer`, `Gap` de prérequis | 1–2 sessions | probable |
| **3** | **La sonde T_n** dans les missions | 1 session | ? |
| **4** | **Les surfaces** — page Diagnostic Papa, page Lacunes, écran Massimo | 1–2 sessions | non |

→ **4 à 6 sessions de code, plus une campagne de validation humaine.** À titre de comparaison,
l'`adr-0048` — le plus gros chantier du dépôt à ce jour — en a fait **trois**. C'est ce chiffrage,
et non un doute sur la valeur du T0, qui le met en attente.

### Les arbitrages à rendre à l'ouverture — aucun n'est tranché

1. **D'où vient le graphe de prérequis ?** Généré par LLM (donc à valider notion par notion, ~440
   liens) · saisi à la main par Papa · **dérivé** de l'ordre du curriculum (gratuit, mais un ordre
   n'est pas une dépendance) · ou hybride. **C'est la décision qui commande le coût du chantier 1.**
2. **Jusqu'où descend le T0 ?** 5e seulement, ou 5e + 6e ? Chaque niveau ajouté est un référentiel
   entier à générer **et à relire**.
3. **Le T0 est-il une passation, ou un régime de passation ?** S'il faut couvrir des prérequis
   au-delà de 8 notions, il faut soit scinder en plusieurs séances, soit rouvrir `MAX_SKILLS` —
   refusé par l'`adr-0043`, donc à rouvrir **explicitement** ou à contourner par la scission.
4. **Que devient la sonde T_n ?** Une mesure de plus dans les missions rouvre `trigger='evidence'`,
   fermé par l'`adr-0043` avec un motif de fond (« ZETIS ne se commande pas sur sa propre mesure »).
5. **Les 3 matières à zéro notion** entrent-elles dans le périmètre, ou le T0 se limite-t-il aux 5
   matières pourvues ?

### Le signal qui dirait qu'il faut l'ouvrir sans attendre

Une lacune de 4e qui se **rouvre après remédiation** — c'est la signature d'un prérequis manquant en
dessous, et c'est précisément ce qu'aucune mesure actuelle ne peut voir. À surveiller sur les
`gaps` : une `Gap` résolue puis rouverte sur la même notion.

## La déclaration et la preuve peuvent diverger — 🟡 CANDIDAT, NON CADRÉ (2026-08-11)

> **Né d'une question du commanditaire**, posée après la relecture de l'agenda :
> *« comment s'assurer que Massimo ne fait pas que cocher les cases des devoirs sans lire les
> leçons ? »* Aucune ligne de code écrite. Ce qui suit est l'analyse, pour que le cadrage — s'il a
> lieu — ne reparte pas de zéro **et ne reparte pas dans la mauvaise direction**.

### 🔴 Le verbe « s'assurer » est le piège, et le dépôt le sait déjà

**On ne peut pas vérifier une lecture.** Tout mécanisme qui essaie devient de la surveillance, et
deux décisions existantes s'y opposent frontalement :

- **ADR-0025 §2a** — le marqueur « complété par ZETIS » existe pour que *« la surveillance ne rentre
  pas par la porte de service »* ;
- **ADR-0025 §2b** — Papa ne coche pas, parce que *« si le parent coche, la case devient une
  validation parentale et l'agenda devient un instrument de contrôle »*.

Une case qu'il faudrait **mériter** fait exactement ce que le §2b refuse, avec un pas de plus.

### ✅ Ce qui protège déjà : cocher ne rapporte RIEN

`done_at` ne crédite **aucun XP** et ne déclenche **aucune célébration** — ADR-0050 Décision 5, dont
le motif tient en une phrase : *« sinon Massimo apprend à cocher »*. Et **jouer l'activité ne coche
rien** : les deux sont délibérément déconnectés.

**Le système est donc déjà construit pour que lui mentir soit sans intérêt.** Le risque n'est pas
qu'il triche ZETIS — c'est que **personne ne remarque qu'il ne travaille pas**. Ce n'est pas la même
question, et elle a une bien meilleure réponse.

### La question utile : l'ÉCART entre ce qui est déclaré et ce qui a eu lieu

ZETIS détient déjà des preuves **qu'on ne peut pas cocher** — elles ont eu lieu ou non :

| Source | Ce qu'elle prouve |
|---|---|
| `SpacedReviewAttempt` | une session de cartes a réellement tourné |
| `quiz_attempts` | un quiz a été passé, avec un score |
| `learning_events` | l'activité — ce sont les points verts de la bande |
| `skill_mastery_history` | les bascules de palier |
| le diagnostic + `fiabilite` (ADR-0048) | ZETIS sait déjà **douter de sa propre mesure** |

Le signal recherché n'est donc pas *« a-t-il coché ? »* mais **« il coche, et rien d'autre ne
bouge »**. Une semaine où `done_at` se remplit pendant que `learning_events` reste vide est lisible
**aujourd'hui, sans une ligne d'instrumentation neuve**.

✅ **Et l'ADR-0050 a déjà nommé son propre signal d'échec** : des étapes cochées **en rafale le
dernier jour** (le plan est subi) ou **jamais** (il n'est pas lu) — lisible dans `done_at` contre
`day_offset`.

⚠️ **La réciproque compte autant** : *« il ne coche pas mais tout bouge »* est un bon élève qui
n'aime pas les cases. Ça ne doit **surtout pas** être présenté comme un manquement.

### 🔴 Les quatre choses à NE PAS construire

1. **Un chronomètre de lecture** — il mesure la présence, pas l'attention, et enseigne à laisser
   l'onglet ouvert.
2. **Un quiz-péage avant d'autoriser la coche** — l'agenda devient un examen, et la coche est
   *« le seul geste qui rend l'objet sien »*.
3. **Un taux d'assiduité affiché à Massimo** — c'est le compteur d'arriéré que le §7 interdit sous
   toutes ses formes.
4. **Basculer la coche en « prouvée »** (option B de l'ADR-0050 Décision 5, **reportée**). Son
   déclencheur est écrit — *le jour où Papa demandera à lire autre chose qu'une déclaration* — et
   « je doute qu'il lise » n'est pas ce déclencheur. Ça mettrait **deux sémantiques sur une seule
   case**, ce que la décision refuse explicitement.

### Le levier de conception : que la SUITE le révèle, à Massimo d'abord

`CLAUDE.md` prescrit *récupération active* et *verbalisation par Massimo*. Traduit ici : **ne pas
surveiller la lecture, demander ce que la lecture produit.**

C'est ce que le plan de préparation fait déjà sans le dire — il coche « lu le cours », et l'étape
suivante est un quiz sur cette notion ou les cartes du chapitre. **S'il n'a pas lu, il le découvre
lui-même, seul, sans que personne le lui dise.** Le levier n'est donc pas un verrou : c'est de
rendre l'étape suivante **courte et immédiate**, pour que l'écart se manifeste tout de suite plutôt
qu'au contrôle.

### Les arbitrages à rendre à l'ouverture — aucun n'est tranché

1. **Où vit la lecture ?** Dashboard Papa (une carte de plus), page Progression, ou le Cahier de
   bord ? Elle n'a **aucune place chez Massimo** — c'est le seul point déjà acquis.
2. **Quelle fenêtre ?** Une semaine glissante, ou l'horizon du dashboard ? Trop court = du bruit ;
   trop long = un constat qui arrive après le contrôle.
3. **Quel seuil, et faut-il un seuil ?** Le dépôt a déjà payé des seuils *« choisis au cadrage,
   jamais éprouvés sur des données réelles »* (ADR-0048). Une **phrase qui décrit** vaut peut-être
   mieux qu'un ratio qui juge.
4. **Comment on l'écrit à Papa.** *« Massimo a coché 6 échéances cette semaine ; aucune activité
   n'a été enregistrée sur les notions correspondantes »* est un **constat**. « Assiduité : 12 % »
   est une note, et ce n'est pas l'enfant qu'on évalue ici.
5. **Est-ce même une surface ?** Ça pourrait n'être qu'une entrée du **Cahier de bord IA**, écrite
   quand l'écart apparaît, plutôt qu'un indicateur permanent qui s'allume toutes les semaines.

### Le signal qui dirait qu'il faut l'ouvrir sans attendre

Un chapitre dont **toutes** les échéances sont cochées et dont la **maîtrise ne bouge pas** — sur
deux chapitres consécutifs. C'est mesurable dès aujourd'hui, et c'est le motif exact de la question.

⚠️ **Et le contre-signal** : si les preuves suivent les coches, ce chantier n'a **aucune raison
d'exister**. Il ne se construit pas « pour être sûr » — il se construit le jour où l'écart est
observé.

## Ce qu'une passation de diagnostic a montré — 1 DÉFAUT + 2 candidats (2026-08-11)

> Relevé par le commanditaire sur la page Diagnostic de Papa, passation **56** (Histoire-Géo,
> 9 août, 8 notions, 50 %). **Tout ce qui suit est vérifié en base**, pas déduit de l'écran.
>
> Le décor : les 8 notions se répartissent sur **deux leçons seulement** — la **25**
> (*« La crise de l'Ancien Régime… »*, `draft`, cours **écrit**, 4 notions dont 3 en lacune) et la
> **26** (*« 1789 : l'année de la rupture révolutionnaire »*, `draft`, cours **VIDE**, 4 notions
> dont 3 en lacune).

### 🔴 DÉFAUT — on peut valider un cours VIDE, et la page invite à le faire

`set_lesson_validation` (`apps/backend/app/modules/curriculum/service.py:1139`) ne vérifie **que le
statut** (`draft`, sinon 409). **Aucune garde sur le contenu.** Une leçon dont
`content_markdown` est vide peut donc passer `validated`.

Or la page Diagnostic affiche, sur les trois lacunes de la leçon **26**, le bouton
« **Valider le cours de cette leçon →** ». Le suivre produirait une leçon **validée sans une ligne
à lire**, que Massimo pourra ouvrir — et que le gate de l'ADR-0011 laissera passer, puisqu'il
filtre sur `validated`.

🔴 **Ce n'est pas une hypothèse : c'est la dette du 2026-08-04**, *« 39 leçons `validated` VIDES
font mentir le motif du gate »*. La page ne crée pas le défaut, **elle y conduit**.

**Correctif minimal** : refuser la validation d'une leçon au cours vide (409, comme le statut), et
que la surface propose alors **« Rédiger le cours »** — la route existe déjà
(`POST /lessons/{id}/generate-content`, ADR-0041 §4). ⚠️ Vérifier d'abord les **autres appelants**
de `set_lesson_validation` : `validate_all_lessons`, `validate_all_chapters`,
`validate_all_active_year` et `equip_notion` (qui passe `by=` depuis le correctif du 2026-08-02).
Une garde posée au mauvais étage casserait la validation en lot.

### 🟡 CANDIDAT — la page présente N lacunes là où il y a N cours à traiter

Six lacunes, **six fois le même paragraphe de cinq lignes**, et six boutons qui ne font que **deux**
gestes distincts. Deux validations résolvent les six.

C'est la famille des « trois plans identiques » de l'agenda (ADR-0050) : l'écran **multiplie une
cause** au lieu de la nommer. L'information utile — *deux cours à traiter, l'un écrit, l'autre
vide* — est noyée dans la répétition.

**Arbitrages à rendre** : regrouper par **leçon** plutôt que par notion (et alors, que devient une
lacune sans leçon ?) · ou garder la liste par notion mais ne dire la cause **qu'une fois** · et
distinguer visuellement « cours écrit à valider » de « cours à écrire », qui ne demandent pas le
même geste.

⚠️ **Ne pas fusionner les lacunes en base** : le grain de la `Gap` est la **notion**, et c'est juste
— c'est le **rendu** qui groupe, jamais la donnée.

### 🟡 CANDIDAT — l'aveu de Massimo pèse moins qu'un score

Sur *Prise de la Bastille* : **80 %**, palier « en cours », **aucune lacune ouverte** — et Massimo
écrit lui-même « **J'ai deviné.** ». Sur la leçon 26, celle dont le cours est vide.

⚠️ **Le bandeau ne ment pas**, et c'est important pour ne pas corriger à côté : il dit *« rien à
signaler **sur les conditions** de cette passation »*, ce qui est exact — l'ADR-0048 mesure les
conditions de passation (triche), **pas la confiance dans une réponse**. Ce n'est donc pas un bug :
c'est un **trou entre deux mécanismes** qui se rencontrent sur un même écran, la verbalisation de
l'`adr-0043` et la fiabilité de l'`adr-0048`.

Le fond reste : **une notion à 40 % sans commentaire ouvre une lacune ; une notion à 80 % avec
« j'ai deviné » n'en ouvre aucune.**

**Arbitrages** : la verbalisation doit-elle peser sur le **palier**, sur la **lacune**, ou
seulement **alerter** ? · qui l'interprète — un LLM local, ou un simple relevé de présence de la
phrase ? · et 🔴 **le risque à ne pas prendre** : si dire « j'ai deviné » coûte à Massimo (une
lacune de plus, un palier qui baisse), **il cessera de le dire**. La franchise ne doit jamais être
tarifée. Une lecture pour Papa est probablement plus juste qu'un effet automatique.

⚠️ **Un fait déjà collecté et sans consommateur** : `reliability_json` de la passation 56 porte
`acquises_sans_trace: 1` — une notion acquise sans trace d'activité. Aucun indice, aucun
déclencheur. Le signal existe, il ne sert à rien.

### 🔴🔴 IL N'Y A PAS DE SIGNAL À ATTENDRE — c'est déjà l'état de la base

J'avais d'abord écrit ici *« le signal qui dirait d'ouvrir : une leçon `validated` vide »*. **La
requête a été lancée, et elle est déjà positive — largement** (base de DEV, 2026-08-11) :

```sql
select count(*) filter (where status='validated' and coalesce(content_markdown,'')='') from lessons;
```

| | |
|---|---|
| Leçons `validated` **VIDES** | 🔴 **50** |
| Leçons `validated` au total | 88 |
| **Part du corpus validé qui est vide** | **57 %** |
| Brouillons vides (normal, en attente de rédaction) | 60 |

**Ce n'est donc pas un risque à surveiller, c'est une situation installée.** Et elle a **grossi** :
la dette du 2026-08-04 en comptait **39**, il y en a **50**.

⚠️ **Conséquence à mesurer avant tout correctif** : le gate de l'ADR-0011 filtre sur
`status = 'validated'` **et rien d'autre**. Ces 50 leçons sont donc, par contrat, **servables à
Massimo** — reste à établir combien sont réellement atteignables depuis une surface, et par
laquelle. C'est le **premier read-before-code** du chantier, avant toute garde ajoutée.

🔴 **Et la garde seule ne suffira pas** : elle empêche d'en créer de nouvelles, elle ne dit rien
des 50 existantes. Il faudra trancher leur sort — les repasser en `draft`, leur commander une
rédaction, ou les archiver — et **ce n'est pas une décision technique**.

## Le geste d'une lacune ne dit pas OÙ il va — 🟡 CANDIDAT (2026-08-11)

> Trouvé à l'écran juste après le correctif des trois crans (PR #112) : le lien mène désormais au
> bon endroit, mais **pas forcément à celui qu'on attendait**, et rien ne prévient.

### Le fait, mesuré

Une notion peut être portée par **plusieurs leçons**. `lessons_by_skill` les trie par
`updated_at` **décroissant** (puis `id`), et `etat_et_lecon` retient la première `validated` —
sinon la première tout court. **Rien de tout cela n'est dit à l'écran.**

Cas réel, base de dev : la notion **« Monarchie absolue »**, lacune d'un diagnostic sur **la
Révolution française**, porte deux leçons —

| Leçon | Chapitre | Modifiée le | |
|---|---|---|---|
| **79** — *Les grandes puissances européennes au XVIII<sup>e</sup>* | **31** | 2026-07-30 | ← retenue |
| 25 — *La crise de l'Ancien Régime* | 34 | 2026-07-03 | |

Papa clique « Valider le cours de **cette leçon** » depuis un diagnostic sur la Révolution, et
atterrit sur *« Les grandes puissances européennes »*. La destination est **plausible et pas
attendue** — et il n'a aucun moyen de savoir pourquoi.

### ⚠️ Ce n'est PAS un défaut — c'est une règle du dépôt non appliquée ici

Le départage est un **arbitrage documenté** (`OpenGap.lesson_id` : *« une notion porte jusqu'à
quatre leçons ; le départage suit l'ordre que `lessons_by_skill` établit déjà côté serveur »*).
Il ne se rouvre pas.

🔴 **En revanche le dépôt a une règle exactement pour ça, et elle n'est pas tenue** :

> *« Le libellé nomme sa destination ET son grain »* — règle de l'`adr-0047`, réappliquée par
> l'ADR-0050 Décision 2 quater, qui a fait remplacer « Lire la fiche » par « Lire les fiches »
> parce que le singulier promettait une fiche précise.

Ici le libellé dit **« cette leçon »** — un singulier qui désigne — sans jamais nommer laquelle.
C'est le même défaut de promesse, sur une autre surface.

### Les arbitrages à rendre

1. **Nommer la destination dans le libellé** — « Valider le cours de *Les grandes puissances…* ».
   ⚠️ Mesurer avant : c'est exactement ce que l'ADR-0050 a dû **annuler** sur les étapes du plan,
   le nom se coupant à l'ellipse (193 px pour 151). Une carte de lacune est plus large qu'une
   étape d'agenda, mais ça se mesure, ça ne se suppose pas.
2. **Ou afficher le titre de la leçon sur la carte de lacune**, hors du bouton — l'information
   sans la contrainte de largeur du libellé.
3. **Ou dire qu'il y en a plusieurs** (« 2 leçons portent cette notion ») et laisser choisir. Le
   plus honnête, le plus cher.

### 🔴 Ce qu'il ne faut PAS faire

- **Toucher au tri de `lessons_by_skill`.** Il est partagé par `etat_contenu`, `etat_et_lecon`,
  `lecons_visees`, la Couverture et la production. Changer son départage pour arranger une
  surface le changerait partout, en silence.
- **Fusionner les lacunes.** Le grain de la `Gap` est la **notion**, et c'est juste.
- **Faire porter le choix à Papa dans l'URL.** Le lien doit rester un lien ; s'il faut choisir,
  c'est la carte qui pose la question, pas la barre d'adresse.

### Le signal qui dirait d'ouvrir

Papa validant un cours **qu'il ne cherchait pas** — ou demandant « pourquoi ce chapitre ? ». Le
premier se verra dans `validated_by='parent'` sur une leçon d'un chapitre sans rapport avec le
diagnostic d'origine ; le second se dira tout seul.

## Dettes nommées — consignées, non traitées

### Nées du chantier ADR-0046 (2026-08-08)

- 🔴 **Le journal de production ne montre JAMAIS l'attente.** Il affiche la date de **création** et
  la durée d'**exécution**. Mesuré sur les travaux 749 et 750 : la ligne dit « *fait · 95 s ·
  07/08 20:07* » pour un travail créé le 07/08 et exécuté le 08/08 — **25 heures d'attente,
  invisibles**. Conséquence : **le journal est incapable de montrer la panne que l'ADR-0046
  corrige**, et c'est pour ça qu'elle est restée invisible jusqu'à ce qu'on interroge Redis à la
  main. Une ligne vraie et trompeuse est pire qu'une ligne absente.
  ⚠️ Le correctif n'est pas d'ajouter une colonne « attente » partout : c'est une **décision
  d'affichage** (que dit-on d'un travail qui a attendu ? à partir de quelle durée ?), donc un
  cadrage.
- ⚠️ **Dans le compose de DÉVELOPPEMENT, `worker-media` est isolé sur son réseau.** Il déclare
  `networks: [internal]` **seul**, alors que `postgres`, `redis` et `minio` sont sur le réseau par
  défaut : ils ne peuvent pas se joindre. Masqué par `profiles: [render]`, qui fait que le service
  n'est presque jamais démarré. **Le compose de prod, lui, est correct depuis l'ADR-0046.**
- ⚠️ **`mem_limit: 1g` est calé sur une mesure À VIDE** (backend 92 Mio, worker 41 Mio). La voix
  Piper (ONNX) et l'extraction PDF du RAG n'ont **pas** été mesurées sous charge. À relever si un
  OOM apparaît, **jamais à baisser** sans nouvelle mesure.
- 🔴 **`POSTGRES_PASSWORD` vaut toujours `zetis_dev_password`** dans le `.env` racine — posé là pour
  ne pas casser `prod:up` sur un volume déjà initialisé. C'est exactement le secret public que la
  correction visait. Le changer impose un `down -v`, qui **efface les données prod**.

> Ouvertes le **2026-08-07** au cadrage puis au read-before-code de l'**ADR-0042** (la notion
> orpheline devient équipable). Aucune n'est traitée par ce chantier : elles sont écrites ici
> pour exister ailleurs que dans une conversation.

### Nées du cadrage (les trois du §7 du prompt)

- **`recent_evolution` du Conseil de classe est une surface d'hallucination.** Champ `str` **non
  nullable** dans `CouncilReportSpec`, alors qu'aucune source ne pouvait le produire — l'ADR-0020
  s'annote lui-même « comparatif = slice 2 », et le `period` du Conseil n'est qu'un libellé qui ne
  sélectionne aucune donnée. Le producteur remplit **parce que le type l'y oblige**.
  ⚠️ **Fait nouveau** : `skill_mastery_history` existe (migration `a9b8c7d6e5f4`) et
  `evidence.mastery_transitions()` la lit déjà — **le champ est devenu calculable**.
  🔴 Le champ est **figé** dans chaque rapport persisté (`subjects_json`) : tant qu'il n'est pas
  typé, **chaque Conseil archive une tendance inventée**, rétroactivement indiscernable du vrai.
  *(L'ADR-0040 a décrit la correction ; vérifier ce qui en a réellement été livré avant de
  reprendre — cette ligne dit le problème, pas l'état d'avancement.)*
- **La page Paramètres ne dit pas que le diagnostic et le Conseil restent manuels.** Ils ne sont
  ni parmi les deux classes libres ni parmi les quatre verrouillées — **ils ne sont pas des
  classes du tout**. Papa qui lit « Autonom » n'a **aucune surface** qui l'en informe.
  Précédent de traitement à reprendre : le quiz, repêché en **note de pied de panneau, hors
  matrice**.
- **La double écriture des appels générateurs `equip_notion` / `equip_piece`.**
  Les deux blocs d'imports paresseux sont **byte-identiques** (`equipment.py:195-199` et
  `:362-366`) et les cinq générateurs sont appelés deux fois. Dette **assumée en commentaire**
  (`equipment.py:341-347`) : l'addendum ADR-0031 interdisait de toucher l'orchestrateur.
  Divergences déjà constatées entre les deux copies : `on_piece` n'existe que dans `equip_notion`
  (donc un lot-pièce n'écrit jamais `run.current_piece`), la comptabilité `skipped` du cours
  diffère, et `equip_piece` rend `reason=None` même quand `errors` est peuplé.
  → à extraire **dans son propre chantier, sous contre-épreuve** — jamais au détour d'un ajout.

### Nées du read-before-code de l'ADR-0042

- 🔴 **Défaut latent : tête-de-liste contre parcours de liste.** `runner.py:300` et
  `equipment.py:65` prennent `lecons[0]` ; `canonical_context.py:94-101` **parcourt** toute la
  liste. Si la leçon la plus récemment touchée est un brouillon sans cours et qu'une plus
  ancienne est validée avec cours, la production dit `BLOCKED_COURSE_MISSING` pendant que le
  résolveur dit `has_course=True`. **C'est le défaut du 2026-08-03 avec l'ordre inversé.**
  `test_le_cas_observe_ne_bloque_plus` ne fixe **que** l'orientation qui passe : la fixture
  miroir n'est pas testée. **La plus sérieuse des quatre.**
- **`_validated_lesson_or_409` est écrit en trois exemplaires** — `quizzes/service.py:70`,
  `fiches/service.py:63`, `mindmaps/service.py:76` — identiques au nom près de la pièce. C'est
  la forme de défaut que l'ADR-0037 a supprimée ailleurs, laissée debout ici. Le troisième
  message (`content_markdown` vide) est **byte-identique** dans les trois : une divergence y
  serait silencieuse.
- **Collision de vocabulaire sur « orphelin ».** `coverage.orphans()` désigne des **dérivés dont
  la leçon est archivée** (`coverage.py:513`) ; `curriculum.orphan_notions()` désigne des
  **notions sans leçon**. Deux sens, un mot, deux modules — et `totals["orphan_count"]` compte
  le premier.
- **Deux lignes de documentation fausses**, sources de croyances déjà payées :
  `DATA_MODEL.md:168` annonce un `prerequisite_skill_ids optional` sur `Skill` — **la colonne
  n'existe pas** (ni table de liaison ; le vrai champ est `parent_skill_id`, NULL sur les 432
  lignes, jamais écrit) ; `API_SPEC.md:1214-1215` affirme que le `has_referentiel` de
  `/progress/analysis` est « **la même** » définition que celle du dashboard — **c'est faux** :
  `dashboard._referentiel_subjects` compte des **chapitres**, `progress.analysis._referentiel`
  compte des **leçons**, et `progress/overview.py:51` **importe** la version du dashboard (donc
  le partage est 2 contre 1, pas 1 contre 1). Aucun test n'assied l'accord entre `analysis` et
  les deux autres.
- **Le docstring de `lesson_resolution.active_year` sous-compte ses propres copies.** Il annonce
  « sept copies privées » ; il y a **treize** résolutions côté lecture (quatre sont *inline*
  plutôt que des helpers nommés — `curriculum` en a **deux** à lui seul), plus une côté écriture.
  Et **5 des 13 sont scopées par élève, 8 ne le sont pas** : elles ne s'accordent que parce que
  `school/service.py:89-92` impose globalement qu'une seule année soit `active`. **Invariant
  porteur et non documenté au niveau du modèle.**
- **`lessons.chapter_id` a une FK sans `ON DELETE`, et `school.py` ne déclare aucune
  `relationship()`.** Donc ni cascade SQL ni cascade ORM : `delete_chapter`
  (`curriculum/service.py:443-446`) lève un `IntegrityError` non capté — **500 latent** sur tout
  chapitre encore porteur de leçons. Même chose pour le chemin de régénération
  (`service.py:218`). Contraste : `lesson_skills` porte bien `ondelete="CASCADE"`.
- **Le chapitre orphelin n'est toujours pas rétro-attribué, et le plancher a son trou.** La porte
  de création est fermée (`subjects/service.py:224`), mais `id=10` « Les fractions » existe
  encore, et **16 des 17 consommateurs** laissent tomber un chapitre non rattaché **en silence**
  (INNER JOIN sur `SchoolYearSubject`). ⚠️ **Le trap est vivant** : Papa peut créer une leçon
  sous ce chapitre (`create_manual_lesson` ne vérifie que l'existence), la valider, et lancer un
  lot dessus (`scope.py:61` joint par `chapter_id` **sans portée d'année**) — pendant que la
  galaxie, `/cours`, la couverture et la progression agissent comme s'il n'existait pas.
  **`review_queue/service.py:81-117` est le seul module qui le traite correctement** (`outerjoin`
  + `or_` + `COALESCE`) : c'est le patron à reprendre. Aucun script de backfill n'existe.

### Nées de la confrontation du mockup Diagnostic v2 au code (2026-08-08)

> Trouvées en préparant la refonte de la page Diagnostic. **Aucune n'est un défaut de maquette** :
> ce sont des écarts du module `diagnostics`, mis au jour parce que le mockup, lui, était
> réfutable. Le mockup v3 (`docs/frontend-papa/mockup/`) en tient compte ; le code non.

- 🔴 **AUCUNE route `diagnostics` n'exige de rôle.** Les six utilisent `Depends(get_current_user)`
  seul (`diagnostics/router.py:29,39,61,68,78,100`), alors que `require_parent` / `require_child`
  existent (`auth/deps.py:32`, `:48`) et que l'`API_SPEC.md` annote pourtant « (Papa) » / « (Massimo) »
  par route. Conséquences : **n'importe quel compte authentifié peut lancer une génération LLM**,
  et surtout **peut SOUMETTRE un diagnostic à la place de Massimo** — ce qui écrase `SkillMastery`
  (signal fort, écrasement brut) et ouvre des `Gap` sur une mesure fausse. **La plus grave de la
  liste.**
- 🔴 **Aucune fermeture de lacune par un bon diagnostic.** `diagnostics/service.py` n'écrit jamais
  `Gap.status = "resolved"` ni `resolved_at`. Une notion qui remonte de 40 % à 95 % **laisse sa
  lacune ouverte**. Le seul chemin qui referme une lacune est le verdict `acquired` d'une mission.
- 🔴 **La dédup de `Gap` ne lit que `"open"`** (`service.py:246`), alors que la définition canonique
  est `OPEN_GAP_STATUSES = ("open", "in_progress")` (`progress/service.py:31`), dont le commentaire
  dit « cette définition vivait en quatre exemplaires […] les trois autres importent désormais
  celui-ci ». **`diagnostics` ne l'importe pas.** Dès que Papa lance une mission (la lacune passe
  `in_progress`), le diagnostic suivant crée une **seconde ligne ouverte** sur la même notion.
- **`existing.severity = severity` sans condition** (`service.py:251`) — escalade **et
  désescalade** silencieuses, sans horodatage. À comparer avec `chat/service.py:225-226`, qui
  refuse explicitement toute escalade d'une lacune existante par du déclaratif.
- **Les lacunes affichées ne sont pas lues en base.** `_per_skill_for_attempt` (`service.py:439-442`)
  les **recalcule** depuis les réponses de la passation. Une lacune résolue continue donc de
  s'afficher, à jamais — alors que le docstring `service.py:379` promet « lacunes **ouvertes** ».
- **Deux `AIJob` par génération** : `travaux.enfiler` (`travaux.py:211`) en crée un, puis
  `generate_diagnostic` (`service.py:92`) en crée un second, même `job_type`. Tout compteur
  d'activité de production **compte double**.
- **Le diagnostic mesure toujours les 8 MÊMES notions** — `select(Skill).where(subject_id)
  .order_by(Skill.id)[:MAX_SKILLS]` (`service.py:72-74`) : les 8 plus petits `id`, c'est-à-dire les
  8 premières insérées. Aucune rotation, aucun tirage, aucune priorisation des notions fragiles.
  **Sur ~280 notions au catalogue**, une passation ne dit rien des autres. `MAX_SKILLS` est un
  littéral de module, pas un réglage de `config.py` — contrairement à ses voisins
  `mission_command_max_skills` / `mission_champion_max_skills`.
- **`QUESTIONS_PER_SKILL = 2`** (`service.py:36`) ⇒ un score par notion ne peut valoir que
  **0, 50 ou 100**. Et si le LLM n'en rend qu'une (rejet silencieux des malformées, `service.py:124`),
  une notion peut être déclarée **lacune grave sur une seule question ratée**.
- **Aucun filtre de leçon, de niveau ni d'année active** dans la sélection des notions. Le
  paramètre `level` de la requête **ne restreint rien** — il n'alimente que le prompt
  (`service.py:116`). Et `list_subjects` ne filtre que `Subject.is_active`, jamais
  `SchoolYearSubject` : le menu peut proposer des matières hors programme.
- **`_status_from_score` existe en quatre exemplaires** — `diagnostics/service.py:42`,
  `quizzes/scoring.py:27` (dupliqué **volontairement**, motif écrit), et **deux fois en ligne** dans
  `DiagnosticsPapaPage.tsx:14` et `:120`, avec des bornes réduites à 70/40. Conséquence : le palier
  **`mastered` (≥ 90) n'existe pas à l'écran** — une notion à 95 % et une à 72 % s'affichent
  identiques, alors que `progress/service.py:13-15` défend explicitement l'inverse
  (« *"consolidé" doit vouloir dire acquis, pas "presque"* »). Le champ `status` est pourtant
  transmis (`schemas.py:60`) et **jamais lu**.
- ~~**`completed_at` est transmis et jamais affiché**~~ — **FAIT (ADR-0043, PR #99)** : la date
  est portée par le rail et par l'en-tête du panneau.
- ~~**Pas d'endpoint détail d'une passation**~~ — **FAIT (ADR-0043)** : `GET /results/{attempt_id}`.
  ⚠️ **Le reste de la ligne TIENT** : `GET /results` est toujours plafonné à **10** en dur, sans
  pagination ni filtre, et `GET /quizzes` fait toujours un **N+1** (2 requêtes par ligne).
- **`severity="low"` n'est jamais émise** par le diagnostic (`service.py:52-53` est binaire), alors
  que le modèle la déclare et que le chat l'utilise. Un filtre à 3 sévérités aurait une catégorie
  toujours vide.
- **Une ligne de doc fausse sur deux** : ~~`API_SPEC.md` annonçait un corps synchrone~~ —
  **CORRIGÉ (ADR-0043)**, le §Diagnostics dit désormais le `202` et le travail.
  ⚠️ **`routeLabels.ts:21` TIENT** : il mappe **`/diagnostic`** (singulier) alors que la route
  réelle est **`/diagnostics`** — le libellé ne matchera jamais.

### 🔴 Nées de la RELECTURE HUMAINE du chantier ADR-0043 (2026-08-08)

> Cinq défauts trouvés à l'écran en quelques minutes, **aucun détectable par un test**. C'est ce
> que les quatre merges précédents (#79, #89, #91, #98) n'avaient pas eu. À lire comme la preuve
> que la relecture visuelle n'est pas une formalité de clôture.

#### La page Diagnostic de MASSIMO — ✅ LIVRÉE ET MERGÉE, `adr-0044` (2026-08-08)

> **Ce n'est plus au backlog : c'est livré.** PR
> [#100](https://github.com/NeuronXcore/zetis-school/pull/100), squash `6642a30`, trois sessions,
> aucune migration. `CHANGELOG.md` **0.60.0** ; `TROUBLESHOOTING.md` deux sections
> `feat/diagnostic-massimo-propose`. Le texte ci-dessous est conservé **comme trace du constat
> d'origine**, pas comme une tâche ouverte.
>
> 🔴 **Cette section a porté le titre `▶▶ PROCHAIN CHANTIER` pendant vingt-quatre heures après le
> merge**, en même temps que l'`adr-0044`, `DECISIONS.md` et `MEMORY.md` — et elle a envoyé la
> session de reprise du **2026-08-09** re-cadrer un chantier fait. Le geste manquant de l'étape
> 4bis n'était pas un contrôle : c'était **retirer l'annonce**.
>
> ⚠️ **L'ordre décidé a bien été tenu**, contrairement à ce que `MEMORY.md` a écrit ensuite : #100
> (Massimo) est passée **avant** #103 (Papa, `adr-0045`).

**Décidé le 2026-08-08 : elle passe AVANT les optimisations de la page Papa.**

*« Une liste infinie de diagnostics sans savoir ce qu'il doit faire ou pas. »* Le constat était
exact, et mesurable — **les trois points sont traités** :

- **`list_diagnostics` n'a aucune limite** — `order_by(Quiz.id.desc())`, c'est tout. Tous les
  diagnostics validés depuis toujours. 15 en base de dev, et ça ne fera que croître.
- **`taken` est servi et ne structure rien** : `DiagnosticPage.tsx:194` s'en sert uniquement pour
  écrire « Refaire ↻ » ou « Commencer → ». Le fait et le à-faire sont dans la même liste plate.
- **Aucun tri par pertinence, aucune séparation, aucun « celui-ci d'abord ».**

⚠️ **L'ADR-0043 a aggravé le contraste sans toucher cette page** (elle était hors périmètre
explicite) : Papa a désormais un rail à trois crans groupé par mois avec un panneau qui explique,
pendant que Massimo garde une liste plate.

Rituel complet attendu — `mockup → spec → ADR → prompt` : c'est l'espace enfant, où les règles de
gamification sont les plus strictes.

> ✅ **Rituel tenu** : maquette, puis spec, puis `adr-0044` (9 décisions), puis
> `prompts/claude-code/prompts-claude-code-adr-0044.md` en trois sessions — dans cet ordre, et
> l'élargissement de périmètre de la Décision 5 soumis au commanditaire **avant** toute ligne de
> code.

#### Le témoin de nouveauté « Diagnostic » chez Massimo — ✅ TRANCHÉ, addendum `adr-0030` (2026-08-08)

`navigation.ts` (Massimo) range Diagnostic parmi les entrées **sans témoin**, et
`navigation.test.ts:66` le verrouille. 🔴 **Mais deux des motifs écrits sont devenus FAUX à cause
de l'ADR-0043 :**

- *« Diagnostic … n'a ni trace de vue **ni contenu entrant** »* — depuis le gate, il y a un moment
  « ça arrive » : **Papa valide, et le diagnostic apparaît chez Massimo**. C'est exactement le
  motif de l'Agenda, qui a droit à son témoin (« il naît d'un geste de Papa et meurt d'un regard ») ;
- le test voisin justifie l'absence de témoin sur Quiz par *« la table `quizzes` n'a pas de
  `validation_status` »* — **elle en a un depuis la migration `a9b0c1d2e3f4`**. Le test passe
  toujours, sa raison écrite ne tient plus.

⚠️ **Le badge demandé est probablement du type INTERDIT.** La règle ADR-0030 est
**« NOUVEAU jamais DÛ »** : « 3 diagnostics à passer » est un **compte de non-faits**, qui
*« ne décroîtrait que par le travail et grossirait quand Massimo ne vient pas »*. Seul un témoin
de **nouveauté** est légal — et il exige une **trace de vue** qui n'existe pas : `quiz_attempts`
enregistre « passé », pas « vu ». Il faudrait une table, comme `mindmap_views` a soldé la même
dette.

**→ Addendum à l'ADR-0030 nécessaire.** Ne pas toucher le test-verrou sans lui : il existe
précisément pour empêcher qu'on complète la liste « par symétrie apparente ».

> ✅ **L'addendum EXISTE** : `docs/decisions/adr-0030-addendum-temoin-diagnostic.md` (commit
> `7ce2657`), livré avec la PR #100. Le texte ci-dessus est conservé comme trace du constat, pas
> comme une tâche ouverte.
>
> 🔴 **Et la décision est allée CONTRE l'analyse ci-dessus, en le disant** : le témoin a été
> accordé — **numérique**, comptant les diagnostics relus par Papa et **non encore passés**,
> s'éteignant **par le travail** et non par le regard. C'est bien la colonne « Arriéré » que
> l'`adr-0030` déclare *interdite en navigation* : il naît d'un geste de Papa ✅, meurt du travail
> ❌, **grossit si Massimo ne vient pas** ❌. **Décision du commanditaire, prise après que
> l'objection lui a été exposée en toutes lettres et RÉAFFIRMÉE**, et écrite *« parce qu'une règle
> qu'on enfreint sans le dire cesse d'être une règle pour tout le monde »*.
> Le contre-motif reste **au dossier** (`CLAUDE.md` §gamification, motif du retrait du streak le
> 2026-07-27). Cet addendum **révoque aussi l'`adr-0044` Décision 7**, acceptée le matin même.

#### Optimisations de la page Diagnostic PAPA — ✅ CADRÉES, `adr-0045` (2026-08-08)

> **Elles ne sont plus au backlog : elles sont un chantier.** Voir
> `docs/decisions/adr-0045-la-page-diagnostic-papa-montre-ce-qu-elle-annonce.md`, la spec
> `docs/frontend-papa/page-diagnostic.md` (passages `[0045]`), la maquette
> `mockup-papa-diagnostic-v4-optimisations.html` et le prompt
> `prompts/claude-code/prompts-claude-code-adr-0045.md`. Le texte ci-dessous est conservé
> **comme trace du constat d'origine**, pas comme une tâche ouverte.
>
> ⚠️ **Le compte était faux, et il est corrigé** : « quatre optimisations » était écrit cinq fois
> dans le dépôt pour **trois** items ci-dessous — recopie probable des « **4 jauges** » de l'item 1.
> La relecture visuelle du cadrage a trouvé la **vraie quatrième** : la jauge compte des matières
> *générées* et écrit *mesurées*, donc `8 − 2 = 6` quand l'écran dit `5`. C'est la **Décision 7**
> de l'`adr-0045`.

1. 🔴 **Les 4 jauges ne sont pas cliquables.** Le dépôt a `KpiFocusCard` (« une mesure **ET le
   contrôle qui montre ce qui la fonde** », ADR-0028 §5), et l'ADR-0039 est né de ce défaut exact :
   **des nombres qui mentaient, invisibles parce que non cliquables**. Deux de mes jauges annoncent
   des populations que rien à l'écran ne montre (« 2 lacunes dont 2 sans contenu produisible »,
   « 13 proposés non passés »). La 4ᵉ doit rester **inerte** : elle vaut zéro par décision.
2. 🔴 **Le cran « proposé » est un cul-de-sac.** La maquette prescrit **deux actions par cran non
   mesuré**, une seule sur quatre est implémentée :

   | Cran | Action principale | Action secondaire | Livré |
   |---|---|---|---|
   | généré | Ouvrir dans la file de relecture → | Refuser ce lot | la principale seule |
   | proposé | Voir la page de Massimo → | Retirer la proposition | **rien** |

   Les deux actions secondaires appellent `POST /reject`, qui existe déjà.
3. **« en attente · non passé » ne nomme personne.** Les deux crans non passés affichent deux
   paires de deux mots, de même forme et de même gris, mais désignent des acteurs **opposés** :
   « à relire · non proposé » (la balle est chez Papa) et « en attente · non passé » (chez
   Massimo). La maquette avait la bonne formulation dans sa **légende** — « **chez Massimo** ·
   pas encore passé » — et cette légende n'a pas été implémentée. ⚠️ Nommer l'acteur est factuel ;
   compter les jours d'attente resterait **interdit** (`CLAUDE.md` §gamification).

#### 🔴 Décision produit en attente — « Voir la page de Massimo → » (née de l'`adr-0045`)

**Différée le 2026-08-08 pendant la Session B, par décision du commanditaire.** L'`adr-0045`
Décision 5 prescrivait deux actions par cran non passé ; **trois cellules sur quatre sont
livrées**, la quatrième ne peut pas l'être.

**Pourquoi elle ne peut pas** — deux obstacles, le second rédhibitoire :

1. **aucun lien inter-app n'existe** : la seule variable du front Papa est `VITE_API_URL`, il n'y a
   ni `VITE_MASSIMO_URL` ni le moindre lien vers l'app enfant dans le dépôt ;
2. 🔴 **le rôle l'interdit** : la page de Massimo appelle des routes `require_child`, qui répondent
   **403 « Accès réservé à l'espace de Massimo. »** à un rôle parent (`auth/deps.py:55`). Papa y
   verrait un écran vide ou une erreur — **jamais ce que Massimo voit**.

⚠️ **Le besoin reste bon** : *vérifier ce que l'enfant a sous les yeux*. C'est la **mise en œuvre**
qui n'existe pas, et aucune ligne de code ne peut l'inventer sans rouvrir la frontière des rôles.

**Les deux voies, à trancher** :

- **Un lien inter-app assumé** — `VITE_MASSIMO_URL` + `.env.example`. Utilisable seulement depuis un
  appareil où **Massimo est déjà connecté** (la tablette de la famille), sinon Papa tombe sur
  l'écran de connexion. Honnête si c'est dit ; trompeur si ça ne l'est pas.
- **Un aperçu côté Papa** — le panneau dit ce que Massimo voit de ce diagnostic : sa place dans le
  tri de sa page (`adr-0044` Décision 2), s'il est celui proposé en tête. Aucun problème de rôle,
  mais **c'est du design neuf** et ça demande son propre cadrage.

> Un test-verrou fige l'absence : `crans.test.ts` → *« le cran « proposé » n'en a pas — DIFFÉRÉE, et
> c'est écrit »*. S'il tombe, c'est que quelqu'un a rouvert la question sans passer par ici.

#### 🔴 CHANTIER À CADRER — une lacune comblée AUTREMENT ne se referme jamais

**Demandé par le commanditaire le 2026-08-09**, en regardant la page Lacunes livrée.

**Le constat, vérifié dans le code** : **un seul endroit** du backend écrit `gap.status =
"resolved"` — `missions/service.py:1011`, à la **fin d'une mission**. Si Massimo comble la notion
autrement — quiz réussi, diagnostic repassé, carte SRS acquise —, la lacune **reste ouverte
indéfiniment** chez Papa.

🔴 **Ce que le chantier ADR-0047 vient d'aggraver** : la page propose désormais **d'agir** sur
chaque lacune. Elle peut donc proposer de produire du contenu pour une notion **déjà acquise** —
un geste qui coûte une génération LLM pour rien, sur un constat périmé.

⚠️ **C'est une DOCTRINE, pas un correctif.** Il faut trancher **quel signal vaut résolution**, et la
réponse n'est pas évidente : un quiz réussi une fois n'est pas une acquisition (c'est tout le sens
de la répétition espacée), et `SkillMastery.status == "mastered"` est déjà une mesure qui existe —
mais les deux populations sont **disjointes** par décision (`page-lacunes.md`, « ce n'est pas la
liste des notions fragiles »). Refermer une lacune sur la maîtrise reviendrait à les fondre.

**Ce que ça touche** : `diagnostics`, `quizzes`, `memory` (SRS) et `missions` — quatre modules qui
écriraient tous une résolution, plus le risque de quatre définitions divergentes de « acquis », le
motif exact des dettes `has_referentiel` et `_active_year`.

**Rituel complet attendu** — `mockup → spec → ADR → prompt`. Deux questions appellent une décision
et non un patch : **quel signal referme**, et **une lacune refermée peut-elle se rouvrir** (si oui,
`resolved` n'est plus un état terminal).

#### 🔴 DÉCISION PRODUIT EN ATTENTE — une vue calendrier sur la page Lacunes

**Demandée par le commanditaire le 2026-08-09**, sur le modèle du **Cahier de bord IA**, avec tri
par matières et séparation ouvertes / prises en charge.

⚠️ **Elle CONTREDIT une décision écrite**, et c'est pourquoi elle attend un cadrage plutôt qu'un
patch. `docs/frontend-papa/page-lacunes.md` tranche : *« Ce n'est pas une surface de mesure. Aucun
compteur global, aucune tendance, aucune date de bascule — Progression les porte. »*

**Et les deux calendriers ne répondent pas à la même question** : celui du Cahier de bord navigue
**par date** sur des *événements* (« qu'a fait Massimo ce jour-là »). Une lacune est un **stock**,
dont la seule date est `first_detected_at` — un calendrier dirait *quand elles ont été repérées*,
ce qui n'aide pas à décider laquelle traiter.

**Ce qu'il faut donc d'abord** : un **addendum à l'`adr-0047`** qui révoque explicitement ce point,
ou qui reformule le besoin. Le dépôt interdit de contourner une décision sans la nommer.

> ⚠️ **La moitié « tri par matières » est LIVRÉE** (2026-08-09) : le sélecteur `SubjectFilterChips`
> est sur la page, alimenté par les matières **des lacunes elles-mêmes** — zéro requête. Ce qui
> reste en attente est le **calendrier**, pas le tri.

#### La station ② du Diagnostic sur-promet — DIFFÉRÉE de l'`adr-0047` §8 (2026-08-09)

**Ce qui reste après le chantier ADR-0047.** Sa Décision 8 annonçait la correction de la station ②
en « **trois lignes** ». Vérifié à l'exécution : **c'était faux**, et le commanditaire a réduit la
décision à son seul geste gratuit. Voici le chiffrage réel des deux qui restent.

| Geste actuel | Ce qu'il promet | Où il mène | Ce qu'il faudrait |
|---|---|---|---|
| « Produire le quiz de **cette notion** → » | une notion | `/quiz?subject=` — la **matière** | l'action `equipNotion` portée dans `PanneauPassation` : `ConfirmDialog` + `ProgressBar` + état de sondage |
| « Valider le cours de **cette leçon** → » | une leçon | `/programme?subject=` — la **matière** | `lesson_id` au contrat de `lacunes_de_passation` : service + `DiagnosticGapOut` + type `DiagnosticGap` |

✅ **Fait par l'`adr-0047`** : « Voir la lacune → » transporte enfin la matière
(`/lacunes?subject=<slug>`) — il menait à la liste complète. C'était le cul-de-sac **circulaire**
cité en Contexte de l'ADR, et il ne coûtait **rien** : le slug était déjà sur l'entrée du rail.

⚠️ **Moins cher qu'il n'y paraît, et c'est daté** : `apps/frontend-papa/src/lib/gesteLacune.ts`
porte **déjà** la table de décision `content_state → geste`, écrite pour la page Lacunes et
testée (9 verrous + 5 sabotages). La station ② répond à la **même** question sur les **mêmes**
états : le vrai travail est de brancher cette règle, pas de la réécrire. Plus le champ backend et
l'action.

> 🔴 **Un test FIGE cette dette** — `PanneauPassation.test.tsx`, *« les deux autres gestes visent
> encore la MATIÈRE — et c'est consigné, pas oublié »*. **S'il tombe, c'est que la dette est payée :
> il faut alors le SUPPRIMER, pas l'ajuster.** C'est le patron du `xfail(strict=True)` de la
> fenêtre `flat` — la première dette du dépôt à s'être rappelée toute seule au moment exact où elle
> a été payée.

#### ▶▶ PROCHAIN CHANTIER — l'anti-triche du diagnostic

**Décidé le 2026-08-08, pendant le cadrage de l'`adr-0045` : il passe APRÈS les 4 optimisations.**

*« L'élève est en train de faire un diagnostic et cherche les réponses sur le web ou l'IA. Comment
s'en douter ? »*

**Pourquoi ça compte plus qu'ailleurs** : le diagnostic est le seul endroit de ZETIS où une mesure
fausse **se propage** — elle ouvre des `Gap`, écrit `SkillMastery`, nourrit les missions et le
Conseil de classe. Une triche ne fait pas « gagner » Massimo, elle fait **construire ZETIS sur du
faux**, et rien d'extérieur ne vient la contredire. C'est le motif que la station ③ défend déjà
(*« ZETIS ne se commande pas de production sur sa propre mesure »*), un cran plus tôt dans la
chaîne.

🔴 **À savoir avant de choisir quoi que ce soit** : **aucun signal côté navigateur ne survit à un
téléphone posé à côté de l'écran.** Focus d'onglet, temps, presse-papier — tout ça attrape la
triche *sur le même appareil* et rien d'autre. Construire un détecteur sans le dire produirait un
instrument qui rassure sans mesurer.

**Les quatre pistes retenues par le commanditaire** (les quatre, pas un sous-ensemble) :

1. **La sortie d'écran** — `visibilitychange` / `blur` : *cette question a été quittée avant
   d'être répondue*. Le signal le plus net et le moins interprétatif, aucun seuil à inventer.
2. **Le temps par question** — horodater chaque réponse. Le plus riche et le plus **bruité** :
   lenteur ≠ triche. **Indice pondéré, jamais verdict**, et ⚠️ **jamais de chrono visible** —
   ce serait de la pression anxiogène (`CLAUDE.md` §gamification) et ça changerait la mesure
   elle-même.
3. **La verbalisation après coup** — sur 1 ou 2 bonnes réponses tirées au sort : *« explique en une
   phrase comment tu as trouvé »*. Une réponse copiée ne survit pas à l'explication, et
   `CLAUDE.md` **prescrit déjà** la verbalisation : le contrôle devient un acte d'apprentissage au
   lieu d'une surveillance.
4. **Retirer ce qu'il y a à gagner** — auditer tout ce qui récompense encore un **bon score** de
   diagnostic (XP, badges, galaxie, Conseil de classe, formulation du résultat). L'`adr-0044` a
   déjà retiré le score brut à l'enfant et l'XP est donné pour **être venu** (§9). S'il triche
   encore, ce n'est pas pour gagner : c'est pour **ne pas avoir l'air nul** — et ça, aucun
   détecteur ne le règle, seule la formulation du résultat le règle.

**L'usage du signal — tranché** : la passation porte un état « **mesure à confirmer** » visible
**côté Papa seul**, avec les faits bruts (« 3 questions quittées en cours »). Papa tranche.
**Massimo ne voit rien et n'est jamais accusé.**

🔴 **La règle de vocabulaire, non négociable** : tout ce qui sera construit dit « **cette mesure est
peu fiable** » — on parle de l'instrument — et **jamais** « Massimo a peut-être triché » — on
parlerait de l'enfant. Un enfant accusé à tort par un logiciel apprend surtout à s'en méfier.

**Rituel complet attendu** — `mockup → spec → ADR → prompt`. Deux points appellent une décision et
non un patch : le **bridage de la propagation** (une mesure douteuse doit-elle écrire `Gap` et
`SkillMastery` avant confirmation ?) et la **surface de la verbalisation**, qui touche l'écran de
passation — jusqu'ici hors périmètre de tous les chantiers Diagnostic.

---

### ✅ CADRAGE TERMINÉ le 2026-08-09 — `adr-0048` ACCEPTÉ, rituel complet, RIEN d'implémenté

> ✅ **Ne rien re-cadrer ici.** Le rituel `maquette → spec → ADR → prompt` est **complet**, en deux
> sessions le même jour, **sans une ligne de code**. Ce qui suit est conservé comme **archive du
> read-before-code** — les décisions vivent désormais dans l'ADR, qui fait foi.
>
> - ADR : **`docs/decisions/adr-0048-zetis-doute-de-sa-propre-mesure.md`** — 10 décisions **gelées** ;
> - Spec (source unique de la règle, des seuils et des noms de champs) :
>   **`docs/backend/fiabilite-de-la-mesure.md`** ;
> - Surfaces : passages `[0048]` de `docs/frontend-papa/page-diagnostic.md` et
>   `docs/frontend-massimo/page-diagnostic.md` ;
> - Maquettes (**vues à l'écran**) : `docs/frontend-papa/mockup/mockup-papa-fiabilite-mesure-v1.html`
>   et `docs/frontend-massimo/mockup/mockup-diagnostic-resultat-verbalisation-v1.html` ;
> - Prompt : **`prompts/claude-code/prompts-claude-code-adr-0048.md`** — **trois sessions**.
>
> 🔴 **Accepté ≠ livré — RIEN n'est implémenté.** Cette phrase doit **mourir ici** le jour du merge.
>
> **Ce que le cadrage a tranché en plus des quatre décisions ci-dessous** : un **6ᵉ signal** (le
> contraste avec l'historique devient un **fait déclencheur**, pas une note de bas de page) · la
> **verbalisation est INCONDITIONNELLE** (la conditionner au doute la transformerait en accusation) ·
> **trois états côté Papa, pas deux** (`null` = ZETIS ne regardait pas ≠ rien à signaler) · **la seule
> réponse à « à confirmer » est de REMESURER** (la bande ne se retire pas) · la **galaxie reste**
> malgré l'audit de la 4ᵉ piste.
>
> 🔴 **Les deux pièges qui rendraient le chantier inopérant EN RESTANT VERT**, écrits dans le prompt :
> le contraste calculé **après** `_upsert_skill_mastery` vaut toujours zéro (la passation se
> comparerait à elle-même), et `NON_ACTIVITY_EVENTS` au lieu de **`NON_WORK_EVENTS`** ferait compter
> un `page_viewed` comme du travail — le défaut que le dépôt a déjà payé sur
> `production.runner.massimo_is_active`.

**🔴 Ce que le read-before-code a démenti ou complété (vérifié dans le code) :**

1. 🔴 **La durée d'une passation n'est PAS mesurée — elle vaut zéro par construction.**
   `submit()` pose `started_at = completed_at = now`, le **même instant**
   (`diagnostics/service.py:483-490`). Et `QuizAttempt.duration_seconds` **existe déjà** dans le
   modèle… et n'est **jamais écrit**. La piste 2 ne part donc pas de « horodater chaque réponse » :
   elle part de « le backend n'a **aucune** notion du temps, pas même la durée totale ».
2. ✅ **Les pistes 1 et 2 coûtent ZÉRO migration côté données.** `QuizAnswer.answer_json` est un
   JSON libre, déjà écrit à chaque réponse (`{"choice_index": chosen}`) : horodatage et drapeau
   « quittée en cours » y logent sans toucher le schéma.
3. 🔴 **Le vrai coût est côté FRONT.** Le client envoie `{question_id, choice_index}[]` **une seule
   fois, en fin de parcours** (`lib/diagnostic.ts:95`). Il ne mesure rien, n'observe rien. Le
   backend ne peut rien inférer de ce qu'on ne lui envoie pas.
4. ⚠️ **Il manque un endroit pour le VERDICT.** `QuizAttempt` n'a aucun champ pour « mesure à
   confirmer » — c'est la **migration probable du chantier, et sans doute la seule**.
5. ✅ La propagation est bien immédiate et inconditionnelle : `_upsert_skill_mastery` + `_upsert_gap`
   + `award_xp`, puis **un seul** `db.commit()`. Et l'XP est bien donné pour **être venu**.

**🔴 Ce que le `BACKLOG` ne disait pas, et qui est le meilleur signal du lot :** le seul qui
**survit au téléphone posé à côté** n'est pas dans le navigateur, c'est le **contraste avec
l'historique** — score élevé sur une notion jamais travaillée, jamais vue, sans contenu consulté.
ZETIS a déjà tout pour le calculer (`SkillMastery`, `LessonView`, passations antérieures) : **zéro
instrumentation**. ⚠️ Bruité dans l'autre sens : un enfant peut savoir une chose sans l'avoir
travaillée **dans ZETIS**.

**Décisions du commanditaire (2026-08-09) — à relire, pas à rouvrir :**

- **Propagation** : la mesure **écrit** comme aujourd'hui, et le **verdict s'y attache**. Pas d'état
  intermédiaire, pas de geste obligatoire de Papa — donc rien à défaire, et pas de mesure en
  attente indéfinie.
- **Verbalisation** : **après la soumission, sur l'écran de résultat**. L'écran de **passation
  n'est pas touché** — et la demande reste un acte d'apprentissage, pas une surveillance.
- **Signaux retenus** : sortie d'écran · timing par réponse · **contraste avec l'historique** ·
  `copy` de l'énoncé (il couvre un trou de la sortie d'écran : on peut copier **sans quitter la
  page**) · `resize` / split-screen.
- **Écarté : les mouvements de souris** — bruit énorme, **absents sur tablette et iPhone**, et
  c'est de la surveillance comportementale, ce qui heurte la règle de vocabulaire du chantier.

**🔴 « Bloquer la navigation » a été demandé, et c'est IMPOSSIBLE côté web** — ni `Cmd+T`, ni
`Cmd+Tab`, ni quitter le navigateur, ni un second appareil. Ce n'est pas une limite de ZETIS : un
site qui pourrait retenir l'utilisateur serait une faille. **Décision : aucune barrière.** Le
**plein écran** entre comme **sixième signal**, pas comme empêchement — en sortir est un geste
délibéré que `fullscreenchange` détecte. ⚠️ Il exige un geste utilisateur pour démarrer et **iOS
Safari le refuse sur iPhone** : il ne vaudra que sur iPad et desktop, et l'ADR doit le dire.
⚠️ Le seul dispositif qui bloque vraiment est **hors du code** : l'**Accès guidé iOS**, un geste de
Papa avant la passation. Écarté du périmètre, mentionné ici pour qu'on ne le redécouvre pas.

#### Ce que l'`adr-0048` laisse dehors, et qui reste à faire

- ✅ ~~**La voix sur la verbalisation**~~ → **ENTRÉE dans le périmètre le 2026-08-09**, décision du
  commanditaire (ADR **Décision 5 bis**). Elle avait été exclue sur une affirmation **fausse** —
  *« la dictée vit dans `Eli5Session.tsx`, pas dans une brique réutilisable »* — produite par un
  `grep` mort en zsh dont le vide s'est lu comme une absence de résultats
  (`TROUBLESHOOTING.md` § *Cadrage de l'ADR-0048*). En vrai :
  `apps/frontend-massimo/src/lib/dictation.ts` a **déjà deux consommateurs**, et `transcribeEli5`
  est **déjà appelé par `ChatPage.tsx`**, un écran non-ELI5. **Trois imports, zéro backend.**
- 🔴 **L'écran de passation du diagnostic affiche TOUTES les questions d'un bloc — le découper est un
  chantier PÉDAGOGIQUE, pas une pièce d'anti-triche.**
  Trouvé au read-before-code de la Session B de l'`adr-0048` (2026-08-09). `DiagnosticPage.tsx:227`
  empile les questions dans une page qui défile, boutons radio, un seul « Envoyer mes réponses » :
  **ni question courante, ni barre de progression** (`grep` sur `currentQuestion|questionIndex|step`
  ne rend rien).
  🔴 **Et trois documents décrivaient l'inverse.** L'`adr-0044:291` range en hors-périmètre *« l'écran
  de passation (une question à la fois, barre de progression) »* — **un écran qui n'a jamais
  existé** — et la phrase a été recopiée dans l'`adr-0048` et sa spec sans être revérifiée. C'est
  exactement le défaut que la spec de Massimo documente sur sa propre v1. **L'`adr-0044` est mergé et
  n'est pas réécrit** : la fausseté est nommée dans l'`adr-0048` constat n° 6 bis, là où elle a été
  découverte.
  **Ce que ça a coûté** : deux des six signaux de l'anti-triche ont dû descendre au niveau de la
  passation (Décision 1 bis) — on garde le fait, on perd le rattachement à une question.
  ⚠️ **Le motif du découpage n'est PAS l'anti-triche**, et il ne doit pas l'être : un mur de huit
  questions est lourd pour un enfant, point. L'`adr-0048` refuse explicitement d'améliorer
  l'instrument en changeant l'écran qu'il mesure — *un enfant qui se sait observé ne passe plus le
  même diagnostic*. Si ce chantier se fait, il se fait pour Massimo, et les signaux en profitent par
  accident.
- 🔴 **Déménager `/api/ai/eli5/transcribe` sous un nom neutre — dette NOMMÉE, non payée.**
  La route porte le nom d'ELI5 et n'a plus rien d'ELI5 : le module `stt` n'a qu'un `provider.py`,
  **aucun routeur**. Avec le micro de la carte « Raconte-moi », elle aura **trois** consommateurs
  sous le nom du premier. Écartée du chantier ADR-0048 en connaissance de cause : la déplacer
  toucherait deux écrans qui marchent (`useEli5.ts`, `ChatPage.tsx`) pour un gain nul sur la mesure.
- **L'Accès guidé iOS**, geste de Papa avant la passation — le seul dispositif qui bloque vraiment,
  et il est **hors du code**. Écrit ici pour qu'on ne le redécouvre pas.

## Bugs / risques à surveiller

- **Tenue de la 3D sur les trois appareils de Massimo — dette OUVERTE et devenue critique le
  2026-07-31.** Le plafond de nœuds a été supprimé (il cachait sa progression selon la taille de
  son écran) et remplacé par trois gardes qualitatives. Depuis le même soir, `/galaxy` rend la
  galaxie **complète** et l'**Accueil** en monte une seconde. **L'iPhone tranche** : il doit tenir
  les deux. La mesure doit se faire sur un **pire cas semé** — référentiel validé complet,
  plusieurs centaines de notions — et non sur les ~37 étoiles d'aujourd'hui.
  ⚠️ Si ça ne passe pas, ce sont les **particules** qui tombent (budget déjà en place), **jamais
  les nœuds** : remettre un plafond rouvrirait l'addendum « Galaxie animée » §1.
- **Lisibilité de `/galaxy` à plusieurs centaines de notions — jamais vue en vrai.** Les rayons
  des trois anneaux (150 / 260 / 370) et la part de secteur occupée (78 %) sont des
  **suppositions**, pas des mesures. Réponse prévue si ça ne tient pas : un **niveau de détail
  adaptatif** (notions révélées au-delà d'un certain zoom) — à ne **pas** décider avant d'avoir
  regardé.

- Trop de pages avant le cycle pédagogique complet.
- Données mockées qui ne sont jamais reliées au backend.
- IA utilisée sans traces ni sources.
- UI Papa trop complexe.
- UI Massimo trop infantilisante ou trop chargée.
- Gamification addictive.
- Capsules trop coûteuses en temps de rendu.
- **La bascule en phase 1 n'arrive jamais** : si Papa remplit correctement, personne ne ressent
  le besoin de changer et l'agenda reste une liste imposée (risque produit n°1). Revue à date
  fixée, pas « quand il sera prêt ».
- **Phase 0 : la qualité de l'agenda dépend à 100 % de la régularité de Papa.** Un dimanche
  soir sauté = page vide toute la semaine, aucun filet.
- **Session pré-contrôle (ADR-0025 §11.2)** : le non-scheduling existe (`is_consolidation`,
  même jour seulement) mais il manque un deck `{chapter}` et l'extension hors du même-jour.
  Sans ces deux ajouts, une révision avant contrôle **reprogrammerait** les cartes et
  dégraderait la mesure d'oubli sur des mois. Slice dédiée dans le Lot 3.
- Un compteur d'items non faits réintroduit par l'UI (côté Papa comme côté Massimo) →
  contournerait par l'affichage l'invariant tenu serveur (`agenda_item_missed` n'existe pas).