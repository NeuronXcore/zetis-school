# Prompt Claude Code — Page matière, slice B (frontend Massimo)

**Branche** : `feat/page-matiere`, **après** la slice A mergée sur la branche (cette page consomme
ses endpoints, elle n'en invente aucun).

---

## 0. Protocole

1. **Graphify** à jour d'abord.
2. **Read-before-code** (§1) : lis les fichiers réels avant d'écrire. Les constats ci-dessous sont
   des hypothèses issues de la doc.
3. **Stop-on-blocker** — notamment sur le §4 (rétrolien d'ELI5), qui a une vraie chance d'être
   bloquant.
4. **9 points de clôture** en fin de session.

Références :
- Maquette : `docs/frontend-massimo/mockup/mockup-page-matiere-v1.html` — **lis-la, elle est le
  contrat visuel et interactif** (recherche, accordéon, panneau, demandes, états).
- Spec : `docs/frontend-massimo/page-matiere-dediee.md`.
- Décisions : addenda ADR-0024 (page matière) et ADR-0027 (demandes élève).

---

## 1. Read-before-code

| Fichier | Ce qu'on cherche |
|---|---|
| `apps/frontend-massimo/src/pages/…SubjectPage` (nom réel à trouver) | ce que la page fait **aujourd'hui**, et ce qui la référence |
| `src/lib/notionActionUi.ts` | `ACTION_UI` — libellés, icônes, ordre. **C'est la source à réutiliser** |
| le `NotionActionPanel` de la Galaxy | **à NE PAS importer** (il traîne `three.js` par transitivité — raison d'être de `notionActionUi.ts`). Confirme la chaîne d'import |
| `src/lib/chatActions.ts` | `surfaceOf`, table de routes — pour ne pas dupliquer la construction de routes |
| la recherche de constellation (`zetis-galaxy`) | le helper de **pliage d'accents** : réutilise-le, ne le réécris pas |
| `src/lib/reviews.ts` | le champ de plafond de session (patron `flash_size`) — **pas `total_due`** |
| `subjectIconFor` | pictogrammes de marque, chargement par slug |
| les pages `/fiches/:slug`, `/mindmaps/:slug`, `/subjects/:slug/cours`, `/revision` | **leur bouton retour actuel** : où va-t-il ? C'est ce qu'on remplace au §4 |
| le test de budget de bundle de l'Accueil | patron à copier pour le §5 |

**Point de vérification dur** : le test de budget de l'Accueil doit interdire **`import()` autant que
les imports statiques**. Un test limité aux imports synchrones ne protège de rien (leçon du
2026-07-31 : ce qui coûtait, c'était le **montage**). Vérifie-le avant de le copier.

---

## 2. La page

Un hook **`useSubjectPanoply(slug)`** porte toute la logique ; le composant ne calcule aucune règle
métier. Deux appels : `GET /api/student/subjects/{slug}/panoply` et le résumé de révision filtré
matière.

Composition, de haut en bas (détail dans la spec, rendu exact dans la maquette) :

1. **En-tête** — pictogramme de marque (jamais d'emoji), nom, « N chapitres · N notions », bouton
   fantôme « Voir en galaxie → » vers `/galaxy?subject=<slug>`.
   **Interdits** : niveau, XP, pourcentage, barre de progression, badge de maîtrise.
2. **Recherche** — locale, client-side, à la frappe, accents pliés, surlignage, `Échap` efface. Un
   chapitre s'ouvre s'il contient une trouvaille et disparaît sinon. État vide : le message de la
   spec, qui renvoie au chat.
3. **Reprendre** — deux cartes au plus, **jamais rendues à vide**. La carte de révision affiche le
   **plafond de session**, jamais `total_due`.
4. **Chapitres → notions** — accordéon ; par notion : pastille d'état (5 états, libellés d'enfant,
   aucun rouge), nom, **panoplie de 7 pastilles** (pleine = disponible, creuse = bientôt), masquée
   sous 620 px.
5. **Panneau de notion** — les 7 activités en boutons. **L'accent va à la première activité
   réellement faisable**, pas à la première de la liste. L'indisponible est **grisé, non cliquable,
   « bientôt »** — jamais « manquant ».

Ordre pédagogique stable : `cours · eli5 · fiche · capsule · mindmap · revision · quiz`.

**Libellés honnêtes** : `quiz` et `revision` ne sont pas adressables par notion (hors v1 ADR-0027) —
ils ouvrent la surface **matière**, et le libellé le dit sans promettre la notion.

---

## 3. Demander à Papa

- Bouton « demander » sur chaque pastille grisée → `POST /api/student/content-requests` avec **un**
  `content_kind`.
- « Demander à Papa tout ce qui manque (n) » en pied de panneau → **un seul appel**, tous les kinds
  manquants. Le bouton n'existe pas si `n = 0`.
- Retour visuel : la pastille passe en « demandé », et un toast « C'est noté pour Papa ».
- Phrase fixe sous le bouton : « ZETIS transmet la demande. Il ne fabrique rien tout seul. »
- **Jamais** « je te le prépare ». Aucun statut, aucun délai, aucun rappel, aucun XP.
- Optimiste, avec retour arrière silencieux en cas d'échec réseau (un échec de demande ne doit pas
  produire d'écran d'erreur chez l'enfant).

---

## 4. Rétrolien partagé — **le point à risque**

Une brique partagée qui lit le `:slug` de l'URL et rend « ← <Matière> ». **Aucun `location.state`,
aucune pile de navigation.**

À monter sur : `/subjects/:slug/cours`, `/fiches/:slug`, `/mindmaps/:slug`, et `/revision?subject=`.
Sur `/subjects/:slug` elle-même : « ← Matières ».

⚠️ **Blocker probable — ELI5.** `/eli5?skill_id=` porte une **notion**, pas une matière. Deux voies :
le `subject_slug` remonté par la réponse, ou un paramètre de slug ajouté à l'entrée. **Vérifie ce que
la réponse contient réellement.** Si aucune des deux n'est possible sans backend, **arrête-toi et
remonte-le** — n'invente pas un état de navigation.

---

## 5. Budget de bundle

Test **obligatoire** : le chunk de la page matière ne contient **pas** `three`, ni par import
statique, ni par `import()`. Copie le patron de l'Accueil après avoir vérifié qu'il couvre bien les
deux (§1).

C'est la contrainte qui fait de cette page le repli sans WebGL de `zetis-galaxy.md §11`. Sans le
test, la régression revient sans bruit.

---

## 6. Qualité de plancher

- `prefers-reduced-motion` : accordéon et surlignage restent lisibles sans mouvement.
- Cibles ≥ 44 px ; **rien d'essentiel ne dépend du survol**.
- `aria-label` sur chaque pastille d'état (« Mitose — En construction ») et de panoplie (« La fiche —
  bientôt »).
- Focus clavier visible ; l'accordéon et le panneau sont pilotables au clavier.
- **Aucun or `#ffcf47`** sur cette page (réservé à « ZETIS parle »).
- **Aucun rouge**, nulle part.

---

## 7. Ce qu'il ne faut PAS faire

- Importer `NotionActionPanel`, ou quoi que ce soit qui tire `three.js`.
- Réimplémenter le pliage d'accents, la table de routes, ou `ACTION_UI`.
- Mettre une règle métier dans le composant (tout dans le hook).
- Afficher `mastery_score`, un pourcentage, un niveau, un XP, une série, ou une notion nommée comme
  manquante.
- Ouvrir une activité en **modale** (amendement ADR-0024 §8 : pleine page).
- Rendre une carte « Reprendre » vide, ou une carte grisée dans le bloc Reprendre (le grisé documente
  le catalogue dans la panoplie, pas dans les raccourcis).

---

## 8. Tests

- Recherche : « photosynthese » trouve « Photosynthèse » ; `Échap` restaure l'arbre ; zéro résultat →
  message de renvoi au chat.
- Panoplie : 7 pastilles, l'état plein/creux suit `available`.
- L'accent est sur la **première activité faisable**, pas la première de la liste (test sur une
  notion dont le premier kind est indisponible).
- Une activité indisponible **n'est pas cliquable** et son libellé ne contient jamais « manquant ».
- « Tout ce qui manque » → **un seul** appel réseau, avec exactement les kinds manquants.
- Le bouton « tout ce qui manque » est absent quand la panoplie est complète.
- Budget de bundle (§5).
- Rétrolien : sur `/fiches/svt`, le lien pointe `/subjects/svt`.

---

## 9. Clôture

Les 9 points habituels, plus :

- le résultat du read-before-code : **quels constats du §1 étaient faux**, et ce que tu en as fait ;
- le sort du **rétrolien ELI5** (§4) : résolu comment, ou remonté comme blocker ;
- la confirmation que le test de budget couvre bien les `import()` ;
- ⚠️ **la page n'aura pas été vue à l'écran par l'agent** si le navigateur intégré n'est pas connecté.
  Dis-le explicitement plutôt que de laisser croire à une vérification visuelle — et liste ce qui
  reste à vérifier par le user (recherche à la frappe, accordéon, panneau, toast de demande).
