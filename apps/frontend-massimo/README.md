# apps/frontend-massimo

Interface **enfant** (Massimo) — React + Vite + TypeScript + Tailwind CSS v4.

État : **Étape 2** — shell minimal (layout + sidebar + page d'accueil). Pas encore de vraies pages, ni d'appel backend, ni d'IA.

## Démarrer

Depuis la racine du monorepo :

```bash
pnpm install
pnpm --filter @zetis/frontend-massimo dev      # http://localhost:5173
```

Ou depuis ce dossier :

```bash
pnpm dev        # serveur de dev
pnpm build      # typecheck + build de production
pnpm typecheck  # vérification TypeScript seule
```

## Structure

```
src/
├── main.tsx                  # point d'entrée + BrowserRouter
├── App.tsx                   # routes (accueil + placeholders)
├── index.css                 # Tailwind v4 + tokens du Design System ZETIS
├── lib/navigation.ts         # entrées de la sidebar
├── layouts/MassimoLayout.tsx # sidebar + header + zone principale
├── components/
│   ├── MassimoSidebar.tsx
│   └── ZetisAvatar.tsx
└── pages/
    ├── HomePage.tsx          # accueil « ZETIS Massimo »
    └── PlaceholderPage.tsx   # pages à venir
```

shadcn/ui sera ajouté à l'étape des vraies pages (Étape 7).
