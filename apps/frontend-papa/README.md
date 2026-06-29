# apps/frontend-papa

Interface **parent** (Papa) — cockpit de pilotage. React + Vite + TypeScript + Tailwind CSS v4.

État : **Étape 3** — shell minimal (layout + sidebar + dashboard). Pas encore de vraies pages, ni d'appel backend, ni d'IA. Strictement séparé du frontend Massimo.

## Démarrer

Depuis la racine du monorepo :

```bash
pnpm install
pnpm --filter @zetis/frontend-papa dev      # http://localhost:5174
```

Ou depuis ce dossier :

```bash
pnpm dev        # serveur de dev (port 5174)
pnpm build      # typecheck + build de production
pnpm typecheck  # vérification TypeScript seule
```

## Structure

```
src/
├── main.tsx                # point d'entrée + BrowserRouter
├── App.tsx                 # routes (dashboard + placeholders)
├── index.css               # Tailwind v4 + tokens Papa (accent émeraude)
├── lib/navigation.ts       # entrées de la sidebar (12)
├── layouts/PapaLayout.tsx  # sidebar + header + zone analytique
├── components/PapaSidebar.tsx
└── pages/
    ├── DashboardPage.tsx   # dashboard « ZETIS Papa » + cartes KPI
    └── PlaceholderPage.tsx # pages à venir
```

shadcn/ui + graphiques (KPI, tableaux) seront ajoutés à l'étape des vraies pages (Étape 8).
