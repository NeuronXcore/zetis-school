# Prompt Claude Code — ZETIS Galaxy · Slice B (frontend Massimo)

> **Prérequis : la Slice A backend est livrée et mergée** (les trois routes `/api/student/galaxy*`
> et les types partagés `packages/types/src/galaxy.ts` existent).
> Tu travailles uniquement dans `apps/frontend-massimo` et `packages/ui`.
> **Frontend pur** : aucun endpoint, schéma ou migration créé ou modifié.
> **Aucune modification de `apps/frontend-papa`.**

---

Lance d'abord `graphify update .`, puis lis, dans cet ordre, avant toute ligne de code :

1. `CLAUDE.md` ;
2. `docs/decisions/adr-0024-zetis-galaxy-progression.md` — **décisions figées** ;
3. `docs/frontend-massimo/zetis-galaxy.md` §7, §10, §11 ;
4. **La maquette `docs/frontend-massimo/mockup/maquette-massimo-galaxy.html`** — référence visuelle
   exacte (deux écrans, cinq états lumineux, légende, panneau d'actions, bandeau XP conservé).
   Transpose en React/Tailwind avec les tokens Massimo — **ne recopie pas le CSS brut** ;
5. **Les types partagés de la Slice A** : c'est le contrat, n'en redéclare aucun ;
6. `packages/ui/src/components/mindmap/` — le patron d'une brique canvas partagée : export en
   **sous-chemin**, **zéro fetch**, données en props, `evaluator`/callbacks injectés.
   **Tu le lis pour t'en inspirer, tu ne le modifies pas** ;
7. `apps/frontend-massimo/src/pages/ProgressionPage.tsx` (la page à refondre),
   `src/components/MassimoBannerHeader.tsx`, `src/hooks/useAccueil.ts` (patron `Promise.allSettled`),
   `src/pages/RevisionPage.tsx` L50-70 (patron `navigate(route, { state })`).

## 1. La brique — `@zetis/ui/galaxy`

Nouveau composant dans `packages/ui/src/components/galaxy/`, exporté en **sous-chemin** dans
`packages/ui/package.json` (patron exact de `./mindmap`, ligne 9-12). **Ne l'ajoute pas à l'export
racine** : Three.js ne doit pas entrer dans les bundles qui n'en veulent pas.

- Dépendance : **`react-force-graph-3d`**, version épinglée exactement (patron `@xyflow/react` /
  `elkjs`), déclarée dans `packages/ui/package.json`.
- Le composant est **chargé en `lazy()`** côté page.
- Contrat : `{ nodes, edges, onNodeClick, selectedId?, accent? }`. **Zéro fetch, zéro logique
  métier** — il rend ce qu'on lui donne.
- `enableNodeDrag` actif : Massimo tire un nœud, les liens s'étirent, la constellation suit.
  **Pas de persistance des positions.**

## 2. La page — `/progression` devient la Galaxy

Même route, même entrée de sidebar. **Ne crée pas de route `/galaxy`, ne touche pas à
`navigation.ts`.**

- **Conservés** : anneau XP + niveau, badges, activité récente (`GET /api/gamification/summary`).
- **Supprimée** : la section « par matière » **mockée** (elle lit `SUBJECTS` de `data/mock.ts`) —
  la Galaxy est la donnée qu'elle attendait.
- **Écran 1** : vue d'ensemble, une constellation par matière, libellé « N étoiles allumées ».
- **Écran 2** : constellation d'une matière (amas = chapitre, étoiles = notions) + légende des cinq
  états + panneau d'actions.
- Hook dédié `useGalaxy` dans `src/hooks/`, appels dans `src/lib/galaxy.ts` (patron des 27 modules
  `lib/*` existants). `Promise.allSettled`, jamais `all`.

## 3. Le panneau d'actions

Ouvert par `onNodeClick` sur une étoile, alimenté par `GET /api/student/galaxy/notion/{skill_id}`.
Fermé par un clic sur le fond.

Navigation par action, **selon ce qui existe réellement** :

| kind | destination |
|---|---|
| `cours` | `/subjects/{subject_slug}/cours` |
| `eli5` | `/eli5?skill_id={skill_id}&name={name}` — **seule surface notion-adressable** |
| `quiz` | `navigate("/quiz/session", { state })`, patron `RevisionPage.tsx` |
| `mindmap` | `/mindmaps/reconstruire/{mindmap_id}` |
| `revision` | `/revision?subject={subject_slug}` |

**Tu rends exactement les actions renvoyées par le serveur, dans l'ordre reçu.** Tu n'en ajoutes
aucune, tu n'en grises aucune, tu n'inventes aucune règle de repli côté client.

## 4. Invariants non négociables

- **Pas de rouge**, aucune couleur ni aucun libellé d'échec. Les cinq libellés enfant sont ceux de
  la spec §5 : « À découvrir », « On commence », « En construction », « Bien acquis », « Maîtrisé ».
- **Aucun pourcentage affiché**, aucun classement de matières. `intensity` module la luminosité,
  il ne s'écrit jamais à l'écran.
- **Aucune série, aucun décompte de jours manqués**, sous aucune forme.
- **`prefers-reduced-motion`** : forces figées après stabilisation, pas d'auto-rotation, halos
  statiques. À traiter comme une condition de livraison, pas une option.
- **Repli sans WebGL** : si le contexte 3D ne démarre pas, rendre la **liste des notions par
  chapitre** avec leurs états. La progression ne doit jamais devenir inaccessible.
- **Plafond adaptatif** `GALAXY_MAX_NODES = { compact: 40, tablet: 90, desktop: 150 }` : au-delà,
  n'affiche que les amas et déplie un chapitre à la demande. ⚠️ Ces valeurs sont **provisoires et
  non mesurées** — tu les confirmes ou les corriges en §9, et tu **signales** ce que tu as retenu.
- **Trois appareils, aucun secondaire** : Massimo travaille sur **iPhone, iPad et un MacBook dédié
  à l'école**. Panneau **latéral** en desktop et tablette paysage, **feuille basse** en portrait et
  sur téléphone.
- **Tactile et pointeur à parité** : étirer un nœud, tourner la caméra et ouvrir le panneau doivent
  marcher au doigt comme au trackpad. **Rien d'essentiel ne dépend du survol** (il n'existe pas au
  tactile). Cibles de touche ≥ 44 px sur les étoiles — élargis la zone cliquable au-delà du halo
  visible plutôt que de grossir l'étoile.
