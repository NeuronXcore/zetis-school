import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { DiagnosticFiabilite } from "@zetis/types";
import { BandeFiabilite } from "./BandeFiabilite";

// La bande de fiabilité (ADR-0048, Session C).
//
// 🔴 Ce fichier porte deux verrous que rien d'autre ne tient : **les TROIS états** (et non deux),
// et la **règle de vocabulaire** — aucun libellé ne prend l'enfant pour sujet.

const A_CONFIRMER: DiagnosticFiabilite = {
  verdict: "a_confirmer",
  regle_version: 1,
  faits: {
    sorties_ecran: 3,
    enonces_copies: 1,
    plein_ecran_quitte: false,
    acquises_sans_trace: 6,
    notions_total: 8,
  },
  indices: { reponses_rapides: 4, taille_changee: true },
  declencheurs: ["sorties_ecran", "enonces_copies", "contraste"],
  portee: { observables: ["sortie_ecran", "copie", "taille"] },
};

const RIEN: DiagnosticFiabilite = {
  ...A_CONFIRMER,
  verdict: "rien_a_signaler",
  faits: { ...A_CONFIRMER.faits, sorties_ecran: 0, enonces_copies: 0, acquises_sans_trace: 0 },
  indices: { reponses_rapides: 0, taille_changee: false },
  declencheurs: [],
};

const poser = (f: DiagnosticFiabilite | null) =>
  render(<BandeFiabilite fiabilite={f} onRemesurer={vi.fn()} />);

describe("🔴 TROIS états, pas deux", () => {
  it("« à confirmer » rend la bande et ses faits", () => {
    poser(A_CONFIRMER);
    expect(screen.getByText(/Cette mesure est à confirmer/)).toBeInTheDocument();
    expect(screen.getByText(/L'écran a été quitté 3 fois/)).toBeInTheDocument();
  });

  it("« rien à signaler » rend une LIGNE GRISE — et surtout PAS de bande verte", () => {
    const { container } = poser(RIEN);
    expect(screen.getByText(/Rien à signaler sur les conditions/)).toBeInTheDocument();
    // 🔴 Une bande verte « mesure fiable ✓ » serait une promesse que l'instrument ne peut pas
    // tenir : aucun signal du navigateur ne survit à un téléphone posé à côté de l'écran.
    // Sabotage : rendre la même bande en vert avec « mesure fiable » → rouge.
    expect(container.textContent).not.toMatch(/fiable|✓|vérifiée|sûre/i);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("🔴 `null` ne rend RIEN — ZETIS ne regardait pas, ce n'est pas « rien à signaler »", () => {
    const { container } = poser(null);
    // Sabotage : traiter `null` comme `rien_a_signaler` → rouge. Les deux se confondraient, et une
    // absence d'instrument passerait pour un constat d'instrument.
    expect(container).toBeEmptyDOMElement();
  });
});

describe("🔴 la règle de vocabulaire", () => {
  it("aucun libellé ne prend l'ENFANT pour sujet", () => {
    const { container } = poser(A_CONFIRMER);
    const texte = (container.textContent ?? "").toLowerCase();
    // Sabotage : écrire « Massimo est sorti de l'écran 3 fois » → rouge. Ce verrou protège la
    // décision centrale du chantier, pas une préférence de style : la verbalisation repose
    // entièrement sur le fait que l'enfant n'ait rien à défendre.
    for (const interdit of ["massimo", "triché", "triche", "suspect", "fraude", "détecté"]) {
      expect(texte).not.toContain(interdit);
    }
    // L'anti-test-à-vide : la bande parle bien, et elle parle de LA MESURE.
    expect(texte).toContain("cette mesure est à confirmer");
    expect(texte).toContain("conditions");
  });

  it("dit que ce ne sont pas des reproches, et que les chiffres restent valables", () => {
    poser(A_CONFIRMER);
    expect(screen.getByText(/ne sont pas des reproches/)).toBeInTheDocument();
  });
});

describe("faits et indices ne se rendent pas pareil", () => {
  it("les indices sont AFFICHÉS, et marqués comme tels", () => {
    poser(A_CONFIRMER);
    // Ils s'affichent : les cacher au motif qu'ils sont bruités reviendrait à décider à la place
    // de Papa, qui lit mieux qu'un seuil.
    expect(screen.getByText(/4 réponses nettement plus rapides/)).toBeInTheDocument();
    expect(screen.getByText(/La fenêtre a changé de taille/)).toBeInTheDocument();
    expect(screen.getAllByText("indice")).toHaveLength(2);
    expect(screen.getAllByText("fait").length).toBeGreaterThanOrEqual(3);
  });

  it("un fait absent ne s'affiche pas — pas de « 0 fois »", () => {
    poser(A_CONFIRMER);
    // `plein_ecran_quitte` est faux dans ce décor : il ne doit pas apparaître en négatif.
    expect(screen.queryByText(/plein écran a été quitté/)).not.toBeInTheDocument();
  });
});

describe("🔭 l'instrument dit sa portée", () => {
  it("annonce combien de signaux étaient observables, et nomme celui qui manquait", () => {
    poser(A_CONFIRMER);
    expect(screen.getByText(/signaux étaient observables sur cet appareil/)).toBeInTheDocument();
    // Sans cette phrase, l'absence d'un signal se lirait comme l'absence du comportement.
    expect(screen.getByText(/iOS Safari le refuse sur iPhone/)).toBeInTheDocument();
  });

  it("ne parle pas du plein écran quand il ÉTAIT observable", () => {
    poser({ ...A_CONFIRMER, portee: { observables: ["sortie_ecran", "copie", "taille", "plein_ecran"] } });
    expect(screen.queryByText(/iPhone/)).not.toBeInTheDocument();
  });
});

describe("🔴 un seul geste, et la bande ne se retire pas", () => {
  it("« Remesurer cette matière » est le SEUL bouton", () => {
    poser(A_CONFIRMER);
    const boutons = screen.getAllByRole("button");
    expect(boutons).toHaveLength(1);
    expect(boutons[0]).toHaveAccessibleName(/Remesurer cette matière/);
  });

  it("aucun bouton « j'ai vérifié », aucune fermeture, aucun masquage", () => {
    const { container } = poser(A_CONFIRMER);
    // Les conditions d'une passation sont un fait daté, au même titre que le score : les effacer
    // parce qu'on les a lues reviendrait à réécrire la mesure.
    const texte = (container.textContent ?? "").toLowerCase();
    for (const interdit of ["j'ai vérifié", "masquer", "ignorer", "fermer", "ok, compris"]) {
      expect(texte).not.toContain(interdit);
    }
  });

  it("le geste remonte l'intention à la page", () => {
    const onRemesurer = vi.fn();
    render(<BandeFiabilite fiabilite={A_CONFIRMER} onRemesurer={onRemesurer} />);
    screen.getByRole("button", { name: /Remesurer/ }).click();
    expect(onRemesurer).toHaveBeenCalledOnce();
  });
});
