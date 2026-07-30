// Client du chat ZETIS (ADR-0026, slice A backend). Le verbatim est ÉPHÉMÈRE : aucune donnée de
// conversation n'est stockée côté front au-delà de l'état React de la session — aucun stockage
// local persistant (test-verrou). La réponse d'un tour arrive INLINE (pas de polling `/ai/jobs` :
// faire transiter le verbatim par `ai_jobs` violerait « aveugle au contenu », ADR-0026 §1c).
import { API_URL, authClient } from "./authClient";

export interface ChatSession {
  session_id: string;
  transparency: string;
}

export type ChatToolType = "eli5" | "fiche" | "mindmap" | "revision";

export interface ChatReply {
  session_id: string;
  turn_index: number;
  reply: string;
  skill_id: number | null;
  tool_suggestion: ChatToolType | null;
  difficulty_declared: boolean;
}

export interface ChatToolResponse {
  tool_type: string;
  accepted: boolean;
}

/** Levée sur 429 : quota de tours de la session atteint → l'UI affiche un état doux, pas une punition. */
export class ChatQuotaReached extends Error {
  constructor() {
    super("Quota de session atteint");
    this.name = "ChatQuotaReached";
  }
}

/** Levée sur 404 : session expirée (TTL) ou close → l'UI en ouvre une nouvelle. */
export class ChatSessionExpired extends Error {
  constructor() {
    super("Session expirée");
    this.name = "ChatSessionExpired";
  }
}

function headers(): HeadersInit {
  const token = authClient.getToken();
  const base: HeadersInit = { "Content-Type": "application/json" };
  return token ? { ...base, Authorization: `Bearer ${token}` } : base;
}

async function asJson<T>(res: Response): Promise<T> {
  if (res.status === 429) throw new ChatQuotaReached();
  if (res.status === 404) throw new ChatSessionExpired();
  if (!res.ok) throw new Error(`Erreur ${res.status}`);
  return (await res.json()) as T;
}

export async function createChatSession(): Promise<ChatSession> {
  return asJson(
    await fetch(`${API_URL}/api/student/chat/sessions`, {
      method: "POST",
      headers: headers(),
    }),
  );
}

export async function sendChatMessage(
  sessionId: string,
  body: { text?: string; tool_response?: ChatToolResponse },
): Promise<ChatReply> {
  return asJson(
    await fetch(`${API_URL}/api/student/chat/sessions/${sessionId}/messages`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
    }),
  );
}

export async function closeChatSession(sessionId: string): Promise<void> {
  // Purge serveur. Best-effort : quitter sans fermer est OK (le TTL s'en charge).
  await fetch(`${API_URL}/api/student/chat/sessions/${sessionId}/close`, {
    method: "POST",
    headers: headers(),
  });
}
