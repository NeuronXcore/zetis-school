import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { type ProductionRun } from "@zetis/types";

import { ProductionDoneModal } from "./ProductionDoneModal";

const RUN: ProductionRun = {
  id: 12,
  status: "done",
  trigger: "manual",
  authorized_by: "parent_direct",
  chapter_id: null,
  scope_skill_id: 17,
  scope_kind: "fiche",
  scope_skill_name: "Discours indirect libre",
  total_notions: 1,
  done_notions: 1,
  progress_pct: 100,
  created_at: "2026-08-03T14:00:00Z",
  finished_at: "2026-08-03T14:00:15Z",
};

function show(run: Partial<ProductionRun>, onClose = vi.fn()) {
  render(
    <MemoryRouter>
      <ProductionDoneModal run={{ ...RUN, ...run }} onClose={onClose} />
    </MemoryRouter>,
  );
  return onClose;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("ProductionDoneModal", () => {
  it("nomme ce que ZETIS a produit, et sur quelle notion", () => {
    show({});
    expect(
      screen.getByText("ZETIS a produit une fiche sur « Discours indirect libre »."),
    ).toBeTruthy();
  });

  it("compte les notions quand le lot vise un chapitre", () => {
    // ⚠️ Deux natures de lot, deux phrases. Un lot de chapitre n'a pas de pièce à nommer ; annoncer
    // « un contenu » pour 11 notions équipées ne dirait rien de ce qui s'est passé.
    show({ scope_kind: null, scope_skill_id: null, scope_skill_name: null, done_notions: 11 });
    expect(screen.getByText("ZETIS a équipé 11 notions.")).toBeTruthy();
  });

  it("dit l'échec sans le déguiser", () => {
    show({ status: "failed" });
    expect(screen.getByText("La production s'est interrompue.")).toBeTruthy();
    expect(screen.getByText(/détail est au Journal/)).toBeTruthy();
  });

  it("se ferme toute seule — aucune trace à traiter derrière elle", () => {
    // ⚠️ C'est le test qui compte. Une annonce qui resterait s'empilerait en arriéré, c'est-à-dire
    // en « vous êtes en retard » — exactement ce que l'addendum ADR-0011 §F.2 interdit.
    const onClose = show({});
    expect(onClose).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(6000 + 300));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ne bloque pas la page derrière elle", () => {
    // Elle annonce, elle n'interrompt pas : Papa doit pouvoir continuer à cliquer pendant qu'elle
    // s'affiche. Un fond capteur de clics ferait d'un accusé de passage une modale à congédier.
    show({});
    expect(screen.getByRole("status").className).toContain("pointer-events-none");
  });
});
