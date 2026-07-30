# @zetis/auth

Logique d'authentification partagée entre les frontends Massimo et Papa (Étape 6 factorisée).

Package source TypeScript (consommé tel quel par Vite, pas de build). React, React-DOM et React-Router sont des `peerDependencies` (fournis par l'app).

## Contenu

- `createAuthClient({ apiUrl, appRole, appLabel, tokenKey })` → `login` / `fetchMe` / `logout` / `getToken`
- `fetchHealth(apiUrl, signal?)` — healthcheck backend
- `AuthProvider` + `useAuth` — contexte React d'auth
- `RequireAuth` — garde de routes (avec `fallback` pour l'état de chargement)
- `LoginScreen` — page de connexion, `role="massimo" | "papa"`
- `BrandIntro` — intro de marque plein écran (montée par `LoginScreen`)
- `shouldPlayIntro()` / `markIntroSeen()` — portail de session de l'intro
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

Chaque app garde son **thème** (couleurs) pour ses propres pages. La **connexion**, elle, est
entièrement partagée : le composant `LoginScreen` est le même, seul le `role` change.

```tsx
// src/pages/LoginPage.tsx
import { LoginScreen } from "@zetis/auth";
export function LoginPage() {
  return <LoginScreen role="massimo" />; // ou "papa"
}
```

L'auth est **par app** : chaque frontend n'accepte que son rôle et tourne sur son port
(Massimo 5173, Papa 5174). La page rendue est donc propre à un seul profil — elle affiche son
avatar (`/massimo-avatar.png` ou `/papa-avatar.png`, servis depuis le `public/` de chaque app)
et ne propose aucun lien vers l'autre espace.

## Intro de marque

`LoginScreen` monte `BrandIntro` (overlay plein écran, `zetis-logo.mp4` → poster → fondu de sortie)
tant que `shouldPlayIntro()` est vrai, c'est-à-dire **une fois par session et par origine**
(`sessionStorage["zetis_intro_seen"]`), et jamais si l'utilisateur préfère les animations réduites.
L'intro est coupable (clic, touche, bouton « Passer ») et ne peut pas bloquer la connexion : autoplay
refusé, vidéo absente ou figée → repli sur le poster puis sortie (garde-fou de 8 s).

Les deux apps doivent servir `zetis-logo.mp4`, `zetis-logo.png` et l'avatar de leur profil à la racine
de leur `public/` (chemins absolus).
