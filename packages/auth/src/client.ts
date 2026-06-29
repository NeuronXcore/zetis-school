import { type AuthClientConfig, type AuthUser, type HealthResponse } from "./types";

export interface AuthClient {
  login(username: string, password: string): Promise<AuthUser>;
  fetchMe(): Promise<AuthUser | null>;
  logout(): void;
  getToken(): string | null;
}

// Crée un client d'auth paramétré par app (rôle + clé de token).
export function createAuthClient(config: AuthClientConfig): AuthClient {
  const { apiUrl, appRole, appLabel, tokenKey } = config;

  return {
    getToken: () => localStorage.getItem(tokenKey),
    logout: () => localStorage.removeItem(tokenKey),

    async login(username, password) {
      const res = await fetch(`${apiUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (res.status === 401) throw new Error("Identifiants invalides");
      if (!res.ok) throw new Error(`Erreur serveur (${res.status})`);
      const data = (await res.json()) as { access_token: string; role: string; username: string };
      if (data.role !== appRole) throw new Error(`Cet espace est réservé à ${appLabel}.`);
      localStorage.setItem(tokenKey, data.access_token);
      return { username: data.username, role: data.role };
    },

    async fetchMe() {
      const token = localStorage.getItem(tokenKey);
      if (!token) return null;
      const res = await fetch(`${apiUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        localStorage.removeItem(tokenKey);
        return null;
      }
      const data = (await res.json()) as AuthUser;
      if (data.role !== appRole) {
        localStorage.removeItem(tokenKey);
        return null;
      }
      return data;
    },
  };
}

// Healthcheck partagé (utilisé par le composant BackendStatus de chaque app).
export async function fetchHealth(apiUrl: string, signal?: AbortSignal): Promise<HealthResponse> {
  const res = await fetch(`${apiUrl}/health`, { signal });
  if (!res.ok) throw new Error(`Backend HTTP ${res.status}`);
  return (await res.json()) as HealthResponse;
}
