# Prompt Claude Code — Galaxie animée

**Branche** : `feat/galaxy-animations` · **Chantier mono** · **Deux slices, dans l'ordre.**

**Décisions de référence** — à lire **avant** toute écriture de code :

- `docs/decisions/adr-0024-addendum-galaxie-animee.md` (slice A)
- `docs/decisions/adr-0029-addendum-construction-depuis-root.md` (slice B)
- `docs/frontend-massimo/mockup/mockup-page-galaxy-animations-v1.html` — **la maquette fait foi
  pour le rythme et l'ordre**, pas pour le rendu (elle est en 2D ; le rendu reste `GalaxyCanvas`).

**Aucun travail backend sur ce chantier.** Zéro route, zéro schéma, zéro table, zéro migration.
Si une tâche semble en exiger un, c'est un blocage : voir « Stop-on-blocker ».

---

## Read-before-code — obligatoire, avant la première ligne

Ouvre **Graphify** d'abord, puis lis et **rapporte ce que tu trouves** avant de coder :

1. `GALAXY_MAX_NODES` — déclaration **et tous les usages**. Est-ce une troncature **serveur**
   (`galaxy/service.py`) ou un `slice()` **client** ?
2. Le repli « amas + dépliage à la demande » : chercher `cluster`, `collapse`, `deplier`,
   `expand`. **Existe-t-il en code, ou seulement dans les docs ?**
3. Le filtre client qui ne garde que `root` + `subject` sur la vue par défaut de `/galaxy`
   (addendum §C du 2026-07-31). **Où vit-il** : composant de page, hook, ou `GalaxyCanvas` ?
4. Le placement orbital des planètes : passe-t-il par `fx/fy/fz` ?
5. `GalaxyReplayModal` : **comment alimente-t-elle le canvas** — quel appel, quel filtre, monte-t-elle
   `GalaxyCanvas` directement ou via le composant de page de `/galaxy` ?
6. `react-force-graph-3d`, version épinglée : `d3ReheatSimulation` / `d3AlphaTarget` sont-ils
   exposés sur l'API réellement disponible ?

Les points 3 et 5 conditionnent la slice B. Les rapporter **même si la slice A suffit à démarrer**.

---

## Slice A — Supprimer le plafond, animer l'arrivée

> ADR-0024 addendum. Aucune dépendance à la slice B.

### A1. Suppression de `GALAXY_MAX_NODES`

- Constante, paliers `compact/tablet/desktop`, branches de repli, tests associés : **tout part**.
- Si le repli « amas + dépliage » existe en code, il part avec.
- S'il n'existe **pas**, le signaler : c'est un écart doc/code à corriger dans `zetis-galaxy.md`.

⚠️ **Ne pas toucher au filtre `root` + `subject`** de la vue par défaut. Ce n'est **pas** le
plafond ; c'est une décision prise sur rendu réel. Le supprimer ferait revenir l'amas corrigé le
2026-07-31.

### A2. Les trois gardes de substitution

- **Plafonner les particules** du flux doré (nombre total, et coupure sous un seuil de FPS).
  C'est le vrai coût par frame — jamais un plafond de nœuds déguisé.
- **`cooldownTicks`** : moteur arrêté après stabilisation. La rotation caméra continue.
- **Repli sans WebGL** : vérifier qu'il est intact, ne pas y toucher.

### A3. Animation d'arrivée de la vue par défaut

Chorégraphie et constantes : ADR-0024 addendum §3, maquette écran A.

`CORE_IN=420` · `PLANET_STAGGER=80` · `PLANET_TRAVEL=700` (`easeOutCubic`) · `ORBIT_DRAW=600`.

- Le cerveau apparaît **seul**, puis les matières naissent au centre et rejoignent leur créneau.
- L'orbite se trace **à l'arrivée de sa première planète**, jamais avant.
- **Ordre = ordre du programme.** Jamais chronologique, jamais par volume.
- **Une fois par visite** : flag de session. Le retour d'une constellation restitue la composition
  d'emblée, sans rejouer.
- `prefers-reduced-motion` → composition finale immédiate, aucun trajet, aucune rotation.

⚠️ Si le placement fixe `fx/fy/fz`, le nœud est **téléporté** : n'affecter `fx/fy/fz` qu'à
l'arrivée, animer `x/y/z` avant. Le moteur reste éteint — c'est un tween, pas une convergence.

### Tests slice A

- La vue par défaut ne rend **que** `root` + `subject` (non-régression du §C).
- L'arrivée ne rejoue pas au retour d'une constellation.
- `prefers-reduced-motion` : aucun trajet, état final au premier rendu.
- Les tests qui référençaient les paliers sont supprimés, pas assouplis.

---

## Slice B — Construction du rejeu depuis `root`

> ADR-0029 addendum. Dépend des constats read-before-code 3 et 5.

