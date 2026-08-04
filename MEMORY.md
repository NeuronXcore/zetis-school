# MEMORY.md — Mémoire de reprise (raisonnement)

> Mémoire du **raisonnement** au sens `docs/WORKFLOW.md` §3/§6.3 : fait / en cours / à-faire /
> décisions actives / prochain pas. Écrit pour la **prochaine session, sans contexte**.
> L'état du **code** se lit dans Git ; les **décisions figées** dans `DECISIONS.md`/les ADR ;
> le modèle de données dans `DATA_MODEL.md`. Ce fichier ne duplique pas ces sources.

## État à la reprise

**Chantier : la production dit enfin la vérité — COMPLET, branche `fix/production-trois-verites`,
base `270ae5f`.** Une seule session, sept chantiers enchaînés : chacun est né en regardant le
précédent à l'écran.

Le point de départ n'était pas une revue de code : un lot bloqué à 95 % dans l'en-tête Papa, et
une demande de Massimo (« Accord du COD — Cours ») qui n'aboutissait pas. **Le worker de production
n'était pas lancé.** Tout le reste a été trouvé en tirant ce fil.

### Où est le code, exactement

| | |
|---|---|
| **MERGÉ `main`** | **PR #80**, squash **`294d0d5`** — branche supprimée, local et `origin` |
| Base | `270ae5f` |
| Migration | **`d8e9f0a1b2c3`** — deux colonnes sur `production_runs`, **appliquée en dev** |
| ADR | `adr-0036-addendum-verdict-de-situation.md` et `adr-0034-addendum-regime-et-destination.md`, indexés |
| Vérifié à l'écran | **oui, dans le Chrome de l'utilisateur** (session connectée), pas seulement en tests |
| Vérifié APRÈS le merge | **839 backend · 400 Papa · 525 Massimo**, `tsc -b` propre sur les deux, sur `main` fusionné |

### Ce que ce chantier a livré

1. **Les tests n'écrivent plus dans le vrai Redis.** 18 jobs fantômes `run_production(1)` dormaient
   dans la file de dev (35 la veille). Fixture `autouse` `file_rq_factice`. ⚠️ **Le point de greffe
   est la FABRIQUE de file, pas `enqueue_*`** — `runs_router` importe au niveau module, donc
   patcher la fonction serait **vert et sans effet**.
2. **`useRunProgress`** — une seule lecture d'un lot pour l'en-tête, la modale et la ligne
   Demandes. On n'estime que ce qui a **démarré** ; `queued` ne rend aucun pourcentage.
3. **`blocked_reason`** sur chaque demande : le verdict porte sur la **situation** (palier + leçon),
   pas seulement sur le type. L'écran remplace « Produire » par le motif et le geste qui répare.
4. **Le régime du lot** (`zetis_mode`) : capturé au démarrage, ou **déduit des actes du lot** quand
   il est antérieur — jamais lu dans les réglages d'aujourd'hui.
5. **Les demandes se referment sur le FAIT** : `close_available_requests` est appelée à la lecture
   de la file (patron `close_stale_runs`), plus seulement à la fin d'un lot.
6. **Le Journal se lit** : case d'état dessinée, motifs réécrits en « état + geste », annotation
   « depuis résolu », destination sur chaque ligne et chaque pièce, résumé dans l'en-tête, **un
   seul pli par lot, fermé**.
7. **Les trois boucles par level ZETIS** (`test_production_par_niveau.py`) — la table de vérité
   `manuel / semi / autonome` jouée sur le chemin complet demande → lot → exécution.

### Décisions actives — à relire, pas à rouvrir

1. **Le Journal est un REGISTRE.** Une ligne passée ne se réécrit jamais (§F.4). Ce qui change au
   présent s'**ajoute à côté** : « depuis résolu », `resolved`, `zetis_mode_source`. Deux
   formulations de motif coexistent donc à l'écran, et c'est le prix assumé.
2. **On ne devine jamais un régime.** La capture prime ; à défaut on **déduit d'actes** (un cours
   rédigé, un dérivé laissé à relire, une origine `request`) ; si rien ne prouve → `null`, dit à
   l'écran. **2 lots sur 9** obtiennent une réponse, et c'est la vérité disponible.
