import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DiagnosticPage } from "./DiagnosticPage";
import type { DiagnosticListItem, DiagnosticQuiz, DiagnosticResult } from "../lib/diagnostic";

// 🔴 LES QUATRE SORTIES D'UNE PASSATION — et le fait qu'AUCUNE ne laisse l'observation allumée.
//
// Pourquoi ce fichier est séparé de `DiagnosticPage.test.tsx` : celui-là teste ce que la page
// MONTRE, et ses assertions passent par le DOM. Ici on teste ce que la page ÉTEINT, et ça ne se
// voit nulle part. Deux natures, deux fichiers.
//
// Ce que ça protège : `useObservationPassation` mesure `ms_total` et `sorties_ecran` depuis le
// dernier `demarrer()`. Si une sortie de passation ne rappelle pas `terminer()`, l'observation
// survit — plein écran, écouteurs et chronomètre — et le `demarrer()` SUIVANT repart sur un état
// sale. Les faits de la passation suivante sont alors faux, et l'ADR-0048 les traitera comme des
// faits. Le défaut est invisible à l'écran ET invisible dans le résultat servi à Massimo.
//
// ⚠️ Ces tests décrivent le comportement ATTENDU. Trois d'entre eux sont ROUGES sur le code du
// 2026-08-16 : `terminer()` n'est appelé qu'à la soumission réussie. Ils accompagnent le
// correctif, ils ne le remplacent pas.

const observation = vi.hoisted(() => ({
  demarrer: vi.fn(),
  noterReponse: vi.fn(),
  recolter: vi.fn(() => ({ conditions: {}, parQuestion: new Map() })),
  terminer: vi.fn(),
}));

vi.mock("../hooks/useObservationPassation", () => ({
  useObservationPassation: () => observation,
}));

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
    questions_count: 1,
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
  gaps: [],
};

function afficher() {
  return render(
    <MemoryRouter>
      <DiagnosticPage />
    </MemoryRouter>,
  );
}

async function lancerLaPassation() {
  fireEvent.click(await screen.findByRole("button", { name: /Commencer/ }));
  return screen.findByRole("button", { name: /Envoyer mes réponses/ });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchDiagnostics).mockResolvedValue(LISTE);
  vi.mocked(fetchDiagnosticQuiz).mockResolvedValue(QUIZ);
  vi.mocked(submitDiagnostic).mockResolvedValue(RESULTAT);
});

// ==================================================================================================
// Le geste d'ouverture — il doit précéder tout `await`
// ==================================================================================================

describe("le démarrage", () => {
  it("🔴 `demarrer()` est appelé AVANT le chargement du quiz", async () => {
    // L'API de plein écran exige le contexte du geste utilisateur : demandée après un `await`,
    // elle est refusée SILENCIEUSEMENT sur tous les navigateurs. L'ordre est la décision.
    let quizDemande = false;
    vi.mocked(fetchDiagnosticQuiz).mockImplementation(async () => {
      quizDemande = true;
      expect(observation.demarrer).toHaveBeenCalled();
      return QUIZ;
    });

    afficher();
    fireEvent.click(await screen.findByRole("button", { name: /Commencer/ }));

    await waitFor(() => expect(quizDemande).toBe(true));
    expect(observation.demarrer).toHaveBeenCalledTimes(1);
  });
});

// ==================================================================================================
// Les quatre sorties
// ==================================================================================================

