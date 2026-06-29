# @zetis/auth

Logique d'authentification partagée entre les frontends Massimo et Papa (Étape 6 factorisée).

Package source TypeScript (consommé tel quel par Vite, pas de build). React, React-DOM et React-Router sont des `peerDependencies` (fournis par l'app).

## Contenu

- `createAuthClient({ apiUrl, appRole, appLabel, tokenKey })` → `login` / `fetchMe` / `logout` / `getToken`
- `fetchHealth(apiUrl, signal?)` — healthcheck backend
- `AuthProvider` + `useAuth` — contexte React d'auth
- `RequireAuth` — garde de routes (avec `fallback` pour l'état de chargement)
- Types : `AuthUser`, `HealthResponse`, `AuthClientConfig`

## Usage (par app)

```ts
// src/lib/authClient.ts
import { createAuthClient } from "@zetis/auth";
export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
export const authClient = createAuthClient({
  apiUrl: API_URL,
  appRole: "massimo",      // ou "papa"
  appLabel: "Massimo",     // ou "Papa"
  tokenKey: "zetis_massimo_token",
});
```

Chaque app garde son **thème** (couleurs) et sa page de login propres ; seule la logique est partagée.
