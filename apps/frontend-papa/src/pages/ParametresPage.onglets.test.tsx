import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { type Autonomy } from "@zetis/types";

// ⚠️ Import `?raw` de Vite plutôt que `node:fs` : le tsconfig du front déclare `"types": []`, donc
// `readFileSync` ne compile pas ici — `tsc -b` rougirait alors que vitest passe (patron de
// `LacunesPage.vocabulaire.test.ts`). Les deux doivent être verts.
import appSource from "../App.tsx?raw";
import { ParametresPage } from "./ParametresPage";
import { INVENTAIRE } from "../lib/inventaireReglages";
import { ONGLETS } from "../components/parametres/OngletsParametres";

vi.mock("../lib/settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/settings")>()),
  fetchAutonomy: vi.fn(),
  fetchEcarts: vi.fn(),
}));
import { NIVEAU_LABEL, fetchAutonomy, fetchEcarts } from "../lib/settings";

const A0A = "zetis_autonomy_a0a_derives";
const A1 = "zetis_autonomy_a1_course";

function autonomy(): Autonomy {
  return {
    auto_trigger_enabled: false,
    production_suspended: false,
    niveau: "semi",
    classes: [
      { key: A0A, code: "A0a", label: "Dérivés inertes", value: 3, choices: [2, 3], locked: false, reason: null },
      { key: "zetis_autonomy_a0b_cards", code: "A0b", label: "Cartes", value: 3, choices: [3], locked: true, reason: "Aucune validation." },
      { key: A1, code: "A1", label: "Rédaction de cours", value: 2, choices: [2, 3], locked: false, reason: null },
      { key: "zetis_autonomy_a2_curriculum", code: "A2", label: "Programme", value: 1, choices: [1], locked: true, reason: "Redessine la carte." },
      { key: "zetis_autonomy_a3_missions", code: "A3", label: "Missions", value: 2, choices: [2], locked: true, reason: "Élire ≠ créer." },
      { key: "zetis_autonomy_a4_terminal", code: "A4", label: "Supprimer", value: 0, choices: [0], locked: true, reason: "Définitif." },
    ],
  };
}

/** ⚠️ `MemoryRouter` ne touche PAS `window.location` — une assertion dessus vérifierait le
 *  navigateur de jsdom, pas la page. La sonde rend l'URL du routeur dans le DOM : c'est la seule
 *  façon d'affirmer « l'onglet vit dans l'URL » (ADR-0062 §5) sans se mentir. */
function SondeUrl() {
  const { search } = useLocation();
  return <output data-testid="url">{search}</output>;
}

function renderPage(route = "/parametres") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <ParametresPage />
      <SondeUrl />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(fetchAutonomy).mockResolvedValue(autonomy());
  vi.mocked(fetchEcarts).mockResolvedValue({ keys: [] });
});

// --- Le gabarit : une carte, et des onglets (ADR-0062 §1, §5) -----------------------------------

describe("le gabarit", () => {
  it("ouvre LA CARTE par défaut — elle est la porte, pas une annexe", async () => {
    renderPage();

    await screen.findByText(/Tout ce qui se règle/);
    // L'autonomie n'est pas montée : la carte n'est pas un préambule au-dessus du reste.
    expect(screen.queryByText("ZETIS LEVELS")).toBeNull();
  });

  it("ouvre l'onglet nommé par l'URL — un lien et un rechargement le gardent (§5)", async () => {
    renderPage("/parametres?onglet=autonomie");

    await screen.findByText("ZETIS LEVELS");
  });

  it("écrit l'URL quand on change d'onglet", async () => {
    renderPage();
    await screen.findByText(/Tout ce qui se règle/);

    fireEvent.click(screen.getByRole("tab", { name: /Autonomie/ }));

    await screen.findByText("ZETIS LEVELS");
    expect(screen.getByTestId("url")).toHaveTextContent("onglet=autonomie");
  });

  it("retombe sur la carte quand l'URL nomme un onglet non construit — jamais une page blanche", async () => {
    // Un signet, un lien gardé : `?onglet=donnees` désignera un jour un onglet réel. En attendant,
    // la carte est la bonne réponse — c'est elle qui dit où en est ce réglage-là.
    renderPage("/parametres?onglet=donnees");

    await screen.findByText(/Tout ce qui se règle/);
    expect(screen.getByRole("tab", { name: /La carte/ })).toHaveAttribute("aria-selected", "true");
  });
});

// --- 🔴 Les verrous qui empêchent la carte de MENTIR --------------------------------------------

