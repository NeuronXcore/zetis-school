# Page Papa — Missions · pilotage (ADR-0017)

## Objectif

Donner à Papa la vue *machine* des missions : valider ce que ZETIS a généré
(rien n'atteint Massimo sans validation, décision 5ter), comprendre l'élection
du jour facteur par facteur (auditabilité), suivre l'exécution par les preuves,
lire les verdicts. À terme (Lot 3) : commander une mission par intention.

La page se lit de haut en bas comme le **cycle de vie d'une mission** :
à valider → élue → en cours → verdict.

Route : `/missions` (frontend-papa). Remplace la MissionsPage de l'étape 15
(bouton « Générer la remédiation » + liste).

Réf. décisions : `docs/decisions/adr-0017-arbitrage-missions.md`.
Réf. maquette validée : `maquette-papa-missions-pilotage.html` (2026-07-05).

## Structure (de haut en bas)

1. **En-tête** : titre, sous-titre (rappel du contrat : évidence mesurée +
   validation), bouton `+ Commander une mission` (Lot 3 — masqué tant que le
   lot n'est pas livré).
2. **KPI** (4) : à valider · dans le pool (validées) · terminées cette
   semaine · % de verdicts « acquise » (30 j).
3. **À valider** (5ter) : cadre ambré — la seule zone qui *attend* Papa.
   Liste des missions `validation_status = pending`, chacune avec son **motif
   de génération** (« lacune sévérité 0.7 », « 6 cartes dues », « rattrapage
   jamais travaillé ») ; case par ligne + « Tout sélectionner » ; **validation
   en lot**, **rejet à l'unité**. Hint permanent : « invisibles pour Massimo
   tant que non validées ».
4. **Élue aujourd'hui** : mission élue + `score`, décomposition en barres par
   facteur (`severity`, `due_pressure`, `continuity`, `variety`…), **facteur
   dominant marqué ◄**, `MISSION_SCORING_VERSION` en monospace, la **phrase
   servie à Massimo** (encart vert — les deux faces de la même décision côte à
   côte), alternatives non retenues avec leurs scores.
5. **En cours & planifiées** : filtres par `mission_type` (pilules) + matière ;
   lignes avec badges de type, **preuves par étape avec valeurs brutes**
   (`💡 lu ✓ · 🎙 reverse 0.8 ✓ · ❓ —`), étoile « ★ priorité forcée » sur les
   `manual`, provenance (porte / Conseil de classe), double badge dégradé pour
   les croisées.
6. **Verdicts récents** : `✓ acquise` / `↻ à revoir` avec scores bruts
   (quiz %, reverse), effet (« lacune → résolue » / « → carte SRS
   reprogrammée »), XP crédité **dans les deux cas** (rappel : compléter ≠
   acquérir).

## Badges & vocabulaire (côté Papa, jargon assumé)

- Types : `remediation` (indigo) · `revision` (bleu) · `progression`
  (violet) · `manual` (émeraude) · `croisée` (dégradé indigo→violet, badge
  *additionnel* — croisée est une propriété, pas un type).
- Verdicts : `✓ acquise` (émeraude) · `↻ à revoir` (indigo — jamais
  rouge/ambre : ce n'est pas une alerte, c'est une reprogrammation).
- **Le rouge n'est légitime que pour la fragilité mesurée** (Lot 3, preview
  des notions) — jamais sur un verdict ni sur une mission.
- Sidebar : badge compteur ambré sur l'entrée « Missions » = nombre de
  `pending` (même motif que les autres files de validation).

## Données API (contrats ADR-0017 — voir prompt backend)

- `GET /api/missions/pending` → `[MissionPilotOut]` (avec `generation_reason`).
- `POST /api/missions/validate` `{ ids: [] }` → validation en lot.
- `POST /api/missions/{id}/reject` → `validation_status = rejected`.
- `GET /api/missions/election/today` (Papa) → `{ elected, factors: [{name,
  value, dominant}], score, scoring_version, reason, alternatives: [{mission,
  score}] }` — **recalculé à la demande** (sélecteur déterministe ⇒ rien à
  stocker).
- `GET /api/missions/pilot?type=&subject=` → `[MissionPilotOut]` (preuves avec
  valeurs brutes par étape).
- `GET /api/missions/verdicts/recent` → `[{ mission, verdict, quiz_score,
  reverse_score, effect, xp }]`.
- KPI : agrégats servis par `GET /api/missions/pilot/summary`.

> **Frontière de schémas** : cette page consomme `MissionPilotOut`
> (sur-ensemble). Les champs `score`, `factors`, `generation_reason`, scores
> bruts de preuves **n'existent pas** dans `MissionStudentOut` — la frontière
> est serveur, jamais un filtrage front.

## `[0047]` Lien profond — `?focus=<mission_id>`

La page Lacunes pointe la mission qui couvre une notion (« Voir la mission → »). À l'arrivée, la
mission visée est **dépliée** et amenée au centre de l'écran.

🔴 **L'ancre est un `id` DOM (`mission-<id>`) posé sur les DEUX listes**, « À valider » et le pool —
jamais une recherche dans un seul tableau. Motif : `active_missions`, qui alimente le lien côté
serveur, n'a **aucun filtre `validation_status`**, alors que `pilot_list` **exige `validated`**. Une
mission `pending` couvre donc une notion sans figurer au pool : chercher dans une seule liste
rendrait le lien **mort une fois sur deux**, ce qui déplacerait d'une page le cul-de-sac que
l'`adr-0047` corrige.

⚠️ L'effet ne dépend que de la **valeur** du paramètre, jamais de l'objet `params` — celui-ci change
d'identité à chaque écriture d'URL, et la page se re-scrollerait sous les doigts de Papa. Il sort
sans rien faire si l'élément n'est pas encore monté : les listes arrivent après le premier rendu.

**La mission ciblée porte un anneau ambre**, qui s'estompe en ~2,4 s. Déplier et centrer ne
suffisait pas : Papa arrivait sur une page pleine de missions sans savoir laquelle il venait
chercher. *(Demandé par le commanditaire le 2026-08-09, après avoir suivi le lien.)*

🔴 **L'estompage est en CSS, jamais par un `setTimeout` React** — et c'est ce qui rend
`prefers-reduced-motion` juste sans une ligne de JS : l'animation coupée, **l'anneau reste**. Un
retrait piloté par l'état aurait effacé le repère chez qui demande moins de mouvement, soit
exactement ce que le patron du dépôt interdit (« FIGE SANS RIEN RETIRER »).

⚠️ **Ambre TEMPORAIRE, et c'est ce qui le distingue** de l'ambre permanent de l'alerte (bandeau de
la Couverture, « chez toi » du rail Diagnostic). Ici il dit « regarde ici », pas « quelque chose ne
va pas ».

