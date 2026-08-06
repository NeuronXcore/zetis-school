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
  /** Sert la marque de lecture sans ouvrir le rapport. `""` = version inconnue, donc ancienne. */
  prompt_version: string;
}

/**
 * Ce qui distingue un rapport d'un autre dans la liste (2026-08-06).
 *
 * 🔴 Les pastilles n'affichaient que `period`. Neuf rapports lisaient donc « Trimestre 1 ·
 * Trimestre 1 · 7 derniers jours · … » — un historique où rien ne se distingue n'est pas un
 * historique, c'est une rangée de boutons. La date et la matière étaient DÉJÀ dans la charge
 * utile ; il manquait seulement de les écrire.
 *
 * ⚠️ La date est celle de la GÉNÉRATION, la seule vraie ici — `period` est une étiquette qui ne
 * sélectionne aucune donnée. Les mettre côte à côte, c'est justement ce qui rend la seconde
 * lisible pour ce qu'elle est.
 *
 * ⚠️ **L'HEURE, pas seulement le jour.** Une première version n'affichait que la date : deux
 * conseils générés le même jour redevenaient identiques, et c'est le cas courant — on en lance
 * plusieurs d'affilée en travaillant. Vu à l'écran, pas en test.
 *
 * ⚠️ **Formatage LOCAL, jamais `slice(0, 10)`** sur l'ISO. Ce découpage lit de l'UTC : un rapport
 * généré à 23 h 30 à Paris s'afficherait la veille. Même piège que `toISOString()` dans la grille
 * du calendrier, et je viens de le reproduire ici.
 */
export function libelleRapport(h: CouncilReportListItem): string {
  if (!h.created_at) return h.subject_name ?? "toutes matières";
  const d = new Date(h.created_at);
  const quand = `${d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  })} ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
  return `${quand} · ${h.subject_name ?? "toutes matières"}`;
}

/**
 * Un rapport antérieur au prompt v3 : son « évolution récente » n'était adossée à rien
 * (ADR-0040 §8). La marque est auto-périmée — elle s'éteint à mesure que les rapports datés
 * s'accumulent.
 *
 * ⚠️ **Une version ILLISIBLE est traitée comme ancienne.** La page en portait une copie qui
 * répondait l'inverse (`Number.isFinite(n) && n < 3` ⇒ pas de marque sur une version inconnue) :
 * deux fonctions pour la même question, avec deux réponses opposées sur le cas limite. Sur un
 * doute, on signale — dire « ce rapport est fiable » sans le savoir est la faute que tout ce
 * chantier corrige. Une seule implémentation désormais, et c'est celle-ci.
 */
export function rapportSansHistoriqueDate(promptVersion: string): boolean {
  const n = Number(promptVersion.replace(/^v/i, ""));
  return !Number.isFinite(n) || n < 3;
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
/** Équipe une notion — la route est ASYNCHRONE depuis l'ADR-0041, ce client attend quand même.
 *
 * ⚠️ **L'attente est délibérée, et elle protège un ORDRE.** `useCouncilClass` équipe N notions
 * *puis* crée les missions, « leurs étapes résolvent les ressources fraîches » : rendre l'appel
 * non bloquant sans rien d'autre ferait composer des missions sur un kit qui n'existe pas encore.
 * Découvert en migrant la route, absent du cadrage.
 *
 * Ce que le chantier change n'est donc pas *qui attend*, c'est *ce que Papa voit pendant* : la
 * requête HTTP ne tient plus 90 s, et la barre du header montre l'avancement réel, sur toutes les
 * pages, y compris si Papa navigue ailleurs.
 */
export async function equipNotion(skillId: number): Promise<EquipNotionResult> {
  const { job_id } = await fetch(`${API_URL}/api/reports/class-council/equip-notion`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ skill_id: skillId }),
  }).then((r) => asJson<{ job_id: number; status: string }>(r));

  // Sondage 2 s : l'équipement dure ~69 s par notion (mesuré le 2026-08-02), donc ~35 lectures
  // d'une ligne indexée. Le plafond existe pour qu'une panne du worker finisse par se dire au
  // lieu de laisser une promesse pendante à jamais.
  const DEBUT = Date.now();
  const PLAFOND_MS = 15 * 60_000;
  for (;;) {
    await new Promise((r) => setTimeout(r, 2000));
    const job = await fetch(`${API_URL}/api/ai/jobs/${job_id}`, { headers: headers() }).then((r) =>
      asJson<{ status: string; output: EquipNotionResult | null; error: string | null }>(r),
    );
    if (job.status === "succeeded" && job.output) return job.output;
    if (job.status === "failed") throw new Error(job.error ?? "L'équipement a échoué.");
    if (Date.now() - DEBUT > PLAFOND_MS) {
      throw new Error(
        "L'équipement n'a pas répondu — vérifie qu'un moteur de production tourne (barre du header).",
      );
    }
  }
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