describe("la carte ne ment pas", () => {
  it("tout onglet qu'elle nomme est un onglet réellement rendu", async () => {
    // C'est LE verrou de l'ADR-0062 §3. Sans lui, une ligne « ici · Données » survivrait à la
    // livraison suivante en promettant une surface qui n'existe pas.
    const rendus = new Set(ONGLETS.map((o) => o.id));

    for (const ligne of INVENTAIRE) {
      if (ligne.onglet) expect(rendus, `« ${ligne.nom} »`).toContain(ligne.onglet);
    }
  });

  it("tout lien qu'elle porte est une route réelle de l'application", async () => {
    // Verrou ajouté APRÈS avoir écrit deux liens qui n'existaient pas (`/annees-scolaires`,
    // `/conseil-classe`). Une carte qui envoie sur un 404 est pire qu'une carte incomplète :
    // elle fait douter de la page d'arrivée, pas de la carte.
    const routes = new Set(
      [...appSource.matchAll(/path="([^"]+)"/g)].map((m) => m[1]),
    );

    for (const ligne of INVENTAIRE) {
      if (ligne.lien) expect(routes, `« ${ligne.nom} »`).toContain(ligne.lien);
    }
  });

  it("aucun onglet rendu n'est vide", async () => {
    // Un onglet vide est l'interrupteur sans effet du 2026-08-02, à l'échelle d'un écran.
    for (const onglet of ONGLETS) {
      const { unmount } = renderPage(`/parametres?onglet=${onglet.id}`);
      await waitFor(() =>
        expect(document.querySelector(`#panneau-${onglet.id}`)?.textContent ?? "").not.toBe(""),
      );
      unmount();
    }
  });

  it("chaque famille de la carte a au moins une ligne — sinon un filtre est mort", async () => {
    for (const famille of ["ici", "ailleurs", "nulle", "decider"] as const) {
      expect(INVENTAIRE.some((l) => l.famille === famille), famille).toBe(true);
    }
  });
});

// --- 🔴 ZETIS LEVELS a survécu au déménagement (ADR-0062 §8) ------------------------------------

describe("les trois régimes survivent au déménagement", () => {
  it("Manual, Hybrid et Autonom sont tous les trois offerts depuis l'onglet", async () => {
    renderPage("/parametres?onglet=autonomie");
    await screen.findByText("ZETIS LEVELS");

    for (const niveau of ["manuel", "semi", "autonome"] as const) {
      expect(
        screen.getByRole("button", { name: new RegExp(NIVEAU_LABEL[niveau]) }),
        NIVEAU_LABEL[niveau],
      ).toBeInTheDocument();
    }
  });
});

// --- « N réglages s'écartent du défaut » (ADR-0062 §4) ------------------------------------------

describe("ce qui s'écarte du défaut", () => {
  it("compte les clés que le SERVEUR rend, jamais une liste en dur", async () => {
    vi.mocked(fetchEcarts).mockResolvedValue({ keys: [A0A, A1, "agenda_student_entry_enabled"] });
    renderPage();

    await screen.findByRole("button", { name: /3 réglages s'écartent du défaut/ });
  });

  it("accorde le singulier — un écran qui écrit « 1 réglages » se lit comme un brouillon", async () => {
    vi.mocked(fetchEcarts).mockResolvedValue({ keys: [A0A] });
    renderPage();

    await screen.findByRole("button", { name: /1 réglage s'écarte du défaut/ });
  });

  it("marque les lignes concernées, et elles seules", async () => {
    vi.mocked(fetchEcarts).mockResolvedValue({ keys: ["agenda_student_entry_enabled"] });
    renderPage();

    const ligne = await screen.findByText(/Accès de Massimo à la saisie de l'agenda/);
    expect(within(ligne.closest("tr") as HTMLElement).getByText("modifié")).toBeInTheDocument();
    // Une seule clé écartée ⇒ une seule ligne marquée.
    expect(screen.getAllByText("modifié")).toHaveLength(1);
  });

  it("🔴 n'affiche AUCUN chiffre quand la lecture échoue — zéro n'est pas une réponse", async () => {
    // La règle du §6 : un réglage faux affiché une seconde est un mensonge. « 0 réglage s'écarte
    // du défaut » se lirait « rien n'a été changé », ce qu'on ne sait justement pas.
    vi.mocked(fetchEcarts).mockRejectedValue(new Error("réseau"));
    renderPage();

    await screen.findByText(/Écarts illisibles/);
    expect(screen.queryByText(/s'écarte(nt)? du défaut/)).toBeNull();
  });

  it("désactive le filtre « modifiés » quand les écarts sont illisibles", async () => {
    // Le laisser actif rendrait une liste vide, qui se lirait « rien n'a changé » — le même
    // mensonge, par une autre porte.
    vi.mocked(fetchEcarts).mockRejectedValue(new Error("réseau"));
    renderPage();

    await screen.findByText(/Écarts illisibles/);
    expect(screen.getByRole("button", { name: "modifiés" })).toBeDisabled();
  });
});

// --- La recherche et les filtres ----------------------------------------------------------------

describe("chercher dans la carte", () => {
  it("filtre sur le nom, et le compteur suit", async () => {
    renderPage();
    await screen.findByText(/Tout ce qui se règle/);

    fireEvent.change(screen.getByLabelText("Chercher un réglage"), {
      target: { value: "whisper" },
    });

    expect(screen.getByText(/Modèle de dictée/)).toBeInTheDocument();
    expect(screen.queryByText(/Régime d'autonomie/)).toBeNull();
  });

  it("dit quand rien ne correspond, plutôt que de rendre un tableau vide", async () => {
    renderPage();
    await screen.findByText(/Tout ce qui se règle/);

    fireEvent.change(screen.getByLabelText("Chercher un réglage"), {
      target: { value: "zzzzz" },
    });

    expect(screen.getByText("Aucun réglage ne correspond.")).toBeInTheDocument();
  });

  it("une ligne « ailleurs » mène à sa page, une ligne « ici » à son onglet", async () => {
    renderPage();
    await screen.findByText(/Tout ce qui se règle/);

    // Trois réglages vivent dans l'onglet Autonomie — donc trois boutons portent ce libellé.
    // C'est normal : la colonne dit une DESTINATION, pas une identité de ligne.
    fireEvent.click(screen.getAllByRole("button", { name: /ici · Autonomie/ })[0]);

    await screen.findByText("ZETIS LEVELS");
  });
});
