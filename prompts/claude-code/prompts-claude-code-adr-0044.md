# Prompts Claude Code — chantier ADR-0044 (page Diagnostic de Massimo)

> **Trois sessions, jamais une.** Chaque bloc « SESSION » se colle tel quel dans une session Claude
> Code neuve, **après `/slice`**. Entre deux sessions : le geste git de clôture, puis celui
> d'ouverture de la suivante.
>
> ✅ **L'`adr-0044` est `Accepté` (2026-08-08).** Ses neuf décisions sont **figées** — y compris la
> **Décision 5**, qui sort du périmètre annoncé du chantier et amaigrit un contrat servi : elle a
> été soumise comme telle et acceptée. Elle se relit, elle ne se rediscute pas. Le prérequis de
> décision est levé, les sessions peuvent démarrer.
>
> Prérequis matériel (`docs/WORKFLOW.md` §2bis, `/ouverture` §1 et §3) : **tout le cadrage est sur
> `main` avant la création de la branche** — `docs/decisions/adr-0044-*.md`, la ligne de
> `DECISIONS.md`, la spec `docs/frontend-massimo/page-diagnostic.md`, la maquette
> `docs/frontend-massimo/mockup/mockup-page-diagnostic-massimo.html`, **et ce fichier de prompts**.
>
> ⚠️ `DECISIONS.md` ne va **JAMAIS** sur une branche — deux branches qui l'éditent = conflit garanti.
>
> 🔴 **Le prompt de l'`adr-0043` prescrivait de commiter son propre fichier SUR LA BRANCHE, et ce
> n'est pas ce qui a été fait** : `prompts-claude-code-adr-0043.md` est arrivé par le commit
> `6265257` **sur `main`** (vérifié — le merge #99 étant un squash, un commit de branche n'y
> figurerait pas). La pratique a raison contre la règle écrite : le prompt est du **cadrage**, il
> vit avec l'ADR et la spec. La règle est corrigée ici, pas recopiée.
>
> Les prompts référencent ces documents par leur chemin et n'en recopient pas le contenu : la
> re-spécification dans un prompt crée une seconde source qui dérive.
>
> ⚠️ **Deux branches sont CONSERVÉES et ne sont pas celles de ce chantier** —
> `feat/diagnostic-mesure-qui-engage` et `feat/notion-orpheline-equipable`. Les trois noms se
> ressemblent assez pour qu'un `git branch -d` distrait fasse le mauvais.

---

## Protocole commun aux trois sessions

