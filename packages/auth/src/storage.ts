// Abstraction du stockage du token d'auth.
//
// Objectif : permettre d'injecter un backend de stockage alternatif (ex.
// chrome.storage.local pour l'extension `zetis-clip`) SANS transformer le chemin de
// lecture chaud (`getToken()`) en Promise. Le client d'auth garde un cache mémoire
// (lecture synchrone) hydraté via `load()` ; seuls load/persist/clear sont async.

export interface TokenStorage {
  /** Charge le token persisté (null si absent). Appelé à l'hydratation du cache. */
  load(): Promise<string | null>;
  /** Persiste le token. */
  persist(token: string): Promise<void>;
  /** Efface le token persisté. */
  clear(): Promise<void>;
}

// Adaptateur par défaut : localStorage (comportement historique des frontends web).
// L'API localStorage est synchrone ; on l'enveloppe dans l'interface async.
export function createLocalStorageTokenStorage(tokenKey: string): TokenStorage {
  return {
    load: async () => localStorage.getItem(tokenKey),
    persist: async (token) => localStorage.setItem(tokenKey, token),
    clear: async () => localStorage.removeItem(tokenKey),
  };
}
