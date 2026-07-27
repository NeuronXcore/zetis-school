// Persistance de l'extension : chrome.storage.local UNIQUEMENT.
// Sécurité (ADR-0006) : le token JWT ne doit jamais transiter par localStorage /
// sessionStorage. chrome.storage.local est isolé par extension et accessible depuis
// le service worker comme depuis le popup.

const TOKEN_KEY = "zetis_clip_token";
const API_URL_KEY = "zetis_clip_api_url";

/** Backend par défaut (dev local). Surchargé via la page Options. */
export const DEFAULT_API_URL = "http://localhost:8000";

async function get<T>(key: string): Promise<T | undefined> {
  const result = await chrome.storage.local.get(key);
  return result[key] as T | undefined;
}

export async function getToken(): Promise<string | null> {
  return (await get<string>(TOKEN_KEY)) ?? null;
}

export async function setToken(token: string): Promise<void> {
  await chrome.storage.local.set({ [TOKEN_KEY]: token });
}

export async function clearToken(): Promise<void> {
  await chrome.storage.local.remove(TOKEN_KEY);
}

export async function getApiUrl(): Promise<string> {
  const url = (await get<string>(API_URL_KEY)) ?? DEFAULT_API_URL;
  // On normalise (sans slash final) pour composer les routes proprement.
  return url.replace(/\/+$/, "");
}

export async function setApiUrl(url: string): Promise<void> {
  await chrome.storage.local.set({ [API_URL_KEY]: url.replace(/\/+$/, "") });
}
