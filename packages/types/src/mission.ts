// Contrat missions — vue élève (Massimo). Frontière serveur stricte (ADR-0017 §3) : JAMAIS de
// score, de facteur ni de motif de génération. Le pilotage Papa a son propre sur-ensemble
// analytique (`MissionPilotOut`, non exposé ici). Miroir des schémas backend `MissionStudentOut`
// / `TodayResponse` / `StepCompleteResponse` / `CompletedMissionOut`.

/** Une étape typée du parcours. Sa complétion est prouvée SERVEUR (jamais déclarée par le client). */
export interface MissionStep {
  id: number;
  /** "lesson" | "eli5" | "vocal_explain" | "quiz" | "mindmap". */
  step_type: string;
  instruction: string | null;
  /** Cible du deep-link : skill_id (eli5/vocal), quiz_id (quiz), mindmap_id (mindmap). */
  resource_id: number | null;
  sort_order: number;
  /** "pending" | "done". */
  status: string;
}

/** Une mission = un petit parcours. `estimated_minutes`/`xp_reward` = affichage enfant (l'XP
 * récompense l'effort, pas la performance : c'est le seul nombre montré, aucun score). */
export interface Mission {
  id: number;
  subject: string;
  skill_id: number | null;
  skill_name: string | null;
  title: string;
  description: string | null;
  /** "remediation" | "revision" | "progression" | "manual". */
  mission_type: string;
  /** "planned" | "active" | "completed". */
  status: string;
  priority: number;
  estimated_minutes: number;
  xp_reward: number;
  steps: MissionStep[];
}

/** `GET /api/missions/today` — la mission ÉLUE + sa raison (texte servi, jamais recomposé), ou
 * état serein (`elected: null`). Les alternatives sont ≤ 2. */
export interface MissionTodayResponse {
  elected: Mission | null;
  reason: string;
  reason_code: string;
  scoring_version: string;
  alternatives: Mission[];
}

/** `POST /api/missions/{id}/steps/{step_id}/complete` — la dernière étape porte le verdict. */
export interface StepCompleteResult {
  mission_status: string;
  verdict: "acquired" | "review_later" | null;
  xp_awarded: number;
}

/** `GET /api/missions/completed-today` — verdict à deux issues (toutes deux positives) + XP. */
export interface CompletedMission {
  mission_id: number;
  title: string;
  subject: string;
  verdict: "acquired" | "review_later";
  xp: number;
}
