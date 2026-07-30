// Liste d'attente de contenus réclamés par l'enfant (addendum ADR-0027) — contrat de
// `GET·PATCH /api/content-requests`. Sémantique INVERSE de `notion_requests` : ici la notion
// EXISTE (`skill_id` connu), ce qui manque est un type de contenu.

/** Vocabulaire fermé, aligné sur les surfaces de contenu (backend `service.CONTENT_KINDS`). */
export type ContentRequestKind = "cours" | "fiche" | "mindmap" | "quiz" | "capsule" | "card";

export type ContentRequestStatus = "pending" | "done" | "dismissed";

export interface ContentRequest {
  id: number;
  skill_id: number;
  /** Nom de la notion (jointure serveur) — rend le badge Papa lisible sans re-fetch. */
  skill_name: string | null;
  /** Matière de la notion — clé de fusion côté client avec la Couverture. */
  subject_id: number | null;
  /** Nom de la matière (jointure serveur) — pour grouper la liste des demandes. */
  subject_name: string | null;
  content_kind: ContentRequestKind;
  status: ContentRequestStatus;
  /** Origine (en v1, toujours `chat_orchestrator`). */
  source: string;
  created_at: string;
}
