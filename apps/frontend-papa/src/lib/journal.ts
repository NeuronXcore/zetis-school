// Client API du Journal de production et du veto (ADR-0034).
//
// ⚠️ Routeur DISTINCT de la Couverture (`/api/production/journal`, pas `/api/production`). La
// Couverture est documentée « lecture seule » et un test le garantit ; le veto écrit. Mélanger
// les deux clients ferait converger, à la première refactorisation, deux surfaces dont l'une ne
// doit jamais écrire.
import {
  type Journal,
  type PieceKind,
  type VetoPreview,
  type VetoRemoval,
} from "@zetis/types";
import { API_URL } from "./authClient";
import { asJson, authHeader } from "./httpClient";

const API = `${API_URL}/api/production/journal`;

/** Le flux des lots, filtré et trié SERVEUR sur toute l'histoire, puis paginé.
 *
 * ⚠️ `params` porte le filtre déjà sérialisé (`journalFilters.versUrl`) : ce client ne connaît pas
 * le vocabulaire des critères, et n'a pas à le connaître. Sans lui, la réponse est exactement
 * celle d'avant — aucun filtre par défaut, jamais.
 */
export async function fetchJournal(
  limit = 20,
  offset = 0,
  params?: URLSearchParams,
): Promise<Journal> {
  const query = new URLSearchParams(params);
  query.set("limit", String(limit));
  query.set("offset", String(offset));
  return asJson(await fetch(`${API}?${query}`, { headers: authHeader() }));
}

/** Ce que le retrait emporterait, sans rien supprimer — la modale l'annonce AVANT le geste. */
export async function previewRemoval(kind: PieceKind, id: number): Promise<VetoPreview> {
  return asJson(
    await fetch(`${API}/pieces/${kind}/${id}/removal`, { headers: authHeader() }),
  );
}

/** Retire une pièce. Lève sur 409 (déjà consommée, ou dérivé consommé pour un cours). */
export async function removePiece(kind: PieceKind, id: number): Promise<VetoRemoval> {
  return asJson(
    await fetch(`${API}/pieces/${kind}/${id}`, { method: "DELETE", headers: authHeader() }),
  );
}

export const PIECE_LABEL: Record<PieceKind, string> = {
  cours: "Cours",
  fiche: "Fiche",
  mindmap: "Carte mentale",
  quiz: "Quiz",
  srs: "Carte de révision",
};

export const PIECE_ICON: Record<PieceKind, string> = {
  cours: "📖",
  fiche: "📄",
  mindmap: "🧠",
  quiz: "✅",
  srs: "🗂️",
};

/** Ce que dit la provenance — par OBJET, jamais totalisée (§F.2).
 *
 *  `null` se lit « aucune étape de validation n'existe » (cartes SRS) ou « provenance antérieure
 *  à la traçabilité », jamais « non validé » : l'état est porté ailleurs. */
export const AUTHORITY_LABEL: Record<string, string> = {
  parent: "Vous, pièce à pièce",
  parent_bulk: "Vous, en lot",
  parent_rule: "ZETIS, sur votre règle",
  system: "Servi sans relecture (par doctrine)",
};

/** Qui a demandé CE lot. `parent_rule` n'est pas encore émis — il le sera avec l'ADR-0035. */
export const TRIGGER_LABEL: Record<string, string> = {
  manual: "Vous l'avez lancé",
  agenda: "Une échéance de l'agenda",
  request: "Une demande de Massimo",
  evidence: "Une lacune mesurée",
  derived: "Un contenu dérivé",
  council: "Un conseil de classe",
};

export const RUN_STATUS_LABEL: Record<string, string> = {
  queued: "En attente",
  running: "En cours",
  done: "Terminé",
  failed: "Interrompu",
  // Rendu par le serveur, jamais stocké : le worker n'a plus donné signe de vie.
  stale: "Sans réponse",
};
