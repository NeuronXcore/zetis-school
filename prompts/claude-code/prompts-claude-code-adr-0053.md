# Prompts Claude Code — ADR-0053 « Le paquet partagé cesse d'être un angle mort »

> **Une seule slice.** `packages/ui` uniquement. **Zéro backend, zéro migration, zéro changement de
> comportement** pour Massimo ni pour Papa. À coller après `/slice`, qui porte la discipline.
>
> Lire d'abord : `docs/decisions/adr-0053-le-paquet-partage-cesse-d-etre-un-angle-mort.md`.

---

## Slice unique — le runner, le polyfill, les tests de montage

### Ce qu'il y a à faire, dans cet ordre

**1. Le runner (Décision 1).**

`packages/ui/vite.config.ts` avec le **même** bloc `test` que les apps — recopie-le depuis
`apps/frontend-massimo/vite.config.ts`, il est identique à celui de Papa :

```ts
test: { environment: "jsdom", globals: true, setupFiles: "./src/test/setup.ts", css: false,
        include: ["src/**/*.test.{ts,tsx}"] }
```

Plus `"test": "vitest run"` dans `packages/ui/package.json`, et les devDependencies qu'il faut.

🔴 **On RECOPIE, on ne factorise pas.** Une configuration partagée à la racine a été **écartée**
(alternative C de l'ADR). Si tu es tenté de créer un `vitest.shared.ts`, relis-la.

**2. Le polyfill (Décision 3).**

`packages/ui/src/test/setup.ts` : les 2 lignes des apps **plus** un polyfill de `ResizeObserver`.

⚠️ **Commente pourquoi il diverge du `setup.ts` des apps** — sinon quelqu'un « alignera » les trois
et cassera le montage. C'est une conséquence nommée dans l'ADR.

⚠️ **`ResizeObserver` et RIEN d'autre.** Un polyfill donne à jsdom ce que le navigateur a. Dès que
tu mockes un composant que tu testes, tu écris `MindmapPreviewModal.test.tsx` — le test qui n'a rien
vu.

**3. Les tests de montage (Décision 2).**

Pour **chaque** composant exporté par `packages/ui` : le monter avec des props minimales, vérifier
qu'il **ne jette pas**. Rien d'autre — pas d'assertion sur le contenu.

Les exports se lisent dans `src/index.ts`, `components/mindmap/index.ts`,
`components/galaxy/index.ts`, `components/avatar/index.ts`.

**4. `GalaxyCanvas` (Décision 4).**

S'il ne peut pas se monter (WebGL absent de jsdom), il est **explicitement exclu, avec son motif
écrit dans le test**. 🔴 **Jamais silencieusement** — un `.skip` sans phrase est une dette qui se
déguise en test.

---

## 🔴 La contre-épreuve — c'est une CONDITION DE LIVRAISON, pas une option

Après avoir écrit le test de montage de `MindmapWorkspace` :

1. déplace le `useEffect` du recadrage **avant** le `const [layout, setLayout] = useState(...)`
   qu'il lit dans ses dépendances (c'est la TDZ exacte du 2026-08-12) ;
2. lance la suite : **elle DOIT rougir** ;
3. remets en place, vérifie par `git diff` que la restauration est **exacte**.

**Si elle ne rougit pas, le chantier n'a rien produit** — tu auras écrit un test qui se sent utile.
Ce dépôt a payé ce motif **quatre fois**, dont une où le verrou central était vert sur un sabotage.

---

## Les pièges, nommés d'avance

1. **`elkjs` est asynchrone et cherche un `Worker`** (15 références) absent de jsdom. Le test ne
   vérifie **que le montage** : un rejet de promesse en arrière-plan ne doit pas le faire tomber.
   Si vitest transforme une promesse rejetée non gérée en échec, traite-la — **sans** masquer une
   vraie erreur de montage.

2. **React Flow exige `ResizeObserver`.** Sans le polyfill, le test échoue **toujours**, pour une
   raison qui n'a rien à voir avec le code testé. Un test qui échoue toujours finit désactivé, et
   l'angle mort revient avec bonne conscience.

3. **43 fichiers sur 48 sont légers.** Ne conclus pas de `GalaxyCanvas` que le paquet entier est
   coûteux à tester : les dépendances lourdes tiennent dans **5 fichiers**.

4. **Un composant qui résiste se CONSIGNE, il ne se refactore pas.** Modifier `packages/ui` pour le
   rendre testable est **hors périmètre** — si ça arrive, c'est un signal que l'ADR nomme
   (« qu'est-ce qui rend ce composant intestable ? »), pas une licence.

5. **Pas d'objectif de couverture.** Écarté **fermement** par l'ADR : le défaut n'était pas un
   manque de couverture, c'était un composant qui ne montait pas.

6. ⚠️ **`packages/ui` n'a jamais eu de devDependencies de test.** Vérifie ce que pnpm résout
   réellement dans un monorepo — ne suppose pas que `vitest` est là parce que les apps l'ont.

---

## Vérification exigée

- `npm test` **dans `packages/ui`** — la suite tourne et passe ;
- **la contre-épreuve ci-dessus rougit**, puis la restauration est vérifiée par `git diff` ;
- **non-régression** : suites **entières** de `frontend-massimo` (668 au 2026-08-12) et
  `frontend-papa` (814) ;
- `./node_modules/.bin/tsc -b` depuis **chaque app** — ⚠️ **jamais `npx tsc`**, qui attrape un faux
  binaire et ne vérifie rien (piège payé le 2026-08-12).

🔴 **Un test modifié pour passer est une régression masquée.**
