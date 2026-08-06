import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { type ActivityItem, type ProductionActivity } from "@zetis/types";

import { ProductionPopover } from "./ProductionPopover";

// Le détail de ce que ZETIS fabrique (ADR-0041 §7). Il montrait UN lot ; il montre désormais tout
// ce qui est en vol. Ces verrous portent sur les trois promesses du §7 : l'ordre de service est
// VISIBLE, l'origine est TOUJOURS dite, et un échec ne part qu'à l'acquittement.

function item(over: Partial<ActivityItem> = {}): ActivityItem {
  return {
    kind: "job",
    id: 1,
    label: "Équipement · Théorème de Pythagore",
    status: "queued",
    lane: "llm",
    pct: null,
    pct_is_measured: false,
    // Un travail unitaire n'a aucune pièce à fractionner (addendum 2 §20).
    pieces_done: null,
    pieces_total: null,
    pieces_produced: 0,
    current_piece: null,
    started_at: null,
    trigger: "manual",
    error: null,
    estimated_ms: 30_000,
    ...over,
  };
}

function activite(over: Partial<ProductionActivity> = {}): ProductionActivity {
  return {
    current: null,
    queued_count: 0,
    queued: [],
    failed: [],
    refused: [],
    worker_alive: null,
    media_alive: null,
    ...over,
  };
}

function montre(a: ProductionActivity, onAck = vi.fn(), onClose = vi.fn()) {
  // ⚠️ `MemoryRouter` : le pied porte désormais un `<Link>` vers le Journal filtré. Rendu nu, le
  // panneau lève sur le contexte de routeur — et l'erreur (`Cannot destructure 'basename'`) ne
  // ressemble en rien à sa cause.
  render(
    <MemoryRouter>
      <ProductionPopover activity={a} onClose={onClose} onAcknowledge={onAck} />
    </MemoryRouter>,
  );
  return onAck;
}

