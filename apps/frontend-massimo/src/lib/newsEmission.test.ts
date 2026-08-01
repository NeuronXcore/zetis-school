import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NEWS_CHANGED_EVENT } from "./newsEvents";

// Les cinq gestes qui consomment une nouveauté doivent tous émettre l'événement, sinon le badge
// reste allumé sur un contenu déjà lu — le pire état pour un témoin.
//
// L'émission vit dans `lib/`, à côté de l'écriture réseau, et pas dans les pages : c'est ce qui
// garantit qu'un futur appelant ne puisse pas l'oublier. Ces tests appellent donc les fonctions
// `lib/` directement.

const listener = vi.fn();

beforeEach(() => {
  listener.mockReset();
  window.addEventListener(NEWS_CHANGED_EVENT, listener);
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response),
    ),
  );
});

afterEach(() => {
  window.removeEventListener(NEWS_CHANGED_EVENT, listener);
  vi.unstubAllGlobals();
});

describe("émission de NEWS_CHANGED_EVENT", () => {
  it("part quand une fiche est ouverte", async () => {
    const { markFicheSeen } = await import("./fiches");
    await markFicheSeen(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("part quand une capsule est vue", async () => {
    const { recordCapsuleView } = await import("./capsules");
    await recordCapsuleView(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("part quand une carte est notée", async () => {
    const { submitReviewAttempt } = await import("./reviews");
    await submitReviewAttempt(1, "good");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("part quand une mission démarre", async () => {
    const { startMission } = await import("./missions");
    await startMission(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("part quand Massimo regarde son agenda", async () => {
    const { markAgendaSeen } = await import("./agenda");
    await markAgendaSeen();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("part quand Massimo masque un item d'agenda", async () => {
    const { dismissAgendaItem } = await import("./agenda");
    await dismissAgendaItem(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
