import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { MotivationMessage } from "@zetis/types";
import { ZetisMessageCard } from "./ZetisMessageCard";

function renderCard(message: MotivationMessage) {
  return render(
    <MemoryRouter>
      <ZetisMessageCard message={message} />
    </MemoryRouter>,
  );
}

describe("ZetisMessageCard", () => {
  it("affiche le texte serveur VERBATIM, accents et apostrophes compris", () => {
    const title = "Content de te revoir, Massimo !";
    const subtitle = "On reprend là où tu t'étais arrêté : le théorème de Pythagore.";
    renderCard({ code: "back_after_break", title, subtitle });

    expect(screen.getByText(title)).toBeTruthy();
    expect(screen.getByText(subtitle)).toBeTruthy();
  });

  it("ne rend rien quand il n'y a pas de sous-titre", () => {
    const { container } = renderCard({ code: "all_clear", title: "Belle séance !", subtitle: null });
    expect(container.querySelectorAll("p")).toHaveLength(1);
  });

  it("affiche le bouton d'action quand la cible est connue", () => {
    renderCard({
      code: "resume_notion",
      title: "On continue ?",
      cta: { label: "Reprendre ma mission", target: "missions" },
    });
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/missions");
  });

  it("masque le bouton sur une cible inconnue mais garde le texte", () => {
    // Un énuméré backend peut grandir : le message doit rester lisible, sans bouton mort.
    renderCard({
      code: "resume_notion",
      title: "On continue ?",
      cta: { label: "Aller ailleurs", target: "teleportation" },
    });
    expect(screen.getByText("On continue ?")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("affiche un code INCONNU sans rien casser", () => {
    renderCard({ code: "code_du_futur", title: "Un message inédit" });
    expect(screen.getByText("Un message inédit")).toBeTruthy();
  });

  it("ne compose aucune phrase à partir de données", () => {
    // Le composant ne reçoit que le message : il n'a structurellement pas accès au contexte,
    // donc aucun « ça fait 5 jours ! » ne peut apparaître ici.
    const { container } = renderCard({ code: "back_after_break", title: "Content de te revoir !" });
    expect(container.textContent).not.toMatch(/\d+\s*jours?/i);
  });
});
