# Prompts Claude Code — ADR-0052 « La mindmap prend la place qu'elle demande »

> **Une seule slice.** Front uniquement, `packages/ui` + `apps/frontend-massimo`. **Zéro backend,
> zéro migration, zéro route.** À coller après `/slice`, qui porte la discipline (graphify,
> read-before-code avec RAPPORT, stop-on-blocker, hors-périmètre, non-régression).
>
> Lire d'abord : `docs/decisions/adr-0052-la-mindmap-prend-la-place-qu-elle-demande.md` et
> `docs/frontend-massimo/page-mindmaps.md` (§ « Gabarit vertical », § « Plein écran »,
> § « Vocabulaire »).

---

## Slice unique — le gabarit, le plein écran, le vocabulaire

**Fichiers attendus** : `packages/ui/src/components/mindmap/` (`MindmapWorkspace.tsx`,
`NodeBank.tsx`, `ModeSegmented.tsx`, `LayoutSelector.tsx`) et, pour la Décision 5,
`apps/frontend-massimo/src/pages/MindmapsPage.tsx`, `MindmapSubjectPage.tsx`,
`components/missions/MindmapMissionModal.tsx`.

### Ce qu'il y a à faire, dans cet ordre

**1. Le canvas cesse de se mesurer en `vh` (Décision 2 — commence par là).**

C'est la décision de fond ; les autres en dépendent. `MindmapWorkspace.tsx:599` porte
`height: "clamp(520px, 74vh, 840px)"`. Le composant devient une **colonne flex bornée** dont le
canvas prend le reste (`flex-1` + `min-h-0`), la hauteur venant du **parent**.

🔴 **N'invente aucune constante.** La galaxie code en dur un `112` (`GalaxyPage.tsx:314`) : c'est
l'anti-modèle. Si le parent doit imposer une hauteur, elle se **passe en prop** avec un défaut, ou
se **mesure**, elle ne se devine pas.

**2. La banque passe au-dessus du canvas (Décision 3).**

`<NodeBank>` est rendue après le canvas (`MindmapWorkspace.tsx:743`) : elle passe avant.
⚠️ **Mode `build` seulement** — Mémorise n'a pas de banque, ne lui en invente pas une.

**3. Le plein écran (Décision 1).**

Patron de `GalaxyPage.tsx:81-108` : état React + overlay CSS, `CloseFullscreenButton` **réutilisé
tel quel**, Échap, défilement du corps verrouillé. Les **trois** modes.
⚠️ **Un seul `ReactFlow` monté** — ne rends pas les deux et n'en cache pas un.
⚠️ Depuis une modale : l'overlay passe **au-dessus**, en sortir **ne la referme pas**.

**4. La barre des modes cesse d'être coupée (Décision 4).**

`flex-wrap`, jamais de défilement horizontal ni de menu déroulant. Idem `LayoutSelector`.

**5. Le vocabulaire (Décision 5).**

Quatre chaînes, listées dans l'ADR. ⚠️ **`ConseilClasseIAPage.tsx` côté Papa : on n'y touche pas.**

---

## 🔴 Les pièges, nommés d'avance

1. **`74vh` est la CAUSE, pas un réglage.** Le remplacer par un autre `vh` (`58vh`, `64vh`…) ne
   corrige rien : j'ai proposé `clamp(380px, 58vh, 660px)` au cadrage, il **débordait encore de
   37 px** sur l'écran où je l'ai proposé. Si ta solution contient `vh` pour la hauteur du canvas,
   elle est fausse.

2. **La banque n'a pas de hauteur fixe.** 154 px à vide, **278 px** mesurés sur téléphone. Tout
   `calc()` qui la suppose constante sera faux sur les grandes cartes.

3. **`MindmapWorkspace` a TROIS consommateurs**, dont deux modales :
   `MindmapSubjectPage` (pleine page), `MindmapMissionModal` (Massimo), `MindmapPreviewModal`
   (Papa). **Une modification les touche tous les trois.** Vérifie les trois.

4. **Les deux modales bornent DÉJÀ leur hauteur** (`max-h-[calc(100vh-4rem)]`, corps
   `min-h-0 flex-1 overflow-y-auto`). Ne leur ajoute pas une seconde borne — elles n'ont jamais été
   le problème, je l'ai cru à tort au cadrage.

5. **`resetForMode` remet tout à zéro à chaque changement de mode** (`MindmapWorkspace.tsx:172`).
   L'état de plein écran **ne doit pas** y passer : changer de mode en plein écran ne doit pas en
   sortir.

6. **`storageScope` isole les positions `localStorage`** entre pleine page, mission et aperçu Papa.
   Le plein écran **n'est pas un quatrième scope** — c'est la même carte.

7. **Aucun test de ce dépôt ne mesure de géométrie.** Ta suite sera verte quoi que tu fasses au
   gabarit. **La preuve est dans le DOM**, pas dans les tests.

---

## Vérification exigée

**Dans le DOM, jamais sur capture** (le panneau navigateur rend des captures noires sur les pages
longues — `TROUBLESHOOTING.md`).

À **390 × 844** et à **1594 × 1078**, sur les **trois** surfaces :

| Contrôle | Attendu |
|---|---|
| bas de la banque | **≤ hauteur du viewport** (aujourd'hui : 538 px hors écran sur téléphone) |
| bord droit du bouton « Reconstruire » | **≤ largeur du viewport** (aujourd'hui : 435 pour 390) |
| `scrollWidth == clientWidth` sur la barre des modes | vrai |
| cibles de touche | **0 sous 44 px** |
| plein écran | s'ouvre dans les 3 modes, Échap sort, la modale ne se ferme pas |
| `ReactFlow` montés | **1**, jamais 2 |

Puis **non-régression** : suite `frontend-massimo` **entière** (668 tests au 2026-08-12) et
`npx tsc -b` — ⚠️ **jamais `tsc --noEmit` à la racine**, qui ne vérifie rien.

🔴 **Un test modifié pour passer est une régression masquée.** Si un test rougit, comprends
pourquoi avant de le toucher.

🔴 **La relecture visuelle humaine est due AVANT le merge.** Ce chantier n'existe que parce que le
commanditaire a regardé.
