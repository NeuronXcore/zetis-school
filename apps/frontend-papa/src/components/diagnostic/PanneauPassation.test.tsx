import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { DiagnosticRailEntry, DiagnosticRelecture, DiagnosticResult } from "@zetis/types";
import { PanneauPassation, PanneauSansMesure } from "./PanneauPassation";

// La station ② du Diagnostic — « ce qui a été ouvert ».
//
// 🔴 **Ce composant n'était rendu par AUCUN test** avant le 2026-08-09 : le dossier n'en portait
// que deux, sur de la logique pure (`crans`, `focus`). Ses trois liens pouvaient donc changer de
// destination sans que rien ne rougisse — et deux d'entre eux mentent effectivement sur leur
// grain depuis leur écriture. Ce fichier verrouille celui que l'ADR-0047 §8 corrige.

function resultat(overrides: Partial<DiagnosticResult> = {}): DiagnosticResult {
  return {
    attempt_id: 12,
    quiz_id: 34,
    // Champs ajoutés par l'ADR-0048 — décor complété, aucune assertion touchée.
    // `null` = ZETIS ne regardait pas, l'état de toutes les passations d'avant.
    fiabilite: null,
    verbalisation: null,
    subject_id: 3,
    subject: "Français",
    score_percent: 63,
    completed_at: "2026-08-05T10:00:00+02:00",
    per_skill: [
      { skill_id: 7, skill_name: "Temps du récit", score: 40, status: "weak", questions_count: 5 },
    ],
    gaps: [
      { skill_id: 7, skill_name: "Temps du récit", severity: "medium", status: "open", content_state: "ok" },
    ],
    ...overrides,
  };
}

function renderPanneau(detail = resultat(), subjectSlug = "francais") {
  render(
    <MemoryRouter>
      <PanneauPassation
        detail={detail}
        portee={null}
        rang={2}
        subjectSlug={subjectSlug}
        onRemesurer={() => {}}
        relecture={null}
      />
    </MemoryRouter>,
  );
}

describe("« Voir la lacune → » transporte la matière (ADR-0047 §8)", () => {
  it("🔴 il ne mène plus à /lacunes NU", async () => {
    // Le cul-de-sac CIRCULAIRE que l'ADR-0047 cite en Contexte comme motif du chantier : Papa
    // quittait un diagnostic de Français pour la liste complète, toutes matières — depuis un
    // écran qui, lui, lui donnait le motif ET l'action.
    renderPanneau();

    const lien = await screen.findByRole("link", { name: /Voir la lacune/ });
    expect(lien).toHaveAttribute("href", "/lacunes?subject=francais");
  });

  it("le slug vient du RAIL, pas de `detail` — un autre slug donne un autre lien", async () => {
    // `DiagnosticResult` porte `subject` (le NOM) et `subject_id`, jamais le slug ; la page
    // Lacunes filtre par slug. Le test le prouve en changeant le slug SANS toucher `detail`.
    renderPanneau(resultat(), "mathematiques");

    expect(await screen.findByRole("link", { name: /Voir la lacune/ })).toHaveAttribute(
      "href",
      "/lacunes?subject=mathematiques",
    );
  });

  it("⚠️ les deux autres gestes visent encore la MATIÈRE — et c'est consigné, pas oublié", async () => {
    // Ce test fige une DETTE, pas une qualité. « Produire le quiz de cette notion » mène à
    // `/quiz?subject=`, « Valider le cours de cette leçon » à `/programme?subject=` : les deux
    // promettent un grain que le lien ne livre pas. Les corriger demande `lesson_id` au contrat de
    // `lacunes_de_passation` et l'action `equipNotion` portée ici — différé au `BACKLOG.md` avec
    // son vrai chiffrage. 🔴 **Si ce test tombe, c'est que quelqu'un a payé la dette : il faut
    // alors le SUPPRIMER, pas l'ajuster.**
    renderPanneau(
      resultat({
        gaps: [
          {
            skill_id: 7,
            skill_name: "Temps du récit",
            severity: "medium",
            status: "open",
            content_state: "aucune_lecon",
          },
        ],
      }),
    );

    expect(await screen.findByRole("link", { name: /quiz/i })).toHaveAttribute(
      "href",
      "/quiz?subject=3",
    );
  });
});

// ==================================================================================================
// LA PROTECTION DÉPLACÉE — adr-0051 D1 bis
// ==================================================================================================