```txt
PROTOCOLE DE SESSION — non négociable

1. Graphify d'abord. Mets à jour l'index du dépôt avant toute lecture ciblée.

2. Read-before-code. Lis intégralement les fichiers de la liste « À LIRE AVANT D'ÉCRIRE » avant
   d'écrire une ligne, et RENDS UN RAPPORT de ce qui était faux dans le cadrage. L'ADR-0044 a été
   écrit sur un read-before-code daté du 2026-08-08 : le code a pu bouger, et plusieurs de ses
   constats sont des mesures, pas des lois.

3. Stop-on-blocker. Si une lecture contredit l'ADR ou la spec, ARRÊTE-TOI et remonte la
   contradiction. N'improvise pas une résolution. N'écris pas « je suppose que ».

4. Les découvertes remontent dans les docs, dans le même commit.

5. Aucun chemin inventé. Vérifie l'existence réelle de chaque module, route, type et composant.

6. 🔴 PIÈGE DE TYPES DU DÉPÔT — SPÉCIFIQUE À CE CHANTIER, ET IL PIÈGE PAR HOMONYMIE.
   `DiagnosticResult` et `DiagnosticGap` existent DEUX FOIS, avec des formes différentes :
     - `packages/types/src/diagnostic.ts` = le contrat PAPA (score_percent, severity, status,
       content_state, completed_at). IL NE DOIT PAS BOUGER.
     - `apps/frontend-massimo/src/lib/diagnostic.ts` = les interfaces LOCALES de Massimo.
   La Décision 5 amaigrit le contrat ENFANT. Toucher l'homonyme partagé casserait la page Papa
   sans qu'aucun test de Massimo ne rougisse.

7. ⚠️ Tout nouveau type nommé doit être ré-exporté depuis `packages/types/src/index.ts`
   (CLAUDE.md §8 : les types partagés suivent le contrat API). Piège déjà payé sur les cartes SRS.

8. ⚠️ `tsc --noEmit` à la racine NE VÉRIFIE RIEN. Seul `tsc -b` compile réellement les projets.

9. ⚠️ Les compteurs d'appels de `vi.fn()` s'ADDITIONNENT entre tests côté front (pas de
   `clearMocks`) : une assertion de comptage est fausse dès le second test du fichier.

10. ⚠️ `to_utc` est obligatoire avant toute soustraction de dates. SQLite perd le `tzinfo` d'une
    colonne `DateTime(timezone=True)` là où PostgreSQL le garde — sans lui, ça plante en test et
    marche en prod, le pire des deux. Ce chantier manipule `last_seen_at` et `completed_at`.

11. ⚠️ `test_system_is_reserved_to_quizzes` est LEXICAL : il scanne `app/modules/**/*.py` et se
    déclenche sur une simple mention de `validated_by`, fût-ce en commentaire.

12. 🔴 TOUT TEST-VERROU SE VÉRIFIE PAR SABOTAGE. Casse la règle, observe le test rougir, remets.
    Et le sabotage doit être VALIDE, deux conditions apprises à l'ADR-0043 (5ᵉ vert sur sabotage) :
      - décor NON DÉGÉNÉRÉ — un verrou de valeur posé sur un plancher ou un plafond ne peut rien
        distinguer ;
      - sabotage MATHÉMATIQUEMENT NON NEUTRE — il doit produire une valeur atteignable DIFFÉRENTE,
        sinon son vert ne prouve rien.

13. Checklist de clôture (9 points) :
    fichiers touchés · migrations (AUCUNE attendue dans ce chantier — si une migration apparaît,
    STOP, c'est un blocker) · routes nouvelles · requêtes nouvelles · suites de tests
    (backend / Papa / Massimo, avant → après) · tsc -b et vite build · vérifié à l'écran (par qui,
    sur quelles données) · docs mis à jour · résidus et dettes assumées.
```

---

## SESSION A — le contrat de liste

**Branche** : `feat/diagnostic-massimo-propose`, créée depuis un `main` à jour.

Elle passe en premier parce que la page ne peut rien trier avec ce qui est servi aujourd'hui.
Elle ne change **rien à l'écran** : c'est volontaire, et c'est ce qui la rend sûre.

### À LIRE AVANT D'ÉCRIRE