3. **Un caractère n'est pas un élément d'interface.** `☐`/`☑` étaient invisibles sur le fond sombre.
   La case est **dessinée** (SVG, `currentColor`). Et ce n'est **pas** un `<input type=checkbox>` :
   un journal ne se coche pas — test-verrou sur l'absence de `role="checkbox"`.
4. **Le visage du régime vient de `REGIME_AVATAR`** (`lib/regimeVisuals.ts`), source unique déjà
   partagée par la sidebar et les réglages. Ne pas refabriquer une table d'icônes.
5. **`journalLink` traite `srs` à part** : `CoverageCellKey` n'a que quatre colonnes, la branche
   générique enverrait les cartes sur `/quiz`, et leur page attend un `skill_id` en `focus`.

### ⚠️ LES DÉFAUTS TROUVÉS EN CODANT

1. 🔴 **Une contre-épreuve a visé à côté DEUX FOIS dans la journée.** (a) fixture Redis désarmée →
   `len(queue)` = 0 quand même, parce que **le worker consommait les jobs à la milliseconde** ; la
   preuve était dans `FailedJobRegistry` (18 → 21). (b) le `target` a **deux gardes** : en casser
   une seule ne fait rien tomber.
2. 🔴 **`validate_all_lessons` passe en `validated` toutes les leçons `draft` d'un chapitre sans
   regarder s'il y a un texte** → **39 leçons validées-vides contre 28 rédigées**. `Lesson.status`
   porte deux sens ; le motif du gate disait « à valider » d'une leçon qui l'était déjà.
3. **Les pièces leçon-centrées ont `skill_id = None`** par construction : un index `(skill_id, kind)`
   rendait `None` partout. La clé réelle est `(lesson_id, kind)`.
4. **Le contenu d'un `<details>` fermé reste dans le DOM** — un test qui cherche un texte le trouve
   même replié. Les assertions du résumé portent le **chiffre**.
5. **Les suites front ont flaké sous charge** (papa + massimo + graphify en parallèle,
   `environment` à 357 s au lieu de 30) : 1 puis 2 échecs, puis trois exécutions séquentielles
   vertes. **Les noms n'ont pas été capturés** — si ça revient au calme, c'est un vrai défaut.

> Détail et parades : `TROUBLESHOOTING.md`, section du **2026-08-04 (production)**.

### ▶ PROCHAIN PAS

