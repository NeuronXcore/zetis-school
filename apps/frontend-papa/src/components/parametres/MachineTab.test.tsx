import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type Machine } from "@zetis/types";

// ⚠️ Import `?raw` de Vite plutôt que `node:fs` : le tsconfig du front déclare `"types": []`
// (patron de `LacunesPage.vocabulaire.test.ts`). `tsc -b` et vitest doivent être verts tous les deux.
import machineSource from "./MachineTab.tsx?raw";
import { MachineTab } from "./MachineTab";

vi.mock("../../lib/settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/settings")>()),
  fetchMachine: vi.fn(),
  testMoteur: vi.fn(),
  acquitterEchec: vi.fn(),
  redemarrerWorker: vi.fn(),
  setProductionSuspension: vi.fn(),
}));
import {
  acquitterEchec,
  fetchMachine,
  redemarrerWorker,
  setProductionSuspension,
  testMoteur,
} from "../../lib/settings";

function machine(over: Partial<Machine> = {}): Machine {
  return {
    workers_supervision: { supervised: false, motif: "Rien ne supervise le worker : relancez-le à la main (pnpm dev:worker)." },
    production_suspended: false,
    sondes: [
      { nom: "Postgres", etat: "ok", detail: "SELECT 1", latence_ms: 3 },
      { nom: "Ollama", etat: "ok", detail: "« qwen » présent", latence_ms: 21 },
    ],
    moteurs: [
      {
        tache: "Cours, fiches, quiz",
        moteur: "ollama",
        modele: "qwen3.6:35b-a3b",
        ou: "local",
        ce_qui_part: "rien ne sort de la maison",
        motif: null,
      },
      {
        tache: "Programme — chapitres et leçons",
        moteur: "anthropic",
        modele: "claude-sonnet-5",
        ou: "cloud",
        ce_qui_part: "niveau, matière — aucune donnée de Massimo",
        motif: "Dérogation ADR-0009.",
      },
    ],
    cle_anthropic_presente: false,
    prompts: [{ module: "fiche", constante: "FICHE_PROMPT_VERSION", version: "v2" }],
    file: { en_attente: 2, en_cours: 1 },
    workers: [{ nom: "worker-1", file: "production", age_minutes: 163 }],
    echecs: { total: 0, non_acquittes: 0, lignes: [] },
    sept_derniers_jours: [
      { job_type: "equip_notion", reussis: 11, echoues: 1, mediane_ms: 69_000 },
    ],
    sorties_reseau: { actif: false, destinataire: null, total: 0, appels: [] },
    reglages_env: [
      { nom: "Plafond", variable: "PRODUCTION_MAX_PENDING", valeur: "3", motif: "garde-fou" },
    ],
    installation: { version: "0.1.0", alembic_head: "b3c4d5e6f7a8", mot_de_passe_dev_en_place: false },
    ...over,
  };
}

beforeEach(() => {
  vi.mocked(fetchMachine).mockResolvedValue(machine());
});

// --- 🔴 Les trois verrous de doctrine -------------------------------------------------------------

