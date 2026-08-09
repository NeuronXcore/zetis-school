// La ligne « Travail » dit ce qu'elle a produit — addendum ADR-0041.
//
// 🔴 Le verrou de ce fichier est `un travail qui n'a RIEN produit n'offre aucun lien`. Avant cet
// addendum, trois issues opposées rendaient trois lignes identiques : un `Équipement · fait · 0 s`
// qui n'avait rien fabriqué se lisait exactement comme une production réussie. La réparation ne
// doit pas se retourner en son contraire — un lien sur « rien produit » rattacherait une pièce
// préexistante et ferait croire que ce travail-là l'a faite.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { type Journal, type JournalTravail } from "@zetis/types";
import { JournalPage } from "./JournalPage";

vi.mock("../lib/journal", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/journal")>()),
  fetchJournal: vi.fn(),
  previewRemoval: vi.fn(),
  removePiece: vi.fn(),
}));
import { fetchJournal } from "../lib/journal";

const TRAVAIL: JournalTravail = {
  id: 768,
  job_type: "equip_notion",
  label: "Équipement · Quotient de relatifs",
  status: "succeeded",
  trigger: "manual",
  skill_id: 64,
  skill_name: "Quotient de relatifs",
  created_at: "2026-08-09T02:10:00Z",
  started_at: "2026-08-09T02:10:00Z",
  finished_at: "2026-08-09T02:10:00Z",
  duration_ms: 50,
  error: null,
  production: null,
};

function journalAvec(travail: JournalTravail): Journal {
  return { runs: [], travaux: [travail], travaux_exclus: null, has_more: false, total: 0 };
}

function afficher(travail: JournalTravail) {
  vi.mocked(fetchJournal).mockResolvedValue(journalAvec(travail));
  return render(
    <MemoryRouter>
      <JournalPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(fetchJournal).mockReset();
});

describe("La ligne « Travail » dit ce qu'elle a produit", () => {
  it("affiche le résumé rendu par le serveur", async () => {
    afficher({
      ...TRAVAIL,
      production: { texte: "3 cartes créées", ton: "succes", route: "/cartes-revision?subject=2&focus=149" },
    });
    expect(await screen.findByText("3 cartes créées")).toBeInTheDocument();
  });

  it("offre le lien quand le travail a produit quelque chose", async () => {
    afficher({
      ...TRAVAIL,
      production: { texte: "cours rédigé", ton: "succes", route: "/programme?subject=1&chapter=44&lesson=114" },
    });
    await screen.findByText("cours rédigé");
    expect(screen.getByRole("link", { name: /voir/ })).toHaveAttribute(
      "href",
      "/programme?subject=1&chapter=44&lesson=114",
    );
  });

  it("🔒 un travail qui n'a RIEN produit n'offre AUCUN lien", async () => {
    // Le cas qui a déclenché le chantier — et le sens de la réparation : rendre visible qu'il n'y
    // a rien, sans jamais rattacher à ce travail une pièce qu'un autre moment avait faite.
    afficher({
      ...TRAVAIL,
      production: {
        texte: "rien produit — les 5 pièces existaient déjà",
        ton: "avertissement",
        route: null,
      },
    });
    expect(await screen.findByText(/rien produit/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /voir/ })).toBeNull();
  });

  it("« rien produit » est ambre, jamais rouge", async () => {
    // Ne rien produire parce que tout existait déjà est un résultat CORRECT. Le rouge en ferait une
    // panne, et Papa irait réparer ce qui marche — même distinction que l'ambre de l'adr-0048.
    afficher({
      ...TRAVAIL,
      production: { texte: "aucune carte nouvelle", ton: "avertissement", route: null },
    });
    const pastille = await screen.findByText("aucune carte nouvelle");
    expect(pastille.className).toContain("papa-warn");
    expect(pastille.className).not.toContain("red");
  });

  it("un travail sans résumé rend la ligne d'avant, sans trou", async () => {
    // Dégradation propre : un `job_type` sans règle, ou un travail encore en file, n'affiche
    // simplement rien de plus — jamais une case vide ni un « undefined ».
    afficher({ ...TRAVAIL, production: null });
    expect(await screen.findByText(/Quotient de relatifs/)).toBeInTheDocument();
    expect(screen.getByText(/lancé par vous · hors lot/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /voir/ })).toBeNull();
  });
});
