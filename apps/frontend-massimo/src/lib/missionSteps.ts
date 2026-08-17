import { type StepCompleteResult } from "@zetis/types";
import { MissionRefus, completeStep } from "./missions";

// Validation d'étape « sûre » utilisée par les modales de mission : demande au serveur de valider
// l'étape (le serveur décide via la preuve) et traduit un refus en message DOUX — jamais un échec.
// Le résultat succès porte le verdict/XP éventuel de fin de mission.

export type StepOutcome =
  | { ok: true; result: StepCompleteResult }
  | { ok: false; hint: string };

/** Ce que Massimo lit quand ZETIS n'a **rien** à lui dire de plus précis. */
const REVIENS = "Termine l'activité, puis reviens ✨";

export async function completeStepSafely(missionId: number, stepId: number): Promise<StepOutcome> {
  try {
    return { ok: true, result: await completeStep(missionId, stepId) };
  } catch (e) {
    console.warn("[missions] validation d'étape refusée", e); // trace devtools (diagnostic)
    // 🔴 **`REVIENS` était la branche MORTE.** `asJson` levant toujours un vrai `Error`, la phrase
    // affichée était `e.message` — donc `Erreur 500` quand ça cassait pour de bon. Ici seul un
    // `MissionRefus` (409, écrit par le serveur POUR lui) passe ; tout le reste retombe sur la
    // phrase d'à côté, qui devient enfin celle qu'on lit.
    return { ok: false, hint: e instanceof MissionRefus ? e.message : REVIENS };
  }
}
