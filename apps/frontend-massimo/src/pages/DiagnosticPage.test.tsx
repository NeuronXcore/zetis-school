import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DiagnosticPage } from "./DiagnosticPage";
import type { DiagnosticListItem, DiagnosticQuiz, DiagnosticResult } from "../lib/diagnostic";

vi.mock("../lib/diagnostic", () => ({
  fetchDiagnostics: vi.fn(),
  fetchDiagnosticQuiz: vi.fn(),
  submitDiagnostic: vi.fn(),
  fetchMonResultat: vi.fn(),
}));
import { fetchDiagnostics, fetchDiagnosticQuiz, submitDiagnostic } from "../lib/diagnostic";

const LISTE: DiagnosticListItem[] = [
  {
    quiz_id: 7,
    title: "Diagnostic — Français",
    subject: "Français",
    subject_slug: "francais",
    questions_count: 2,
    taken_at: null,
    last_attempt_id: null,
    measured_at: null,
  },
];

const QUIZ: DiagnosticQuiz = {
  quiz_id: 7,
  title: "Diagnostic — Français",
  subject: "Français",
  questions: [
    { id: 1, prompt: "Q1 ?", choices: ["A", "B"], skill_id: 3, skill_name: "Temps du récit" },
  ],
};

const RESULTAT: DiagnosticResult = {
  attempt_id: 42,
  quiz_id: 7,
  subject: "Français",
  completed_at: "2026-07-05T10:00:00+00:00",
  strengths: ["Temps du récit"],
  gaps: [{ skill_id: 9, skill_name: "Accord du participe passé" }],
};

async function allerJusquAuResultat() {
  render(<DiagnosticPage />);
  fireEvent.click(await screen.findByText("Diagnostic — Français"));
  fireEvent.click(await screen.findByLabelText("A", { exact: false }));
  fireEvent.click(screen.getByRole("button", { name: /Envoyer mes réponses/ }));
  await screen.findByText(/C'est noté/);
}

describe("DiagnosticPage — l'écran de résultat", () => {
  beforeEach(() => {
    vi.mocked(fetchDiagnostics).mockResolvedValue(LISTE);
    vi.mocked(fetchDiagnosticQuiz).mockResolvedValue(QUIZ);
    vi.mocked(submitDiagnostic).mockResolvedValue(RESULTAT);
  });

  /** 🔴 LE VERROU LEXICAL de l'ADR-0044 Décision 5.
   *
   * ⚠️ **Ce qu'il NE PEUT PAS voir, et il faut le savoir en le lisant** : il balaie le TEXTE
   * rendu. Un pourcentage affiché autrement qu'en clair — dans une image, une largeur de barre,
   * un `aria-label`, un attribut `title` — lui échapperait. Il est le second d'une PAIRE : son
   * jumeau comportemental (`test_diagnostic_resultat_eleve.py`) garantit que le nombre n'arrive
   * même pas du serveur, ce qui rend l'affichage impossible quelle que soit sa forme.
   */
  it("n'affiche AUCUN pourcentage — ce que la spec prescrit depuis l'étape 14", async () => {
    await allerJusquAuResultat();

    expect(document.body.textContent).not.toMatch(/\d\s*%/);
    expect(screen.queryByText(/Score/i)).toBeNull();
    expect(screen.queryByText(/note/i)?.textContent).not.toMatch(/\d/);
  });

  it("montre les forces et les prochaines étapes — l'anti-test-à-vide du verrou", async () => {
    // Sans ces deux assertions, un écran de résultat VIDE passerait le verrou ci-dessus.
    await allerJusquAuResultat();

    expect(screen.getByText("Temps du récit")).toBeTruthy();
    expect(screen.getByText(/Accord du participe passé/)).toBeTruthy();
  });

  it("garde « Refaire ↻ » pour un diagnostic déjà passé, « Commencer → » sinon", async () => {
    // Le seul changement visible de la Session A : le libellé se décide sur `taken_at`, plus
    // sur un booléen `taken`. Aucun test ne couvrait cette page — c'était une dette ouverte.
    vi.mocked(fetchDiagnostics).mockResolvedValue([
      LISTE[0],
      { ...LISTE[0], quiz_id: 8, title: "Diagnostic — Maths", taken_at: "2026-07-01T09:00:00Z" },
    ]);
    render(<DiagnosticPage />);

    await waitFor(() => expect(screen.getByText("Commencer →")).toBeTruthy());
    expect(screen.getByText("Refaire ↻")).toBeTruthy();
  });
});
