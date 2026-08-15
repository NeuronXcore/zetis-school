// Client du chat ZETIS (ADR-0026, slice A backend). Le verbatim est ÉPHÉMÈRE : aucune donnée de
// conversation n'est stockée côté front au-delà de l'état React de la session — aucun stockage
// local persistant (test-verrou). La réponse d'un tour arrive INLINE (pas de polling `/ai/jobs` :
// faire transiter le verbatim par `ai_jobs` violerait « aveugle au contenu », ADR-0026 §1c).
import { API_URL, authClient } from "./authClient";

/** Réponse aux demandes que Massimo avait formulées (addendum ADR-0026). Composée SERVEUR, en
 *  Python, déterministe — jamais par le LLM. `actions` peut être vide (une notion tout juste
 *  ajoutée au programme s'annonce même quand son contenu n'existe pas encore). */
export interface ChatAnnouncement {
  text: string;
  actions: ChatAction[];
}

export interface ChatSession {
  session_id: string;
  transparency: string;
  /** Présente uniquement quand une demande triée est RÉELLEMENT servable. « Fait » côté Papa ne
   *  suffit pas : le serveur vérifie la disponibilité, jamais le statut. */
  announcement?: ChatAnnouncement | null;
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
  /** Notion portée par l'action, quand elle en porte une : sert à ancrer la trace du tap. */
  skill_id?: number | null;
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
  /** `null` quand le tour n'était pas une question de fond : la puce ne s'affiche pas. */
  grounding?: ChatGrounding | null;
  /** Interrogation orale en cours (ADR-0059 §10), ou `null`. */
  recall?: ChatRecall | null;
}

export interface ChatToolResponse {
  tool_type: string;
  accepted: boolean;
  /** Notion portée par la carte tapée, réémise telle que le serveur l'avait donnée. Le serveur la
   *  REVALIDE avant de l'écrire au journal — le front ne décide de rien, il rend ce qu'il a reçu. */
  skill_id?: number | null;
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

/** Sur quoi la réponse de ZETIS s'appuie (ADR-0059 §7). **Calculé serveur** : le front l'affiche,
 *  il ne le déduit jamais — la déclaration du moteur n'arrive même pas jusqu'ici. */
export interface ChatGrounding {
  kind: "cours" | "extraits" | "aucune";
  lesson_title?: string | null;
  sources_used?: number;
}

/** Où en est l'interrogation orale (ADR-0059 §10). `null` = aucune en cours.
 *
 *  ⚠️ **Un repère de progression, jamais un score.** Il n'y a ni compteur d'erreurs ni bilan :
 *  les règles de gamification du projet interdisent le décompte anxiogène, et un enfant qui voit
 *  « 1/2 » cesse de répondre pour protéger son chiffre. */
export interface ChatRecall {
  asked: number;
  total: number;
  skill_name: string;
  finished: boolean;
}

/** Levée sur 503 : moteur STT absent → l'UI masque le micro (dégradation propre, ADR-0012). */
export class ChatDictationUnavailable extends Error {
  constructor() {
    super("Dictée indisponible");
    this.name = "ChatDictationUnavailable";
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

/** Dictée du chat → texte. Whisper LOCAL, sa PROPRE route (ADR-0059 §18).
 *
 *  ⚠️ Ce n'est pas `transcribeEli5` déguisé : jusqu'au 2026-08-15, `ChatPage` appelait
 *  `/api/ai/eli5/transcribe`, dont la trace serveur ÉCRIVAIT les phrases de Massimo en base
 *  (78 lignes mesurées). La route du chat ne trace que des métadonnées, et son `job_type` dit
 *  enfin de quelle surface vient la dictée — ce que le partage rendait indistinguable.
 */
export async function transcribeChat(audio: Blob): Promise<{ transcript: string }> {
  // Multipart : on n'impose PAS de Content-Type (le navigateur pose la boundary).
  const token = authClient.getToken();
  const form = new FormData();
  form.append("file", audio, "dictee.webm");
  const res = await fetch(`${API_URL}/api/student/chat/transcribe`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  if (res.status === 503) throw new ChatDictationUnavailable();
  if (!res.ok) throw new Error(`Erreur ${res.status}`);
  return (await res.json()) as { transcript: string };
}

export async function closeChatSession(sessionId: string): Promise<void> {
  // Purge serveur. Best-effort : quitter sans fermer est OK (le TTL s'en charge).
  await fetch(`${API_URL}/api/student/chat/sessions/${sessionId}/close`, {
    method: "POST",
    headers: headers(),
  });
}