### B1. Horloge de rang

`STAR_CADENCE=120` · `ANCESTOR_LEAD=60` · `BIRTH=480` (`easeOutCubic`).

- Une notion à la fois, **ordre = `first_lit`**. Le temps réel n'est pas à l'échelle.
- Matière et chapitre naissent `ANCESTOR_LEAD` avant leur **première** notion — naissance
  **dérivée côté client**, aucun appel supplémentaire.

### B2. Mutation en place

- **Ne jamais réassigner `graphData`.** Même tableau, mêmes objets nœuds ; on ajoute.
- Chaque nouveau nœud naît **aux coordonnées de son parent**.
- `d3ReheatSimulation` à **alpha bas (~0.2)**. ⚠️ **Jamais `alpha(1)`** — c'est la ré-explosion
  qu'on corrige.

### B3. La frise devient témoin

- Elle se trace **en synchronisation** avec les étoiles ; compteur « N étoiles allumées ».
- **Plus de curseur, plus de drag.** Un seul bouton : « Revoir ».
- ⚠️ **L'axe X reste le JOUR ACTIF** (série creuse, espacement uniforme). Le curseur avance en
  fraction du jour. Un axe de rang donnerait une **droite** — motif écrit dans l'ADR, ne pas
  « unifier ».
- Sur l'Accueil, la frise est **inchangée**. Ne pas y toucher.

### B4. Ça ne se fige pas

- À la fin : `autoRotate` + flux doré à particules, **comportements déjà en place** sur `/galaxy`.
  Rien de nouveau à écrire.
- Dérive par nœud : **une horloge apériodique propre à chaque étoile**, un seul point d'accroche
  au signal principal (règle « pas de marionnette »).
- `prefers-reduced-motion` → **état final d'emblée**, aucune construction, aucune animation
  continue.

### B5. Graphe complet dans la modale

La modale consomme `GET /api/student/galaxy/all` **sans** le filtre `root` + `subject`. Si ce
filtre vit dans `GalaxyCanvas`, le **remonter en prop** — ne pas le supprimer, la vue par défaut en
dépend.

### Tests slice B

- ⚠️ **`accueil.bundle.test.ts` reste vert sans être assoupli**, et l'Accueil **ne monte pas la
  modale au chargement**. Le double `lazy()` de l'ADR-0029 §1 est intact.
- Aucun élément de curseur/drag dans la modale.
- Aucune date rendue nulle part.
- `prefers-reduced-motion` : état final, aucune animation.

---

## Interdits, sur tout le chantier

- Toute route, tout schéma, toute migration.
- **Un import statique de `GalaxyReplayModal` depuis l'Accueil** — 1,37 Mo remis sur la page
  d'atterrissage sans qu'aucun test ne le voie.
- Une date lisible, une période vide annoncée, un pourcentage, un classement de matières, une
  couleur d'échec.
- Un autoplay sur une surface que Massimo n'a pas ouverte pour elle.
- Toucher aux modules `progress` et `production` (Papa-only), à `@zetis/ui/mindmap` ou à
  `@xyflow/react`.

## Stop-on-blocker

Arrêter et remonter, sans contourner :

- le plafond est appliqué **côté serveur** → la suppression change le contrat des routes élève ;
- `GalaxyReplayModal` monte le canvas **via le composant de page** de `/galaxy` → le B5 devient un
  refactor, pas un réglage ;
- `d3ReheatSimulation` / `d3AlphaTarget` absents de la version épinglée → la mutation en place est
  à repenser ;
- toute divergence entre ce que disent les ADR et ce que dit le code.

## Documentation, à jour en fin de session

- `zetis-galaxy.md` §9 (tableau des paliers → les trois gardes) et §11.
- `adr-0024-zetis-galaxy-progression.md` §6 + liste des amendements.
- `adr-0029-rejeu-anime-galaxie.md` — pointeurs sur §3 et §4.
- `page-accueil.md` — retirer la mention de la frise comme barre de lecture.
- `DECISIONS.md` (deux lignes), `CHANGELOG.md` (**0.34.0**).
- `API_SPEC.md` et `DATA_MODEL.md` : **inchangés**. Si tu les édites, c'est que quelque chose a
  dérivé.
- **Toute découverte architecturale faite pendant l'exécution remonte dans les docs.** C'est le
  maillon faible du workflow.

## Checklist de clôture

1. `pnpm tsc -b` vert · 2. build Massimo vert · 3. tests Massimo verts · 4. tests backend verts
(rien n'a bougé, donc aucun ne doit tomber) · 5. `accueil.bundle.test.ts` vert **sans
assouplissement** · 6. vérification navigateur des deux animations sur les **trois appareils** ·
7. docs à jour · 8. écarts doc/code rapportés · 9. commits atomiques par slice.