- `docs/decisions/adr-0044-*.md` — Décisions 2 et 6
- `docs/frontend-massimo/page-diagnostic.md` — §Données API
- `apps/backend/app/modules/diagnostics/service.py` — `list_diagnostics`, `_is_taken`,
  **et `notions_a_mesurer`** (c'est sa doctrine qu'on remonte d'un cran)
- `apps/backend/app/modules/diagnostics/schemas.py` — `DiagnosticQuizListItem`
- `apps/backend/app/db/models/progress.py` — `SkillMastery`, en particulier `last_seen_at`
- `apps/backend/app/db/models/assessment.py` — `QuizAttempt`, `QuizQuestion.skill_id`
- `apps/frontend-massimo/src/lib/diagnostic.ts` — `DiagnosticListItem`
- `packages/types/src/diagnostic.ts` — **pour constater l'homonymie, pas pour la modifier**

### CE QU'IL FAUT FAIRE

1. **`DiagnosticQuizListItem` gagne quatre champs** — aucune migration :
   - `subject_slug: str` (depuis `Subject.slug`) ;
   - `measured_at: datetime | null` — `max(SkillMastery.last_seen_at)` sur les notions du
     diagnostic (`QuizQuestion.skill_id`), pour **cet** élève. `null` = jamais mesuré ;
   - `taken_at: datetime | null` — `max(QuizAttempt.completed_at)`, **en REMPLACEMENT de `taken`** ;
   - `last_attempt_id: int | null`.
2. **`taken` disparaît du schéma.** Il reste dérivable (`taken_at !== null`). Deux sources pour un
   même fait est une divergence en attente — c'est écrit dans la Décision 6.
3. **Le tri n'est PAS fait ici.** Le serveur sert les champs ; c'est la Session C qui trie, dans le
   hook (Décision 2, alternative (e)). Ne pas ajouter de `order_by` « utile ».
4. **Les types suivent** : `apps/frontend-massimo/src/lib/diagnostic.ts`, et tout type nommé
   nouveau ré-exporté depuis `packages/types/src/index.ts`.

### 🔴 LE PIÈGE PRINCIPAL DE CETTE SESSION

**`measured_at` se calcule par agrégat sur les notions du diagnostic, pas sur la matière.** Deux
diagnostics d'une même matière peuvent porter des notions différentes et donc des dates
différentes. Agréger par `subject_id` serait plus simple, plus rapide, et **faux** — et le faux ne
se verrait qu'à l'usage, sur un ordre de liste que personne ne saurait contredire.

⚠️ Une notion **jamais mesurée** n'a **aucune ligne** dans `SkillMastery` — ce n'est pas une ligne
à `NULL`. La jointure doit être une jointure **gauche**, sinon un diagnostic entièrement neuf
disparaît de la liste. C'est le même piège que l'INNER JOIN qui ratait le chapitre orphelin.

### TEST-VERROU CENTRAL DE LA SESSION

**`measured_at` est `null` si et seulement si aucune notion du diagnostic n'a jamais été mesurée.**

Sabotage à jouer : remplace la jointure gauche par une jointure interne. Le diagnostic jamais
mesuré doit **disparaître de la liste**, et le test rougir.

⚠️ **Décor non dégénéré exigé** : au moins trois diagnostics — un jamais mesuré, un mesuré
anciennement, un mesuré récemment — avec des dates **distinctes et non extrêmes**.

### CONTRE-ÉPREUVE

Le **gate de l'`adr-0043` est intact** : un diagnostic `pending` n'apparaît toujours pas dans la
liste, et `_servable_quiz_or_404` refuse toujours l'accès direct par identifiant.

### HORS PÉRIMÈTRE DE LA SESSION A

Le tri · la page · le résultat et sa route · `navigation.ts` · la page Diagnostic de **Papa** ·
les 14 défauts du `BACKLOG.md`.

---

## SESSION B — le résultat en forme enfant

⚠️ **La session la plus risquée du chantier** : c'est celle qui **casse un contrat servi**, et la
seule qui sorte du périmètre annoncé. Sa Décision 5 est **acceptée et figée** — elle se relit, elle
ne se rediscute pas. Si le read-before-code la contredit, c'est un **stop-on-blocker**, pas une
autorisation de la réinterpréter.

### À LIRE AVANT D'ÉCRIRE

- `docs/decisions/adr-0044-*.md` — **Décision 5 en entier**, et l'alternative (b)
- `apps/backend/app/modules/diagnostics/router.py` — les rôles des **onze** routes
- `apps/backend/app/modules/diagnostics/service.py` — `result_detail` (son contrôle
  d'appartenance est **déjà en place**), `submit`, `score_par_notion`, `lacunes_de_passation`
- `apps/backend/app/modules/diagnostics/schemas.py` — `DiagnosticResultOut` **et**
  `DiagnosticResultSummary` (dont le docstring dit « Vue Papa »), `GapOut`
- `apps/frontend-massimo/src/pages/DiagnosticPage.tsx` — l'écran de résultat
- `docs/decisions/adr-0017-arbitrage-missions.md` §3 — la frontière de schémas, c'est le précédent

### CE QU'IL FAUT FAIRE

1. **Un schéma de résultat en forme ENFANT**, unique, servi par **deux** routes : `POST /submit`
   et la nouvelle route de relecture. Il porte : matière, date, **forces**, **notions à
   renforcer** (leur nom seul). **Sans `score_percent`, sans `severity`, sans `status`.**
2. **Une nouvelle route `require_child`** rend le résultat d'une passation de Massimo, en
   réutilisant `result_detail`. **404**, jamais 403, sur une passation qui n'est pas la sienne —
   c'est la doctrine déjà écrite dans le module.
3. **La route Papa n'est PAS élargie** et **`DiagnosticResultSummary` ne bouge pas.**
4. **L'écran de résultat de Massimo cesse d'afficher « Score global : X % »** — la spec le
   prescrivait déjà en v1, l'écran la contredit depuis onze mois.

### 🔴 LE PIÈGE PRINCIPAL DE CETTE SESSION

**L'homonymie** (protocole §6). `packages/types/src/diagnostic.ts` porte un `DiagnosticResult` et
un `DiagnosticGap` qui sont ceux de **Papa**. Les amaigrir « pour faire propre » casserait la page
Papa — et les tests de Massimo resteraient verts.

### TESTS EXIGÉS — DEUX VERROUS EN PAIRE

Le dépôt a appris qu'un verrou lexical seul ne suffit pas (`adr-0043`, `validated_by='system'`) :

- **comportemental** : aucune réponse d'une route élève ne contient `score_percent` ni `severity`.
  Sabotage : remets `score_percent` dans le schéma enfant → rouge ;
- **lexical** : l'écran de résultat de Massimo ne contient aucun affichage de pourcentage.
  ⚠️ Ce verrou-là est **fragile par nature** — s'il porte sur une chaîne, dis dans son nom ce
  qu'il ne peut pas voir.

### CONTRE-ÉPREUVE

**La page Diagnostic de Papa ne change en rien** : elle affiche toujours le score, la sévérité, le
statut des lacunes, et `GET /results/{attempt_id}` reste `require_parent`.

### HORS PÉRIMÈTRE DE LA SESSION B

L'écran de **passation** (une question à la fois, barre de progression) · les zones de la page ·
`navigation.ts` · le scoring, l'ouverture des `Gap`, l'XP.

---

## SESSION C — la page en trois zones

C'est la session que la relecture humaine a demandée. Les deux précédentes ne servaient qu'à la
rendre possible.

### À LIRE AVANT D'ÉCRIRE

- `docs/frontend-massimo/page-diagnostic.md` — **en entier**
- `docs/frontend-massimo/mockup/mockup-page-diagnostic-massimo.html` — les **quatre** états
- `docs/decisions/adr-0044-*.md` — Décisions 1, 2, 3, 4, 7, 8
- `apps/frontend-massimo/src/pages/DiagnosticPage.tsx` — les trois écrans actuels
- `apps/frontend-massimo/src/lib/navigation.ts` — le commentaire de `NavItem.newsKey`
- `apps/frontend-massimo/src/lib/navigation.test.ts` — les trois tests de témoin
- `apps/frontend-massimo/src/lib/subjectIcons.ts` et `subjectEmoji.ts`
- `apps/frontend-massimo/src/hooks/useMissions.ts` — le précédent de **regroupement par matière
  côté client** (§« Dérivations », `adr-0017 §3`). ⚠️ Il y reconstruit un `nameToSlug` à partir
  d'un second appel, faute de slug servi : c'est exactement ce que le `subject_slug` de la
  Session A évite de refaire ici

### CE QU'IL FAUT FAIRE — DANS CET ORDRE

**1. D'ABORD les deux motifs de `navigation.ts` (Décision 7).** En premier, parce que c'est la
tâche sans effet visible : mise en dernier, elle saute quand la session s'allonge.

- le motif de **Diagnostic** devient : *contenu entrant réel depuis le gate, mais **aucune trace
  de vue** — `quiz_attempts` enregistre « passé », pas « vu »* ; plus la raison de fond : **la
  zone A est déjà le signal d'arrivée** ;
- le motif de **Quiz** se rebase sur **`quiz_type`**, plus sur la table : `quizzes` a bien un
  `validation_status` depuis `a9b0c1d2e3f4`, mais **seul le diagnostic est gaté**.

🔴 **Aucun `newsKey` n'est ajouté.** La conclusion ne change pas — seules les raisons changent.

**2. Le hook `useDiagnostics`** — toute la logique, aucune dans le composant : tri (Décision 2),
tête de liste, regroupement par matière, dépliage.

**3. Les trois zones** (Décision 3) et les **quatre états** de la maquette : cas courant, tout est
à jour, rien encore, chargement/erreur.

**4. Aucun plafond, aucune pagination** (Décision 4).

**5. Icône `🧭`** (Décision 8), celle de `MASSIMO_NAV`. Pas de PNG, pas de troisième identité.

### ⚠️ CE QUI EST VRAI ET CONTRE-INTUITIF

- **« Je préfère autre chose ↓ » n'est pas décoratif.** Sans cette sortie, la zone A est un
  objectif imposé — et `CLAUDE.md` pose qu'un objectif subi se fuit. Ne pas la couper « pour
  alléger ».
- **La raison affichée se calcule à partir de `measured_at` SEUL.** C'est ce qui garantit qu'aucun
  résultat de mesure ne fuit dans la formulation. Ajouter un « parce que tu as eu du mal ici »
  serait un diagnostic négatif montré à l'enfant.
- **Les faits et la rassurance tiennent sur deux lignes distinctes.** Sur une seule, ça se casse
  en trois colonnes bancales dès 375 px — vu à l'écran sur la maquette.
- **Icônes de matière : `subjectIconFor`, repli `subjectEmoji`.** ⚠️ La maquette contient un
  **mapping emoji local** : c'est une commodité de fichier autonome, **pas un modèle à recopier**.

### TESTS EXIGÉS

- **test-verrou (Décision 7)** : `/diagnostic` n'a pas de `newsKey`. Sabotage : ajoute-lui-en un →
  rouge. ⚠️ Le test existant couvre déjà six routes en boucle — **ne pas le remplacer par un test
  qui ne regarde que Diagnostic**, ce serait rétrécir un verrou en croyant le préciser ;
- **test-verrou (Décision 3)** : la zone C ne contient aucun diagnostic non passé, et la zone B
  aucun passé. C'est la séparation elle-même, pas son apparence ;
- **test-verrou (Décision 2)** : à `measured_at` égaux, l'ordre ne dépend pas du score.
  ⚠️ Décor non dégénéré : des scores **différents et non extrêmes** ;
- **test-verrou (Décision 1)** : la zone A ne propose **qu'un seul** diagnostic, quel que soit le
  nombre servi ;
- les **quatre états**, dont « tout est à jour » (zone A calme, zone B absente, zone C présente)
  et « rien encore » (aucune zone, message qui **nomme Papa**).

### 🔴 VÉRIFICATION À L'ÉCRAN — OBLIGATOIRE, ET PAR UN HUMAIN

Ce chantier **naît d'une relecture visuelle humaine** qui a trouvé cinq défauts qu'aucun test ne
pouvait voir. Le livrer sans elle contredirait son acte de naissance.

À parcourir : les quatre états · le dépliage d'une matière · **375 px**, qui est l'appareil de
Massimo · la zone C avec ses deux actions · l'icône dans la sidebar et dans la page.

⚠️ **Le panneau d'aperçu ne suffit pas** pour une page derrière `RequireAuth` : passer par
`claude-in-chrome` (`docs/WORKFLOW.md` §5bis). Et les clics par `ref` y échouent **en silence** —
espace de clic 800 px.

### HORS PÉRIMÈTRE DE LA SESSION C

L'écran de passation · la page Diagnostic **de Papa** et ses quatre optimisations (chantier sœur,
décidé après) · la création d'une trace de vue · le multi-enfant · les 14 défauts du `BACKLOG.md`.

---

## Après la Session C

- `MEMORY.md` à la clôture : dettes survivantes, pièges payés, prochain pas.
  **Les débats post-chantier vont au `BACKLOG.md`, pas dans `MEMORY.md`.**
- `CHANGELOG.md` — une entrée. Le contrôle ③ du `WORKFLOW.md` §6.3 a déjà été raté deux fois.
- `TROUBLESHOOTING.md` — une section pour ce chantier. Contrôle ②.
- `API_SPEC.md` §Diagnostics — le contrat de liste change, et **il était déjà périmé avant** ce
  chantier.
- **`DATA_MODEL.md` : rien.** Aucune migration. Si une migration est apparue, c'est un blocker à
  remonter, pas une ligne à ajouter.
- ~~L'`adr-0044` passe en `Accepté`~~ — **fait le 2026-08-08, avant la Session A.** Ce qui reste à
  faire à la clôture, c'est de retirer de son statut la mention « **rien n'est implémenté** » :
  elle sera devenue fausse. Même geste dans la spec.
- Si le code a appris quelque chose à la décision, l'ADR reçoit une section **« Mise en œuvre »**,
  comme l'`adr-0043`.
- ⚠️ Les branches `feat/diagnostic-mesure-qui-engage` et `feat/notion-orpheline-equipable`
  **restent conservées** — elles ne sont pas celles de ce chantier.
