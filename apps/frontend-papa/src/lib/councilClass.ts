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

/** Une bascule de palier telle que le SERVEUR l'a mesurée (`evidence.mastery_transitions`). */
export interface CouncilTransition {
  skill_id: number;
  skill_name: string;
  /** `null` sur la plus ancienne bascule tracée d'une notion : la trace ne porte pas son palier
   *  de départ, et le déduire serait l'inventer. */
  from: string | null;
  to: string;
  changed_at: string;
}

/** `recent_evolution` d'un rapport **v4 ou plus** (ADR-0040 §8). */
export interface CouncilEvolution {
  /** ⚠️ `history_since`, JAMAIS `period` (§9) : `period` est une étiquette qui ne sélectionne
   *  aucune donnée, ceci est une date réelle. */
  since: string | null;
  transitions: CouncilTransition[];
  /** Seule part du modèle. `null` = il n'a rien commenté ; les bascules se rendent quand même. */
  comment: string | null;
}

export interface CouncilSubject {
  subject_id: number;
  subject_name: string;
  strengths: string;
  to_reinforce: string;
  /**
   * 🔴 **Trois formes, et l'écran les distingue** (ADR-0040 §8) :
   *   · `CouncilEvolution` — rapport v4+, des bascules datées et mesurées ;
   *   · `string` — rapport FIGÉ avant le Lot 3, dont la prose n'était adossée à rien. On ne
   *     réécrit aucun rapport : la marque de lecture `< v3` dit à l'écran ce qu'elle vaut ;
   *   · `null` — l'évidence ne portait aucune bascule. L'écran rend cette absence par une PHRASE,
   *     jamais par un blanc : « pas de trace » et « pas de mouvement » ne se corrigent pas l'un
   *     l'autre.
   */
  recent_evolution: CouncilEvolution | string | null;
  recommendations: CouncilRecommendation[];
}

/** Discrimine la structure de la prose figée. `typeof === "object"` seul ne suffirait pas :
 *  `null` est un objet en JavaScript, et le piège est classique. */
export function estEvolutionDatee(
  e: CouncilSubject["recent_evolution"],
): e is CouncilEvolution {
  return e !== null && typeof e === "object";
}

const PALIER_MOT: Record<string, string> = {
  mastered: "acquise",
  solid: "solide",
  learning: "en apprentissage",
  weak: "à renforcer",
  in_progress: "en cours",
  unknown: "non située",
};

/** Une bascule en mots de Papa. Un statut inconnu s'affiche TEL QUEL plutôt que d'être masqué :
 *  perdre une bascule serait pire que montrer un mot technique. */
export function libelleTransition(t: CouncilTransition): string {
  const vers = PALIER_MOT[t.to] ?? t.to;
  if (!t.from) return `première bascule tracée → ${vers}`;
  return `${PALIER_MOT[t.from] ?? t.from} → ${vers}`;
}

export interface CouncilReport {
  id: number;
  period: string;
  /** `null` = rapport GLOBAL. Une valeur = rapport CIBLÉ sur une matière (addendum ADR-0020). */
  subject_id: number | null;
  subject_name: string | null;
  global_summary: string;
  subjects: CouncilSubject[];
  prompt_version: string;
  created_at: string | null;
}

export interface CouncilReportListItem {
  id: number;
  period: string;
  subject_id: number | null;
  subject_name: string | null;
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

/** Génère un rapport et le FIGE. Il n'existe pas de mode aperçu : ce bouton écrit.
 *
 *  @param subjectId portée matière. `undefined` = synthèse toutes matières (comportement
 *  historique — les appelants existants n'ont pas à changer). */
export function generateCouncil(period?: string, subjectId?: number): Promise<CouncilReport> {
  return fetch(`${API_URL}/api/reports/class-council`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ period: period ?? null, subject_id: subjectId ?? null }),
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
    // L'export porte les DATES, pas seulement la prose : c'est ce fichier que Papa relira ou
    // enverra, et une évolution sans ses bascules y redeviendrait une affirmation sans preuve.
    if (estEvolutionDatee(s.recent_evolution)) {
      const e = s.recent_evolution;
      lines.push(`**Évolution récente** — sur la trace disponible depuis le ${e.since ?? "?"} :`);
      for (const t of e.transitions) {
        lines.push(`  - ${t.changed_at} · ${t.skill_name} — ${libelleTransition(t)}`);
      }
      if (e.comment) lines.push(`  ${e.comment}`);
    } else if (s.recent_evolution) {
      lines.push(`**Évolution récente :** ${s.recent_evolution}`);
    }
    for (const r of s.recommendations) {
      lines.push("", `- **Action** (${r.skill_names.join(", ")}) — ${r.justification}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
