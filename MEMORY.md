# MEMORY.md — Mémoire de reprise (raisonnement)

> Mémoire du **raisonnement** au sens `docs/WORKFLOW.md` §3/§6.3 : fait / en cours / à-faire /
> décisions actives / prochain pas. Écrit pour la **prochaine session, sans contexte**.
> L'état du **code** se lit dans Git ; les **décisions figées** dans `DECISIONS.md`/les ADR ;
> le modèle de données dans `DATA_MODEL.md`. Ce fichier ne duplique pas ces sources.

## État à la reprise

**Chantier : l'état de ZETIS visible partout + ZETIS LEVELS — COMPLET, MERGÉ `main`.**
Papa ne savait pas dans quel régime ZETIS travaillait sans ouvrir `/parametres`. Il le sait
maintenant sur les 22 pages — et la page des réglages dit enfin ce que chaque niveau *fait*.

### Où est le code, exactement

| | |
|---|---|
| Sur `main` | **squash `60604a3`**, PR **#75**, mergée le **2026-08-04** — 20 commits, 46 fichiers |
| Base du chantier | **`5462ba8`** — l'ancienne tête de `main` |
| Branches | **les trois sont SUPPRIMÉES**, local et `origin`. `main` == `origin/main`, rien à pousser |
| Migration | **AUCUNE** — le niveau est *dérivé*, jamais stocké |
| Cadrage | addenda **ADR-0032 §7** et **§8**, écrits AVANT leur code (deux commits `docs:`) |

