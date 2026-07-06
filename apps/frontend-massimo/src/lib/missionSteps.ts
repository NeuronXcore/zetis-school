import { type StepCompleteResult } from "@zetis/types";
import { completeStep } from "./missions";

// Validation d'étape « sûre » utilisée par les modales de mission : demande au serveur de valider
// l'étape (le serveur décide via la preuve) et traduit un refus (409 preuve manquante, ou autre) en
// message DOUX — jamais un échec. Le résultat succès porte le verdict/XP éventuel de fin de mission.

export type StepOutcome =
  | { ok: true; result: StepCompleteResult }
  | { ok: false; hint: string };

export async function completeStepSafely(missionId: number, stepId: number): Promise<StepOutcome> {
  try {
    return { ok: true, result: await completeStep(missionId, stepId) };
  } catch (e) {
    return {
      ok: false,
      hint: e instanceof Error ? e.message : "Termine l'activité, puis reviens ✨",
    };
  }
}
