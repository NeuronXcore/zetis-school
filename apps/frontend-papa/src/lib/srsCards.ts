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
export async function generateSubjectCards(subjectId: number): Promise<SrsSubjectGenerateResult> {
  return asJson(
    await fetch(`${BASE}/subjects/${subjectId}/generate`, {
      method: "POST",
      headers: authHeader(),
    }),
  );
}

/** Génération / relance / régénération unitaire d'une notion. */
export async function generateSkillCards(skillId: number): Promise<SrsSkillGenerateResult> {
  return asJson(
    await fetch(`${BASE}/skills/${skillId}/generate`, { method: "POST", headers: authHeader() }),
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
