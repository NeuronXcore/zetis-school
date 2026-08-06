import { afterEach, describe, expect, it, vi } from "vitest";

import { _reinitialiserPourTest, signalerEnfilement, surEnfilement } from "./productionSignal";
import { startChapterProduction, produceForRequest } from "./production";

// Le réveil de la barre (ADR-0041, dette du contrôle 2). Sans lui, la barre restait muette jusqu'à
// 4 s après un clic — sa période de sondage.

afterEach(() => {
  _reinitialiserPourTest();
  vi.restoreAllMocks();
});

describe("le bus de réveil", () => {
  it("prévient les abonnés, et le désabonnement coupe vraiment", () => {
    const a = vi.fn();
    const b = vi.fn();
    const couper = surEnfilement(a);
    surEnfilement(b);

    signalerEnfilement();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);

    couper();
    signalerEnfilement();
    expect(a).toHaveBeenCalledTimes(1); // plus rien
    expect(b).toHaveBeenCalledTimes(2);
  });

  it("🔒 un abonné qui échoue n'empêche pas les autres d'être prévenus", () => {
    // La barre est présente sur les 22 pages. Une exception ici remonterait dans le chemin
    // d'enfilement — qui, lui, a RÉUSSI : le clic de Papa paraîtrait échouer alors que le travail
    // est bien parti.
    const casse = vi.fn(() => {
      throw new Error("boum");
    });
    const sain = vi.fn();
    surEnfilement(casse);
    surEnfilement(sain);

    expect(() => signalerEnfilement()).not.toThrow();
    expect(sain).toHaveBeenCalledTimes(1);
  });
});

describe("qui réveille la barre, et quand", () => {
  function faussefetch(ok: boolean) {
    return vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok,
      status: ok ? 202 : 409,
      json: async () => (ok ? { id: 1 } : { detail: "arriéré au plafond" }),
    } as Response);
  }

  it("un enfilement RÉUSSI réveille la barre", async () => {
    faussefetch(true);
    const reveil = vi.fn();
    surEnfilement(reveil);

    await startChapterProduction(7);
    expect(reveil).toHaveBeenCalledTimes(1);

    await produceForRequest(3);
    expect(reveil).toHaveBeenCalledTimes(2);
  });

  it("🔒 un enfilement REFUSÉ ne réveille RIEN", async () => {
    // 409 = le régulateur refuse (arriéré de relecture au plafond). Réveiller la barre pour un lot
    // qui n'a pas été créé lui ferait chercher un travail inexistant — et clignoter pour rien juste
    // après un refus, c'est-à-dire au pire moment.
    faussefetch(false);
    const reveil = vi.fn();
    surEnfilement(reveil);

    await expect(startChapterProduction(7)).rejects.toThrow();
    expect(reveil).not.toHaveBeenCalled();
  });
});
