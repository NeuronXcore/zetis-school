# Prompt Claude Code — Missions Lot 2 · slice B frontend Massimo (ADR-0017)

> À lancer APRÈS le merge de la slice A. PRÉREQUIS DOCUMENTAIRE (per ADR-0017,
> Suivi Lot 2) : **maquette Accueil confirmée** — si `page-accueil.md` n'a pas
> été mis à jour/validé pour la carte élue + raccourcis alternatives,
> ARRÊTE-TOI et signale.
> Périmètre : **frontend Massimo uniquement** — adaptation au nouveau contrat
> `/missions/today` (Accueil + page Missions). Aucun backend, aucun Papa.
> Petite slice, périmètre STRICT.

---

Lance d'abord `graphify update .`, puis lis, dans cet ordre, avant toute ligne de code :

1. `CLAUDE.md` ;
2. `docs/decisions/adr-0017-arbitrage-missions.md` — décisions 3 et 4 (contrat
   `today`, invariants anti-anxiété côté affichage) ;
3. **Le schéma réel** `MissionStudentOut` et la réponse réelle de
   `GET /missions/today` livrés par la slice A — jamais supposés ;
4. `docs/frontend-massimo/page-accueil.md` (version confirmée) et la page
   Accueil réelle ;
5. La page Missions Massimo réelle (slice élève : decks, timeline,
   `ActivityModal`) — tu ADAPTES sa consommation de `today`, tu ne touches ni
   aux modales ni aux preuves ni à l'ordre des étapes (le front reste
   agnostique : il rend le `sort_order` servi).

## Objectif

L'Accueil affiche LA mission élue avec sa raison (« parce que cette notion
revient bientôt »), jusqu'à deux alternatives en raccourcis non imposés, et
l'état serein « Tu n'as rien d'obligatoire maintenant » quand `elected` est
null. La page Missions consomme le même contrat. Rien d'autre ne change.

## Ordre de travail

### 1. Client API

- `fetchToday` aligné sur `{ elected, reason, reason_code, scoring_version,
  alternatives }` — types depuis le schéma réel. `reason_code` et
  `scoring_version` font partie de l'ENVELOPPE servie (décision 3) mais ne
  sont JAMAIS affichés à Massimo — seule `reason` (la phrase) l'est. La
  frontière de schémas porte sur les champs de la mission (`MissionStudentOut`
  sans scores/facteurs), pas sur l'enveloppe.

### 2. Accueil

- Carte « Mission du jour » : titre, matière, `reason` telle quelle (elle est
  déjà bienveillante par construction), durée estimée, XP, Commencer/Reprendre
  → route missions.
- Raccourcis : les `alternatives` (≤ 2) en cartes secondaires discrètes —
  proposées, jamais imposées (pas de badge d'urgence, pas de compteur).
- `elected: null` → l'état exact de `page-accueil.md` (« Tu n'as rien
  d'obligatoire maintenant… ») — pas de mission de remplissage, pas de vide
  anxiogène.
- AUCUN état « en retard », aucun compteur de jours — si un composant existant
  en affichait un, retire-le (invariant décision 4).

### 3. Page Missions

- Consommation du nouveau contrat (élue en tête + alternatives) sans toucher au
  player (modales, preuves, verdict inline — intacts).

### 4. Vérifications

- `pnpm dev:massimo` contre le backend réel : élue avec raison, alternatives,
  état null ; build OK ; zéro logique métier côté client.

## Hors périmètre strict

Player d'étapes / modales / verdict (livrés, intouchés) ; affichage croisées
(ADR dédié) ; frontend Papa (slice C) ; toute dépendance nouvelle ; tout
backend.

## Si tu es bloqué

Écart probable : le contrat réel de la slice A diverge de ce prompt — le code
réel fait foi, adapte et signale. Toute autre divergence : signale avant de
coder.

## À la fin, réponds avec la checklist standard (9 points)

Commit conseillé : `feat(massimo): home shows elected daily mission with
reason + gentle alternatives (ADR-0017 lot 2)`
