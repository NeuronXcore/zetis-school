import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { type ContentRequest } from "@zetis/types";
import { DemandesPage } from "./DemandesPage";

vi.mock("../lib/contentRequests", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/contentRequests")>()),
  fetchContentRequests: vi.fn(),
  setContentRequestStatus: vi.fn(),
}));
import { fetchContentRequests, setContentRequestStatus } from "../lib/contentRequests";

vi.mock("../lib/notionRequests", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/notionRequests")>()),
  fetchNotionRequests: vi.fn(),
  resolveNotionRequest: vi.fn(),
}));
import { fetchNotionRequests, resolveNotionRequest } from "../lib/notionRequests";

// La modale charge l'année active/les chapitres — stubée (elle n'est pas le sujet de ces tests).
// ⚠️ Elle expose quand même `onDone` : c'est par là que remonte le verdict serveur `needs_lesson`,
// et une modale stubée muette rendrait ce chemin intestable.
vi.mock("../components/demandes/NotionRequestActionModal", () => ({
  NotionRequestActionModal: (p: {
    mode: string;
    onDone: (r?: { needsLesson: boolean; label: string }) => void;
  }) => (
    <div data-testid="notion-modal" data-mode={p.mode}>
      <button type="button" onClick={() => p.onDone({ needsLesson: true, label: "Thalès" })}>
        stub-done-orpheline
      </button>
      <button type="button" onClick={() => p.onDone({ needsLesson: false, label: "Thalès" })}>
        stub-done-rattachee
      </button>
    </div>
  ),
}));

const REQ: ContentRequest = {
  id: 5,
  skill_id: 116,
  skill_name: "Figure de style",
  subject_id: 1,
  subject_name: "Français",
  content_kind: "fiche",
  status: "pending",
  source: "chat_orchestrator",
  created_at: "2026-07-30T10:00:00Z",
};

function renderPage() {
  return render(
    <MemoryRouter>
      <DemandesPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(setContentRequestStatus).mockResolvedValue(REQ);
  vi.mocked(fetchNotionRequests).mockResolvedValue([]);
  vi.mocked(resolveNotionRequest).mockResolvedValue({} as never);
});

describe("DemandesPage", () => {
  it("groupe par matière et affiche notion + type", async () => {
    vi.mocked(fetchContentRequests).mockResolvedValue([REQ]);
    renderPage();
    expect(await screen.findByText("Figure de style")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Français" })).toBeTruthy();
    expect(screen.getByText(/🗒️ Fiche/)).toBeTruthy();
    // Lien vers la Couverture filtrée sur la matière (produire là-bas, pas ici).
    const link = screen.getByRole("link", { name: /Produire dans la Couverture/ });
    expect(link.getAttribute("href")).toBe("/couverture?subject=1");
  });

  it("« Fait » trie via le module content_requests et retire la ligne", async () => {
    vi.mocked(fetchContentRequests).mockResolvedValue([REQ]);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Fait" }));
    expect(setContentRequestStatus).toHaveBeenCalledWith(5, "done");
    await waitFor(() => expect(screen.getByText(/Aucune demande en attente/)).toBeTruthy());
  });

  it("état vide quand aucune demande", async () => {
    vi.mocked(fetchContentRequests).mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/Aucune demande en attente/)).toBeTruthy();
  });

  it("section hors-programme : « Créer la leçon » ouvre la modale, « Ignorer » écarte", async () => {
    vi.mocked(fetchContentRequests).mockResolvedValue([]);
    vi.mocked(fetchNotionRequests).mockResolvedValue([
      { id: 9, text: "le verbe être en espagnol", status: "pending", subject_id: null, created_at: "x" },
    ]);
    renderPage();
    expect(await screen.findByText(/le verbe être en espagnol/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: /À ajouter au programme/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Créer la leçon" }));
    expect(screen.getByTestId("notion-modal").getAttribute("data-mode")).toBe("lesson");
  });

  it("« Ignorer » une notion hors-programme appelle resolveNotionRequest(dismissed)", async () => {
    vi.mocked(fetchContentRequests).mockResolvedValue([]);
    vi.mocked(fetchNotionRequests).mockResolvedValue([
      { id: 9, text: "pythagore", status: "pending", subject_id: null, created_at: "x" },
    ]);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Ignorer" }));
    expect(resolveNotionRequest).toHaveBeenCalledWith(9, "dismissed");
  });


  // --- « + Programme » dit ce qu'il ne fait pas (constat du 2026-08-03) -----------------------

  it("signale une notion ajoutée que ZETIS ne pourra pas produire", async () => {
    // ⚠️ « + Programme » crée une notion ORPHELINE : aucune leçon ne la porte, donc
    // `equip_notion` renvoie `has_lesson=false` et rien ne sera JAMAIS généré pour elle. Le
    // bouton, lui, se lit « traité ». Le constat vient du serveur (`needs_lesson`), pas d'une
    // déduction du front.
    vi.mocked(fetchContentRequests).mockResolvedValue([]);
    vi.mocked(fetchNotionRequests).mockResolvedValue([
      { id: 9, text: "Thalès", status: "pending", subject_id: null, created_at: "x" },
    ]);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "+ Programme" }));
    fireEvent.click(screen.getByRole("button", { name: "stub-done-orpheline" }));

    expect(await screen.findByText(/ZETIS ne produira rien pour elle/)).toBeInTheDocument();
    // Le geste qui répare est à côté du constat — sinon il désigne un problème sans issue.
    expect(screen.getByRole("link", { name: /rattacher dans le Programme/ })).toHaveAttribute(
      "href",
      "/programme",
    );
  });

  it("ne crie pas au loup quand une leçon porte déjà la notion", async () => {
    // Un avertissement systématique s'apprend à s'ignorer. Le serveur calcule, le front obéit.
    vi.mocked(fetchContentRequests).mockResolvedValue([]);
    vi.mocked(fetchNotionRequests).mockResolvedValue([
      { id: 9, text: "Thalès", status: "pending", subject_id: null, created_at: "x" },
    ]);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "+ Programme" }));
    fireEvent.click(screen.getByRole("button", { name: "stub-done-rattachee" }));

    await waitFor(() => expect(screen.queryByTestId("notion-modal")).toBeNull());
    expect(screen.queryByText(/ZETIS ne produira rien/)).toBeNull();
  });
});
