// La validation d'étape « sûre » — et surtout : CE QUE MASSIMO LIT quand elle refuse.
//
// 🔴 **Deux natures de refus arrivent par le même `catch`, et rien ne les testait.** Le 409 est une
// consigne que le serveur a écrite pour lui (*« Réexplique d'abord la notion à ZETIS »*) ; un 500
// n'est qu'une panne, et `asJson` en fabrique la chaîne `Erreur 500`. Tant que le code lisait
// `e.message`, les deux sortaient par le même trou — la seconde à l'écran d'un enfant.
//
// C'est le motif qui m'a eu quatre fois le 2026-08-17 : **un cas à DEUX exercé à UN**. Les deux
// cas sont ici, côte à côte, exprès.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  // Vraie classe : `completeStepSafely` fait `instanceof MissionRefus`, un doublon vide
  // échouerait en silence et le test passerait pour la mauvaise raison.
  MissionRefus: class MissionRefus extends Error {},
  completeStep: vi.fn(),
}));
vi.mock("./missions", () => api);

import { completeStepSafely } from "./missionSteps";

describe("completeStepSafely", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("un refus 409 rend la CONSIGNE du serveur — elle est écrite pour lui", () => {
    api.completeStep.mockRejectedValue(
      new api.MissionRefus("Réexplique d'abord la notion à ZETIS pour valider cette étape."),
    );
    return expect(completeStepSafely(1, 2)).resolves.toEqual({
      ok: false,
      hint: "Réexplique d'abord la notion à ZETIS pour valider cette étape.",
    });
  });

  it("🔴 une panne ne raconte RIEN — la phrase d'à côté devient enfin celle qu'on lit", async () => {
    // `Erreur 500` est fabriquée par `asJson` lui-même. C'est exactement la chaîne qui atteignait
    // l'écran de Massimo (`CLAUDE.md` — « Massimo ne doit pas voir : les informations techniques »).
    api.completeStep.mockRejectedValue(new Error("Erreur 500"));
    const out = await completeStepSafely(1, 2);
    expect(out).toEqual({ ok: false, hint: "Termine l'activité, puis reviens ✨" });
  });

  it("le détail technique part en CONSOLE — perdre la trace serait l'autre faute", async () => {
    // Un message fixe qui jette l'erreur laisserait qui débogue sans rien. Les deux moitiés de la
    // règle comptent : phrase à l'écran, détail aux devtools.
    const panne = new Error("Failed to fetch");
    api.completeStep.mockRejectedValue(panne);
    await completeStepSafely(1, 2);
    expect(console.warn).toHaveBeenCalledWith("[missions] validation d'étape refusée", panne);
  });

  it("un succès passe le résultat du serveur tel quel", () => {
    api.completeStep.mockResolvedValue({ mission_status: "active", xp_awarded: 0 });
    return expect(completeStepSafely(1, 2)).resolves.toEqual({
      ok: true,
      result: { mission_status: "active", xp_awarded: 0 },
    });
  });
});
