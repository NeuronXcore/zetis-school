import type { AuthUser } from "@zetis/auth";

import { clearToken, getApiUrl, getToken, setToken } from "./storage";

// Auth de l'extension : reprend la logique réseau de @zetis/auth (login + contrôle
// de rôle Papa, /api/auth/login & /api/auth/me) mais persiste le token via
// chrome.storage.local au lieu de localStorage (cf. ADR-0006 — contrainte sécurité).
// On ne refactore pas @zetis/auth (partagé par les frontends) ; on mirroir sa logique.

const APP_ROLE = "papa";

export type { AuthUser };

/** Connexion Papa. Lève une erreur explicite si identifiants/role invalides. */
export async function login(username: string, password: string): Promise<AuthUser> {
  const apiUrl = await getApiUrl();
  const res = await fetch(`${apiUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (res.status === 401) throw new Error("Identifiants invalides");
  if (!res.ok) throw new Error(`Erreur serveur (${res.status})`);
  const data = (await res.json()) as { access_token: string; role: string; username: string };
  if (data.role !== APP_ROLE) throw new Error("Cet espace est réservé à Papa.");
  await setToken(data.access_token);
  return { username: data.username, role: data.role };
}

/** Utilisateur courant si un token Papa valide existe, sinon null (et purge). */
export async function fetchMe(): Promise<AuthUser | null> {
  const token = await getToken();
  if (!token) return null;
  const apiUrl = await getApiUrl();
  const res = await fetch(`${apiUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    await clearToken();
    return null;
  }
  const data = (await res.json()) as AuthUser;
  if (data.role !== APP_ROLE) {
    await clearToken();
    return null;
  }
  return data;
}

export async function logout(): Promise<void> {
  await clearToken();
}
