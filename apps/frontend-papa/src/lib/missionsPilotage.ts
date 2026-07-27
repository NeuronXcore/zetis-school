// Client de la page « Missions — pilotage » (ADR-0017 lot 2).
// Frontière serveur stricte : cette page consomme `MissionPilotOut` (sur-ensemble analytique) —
// les champs `score`/`factors`/`generation_reason`/preuves brutes n'existent QUE sur ces routes,
// jamais dans la vue Massimo. La frontière est serveur, jamais un filtrage front.
import { API_URL, authClient } from "./authClient";

// --- Preuves & étapes (valeurs brutes, interdites côté Massimo) ---------------------------
export interface StepProof {
  label: string;
  value: number | null; // score reverse / quiz ; null si non disponible
  satisfied: boolean;
}

export interface MissionStepPilot {
  id: number;
  step_type: string;
  instruction: string | null;
  resource_id: number | null;
  sort_order: number;
  status: string;
  proof: StepProof;
}

export interface MissionPilot {
  id: number;
  subject: string;
  subject_id: number | null;
  skill_id: number | null;
  skill_name: string | null;
  title: string;
  description: string | null;
  mission_type: string;
  status: string;
  validation_status: string;
  priority: number;
  created_by: string;
  generation_reason: string;
  // ADR-0018 : analytiques Papa (absents du schéma student).
  force_priority: boolean;
  due_date: string | null;
  steps: MissionStepPilot[];
}

// --- Commander une mission (ADR-0018) : preview/confirm sans état ---------------------------
export interface CommandNotion {
  skill_id: number;
  name: string;
  level: string | null;
  mastery: number;
  fragility: number;
  checked: boolean;
}

export interface CommandPreview {
  scope_label: string;
  notions: CommandNotion[];
  compose_note: string;
}

export interface CommandConfirmPayload {
  gate: string; // "deadline" | "theme_ref"
  chapter_id?: number;
  due_date?: string | null;
  skill_ids: number[];
  force_priority: boolean;
}

/** Plafond de notions cochées par commande (miroir de MISSION_COMMAND_MAX_SKILLS ; le
 *  backend fait foi via un 422). */
export const MISSION_COMMAND_MAX_SKILLS = 3;

// --- Défi champion croisé (ADR-0022) : multi-matières, multi-outils, verdict par notion --------
export type ChampionFlavor = "boss" | "consolidation" | "mix";

export interface ChampionNotion {
  skill_id: number;
  name: string;
  subject_id: number;
  subject_name: string;
  level: string | null;
  mastery: number;
  fragility: number;
  status: string | null;
  checked: boolean;
}

export interface ChampionPreview {
  flavor: string;
  scope_label: string;
  notions: ChampionNotion[];
  compose_note: string;
}

/** Résumé d'équipement d'une notion (ADR-0021, réutilisé au confirm). */
export interface EquipResult {
  skill_id: number;
  skill_name: string;
  has_lesson: boolean;
  generated: string[];
  skipped: string[];
  errors: { piece: string; message: string }[];
  reason: string | null;
}

export interface ChampionCreateResponse {
  mission: MissionPilot | null;
  equipment: EquipResult[];
}

/** Plafond de notions d'un défi champion (miroir de MISSION_CHAMPION_MAX_SKILLS ; le backend
 *  fait foi via un 422). */
export const MISSION_CHAMPION_MAX_SKILLS = 3;

// --- Élection (recalculée à la demande — sélecteur déterministe) ---------------------------
export interface ElectionFactor {
  name: string;
  value: number;
  weight: number;
  contribution: number;
  dominant: boolean;
}

export interface ElectionAlternative {
  mission: MissionPilot;
  score: number;
}

export interface Election {
  elected: MissionPilot | null;
  score: number | null;
  factors: ElectionFactor[];
  scoring_version: string;
  reason: string;
  reason_code: string;
  alternatives: ElectionAlternative[];
}

// --- Verdicts & KPI -----------------------------------------------------------------------
export interface Verdict {
  mission_id: number | null;
  mission_type: string | null;
  verdict: string | null; // acquired | review_later
  quiz_score: number | null;
  reverse_score: number | null;
  mindmap_score: number | null; // ADR-0019 : signal de rappel alternatif
  xp: number | null;
  effect: string | null;
  skill_id: number | null;
  subject_id: number | null;
}

export interface PilotSummary {
  pending: number;
  pool: number;
  completed_this_week: number;
  acquired_rate_30d: number; // 0..1
}

export interface ValidateResponse {
  validated: number;
}

function headers(): HeadersInit {
  const token = authClient.getToken();
  const base: HeadersInit = { "Content-Type": "application/json" };
  return token ? { ...base, Authorization: `Bearer ${token}` } : base;
}

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `Erreur ${res.status}`;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      // réponse non-JSON
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

