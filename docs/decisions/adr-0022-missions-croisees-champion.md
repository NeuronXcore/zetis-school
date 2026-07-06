# ADR-0022 — Missions croisées « champion » (multi-matières, multi-outils, verdict par notion)

## Statut

Accepté — 2026-07-06. **ADR dédié exigé par l'ADR-0017 §6** (« les missions
multi-matières (« croisées », esprit EPI du cycle 4) […] ADR dédié »). Ouvre le
chantier croisées, jusqu'ici différé (`subject_id` nullable posé, aucun flux).

> S'appuie sur : `adr-0017` (moteur d'étapes, preuve serveur, verdict d'acquisition
> §5bis, gate `validated` §5ter, invariant « le sélecteur quotidien ne propose
> jamais de croisées » §6) ; `adr-0018` (Commander : preview/confirm sans état,
> fan-out `manual` validé par construction) ; `adr-0020`/`adr-0021` (Conseil de
> classe → missions + **équipement** du kit pédagogique par notion) ; `adr-0011`
> (leçon canonique validée = substrat des dérivés) ; `adr-0008` (100 % local :
> aucune donnée de Massimo vers le cloud). **Révise** le vocabulaire fermé de
> `mission_type` (ADR-0017 §1) — seul un ADR dédié y est autorisé.

## Contexte

Le moteur de missions (ADR-0017) est **mono-notion / mono-matière** par
construction : une mission porte un `skill_id`, sa matière en dérive, son verdict
d'acquisition (§5bis) est défini pour *une* notion. Le Commander (ADR-0018) qui
« commande » plusieurs notions produit un **fan-out** : N missions mono-notion
distinctes, pas un parcours unique.

Demande produit : une **mission croisée « champion »** — un parcours **unique** qui
traverse **plusieurs matières** et enchaîne **plusieurs outils** (ELI5, carte
mentale, quiz), conçu pour **booster Massimo** (esprit EPI du cycle 4 : une notion
de SVT éclairée par une notion de français, etc.). Ce n'est ni une remédiation ni
une révision : c'est un **défi transversal** que Papa (ou le Conseil de classe)
déclenche.

Trois arbitrages produit ont été tranchés avec le commanditaire (2026-07-06) :