**Ce chantier est CLOS.** Mergé le 2026-08-04 (PR #80, squash `294d0d5`), branche supprimée des deux
côtés, `main` == `origin/main`, arbre propre. Suites relancées **sur `main` fusionné** : 839 backend,
400 Papa, 525 Massimo, `tsc -b` vert. La prochaine session **ouvre un nouveau chantier**.

**Ensuite, chantier suivant — TRI ET FILTRE DU JOURNAL. Les quatre décisions sont DÉJÀ PRISES par
Papa, ne pas les rouvrir :**

1. un filtre garde des **LOTS ENTIERS** (jamais les pièces à l'intérieur) ;
2. **côté SERVEUR**, sur toute l'histoire — la pagination s'applique **après** le filtrage ;
3. critères v1 : **date · matière · chapitre · statut · mode ZETIS · type de contenu** ;
4. **plusieurs clés de tri** (date · matière · mode · statut), inversables. ⚠️ Papa a vu et accepté
   l'avertissement : *un journal qui n'est plus chronologique cesse d'être un journal*.

🔴 **LE POINT DUR, ANALYSÉ le 2026-08-04 — à trancher au cadrage, avant tout code.**

⚠️ **Correction d'une affirmation fausse écrite plus tôt dans la journée.** J'avais noté que
`zetis_mode` « n'est pas filtrable en SQL ». **C'est faux.** Les quatre preuves de la déduction
vivent toutes en base et s'écrivent toutes en SQL : `trigger='request'` est une colonne ; « a rédigé
un cours » est un `EXISTS` sur `lessons.production_run_id` ; « dérivé à relire » / « dérivé servi »
sont des `EXISTS` sur `fiches`/`mindmaps` avec `validated_by`. La déduction est en Python parce que
les objets étaient **déjà chargés pour l'affichage**, pas parce que SQL ne savait pas la faire.

**Les trois vrais obstacles, eux, tiennent :**

1. **Aucun index sur `production_run_id`**, dans aucune des cinq tables produites (vérifié :
   `pg_indexes` ne rend rien). Quatre `EXISTS` par lot sans index = balayage complet par page.
2. 🔴 **La déduction repose sur des artefacts RÉTRACTABLES.** Le veto (ADR-0034) retire des pièces :
   retirer la fiche `pending` d'un lot efface la preuve « A0a = 2 », et **le régime affiché de ce
   lot change rétroactivement**. Un historique qui bouge quand on exerce un droit prévu n'est pas
   fiable — et ce défaut est **indépendant du langage**.
3. **Traduire la règle en SQL en ferait une DEUXIÈME implémentation** (Python pour l'affichage, SQL
   pour le filtre) — le défaut exact que l'ADR-0037 a coûté un ADR entier à réparer.

**▶ Correctif proposé (non validé) : arrêter de re-dériver à chaque lecture.**

- une vraie colonne **`zetis_mode_source`** (`capture` | `deduit`) à côté des deux paliers ;
- un **backfill unique** — un **script**, pas une migration (une migration ne doit pas importer la
  logique métier) — qui écrit `a0a_level`/`a1_level` **là où les actes le prouvent**, marqués
  `deduit` ; `runner.execute` continue d'écrire `capture` ; ce que rien ne prouve reste `NULL` ;
- les **index manquants** sur `production_run_id`.

Le filtre et le tri deviennent alors deux entiers + une source : pur SQL, paginable, et **stable**
— un veto exercé demain ne réécrit plus l'histoire d'hier.

⚠️ **Cela RÉVOQUE une phrase de l'addendum ADR-0034 §1bis** (« rien n'est stocké »). La distinction
doit être écrite : le §F.4 interdit de reconstituer le passé **depuis les réglages d'aujourd'hui**,
qui ont changé ; écrire **une fois** ce que les **actes** prouvent, avec sa provenance, est l'inverse
— c'est ce qui **fige** l'histoire au lieu de la laisser dériver. **Addendum à écrire au cadrage.**

ℹ️ Le **statut**, lui, ne pose aucun problème : `stale` = `status='running' AND heartbeat_at <
now() - délai`, exprimable en SQL sans rien stocker.

⚠️ Ce chantier ajoute une surface d'API → **addendum ADR-0034 attendu au cadrage**, avant le code.

### ▶ DETTES OUVERTES

> ⚠️ Les six dettes qui suivent sont **nées de la session du 2026-08-04 (production)**.

- 🔴 **`Lesson.status` porte DEUX sens** — « la leçon est au programme validé » (ce qu'écrit
  `validate_all_lessons`, sans regarder s'il y a un texte) et « le texte du cours est validé » (ce
  que lit la production). **39 leçons validées-vides contre 28 rédigées** en base de dev. Le
  chantier de séparation exige une **migration** et touche curriculum, galaxie, production et
  `canonical_context`. Nommé dans l'addendum ADR-0036, jamais ouvert.
- 🔴 **Les libellés de cartes SRS affichent du LaTeX BRUT** à l'écran du Journal
  (`Comment calcule-t-on $\frac{2}{5} \times \frac{3}{4}$ ?`). Un `title` au survol a été ajouté
  pour la troncature en pleine formule, **rien ne rend les maths**. Un moteur (KaTeX) est une
  dépendance → **ADR**, pas un correctif.
- ⚠️ **Les suites front ont flaké sous charge le 2026-08-04** (1 puis 2 échecs, `environment` à
  357 s au lieu de 30, en lançant papa + massimo + graphify en parallèle). Trois exécutions
  séquentielles ensuite : vertes. **Les noms des tests n'ont pas été capturés.** Si ça revient sur
  une machine au repos, c'est un vrai défaut de timing, pas la charge.
- **18 jobs RQ fantômes ont été exécutés** contre le Postgres de dev pendant la contre-épreuve
  (`run_production(1)`, `ValueError: production_run 1 introuvable`). Ils sont dans
  `FailedJobRegistry` et n'ont **rien produit**, mais ils y restent — purge non faite.
- **`_pieces_of_run` interroge cinq tables PAR LOT**, et la résolution des cibles en ajoute une
  sixième. Borné par `limit`, jamais mesuré. À regarder si le Journal ralentit.
- **Les lots #21, #22 et #23 ont été SUPPRIMÉS de la base de dev** le 2026-08-04, sur autorisation
  explicite — trois doublons stériles sur la notion 50, aucune pièce rattachée. C'est une
  **réécriture d'historique assumée**, mentionnée ici parce qu'elle contredit la doctrine du §F.4 et
  qu'une session future pourrait s'étonner du trou dans la numérotation.

> ⚠️ Les cinq dettes qui suivent sont **nées de la session du 2026-08-04 (bandeaux)**. Elles portent
> toutes sur la même chose : **rien de ce chantier n'a été jugé à l'œil sur un vrai appareil.**

- 🔴 **LE BANDEAU MASSIMO N'A JAMAIS ÉTÉ VU.** Le panneau navigateur de la session rendait en taille
  réduite : tout ce qui est affirmé sur le rendu est **mesuré dans le canvas** (13–15 bandes sur 20
  occupées selon l'angle, cœur 9× plus lumineux que la périphérie, 86 % de pixels chauds, 19 im/s),
  **pas vu**. ⚠️ **Le merge de #79 a eu lieu QUAND MÊME**, sur décision explicite après que le point
  a été signalé — c'est un arbitrage assumé, pas un oubli, mais la dette n'est pas éteinte pour
  autant : elle est simplement passée d'« avant merge » à « sur `main` ». Elle ne peut pas être
  payée par l'agent. À juger : vitesse de rotation, remplissage, lisibilité du bloc avatar
  par-dessus.
- **`IN_FLIGHT_BUDGET` (32), `ROTATION_PERIOD` (72 s), `FLATTEN` (0,035) et `HEADER_TOTAL` (7 s) ne
  sont pas passés au profileur.** L'addendum ADR-0024 reproche à `GALAXY_MAX_NODES` que « ses
  valeurs n'ont JAMAIS été mesurées » — ne pas refaire la même chose. Une capture Safari sur iPhone,
  jeu semé à ~300 notions. C'est la même dette que « LA GALAXIE — vérifiée à moitié » ci-dessous,
  et les deux se paient d'un seul coup.
- ⚠️ **En phase VIVANTE, le coût par image du bandeau est proportionnel à N** (~202 blits de sprite
  à 19 im/s). C'est le prix explicite de la rotation : dès que tout bouge, le calque posé ne sert
  plus. Pendant la **construction**, il reste indépendant de N. Écrit dans l'addendum §4bis — c'est
  sur iPhone que ça se jugera, pas ici.
- **Le remplissage plafonne à ~65 % de la largeur** à l'arrêt, conséquence directe de l'arbitrage de
  la répartition angulaire. S'il faut mieux : **ne pas toucher la répartition** (elle porte la
  rotation), mais le rayon du disque ou la taille des amas.
- **Le bandeau ne se met pas à jour en cours de session.** Si Massimo travaille une notion, son
  étoile n'apparaît qu'au rechargement suivant. Assumé (`galaxyShared` a une fenêtre de fraîcheur de
  5 s, pas un cache), mais jamais éprouvé en usage réel.


- **Les 22 montées de dépendances backend, différées SCIEMMENT** (mesurées le 2026-08-04 par
  `uv lock --upgrade --dry-run`, qui n'écrit rien). Majoritairement patch/mineures, mais quatre ne
  sont pas anodines : `websockets` 16 → **17** (majeure), `pgvector` 0.4 → **0.5** (le RAG),
  `piper-tts` 1.4 → **1.6** (la voix des capsules), `onnxruntime`/`huggingface-hub` (la dictée).
  ⚠️ **Aucune de ces quatre n'est jugée par la suite de tests** : ces chemins s'exercent **en vrai**
  ou pas du tout. Les 807 tests passeraient au vert sur une montée qui casse la génération de
  capsules. Ce n'est donc pas un bump, c'est un chantier avec **vérification live** — génération,
  RAG, dictée, worker RQ.
- **Le warning `httpx2` reste, et le refus est motivé.** `starlette/testclient.py` essaie `httpx2`,
  retombe sur `httpx` en prévenant. Mais `httpx` **n'est pas une dépendance de test chez nous** :
  trois modules applicatifs l'importent (`ollama_provider`, `anthropic_provider`, `mlx_provider`).
  Installer `httpx2` n'en remplacerait aucun — il **s'ajouterait**, soit deux clients HTTP dans le
  venv pour faire taire un avertissement de `TestClient`. Migrer aussi le code applicatif est un
  changement majeur d'API sur le chemin de **toute la génération**. Le bon moment sera celui où
  Starlette **retirera le repli** : là ce sera une panne, pas un warning, et la migration aura une
  raison.
- **`pyproject.toml` n'a toujours aucune borne haute** (`fastapi>=0.115`, etc.). Le plancher
  `starlette>=0.48` corrige le seul cas qui cassait *à l'import* ; il ne dit rien d'une montée
  majeure future. Pas d'action décidée — c'est un constat, pas un TODO.
- 🔴 **Le patron anti-sondage de l'ADR-0030 est SUSPECT partout où il est copié.** Le test
  « 60 s de timers avancés → un seul appel » ne mord que si `vi.useFakeTimers()` est posé **avant**
  le montage. Démontré le 2026-08-04 : la version de `useAutonomyState` restait verte **avec** un
  `setInterval` ajouté exprès. `useNewsSummary` (Massimo) et ses imitations n'ont **jamais** été
  contre-éprouvées. Une heure de travail, et ça peut réveiller un sondage réel.
- **Les deux pastilles héritées de `PapaSidebar`** (missions à valider, demandes de Massimo) font
  toujours leur propre appel réseau depuis le composant — le motif que l'ADR-0030 a supprimé côté
  Massimo. Elles n'ont **aucun test** : les migrer exige d'écrire leurs verrous d'abord, sinon c'est
  une régression silencieuse sur deux files porteuses. Le verrou « la sidebar ne fait aucun appel
  réseau » est **réduit** en attendant, et le dit.
- **La sidebar Papa n'est toujours pas responsive** : `w-64` sans point de rupture, alors que
  Massimo a reçu son tiroir le 2026-08-04. Le chantier est le même, déjà mené une fois.
- **`API_SPEC.md` ne décrit pas `/api/settings/autonomy`** — vérifié le 2026-08-04, l'endpoint n'y a
  jamais figuré. Ce n'est donc pas une régression de ce chantier, mais le contrat vient de changer
  (`preset` → `niveau`) et rien dans ce fichier ne le porte.

- 🟡 **LA GALAXIE — vérifiée À MOITIÉ le 2026-08-04.** Ce qui est **mesuré** : **202 nœuds** servis
  (1 racine, 4 matières, 12 chapitres, **185 notions**), **74 FPS** au viewport tablette, **zéro
  erreur console**, structure et libellés lisibles en desktop et tablette.
  ⚠️ **Ce qui reste ouvert, et que je ne peux pas faire** : la **tenue sur un vrai appareil**. Un
  viewport à 375 px n'est **pas** un iPhone — ni Safari iOS, ni son GPU, ni ses limites WebGL. Les
  74 FPS sont ceux de ce Mac. **Il faut un iPhone réel.**
  ⚠️ Et **185 notions n'est pas « plusieurs centaines »** : le seuil que l'addendum redoutait n'est
  pas atteint, donc le niveau de détail adaptatif n'est **ni prouvé nécessaire ni prouvé inutile**.
  ⚠️ **Les deux réponses sont DÉJÀ DÉCIDÉES** (addenda ADR-0024/0029), les appliquer n'est donc pas
  une nouvelle décision — les contourner en serait une : si la lisibilité ne tient pas → **niveau de
  détail adaptatif**, jamais le retour du plafond ni le rallumage des forces ; si l'iPhone décroche
  → ce sont les **particules** qui tombent, **jamais les nœuds**.
  ⚠️ Cette dette était **enterrée dans l'historique** de ce fichier depuis le 2026-08-01, donc
  invisible à toute reprise. Remontée ici le 2026-08-04 — **et sa vérification a immédiatement
  trouvé plus grave qu'elle** (le point suivant). C'est l'argument le plus net en faveur du 4ᵉ
  contrôle : une dette qu'on n'a pas sous les yeux ne se paie jamais.
- ⚠️ **La spec de navigation Massimo et le code ont DIVERGÉ, et ce n'est pas réconcilié.**
  `docs/frontend-massimo/navigation.md` (étape 2) prescrit **5 verbes** et une **bottom-nav** sur
  iPhone ; la navigation livrée en porte **13**, chacune ajoutée par une décision postérieure
  (Agenda position 2 par l'**ADR-0025**, « Ma Galaxie » par l'**addendum ADR-0024 §A** qui interdit
  d'en faire un 6ᵉ onglet, six témoins par l'**ADR-0030** avec test-verrou).
  Appliquer la spec **masquerait 8 sections sur mobile**. Le tiroir livré le 2026-08-04 répare la
  largeur **sans rien retirer**, et l'écart est consigné dans la spec elle-même.
  ⚠️ **NE PAS écrire d'ADR pour ça — la décision existe déjà.** L'**ADR-0024**, section
  « Divergence assumée avec `navigation.md` », a tranché il y a quatre semaines : *« L'existant
  prime. Réconcilier `navigation.md` est un autre chantier, resté au `BACKLOG.md` »*. Ce qui reste
  est donc **de la documentation** — mettre la spec au réel — et **rien d'autre**.
  ⚠️ **J'avais écrit ici « un chantier de cadrage qui touche trois ADR ». C'était FAUX**, et ça
  aurait envoyé la session suivante rédiger un ADR inutile. Corrigé le 2026-08-04 après lecture de
  l'ADR-0024 — troisième hypothèse de la journée invalidée par le read-before-decide.
- **La notion ORPHELINE** (aucune leçon) reste insatisfaisable : `equip_piece` le **dit**, rien ne
  le répare. Touche aussi « + Programme » et `skills-backfill`.
- **Les appels aux générateurs sont écrits deux fois** (`equip_notion` / `equip_piece`) — refactor
  sans décision produit, son propre chantier, contre-épreuves serrées (3 consommateurs).
- **Le Commander n'est pas idempotent** (exige `missions.agenda_item_id`, donc une migration).
- ⚠️ **SEPT copies privées de `_active_year`** (`curriculum`, `mindmaps`, `missions`, `dashboard`,
  `fiches`, `quizzes`, `production.coverage`), dont certaines scopées par élève et d'autres non.
  `lesson_resolution.active_year` est publique pour **offrir une destination**, pas pour créer une
  huitième divergence. Les unifier demande de trancher le scope élève — pas ce chantier.
- **`resolve_canonical_context` reçoit un `skill_id`, les générateurs un `lesson_id`** — piège déjà
  documenté (patron quiz), jamais rouvert.
- **Le panneau d'analyse à 3 compteurs** (ADR-0025 §11) attend une mesure SRS scopée chapitre.
- **Un devoir fait produire le chapitre entier** — assumé ; **le dispositif est armé depuis le
  2026-08-03, donc c'est maintenant qu'on peut observer** s'il y a gaspillage.

> ⚠️ **Les quatre dettes qui suivent dormaient dans l'historique de ce fichier**, donc invisibles à
> toute reprise. Remontées le 2026-08-04, en élaguant. C'est ce qui a fait ajouter le **quatrième
> contrôle** avant toute suppression de section (`WORKFLOW.md §5`) : l'historique s'était mis à
> servir de **cimetière à dettes**.

- **Report du Journal de production** (ADR-0034) : le refus de retirer un cours **consommé** n'a
  **jamais été vu à l'écran** (il aurait fallu fabriquer une fausse lecture de Massimo — couvert par
  2 tests backend avec contre-épreuve et 1 test front) ; le geste **« Corriger »** est toujours dû ;
  `has_more` n'a pas de bouton.
- **`notionRouteFor` ignore `action.capsule_id`** et ouvre `/capsules` à plat — le libellé
  « Regarder la capsule » **sur-promet déjà**. Pré-existant (hérité de `NotionActionPanel`), à
  corriger **quand `/capsules/:id` existera**.
- **`prefers-reduced-motion` n'a jamais été vérifié à l'écran.** Le panneau navigateur ne l'émule
  pas, et l'option est désactivée chez Papa — **le chemin où tout doit se figer n'a donc jamais été
  exercé en vrai**. Couvert par des tests unitaires (`particlesFor`) et la variante `motion-safe:`,
  rien de plus.
  ⚠️ **Élargi le 2026-08-04** : le halo gradué de la sidebar Papa en dépend aussi, et sa garde est
  plus exigeante que les autres — elle doit **figer sans retirer** (couper le halo effacerait le
  signal). Vérifié seulement que la règle CSS **existe dans le CSSOM**, jamais qu'elle rend juste.
  Et **trois animations permanentes** dans le coin de l'œil sur 22 pages n'ont jamais été jugées sur
  60 s de travail réel : si ça distrait, le correctif décidé est de **ralentir**, jamais de retirer
  l'axe.
- 👤 **À la charge de Papa, l'agent ne peut pas le faire** : relire l'**amendement de l'ADR-0017
  §5bis** — c'est un changement de **doctrine** du moteur de missions, pas un correctif d'affichage.

### ✅ LE DISPOSITIF EST DÉSARMÉ (2026-08-04, fin de session)

| Réglage | Valeur — **lue en base le 2026-08-04, en fin de session** |
|---|---|
| Régime dérivé | ***Manuel*** (A0a = 2, **A1 = 2**) |
| Déclencheur `zetis_auto_trigger_enabled` | **`false`** |
| Gate du cours | **actif** — ZETIS ne rédige plus un cours à la place de Papa |
| Base lue | `postgresql://…@localhost:5432/zetis` |

**Vérifié en le FAISANT TOURNER, pas en lisant les réglages** : `scan_agenda` et `scan_requests`
appelés à vide rendent `créés: []`, avec leurs motifs — *« le déclenchement automatique est
désarmé »* et *« le régime n'est pas Autonome »*.

⚠️ **2026-08-04, fin de session — le régime a BEAUCOUP bougé, puis a été remis.** La vérification à
l'écran des trois niveaux et des deux modales exige d'écrire en base : `manuel`, `autonome`,
déclencheur armé puis désarmé, une dizaine d'allers-retours.

🔴 **Le contrôle de clôture a pris ce fichier en défaut DEUX FOIS, sur la MÊME ligne.**

- 1ʳᵉ fois : j'avais écrit « remis à `semi` », la base était sur `manuel`. J'ai écrit avoir remis à
  `semi` et relu depuis l'API.
- 2ᵉ fois, quelques heures plus tard : la base est **de nouveau sur `manuel`** (`A0a = 2`), lue
  directement via `service.read_autonomy` sur `localhost:5432/zetis`.

⚠️ **Je ne sais pas expliquer l'écart, et je ne l'invente pas.** Deux hypothèses, aucune vérifiée :
soit la remise à `semi` n'a jamais été persistée, soit quelque chose a réécrit depuis. Rien dans la
session qui suit n'a touché ces clés — mais c'est exactement ce que j'avais cru la première fois.

**Ce qui est CERTAIN et qui est le seul point qui compte : le dispositif est désarmé** dans les deux
cas — `auto_trigger_enabled = false`, `A1 = 2`, gate du cours actif. Le régime `manuel` est *plus*
conservateur que `semi`, jamais moins.

👤 **Pour la prochaine session : ne pas refaire confiance à une ligne d'état de base écrite ici.**
La relire, toujours :

```bash
apps/backend/.venv/bin/python -c "
from app.db.base import SessionLocal
from app.modules.settings import service
db = SessionLocal(); v = service.read_autonomy(db)
print(service.niveau_de(v), v, service.auto_trigger_enabled(db)); db.close()"
```

⚠️ **Le vrai piège de cette journée** : j'ai cru trois fois à une « dérive inexpliquée » du régime.
Il n'y en avait aucune. **Une seule fonction écrit ces clés** (`write_autonomy`, via `PUT`) — les
bascules venaient de **mes propres clics de vérification** sur la page vivante. Un panneau de
réglages ouvert *est* un outil d'écriture ; le vérifier à la souris change la base.

⚠️ **Serveurs de dev laissés EN MARCHE** : backend `:8001`, Papa `:5175`, Massimo `:5176`. Ils
retombent quand le panneau Browser se ferme.

> Il avait été **armé le 2026-08-03** pour prouver le chemin automatique de bout en bout (deux lots
> `request`/`parent_rule` nés sans clic, deux cours écrits et servis). Cette preuve est faite et
> consignée au `CHANGELOG` 0.40.0 ; le réarmer est un geste de Papa, deux clics sur `/parametres`.

⚠️ **Le réveil périodique reste planifié dans Redis, et c'est normal** : il ne produit rien, il
*regarde* — et désarmé, il rend son motif et repart. Il ne peut de toute façon pas se déclencher
sans worker.

⚠️ **35 jobs RQ fantômes purgés à la fermeture**, tous visant un `production_run` **supprimé** lors
d'un nettoyage antérieur — ils ne pouvaient qu'échouer. **Je n'ai pas su expliquer leur
multiplication** (32 exemplaires du même job, arrivés par paires sur 13 h, dont deux paires aux
heures exactes des merges des PR #73 et #74). Aucun de nos trois appelants de `enqueue_production`
n'est un hook de démarrage. **Observation non élucidée, pas une cause identifiée** — à re-mesurer
si la file regrossit.

---


## Historique des chantiers clos

> **2026-08-04 — les deux bandeaux** (PR #78 `4458574`, PR #79 `c02a555`), section retirée à la
> clôture suivante après les quatre contrôles : ADR `adr-0029-addendum-galaxie-dans-le-bandeau.md`,
> `TROUBLESHOOTING.md` §bandeaux, `CHANGELOG.md`, et **ce qui restait ouvert remonté ci-dessus** —
> dont 🔴 *le bandeau Massimo n'a jamais été vu*, qui est toujours dû.

⚠️ **Il n'y en a plus ici, et c'est une décision** (2026-08-04). Ce fichier portait **2 227 lignes
d'historique pour 122 lignes de chantier actif** — 94 % du contexte d'une reprise dépensé sur du
travail terminé. L'instrument censé économiser le contexte en était devenu le premier consommateur.

**Rien n'a été perdu : tout était déjà écrit ailleurs**, et chaque section a été vérifiée avant
d'être retirée (`WORKFLOW.md §5`, les quatre contrôles) :

| Ce que l'historique portait | Où c'est |
|---|---|
| les décisions | l'ADR du chantier, indexé dans `DECISIONS.md` |
| les pièges | `TROUBLESHOOTING.md`, une section par chantier |
| le récit du livré | `CHANGELOG.md`, une entrée de version par chantier |
| l'état git, le détail | Git — `git log -p MEMORY.md` (56 révisions au moment de l'élagage) |
| **ce qui restait OUVERT** | **remonté dans « DETTES OUVERTES » ci-dessus** — c'est le 4ᵉ contrôle |

> ⚠️ **Le 4ᵉ contrôle n'est pas décoratif** : l'élagage a exhumé **cinq dettes vivantes** qui
> dormaient dans l'historique, dont la galaxie jamais vérifiée sur trois appareils et un
> `ZETIS_DATABASE_URL` que `.env.example` et `DEPLOYMENT.md` annonçaient **sans son préfixe** —
> donc ignoré par le backend. Un élagage aveugle les aurait effacées.
