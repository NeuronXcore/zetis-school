import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GalaxyFullGraph } from "@zetis/types";

const fetchFullGraph = vi.fn();
const fetchGalaxyTimelineWithSkills = vi.fn();
const getToken = vi.fn<() => string | null>();

vi.mock("./galaxy", () => ({
  fetchFullGraph: () => fetchFullGraph(),
  fetchGalaxyTimelineWithSkills: () => fetchGalaxyTimelineWithSkills(),
}));
vi.mock("./authClient", () => ({
  API_URL: "http://test",
  authClient: { getToken: () => getToken() },
}));

import { FRESH_MS, loadFullGraph, loadTimelineWithSkills, resetGalaxyShared } from "./galaxyShared";

const GRAPH = { nodes: [], edges: [] } as unknown as GalaxyFullGraph;

describe("galaxyShared — partage des deux appels lourds de la galaxie", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-04T12:00:00Z"));
    resetGalaxyShared();
    fetchFullGraph.mockReset().mockResolvedValue(GRAPH);
    fetchGalaxyTimelineWithSkills.mockReset().mockResolvedValue({ points: [] });
    getToken.mockReset().mockReturnValue("jeton-massimo");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("🔒 deux appels concurrents ne font qu'UNE requête", async () => {
    // C'est le cas réel : le bandeau (monté par le layout) et `HomeGalaxyCard` (montée par la
    // page) s'arment dans le même commit React, et leurs `requestIdleCallback` tirent dans la
    // même fenêtre. Sans ce partage, l'Accueil paie deux fois ~350 nœuds.
    const [a, b] = await Promise.all([loadFullGraph(), loadFullGraph()]);

    expect(fetchFullGraph).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it("🔒 passé la fenêtre de fraîcheur, la requête repart — ce n'est PAS un cache de session", async () => {
    // Le cas que ce test protège n'est pas la performance, c'est la VÉRITÉ : Massimo travaille une
    // notion, revient sur l'Accueil, et son étoile doit être allumée. Une fenêtre longue la lui
    // cacherait jusqu'au prochain rechargement.
    await loadFullGraph();
    vi.setSystemTime(Date.now() + FRESH_MS + 1);
    await loadFullGraph();

    expect(fetchFullGraph).toHaveBeenCalledTimes(2);
  });

  it("🔒 un changement de jeton refait la requête — confidentialité, pas optimisation", async () => {
    // `logout()` démonte le layout mais pas ce module. Sans la clé par jeton, se déconnecter puis
    // se reconnecter dans le même onglet servirait la galaxie du compte précédent au suivant.
    await loadFullGraph();
    getToken.mockReturnValue("jeton-de-quelquun-dautre");
    await loadFullGraph();

    expect(fetchFullGraph).toHaveBeenCalledTimes(2);
  });

  it("🔒 un échec n'est jamais mémorisé", async () => {
    // Sinon un creux réseau au démarrage condamnerait toute la session : la galaxie resterait
    // absente jusqu'au rechargement, sans que rien ne l'explique.
    fetchFullGraph.mockRejectedValueOnce(new Error("Erreur 503"));
    await expect(loadFullGraph()).rejects.toThrow("Erreur 503");

    await expect(loadFullGraph()).resolves.toBe(GRAPH);
    expect(fetchFullGraph).toHaveBeenCalledTimes(2);
  });

  it("🔒 les deux ressources ont des créneaux SÉPARÉS", async () => {
    // Contre-épreuve du partage lui-même : un slot unique servirait le graphe à qui demande la
    // frise. Le test échouerait alors sur le compte, pas sur le contenu — d'où les deux.
    await Promise.all([loadFullGraph(), loadTimelineWithSkills()]);

    expect(fetchFullGraph).toHaveBeenCalledTimes(1);
    expect(fetchGalaxyTimelineWithSkills).toHaveBeenCalledTimes(1);
  });
});
