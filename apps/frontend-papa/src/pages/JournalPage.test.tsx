// Journal de production (ADR-0034) — les verrous de la page Papa.
//
// Deux d'entre eux sont des verrous de DOCTRINE, pas de comportement : ils tomberont le jour où
// quelqu'un ajoutera un compteur de provenance, ou un bouton « Retirer » sur un contenu que
// Massimo a déjà ouvert. C'est exactement ce qu'on veut d'eux.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { type Journal, type JournalRun } from "@zetis/types";
import { JournalPage } from "./JournalPage";

vi.mock("../lib/journal", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/journal")>()),
  fetchJournal: vi.fn(),
  previewRemoval: vi.fn(),
  removePiece: vi.fn(),
}));
import { fetchJournal, previewRemoval, removePiece } from "../lib/journal";

const RUN: JournalRun = {
  id: 7,
  status: "done",
  trigger: "manual",
  authorized_by: "parent_direct",
  chapter_id: 3,
  total_notions: 2,
  done_notions: 2,
  current_skill_id: null,
  current_skill_name: null,
  created_at: "2026-08-02T18:00:00Z",
  started_at: "2026-08-02T18:01:00Z",
  finished_at: "2026-08-02T18:14:00Z",
  events: [
    {
      skill_id: 12,
      skill_name: "Additionner des fractions",
      piece: "fiche",
      outcome: "generated",
      detail: null,
      created_at: "2026-08-02T18:02:00Z",
    },
    {
      skill_id: 13,
      skill_name: "Notion en brouillon",
      piece: null,
      outcome: "blocked",
      detail: "Cours à valider — ZETIS ne valide pas les cours à votre place.",
      created_at: "2026-08-02T18:01:30Z",
    },
  ],
  pieces: [
    {
      kind: "fiche",
      id: 41,
      label: "Fractions — l'essentiel",
      validated_by: "parent_bulk",
      skill_id: 12,
      skill_name: "Additionner des fractions",
      consumed: false,
    },
    {
      kind: "mindmap",
      id: 42,
      label: "Carte des fractions",
      validated_by: "parent_bulk",
      skill_id: 12,
      skill_name: "Additionner des fractions",
      consumed: true,
    },
  ],
};

const JOURNAL: Journal = { runs: [RUN], has_more: false };

function renderPage() {
  return render(
    <MemoryRouter>
      <JournalPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(fetchJournal).mockResolvedValue(JOURNAL);
  vi.mocked(previewRemoval).mockReset();
  vi.mocked(removePiece).mockReset();
});

