# Papa — « Commander une mission » (modale, ADR-0018)

## Objectif

Donner à Papa le moyen de **commander** une mission par intention, sans jamais
la composer à l'aveugle : Papa apporte le *scope* (une échéance ou une
thématique du référentiel), ZETIS résout les **notions les plus fragiles** de ce
scope depuis l'évidence mesurée, Papa **ajuste (décoche) puis confirme**. La
mission créée est `manual`, `validated` par construction (elle ne passe pas par
la file « À valider »).

Ce n'est **pas** un formulaire de création vierge (interdit ADR-0017 déc. 1) :
il n'y a pas de champ « titre » ni « étapes » — le parcours (`eli5 →
vocal_explain → quiz`) est généré par le moteur déterministe. **Une mission =
une notion** : cocher k notions crée **k missions courtes** (plafond
`MISSION_COMMAND_MAX_SKILLS = 3`), pas une mission composite (ADR-0018 déc. 2).

Réf. décisions : `docs/decisions/adr-0018-creation-manuelle-mission.md`
(raffine `adr-0017`). Mockup : `mockup/maquette-papa-missions-pilotage.html`
(modale « Commander une mission »).

## Emplacement

- Bouton `+ Commander une mission` dans l'en-tête de la page **Missions —
  pilotage** (`page-missions-pilotage.md`). Il **remplace** le placeholder Lot 3
  aujourd'hui absent — il n'apparaît qu'avec cette slice.
- Ouvre une **modale** (pas une page). Fermeture = Échap / clic hors cadre /
  Annuler. Rien n'est écrit tant que « Créer la mission » n'est pas confirmé.

## Structure de la modale

1. **Trois portes** (sélecteur horizontal, une active à la fois) :
   - 📅 **Échéance** — *active v1*. « Contrôle, exposé… sur un chapitre. »
   - 🎯 **Thématique** — *active v1* (voie **sélection référentiel**). « Choisir
     une matière → un chapitre → des notions. »
   - 📋 **Recommandation** — *désactivée v1*, libellé grisé « bientôt — depuis le
     Conseil de classe IA ». (Le texte libre de la thématique est aussi
     *désactivé v1* : « bientôt — nécessite l'index des notions ».)
   Les portes désactivées sont **visibles avec leur raison**, jamais masquées
   (pas de bouton mort — ADR-0018 déc. 1).

2. **Champs selon la porte** :
   - Échéance : `select` chapitre (référentiel de l'année active) + `date`. La
     **date est informationnelle** (repère d'affichage/tri côté pilotage
     Papa) ; l'urgence passe par « Prioritaire » (§5), **coché par défaut** pour
     cette porte. La date n'atteint jamais Massimo (ADR-0018 déc. 1).
   - Thématique : `select` matière → `select` chapitre → **cases** des notions
     du chapitre (multi-sélection, ≤ `MISSION_COMMAND_MAX_SKILLS`).

3. **Notions résolues** (rendu après `preview`) — le cœur du garde-fou :
   liste `skill_id · nom · niveau`, badge de **fragilité** (`fragile` / `moyen` /
   `solide` selon `mastery`), **case cochable**. Les notions maîtrisées
   (`mastery ≥ 0.8`) arrivent **décochées** (recochables). Hint : « décochez ce
   qui ne convient pas ».

4. **Note de composition** (`compose_note` renvoyé par le serveur) : « ZETIS
   composera **N missions courtes** (une par notion cochée), parcours 💡→🎙→❓,
   ~15 min chacune. »

5. **Priorité forcée** : case « Prioritaire (avant l'échéance) » →
   `force_priority`. Plancher de score, jamais plafond (ADR-0018 déc. 4).
   **Cochée par défaut** pour la porte Échéance, libre pour la Thématique.

6. **Actions** : `Annuler` · `Créer les missions` (activé si ≥ 1 notion cochée ;
   le nombre suit le nombre de notions cochées).

## Flux

```txt
choix porte + scope
      │  (débounce sur changement de scope)
      ▼
POST /api/missions/command/preview   ──► notions résolues + compose_note   (rien en base)
      │  Papa (dé)coche, coche « prioritaire »
      ▼
POST /api/missions/command/confirm   ──► [MissionPilotOut]  (k missions manual, validated)
      │
      ▼
modale fermée · toast « N missions créées » · la page pilotage se rafraîchit
(elles apparaissent directement dans « En cours & planifiées », PAS dans « À valider »)
```

## Contrats API (source : ADR-0018 déc. 2 — voir prompt backend au green-light)

- `POST /api/missions/command/preview`
  - entrée : `{ gate: "deadline"|"theme_ref", chapter_id?, due_date?, skill_ids? }`
  - sortie : `{ scope_label, notions: [{ skill_id, name, level, mastery, fragility, checked }], compose_note }`
  - **n'écrit rien** (invariant testé).
- `POST /api/missions/command/confirm`
  - entrée : `{ gate, chapter_id?, due_date?, skill_ids: [int] (≤ MAX), force_priority }`
  - sortie : `[MissionPilotOut]` — **une mission mono-skill par notion cochée** ;
    chacune `created_by = parent`, `validation_status = validated`. `due_date`
    stockée pour le pilotage Papa, **jamais** sérialisée côté student.

> **Frontière de schémas** : la modale vit côté Papa et consomme
> `MissionPilotOut`. Aucune de ces routes n'a d'équivalent Massimo — commander
> est un acte de pilotage.

## États

- **Aucune notion dans le scope** (chapitre sans `Skill`, ou tout maîtrisé et
  tout décoché) : action désactivée + hint « aucune notion à travailler ici —
  choisissez un autre scope ».
- **Plafond atteint** (`MISSION_COMMAND_MAX_SKILLS` notions cochées) : cocher
  au-delà est bloqué + hint « max 3 notions par commande ».
- **Chargement `preview`** : Spinner dans la zone notions ; le reste reste
  interactif.
- **Erreur** : message + « Réessayer », scope conservé.
- **Portes hors v1** : sélectionnables visuellement mais inertes (curseur
  `not-allowed`, tooltip = la raison).

## Implémentation (au green-light — pas maintenant)

- Logique dans un hook dédié (`useCommandMission.ts`) : `preview` (débouncé),
  `confirm`, état des cases (local). **Zéro logique métier front** — la
  résolution (fragilité, décochage, composition) est **serveur**.
- Réutiliser les briques `@zetis/ui` (modale/Card/Badge/Button/Spinner) et
  `useSubjects`/`useCurriculum` pour les `select` matière/chapitre/notions.
- Après `confirm` : invalider les données de la page pilotage (le pool + KPI ;
  **pas** le badge « À valider » — une `manual` n'y entre pas). Toast « N
  missions créées ».

## Hors périmètre (ADR-0018)

- Porte **Recommandation** (i) → dépend de la page Conseil de classe IA.
- Porte **Thématique par texte libre** (iii-b) → dépend de la décision
  d'embeddings des `Skill` (colonne + backfill, ou résolution via RagChunk) —
  reportée, options dans l'ADR-0018 (Alternatives).
- Missions **croisées** (multi-matières) : `subject_id` déjà nullable, mais leur
  composition/proposition relève du Conseil de classe (ADR-0017 déc. 6).

## Voir aussi

- `docs/decisions/adr-0018-creation-manuelle-mission.md`
- `docs/decisions/adr-0017-arbitrage-missions.md` (déc. 1 `manual`, 5ter
  validation par construction, déc. 2 `forced_priority`)
- `page-missions-pilotage.md` (la page hôte du bouton)
- `page-conseil-classe-ia.md` (source de la porte (i), reportée)