describe("les verrous de l'onglet", () => {
  it("🔴 ne rend AUCUN champ éditable — seuls Tester et Acquitter sont actionnables", async () => {
    // Le routage vit en variables d'environnement lues au démarrage. Un déroulant serait soit mort,
    // soit un chantier `app_settings` + re-résolution des providers.
    const { container } = render(<MachineTab />);
    await screen.findByText("Qui fait quoi");

    expect(container.querySelectorAll("select")).toHaveLength(0);
    expect(container.querySelectorAll("input")).toHaveLength(0);
    expect(container.querySelectorAll("textarea")).toHaveLength(0);
  });

  it("🔴 ne pose AUCUN sondage — le rafraîchissement est un geste", async () => {
    // Verrou LEXICAL sur la source : un `setInterval` peut vivre dans une branche que les tests ne
    // rendent jamais, et c'est précisément là qu'il se réintroduit.
    //
    // ⚠️ On dépouille les COMMENTAIRES d'abord : à la première écriture, ce verrou s'est attrapé
    // lui-même sur la ligne qui documente « aucun setInterval n'existe dans ce fichier ». Un
    // verrou qui rougit sur sa propre justification finit par être désarmé.
    const code = machineSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

    expect(code).not.toMatch(/setInterval|setTimeout\s*\(/);
    expect(code).toMatch(/Rafraîchir/);
  });

  it("🔴 à l'erreur de lecture, AUCUNE valeur n'est affichée", async () => {
    // Un chiffre faux, sur cet écran, ferait chercher une panne au mauvais endroit.
    vi.mocked(fetchMachine).mockRejectedValue(new Error("réseau"));
    render(<MachineTab />);

    await screen.findByText(/État de la machine illisible/);
    expect(screen.queryByText("Qui fait quoi")).toBeNull();
    expect(screen.queryByText(/69/)).toBeNull();
  });

  it("vide l'instantané précédent quand une relecture échoue", async () => {
    // Garder l'ancien montrerait des sondes vertes pendant que le serveur est injoignable.
    render(<MachineTab />);
    await screen.findByText("Qui fait quoi");

    vi.mocked(fetchMachine).mockRejectedValue(new Error("coupé"));
    fireEvent.click(screen.getByRole("button", { name: /Rafraîchir/ }));

    await screen.findByText(/État de la machine illisible/);
    expect(screen.queryByText("Qui fait quoi")).toBeNull();
  });
});

// --- Ce que l'écran dit ---------------------------------------------------------------------------

describe("ce que l'écran dit", () => {
  it("distingue le local du cloud, tâche par tâche", async () => {
    render(<MachineTab />);
    await screen.findByText("Qui fait quoi");

    expect(screen.getByText(/🏠 local/)).toBeInTheDocument();
    expect(screen.getByText(/☁️ dérogation/)).toBeInTheDocument();
  });

  it("affiche la PRÉSENCE de la clé Anthropic, jamais sa valeur", async () => {
    render(<MachineTab />);

    await screen.findByText(/clé Anthropic absente/);
  });

  it("🔴 explique l'état « dégradé » plutôt que d'afficher un ❌ muet", async () => {
    // C'est le piège du lien symbolique : volume non monté et modèle mal nommé rendent le MÊME
    // message d'Ollama. Un seul ❌ ferait chercher une panne réseau devant un disque débranché.
    vi.mocked(fetchMachine).mockResolvedValue(
      machine({
        sondes: [
          {
            nom: "Ollama",
            etat: "degrade",
            detail: "joignable, mais AUCUN modèle",
            latence_ms: 18,
          },
        ],
      }),
    );
    render(<MachineTab />);

    await screen.findByText(/Un service répond, mais pas ce qu'on attend de lui/);
    expect(screen.getByText(/joignable, mais AUCUN modèle/)).toBeInTheDocument();
  });

  it("signale un worker plus vieux que le déploiement — « vivant » ≠ « à jour »", async () => {
    render(<MachineTab />);

    await screen.findByText(/démarré il y a 163 min/);
  });

  it("rend « — » et jamais « 0 » quand une médiane n'a pas pu être mesurée", async () => {
    vi.mocked(fetchMachine).mockResolvedValue(
      machine({
        sept_derniers_jours: [{ job_type: "no_op", reussis: 8, echoues: 0, mediane_ms: null }],
      }),
    );
    render(<MachineTab />);
    await screen.findByText("7 derniers jours");

    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("0 ms")).toBeNull();
  });

  it("éteint le journal des sorties quand rien ne sort", async () => {
    render(<MachineTab />);

    await screen.findByText(/La génération est 100 % locale/);
  });

  it("montre le bandeau du mot de passe de dev quand il est en place", async () => {
    vi.mocked(fetchMachine).mockResolvedValue(
      machine({
        installation: { version: "0.1.0", alembic_head: "abc", mot_de_passe_dev_en_place: true },
      }),
    );
    render(<MachineTab />);

    await screen.findByText(/Le mot de passe de développement est en place/);
  });
});

// --- Les deux gestes -------------------------------------------------------------------------------

describe("les deux seuls gestes", () => {
  it("« Tester le moteur » rend une vraie latence", async () => {
    vi.mocked(testMoteur).mockResolvedValue({
      ok: true,
      latence_ms: 5600,
      modele: "qwen3.6:35b-a3b",
      detail: "JSON valide",
    });
    render(<MachineTab />);
    await screen.findByText("Qui fait quoi");

    fireEvent.click(screen.getByRole("button", { name: /Tester le moteur/ }));

    await screen.findByText(/JSON valide · 5,6 s/);
  });

  it("dit qu'un moteur joignable qui ne rend pas de JSON est un échec", async () => {
    vi.mocked(testMoteur).mockResolvedValue({
      ok: false,
      latence_ms: 300,
      modele: "qwen3.6:35b-a3b",
      detail: "le moteur a répondu, mais pas en JSON valide",
    });
    render(<MachineTab />);
    await screen.findByText("Qui fait quoi");

    fireEvent.click(screen.getByRole("button", { name: /Tester le moteur/ }));

    await screen.findByText(/pas en JSON valide/);
  });

  it("acquitter un échec le fait disparaître, et relit le serveur", async () => {
    // Le geste est SERVEUR (`ai_jobs.acknowledged_at`) : d'où la relecture, et non un masquage
    // local qui reviendrait au prochain appareil.
    vi.mocked(fetchMachine).mockResolvedValue(
      machine({
        echecs: {
          total: 1,
          non_acquittes: 1,
          lignes: [
            {
              id: 42,
              job_type: "equip_notion",
              message: 'Aucun exécutant pour "srs_cards_generate"',
              quand: "2026-08-16T21:07:00Z",
              acquitte: false,
            },
          ],
        },
      }),
    );
    vi.mocked(acquitterEchec).mockResolvedValue(undefined);
    render(<MachineTab />);

    await screen.findByText(/Aucun exécutant/);
    expect(screen.getByText(/Échecs — 1 non acquitté/)).toBeInTheDocument();

    vi.mocked(fetchMachine).mockResolvedValue(
      machine({ echecs: { total: 0, non_acquittes: 0, lignes: [] } }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Acquitter" }));

    await waitFor(() => expect(acquitterEchec).toHaveBeenCalledWith(42));
    await waitFor(() => expect(screen.queryByText(/Aucun exécutant/)).toBeNull());
  });

  it("🔴 annonce le plafond au lieu de tronquer en silence", async () => {
    // Défaut trouvé le 2026-08-19 en interrogeant la VRAIE base : elle portait 20 échecs, soit
    // exactement le plafond de la requête. Compter la liste aurait fait dire « 20 » à une base
    // qui en porte 200 — une troncature déguisée en mesure.
    vi.mocked(fetchMachine).mockResolvedValue(
      machine({
        echecs: {
          total: 137,
          non_acquittes: 4,
          lignes: [
            {
              id: 1,
              job_type: "equip_notion",
              message: "boum",
              quand: "2026-08-16T21:07:00Z",
              acquitte: false,
            },
          ],
        },
      }),
    );
    render(<MachineTab />);

    await screen.findByText(/Échecs — 4 non acquittés/);
    expect(screen.getByText(/1 plus récents sur 137 enregistrés/)).toBeInTheDocument();
  });

  it("relaie le message du serveur TEL QUEL — c'est la vraie demande derrière « les logs »", async () => {
    vi.mocked(fetchMachine).mockResolvedValue(
      machine({
        echecs: {
          total: 1,
          non_acquittes: 0,
          lignes: [
            {
              id: 7,
              job_type: "capsule_render",
              message: "TimeoutError: page.screenshot exceeded 30000ms",
              quand: "2026-08-14T10:52:00Z",
              acquitte: true,
            },
          ],
        },
      }),
    );
    render(<MachineTab />);

    await screen.findByText("TimeoutError: page.screenshot exceeded 30000ms");
    expect(screen.getByText("acquitté")).toBeInTheDocument();
  });
});

// --- ⏸ Suspendre ZETIS (ADR-0063 §6-§7) -----------------------------------------------------------

describe("suspendre ZETIS", () => {
  it("dit ce que la bascule NE fait PAS, AVANT le clic", async () => {
    // §7 : une commande d'arrêt n'est pas une commande destructive, et l'écran le dit plutôt que
    // de le laisser supposer.
    render(<MachineTab />);

    await screen.findByRole("button", { name: /⏸ Suspendre/ });
    expect(screen.getByText(/Ne touche pas au régime/)).toBeInTheDocument();
    expect(screen.getByText(/ne vide pas la\s+file/)).toBeInTheDocument();
  });

  it("annonce le délai d'un lot en vol — sinon le bouton se lit comme cassé", async () => {
    render(<MachineTab />);

    await screen.findByText(/s'écourte entre deux pièces \(~15 à 45 s\)/);
  });

  it("suspendu : l'état se dit, et le geste s'inverse", async () => {
    vi.mocked(fetchMachine).mockResolvedValue(machine({ production_suspended: true }));
    render(<MachineTab />);

    await screen.findByText("⏸ ZETIS est suspendu");
    expect(screen.getByText(/même sur clic, même par le scan/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Remettre en route/ })).toBeInTheDocument();
    // §5 : il ne se relève jamais seul — et l'écran le dit.
    expect(screen.getByText(/ne se relèvera pas tout seul/)).toBeInTheDocument();
  });

  it("la bascule écrit par SA route, prévient la sidebar, et relit", async () => {
    vi.mocked(setProductionSuspension).mockResolvedValue({ suspended: true });
    render(<MachineTab />);
    await screen.findByRole("button", { name: /⏸ Suspendre/ });

    const entendu = vi.fn();
    window.addEventListener("zetis:autonomy-changed", entendu);
    vi.mocked(fetchMachine).mockResolvedValue(machine({ production_suspended: true }));
    fireEvent.click(screen.getByRole("button", { name: /⏸ Suspendre/ }));

    await screen.findByText("⏸ ZETIS est suspendu");
    expect(setProductionSuspension).toHaveBeenCalledWith(true);
    // La sidebar lit la suspension dans le GET d'autonomie : même événement que le panneau
    // d'autonomie, jamais un sondage.
    expect(entendu).toHaveBeenCalled();
    window.removeEventListener("zetis:autonomy-changed", entendu);
  });

  it("un échec de bascule s'affiche — jamais un état inventé", async () => {
    vi.mocked(setProductionSuspension).mockRejectedValue(new Error("réseau"));
    render(<MachineTab />);
    await screen.findByRole("button", { name: /⏸ Suspendre/ });

    fireEvent.click(screen.getByRole("button", { name: /⏸ Suspendre/ }));

    await screen.findByText("réseau");
    // L'état affiché reste celui du serveur : pas suspendu.
    expect(screen.queryByText("⏸ ZETIS est suspendu")).toBeNull();
  });
});

// --- ⟳ Redémarrer un worker (chantier A1) --------------------------------------------------------

describe("redémarrer un worker", () => {
  it("🔴 non supervisé : le bouton est GRISÉ avec le motif — le cadenas parle avant le clic", async () => {
    // Arrêter un worker que rien ne relance le tuerait pour de bon. Le serveur refuse (409) ;
    // l'écran rend ce refus lisible AVANT que Papa clique pour l'apprendre.
    render(<MachineTab />);
    await screen.findByText("Ce qui tourne");

    const bouton = screen.getByRole("button", { name: /Redémarrer/ });
    expect(bouton).toBeDisabled();
    expect(screen.getByText(/🔒 Rien ne supervise le worker/)).toBeInTheDocument();
    expect(redemarrerWorker).not.toHaveBeenCalled();
  });

  it("supervisé : le clic envoie l'ordre et RELAIE la phrase du serveur", async () => {
    vi.mocked(fetchMachine).mockResolvedValue(
      machine({ workers_supervision: { supervised: true, motif: null } }),
    );
    vi.mocked(redemarrerWorker).mockResolvedValue({
      detail: "Arrêt demandé au worker « worker-1 » : il termine sa pièce en cours puis sort.",
    });
    render(<MachineTab />);
    await screen.findByText("Ce qui tourne");

    fireEvent.click(screen.getByRole("button", { name: /Redémarrer/ }));

    await screen.findByText(/il termine sa pièce en cours puis sort/);
    expect(redemarrerWorker).toHaveBeenCalledWith("worker-1");
  });

  it("un refus du serveur s'affiche tel quel — jamais réécrit", async () => {
    vi.mocked(fetchMachine).mockResolvedValue(
      machine({ workers_supervision: { supervised: true, motif: null } }),
    );
    vi.mocked(redemarrerWorker).mockRejectedValue(
      new Error("Aucun worker « worker-1 » sur les files de production."),
    );
    render(<MachineTab />);
    await screen.findByText("Ce qui tourne");

    fireEvent.click(screen.getByRole("button", { name: /Redémarrer/ }));

    await screen.findByText(/Aucun worker « worker-1 »/);
  });
});
