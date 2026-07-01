import { type AuthClientConfig, type AuthUser, type HealthResponse } from "./types";
import { type TokenStorage, createLocalStorageTokenStorage } from "./storage";

export interface AuthClient {
  login(username: string, password: string): Promise<AuthUser>;
  fetchMe(): Promise<AuthUser | null>;
  logout(): void;
  getToken(): string | null;
  /** Hydrate le cache mémoire depuis le stockage. Nécessaire uniquement pour un
   *  adaptateur asynchrone injecté (ex. chrome.storage.local) ; inutile pour le
   *  défaut localStorage — le cache y est déjà seedé synchroniquement à la
   *  construction, donc `getToken()` reste correct dès le premier appel. */
  hydrate(): Promise<void>;
}

// Crée un client d'auth paramétré par app (rôle + clé de token).
//
// `storage` optionnel : par défaut localStorage (comportement historique — les
// frontends web n'ont rien à passer et ne changent pas de comportement). Un
// adaptateur alternatif (ex. chrome.storage.local) peut être injecté ; il est
// asynchrone, d'où le cache mémoire + `hydrate()`. Le chemin de lecture chaud
// (`getToken()`) reste SYNCHRONE dans tous les cas.
export function createAuthClient(config: AuthClientConfig, storage?: TokenStorage): AuthClient {
  const { apiUrl, appRole, appLabel, tokenKey } = config;

  const injected = storage !== undefined;
  const tokenStorage = storage ?? createLocalStorageTokenStorage(tokenKey);

  // Défaut localStorage : on seed le cache SYNCHRONIQUEMENT pour ne rien changer
  // au comportement web. Adaptateur injecté (async) : cache vide jusqu'à hydrate().
  let cached: string | null = injected ? null : readLocalStorageSync(tokenKey);

  return {
    getToken: () => cached,

    async hydrate() {
      cached = await tokenStorage.load();
    },

    logout() {
      cached = null;
      // clear() est async (immédiat pour localStorage) : on ne bloque pas la
      // signature sync historique de logout() — on déclenche sans attendre.
      void tokenStorage.clear();
    },

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
      cached = data.access_token;
      await tokenStorage.persist(data.access_token);
      return { username: data.username, role: data.role };
    },

    async fetchMe() {
      const token = cached;
      if (!token) return null;
      const res = await fetch(`${apiUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        cached = null;
        await tokenStorage.clear();
        return null;
      }
      const data = (await res.json()) as AuthUser;
      if (data.role !== appRole) {
        cached = null;
        await tokenStorage.clear();
        return null;
      }
      return data;
    },
  };
}

// Lecture synchrone directe du défaut localStorage (seed du cache à la
// construction). Tolérant à un environnement sans localStorage (SSR / tests).
function readLocalStorageSync(tokenKey: string): string | null {
  try {
    return localStorage.getItem(tokenKey);
  } catch {
    return null;
  }
}

// Healthcheck partagé (utilisé par le composant BackendStatus de chaque app).
export async function fetchHealth(apiUrl: string, signal?: AbortSignal): Promise<HealthResponse> {
  const res = await fetch(`${apiUrl}/health`, { signal });
  if (!res.ok) throw new Error(`Backend HTTP ${res.status}`);
  return (await res.json()) as HealthResponse;
}
