// Client API des réglages Papa (ADR-0032). Routeur NEUTRE `/api/settings`, `require_parent`.
//
// ⚠️ Aucun catalogue de paliers ici. Le serveur envoie `choices` et `reason` par classe, et c'est
// lui qui refuse (422) : recopier la matrice du §G.2 côté front en ferait une seconde source de
// vérité, qui divergerait au premier ADR.
//
// ⚠️ Aucune fonction ne prend un « préréglage » : un régime est un raccourci d'ÉCRITURE qui se
// traduit en valeurs (`levelsForPreset`), jamais un état qu'on envoie. Le serveur le DÉRIVE en
// retour. Deux chemins d'écriture pour la même question, c'est ce que le §G.1 a refusé.
import { type Autonomy, type AutonomyLevel, type AutonomyPreset } from "@zetis/types";
import { API_URL } from "./authClient";
import { asJson, authHeader, jsonHeaders } from "./httpClient";

const BASE = `${API_URL}/api/settings`;

/** Les six classes, leurs paliers, leurs verrous, et le régime dérivé. */
export async function fetchAutonomy(): Promise<Autonomy> {
  return asJson(await fetch(`${BASE}/autonomy`, { headers: authHeader() }));
}

/** Écriture partielle : on n'envoie que ce qui change. 422 motivé sur toute valeur refusée. */
export async function saveAutonomy(values: Record<string, AutonomyLevel>): Promise<Autonomy> {
  return asJson(
    await fetch(`${BASE}/autonomy`, {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ values }),
    }),
  );
}

/** Libellé d'un palier, du point de vue de Papa — « qui laisse passer », jamais un numéro. */
export const LEVEL_LABEL: Record<AutonomyLevel, string> = {
  0: "Jamais",
  1: "ZETIS propose",
  2: "Vous validez",
  3: "ZETIS sert",
};

export const PRESET_LABEL: Record<AutonomyPreset, string> = {
  manuel: "Manuel",
  semi: "Semi-autonome",
  autonome: "Autonome",
};

export const PRESET_ICON: Record<AutonomyPreset, string> = {
  manuel: "🔒",
  semi: "⚖️",
  autonome: "🚀",
};

export const PRESET_DESCRIPTION: Record<AutonomyPreset, string> = {
  manuel:
    "ZETIS produit, vous validez tout avant que Massimo le voie — fiches et cartes mentales comprises.",
  semi: "ZETIS sert les dérivés seul. Les cours passent toujours par vous.",
  autonome:
    "ZETIS rédige et sert y compris les cours. Vous pouvez retirer, tant que Massimo n'a pas ouvert.",
};

/** L'ordre d'affichage des régimes : du plus de contrôle au moins. */
export const PRESETS: AutonomyPreset[] = ["manuel", "semi", "autonome"];

/** Les classes qu'un régime écrit — les verrouillées n'y sont jamais, sous peine d'en faire une
 *  porte dérobée sur une décision figée. Miroir de `PRESETS` côté serveur (`settings/service.py`),
 *  et le serveur refuse de toute façon ce qui sortirait des `choices`. */
const PRESET_LEVELS: Record<AutonomyPreset, Record<string, AutonomyLevel>> = {
  manuel: { zetis_autonomy_a0a_derives: 2, zetis_autonomy_a1_course: 2 },
  semi: { zetis_autonomy_a0a_derives: 3, zetis_autonomy_a1_course: 2 },
  autonome: { zetis_autonomy_a0a_derives: 3, zetis_autonomy_a1_course: 3 },
};

export function levelsForPreset(preset: AutonomyPreset): Record<string, AutonomyLevel> {
  return { ...PRESET_LEVELS[preset] };
}

/** Un régime est indisponible dès qu'une des valeurs qu'il écrirait est hors `choices`.
 *
 * Dérivé, jamais codé en dur : le jour où le veto obtient sa surface, le serveur rouvre le palier
 * 3 d'A1 et *Autonome* redevient offert **sans qu'une ligne du front change**. */
export function presetAvailability(
  autonomy: Autonomy,
  preset: AutonomyPreset,
): { available: boolean; reason: string | null } {
  const levels = levelsForPreset(preset);
  for (const cls of autonomy.classes) {
    const wanted = levels[cls.key];
    if (wanted !== undefined && !cls.choices.includes(wanted)) {
      return { available: false, reason: cls.reason };
    }
  }
  return { available: true, reason: null };
}

/** La clé du cours — la seule dont la montée retire un contrôle humain, donc la seule qui
 *  demande une confirmation explicite. */
export const A1_COURSE_KEY = "zetis_autonomy_a1_course";
export const SERVE: AutonomyLevel = 3;