1. **Déclencheur** : les **deux** — Commander étendu (disponible tout de suite,
   flux `manual`) **et** recommandation croisée du Conseil de classe (réutilise le
   pont d'actionnabilité ADR-0020/0021). Le **sélecteur quotidien reste exclu**
   (invariant ADR-0017 §6).
2. **Ciblage** : les **trois saveurs**, Papa **choisit avant génération** —
   *boss* (notions **maîtrisées**, célébrer la force), *consolidation* (notions
   **fragiles**, regrouper les faiblesses), *mix* (socle solide + une notion à
   pousser). La saveur ordonne la résolution des notions candidates ; Papa
   confirme la sélection (patron preview/confirm, décochable).
3. **Verdict** : **par notion**. Chaque notion de la mission reçoit son verdict
   d'acquisition comme aujourd'hui (§5bis : `reverse≥t ET (quiz≥t OU mindmap≥t)`
   → mastery↑/gap/SRS). La mission composite n'a **pas** de verdict global — elle
   **itère** le verdict mono-notion sur ses notions.

## Constat read-before-code (blocker structurel)

`MissionStep` **ne porte pas de `skill_id`** : aujourd'hui les étapes héritent
implicitement de l'unique `mission.skill_id`, et le verdict §5bis lit
`mission.skill_id`. Une mission croisée porte **plusieurs** notions ; le verdict
par notion (arbitrage 3) exige donc de savoir **à quelle notion chaque étape se
rattache**. C'est la prémisse que l'ADR-0017 avait supposée à tort pour son propre
ciblage — on la vérifie ici : **une migration est nécessaire**
(`mission_steps.skill_id` nullable). Sans elle, le verdict par notion est
indéfinissable.

## Alternatives considérées

- **Prolonger le fan-out du Commander** (N missions mono-notion, une par matière) :
  déjà possible, mais ce sont N missions séparées — pas un parcours *unique*, pas
  de cadre « champion » transversal, pas de célébration d'ensemble. Ne répond pas à
  la demande. → Écarté (reste disponible pour le travail ciblé ordinaire).
- **Mission composite à verdict global unique** : l'ADR-0017 §5bis l'a déjà écarté
  (« une mission groupée n'aurait pas de verdict défini ») ; et le commanditaire a
  choisi le verdict par notion. → Écarté.
- **Nouvelle source automatique dans le sélecteur quotidien** : interdit par
  l'ADR-0017 §6 (« leur proposition automatique appartient au Conseil de classe IA
  — jamais au sélecteur quotidien »). → Écarté.
- **Réutiliser `mission_type='manual'` sans marqueur** : une croisée doit être
  identifiable (verdict itéré, exclusion du sélecteur, UI « champion » dédiée) et
  `subject_id NULL` ne suffit pas à la distinguer d'un futur `manual` sans matière.
  → Écarté au profit d'un type dédié.
- **Ciblage figé (fragiles seulement, ou maîtrisées seulement)** : le commanditaire
  veut les trois saveurs, choisies par Papa. → Écarté.

## Décision

1. **Nouveau `mission_type = 'champion'`** (révise le vocabulaire fermé ADR-0017 §1,
   seul geste qu'un ADR dédié autorise). Une mission champion = **une** mission,
   `subject_id = NULL`, `skill_id = NULL`, dont les **étapes traversent ≥ 2
   matières**. Le vocabulaire fermé devient
   `remediation | revision | progression | manual | champion`.

2. **`mission_steps.skill_id` nullable (FK `skills.id`)** — migration dédiée. Chaque
   étape d'une champion porte **sa** notion ; les missions mono-notion existantes
   laissent la colonne `NULL` et **retombent sur `mission.skill_id`** (rétro-compatible,
   zéro backfill). La preuve serveur par étape (ADR-0017 §5) est **inchangée** :
   elle ne dépend pas de la notion, seulement du `step_type` et du `resource_id`.

3. **Composition = saveur choisie par Papa, preview/confirm sans état** (patron
   ADR-0010/0018). Papa fournit un **scope** (matières, ou chapitres, ou le scope
   déjà résolu d'une reco Conseil) **et une saveur** ∈ `{boss, consolidation, mix}` :
   - `boss` → notions **maîtrisées** d'abord (`mastery` décroissant) ;
   - `consolidation` → notions **fragiles** d'abord (`1 − mastery`, comme le
     Commander) ;
   - `mix` → une part de socle solide + une notion à pousser (règle simple et
     déterministe, versionnée avec le scoring).
   La preview résout les notions candidates **par matière** (service d'évidence
   ADR-0017, read-only, zéro écriture), en propose un sous-ensemble **décochable**,
   sous plafond `MISSION_CHAMPION_MAX_SKILLS` (défaut 3) et **≥ 2 matières
   distinctes** (sinon ce n'est pas une croisée → message, pas d'échec). La saveur
   est un **paramètre transient** de composition (comme le scope du Commander) : ce
   qui est persisté, ce sont les notions choisies (les `mission_steps.skill_id`),
   pas la saveur.

4. **Parcours multi-outils = un mini-parcours par notion, concaténé.** Pour chaque
   notion cochée, le moteur d'étapes déterministe (ADR-0017 §5, ordre amendé selon
   le type) produit son mini-parcours d'outils (`eli5 → mindmap → quiz`, ordre
   « rappel d'abord » car ce sont des notions déjà rencontrées) ; les mini-parcours
   sont **concaténés** dans `sort_order`, chaque étape tagguée `skill_id`. Le budget
   ~15 min de l'ADR-0017 §4 borne les étapes **par notion**, pas la mission entière :
   une champion est **explicitement plus longue** (c'est un défi), plafonnée par le
   nombre de notions (`MISSION_CHAMPION_MAX_SKILLS`). Le front reste **agnostique** :
   il rend le `sort_order` servi et n'ouvre que l'étape courante (aucun changement de
   contrat d'étape).

5. **Équipement du kit (réutilisation ADR-0021).** Une champion n'a de valeur que
   si ses étapes `quiz`/`mindmap` ont des ressources à jouer. À la confirmation,
   pour chaque notion, ZETIS **équipe** la notion (génère cours/fiche/SRS/quiz/
   mindmap manquants, leçon-centré) **puis** compose la mission — ordre imposé
   (ADR-0021 §4). **Auto-validation bornée** : la popup de confirmation Papa EST
   l'approbation (ADR-0021 §2) → kit `validated`, mission `validation_status =
   'validated'`. **Dégradation gracieuse leçon-centrée** (ADR-0021 §3) : une notion
   sans leçon canonique validée voit ses étapes leçon-dépendantes sautées, l'omission
   remontée à Papa ; si une notion tombe à zéro étape jouable, elle est retirée de la
   composition (et si < 2 matières subsistent, la mission n'est pas créée — signalé).

6. **Verdict PAR NOTION à la complétion** (arbitrage 3). Quand toutes les étapes ont
   leur preuve, le service **itère** le verdict §5bis sur les **notions distinctes**
   des étapes : pour chaque `skill_id`, `acquired = reverse≥t ET (quiz≥t OU
   mindmap≥t)` sur les preuves **de cette notion** → mastery↑ + gap `resolved`, sinon
   mastery honnête + gap `in_progress` + carte SRS reprogrammée (la notion revient via
   `revision`). **XP inconditionnel** (l'effort), **majoré** pour une champion :
   `mission_champion_xp_base` + `mission_champion_xp_per_notion × N` (config,
   versionné). Un **badge « Champion »** (`XPEvent`/badge existant) marque la
   réussite. Formulation enfant : célébration d'ensemble (« Champion ! Tu as
   travaillé N notions dans M matières 🏆 »), chaque notion positive comme §5bis —
   jamais de « raté ».

7. **Exclusion du sélecteur, présence dans les decks.** Une champion est **exclue
   du pool de candidats** de `GET /missions/today` (invariant ADR-0017 §6 : elle
   n'est jamais élue « mission du jour »), mais **listée** dans les missions de
   Massimo (`/missions`) comme un **deck/héros dédié** « Défi champion 🏆 »
   (multi-matières). L'élection quotidienne et la disponibilité restent deux choses
   distinctes.

8. **Deux déclencheurs, même objet.**
   - **Commander étendu** : une nouvelle porte « Défi champion » (scope multi-matières
     + saveur) à côté des portes existantes (échéance, thématique). Preview/confirm,
     `created_by='parent'`, `validated` par construction.
   - **Conseil de classe** : une recommandation croisée typée (`skill_ids` de ≥ 2
     matières + `mission_type='champion'` + saveur) → bouton « Créer ce défi
     champion » → même flux d'équipement/composition. Réutation du pont ADR-0020/0021.

## Périmètre

**v1** :
- migration `mission_steps.skill_id` (nullable) ;
- `mission_type='champion'` + composition croisée (service : preview par saveur,
  confirm = équipement ADR-0021 + fan-in en UNE mission, étapes taggées `skill_id`) ;
- verdict **itéré par notion** à la complétion + XP majoré + badge Champion ;
- exclusion du sélecteur quotidien ; inclusion en deck « champion » côté Massimo ;
- **porte Commander « Défi champion »** (backend + page Papa) ;
- **reco croisée Conseil** (le Conseil émet déjà des recos typées ADR-0020 : ajout
  du type `champion` + bouton dédié) ;
- frontend Massimo : deck/héros champion, timeline multi-matières (l'`ActivityModal`
  et la preuve par étape sont inchangées).

**Hors v1** :
- **proposition automatique** d'une champion sans geste humain (ni Commander ni clic
  Conseil) — le sélecteur reste exclu, et l'auto-proposition de fond attend un constat
  d'usage ;
- fabrication d'une leçon/chapitre manquant (ADR-0021 §périmètre) ;
- saveurs adaptatives / apprentissage des préférences (inauditable, exclu comme
  ADR-0017) ;
- croisées à l'initiative de Massimo (l'enfant ne compose pas).

## Conséquences

### Positives
- Le référentiel trouve un **débouché transversal** : ZETIS sait enfin composer un
  parcours qui relie les matières, cœur de l'esprit EPI.
- Réutilisation maximale : moteur d'étapes (ADR-0017), équipement (ADR-0021), verdict
  §5bis, service d'évidence, preview/confirm (ADR-0018) — **un seul champ de migration**
  et **un seul nouveau type**.
- La mission « champion » donne un **objet de motivation positif** (badge, défi) qui
  n'existait pas — les missions étaient toutes correctives.
- Rétro-compatibilité : `mission_steps.skill_id` nullable → les missions existantes
  fonctionnent sans backfill (retombée sur `mission.skill_id`).

### Négatives / coûts
- **Verdict par notion = boucle** : le code de complétion (`service.py`) passe de
  « le `skill_id` de la mission » à « itérer les `skill_id` distincts des étapes ».
  Refactor localisé mais réel ; le chemin mono-notion doit rester identique
  (fallback `mission.skill_id` quand les étapes n'ont pas de `skill_id`).
- **Latence d'équipement** : jusqu'à 5 générations LLM locales × N notions — la porte
  Papa affiche des barres estimées (ADR-0021 §6), l'attente est réelle.
- **Auto-validation** : hérite du coût ADR-0021 (contenu non relu pièce par pièce),
  mitigé par la popup + l'édition/rejet a posteriori.
- **Champion longue** : dépasse volontairement le budget 15 min — assumé (défi), mais
  à surveiller côté fatigue enfant ; plafond `MISSION_CHAMPION_MAX_SKILLS` = garde-fou.

## Suivi

- **Docs** : ligne `DECISIONS.md` ; correction du vocabulaire `mission_type` dans
  `DATA_MODEL.md` (+ `champion`, + `mission_steps.skill_id`) ; `API_SPEC.md §Missions`
  (porte champion, exclusion sélecteur, deck champion) ; pointeur dans `adr-0017 §6`
  (« croisées → couvertes par ADR-0022 ») et `adr-0018` (porte champion).
- **Backend (slice A)** : migration `mission_steps.skill_id` ; module `missions` —
  `champion.py` (preview par saveur + confirm : équipement ADR-0021 puis fan-in),
  verdict itéré dans `service.py`, exclusion sélecteur dans `selector.py`, XP/badge en
  config ; schémas `ChampionPreviewOut`/`ChampionCreateIn` (frontière Papa) ; tests
  (compose ≥ 2 matières ; saveurs ; verdict par notion ; exclusion sélecteur ;
  dégradation leçon-centrée ; rétro-compat mono-notion).
- **Backend (slice A bis)** : reco `champion` du Conseil de classe (module `reports` :
  type de reco + `skill_ids` multi-matières).
- **Frontend Papa (slice B)** : porte « Défi champion » dans la page Commander/Missions
  (choix saveur + scope + preview décochable + barres d'équipement + récap) ; bouton
  « Créer ce défi champion » sur la page Conseil.
- **Frontend Massimo (slice C)** : deck/héros « Défi champion 🏆 », timeline
  multi-matières (badges matière par étape), célébration Champion.
- **Ordre** : slice A (backend, socle) → B (Papa, déclencheurs) → C (Massimo, jeu).
  Mono-chantier : une branche `feat/missions-champion`.
</content>
</invoke>
