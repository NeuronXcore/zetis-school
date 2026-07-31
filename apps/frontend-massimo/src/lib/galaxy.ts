// Appels ZETIS Galaxy — graphe des connaissances de Massimo (ADR-0024).
//
// Trois routes ÉLÈVE, aucune donnée de pilotage Papa. Le client ne calcule RIEN : ni état,
// ni comptage, ni règle de repli sur les actions. Il rend ce que le serveur envoie.
import type {
  GalaxyConstellation,
  GalaxyFullGraph,
  GalaxyNotion,
  GalaxyOverview,
  GalaxyTimeline,
} from "@zetis/types";
import { API_URL, authClient } from "./authClient";

function headers(): HeadersInit {
  const token = authClient.getToken();
  const base: HeadersInit = { "Content-Type": "application/json" };
  return token ? { ...base, Authorization: `Bearer ${token}` } : base;
}

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`Erreur ${res.status}`);
  return (await res.json()) as T;
}

/** Vue d'ensemble : une constellation par matière, avec son COMPTE d'étoiles allumées. */
export async function fetchGalaxyOverview(): Promise<GalaxyOverview> {
  return asJson(await fetch(`${API_URL}/api/student/galaxy`, { headers: headers() }));
}

/** Constellation d'une matière : amas (chapitres), étoiles (notions), arêtes de structure. */
export async function fetchConstellation(subjectSlug: string): Promise<GalaxyConstellation> {
  return asJson(
    await fetch(`${API_URL}/api/student/galaxy/${encodeURIComponent(subjectSlug)}`, {
      headers: headers(),
    }),
  );
}

/** Toutes les matières dans un seul graphe (Accueil) — `root` → matières → chapitres → notions. */
export async function fetchFullGraph(): Promise<GalaxyFullGraph> {
  return asJson(await fetch(`${API_URL}/api/student/galaxy/all`, { headers: headers() }));
}

/** Frise de progression, MONOTONE : les notions comptées au jour de leur première fois. */
export async function fetchGalaxyTimeline(): Promise<GalaxyTimeline> {
  return asJson(await fetch(`${API_URL}/api/student/galaxy/timeline`, { headers: headers() }));
}

/** La frise AVEC le détail par notion — pour le rejeu animé (ADR-0029).
 *
 * Appelée seulement à l'ouverture de la modale de rejeu, jamais au chargement de l'Accueil :
 * c'est une charge utile plus lourde, et personne n'en a besoin avant le clic. */
export async function fetchGalaxyTimelineWithSkills(): Promise<GalaxyTimeline> {
  return asJson(
    await fetch(`${API_URL}/api/student/galaxy/timeline?with_skills=true`, { headers: headers() }),
  );
}

/** Panneau d'actions d'une notion — toute la panoplie, avec sa disponibilité. */
export async function fetchNotionPanel(skillId: number): Promise<GalaxyNotion> {
  return asJson(
    await fetch(`${API_URL}/api/student/galaxy/notion/${skillId}`, { headers: headers() }),
  );
}