export function fetchPilotSummary(): Promise<PilotSummary> {
  return fetch(`${API_URL}/api/missions/pilot/summary`, { headers: headers() }).then((r) =>
    asJson<PilotSummary>(r),
  );
}

export function fetchPending(): Promise<MissionPilot[]> {
  return fetch(`${API_URL}/api/missions/pending`, { headers: headers() }).then((r) =>
    asJson<MissionPilot[]>(r),
  );
}

export function fetchElectionToday(): Promise<Election> {
  return fetch(`${API_URL}/api/missions/election/today`, { headers: headers() }).then((r) =>
    asJson<Election>(r),
  );
}

export function fetchPilotList(type?: string, subject?: string): Promise<MissionPilot[]> {
  const qs = new URLSearchParams();
  if (type) qs.set("type", type);
  if (subject) qs.set("subject", subject);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return fetch(`${API_URL}/api/missions/pilot${suffix}`, { headers: headers() }).then((r) =>
    asJson<MissionPilot[]>(r),
  );
}

export function fetchRecentVerdicts(): Promise<Verdict[]> {
  return fetch(`${API_URL}/api/missions/verdicts/recent`, { headers: headers() }).then((r) =>
    asJson<Verdict[]>(r),
  );
}

export function validateMissions(ids: number[]): Promise<ValidateResponse> {
  return fetch(`${API_URL}/api/missions/validate`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ ids }),
  }).then((r) => asJson<ValidateResponse>(r));
}

export function rejectMission(id: number): Promise<{ id: number; validation_status: string }> {
  return fetch(`${API_URL}/api/missions/${id}/reject`, {
    method: "POST",
    headers: headers(),
  }).then((r) => asJson<{ id: number; validation_status: string }>(r));
}

export function commandPreview(gate: string, chapterId: number): Promise<CommandPreview> {
  return fetch(`${API_URL}/api/missions/command/preview`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ gate, chapter_id: chapterId }),
  }).then((r) => asJson<CommandPreview>(r));
}

export function commandConfirm(payload: CommandConfirmPayload): Promise<MissionPilot[]> {
  return fetch(`${API_URL}/api/missions/command/confirm`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(payload),
  }).then((r) => asJson<MissionPilot[]>(r));
}

export function championPreview(
  subjectIds: number[],
  flavor: ChampionFlavor,
): Promise<ChampionPreview> {
  return fetch(`${API_URL}/api/missions/champion/preview`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ subject_ids: subjectIds, flavor }),
  }).then((r) => asJson<ChampionPreview>(r));
}

export function championConfirm(
  skillIds: number[],
  flavor: ChampionFlavor,
): Promise<ChampionCreateResponse> {
  return fetch(`${API_URL}/api/missions/champion/confirm`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ skill_ids: skillIds, flavor }),
  }).then((r) => asJson<ChampionCreateResponse>(r));
}

// --- Cycle de vie d'une mission (Papa) : delete / regenerate / patch / éditeur de parcours ---
export interface MissionPatch {
  title?: string;
  description?: string;
  priority?: number;
  force_priority?: boolean;
  due_date?: string | null;
}

export interface StepOption {
  step_type: string;
  available: boolean;
  resource_id: number | null;
  selected: boolean;
}

export interface StepOptions {
  options: StepOption[];
  current_types: string[];
  editable: boolean;
}

export function deleteMission(id: number): Promise<{ deleted: boolean; id: number }> {
  return fetch(`${API_URL}/api/missions/${id}`, { method: "DELETE", headers: headers() }).then(
    (r) => asJson<{ deleted: boolean; id: number }>(r),
  );
}

export function regenerateMission(id: number): Promise<MissionPilot> {
  return fetch(`${API_URL}/api/missions/${id}/regenerate`, {
    method: "POST",
    headers: headers(),
  }).then((r) => asJson<MissionPilot>(r));
}

export function patchMission(id: number, body: MissionPatch): Promise<MissionPilot> {
  return fetch(`${API_URL}/api/missions/${id}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(body),
  }).then((r) => asJson<MissionPilot>(r));
}

export function fetchStepOptions(id: number): Promise<StepOptions> {
  return fetch(`${API_URL}/api/missions/${id}/step-options`, { headers: headers() }).then((r) =>
    asJson<StepOptions>(r),
  );
}

export function setMissionSteps(id: number, stepTypes: string[]): Promise<MissionPilot> {
  return fetch(`${API_URL}/api/missions/${id}/steps`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify({ step_types: stepTypes }),
  }).then((r) => asJson<MissionPilot>(r));
}

// Signal (sans store global) : la page émet après validate/reject, la sidebar réécoute pour
// rafraîchir le compteur ambré « à valider » sur l'entrée Missions.
export const MISSIONS_PENDING_EVENT = "zetis:missions-pending-changed";

export function notifyPendingChanged(): void {
  window.dispatchEvent(new Event(MISSIONS_PENDING_EVENT));
}
