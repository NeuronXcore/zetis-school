// Client API de la page Papa « Cartes de révision » (pilotage SRS, ADR-0013).
// Types partagés depuis @zetis/types (contrat unique front/back). Rôle parent côté backend.
import {
  type SrsCardContent,
  type SrsCardDeleteResult,
  type SrsCardsOverview,
  type SrsCardUpdate,
  type SrsDeleteResult,
  type SrsReactivateResult,
  type SrsSkillGenerateResult,
  type SrsSubjectGenerateResult,
  type SrsSubjectTree,
} from "@zetis/types";
import { API_URL } from "./authClient";
import { asJson, authHeader, jsonHeaders } from "./httpClient";
import { lancerEtSuivre, type SuiviTravail } from "./travaux";

const BASE = `${API_URL}/api/memory/cards`;

/** KPI globaux + résumé par matière (léger, chargé au montage). */
export async function fetchCardsOverview(): Promise<SrsCardsOverview> {
  return asJson(await fetch(`${BASE}/overview`, { headers: authHeader() }));
}

/** Arbre chapitre → leçon → notion d'une matière (à la demande, au dépliage). */
export async function fetchSubjectTree(subjectId: number): Promise<SrsSubjectTree> {
  return asJson(await fetch(`${BASE}/subjects/${subjectId}`, { headers: authHeader() }));
}

/** Réconciliation par matière (génère les notions cibles + suspend les orphelines). */
export async function generateSubjectCards(
  subjectId: number,
  onEtat?: SuiviTravail,
): Promise<SrsSubjectGenerateResult> {
  // 202 + sondage (ADR-0041 §4). ⚠️ La sortie du travail EST le compte-rendu d'autrefois
  // (`created`, `skipped`…) : rien n'a été perdu, tout a été déplacé.
  return lancerEtSuivre<SrsSubjectGenerateResult>(
    `${BASE}/subjects/${subjectId}/generate`,
    { method: "POST", headers: authHeader() },
    onEtat,
  );
}

/** Génération / relance / régénération unitaire d'une notion. */
export async function generateSkillCards(
  skillId: number,
  onEtat?: SuiviTravail,
): Promise<SrsSkillGenerateResult> {
  return lancerEtSuivre<SrsSkillGenerateResult>(
    `${BASE}/skills/${skillId}/generate`,
    { method: "POST", headers: authHeader() },
    onEtat,
  );
}

/** Recto/verso des cartes d'une notion (aperçu, à la demande). */
export async function fetchSkillCards(skillId: number): Promise<SrsCardContent[]> {
  return asJson(await fetch(`${BASE}/skills/${skillId}/cards`, { headers: authHeader() }));
}

/** Réactive une notion suspendue (planification intacte). */
export async function reactivateSkill(skillId: number): Promise<SrsReactivateResult> {
  return asJson(
    await fetch(`${BASE}/skills/${skillId}/reactivate`, { method: "POST", headers: authHeader() }),
  );
}

/** Retrait explicite (supprime les cartes ET leur historique). Seule action destructive. */
export async function deleteSkillCards(skillId: number): Promise<SrsDeleteResult> {
  return asJson(
    await fetch(`${BASE}/skills/${skillId}`, { method: "DELETE", headers: authHeader() }),
  );
}

/** Édite le recto/verso d'UNE carte (correction manuelle) — planification préservée. */
export async function updateCard(cardId: number, body: SrsCardUpdate): Promise<SrsCardContent> {
  return asJson(
    await fetch(`${BASE}/${cardId}`, {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify(body),
    }),
  );
}

/** Supprime UNE carte (+ son historique). */
export async function deleteCard(cardId: number): Promise<SrsCardDeleteResult> {
  return asJson(await fetch(`${BASE}/${cardId}`, { method: "DELETE", headers: authHeader() }));
}
