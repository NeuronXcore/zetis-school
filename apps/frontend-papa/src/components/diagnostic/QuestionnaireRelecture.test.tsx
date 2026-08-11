import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DiagnosticRelecture } from "@zetis/types";
import { QuestionnaireRelecture, libelleVolume, nomNotion } from "./QuestionnaireRelecture";

// Le questionnaire de relecture (adr-0051 Décision 3). Ce que ces verrous tiennent :
//
// 🔴 la NOTION est l'en-tête du GROUPE, jamais une étiquette par question ;
// 🔴 la clé et l'explication sont SERVIES et VISIBLES — c'est toute la raison d'être de l'écran ;
// 🔴 une notion absente ne devient jamais un mot qui ressemble à une notion.
//
// ⚠️ **Chaque absence est accompagnée d'une présence.** Un composant qui ne rendrait RIEN
// satisferait toute assertion négative — c'est le motif qui a produit quatre verrous verts sur
// leur sabotage dans ce dépôt.

function relecture(surcharge: Partial<DiagnosticRelecture> = {}): DiagnosticRelecture {
  return {
    quiz_id: 57,
    title: "Diagnostic — Histoire-Géo",
    subject: "Histoire-Géo",
    total: 4,
    notions: [
      {
        skill_id: 12,
        skill_name: "Société d'ordres",
        questions: [
          {
            id: 901,
            prompt_markdown: "Quel groupe formait le Tiers État ?",
            choices_json: ["La noblesse et le clergé", "Les artisans et les paysans"],
            correct_answer_json: 1,
            explanation_markdown: "Le Tiers État regroupait tous les non-privilégiés.",
          },
          {
            id: 902,
            prompt_markdown: "Quel privilège avaient le clergé et la noblesse ?",
            choices_json: ["Payer plus d'impôts", "En être exemptés"],
            correct_answer_json: 1,
            explanation_markdown: "Ils ne payaient pas ou peu d'impôts directs.",
          },
        ],
      },
      {
        skill_id: 13,
        skill_name: "États généraux",
        questions: [
          {
            id: 903,
            prompt_markdown: "En quelle année ?",
            choices_json: ["1789", "1792"],
            correct_answer_json: 0,
            explanation_markdown: "Ils s'ouvrent en mai 1789.",
          },
          {
            id: 904,
            prompt_markdown: "Qui les convoque ?",
            choices_json: ["Le roi", "Le peuple"],
            correct_answer_json: 0,
            explanation_markdown: "Louis XVI, faute de solution fiscale.",
          },
        ],
      },
    ],
    ...surcharge,
  };
}

