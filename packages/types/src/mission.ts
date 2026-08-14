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
  /** Notion + matière de l'étape (ADR-0022) : renseignées pour une mission `champion` croisée
   * (badges matière par étape), sinon dérivées de la mission. Étiquettes, jamais un score. */
  skill_id: number | null;
  skill_name: string | null;
  subject: string;
  sort_order: number;
  /** "pending" | "done". */
  status: string;
}

/** Une mission = un petit parcours. `estimated_minutes`/`xp_reward` = affichage enfant (l'XP
 * récompense l'effort, pas la performance : c'est le seul nombre montré, aucun score). */
export interface Mission {
  id: number;
  subject: string;
  /** Slug de la matière — servi par le serveur depuis l'ADR-0057 (addendum Missions).
   *
   *  ⚠️ Il manquait, et le front le **devinait** : `nameToSlug[nom] ?? slugify(nom)`. Un nom
   *  accentué ne redonne pas toujours le bon slug, et la brique de rangement l'exige. */
  subject_slug: string;
  /** Chapitre **dérivé** de la notion via ses leçons validées (ADR-0057 addendum Missions §2/§3).
   *
   *  🔴 `null` quand la dérivation rend **zéro OU plusieurs** chapitres — on n'en choisit jamais
   *  un parmi plusieurs. Une notion comme « Priorités opératoires » est enseignée en Fractions
   *  **et** en Nombres relatifs : la ranger sous la première serait afficher du faux.
   *
   *  ⚠️ **Rien n'est persisté** : `missions` n'a aucune colonne de chapitre, et c'est le critère
   *  qui borne le chantier — une notion change de chapitres dès qu'une leçon est validée. */
  chapter_id: number | null;
  chapter: string | null;
  skill_id: number | null;
  skill_name: string | null;
  title: string;
  description: string | null;
  /** "remediation" | "revision" | "progression" | "manual". */
  mission_type: string;
  /** "planned" | "active" | "completed". */
  status: string;
  // ⚠️ Pas de champ d'auteur — `origin` ("papa"/"zetis") retiré le 2026-08-02. Une seule voix
  // côté Massimo : le contenu scolaire l'atteint sans auteur nommé, pour que cette voix reste
  // la même le jour où ZETIS produira seul. Le pilotage Papa garde `created_by`.
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
