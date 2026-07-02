# packages/ui — `@zetis/ui`

Design system partagé entre les frontends Massimo et Papa. Consommé en **source** (workspace,
`main = src/index.ts`) ; les couleurs sont pilotées par des tokens sémantiques mappés par chaque app
dans son `index.css`.

## Exports

- **Primitives** : `Button` / `buttonVariants`, `Card` (+ `CardHeader`, `CardTitle`, `CardContent`),
  `Badge` / `badgeVariants`, `Spinner`, `EmptyState`, utilitaire `cn`.
- **Célébration « mini-victoire »** (capsule créée / nouvelle) :
  - `CelebrationProvider` — à monter autour de l'app (dans `main.tsx`).
  - `useCelebrate()` — renvoie `celebrate({ title?, subtitle? })` : surgissement joyeux (halo néon +
    particules, CSS keyframes, respecte `prefers-reduced-motion`) + carillon doux.
  - `SoundToggle` — bouton 🔊/🔇 (réglage persistant partagé).
  - Helpers son : `playCelebrationChime`, `isSoundEnabled`, `setSoundEnabled`, `onSoundChange`.
    Le carillon est **synthétisé via la Web Audio API** (aucun fichier audio) ; le réglage on/off est
    persisté dans `localStorage` (`zetis:sound`).

## Exemple

```tsx
// main.tsx
<CelebrationProvider>
  <App />
</CelebrationProvider>

// dans un composant
const celebrate = useCelebrate();
celebrate({ title: "Capsule créée !", subtitle: capsule.title });
```
