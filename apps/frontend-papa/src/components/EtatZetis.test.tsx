import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { type Autonomy } from "@zetis/types";

import { NIVEAU_DESCRIPTION, NIVEAU_LABEL } from "../lib/settings";
import { type AutonomyState } from "../hooks/useAutonomyState";
import { EtatZetis } from "./EtatZetis";

function ready(overrides: Partial<Autonomy> = {}): AutonomyState {
  return {
    status: "ready",
    autonomy: { auto_trigger_enabled: false,
    production_suspended: false, classes: [], niveau: "semi", ...overrides },
  };
}

function show(state: AutonomyState) {
  return render(
    <MemoryRouter>
      <EtatZetis state={state} />
    </MemoryRouter>,
  );
}

/** L'image AFFICHÉE — la dernière rendue, l'entrante du fondu. */
function avatarAffiche(container: HTMLElement): string {
  const images = container.querySelectorAll<HTMLImageElement>(".regime-img:not(.regime-img--sortant)");
  return images[images.length - 1]!.getAttribute("src") ?? "";
}

/** Le texte du badge — le seul texte du bloc depuis le 2026-08-04. */
function badge(container: HTMLElement): string {
  return container.querySelector(".regime-badge")?.textContent ?? "";
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("EtatZetis", () => {
  it("🔒 n'affiche AUCUN régime avant la réponse serveur (addendum §7.4)", () => {
    // ⚠️ Ce test vise l'IMAGE, pas le texte, et c'est délibéré : depuis que le libellé du régime
    // n'est plus écrit au repos (il est dans l'illustration), un `queryByText` serait
    // trivialement vert et ne prouverait plus rien. Ce qui porte le régime, c'est l'avatar — donc
    // c'est l'avatar qu'il faut vérifier neutre.
    const { container } = show({ status: "loading" });

    expect(avatarAffiche(container)).toContain("zetis-avatar");
    expect(avatarAffiche(container)).not.toMatch(/regime-/);
    expect(container.querySelector(".regime-halo")).toBeNull();
    expect(screen.getByRole("link")).toHaveAttribute("aria-busy", "true");
  });

  it("🔒 à l'erreur, le dit — avatar neutre, aucun repli, aucune classe rouge", () => {
    const { container } = show({ status: "error" });

    expect(container.querySelector(".regime-badge--erreur")!.textContent).toBe("ILLISIBLE");
    expect(avatarAffiche(container)).toContain("zetis-avatar");
    expect(container.querySelector(".regime-halo")).toBeNull();
    // §7.6 : le rouge de ce bloc est celui de l'avatar *Autonom* et veut dire « ZETIS a tous les
    // droits ». Un message d'erreur rouge rendrait les deux indiscernables.
    expect(container.innerHTML).not.toMatch(/red-/);
  });

  it("🔒 chaque régime a SON avatar — c'est lui qui porte l'information", () => {
    for (const [niveau, fichier] of [
      ["manuel", "zetis-regime-manuel"],
      ["semi", "zetis-regime-semi"],
      ["autonome", "zetis-regime-autonome"],
    ] as const) {
      const { container, unmount } = show(ready({ niveau: niveau }));
      expect(avatarAffiche(container)).toContain(fichier);
      unmount();
    }

    // « Sur mesure » retombe sur le neutre : aucune image ne lui appartient.
    const { container } = show(ready({ niveau: null }));
    expect(avatarAffiche(container)).toContain("zetis-avatar");
  });

  it("🔒 le badge dit le mot du CODE, pas celui cuit dans l'illustration (§7.7)", () => {
    // L'image du régime `semi` porte « HYBRIDE » dans le pixel ; le code dit « Hybrid ». Le badge
    // suit le CODE — c'est toute la décision du §7.7, et sans ce test la divergence remonterait
    // à l'écran au premier copier-coller. Dérivé de la constante, jamais recopié.
    const { container } = show(ready({ niveau: "semi" }));
    expect(badge(container)).toContain(NIVEAU_LABEL.semi.toUpperCase());
    expect(badge(container)).not.toContain("HYBRIDE");
  });

  it("🔒 déclencheur DÉSARMÉ : jamais « démarre seul », régime autonome compris", () => {
    const { container } = show(ready({ niveau: "autonome", auto_trigger_enabled: false }));

    // La ligne 3 de la table de vérité : « ZETIS sert seul MAIS il attend votre clic ». C'est
    // exactement ce qu'un signe unique rendrait impossible à dire.
    expect(badge(container)).toContain("⏸");
    expect(badge(container)).not.toContain("⚡");
    expect(container.querySelector(".regime-orbit")).toBeNull();
    // Le NOM ACCESSIBLE, lui, garde la phrase entière — le glyphe ne suffit pas à un lecteur.
    expect(screen.getByRole("link").getAttribute("aria-label")).toMatch(/démarre sur clic/);
  });

  it("🔒 déclencheur ARMÉ sous régime manuel : « démarre seul » ET le point", () => {
    const { container } = show(ready({ niveau: "manuel", auto_trigger_enabled: true }));

    // Le symétrique. Les deux tests ENSEMBLE prouvent que les axes sont indépendants ; l'un seul
    // passerait avec un composant qui déduirait le déclencheur du régime.
    expect(badge(container)).toContain("⚡");
    expect(badge(container)).not.toContain("⏸");
    expect(container.querySelector(".regime-orbit")).not.toBeNull();
    expect(screen.getByRole("link").getAttribute("aria-label")).toMatch(/démarre seul/);
  });

  it("🔒 AUCUN texte ne vit à côté du logo — tout tient dans le badge", () => {
    // La décision du 2026-08-04 : le bloc est un logo et une pastille, rien d'autre. Si une ligne
    // de texte revenait à côté, la place gagnée serait reperdue sans que rien ne le signale.
    const { container } = show(ready({ niveau: "autonome", auto_trigger_enabled: true }));
    const lien = container.querySelector("a")!;
    const sansBadge = lien.textContent!.replace(badge(container), "");

    expect(sansBadge.trim()).toBe("");
    expect(badge(container)).toContain("AUTONOM");
    expect(badge(container)).toContain("⚡");
  });

  it("gradue le halo par régime — et manuel n'emprunte celui d'aucun autre", () => {
    for (const [niveau, classe] of [
      ["manuel", "regime-halo--manuel"],
      ["semi", "regime-halo--semi"],
      ["autonome", "regime-halo--autonome"],
    ] as const) {
      const { container, unmount } = show(ready({ niveau: niveau }));
      expect(container.querySelector(".regime-halo")!.className).toContain(classe);
      unmount();
    }

    const { container } = show(ready({ niveau: "manuel" }));
    expect(container.querySelector(".regime-halo")!.className).not.toMatch(/semi|autonome/);
  });

  it("« Sur mesure » se rend sans ressembler à une anomalie", () => {
    // ⚠️ Cet état est INATTEIGNABLE par l'API (deux classes libres, la monotonie interdit le
    // quatrième couple). Ce test est sa SEULE preuve : ne pas le supprimer en le croyant mort.
    const { container } = show(ready({ niveau: null, auto_trigger_enabled: true }));

    expect(container.querySelector(".regime-halo")!.className).toContain("regime-halo--sur-mesure");
    expect(badge(container)).toContain("SUR MESURE");
    expect(badge(container)).toContain("⚡");
    fireEvent.mouseEnter(screen.getByRole("link"));
    expect(screen.getByText("Sur mesure")).toBeInTheDocument();
  });

  describe("l'infobulle", () => {
    it("n'existe PAS tant qu'on ne survole pas", () => {
      const { container } = show(ready({ niveau: "semi" }));
      expect(container.querySelector(".regime-bulle")).toBeNull();
    });

    it("🔒 porte le libellé du régime, sa description ET le déclencheur", () => {
      // C'est elle qui rend le libellé lisible maintenant qu'il n'est plus écrit à côté du logo.
      // Si elle perdait l'un des trois, le bloc deviendrait muet sur cet axe.
      show(ready({ niveau: "semi", auto_trigger_enabled: false }));
      fireEvent.mouseEnter(screen.getByRole("link"));

      expect(screen.getByText(NIVEAU_LABEL.semi)).toBeInTheDocument();
      expect(screen.getByText(NIVEAU_DESCRIPTION.semi)).toBeInTheDocument();
      expect(screen.getByText(/attend votre clic/)).toBeInTheDocument();
    });

    it("🔒 se referme quand le pointeur s'en va", () => {
      // ⚠️ Défaut payé en vrai le 2026-08-04 : l'infobulle était une FILLE du `<a>`, donc son
      // apparition ajoutait un nœud dans le sous-arbre survolé et `onMouseLeave` cessait de se
      // déclencher — la bulle restait ouverte indéfiniment, constaté à l'écran. Corrigé en la
      // sortant du lien : le survol est écouté par un conteneur dont l'arbre ne bouge pas.
      const { container } = show(ready({ niveau: "semi" }));
      const bloc = container.firstElementChild as HTMLElement;

      fireEvent.mouseEnter(bloc);
      expect(container.querySelector(".regime-bulle")).not.toBeNull();

      fireEvent.mouseLeave(bloc);
      expect(container.querySelector(".regime-bulle")).toBeNull();
    });

    it("s'ouvre aussi au CLAVIER — un survol souris exclut ceux qui n'en ont pas", () => {
      const { container } = show(ready({ niveau: "semi" }));
      fireEvent.focus(screen.getByRole("link"));
      expect(container.querySelector(".regime-bulle")).not.toBeNull();

      fireEvent.blur(screen.getByRole("link"));
      expect(container.querySelector(".regime-bulle")).toBeNull();
    });

    it("est en `fixed` — sinon l'`overflow-hidden` de la sidebar la couperait", () => {
      // Piège payé en vrai : la colonne ET son conteneur clippent, pour que la nav défile seule.
      const { container } = show(ready({ niveau: "semi" }));
      fireEvent.mouseEnter(screen.getByRole("link"));
      expect(container.querySelector(".regime-bulle")!.className).toContain("fixed");
    });

    it("est invisible des lecteurs d'écran — le nom du lien dit déjà tout", () => {
      const { container } = show(ready({ niveau: "semi" }));
      fireEvent.mouseEnter(screen.getByRole("link"));
      expect(container.querySelector(".regime-bulle")).toHaveAttribute("aria-hidden");
    });
  });

  it("🔒 ne fait AUCUN appel réseau, dans aucun de ses états", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const etats: AutonomyState[] = [
      { status: "loading" },
      { status: "error" },
      ready({ niveau: "manuel" }),
      ready({ niveau: "semi" }),
      ready({ niveau: "autonome", auto_trigger_enabled: true }),
      ready({ niveau: null }),
    ];
    for (const state of etats) {
      const view = show(state);
      fireEvent.mouseEnter(screen.getByRole("link"));
      view.unmount();
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("est un LIEN vers les Paramètres — il lit, il ne règle pas (§7.3)", () => {
    show(ready({ niveau: "semi" }));
    const lien = screen.getByRole("link");
    expect(lien).toHaveAttribute("href", "/parametres");
    // Aucun bouton : rien ne se change depuis ce bloc.
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("son nom accessible porte les DEUX axes, et l'image n'en porte aucun", () => {
    const { container } = show(ready({ niveau: "autonome", auto_trigger_enabled: true }));

    const lien = screen.getByRole("link", { name: new RegExp(NIVEAU_LABEL.autonome) });
    expect(lien.getAttribute("aria-label")).toMatch(/démarre seul/);
    // L'image est décorative PARCE QUE le nom du lien est là : un `alt` non vide écraserait ce
    // nom, qui est le seul à dire les deux axes.
    expect(container.querySelector("img[aria-hidden]")).not.toBeNull();
    expect(container.querySelector("img[alt]:not([alt=''])")).toBeNull();
  });
});

// --- ⏸ La suspension se lit sur les 22 écrans (ADR-0063 §6) --------------------------------------

describe("la suspension dans la sidebar", () => {
  it("suspendu : le ruban s'affiche, et le nom accessible le dit AVANT le régime", () => {
    show(ready({ production_suspended: true }));

    expect(screen.getByText("⏸ SUSPENDU")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /SUSPENDU.*rien ne démarre/ })).toBeInTheDocument();
  });

  it("suspendu et déclencheur armé : l'orbite DISPARAÎT — « démarre seul » pendant que rien ne démarre serait un mensonge animé", () => {
    const { container } = show(ready({ auto_trigger_enabled: true, production_suspended: true }));

    expect(container.querySelector(".regime-orbit")).toBeNull();
  });

  it("non suspendu : aucun ruban — l'état nominal ne porte pas de bandeau", () => {
    show(ready());

    expect(screen.queryByText("⏸ SUSPENDU")).toBeNull();
  });

  it("le régime reste affiché sous la suspension — elle ne le change pas (§7)", () => {
    show(ready({ production_suspended: true }));

    expect(screen.getByText("HYBRID")).toBeInTheDocument();
  });
});
