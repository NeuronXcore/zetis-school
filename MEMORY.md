# MEMORY.md — Mémoire de reprise (raisonnement)

> Mémoire du **raisonnement** au sens `docs/WORKFLOW.md` §3/§6.3 : fait / en cours / à-faire /
> décisions actives / prochain pas. Écrit pour la **prochaine session, sans contexte**.
> L'état du **code** se lit dans Git ; les **décisions figées** dans `DECISIONS.md`/les ADR ;
> le modèle de données dans `DATA_MODEL.md`. Ce fichier ne duplique pas ces sources.

## État à la reprise

**Chantier : « la leçon d'une notion » (ADR-0037) — COMPLET, CLOS ET MERGÉ.**
Trois modules répondaient différemment à la même question ; il n'y a plus qu'une réponse.

### Où est le code, exactement

| | |
|---|---|
| Squash | **`8447382`** — PR [#73](https://github.com/NeuronXcore/zetis-school/pull/73), mergée le 2026-08-04, 15 fichiers |
| Branche | `feat/lecon-canonique` **supprimée**, en local et chez `origin` |
| À pousser | **rien** |
| Migration | **AUCUNE** — le défaut était une divergence de LECTURE, pas de modèle |
| Cadrage | `docs/decisions/adr-0037-lecon-canonique-d-une-notion.md`, **§1 corrigé le jour même** |

> ⚠️ **`main` n'est pas `8447382`** — le commit de 4bis (celui qui écrit ces lignes) passe
> par-dessus le squash. `8447382` est le **squash de la PR**, qui ne bougera jamais ; la tête de
> `main` bouge, donc elle n'est pas écrite ici (`WORKFLOW.md §5`).

**Relancés APRÈS le merge, sur `main`, tous verts** : **805 backend** (797 avant le chantier) ·
**318 Papa** · **453 Massimo** · build Papa.

⚠️ **Ne rien ré-implémenter.** La branche n'existe plus ; tout ce qui suit est déjà sur `main`.

### Ce que ce chantier a livré

Un module **PLAT** `app/modules/lesson_resolution.py` (patron `provenance.py`) qui porte
**l'ORDRE et le PÉRIMÈTRE** de « quelle est LA leçon de cette notion ? », et **aucun filtre de
statut** — c'est là que les trois appelants diffèrent légitimement.

⚠️ **Il ne pouvait PAS vivre dans `curriculum`** : `galaxy` et `production` l'importent tous deux,
mais `curriculum` importe `ai`, dont `canonical_context` est l'un des appelants → cycle.

### Décisions actives — à relire, pas à rouvrir

1. **L'ordre est celui de la GALAXIE** — `(updated_at, id)` décroissant, « la dernière touchée ».
   Motif : c'est elle qui décrit ce que Massimo atteint, et produire ailleurs produit dans le vide.
2. **Le substrat ne filtre PAS le statut de leçon.** La production doit voir un brouillon, sinon
   **le palier 3 disparaît** (c'est là qu'`equip_notion` a le droit de rédiger puis valider un
   cours). Un test le fige.
3. **Le périmètre « année active » s'applique AUSSI à la production**, qui n'en avait aucun — elle
   pouvait équiper la leçon de l'an dernier.
4. **Par LOT d'abord.** `resolve_panoply` promet un nombre de requêtes constant ; une signature
   mono-notion aurait fait passer la page matière de 18 requêtes à N.
5. **Pas d'année active → du VIDE, jamais une exception.** Un 404 remonté d'un job RQ ne part vers
   personne (ADR-0035).
6. **`equip_notion` n'est pas modifié** : `_skill_lesson` délègue, rien d'autre ne bouge.

### ⚠️ LES DÉFAUTS TROUVÉS EN CODANT — pas au cadrage

1. **Le cadrage annonçait DEUX règles ; il y en avait TROIS.** Écrit la veille sans inventaire.
2. **La signature du cadrage était mono-notion** — elle aurait cassé une propriété que
   `resolve_panoply` promet. ADR corrigé en place.
3. **Le périmètre passait par `_active_year_or_404`** — un 404 dans un worker. ADR corrigé.
4. 🔴 **DEUX DE MES PROPRES TESTS PASSAIENT POUR LA MAUVAISE RAISON**, les deux démasqués par la
   contre-épreuve et jamais par la relecture : le verrou d'année ne seedait aucune année *active*
   (il passait par la garde, pas par le filtre) ; le test d'accord posait la leçon la plus
   récemment touchée **en second**, donc avec l'id le plus haut, si bien que les deux tris
   tombaient d'accord et qu'un appelant débranché ne cassait rien.
5. **`select_notions` faisait UNE REQUÊTE PAR NOTION** — 31 allers-retours pour un chapitre dense,
   avant même de produire. Corrigé au passage (une seule requête).
6. **Deux fixtures posaient `chapter_id=1` sur un chapitre inexistant** (« SQLite n'applique pas
   les FK ») : 4 tests rouges, aucun défaut de code.

> Détail et remèdes : `TROUBLESHOOTING.md`, chantier `feat/lecon-canonique`.

### Vérifié EN VRAI (Postgres de dev, 278 notions)

| | |
|---|---|
| Leçon **inchangée** | **273** (98 %) |
| Leçon **changée** | **5** — exactement les notions à deux leçons |
| Devenue **inéligible** | **0** — le périmètre d'année ne coûte rien ici |

Sur les 5 : **4 gagnent un cours, 1 neutre, 0 en perd**. Le cas observé (« Discours direct »)
retient désormais la leçon 5 et redevient **éligible**. Accord des trois lecteurs sur les 278
notions : **0 désaccord**.

> ⚠️ **Ce contrôle chiffré est à refaire pour tout chantier qui change une règle de sélection.**
> Dix minutes, et il remplace une conviction par un nombre.

### ▶ PROCHAIN PAS

1. **Rien n'est en attente côté Git.** PR #73 mergée (squash `8447382`), branche supprimée des deux
   côtés, arbre propre. **Étape 4bis faite** — c'est ce fichier, pour la septième fois.
2. **Ne rien ré-implémenter** de l'ADR-0037, et ne rien re-cadrer.
3. **CHANTIER SUIVANT — rien n'est cadré.** Les dettes ci-dessous sont les candidates. ⚠️ Aucune n'a
   de **manifestation observée**, contrairement à celle qu'on vient de solder — c'est le critère qui
   a servi à choisir, et il vaut mieux qu'une intuition de gravité. Prochain numéro d'ADR libre :
   **0038** (0033 reste réservé à l'indicateur d'autonomie de Massimo).
4. 🔴 **Le dispositif est ARMÉ en dev** (section dédiée plus bas). C'est l'occasion d'**observer**
   plutôt que de coder : le devoir qui fait produire un chapitre entier était « à rouvrir si
   l'observation montre du gaspillage ». Elle est possible maintenant.

### ▶ DETTES OUVERTES

- 🔴 **LA GALAXIE N'A JAMAIS ÉTÉ VÉRIFIÉE EN VRAI** — livrée le 2026-08-01 (PR #63), et personne
  n'a validé **ni** sa lisibilité à plusieurs centaines de notions (les rayons `150/260/370` et les
  78 % de secteur sont des **suppositions, pas des mesures**), **ni** sa tenue sur les trois
  appareils. **L'iPhone est le cas critique** : il doit porter la galaxie complète sur `/galaxy`
  **et** une galaxie sur l'Accueil.
  ⚠️ **Les deux réponses sont DÉJÀ DÉCIDÉES** (addenda ADR-0024/0029), les appliquer n'est donc pas
  une nouvelle décision — les contourner en serait une : si la lisibilité ne tient pas → **niveau de
  détail adaptatif**, jamais le retour du plafond ni le rallumage des forces ; si l'iPhone décroche
  → ce sont les **particules** qui tombent, **jamais les nœuds**.
  ⚠️ Cette dette était **enterrée dans l'historique** de ce fichier depuis le 2026-08-01, donc
  invisible à toute reprise. Remontée ici le 2026-08-04.
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