⚠️ **Ne pas ré-implémenter.** Trois chantiers ont été mergés d'un coup — la sidebar, ZETIS LEVELS et
le vocabulaire — parce que leurs branches étaient **empilées** (chacune descendait de la précédente,
les fichiers de la 2ᵉ n'existaient pas sur la 1ʳᵉ). Un squash unique était donc le seul merge sûr.
Conséquence à connaître : `git log` de `main` **ne montre pas** les 20 commits ; ils vivent dans la
PR #75. Les deux branches intermédiaires ont été supprimées **après** avoir vérifié par `git diff`
qu'elles ne portaient rien d'absent de `main`.

### Ce que ce chantier a livré

**En tête de sidebar** — un avatar de 88 px, un badge à cheval, un halo **gradué par le régime**
(fixe → souffle → souffle + rotation), une infobulle teintée. **Deux axes, deux signes** : l'avatar
porte le régime, un glyphe ⏸/⚡ porte le déclencheur.

**Sur `/parametres`** — **ZETIS LEVELS** en tête, un panneau **calculé** montrant ce que le niveau
décide *et* ce qu'aucun niveau ne change, une confirmation qui garde l'**enregistrement** et dont le
corps est l'**écart** avant→après.

**Vocabulaire unifié** — un *niveau* se choisit, un *palier* se subit ; docs, code **et** clé JSON.

**Un dispositif que le dépôt n'avait pas** — `packages/types/contracts/`, réponses **capturées**,
relues d'un côté et de l'autre. Seule chose capable de voir un renommage de clé.

### Décisions actives — à relire, pas à rouvrir

1. **Deux axes, deux signes** (§7.1). *Autonome + désarmé* ≠ « ZETIS travaille seul » : un signe
   unique mentirait sur **deux lignes de la table sur quatre**.
2. **Le halo porte de l'information** (§7.2) — `prefers-reduced-motion` **fige sans retirer**.
3. **Les mots des AVATARS font foi à l'écran** (§7.7) : *Manual · Hybrid · Autonom*. Les ADR disent
   toujours *Manuel · Semi-autonome · Autonome* — **c'est écrit et assumé**, ne pas « corriger ».
4. **Le panneau est CALCULÉ, jamais rédigé** (§8.2) : une prose *classe × niveau* recopierait la
   matrice du §G.2 **sous une forme que le serveur ne peut pas refuser**.
5. **Deux révocations, contre-motifs au dossier** : la primauté du constat (§8.1, défendable
   **uniquement** parce que le §7 existe) et « on ne freine pas un retour au contrôle » (§8.4, le
   motif survit dans le **ton**).
6. **Un niveau se choisit, un palier se subit** (§8.0) — entrée ajoutée au `GLOSSARY.md`.

### ⚠️ LES DÉFAUTS TROUVÉS EN CODANT

1. 🔴 **Un renommage de clé JSON est INVISIBLE aux tests unitaires** — backend contre lui-même,
   front qui mocke : **805 + 377 verts sur un contrat rompu**. Parade posée, trois contre-épreuves.
2. 🔴 **Un verrou anti-sondage qui ne mordait pas** : faux timers posés *après* le montage. Le
   patron vient de `useNewsSummary` (ADR-0030) — **les autres copies du dépôt sont suspectes**.
3. **`onMouseLeave` cesse d'être fiable** si l'infobulle est **fille** de l'élément survolé.
   Trouvé **à l'écran**, aucun test ne le voyait.
4. **La sidebar Papa n'était pas clippée** : le *document* grandissait, le body défilait, header et
   sidebar partaient. « ⚙️ Paramètres » n'était atteignable qu'en scrollant toute la page.
5. **`role="group"` homonyme** entre deux composants → quatre tests tombés d'un coup.
6. **`vi.clearAllMocks()` manquait** : tout `toHaveBeenCalledTimes` dépendait de la **position du
   test dans le fichier**.
7. **J'ai mal chiffré le refactor deux fois** — « transversal » puis « irréductible ». Les deux fois,
   **vérifier** a changé la décision. Le chiffrage à vue est le vrai piège.

> Détail et parades : `TROUBLESHOOTING.md`, section du **2026-08-04** (elle porte encore les noms
> des branches, qui n'existent plus — le travail est dans la PR #75).

### ▶ PROCHAIN PAS

**Ce chantier est CLOS — il n'a plus de prochain pas.** Le dépôt est propre : `main` == `origin/main`,
aucune branche en attente, aucune PR ouverte. La prochaine session **ouvre un nouveau chantier**
(`/ouverture`) ; ce qui suit n'est pas du travail inachevé, c'est le stock de dettes à arbitrer.

Ce qu'un nouveau chantier peut prendre, par ordre de ce que ça évite de casser :

1. 🔴 **Contre-éprouver le patron anti-sondage de l'ADR-0030** partout où il est copié (1ʳᵉ dette
   ci-dessous). Une heure, et ça peut réveiller un sondage réel en production.
2. **Mettre `API_SPEC.md` au réel** pour `/api/settings/autonomy` — son contrat vient de changer.
3. **La sidebar Papa responsive** — le chantier a déjà été mené une fois côté Massimo.
4. 👤 **Deux choses que l'agent ne peut pas faire** : juger si **trois animations permanentes** dans
   le coin de l'œil distraient au bout de 60 s de travail réel (le correctif est décidé — *ralentir*,
   jamais retirer l'axe) ; et exercer `prefers-reduced-motion` **en vrai**.

### ▶ DETTES OUVERTES

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

| Réglage | Valeur |
|---|---|
| Régime | ***Semi-autonome*** (A0a = 3, **A1 = 2**) |
| Déclencheur `zetis_auto_trigger_enabled` | **`false`** |
| Gate du cours | **actif** — ZETIS ne rédige plus un cours à la place de Papa |

**Vérifié en le FAISANT TOURNER, pas en lisant les réglages** : `scan_agenda` et `scan_requests`
appelés à vide rendent `créés: []`, avec leurs motifs — *« le déclenchement automatique est
désarmé »* et *« le régime n'est pas Autonome »*.

⚠️ **2026-08-04, fin de session — le régime a BEAUCOUP bougé, puis a été remis.** La vérification à
l'écran des trois niveaux et des deux modales exige d'écrire en base : `manuel`, `autonome`,
déclencheur armé puis désarmé, une dizaine d'allers-retours.

⚠️ **Et le contrôle de clôture a pris ce fichier en défaut** : j'avais écrit « remis à `semi` », la
base était sur **`manuel`**. Le dispositif était désarmé dans les deux cas (`A1 = 2`, gate du cours
actif), mais la phrase était fausse. Corrigé — la base **et** la phrase. **État final relu depuis
l'API** : `niveau = semi`, `A0a = 3`, `A1 = 2`, `auto_trigger_enabled = false`.

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
