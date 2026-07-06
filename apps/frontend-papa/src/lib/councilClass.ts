// Client de la page « Conseil de classe IA » (ADR-0020).
// Papa-only : narration LLM locale posée sur le service d'évidence ; les recommandations sont
// des `skill_id` ancrés (revalidés serveur). Le pont d'actionnabilité réutilise le flux Commander
// (missions `manual` validées par le clic). Types locaux (patron des libs pilotage Papa).
import { API_URL, authClient } from "./authClient";
import type { MissionPilot } from "./missionsPilotage";

export interface CouncilRecommendation {
  skill_ids: number[];
  skill_names: string[];
  mission_type: string; // "manual" en v1
  template_hint: string | null;
  justification: string;
}

export interface CouncilSubject {
  subject_id: number;
  subject_name: string;
  strengths: string;
  to_reinforce: string;
  recent_evolution: string;
  recommendations: CouncilRecommendation[];
}

export interface CouncilReport {
  id: number;
  period: string;
  global_summary: string;
  subjects: CouncilSubject[];
  prompt_version: string;
  created_at: string | null;
}

export interface CouncilReportListItem {
  id: number;
  period: string;
  subjects_count: number;
  created_at: string | null;
}

export interface EquipPieceError {
  piece: string;
  message: string;
}

export interface EquipNotionResult {
  skill_id: number;
  skill_name: string;
  has_lesson: boolean;
  generated: string[];
  skipped: string[];
  errors: EquipPieceError[];
  reason: string | null;
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

export function generateCouncil(period?: string): Promise<CouncilReport> {
  return fetch(`${API_URL}/api/reports/class-council`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ period: period ?? null }),
  }).then((r) => asJson<CouncilReport>(r));
}

export function fetchCouncilReports(): Promise<CouncilReportListItem[]> {
  return fetch(`${API_URL}/api/reports/class-council`, { headers: headers() }).then((r) =>
    asJson<CouncilReportListItem[]>(r),
  );
}

export function fetchCouncilReport(id: number): Promise<CouncilReport> {
  return fetch(`${API_URL}/api/reports/class-council/${id}`, { headers: headers() }).then((r) =>
    asJson<CouncilReport>(r),
  );
}

/** Équipe une notion : ZETIS génère + auto-valide son kit (cours/fiche/SRS/quiz/mindmap). */
export function equipNotion(skillId: number): Promise<EquipNotionResult> {
  return fetch(`${API_URL}/api/reports/class-council/equip-notion`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ skill_id: skillId }),
  }).then((r) => asJson<EquipNotionResult>(r));
}

export function createMissionsFromReco(
  skillIds: number[],
  forcePriority = false,
): Promise<MissionPilot[]> {
  return fetch(`${API_URL}/api/reports/class-council/create-missions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ skill_ids: skillIds, force_priority: forcePriority }),
  }).then((r) => asJson<MissionPilot[]>(r));
}

/** Pont croisé (ADR-0022 §8) : notions déjà équipées → UNE mission `champion` multi-matières.
 *  Compose seul (l'équipement passe par `equipNotion`, en amont). */
export function composeChampionFromReco(
  skillIds: number[],
  flavor = "consolidation",
): Promise<MissionPilot> {
  return fetch(`${API_URL}/api/reports/class-council/create-champion`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ skill_ids: skillIds, flavor }),
  }).then((r) => asJson<MissionPilot>(r));
}

/** Export Markdown côté client (aucune route — ADR-0020). */
export function reportToMarkdown(report: CouncilReport): string {
  const lines: string[] = [
    `# Conseil de classe — ${report.period}`,
    "",
    report.global_summary,
    "",
  ];
  for (const s of report.subjects) {
    lines.push(`## ${s.subject_name}`, "");
    if (s.strengths) lines.push(`**Points forts :** ${s.strengths}`);
    if (s.to_reinforce) lines.push(`**À renforcer :** ${s.to_reinforce}`);
    if (s.recent_evolution) lines.push(`**Évolution récente :** ${s.recent_evolution}`);
    for (const r of s.recommendations) {
      lines.push("", `- **Action** (${r.skill_names.join(", ")}) — ${r.justification}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
