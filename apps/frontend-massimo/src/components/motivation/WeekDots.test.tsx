import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { MotivationWeek } from "@zetis/types";
import { WeekDots } from "./WeekDots";

// Ces tests protègent une décision produit : la grille ne doit PAS pouvoir se lire comme une
// punition. Le plus important est celui qui compare un jour manqué à un jour futur.

function week(over: Partial<MotivationWeek> = {}): MotivationWeek {
  const days = Array.from({ length: 7 }, (_, i) => ({
    date: `2026-07-${27 + i > 31 ? `0${27 + i - 31}` : 27 + i}`,
    active: false,
    is_today: false,
  }));
  return {
    week_start: "2026-07-27",
    days,
    days_done: 0,
    today_done: false,
    goal_days: null,
    goal_met: false,
    ...over,
  };
}

describe("WeekDots", () => {
  it("rend les 7 cases servies, dans l'ordre", () => {
    render(<WeekDots week={week()} />);
    expect(screen.getByLabelText("Ma semaine").children).toHaveLength(7);
  });

  it("un jour PASSÉ sans activité et un jour FUTUR sont rendus à l'identique", () => {
    // L'INVARIANT du chantier. Aucun signe ne doit distinguer « pas venu » de « pas encore » :
    // sinon la grille désigne les jours manqués, et c'est une punition.
    const w = week();
    w.days[1] = { ...w.days[1], active: false }; // mardi passé, sans activité
    w.days[3] = { ...w.days[3], is_today: true, active: true }; // aujourd'hui = jeudi
    w.days[5] = { ...w.days[5], active: false }; // samedi à venir

    const { container } = render(<WeekDots week={w} />);
    const cases = container.querySelectorAll("li > span:first-child");

    expect(cases[1].className).toBe(cases[5].className);
    expect(cases[1].getAttribute("aria-label")).toBe(cases[5].getAttribute("aria-label"));
    expect(cases[1].textContent).toBe(cases[5].textContent);
  });

  it("marque le jour venu par un GLYPHE, pas seulement une couleur", () => {
    const w = week({ days_done: 1 });
    w.days[0] = { ...w.days[0], active: true };
    const { container } = render(<WeekDots week={w} />);
    expect(container.querySelectorAll("li > span:first-child")[0].textContent).toBe("✓");
  });

  it("n'écrit jamais de vocabulaire de manque, dans aucun état", () => {
    const w = week({ days_done: 2, goal_days: 5 });
    w.days[0] = { ...w.days[0], active: true };
    w.days[2] = { ...w.days[2], active: true };
    const { container } = render(<WeekDots week={w} />);

    const texte = `${container.textContent} ${[...container.querySelectorAll("[aria-label]")]
      .map((el) => el.getAttribute("aria-label"))
      .join(" ")}`;
    expect(texte).not.toMatch(/raté|manqué|perdu|restant|échec|série|de suite|pas venu/i);
  });

  it("résume par un compte qui monte, jamais un pourcentage ni un reste-à-faire", () => {
    render(<WeekDots week={week({ days_done: 3, goal_days: 5 })} />);
    expect(screen.getByText(/3 jours cette semaine/)).toBeTruthy();
    expect(screen.queryByText(/%/)).toBeNull();
    expect(screen.queryByText(/il te reste/i)).toBeNull();
  });

  it("annonce l'objectif atteint", () => {
    render(<WeekDots week={week({ days_done: 3, goal_days: 3, goal_met: true })} />);
    expect(screen.getByText("objectif atteint")).toBeTruthy();
  });
});
