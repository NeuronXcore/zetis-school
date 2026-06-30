import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LogoZetis } from "./LogoZetis";

describe("LogoZetis", () => {
  it("expose le label accessible « ZETIS »", () => {
    render(<LogoZetis />);
    expect(screen.getByRole("img", { name: "ZETIS" })).toBeInTheDocument();
  });

  it("affiche le texte ZETIS", () => {
    render(<LogoZetis />);
    expect(screen.getByText("ZETIS")).toBeInTheDocument();
  });

  it("applique les classes selon les props (gradient/glow/size)", () => {
    const { rerender } = render(<LogoZetis size="lg" />);
    const el = screen.getByRole("img", { name: "ZETIS" });
    expect(el).toHaveClass("logo-zetis", "logo-zetis--gradient", "logo-zetis--glow");

    rerender(<LogoZetis gradient={false} glow={false} />);
    const plain = screen.getByRole("img", { name: "ZETIS" });
    expect(plain).toHaveClass("logo-zetis--solid");
    expect(plain).not.toHaveClass("logo-zetis--glow");
  });

  it("transmet className", () => {
    render(<LogoZetis className="custom-x" />);
    expect(screen.getByRole("img", { name: "ZETIS" })).toHaveClass("custom-x");
  });
});
