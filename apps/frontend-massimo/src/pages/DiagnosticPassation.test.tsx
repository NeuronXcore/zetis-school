import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { DiagnosticListItem, DiagnosticQuiz, DiagnosticResult } from "../lib/diagnostic";

// L'écran de PASSATION sous observation (ADR-0048, Session B).
//
// 🔴 Ce fichier porte le verrou central de la session : **l'écran ne change pas d'un pixel**. Il
// gagne des écouteurs, rien d'autre. Un enfant qui se sait chronométré ne passe plus le même
// diagnostic — la surveillance changerait la mesure qu'elle prétend protéger.

vi.mock("../lib/diagnostic", () => ({
  fetchDiagnostics: vi.fn(),
  fetchDiagnosticQuiz: vi.fn(),
  submitDiagnostic: vi.fn(),
  fetchMonResultat: vi.fn(),
  envoyerExplication: vi.fn(),
}));
vi.mock("../lib/dictation", () => ({
  isDictationSupported: vi.fn(() => false),
  startRecording: vi.fn(),
}));
vi.mock("../lib/eli5", () => ({
  transcribeEli5: vi.fn(),
  Eli5SttUnavailable: class Eli5SttUnavailable extends Error {},
}));

import { DiagnosticPage } from "./DiagnosticPage";
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
    { id: 2, prompt: "Q2 ?", choices: ["C", "D"], skill_id: 4, skill_name: "Accord" },
  ],
};

const RESULTAT: DiagnosticResult = {
  attempt_id: 42,
  quiz_id: 7,
  subject: "Français",
  completed_at: "2026-08-09T10:00:00+00:00",
  strengths: ["Temps du récit"],
  gaps: [],
  verbalisation: { question_id: 1, skill_id: 3, skill_name: "Temps du récit", explication: null },
};

async function entrerDansLaPassation() {
  render(
    <MemoryRouter>
      <DiagnosticPage />
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole("button", { name: /Commencer/ }));
  await screen.findByText("1. Q1 ?");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchDiagnostics).mockResolvedValue(LISTE);
  vi.mocked(fetchDiagnosticQuiz).mockResolvedValue(QUIZ);
  vi.mocked(submitDiagnostic).mockResolvedValue(RESULTAT);
});

describe("l'écran de passation n'a pas changé d'un pixel", () => {
  it("🔴 ne rend AUCUN élément de temps — ni chrono, ni compteur, ni avertissement", async () => {
    await entrerDansLaPassation();
    const texte = (document.body.textContent ?? "").toLowerCase();
    // Sabotage : ajouter un compteur visible, un « il te reste », un chrono → rouge.
    // Ce verrou protège une règle de `CLAUDE.md` (§gamification), pas une préférence de design.
    for (const interdit of [
      "chrono",
      "temps restant",
      "il te reste",
      "secondes",
      "minutes",
      "surveill",
      "attention",
      "question 1 sur",
    ]) {
      expect(texte).not.toContain(interdit);
    }
    // L'anti-test-à-vide : l'écran rend bien la passation.
    expect(screen.getByRole("button", { name: /Envoyer mes réponses/ })).toBeInTheDocument();
  });

  it("🔴 chaque question porte son ancre de localisation, et RIEN de visible n'en dépend", async () => {
    await entrerDansLaPassation();
    // `data-question-id` sert uniquement à localiser une copie d'énoncé dans le DOM. C'est ce qui
    // fait de la copie le seul signal par question qui survive à un écran qui les affiche toutes.
    const ancres = document.querySelectorAll("[data-question-id]");
    expect(ancres).toHaveLength(2);
    expect([...ancres].map((a) => a.getAttribute("data-question-id"))).toEqual(["1", "2"]);
  });

  it("toutes les questions sont affichées ENSEMBLE — le fait qui a fait tomber deux signaux", async () => {
    await entrerDansLaPassation();
    // Ce n'est pas un souhait, c'est un constat verrouillé : c'est parce que l'écran est ainsi que
    // « question quittée » et « temps d'affichage → réponse » ont dû descendre au niveau de la
    // passation (ADR-0048 Décision 1 bis). Si un jour ce test tombe, c'est que la passation a été
    // découpée — et alors les deux signaux peuvent remonter à la question.
    expect(screen.getByText("1. Q1 ?")).toBeInTheDocument();
    expect(screen.getByText("2. Q2 ?")).toBeInTheDocument();
  });
});

