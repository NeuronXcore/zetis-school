// Appels à la boucle ELI5 du backend (Étape 10).
import { API_URL, authClient } from "./authClient";

export interface Skill {
  id: number;
  name: string;
  subject: string;
}

export interface Eli5Explain {
  skill_id: number;
  title: string;
  simple_explanation: string;
  analogy: string;
  example: string;
  common_mistake: string;
  check_question: string;
  next_action: string;
}

export interface Eli5Reverse {
  score: number;
  feedback: string;
  missing_points: string[];
  next_action: string;
}

function headers(): HeadersInit {
  const token = authClient.getToken();
  const base: HeadersInit = { "Content-Type": "application/json" };
  return token ? { ...base, Authorization: `Bearer ${token}` } : base;
}

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`Erreur ${res.status}`);
  return (await res.json()) as T;
}

export async function fetchSkills(): Promise<Skill[]> {
  return asJson(await fetch(`${API_URL}/api/ai/eli5/skills`, { headers: headers() }));
}

export async function explainEli5(skillId: number): Promise<Eli5Explain> {
  return asJson(
    await fetch(`${API_URL}/api/ai/eli5/explain`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ skill_id: skillId }),
    }),
  );
}

export async function reverseEli5(skillId: number, answerText: string): Promise<Eli5Reverse> {
  return asJson(
    await fetch(`${API_URL}/api/ai/eli5/reverse-evaluate`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ skill_id: skillId, answer_text: answerText }),
    }),
  );
}
