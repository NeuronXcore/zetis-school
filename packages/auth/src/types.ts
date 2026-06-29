export interface AuthUser {
  username: string;
  role: string;
}

export interface HealthResponse {
  status: string;
  service: string;
}

export interface AuthClientConfig {
  /** Base URL du backend (ex. http://localhost:8000). */
  apiUrl: string;
  /** Rôle autorisé pour cette app (ex. "massimo" | "papa"). */
  appRole: string;
  /** Libellé affiché en cas de mauvais rôle (ex. "Massimo"). */
  appLabel: string;
  /** Clé de stockage du token en localStorage (doit différer entre apps). */
  tokenKey: string;
}