- Chaque étoile porte un `aria-label` « nom de la notion — libellé d'état ».

## 5. Bandeau XP

`MassimoBannerHeader.tsx` devient cliquable → `/progression`. Élément interactif accessible
(bouton ou lien, focus visible), rien de plus. **Pas d'annonce « +1 étoile », pas d'aperçu sur
l'Accueil** : hors v1.

## 6. Tests

Vitest, colocalisés (patron des 18 fichiers existants) :

- les cinq états rendent cinq apparences distinctes, **aucune en rouge** ;
- `in_progress` rend comme `learning` ;
- une action absente de la réponse serveur **n'est pas rendue** ;
- le repli sans WebGL affiche la liste par chapitre ;
- aucun `%` dans le rendu de la page ;
- la brique `@zetis/ui/galaxy` ne déclenche aucun fetch.

`pnpm --filter @zetis/frontend-massimo test` et `typecheck` verts. Attention : `tsc --noEmit` à la
racine ne vérifie rien — utilise `tsc -b`.

## 7. Hors-périmètre — tu t'arrêtes au bord

- Aucun endpoint, schéma Pydantic ou migration.
- **`packages/ui/src/components/mindmap/` et `@xyflow/react` ne sont pas touchés.** Si tu crois
  devoir modifier `MindmapWorkspace`, tu as dévié — **STOP**.
- Aucune modification de `apps/frontend-papa`.
- Pas de route `/galaxy`, pas de nouvelle entrée de sidebar, pas de modification de `navigation.ts`.
- Pas d'aperçu Accueil, pas d'annonce de fin de mission, pas d'animation temps réel, pas de
  persistance des positions.
- Si une primitive générique manque, **STOP** : propose son extraction vers `@zetis/ui` et attends
  validation — pas de variante locale.

## 8. Stop-on-blocker

Sur toute divergence réelle — contrat de types différent de la Slice A, `react-force-graph-3d`
incompatible React 19, perf inacceptable au plafond de nœuds — **arrête-toi, signale, propose
l'ajustement minimal**. Ne code pas autour.

## 9. Vérification à l'écran — trois formats

La 3D ne se juge pas sur des tests. Avant de livrer : lance le frontend, ouvre `/progression`, et
**prouve par capture** la vue d'ensemble, une constellation et le panneau ouvert, **aux trois
largeurs** — téléphone, tablette, desktop. Vérifie qu'aucune interaction essentielle ne dépend du
survol.

Ce que tu peux faire toi-même s'arrête là : les FPS réels sur **l'iPhone, l'iPad et le MacBook** de
Massimo ne se mesurent pas au redimensionnement de fenêtre. **Dis-le explicitement** dans la
livraison, indique les plafonds que tu as retenus, et demande l'essai sur les appareils réels —
c'est ce qui tranche, pas ton émulation. Si un palier doit baisser, c'est celui de l'appareil
concerné, **jamais la 3D retirée des autres**.

## 10. Livraison

Résumé des fichiers modifiés · commandes à lancer · tests ajoutés · points restants · risques
connus. Puis propose un message de commit clair. **Ne committe pas toi-même.**