describe("JournalPage", () => {
  it("rend le lot, ses pièces et son déclencheur", async () => {
    renderPage();
    expect(await screen.findByText(/Lot #7/)).toBeInTheDocument();
    expect(screen.getByText(/Vous l'avez lancé/)).toBeInTheDocument();
    expect(screen.getByText("Fractions — l'essentiel")).toBeInTheDocument();
  });

  it("dit que sa portée s'arrête aux lots", async () => {
    // Un journal qui paraît exhaustif sans l'être est pire qu'un journal qui borne son sujet :
    // le Conseil de classe et la composition champion équipent HORS lot.
    renderPage();
    await screen.findByText(/Lot #7/);
    expect(screen.getByText(/Conseil de classe/)).toBeInTheDocument();
  });

  it("explique un lot sans contenu au lieu de le laisser vide", async () => {
    // ⚠️ Vu à l'écran le 2026-08-03 sur les vrais lots du 2 août : un lot « Terminé · 3/3
    // notions » sans une ligne se lit comme une panne, alors que c'est l'inverse.
    vi.mocked(fetchJournal).mockResolvedValue({
      runs: [{ ...RUN, id: 6, events: [], pieces: [] }],
      has_more: false,
    });
    renderPage();
    expect(await screen.findByText(/Aucun contenu neuf rattaché à ce lot/)).toBeInTheDocument();
  });

  it("rend visible une notion que le gate a écartée, avec son motif", async () => {
    // Le §7 rendu lisible : une notion silencieusement omise se lirait comme un échec de
    // production, alors que c'est un gate qui fonctionne.
    renderPage();
    await screen.findByText(/Lot #7/);
    fireEvent.click(screen.getByText(/Détail de ce que ZETIS a fait/));
    expect(screen.getByText("non produit")).toBeInTheDocument();
    expect(screen.getByText(/ZETIS ne valide pas les cours/)).toBeInTheDocument();
  });

  // --- LES VERROUS ------------------------------------------------------------------------

  it("n'offre AUCUN retrait sur un contenu déjà ouvert par Massimo", async () => {
    // §G.3 : la consommation ferme la fenêtre, pas l'horloge. La mindmap est `consumed`.
    renderPage();
    await screen.findByText(/Lot #7/);
    // Une seule pièce est retirable : la fiche. La mindmap dit pourquoi elle ne l'est plus.
    expect(screen.getAllByRole("button", { name: "Retirer" })).toHaveLength(1);
    expect(screen.getByText("Déjà ouvert par Massimo")).toBeInTheDocument();
  });

  it("annonce la portée du retrait AVANT le geste, et l'exécute", async () => {
    vi.mocked(previewRemoval).mockResolvedValue({
      removable: true,
      reason: null,
      cascade: { fiche: [41], srs: [90, 91] },
    });
    vi.mocked(removePiece).mockResolvedValue({ removed: { fiche: 1 } });

    renderPage();
    await screen.findByText(/Lot #7/);
    fireEvent.click(screen.getByRole("button", { name: "Retirer" }));

    // La cascade est ANNONCÉE : un veto qui surprend n'est pas exercé deux fois.
    expect(await screen.findByText(/Ce retrait emporte aussi/)).toBeInTheDocument();
    expect(screen.getByText(/2 Carte de révision/)).toBeInTheDocument();

    // ⚠️ Le bouton de la LIGNE reste dans le DOM derrière la modale : la requête est ambiguë par
    // construction. Le dernier est celui de la modale, rendue après la liste.
    const boutons = screen.getAllByRole("button", { name: "Retirer" });
    fireEvent.click(boutons[boutons.length - 1]);
    await waitFor(() => expect(removePiece).toHaveBeenCalledWith("fiche", 41));
  });

  it("sur un refus, la modale ferme au lieu de proposer un geste qui échouerait", async () => {
    // ⚠️ Verrou de doctrine. Une commande qui ne fait rien est un piège — c'est le motif exact
    // du verrou écrit sur `ParametresPage`, et il vaut pour toutes les pages Papa. Ici le
    // serveur refuserait en 409 : le bouton ne doit pas proposer le geste.
    vi.mocked(previewRemoval).mockResolvedValue({
      removable: false,
      reason: "Massimo a déjà ouvert un contenu tiré de ce cours.",
      cascade: {},
    });

    renderPage();
    await screen.findByText(/Lot #7/);
    // Un seul « Retirer » avant ouverture : celui de la ligne.
    expect(screen.getAllByRole("button", { name: "Retirer" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Retirer" }));

    expect(await screen.findByText(/Massimo a déjà ouvert un contenu/)).toBeInTheDocument();
    // La modale n'AJOUTE aucun « Retirer » : il en reste un, celui de la ligne. Si elle en
    // ajoutait un, il partirait en 409 — la commande qui ne fait rien.
    expect(screen.getAllByRole("button", { name: "Retirer" })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
    expect(removePiece).not.toHaveBeenCalled();
  });

  it("ne totalise AUCUNE provenance", async () => {
    // §F.2 : la provenance est un fait, jamais un reproche — elle s'affiche par objet et ne se
    // totalise pas. Ce test tombera le jour où quelqu'un ajoutera « 31 servis sans relecture ».
    renderPage();
    await screen.findByText(/Lot #7/);
    const body = document.body.textContent ?? "";
    expect(body).not.toMatch(/servis? sans relecture/i);
    expect(body).not.toMatch(/\d+\s*%\s*(par ZETIS|automatis)/i);
    // La provenance PAR OBJET, elle, doit bien être là.
    expect(screen.getAllByText("Vous, en lot").length).toBeGreaterThan(0);
  });
});