describe("ce que la soumission emporte", () => {
  it("🔴 envoie les CONDITIONS de la passation, dont sorties_ecran", async () => {
    await entrerDansLaPassation();
    fireEvent.click(screen.getByLabelText("A"));
    fireEvent.click(screen.getByLabelText("C"));
    fireEvent.click(screen.getByRole("button", { name: /Envoyer mes réponses/ }));

    await waitFor(() => expect(submitDiagnostic).toHaveBeenCalled());
    const [, reponses, conditions] = vi.mocked(submitDiagnostic).mock.calls[0];
    // Sabotage : ne plus passer `conditions` à `submitDiagnostic` → rouge.
    expect(conditions).toBeDefined();
    expect(conditions).toMatchObject({
      sorties_ecran: expect.any(Number),
      plein_ecran_quitte: expect.any(Boolean),
      taille_changee: expect.any(Boolean),
    });
    // 🔴 `sorties_ecran` est dans les CONDITIONS, jamais sur une réponse (Décision 1 bis).
    for (const r of reponses) expect(r).not.toHaveProperty("quittee");
    // L'instrument dit sa portée.
    expect(conditions?.signaux_observables).toContain("sortie_ecran");
  });

  it("compte une sortie d'écran, et n'en compte qu'UNE par geste", async () => {
    await entrerDansLaPassation();
    // Un changement d'application déclenche `visibilitychange` PUIS `blur` : sans la fenêtre
    // anti-doublon, un seul geste en compterait deux.
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("blur"));
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });

    fireEvent.click(screen.getByLabelText("A"));
    fireEvent.click(screen.getByLabelText("C"));
    fireEvent.click(screen.getByRole("button", { name: /Envoyer mes réponses/ }));

    await waitFor(() => expect(submitDiagnostic).toHaveBeenCalled());
    const conditions = vi.mocked(submitDiagnostic).mock.calls[0][2];
    expect(conditions?.sorties_ecran).toBe(1);
  });

  it("mesure le RYTHME par réponse, jamais un horodatage", async () => {
    await entrerDansLaPassation();
    fireEvent.click(screen.getByLabelText("A"));
    fireEvent.click(screen.getByLabelText("C"));
    fireEvent.click(screen.getByRole("button", { name: /Envoyer mes réponses/ }));

    await waitFor(() => expect(submitDiagnostic).toHaveBeenCalled());
    const reponses = vi.mocked(submitDiagnostic).mock.calls[0][1];
    for (const r of reponses) {
      expect(r.ms_depuis_precedente).toBeTypeOf("number");
      // Une DURÉE, jamais un instant : un horodatage `performance.now()` absolu serait énorme,
      // et un `Date.now()` dépasserait 1e12. Ici on reste dans les millisecondes de passation.
      expect(r.ms_depuis_precedente).toBeLessThan(1_000_000);
    }
  });
});

describe("la carte « Raconte-moi » sur le résultat", () => {
  it("🔴 est rendue à CHAQUE passation — la page ne la conditionne à AUCUN verdict", async () => {
    await entrerDansLaPassation();
    fireEvent.click(screen.getByLabelText("A"));
    fireEvent.click(screen.getByLabelText("C"));
    fireEvent.click(screen.getByRole("button", { name: /Envoyer mes réponses/ }));

    // Sabotage : conditionner le rendu de la carte → rouge. Le résultat servi ici ne porte AUCUNE
    // information de fiabilité — la page ne peut pas la conditionner, et c'est la protection.
    expect(await screen.findByText(/Raconte-moi/)).toBeInTheDocument();
    // ⚠️ La notion apparaît DEUX fois, et c'est juste : la verbalisation se tire parmi les bonnes
    // réponses, donc la notion qu'elle nomme est nécessairement aussi une force. Un `getByText`
    // échouait ici — sur le décor, pas sur le code.
    expect(screen.getAllByText(/Temps du récit/).length).toBeGreaterThanOrEqual(2);
  });

  it("se place APRÈS « Tes forces » et AVANT « Tes prochaines étapes »", async () => {
    vi.mocked(submitDiagnostic).mockResolvedValue({
      ...RESULTAT,
      gaps: [{ skill_id: 9, skill_name: "Accord du participe passé" }],
    });
    await entrerDansLaPassation();
    fireEvent.click(screen.getByLabelText("A"));
    fireEvent.click(screen.getByLabelText("C"));
    fireEvent.click(screen.getByRole("button", { name: /Envoyer mes réponses/ }));
    await screen.findByText(/Raconte-moi/);

    // L'ordre du DOM porte une décision : après les forces (elle parle d'une BONNE réponse et
    // porte le même élan), avant les prochaines étapes (ce bloc finit par « Voir mes missions → »,
    // et rien ne doit venir après la porte de sortie).
    const texte = document.body.textContent ?? "";
    expect(texte.indexOf("Tes forces")).toBeLessThan(texte.indexOf("Raconte-moi"));
    expect(texte.indexOf("Raconte-moi")).toBeLessThan(texte.indexOf("Tes prochaines étapes"));
  });

  it("🔴 le résultat servi à Massimo ne laisse fuir AUCUN mot de fiabilité", async () => {
    await entrerDansLaPassation();
    fireEvent.click(screen.getByLabelText("A"));
    fireEvent.click(screen.getByLabelText("C"));
    fireEvent.click(screen.getByRole("button", { name: /Envoyer mes réponses/ }));
    await screen.findByText(/Raconte-moi/);

    const texte = (document.body.textContent ?? "").toLowerCase();
    for (const interdit of ["fiabilité", "à confirmer", "verdict", "suspect", "triché"]) {
      expect(texte).not.toContain(interdit);
    }
  });
});
