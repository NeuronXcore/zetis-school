// Client API minimal vers le backend ZETIS (Étape 5).
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export interface HealthResponse {
  status: string;
  service: string;
}

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const res = await fetch(`${API_URL}/health`, { signal });
  if (!res.ok) {
    throw new Error(`Backend HTTP ${res.status}`);
  }
  return (await res.json()) as HealthResponse;
}
