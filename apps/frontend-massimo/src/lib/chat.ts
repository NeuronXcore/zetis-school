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

export type ChatDataKind = "agenda" | "reviews" | "missions";

/** Action d'orchestration ANCRÉE serveur (ADR-0027) — jamais hallucinée. `navigate` porte une
 *  route réelle (construite depuis un id validé) ; `show_data` = le front récupère l'endpoint et
 *  rend une carte inline. */
/** Une entrée du menu d'une notion (contenu disponible + route ancrée). */
export interface ChatMenuItem {
  kind: string;
  route: string;
  label: string;
}

export interface ChatAction {
  kind: "navigate" | "show_data" | "notion_menu" | "request_notion";
  label: string;
  route?: string | null;
  data?: ChatDataKind | null;
  /** notion_menu : nom de la notion + liste des contenus disponibles (chacun tapable → navigation). */
  name?: string | null;
  items?: ChatMenuItem[] | null;
  /** request_notion : la notion HORS-PROGRAMME à proposer à Papa (le tap crée un notion_request). */
  text?: string | null;
  /** `true` : offre IMPLICITE (Massimo a nommé une notion) → toujours une carte à taper, même à la
   *  voix. `false`/absent : demande EXPLICITE → auto-navigation vocale autorisée. */
  confirm?: boolean;
}

export interface ChatReply {
  session_id: string;
  turn_index: number;
  reply: string;
  skill_id: number | null;
  tool_suggestion: ChatToolType | null;
  difficulty_declared: boolean;
  action?: ChatAction | null;
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

/** Levée sur 503 : moteur TTS absent côté serveur → l'UI retombe sur le karaoké muet (Lot 1). */
export class ChatVoiceUnavailable extends Error {
  constructor() {
    super("Voix indisponible");
    this.name = "ChatVoiceUnavailable";
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

/** Voix de ZETIS (Lot 2) : synthèse LOCALE du texte de réponse → WAV. 503 → karaoké muet. */
export async function synthesizeChatSpeech(text: string): Promise<ArrayBuffer> {
  const res = await fetch(`${API_URL}/api/student/chat/tts`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ text }),
  });
  if (res.status === 503) throw new ChatVoiceUnavailable();
  if (!res.ok) throw new Error(`Erreur ${res.status}`);
  return res.arrayBuffer();
}

export async function closeChatSession(sessionId: string): Promise<void> {
  // Purge serveur. Best-effort : quitter sans fermer est OK (le TTL s'en charge).
  await fetch(`${API_URL}/api/student/chat/sessions/${sessionId}/close`, {
    method: "POST",
    headers: headers(),
  });
}
