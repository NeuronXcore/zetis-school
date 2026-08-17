// Appels aux missions (ADR-0017) — Massimo démarre une mission puis valide ses étapes. Le serveur
// vérifie la PREUVE de chaque étape (score reverse, quiz joué, reconstruction) et rend un VERDICT
// d'acquisition à la dernière étape. Aucune logique métier ici : les contrats vivent dans
// @zetis/types, la décision (élection, preuve, verdict) est 100 % serveur.
import {
  type CompletedMission,
  type Mission,
  type MissionTodayResponse,
  type StepCompleteResult,
} from "@zetis/types";
import { notifyNewsChanged } from "./newsEvents";
import { API_URL, authClient } from "./authClient";

export type { CompletedMission, Mission, MissionStep, MissionTodayResponse, StepCompleteResult } from "@zetis/types";

function headers(): HeadersInit {
  const token = authClient.getToken();
  const base: HeadersInit = { "Content-Type": "application/json" };
  return token ? { ...base, Authorization: `Bearer ${token}` } : base;
}

/** Un refus que le SERVEUR a écrit **pour Massimo** — 409 quand la preuve d'une étape manque :
 *  *« Réexplique d'abord la notion à ZETIS pour valider cette étape. »* C'est une consigne, pas un
 *  diagnostic technique, et c'est la seule raison pour laquelle une phrase venue du réseau a le
 *  droit d'atteindre son écran.
 *
 *  🔴 **Le type EST la frontière.** Avant, `asJson` levait un `Error` nu et `missionSteps.ts`
 *  affichait `e.message` — ce qui rendait aussi bien la consigne du 409 que le `Erreur 500` que
 *  cette fonction fabriquait elle-même. Un seul canal pour deux natures de message : impossible
 *  d'en filtrer une sans l'autre. Deux types, deux sorts. Précédent du dépôt : `Eli5SttUnavailable`
 *  dans `lib/eli5.ts`, qui distingue déjà un 503 de dictée d'une panne quelconque. */
export class MissionRefus extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MissionRefus";
  }
}

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail: string | undefined;
    try {
      detail = ((await res.json()) as { detail?: string }).detail;
    } catch {
      detail = undefined;
    }
    // ⚠️ **409 SEULEMENT.** Les autres codes portent des phrases écrites pour qui débogue
    // (« Type d'étape non pris en charge. »), et un 500 n'en porte aucune : elles partent en
    // console, l'écran dit sa propre phrase.
    if (res.status === 409 && detail) throw new MissionRefus(detail);
    throw new Error(detail ?? `Erreur ${res.status}`);
  }
  return (await res.json()) as T;
}

/** `GET /api/missions/today` — la mission ÉLUE + sa raison, ou état serein (`elected: null`). */
export async function fetchToday(): Promise<MissionTodayResponse> {
  return asJson(await fetch(`${API_URL}/api/missions/today`, { headers: headers() }));
}

/** `GET /api/missions` — toutes les missions validées (regroupement par matière fait côté client). */
export async function fetchMissions(): Promise<Mission[]> {
  return asJson(await fetch(`${API_URL}/api/missions`, { headers: headers() }));
}

/** `GET /api/missions/completed-today` — terminées du jour + verdict (deux issues positives) + XP. */
export async function fetchCompletedToday(): Promise<CompletedMission[]> {
  return asJson(await fetch(`${API_URL}/api/missions/completed-today`, { headers: headers() }));
}

export async function startMission(missionId: number): Promise<Mission> {
  const mission = await asJson<Mission>(
    await fetch(`${API_URL}/api/missions/${missionId}/start`, {
      method: "POST",
      headers: headers(),
    }),
  );
  notifyNewsChanged(); // la mission n'est plus « jamais démarrée » (ADR-0030 §5)
  return mission;
}

export async function completeStep(
  missionId: number,
  stepId: number,
): Promise<StepCompleteResult> {
  return asJson(
    await fetch(`${API_URL}/api/missions/${missionId}/steps/${stepId}/complete`, {
      method: "POST",
      headers: headers(),
    }),
  );
}
