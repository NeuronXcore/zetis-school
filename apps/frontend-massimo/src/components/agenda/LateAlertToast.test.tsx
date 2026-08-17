// L'alerte de retard à l'ouverture (ADR-0025 Amdt 9 §D12).
//
// 🔴 **C'est le cinquième signal du retard sur cette page, et le seul qui vienne sans être
// demandé.** Ce fichier garde ce qui le rend acceptable plutôt que harcelant : aucun nombre, une
// porte qui mène quelque part, un effacement automatique, et un accusé de réception qui ne part
// qu'une fois.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen, act } from "@testing-library/react";
import { type AgendaLateAlert } from "@zetis/types";
import { LateAlertToast } from "./LateAlertToast";

const ALERTE: AgendaLateAlert = {
  item_id: 7,
  label: "Exercices 12 à 18",
  kind: "devoir",
  due_on: "2026-08-14",
  subject: { id: 1, slug: "mathematiques", name: "Mathématiques", color: "#60a5fa" },
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function toast(over: Partial<React.ComponentProps<typeof LateAlertToast>> = {}) {
  return render(
    <LateAlertToast alerte={ALERTE} onShown={vi.fn()} onOpenDay={vi.fn()} {...over} />,
  );
}

describe("LateAlertToast", () => {
  it("🔴 VERROU §7 — aucun nombre : une échéance NOMMÉE, jamais un total", () => {
    // Le compteur d'arriéré est le SEUL interdit du §7 qui n'a pas bougé de la journée. Et pas de
    // « depuis 4 jours » non plus : le toast nomme le jour, il ne mesure pas l'écart — un écart
    // chiffré est un reproche.
    const { container } = toast();
    expect(container.textContent).toMatch(/Exercices 12 à 18/);
    expect(container.textContent).toMatch(/vendredi 14 août/i);
    const sansEcheance = container
      .textContent!.replace(/Exercices 12 à 18/, "")
      .replace(/vendredi 14 août/i, "");
    expect(sansEcheance).not.toMatch(/\d/);
    expect(container.textContent).not.toMatch(/depuis \d|\d+ devoirs?|en retard depuis/i);
  });

  it("le vocabulaire ne qualifie jamais Massimo", () => {
    // « tu n'as pas fait », « tu es en retard » : deux phrases, et une seule s'adresse au travail.
    const { container } = toast();
    for (const interdit of [/tu n'as pas/i, /tu es en retard/i, /oubli/i, /échec/i, /rattrape-toi/i]) {
      expect(container.textContent).not.toMatch(interdit);
    }
  });

  it("🔴 il s'efface SEUL — un toast qu'il faut fermer est une réclamation", () => {
    const { container } = toast();
    expect(container.firstElementChild).not.toBeNull();
    act(() => void vi.advanceTimersByTime(7100));
    expect(container.firstElementChild).toBeNull();
  });

  it("la porte mène au JOUR de l'échéance, et referme le toast", () => {
    const onOpenDay = vi.fn();
    const { container } = toast({ onOpenDay });
    // `act` : le clic déclenche un `setState`, et sans lui le re-rendu n'est pas vidé — le test
    // lirait le DOM d'AVANT la fermeture et échouerait sur du code correct.
    act(() => screen.getByRole("button", { name: /Reprendre ce jour/ }).click());
    expect(onOpenDay).toHaveBeenCalledWith("2026-08-14");
    expect(container.firstElementChild).toBeNull();
  });

  it("🔴 l'accusé PORTE l'échéance montrée — sans elle, les autres sont perdues", () => {
    // Défaut trouvé par relecture paire le 2026-08-17 : le serveur avançait son plancher jusqu'à
    // aujourd'hui, brûlant toute la fenêtre alors qu'UNE seule échéance en était sortie. Quand
    // deux tombent en retard pendant une absence, la seconde n'était jamais montrée — et un
    // contrôle pouvait tomber en silence derrière un devoir plus ancien.
    const onShown = vi.fn();
    toast({ onShown });
    expect(onShown).toHaveBeenCalledWith(7);
  });

  it("l'accusé de réception part UNE fois, au montage — pas à chaque rendu", () => {
    // Marquer plusieurs fois est inoffensif côté serveur, mais un accusé relancé à chaque rendu
    // signalerait que l'effet dépend d'une identité de fonction qui change : la boucle suivante
    // serait un rendu infini.
    const onShown = vi.fn();
    const { rerender } = toast({ onShown });
    rerender(<LateAlertToast alerte={ALERTE} onShown={onShown} onOpenDay={vi.fn()} />);
    rerender(<LateAlertToast alerte={ALERTE} onShown={onShown} onOpenDay={vi.fn()} />);
    expect(onShown).toHaveBeenCalledTimes(1);
  });

  it("sans alerte, il ne rend rien et n'accuse rien", () => {
    const onShown = vi.fn();
    const { container } = toast({ alerte: null, onShown });
    expect(container.firstElementChild).toBeNull();
    expect(onShown).not.toHaveBeenCalled();
  });

  it("🔴 une alerte ABSENTE ne coûte jamais l'écran", () => {
    // Défaut réel, trouvé le 2026-08-17 par les tests de la PAGE et non par les siens : le
    // composant testait `alerte === null` alors que la valeur vient du réseau et peut arriver
    // `undefined`. Il appelait alors `onShown()` sur `undefined` et **plantait tout l'agenda**.
    expect(() => toast({ alerte: undefined, onShown: undefined })).not.toThrow();
  });

  it("il est POLI, pas assertif — et son animation joue UNE fois", () => {
    // `aria-live="assertive"` interromprait un lecteur d'écran pour un devoir en retard : le
    // pendant sonore de l'alarme visuelle que le §7 refuse.
    const { container } = toast();
    const boite = container.firstElementChild as HTMLElement;
    expect(boite.getAttribute("aria-live")).toBe("polite");
    expect(boite.className).toMatch(/motion-safe:\[animation:/);
    // 🔴 Une ENTRÉE, pas une pulsation : `infinite` ferait clignoter une alerte en permanence.
    expect(boite.className).not.toMatch(/infinite/);
    // ⚠️ Et la keyframe invoquée doit EXISTER — une classe seule ne prouve rien (leçon du §D10,
    // où un `\\b` laissait passer une keyframe renommée). On ancre sur l'accolade.
    const nom = boite.className.match(/\[animation:([a-z0-9-]+)_/)?.[1];
    const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
    expect(css).toMatch(new RegExp(`@keyframes\\s+${nom}\\s*\\{`));
  });

  it("aucun rouge — c'est le mot qui a changé de statut aujourd'hui, pas la couleur", () => {
    const { container } = toast();
    expect(container.innerHTML).not.toMatch(/text-red-|bg-red-|border-red-/);
    expect((container.firstElementChild as HTMLElement).className).toMatch(/border-amber-400/);
  });

  it("🔴 il reste à l'écran même si le parent EFFACE l'alerte en réponse à `onShown`", () => {
    // **Défaut réel, vu à l'écran le 2026-08-17 et invisible aux tests unitaires.** Le hook
    // remet `lateAlert` à `null` dans son accusé de réception ; le toast, qui lisait la prop
    // directement, se démontait donc **dans le même cycle**. Le filigrane serveur était consommé
    // à chaque chargement et l'alerte n'apparaissait JAMAIS.
    //
    // ⚠️ Les autres tests ne pouvaient pas l'attraper : leur `onShown` est un espion sans effet.
    // Celui-ci reproduit le vrai parent — c'est ce qui en fait un verrou et non une redite.
    function Parent() {
      const [alerte, setAlerte] = useState<AgendaLateAlert | null>(ALERTE);
      return (
        <LateAlertToast alerte={alerte} onShown={() => setAlerte(null)} onOpenDay={vi.fn()} />
      );
    }
    const { container } = render(<Parent />);
    expect(container.textContent).toMatch(/Exercices 12 à 18/);
  });
});
