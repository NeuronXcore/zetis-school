import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { type Autonomy, type AutonomyClass, type AutonomyLevel } from "@zetis/types";

import { LEVEL_LABEL } from "../../lib/settings";
import { NiveauDetail } from "./NiveauDetail";

const A0A = "zetis_autonomy_a0a_derives";
const A1 = "zetis_autonomy_a1_course";

function cls(
  key: string,
  code: string,
  label: string,
  value: AutonomyLevel,
  choices: AutonomyLevel[],
  reason: string | null = null,
): AutonomyClass {
  return { key, code, label, value, choices, locked: choices.length === 1, reason };
}

/** Un serveur d'AUJOURD'HUI : A1 rouvert (le Journal existe), les quatre autres verrouillées. */
function autonomy(): Autonomy {
  return {
    auto_trigger_enabled: false,
    preset: "semi",
    classes: [
      cls(A0A, "A0a", "Dérivés inertes", 3, [2, 3]),
      cls("zetis_autonomy_a0b_cards", "A0b", "Cartes de révision", 3, [3], "Aucune étape n'existe."),
      cls(A1, "A1", "Rédaction de cours", 2, [2, 3]),
      cls("zetis_autonomy_a2_curriculum", "A2", "Programme", 1, [1], "Redessine la carte."),
      cls("zetis_autonomy_a3_missions", "A3", "Création de missions", 2, [2], "Élire ≠ créer."),
      cls("zetis_autonomy_a4_terminal", "A4", "Supprimer, archiver", 0, [0], "Définitif."),
    ],
  };
}

function show(preset: Parameters<typeof NiveauDetail>[0]["preset"]) {
  return render(<NiveauDetail autonomy={autonomy()} preset={preset} />);
}

/** La valeur affichée en face d'une classe, quel que soit son groupe.
 *  Passe par `role="group"` + `aria-label` — la ligne est adressable par le nom de sa classe,
 *  comme dans `ClassRow`. Remonter le DOM à l'aveugle casse au premier changement de balise. */
function palierDe(label: string): string {
  const ligne = screen.getByRole("listitem", { name: label });
  const cellules = ligne.querySelectorAll(":scope > span");
  return cellules[cellules.length - 1]!.textContent!.trim();
}

describe("NiveauDetail", () => {
  it("🔒 les DEUX classes libres suivent le niveau, et elles seules", () => {
    // Manual : A0a « Vous validez » · A1 « Vous validez »
    const { unmount } = show("manuel");
    expect(palierDe("Dérivés inertes")).toBe(LEVEL_LABEL[2]);
    expect(palierDe("Rédaction de cours")).toBe(LEVEL_LABEL[2]);
    unmount();

    // Autonom : les deux montent à « ZETIS sert »
    show("autonome");
    expect(palierDe("Dérivés inertes")).toBe(LEVEL_LABEL[3]);
    expect(palierDe("Rédaction de cours")).toBe(LEVEL_LABEL[3]);
  });

  it("🔒 les QUATRE verrouillées affichent la valeur SERVEUR, identique dans les trois niveaux", () => {
    // C'est le corollaire de l'ADR-0032 §3 rendu visible : un préréglage n'écrit que deux clés.
    // Si ce test tombe, c'est qu'un régime est devenu une porte dérobée sur une décision figée.
    const figees: [string, AutonomyLevel][] = [
      ["Cartes de révision", 3],
      ["Programme", 1],
      ["Création de missions", 2],
      ["Supprimer, archiver", 0],
    ];

    for (const preset of ["manuel", "semi", "autonome"] as const) {
      const { unmount } = show(preset);
      for (const [label, attendu] of figees) {
        expect(palierDe(label)).toBe(LEVEL_LABEL[attendu]);
      }
      unmount();
    }
  });

  it("🔒 sépare ce qui bouge de ce qui ne bougera jamais — et le DIT", () => {
    // Les noyer ferait croire que tout bouge ; les taire promettrait une richesse absente (§8.3).
    const { container } = show("semi");
    const decide = screen.getByText(/Ce que ce niveau décide/);
    const jamais = screen.getByText(/Ce qu'aucun niveau ne change/);

    expect(container.textContent!.indexOf(decide.textContent!)).toBeLessThan(
      container.textContent!.indexOf(jamais.textContent!),
    );
  });

  it("🔒 aucun total, aucun pourcentage, aucun arriéré (§F.2)", () => {
    // La provenance est un fait, jamais un reproche : ce panneau est qualitatif, classe par classe.
    const { container } = show("autonome");
    expect(container.textContent).not.toMatch(/\d+\s*%/);
    expect(container.textContent).not.toMatch(/en attente de (relecture|validation)/i);
    expect(container.textContent).not.toMatch(/\d+\s*\/\s*\d+/);
  });

  it("🔒 les libellés de palier viennent de la source unique", () => {
    // Une recopie en dur (« Servi », « Validé ») divergerait du détail réglable juste en dessous.
    show("semi");
    expect(palierDe("Dérivés inertes")).toBe(LEVEL_LABEL[3]);
    expect(LEVEL_LABEL[3]).toBe("ZETIS sert"); // ancre : si la constante change, ce test le dit
  });

  it("🔒 « Sur mesure » n'invente rien : tout retombe sur la valeur serveur", () => {
    // État inatteignable par l'API, mais rendu. Sans ce test, un `preset` nul afficherait le
    // dernier niveau connu — un régime faux, ce que la page proscrit partout.
    show(null);
    expect(palierDe("Dérivés inertes")).toBe(LEVEL_LABEL[3]); // cls.value
    expect(palierDe("Rédaction de cours")).toBe(LEVEL_LABEL[2]); // cls.value
  });

  it("🔒 le GROUPE vient du serveur (`locked`), pas du préréglage", () => {
    // ⚠️ Défaut de conception attrapé le 2026-08-04 : prendre `levelsForPreset` comme critère de
    // groupe faisait basculer les DEUX classes réglables chez les verrouillées dès que `preset`
    // était nul — l'écran disait alors qu'aucun niveau ne change rien, ce qui est faux.
    show(null);
    const vivante = screen.getByRole("listitem", { name: "Dérivés inertes" });
    const figee = screen.getByRole("listitem", { name: "Programme" });

    expect(vivante.querySelector(".niveau-valeur")).not.toBeNull();
    expect(figee.querySelector(".niveau-valeur")).toBeNull();
  });

  it("montre le motif SERVEUR de chaque verrou — un cadenas muet se lit comme une panne", () => {
    show("semi");
    const jamais = screen.getByRole("list", { name: "Ce qu'aucun niveau ne change" });
    expect(within(jamais).getByText("Définitif.")).toBeInTheDocument();
    expect(within(jamais).getByText("Élire ≠ créer.")).toBeInTheDocument();
  });
});
