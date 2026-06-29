import { createAuthClient } from "@zetis/auth";

export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

// Client d'auth de l'app Massimo (rôle "massimo", clé de token dédiée).
export const authClient = createAuthClient({
  apiUrl: API_URL,
  appRole: "massimo",
  appLabel: "Massimo",
  tokenKey: "zetis_massimo_token",
});
