import { describe, expect, it } from "vitest";
import { capNewsBadge, EMPTY_NEWS } from "./news";
import { cappedCount } from "../hooks/useReviewSession";

describe("capNewsBadge — plafond du témoin de navigation (ADR-0030 §5)", () => {
  it("sert le compte exact jusqu'à 9", () => {
    expect(capNewsBadge(0)).toBe("0");
    expect(capNewsBadge(1)).toBe("1");
    expect(capNewsBadge(9)).toBe("9");
  });

  it("plafonne à « 9+ » au-delà", () => {
    expect(capNewsBadge(10)).toBe("9+");
    expect(capNewsBadge(999)).toBe("9+");
  });

  it("reste DISTINCT du plafond des decks de révision (15+)", () => {
    // Deux objets différents, deux seuils. `cappedCount` plafonne un deck de cartes À RÉVISER ;
    // `capNewsBadge` un témoin de NOUVEAUTÉ. Les unifier ferait ressembler l'un à l'autre, ce que
    // tout l'ADR passe son temps à séparer — d'où ce test de non-régression croisée.
    expect(cappedCount(12)).toBe("12");
    expect(capNewsBadge(12)).toBe("9+");
  });
});

describe("EMPTY_NEWS", () => {
  it("porte toutes ses clés à zéro — l'état « aucun badge »", () => {
    expect(EMPTY_NEWS).toEqual({
      agenda: 0,
      fiches: 0,
      capsules: 0,
      revision: 0,
      missions: 0,
      mindmaps: 0,
      diagnostic: 0,
    });
  });
});
