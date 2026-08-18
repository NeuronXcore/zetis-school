import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { type ActiveSchoolYear, type SchoolYear } from "@zetis/types";
import { AnneesScolairesPage } from "./AnneesScolairesPage";

// Un test de rendu par état de page (liste / vide / erreur) + les trois mutations
// (création, activation, édition inline), API mockée — convention ProgrammePage.test.

vi.mock("../lib/schoolYears", () => ({
  fetchSchoolYears: vi.fn(),
  createSchoolYear: vi.fn(),
  patchSchoolYear: vi.fn(),
}));

// Chips des matières : lecture existante du module curriculum, mockée elle aussi.
vi.mock("../lib/curriculum", () => ({
  fetchActiveSchoolYear: vi.fn(),
}));

import { fetchActiveSchoolYear } from "../lib/curriculum";
import { createSchoolYear, fetchSchoolYears, patchSchoolYear } from "../lib/schoolYears";

function year(over: Partial<SchoolYear>): SchoolYear {
  return {
    id: 1,
    label: "2026-2027",
    level: "4e",
    starts_on: "2026-09-01",
    ends_on: "2027-07-04",
    status: "active",
    program_version: "2020",
    ...over,
  };
}

const ACTIVE_SUBJECTS: ActiveSchoolYear = {
  id: 1,
  label: "2026-2027",
  level: "4e",
  subjects: [
    { id: 10, subject_id: 1, subject_name: "Mathématiques", subject_slug: "mathematiques", subject_icon: "➗", status: "active" },
    { id: 11, subject_id: 2, subject_name: "Français", subject_slug: "francais", subject_icon: "📖", status: "active" },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter>
      <AnneesScolairesPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(fetchSchoolYears).mockReset();
  vi.mocked(createSchoolYear).mockReset();
  vi.mocked(patchSchoolYear).mockReset();
  vi.mocked(fetchActiveSchoolYear).mockReset();
  vi.mocked(fetchActiveSchoolYear).mockResolvedValue(ACTIVE_SUBJECTS);
});

