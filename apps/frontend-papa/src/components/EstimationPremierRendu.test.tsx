import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { useEstimatedProgress } from "@zetis/ui";

// Sonde : capture la valeur rendue à CHAQUE rendu, dont le PREMIER.
function Sonde({ rendus, startedAtMs }: { rendus: number[]; startedAtMs: number }) {
  rendus.push(useEstimatedProgress(true, 30_000, startedAtMs));
  return null;
}

describe("useEstimatedProgress — le premier rendu", () => {
  it("🔴 ancre l'estimation sur started_at DÈS LE PREMIER RENDU, pas après le premier effet", () => {
    const rendus: number[] = [];
    // Un lot démarré il y a 8 s, estimé à 30 s → ~26 % (courbe asymptotique).
    render(<Sonde rendus={rendus} startedAtMs={Date.now() - 8_000} />);

    expect(rendus.length).toBeGreaterThan(0);
    expect(rendus[0]).toBeGreaterThan(10);
  });
});