describe("le groupe porte la notion, et le dépliage sert les cinq éléments", () => {
  it("🔴 les notions sont REPLIÉES à l'arrivée — leurs noms suffisent au premier tri", () => {
    render(<QuestionnaireRelecture relecture={relecture()} />);

    // PRÉSENCE : les deux en-têtes et le volume.
    expect(screen.getByText("Société d'ordres")).toBeTruthy();
    expect(screen.getByText("États généraux")).toBeTruthy();
    expect(screen.getByText(/2 notions, 2 questions chacune/)).toBeTruthy();

    // ABSENCE, adossée aux présences ci-dessus : aucun énoncé n'est rendu tant qu'on n'a pas ouvert.
    expect(screen.queryByText(/Quel groupe formait le Tiers État/)).toBeNull();
  });

  it("🔴 déplier une notion sert l'énoncé, les choix, la CLÉ et l'EXPLICATION", () => {
    render(<QuestionnaireRelecture relecture={relecture()} />);
    fireEvent.click(screen.getByRole("button", { name: /Société d'ordres/ }));

    expect(screen.getByText(/Quel groupe formait le Tiers État/)).toBeTruthy();
    expect(screen.getByText("Les artisans et les paysans")).toBeTruthy();
    // La clé est DÉSIGNÉE — deux marques pour les deux questions du groupe.
    expect(screen.getAllByText("✓ CLÉ").length).toBe(2);
    // 🔴 L'explication est le texte que Massimo lira après coup : la relire est la moitié du geste.
    expect(screen.getByText(/Le Tiers État regroupait tous les non-privilégiés/)).toBeTruthy();
    expect(screen.getAllByText(/Ce que Massimo lira après coup/).length).toBe(2);
  });

  it("🔴 la clé marque le BON choix — pas simplement « un » choix", () => {
    render(<QuestionnaireRelecture relecture={relecture()} />);
    fireEvent.click(screen.getByRole("button", { name: /États généraux/ }));

    // `correct_answer_json: 0` sur les deux questions de ce groupe.
    const marques = screen.getAllByText("✓ CLÉ");
    expect(marques.length).toBe(2);
    expect(marques[0].closest("li")?.textContent).toContain("1789");
    expect(marques[1].closest("li")?.textContent).toContain("Le roi");
  });

  it("un seul groupe ouvert n'ouvre pas les autres", () => {
    render(<QuestionnaireRelecture relecture={relecture()} />);
    fireEvent.click(screen.getByRole("button", { name: /Société d'ordres/ }));

    expect(screen.getByText(/Quel groupe formait le Tiers État/)).toBeTruthy();
    expect(screen.queryByText(/Qui les convoque/)).toBeNull();
  });
});

describe("ce que le composant refuse de dire", () => {
  it("🔴 une notion absente ne devient JAMAIS un mot qui ressemble à une notion", () => {
    render(
      <QuestionnaireRelecture
        relecture={relecture({
          total: 1,
          notions: [
            {
              skill_id: null,
              skill_name: null,
              questions: [
                {
                  id: 910,
                  prompt_markdown: "Question orpheline",
                  choices_json: ["a", "b"],
                  correct_answer_json: 0,
                  explanation_markdown: null,
                },
              ],
            },
          ],
        })}
      />,
    );

    expect(screen.getByText("— notion non renseignée —")).toBeTruthy();
    expect(screen.queryByText("Notion")).toBeNull();
  });

  it("🔴 une clé illisible est DITE, pas masquée ni devinée", () => {
    render(
      <QuestionnaireRelecture
        relecture={relecture({
          total: 1,
          notions: [
            {
              skill_id: 12,
              skill_name: "Société d'ordres",
              questions: [
                {
                  id: 911,
                  prompt_markdown: "Question sans clé",
                  choices_json: ["a", "b"],
                  correct_answer_json: null,
                  explanation_markdown: null,
                },
              ],
            },
          ],
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Société d'ordres/ }));

    expect(screen.getByText(/Bonne réponse illisible/)).toBeTruthy();
    // ⚠️ Et surtout : AUCUN choix n'est marqué. Désigner le mauvais serait pire que ne rien dire.
    expect(screen.queryByText("✓ CLÉ")).toBeNull();
    // La présence qui donne son sens à l'absence : les deux choix sont bien rendus.
    expect(screen.getByText("a")).toBeTruthy();
    expect(screen.getByText("b")).toBeTruthy();
  });

  it("🔴 un lot VIDE se DIT — il ne se rend pas comme une liste vide", () => {
    // Une liste vide se lirait « pas encore chargé ». C'est sur ce rendu que le panneau retire
    // « Laisser passer ».
    render(<QuestionnaireRelecture relecture={relecture({ total: 0, notions: [] })} />);

    expect(screen.getByText(/ne contient aucune question/)).toBeTruthy();
    expect(screen.getByText(/un lot vide mesurerait zéro notion/)).toBeTruthy();
  });

  it("🔴 AUCUN compteur d'avancement (adr-0039 §7)", () => {
    render(<QuestionnaireRelecture relecture={relecture()} />);
    fireEvent.click(screen.getByRole("button", { name: /Société d'ordres/ }));

    // Un « 1/2 relues » transformerait « relire ce qui compte » en « vider la file ».
    const texte = document.body.textContent ?? "";
    expect(texte).not.toMatch(/relue|relues|\d+\s*\/\s*\d+\s*notions/);
    // La présence qui rend l'absence significative : l'écran affiche bien quelque chose.
    expect(screen.getByText("Société d'ordres")).toBeTruthy();
  });
});

describe("les deux helpers purs", () => {
  it("le grain ne se dit QUE s'il est uniforme", () => {
    expect(libelleVolume(relecture())).toBe("2 notions, 2 questions chacune");

    const inegal = relecture();
    inegal.notions[1].questions = [inegal.notions[1].questions[0]];
    // ⚠️ `QUESTIONS_PER_SKILL` est passé de 2 à 5 : les deux générations cohabitent dans le dépôt,
    // et un grain annoncé faux serait pire que pas de grain du tout.
    expect(libelleVolume(inegal)).toBe("2 notions");
  });

  it("le singulier est respecté — un diagnostic peut n'avoir qu'UNE notion", () => {
    // `MAX_SKILLS = 8` est un plafond, pas une forme : 4 diagnostics de la base de dev n'ont
    // qu'une notion et deux questions.
    const seul = relecture();
    seul.notions = [{ ...seul.notions[0], questions: [seul.notions[0].questions[0]] }];
    expect(libelleVolume(seul)).toBe("1 notion, 1 question chacune");
  });

  it("nomNotion ne rend jamais « Notion »", () => {
    expect(nomNotion({ skill_id: null, skill_name: null, questions: [] })).toBe(
      "— notion non renseignée —",
    );
    expect(nomNotion({ skill_id: 1, skill_name: "Fractions", questions: [] })).toBe("Fractions");
  });
});
