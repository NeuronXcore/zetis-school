import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NEWS_CHANGED_EVENT } from "./newsEvents";

// Tout geste qui consomme une nouveauté doit émettre l'événement, sinon le badge reste allumé sur
// un contenu déjà lu — le pire état pour un témoin. (Le compte n'est plus dans ce commentaire : il
// a bougé quatre fois, et un nombre écrit en prose se périme sans rougir.)
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

  it("part quand un cours est ouvert", async () => {
    // ⚠️ Seul cas où un `GET` émet. L'écriture existe, elle est SERVEUR (`mark_lesson_seen` dans
    // `GET /lessons/{id}/cours`) : la doctrine « l'émission vit à côté de l'écriture » tient, le
    // fil est juste au milieu. Ce test est ce qui empêche de « remonter l'émission au bon endroit ».
    const { fetchStudentLessonCours } = await import("./cours");
    await fetchStudentLessonCours(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("ne part PAS quand la leçon n'a pas de cours (404)", async () => {
    // Un 404 n'a rien marqué vu côté serveur : émettre ferait recalculer pour rien, et surtout
    // ferait croire qu'un geste a eu lieu.
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 404,
          json: () => Promise.resolve({ detail: "Pas de cours disponible pour cette leçon." }),
        } as Response),
      ),
    );
    const { fetchStudentLessonCours } = await import("./cours");
    await expect(fetchStudentLessonCours(1)).rejects.toThrow();
    expect(listener).not.toHaveBeenCalled();
  });

  it("part quand une capsule est vue", async () => {
    const { recordCapsuleView } = await import("./capsules");
    await recordCapsuleView(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("part quand une notion est expliquée en ELI5", async () => {
    // `explainEli5` enchaîne POST /explain → GET /jobs/{id} → POST /skills/{id}/seen. Le `fetch`
    // stubé rend `{}` : on renseigne juste ce que la fonction lit pour aller au bout.
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ job_id: 1, status: "succeeded", output: { title: "x" } }),
        } as Response),
      ),
    );
    const { explainEli5 } = await import("./eli5");
    await explainEli5(7);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("ne part PAS quand l'explication échoue — rien n'a été montré", async () => {
    // Borne 3 de l'addendum ELI5 : le geste qui éteint est l'explication RÉUSSIE. Un provider
    // indisponible ne doit pas consommer la nouveauté.
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ job_id: 1, status: "failed", output: null }),
        } as Response),
      ),
    );
    const { explainEli5 } = await import("./eli5");
    await expect(explainEli5(7)).rejects.toThrow();
    expect(listener).not.toHaveBeenCalled();
  });

  it("part quand une carte est notée", async () => {
    const { submitReviewAttempt } = await import("./reviews");
    await submitReviewAttempt(1, "good");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("part quand un quiz est OUVERT", async () => {
    const { fetchQuizById } = await import("./quiz");
    await fetchQuizById(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("ne part PAS quand une tentative de quiz démarre — c'est du travail, pas un regard", async () => {
    // 🔴 Borne 1 de l'addendum Quiz : le témoin meurt de l'OUVERTURE. Si `startQuizAttempt`
    // émettait aussi, le geste consommateur deviendrait indiscernable du travail — et la
    // prochaine session déplacerait le marquage « au moment où ça compte vraiment ».
    const { startQuizAttempt } = await import("./quiz");
    await startQuizAttempt(1);
    expect(listener).not.toHaveBeenCalled();
  });

  it("part quand une mindmap est ouverte", async () => {
    const { markMindmapSeen } = await import("./mindmaps");
    await markMindmapSeen(1);
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

  it("🔴 chaque témoin a un émetteur — aucune clé ne peut rester allumée à vie", async () => {
    // Le commentaire de tête de ce fichier dit depuis toujours qu'un badge sans geste
    // consommateur est « le pire état pour un témoin ». Il le DISAIT sans le vérifier : rien
    // n'empêchait d'ajouter une clé à `NewsSummary` et d'oublier le marquage côté client.
    //
    // Le tableau est explicite (pas dérivé) : c'est le registre « quel geste éteint quoi », et
    // il doit se mettre à jour délibérément.
    const { EMPTY_NEWS } = await import("./news");
    const EMETTEURS: Record<string, string> = {
      agenda: "lib/agenda.ts::markAgendaSeen",
      matieres: "lib/cours.ts::fetchStudentLessonCours",
      eli5: "lib/eli5.ts::explainEli5",
      quiz: "lib/quiz.ts::fetchQuizById",
      fiches: "lib/fiches.ts::markFicheSeen",
      capsules: "lib/capsules.ts::recordCapsuleView",
      revision: "lib/reviews.ts::submitReviewAttempt",
      missions: "lib/missions.ts::startMission",
      mindmaps: "lib/mindmaps.ts::markMindmapSeen",
      // ⚠️ EXCEPTION NOMMÉE : le témoin du diagnostic meurt du TRAVAIL, donc son extinction est
      // SERVEUR (la passation) et n'a aucun émetteur client. C'est la seule entrée légitime de
      // cette forme — `adr-0030-addendum-temoin-diagnostic.md`.
      diagnostic: "serveur (passation) — exception nommée, meurt du travail",
    };
    expect(Object.keys(EMETTEURS).sort()).toEqual(Object.keys(EMPTY_NEWS).sort());
  });
});