/** 🔴 **Ce bloc REPREND la protection que portait `crans.test.ts::actionPrincipale("propose")`.**
 *
 *  La fonction a été supprimée avec l'adr-0051 (son lien « Ouvrir dans la file de relecture → »
 *  renvoyait vers la page qui renvoie ici). Mais son `return null` pour le cran « proposé » ne
 *  figeait pas un manque : il figeait une **DÉCISION**. « Voir la page de Massimo → » ne peut pas
 *  rendre ce qu'elle annonce — aucun lien inter-app n'existe, et cette page appelle des routes
 *  `require_child` qui répondent **403** à un rôle parent (`auth/deps.py:55`).
 *
 *  Laisser cette protection mourir avec la fonction aurait été une régression masquée : la
 *  question pourrait se rouvrir sans que rien ne rougisse. Elle a donc changé de SUPPORT — elle
 *  porte désormais sur le rendu, ce qui est même plus proche de ce qu'elle protège.
 *
 *  ⚠️ Si ce test tombe, c'est que quelqu'un a rouvert la question sans passer par le `BACKLOG`. */
function entree(cran: "genere" | "propose"): DiagnosticRailEntry {
  return {
    cle: `quiz-${cran}`,
    cran,
    quiz_id: 42,
    attempt_id: null,
    subject_id: 3,
    subject: "Mathématiques",
    subject_slug: "mathematiques",
    date: "2026-08-01T09:00:00Z",
    notions_count: 8,
    score_percent: null,
    rang: null,
    fiabilite_verdict: null,
  };
}

const RELECTURE: DiagnosticRelecture = {
  quiz_id: 42,
  title: "Diagnostic — Mathématiques",
  subject: "Mathématiques",
  total: 1,
  notions: [
    {
      skill_id: 7,
      skill_name: "Nombres relatifs",
      questions: [
        {
          id: 901,
          prompt_markdown: "(-3) + 5 ?",
          choices_json: ["2", "-8"],
          correct_answer_json: 0,
          explanation_markdown: "On avance de 5 depuis -3.",
        },
      ],
    },
  ],
};

function renderSansMesure(cran: "genere" | "propose", relecture: DiagnosticRelecture | null = RELECTURE) {
  render(
    <MemoryRouter>
      <PanneauSansMesure
        entree={entree(cran)}
        onRetirer={() => {}}
        retraitEnCours={false}
        relecture={relecture}
        onLaisserPasser={() => {}}
        verdictEnCours={false}
      />
    </MemoryRouter>,
  );
}

describe("le cran « proposé » n'offre AUCUN lien de sortie — décision différée, pas oubli", () => {
  it("🔴 aucun lien vers l'app de Massimo, et le panneau n'est pas vide pour autant", () => {
    renderSansMesure("propose");

    // ABSENCE — la protection déplacée.
    expect(screen.queryAllByRole("link").length).toBe(0);

    // 🔴 PRÉSENCES qui lui donnent son sens : un panneau qui ne rendrait RIEN satisferait
    // l'assertion ci-dessus. Le cran proposé reste lisible et actionnable.
    expect(screen.getByText(/Tu l'as relu et proposé/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retirer la proposition" })).toBeTruthy();
    expect(screen.getByText("Nombres relatifs")).toBeTruthy();
  });

  it("🔴 il ne porte PAS « Laisser passer » — le verdict a déjà été rendu", () => {
    renderSansMesure("propose");

    expect(screen.queryByRole("button", { name: "Laisser passer" })).toBeNull();
    expect(screen.getByRole("button", { name: "Retirer la proposition" })).toBeTruthy();
  });

  it("le cran « généré », lui, porte les deux verdicts et le questionnaire", () => {
    renderSansMesure("genere");

    expect(screen.getByRole("button", { name: "Laisser passer" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refuser ce lot" })).toBeTruthy();
    expect(screen.getByText("Nombres relatifs")).toBeTruthy();
  });

  it("🔴 tant que le questionnaire n'est pas chargé, « Laisser passer » est ABSENT", () => {
    // On ne laisse pas passer ce qu'on n'a pas encore vu. Absent, pas grisé.
    renderSansMesure("genere", null);

    expect(screen.queryByRole("button", { name: "Laisser passer" })).toBeNull();
    expect(screen.getByText(/Chargement du questionnaire/)).toBeTruthy();
  });
});