describe("AnneesScolairesPage", () => {
  it("état liste : carte active (dates, résolution programme, chips, lien) + historique", async () => {
    vi.mocked(fetchSchoolYears).mockResolvedValue([
      year({ id: 2 }),
      year({ id: 1, label: "2025-2026", level: "5e", status: "archived", program_version: null }),
    ]);

    renderPage();

    expect(
      await screen.findByText("Année active : 2026-2027 · 4e"),
    ).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("01 sept. 2026 → 04 juil. 2027")).toBeInTheDocument();
    // Résolution INFORMATIVE niveau → cycle + version (ADR-0009 §5).
    expect(screen.getByText("Programme : cycle 4 · version 2020")).toBeInTheDocument();
    // Chips matières en lecture seule (lecture curriculum existante).
    const chips = screen.getByRole("list", { name: "Matières de l'année" });
    expect(within(chips).getByText("Mathématiques")).toBeInTheDocument();
    expect(within(chips).getByText("Français")).toBeInTheDocument();
    // Le pont unique vers le contenu : lien vers la route réelle de la page Programme.
    expect(screen.getByRole("link", { name: "Voir le programme →" })).toHaveAttribute(
      "href",
      "/programme",
    );
    // Historique : ligne compacte + badge.
    expect(screen.getByText("2025-2026 · 5e")).toBeInTheDocument();
    expect(screen.getByText("Archivée")).toBeInTheDocument();
    // AUCUN sélecteur de mode nulle part (ADR-0009 §4 — ancienne page dépréciée).
    expect(screen.queryByText("Full IA")).not.toBeInTheDocument();
    expect(screen.queryByText("Mode de configuration")).not.toBeInTheDocument();
    expect(screen.queryByText("Importer un programme")).not.toBeInTheDocument();
  });

  it("état vide : EmptyState avec le CTA « Créer une année »", async () => {
    vi.mocked(fetchSchoolYears).mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText("Aucune année scolaire")).toBeInTheDocument();
    // CTA de l'EmptyState + bouton du header.
    expect(
      screen.getAllByRole("button", { name: "+ Créer une année" }).length,
    ).toBeGreaterThanOrEqual(2);
    // Pas d'année active → la lecture des chips n'est même pas tentée.
    expect(vi.mocked(fetchActiveSchoolYear)).not.toHaveBeenCalled();
  });

  it("état erreur : message backend verbatim + bouton réessayer", async () => {
    vi.mocked(fetchSchoolYears).mockRejectedValue(new Error("Erreur 500"));

    renderPage();

    expect(await screen.findByText("Erreur 500")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeInTheDocument();
  });

  it("création : formulaire inline → POST (draft côté backend) → liste rechargée", async () => {
    vi.mocked(fetchSchoolYears)
      .mockResolvedValueOnce([year({ id: 2 })])
      .mockResolvedValueOnce([
        year({ id: 3, label: "2027-2028", level: "3e", status: "draft", program_version: null }),
        year({ id: 2 }),
      ]);
    vi.mocked(createSchoolYear).mockResolvedValue(
      year({ id: 3, label: "2027-2028", level: "3e", status: "draft", program_version: null }),
    );

    renderPage();
    // 🔴 Le bouton EXISTE pendant le chargement, mais `disabled` (`data.loading`, page L25).
    // `findByRole` le rend dès qu'il entre dans le DOM — RTL ne filtre pas les boutons désactivés —
    // et `fireEvent.click` sur un bouton désactivé ne déclenche RIEN : `setCreating(true)` n'a
    // jamais lieu, le formulaire ne s'ouvre pas, et `getByLabelText("Libellé")` échoue. Invisible
    // en local (les mocks résolvent dans la microtâche suivante), fatal sur les 2 cœurs de la CI.
    // Il ne suffit donc pas que le bouton EXISTE : il doit être ACTIONNABLE.
    const creer = await screen.findByRole("button", { name: "+ Créer une année" });
    await waitFor(() => expect(creer).toBeEnabled());
    fireEvent.click(creer);

    fireEvent.change(screen.getByLabelText("Libellé"), {
      target: { value: "2027-2028" },
    });
    fireEvent.change(screen.getByLabelText("Niveau"), { target: { value: "3e" } });
    fireEvent.change(screen.getByLabelText("Date de début"), {
      target: { value: "2027-09-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Créer" }));

    await waitFor(() =>
      expect(vi.mocked(createSchoolYear)).toHaveBeenCalledWith({
        label: "2027-2028",
        level: "3e",
        starts_on: "2027-09-01",
        ends_on: null,
      }),
    );
    // Le brouillon apparaît dans l'historique, badge ambre.
    expect(await screen.findByText("2027-2028 · 3e")).toBeInTheDocument();
    expect(screen.getByText("Brouillon")).toBeInTheDocument();
  });

  it("activation : « Activer » → confirmation (archivage annoncé) → PATCH status", async () => {
    vi.mocked(fetchSchoolYears).mockResolvedValue([
      year({ id: 2 }),
      year({ id: 3, label: "2027-2028", level: "3e", status: "draft", program_version: null }),
    ]);
    vi.mocked(patchSchoolYear).mockResolvedValue(
      year({ id: 3, label: "2027-2028", level: "3e", status: "active", program_version: null }),
    );

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Activer" }));

    // Confirmation : l'archivage de l'année active courante est annoncé.
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("« 2027-2028 · 3e » deviendra l'année active");
    expect(dialog).toHaveTextContent("« 2026-2027 » passera en Archivée");
    fireEvent.click(within(dialog).getByRole("button", { name: "Activer" }));

    await waitFor(() =>
      expect(vi.mocked(patchSchoolYear)).toHaveBeenCalledWith(3, { status: "active" }),
    );
  });

  it("édition inline : Modifier → libellé + dates (jamais le niveau) → PATCH", async () => {
    vi.mocked(fetchSchoolYears).mockResolvedValue([year({ id: 2 })]);
    vi.mocked(patchSchoolYear).mockResolvedValue(year({ id: 2, label: "2026-2027 (bis)" }));

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Modifier" }));

    // Le niveau n'est pas éditable — rappel affiché dans le formulaire.
    expect(
      screen.getByText("Le niveau (4e) n'est pas modifiable une fois l'année créée."),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Libellé"), {
      target: { value: "2026-2027 (bis)" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() =>
      expect(vi.mocked(patchSchoolYear)).toHaveBeenCalledWith(2, {
        label: "2026-2027 (bis)",
        starts_on: "2026-09-01",
        ends_on: "2027-07-04",
      }),
    );
  });

  it("aucune année active mais un historique : indication au lieu de la carte", async () => {
    vi.mocked(fetchSchoolYears).mockResolvedValue([
      year({ id: 1, label: "2025-2026", level: "5e", status: "archived" }),
    ]);

    renderPage();

    expect(
      await screen.findByText("Aucune année active — active une année de l'historique ci-dessous."),
    ).toBeInTheDocument();
    expect(vi.mocked(fetchActiveSchoolYear)).not.toHaveBeenCalled();
  });
});
