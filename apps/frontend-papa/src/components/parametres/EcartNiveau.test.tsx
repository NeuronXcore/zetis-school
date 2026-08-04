import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { type Autonomy, type AutonomyClass, type AutonomyLevel } from "@zetis/types";

import { LEVEL_LABEL } from "../../lib/settings";
import { EcartNiveau } from "./EcartNiveau";

const A0A = "zetis_autonomy_a0a_derives";
const A1 = "zetis_autonomy_a1_course";
const A4 = "zetis_autonomy_a4_terminal";

function cls(
  key: string,
  code: string,
  label: string,
  value: AutonomyLevel,
  choices: AutonomyLevel[],
): AutonomyClass {
  return { key, code, label, value, choices, locked: choices.length === 1, reason: null };
}

/** État SERVEUR : A0a sert, le cours est validé par Papa, A4 est mort. */
function autonomy(): Autonomy {
  return {
    auto_trigger_enabled: false,
    preset: "semi",
    classes: [
      cls(A0A, "A0a", "Dérivés inertes", 3, [2, 3]),
      cls(A1, "A1", "Rédaction de cours", 2, [2, 3]),
      cls(A4, "A4", "Supprimer, archiver", 0, [0]),
    ],
  };
}

/** Le brouillon complet, avec les écarts demandés. */
function draft(over: Record<string, AutonomyLevel> = {}) {
  return { [A0A]: 3, [A1]: 2, [A4]: 0, ...over } as Record<string, AutonomyLevel>;
}

describe("EcartNiveau", () => {
  it("🔒 ne montre QUE ce qui change — on ne confirme pas ce qui reste", () => {
    render(<EcartNiveau autonomy={autonomy()} draft={draft({ [A0A]: 2 })} />);

    expect(screen.getByRole("listitem", { name: "Dérivés inertes" })).toBeInTheDocument();
    // Le cours ne bouge pas, la classe verrouillée non plus : ni l'un ni l'autre n'a sa place ici.
    expect(screen.queryByRole("listitem", { name: "Rédaction de cours" })).toBeNull();
    expect(screen.queryByRole("listitem", { name: "Supprimer, archiver" })).toBeNull();
  });

  it("🔒 montre l'AVANT et l'APRÈS — c'est la seule chose que la page ne dit pas", () => {
    // Le panneau de la page affiche l'état CIBLE. Sans l'avant, la modale n'ajouterait rien à ce
    // qui reste visible derrière elle : elle serait une redite, pas une confirmation.
    render(<EcartNiveau autonomy={autonomy()} draft={draft({ [A0A]: 2 })} />);
    const ligne = screen.getByRole("listitem", { name: "Dérivés inertes" });

    expect(ligne).toHaveTextContent(LEVEL_LABEL[3]); // avant
    expect(ligne).toHaveTextContent(LEVEL_LABEL[2]); // après
  });

  it("🔒 compare au SERVEUR, pas à un préréglage", () => {
    // Le brouillon peut venir des cartes OU du détail classe par classe. C'est l'écriture réelle
    // qu'on met sous les yeux — un écart calculé depuis un préréglage raterait les édits unitaires.
    render(<EcartNiveau autonomy={autonomy()} draft={draft({ [A1]: 3 })} />);

    expect(screen.getByRole("listitem", { name: "Rédaction de cours" })).toHaveTextContent(
      LEVEL_LABEL[3],
    );
    expect(screen.queryByRole("listitem", { name: "Dérivés inertes" })).toBeNull();
  });

  it("ne rend rien quand rien ne change", () => {
    const { container } = render(<EcartNiveau autonomy={autonomy()} draft={draft()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("🔒 aucun total, aucun pourcentage (§F.2)", () => {
    const { container } = render(
      <EcartNiveau autonomy={autonomy()} draft={draft({ [A0A]: 2, [A1]: 3 })} />,
    );
    expect(container.textContent).not.toMatch(/\d+\s*%/);
    expect(container.textContent).not.toMatch(/\d+\s*\/\s*\d+/);
  });
});
