# MEMORY.md — Mémoire de reprise (raisonnement)

> Mémoire du **raisonnement** au sens `docs/WORKFLOW.md` §3/§6.3 : fait / en cours / à-faire /
> décisions actives / prochain pas. Écrit pour la **prochaine session, sans contexte**.
> L'état du **code** se lit dans Git ; les **décisions figées** dans `DECISIONS.md`/les ADR ;
> le modèle de données dans `DATA_MODEL.md`. Ce fichier ne duplique pas ces sources.

## État à la reprise

**Chantier : le tiroir de navigation Massimo — COMPLET, CLOS ET MERGÉ.**
L'interface de Massimo était inutilisable sur téléphone. Elle ne l'est plus.

### Où est le code, exactement

| | |
|---|---|
| Squash | **`69d5165`** — PR [#74](https://github.com/NeuronXcore/zetis-school/pull/74), mergée le 2026-08-04 |
| Branche | `fix/sidebar-massimo-mobile` **supprimée**, en local et chez `origin` |
| À pousser | **rien** |
| Migration | **AUCUNE** — correctif CSS |
| Cadrage | **aucun ADR** : c'est un correctif, et la décision de navigation existait déjà |

> ⚠️ **`main` n'est pas `69d5165`** — le commit de 4bis passe par-dessus le squash. Celui-ci ne
> bougera jamais ; la tête de `main` bouge, donc elle n'est pas écrite (`WORKFLOW.md §5`).

**Relancés APRÈS le merge, sur `main`** : **805 backend · 458 Massimo · typecheck · build** — verts.

⚠️ **Le merge a rendu une erreur, et ce n'était pas grave.** `gh pr merge` a affiché « Pas possible
d'avancer rapidement » : le merge distant avait réussi, seule la synchro locale échouait parce que
`main` local portait deux commits de doc que le squash venait de réécrire. **Avant de recaler, les
11 lignes « uniques » à `main` local ont été lues une par une** — c'étaient exactement les versions
remplacées. Recaler par réflexe, sans cette lecture, est la façon dont on perd du travail.

### Ce que ce chantier a livré

Sous `md`, l'`aside` sort du flux (`fixed`) et coulisse derrière un bouton ☰. Au-dessus,
`md:static md:translate-x-0` annule tout : **le rendu desktop/tablette ne change pas d'un pixel**.

### Décisions actives — à relire, pas à rouvrir

1. **Un TIROIR, pas la bottom-nav** que `navigation.md` prescrit. Cette spec date de l'étape 2 et ne
   connaît que **5 verbes** ; la navigation en porte **13**, chacune ajoutée par une décision
   postérieure. L'appliquer **masquerait 8 sections sur mobile**.
2. **Rien n'est retiré** : les 13 entrées et les 6 témoins de l'ADR-0030 restent.
3. ⚠️ **Réconcilier la spec n'est PAS un cadrage** — l'**ADR-0024** l'a tranché il y a quatre
   semaines (« l'existant prime »), et le chantier est rangé au `BACKLOG.md`. **Aucun ADR à écrire.**

### ⚠️ LES DÉFAUTS TROUVÉS EN CODANT

1. 🔴 **La sidebar n'avait aucun point de rupture** — `w-60 shrink-0`, 240 px pris sur 375, canevas
   de galaxie à 170 px. Trouvé en vérifiant **autre chose**.
2. ⚠️ **453 tests ne pouvaient pas le voir** : jsdom n'a pas de viewport, les classes Tailwind n'y
   sont jamais évaluées. **Une classe CSS absente ne casse aucun test — elle casse l'écran.**
3. **La spec prescrivait une solution qui aurait cassé trois ADR** — stop-on-blocker joué.
4. **J'avais écrit que la réconciliation était « un cadrage touchant trois ADR »** : faux, l'ADR-0024
   l'avait déjà tranchée. Corrigé — la formulation aurait fait rédiger un ADR inutile.

> Détail et remèdes : `TROUBLESHOOTING.md`, chantier `fix/sidebar-massimo-mobile`.

### ▶ PROCHAIN PAS

1. **Rien n'est en attente côté Git.** PR #74 mergée, branche supprimée, arbre propre. **4bis
   faite** — c'est ce fichier, pour la huitième fois.
2. 🔴 **La moitié de la dette galaxie reste ouverte, et elle a besoin de TOI** : la tenue sur un
   **vrai iPhone**. Un viewport n'est pas un appareil. C'est la seule dette que l'agent ne peut pas
   solder seul.
3. **CHANTIER SUIVANT — rien n'est cadré.** Les dettes ci-dessous sont les candidates ; la seule à
   **manifestation observée** vient d'être soldée. Prochain numéro d'ADR libre : **0038**
   (0033 reste réservé à l'indicateur d'autonomie de Massimo).


### ▶ DETTES OUVERTES

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
- 👤 **À la charge de Papa, l'agent ne peut pas le faire** : relire l'**amendement de l'ADR-0017
  §5bis** — c'est un changement de **doctrine** du moteur de missions, pas un correctif d'affichage.

### 🔴 LE DISPOSITIF EST ARMÉ EN DEV

Régime ***Autonome*** (A1 = 3), déclencheur `zetis_auto_trigger_enabled` = **`true`**, gate du
cours **tombé**. Décision de Papa du 2026-08-03, maintenue à travers ce chantier.

⚠️ Une `content_request` en attente **fera écrire et servir du contenu à Massimo sans relecture**
au prochain réveil du scan (3 h) **si un worker tourne**. Désarmement : `/parametres`.

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