describe("les quatre sorties d'une passation éteignent l'observation", () => {
  it("1 · soumission réussie — le seul chemin couvert avant ce fichier", async () => {
    afficher();
    await lancerLaPassation();
    fireEvent.click(screen.getByLabelText("A", { exact: false }));
    fireEvent.click(screen.getByRole("button", { name: /Envoyer mes réponses/ }));

    await screen.findByText(/C'est noté/);
    expect(observation.terminer).toHaveBeenCalledTimes(1);
  });

  it("2 · ← Annuler — Massimo renonce, l'écran revient, l'observation doit s'éteindre", async () => {
    afficher();
    await lancerLaPassation();

    fireEvent.click(screen.getByRole("button", { name: /Annuler/ }));

    await screen.findByRole("button", { name: /Commencer/ });
    expect(observation.terminer).toHaveBeenCalledTimes(1);
  });

  it("3 · échec de chargement du quiz — on n'entre jamais en passation", async () => {
    vi.mocked(fetchDiagnosticQuiz).mockRejectedValue(new Error("réseau"));

    afficher();
    fireEvent.click(await screen.findByRole("button", { name: /Commencer/ }));

    // La page reste sur la proposition et dit ce qui s'est passé.
    await waitFor(() => expect(observation.terminer).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("button", { name: /Envoyer mes réponses/ })).toBeNull();
  });

  it("4 · démontage — Massimo navigue ailleurs pendant la passation", async () => {
    const { unmount } = afficher();
    await lancerLaPassation();

    unmount();

    expect(observation.terminer).toHaveBeenCalledTimes(1);
  });

  it("🔴 une passation abandonnée puis relancée repart d'un état PROPRE", async () => {
    // Le vrai dégât n'est pas la session qui fuit : c'est la SUIVANTE, dont les faits
    // (`ms_total`, `sorties_ecran`) seraient hérités de la précédente.
    afficher();
    await lancerLaPassation();
    fireEvent.click(screen.getByRole("button", { name: /Annuler/ }));
    await screen.findByRole("button", { name: /Commencer/ });

    fireEvent.click(screen.getByRole("button", { name: /Commencer/ }));
    await screen.findByRole("button", { name: /Envoyer mes réponses/ });

    expect(observation.terminer).toHaveBeenCalledTimes(1);
    expect(observation.demarrer).toHaveBeenCalledTimes(2);
    // Chaque démarrage suit sa propre fin : jamais deux démarrages sans fin entre eux.
    expect(observation.demarrer.mock.invocationCallOrder[1]).toBeGreaterThan(
      observation.terminer.mock.invocationCallOrder[0],
    );
  });
});

// ==================================================================================================
// Le chemin d'échec de la soumission — celui qui perd une passation entière
// ==================================================================================================

describe("l'échec de soumission", () => {
  it("affiche l'erreur et NE PERD PAS les réponses de Massimo", async () => {
    vi.mocked(submitDiagnostic).mockRejectedValue(new Error("réseau"));

    afficher();
    await lancerLaPassation();
    fireEvent.click(screen.getByLabelText("A", { exact: false }));
    fireEvent.click(screen.getByRole("button", { name: /Envoyer mes réponses/ }));

    // L'écran de passation reste : reperdre dix minutes de travail sur une coupure réseau
    // serait la punition d'un défaut qui n'est pas le sien.
    await screen.findByRole("button", { name: /Envoyer mes réponses/ });
    expect(screen.queryByText(/C'est noté/)).toBeNull();
  });

  it("🔴 ne dit RIEN de technique — pas de code HTTP, pas de « erreur réseau »", async () => {
    vi.mocked(submitDiagnostic).mockRejectedValue(new Error("HTTP 500 Internal Server Error"));

    afficher();
    await lancerLaPassation();
    fireEvent.click(screen.getByLabelText("A", { exact: false }));
    fireEvent.click(screen.getByRole("button", { name: /Envoyer mes réponses/ }));

    await waitFor(() => expect(submitDiagnostic).toHaveBeenCalled());
    const texte = document.body.textContent ?? "";
    expect(texte).not.toMatch(/HTTP|500|Internal Server|undefined|\[object/i);
  });
});

// ==================================================================================================
// Ce que la soumission emporte — le contrat, vu depuis la page
// ==================================================================================================

describe("la récolte", () => {
  it("`recolter()` est appelé une seule fois, à la soumission", async () => {
    afficher();
    await lancerLaPassation();
    fireEvent.click(screen.getByLabelText("A", { exact: false }));
    fireEvent.click(screen.getByRole("button", { name: /Envoyer mes réponses/ }));

    await screen.findByText(/C'est noté/);
    expect(observation.recolter).toHaveBeenCalledTimes(1);
  });

  it("🔴 n'envoie JAMAIS `choice_index: -1` — une réponse absente n'est pas une réponse", async () => {
    // Le bouton est désactivé tant que tout n'est pas répondu, donc ce chemin est réputé
    // inatteignable. « Réputé inatteignable » est exactement ce qu'on fige par un test :
    // le jour où une question est retirée du quiz entre l'affichage et l'envoi, la valeur
    // sentinelle partirait en base au lieu de lever.
    afficher();
    await lancerLaPassation();
    fireEvent.click(screen.getByLabelText("A", { exact: false }));
    fireEvent.click(screen.getByRole("button", { name: /Envoyer mes réponses/ }));

    await screen.findByText(/C'est noté/);
    const [, charge] = vi.mocked(submitDiagnostic).mock.calls[0] as unknown as [
      number,
      { answers: { question_id: number; choice_index: number }[] },
    ];
    for (const r of charge.answers) {
      expect(r.choice_index).toBeGreaterThanOrEqual(0);
    }
  });

  it("l'envoi reste bloqué tant qu'une question n'a pas de réponse", async () => {
    vi.mocked(fetchDiagnosticQuiz).mockResolvedValue({
      ...QUIZ,
      questions: [
        ...QUIZ.questions,
        { id: 2, prompt: "Q2 ?", choices: ["A", "B"], skill_id: 4, skill_name: "Accords" },
      ],
    });

    afficher();
    const envoyer = await lancerLaPassation();
    expect(envoyer).toBeDisabled();

    fireEvent.click(screen.getAllByLabelText("A", { exact: false })[0]);
    expect(envoyer).toBeDisabled();

    fireEvent.click(screen.getAllByLabelText("A", { exact: false })[1]);
    expect(envoyer).toBeEnabled();
  });
});
