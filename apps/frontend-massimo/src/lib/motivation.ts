// Appels aux routes d'auto-motivation (module backend `motivation`).
// Contrats : `@zetis/types` — rien n'est redéclaré ici.
import type { MotivationMessage, MotivationWeek, MotivationWelcome } from "@zetis/types";
import { API_URL, authClient } from "./authClient";

function headers(withBody = false): HeadersInit {
  const token = authClient.getToken();
  const base: HeadersInit = withBody ? { "Content-Type": "application/json" } : {};
  return token ? { ...base, Authorization: `Bearer ${token}` } : base;
}

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`Erreur ${res.status}`);
  return (await res.json()) as T;
}

/** La semaine de Massimo : 7 cases + son engagement s'il en a pris un. */
export async function fetchWeek(): Promise<MotivationWeek> {
  return asJson(await fetch(`${API_URL}/api/student/motivation/week`, { headers: headers() }));
}

/** Massimo pose ou révise son engagement. La SEMAINE n'est pas envoyée : le serveur la déduit. */
export async function updateWeekGoal(targetDays: number): Promise<MotivationWeek> {
  return asJson(
    await fetch(`${API_URL}/api/student/motivation/week`, {
      method: "PUT",
      headers: headers(true),
      body: JSON.stringify({ target_days: targetDays }),
    }),
  );
}

/** Ce que ZETIS dit en arrivant (texte composé serveur). */
export async function fetchWelcome(): Promise<MotivationWelcome> {
  return asJson(await fetch(`${API_URL}/api/student/motivation/welcome`, { headers: headers() }));
}

/** Le mot de la fin d'une séance. */
export async function fetchWrapUp(): Promise<MotivationMessage> {
  return asJson(await fetch(`${API_URL}/api/student/motivation/wrap-up`, { headers: headers() }));
}