describe("ProductionPopover — le détail de ce qui est en vol", () => {
  it("🔒 l'ORDRE de la file est visible, pas seulement son compte", () => {
    // Une règle de priorité qu'on ne peut pas vérifier à l'œil n'est pas vérifiée. C'est tout
    // l'objet de ce panneau : la barre ne rend que le courant.
    montre(
      activite({
        current: item({ id: 10, status: "running", label: "Équipement · A", started_at: "2026-08-06T10:00:00Z" }),
        queued: [item({ id: 11, label: "Fiche · B" }), item({ id: 12, label: "Quiz · C" })],
        queued_count: 2,
      }),
    );

    const lignes = screen.getAllByRole("listitem").map((l) => l.textContent ?? "");
    // Le courant d'abord, puis la file DANS SON ORDRE.
    expect(lignes[0]).toContain("Équipement · A");
    expect(lignes[1]).toContain("Fiche · B");
    expect(lignes[1]).toContain("1er");
    expect(lignes[2]).toContain("Quiz · C");
    expect(lignes[2]).toContain("2e");
  });

  it("🔒 l'origine se dit TOUJOURS — y compris quand elle n'est pas enregistrée", () => {
    // Sans elle, Papa ouvre son écran à 8 h et voit ZETIS travailler sur quelque chose qu'il n'a
    // pas demandé, sans pouvoir savoir pourquoi.
    montre(
      activite({
        current: item({ id: 1, trigger: "agenda", status: "running" }),
        queued: [
          item({ id: 2, trigger: "request" }),
          item({ id: 3, trigger: null }),
        ],
        queued_count: 2,
      }),
    );

    expect(screen.getByText("préparé pour une échéance")).toBeTruthy();
    expect(screen.getByText("demandé par Massimo")).toBeTruthy();
    // Un trou se DIT, il ne se tait pas : un libellé vide se lirait comme « lancé par vous ».
    expect(screen.getByText("origine non enregistrée")).toBeTruthy();
  });

  it("🔒 un travail EN FILE n'affiche aucun pourcentage", () => {
    // Même règle que la barre : une barre qui monte sur un travail qui n'a pas démarré ment sur
    // ce qui se passe. `pct = null`, jamais 0.
    montre(activite({ queued: [item({ id: 7 })], queued_count: 1 }));

    const ligne = screen.getAllByRole("listitem")[0].textContent ?? "";
    expect(ligne).toContain("en file");
    expect(ligne).not.toMatch(/\d+\s?%/);
  });

  it("🔒 un échec porte son MOTIF et ne part que sur acquittement", () => {
    const onAck = montre(
      activite({
        failed: [
          item({ kind: "run", id: 42, status: "failed", error: "moteur injoignable", label: "Fiche · D" }),
        ],
      }),
    );

    expect(screen.getByText("moteur injoignable")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "J'ai vu" }));
    expect(onAck).toHaveBeenCalledWith("run", 42);
  });

  it("🔒 une file TRONQUÉE le déclare — sinon elle se lit comme exhaustive", () => {
    // Le serveur borne à 20 et `queued_count` dit le total. Une troncature muette est un mensonge
    // par omission : l'écran affirmerait « voilà tout » en montrant une partie.
    montre(activite({ queued: [item({ id: 1 }), item({ id: 2 })], queued_count: 25 }));

    expect(screen.getByText(/23 autres plus loin dans la file/)).toBeTruthy();
  });

  it("🔒 le résumé compte des STATUTS, pas des objets", () => {
    // Vu à l'écran le 2026-08-06 : le résumé disait « 1 en cours » sur une file ARRÊTÉE, pendant
    // que la ligne juste en dessous disait « en file ». `current` porte le premier de la file
    // quand rien ne tourne — il n'est pas forcément en cours.
    montre(activite({ current: item({ id: 1, status: "queued" }), queued: [item({ id: 2 })], queued_count: 1 }));

    // ⚠️ Le titre est passé à « Travaux en cours » avec le popover (maquette du header). Seul le
    // MOT change ; ce que le test protège — le compte suit les statuts — est identique.
    const entete = screen.getByRole("heading", { name: /Travaux en cours/i });
    expect(entete.textContent).toContain("2 en attente");
    expect(entete.textContent).not.toContain("en cours ·");
  });

  it("rien en vol : le panneau le dit, il ne se rend pas vide", () => {
    montre(activite());
    expect(screen.getByText(/ZETIS ne fabrique rien/)).toBeTruthy();
  });

  // ─── CE QUE LE POPOVER AJOUTE À LA MODALE ────────────────────────────────────────────────────
  it("🔒 le COULOIR se dit sur chaque ligne", () => {
    // Sans ce mot, un rendu vidéo se lit comme un travail de plus dans la même file — alors qu'il
    // a son propre worker et ne retarde rien.
    montre(
      activite({
        current: item({ id: 1, status: "running", lane: "llm" }),
        queued: [item({ id: 2, lane: "media", label: "Rendu vidéo · Les fractions" })],
        queued_count: 0,
      }),
    );
    expect(screen.getByText(/couloir LLM/)).toBeTruthy();
    expect(screen.getByText(/couloir média/)).toBeTruthy();
  });

  it("🔒 un REFUS s'affiche avec son motif, à part des échecs, et s'acquitte", () => {
    // Un régulateur qui dit non n'est pas une panne : ton ambre, motif tel quel, et le panneau dit
    // ce qui le rouvrira. Le confondre avec un échec apprendrait à Papa à ignorer les deux.
    const onAck = montre(
      activite({
        refused: [
          {
            id: 7,
            regulator: "pending_backlog",
            detail: "34 contenus attendent déjà votre relecture (plafond : 30).",
            trigger: "agenda",
            created_at: "2026-08-07T02:00:00Z",
          },
        ],
      }),
    );
    expect(screen.getByText(/34 contenus attendent déjà votre relecture/)).toBeTruthy();
    expect(screen.getByText(/reprendra dès que la limite sera levée/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /J'ai vu/ }));
    expect(onAck).toHaveBeenCalledWith("refusal", 7);
  });

  it("🔒 le pied mène au Journal FILTRÉ, en paramètres répétés", () => {
    // ⚠️ `?statut=queued,running` serait silencieusement ignoré : `depuisUrl` lit `getAll`. Un lien
    // qui ouvre le Journal SANS filtre est pire qu'aucun lien — il promet un tri qu'il ne fait pas.
    montre(activite({ current: item({ status: "running" }) }));
    const lien = screen.getByRole("link", { name: /Voir au Journal/ });
    expect(lien.getAttribute("href")).toBe("/journal?statut=queued&statut=running");
  });

  it("🔒 `Escape` referme — la modale ne le faisait pas", () => {
    // Un panneau qu'on ne peut fermer que par un bouton reste ouvert, donc masque l'écran qu'il
    // commente. C'est ce qui a fait préférer un popover à une modale.
    const onClose = vi.fn();
    montre(activite({ current: item({ status: "running" }) }), vi.fn(), onClose);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