## États

- **Aucune pending** : la zone « À valider » affiche un état vide sobre
  (« Rien à valider — le pool est à jour »), le badge sidebar disparaît.
- **Pool vide / rien d'élu** : zone « Élue » affiche `elected: null` +
  explication (« Aucune mission validée disponible — validez ou générez ») ;
  c'est le pendant Papa de l'état serein de Massimo.
- **Chargement / erreur** : Spinner partagé ; message + réessayer.

## Implémentation

- Logique dans `hooks/useMissionsPilotage.ts` (fetch + mutations validate/
  reject, invalidation du compteur sidebar) — zéro logique métier front.
- Composants `@zetis/ui` existants (Card/Badge/Button/Spinner/EmptyState) ;
  barres de facteurs = divs simples (pas de lib de charts).
- Thème Papa (émeraude, clair, analytique) — aucun emprunt au thème Massimo.
- La sélection en lot est un état local éphémère (checkbox), pas persisté.

## Hors périmètre V1 (Lot 3)

- Bouton et modale « Commander une mission » (3 portes : recommandation /
  échéance / thématique avec notions résolues décochables) — spec dans la
  maquette, implémentation après Conseil de classe. Le bouton n'apparaît pas
  tant que le lot n'est pas livré (pas de bouton mort).

## Voir aussi

- `docs/decisions/adr-0017-arbitrage-missions.md`
- `docs/frontend-massimo/page-missions.md` (la projection élève — mêmes
  objets, champs analytiques absents par construction)
- `page-conseil-classe-ia.md` (source de la porte (i), Lot 3)
