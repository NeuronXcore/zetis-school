// Auth locale (Étape 6) — JWT de dev stocké en localStorage.
// Cet espace est réservé au rôle "massimo" : un compte papa est refusé ici.
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const TOKEN_KEY = "zetis_massimo_token";

export const APP_ROLE = "massimo";

export interface AuthUser {
  username: string;
  role: string;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export async function login(username: string, password: string): Promise<AuthUser> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (res.status === 401) throw new Error("Identifiants invalides");
  if (!res.ok) throw new Error(`Erreur serveur (${res.status})`);
  const data = (await res.json()) as { access_token: string; role: string; username: string };
  if (data.role !== APP_ROLE) throw new Error("Cet espace est réservé à Massimo.");
  setToken(data.access_token);
  return { username: data.username, role: data.role };
}

export async function fetchMe(): Promise<AuthUser | null> {
  const token = getToken();
  if (!token) return null;
  const res = await fetch(`${API_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    clearToken();
    return null;
  }
  const data = (await res.json()) as AuthUser;
  if (data.role !== APP_ROLE) {
    clearToken();
    return null;
  }
  return data;
}
