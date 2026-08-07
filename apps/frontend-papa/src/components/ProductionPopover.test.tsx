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
    // ⚠️ Le RANG reste, seule sa formulation change : « en file — 1er » est devenu « 1ᵉʳ dans la
    // file, derrière le lot en cours ». La règle protégée est la même — la priorité doit être
    // VISIBLE, pas seulement vraie —, et elle est même mieux servie : on sait désormais derrière
    // QUOI on attend.
    expect(lignes[1]).toContain("1ᵉʳ dans la file");
    expect(lignes[2]).toContain("Quiz · C");
    expect(lignes[2]).toContain("2ᵉ dans la file");
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

    // ⚠️ **L'origine est désormais FUSIONNÉE dans la phrase d'état** (arbitrage du 2026-08-07) :
    // elle ne forme plus un nœud de texte à elle seule, d'où la recherche sur le contenu des
    // lignes. Ce que ce test protège n'a pas bougé — la maquette supprimait l'origine, et c'est
    // précisément ce qu'on a refusé de faire.
    const lignes = screen.getAllByRole("listitem").map((l) => l.textContent ?? "");
    expect(lignes.some((l) => l.includes("préparé pour une échéance"))).toBe(true);
    expect(lignes.some((l) => l.includes("demandé par Massimo"))).toBe(true);
    // Un trou se DIT, il ne se tait pas : un libellé vide se lirait comme « lancé par vous ».
    expect(lignes.some((l) => l.includes("origine non enregistrée"))).toBe(true);
  });

  it("🔒 un travail EN FILE n'affiche aucun pourcentage", () => {
    // Même règle que la barre : une barre qui monte sur un travail qui n'a pas démarré ment sur
    // ce qui se passe. `pct = null`, jamais 0.
    montre(activite({ queued: [item({ id: 7 })], queued_count: 1 }));

    const ligne = screen.getAllByRole("listitem")[0].textContent ?? "";
    expect(ligne).toContain("dans la file");
    expect(ligne).not.toMatch(/\d+\s?%/);
    // ⚠️ Et il n'a pas d'ancienneté non plus : un travail en file n'a pas démarré, `started_at`
    // est `null`, et lui inventer un « démarré il y a … » serait le même mensonge que le 0 %.
    expect(ligne).not.toContain("démarré");
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
    // ⚠️ La phrase est désormais celle de CE régulateur : « reprendra après relecture », pas la
    // formule générale qui les couvrait tous.
    expect(screen.getByText(/reprendra après relecture/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /J'ai vu/ }));
    expect(onAck).toHaveBeenCalledWith("refusal", 7);
  });

  // ─── LA PHRASE D'ÉTAT ────────────────────────────────────────────────────────────────────────
  it("🔒 un travail MESURÉ dit sa FRACTION, pas son seul pourcentage", () => {
    // « 37 % » ne se distingue pas d'une estimation bien tournée ; « 7 / 19 pièces » prouve que le
    // serveur COMPTE. La bande le disait déjà, le popover l'avait perdu.
    montre(
      activite({
        current: item({
          status: "running",
          pct_is_measured: true,
          pct: 37,
          pieces_done: 7,
          pieces_total: 19,
          started_at: new Date(Date.now() - 4 * 60_000).toISOString(),
        }),
        worker_alive: true,
      }),
    );
    const ligne = screen.getAllByRole("listitem")[0].textContent ?? "";
    expect(ligne).toContain("7 / 19 pièces");
    expect(ligne).toContain("démarré il y a 4 min");
    // 🔴 L'origine SURVIT à la fusion — c'est l'arbitrage qui a refusé de suivre la maquette.
    expect(ligne).toContain("lancé par vous");
  });

  it("🔒 « derrière le lot en cours » ne s'écrit QUE si quelque chose tourne", () => {
    // 🔴 Sur une file arrêtée, la phrase serait fausse — exactement la faute du résumé « 1 en
    // cours » affiché sur une file à l'arrêt, corrigée à l'écran le 2026-08-06. `current` porte le
    // premier de la file quand rien ne tourne : sa présence ne prouve pas qu'il y a du travail.
    montre(
      activite({
        current: item({ id: 1, status: "queued" }),
        queued: [item({ id: 2 })],
        queued_count: 1,
        worker_alive: false,
      }),
    );
    const lignes = screen.getAllByRole("listitem").map((l) => l.textContent ?? "");
    expect(lignes.join(" ")).not.toContain("derrière le lot en cours");
    // …mais le rang reste : la priorité doit être visible même à l'arrêt.
    expect(lignes.join(" ")).toContain("dans la file");
  });

  it("🔒 le rang compte depuis le HAUT de la liste, pas depuis le travail courant", () => {
    // 🔴 Vu à l'écran le 2026-08-07 : rien ne tournait, `current` portait le premier de la file et
    // s'affichait sans rang, pendant que la ligne juste EN DESSOUS s'annonçait « 1ᵉʳ ». La seconde
    // ligne prétendait être la première. Le rang se comptait « derrière le travail en cours » —
    // ce qui n'a de sens que s'il y en a un.
    montre(
      activite({
        current: item({ id: 1, status: "queued", label: "Équipement · A" }),
        queued: [item({ id: 2, label: "Fiche · B" })],
        queued_count: 1,
        worker_alive: true,
      }),
    );
    const lignes = screen.getAllByRole("listitem").map((l) => l.textContent ?? "");
    expect(lignes[0]).toContain("1ᵉʳ dans la file");
    expect(lignes[1]).toContain("2ᵉ dans la file");
  });

  it("🔒 …mais quand quelque chose TOURNE, le courant n'a pas de rang", () => {
    // La contre-épreuve : un travail en cours n'est pas « 1ᵉʳ dans la file », il n'y est plus.
    montre(
      activite({
        current: item({ id: 1, status: "running", label: "Équipement · A" }),
        queued: [item({ id: 2, label: "Fiche · B" })],
        queued_count: 1,
        worker_alive: true,
      }),
    );
    const lignes = screen.getAllByRole("listitem").map((l) => l.textContent ?? "");
    expect(lignes[0]).not.toContain("dans la file");
    expect(lignes[1]).toContain("1ᵉʳ dans la file, derrière le lot en cours");
  });

  it("🔒 un refus `already_produced` ne PROMET RIEN — il ne reprendra jamais", () => {
    // 🔴 **Le défaut que ce chantier corrige.** Une phrase générique — « reprendra dès que la
    // limite sera levée » — couvrait les cinq régulateurs. Or celui-ci est satisfait par
    // CONSTRUCTION : le contenu existe déjà, rien ne le rouvrira. Papa attendait une production
    // qui ne viendrait pas, et rien à l'écran ne le détrompait.
    montre(
      activite({
        refused: [
          {
            id: 8,
            regulator: "already_produced",
            detail: "La fiche de cette notion existe déjà. Relancer une production ne la remplacerait pas.",
            trigger: "request",
            created_at: "2026-08-07T02:00:00Z",
          },
        ],
      }),
    );
    const ligne = screen.getAllByRole("listitem")[0].textContent ?? "";
    expect(ligne).toContain("ne reprendra pas");
    expect(ligne).not.toContain("reprendra dès");
    expect(ligne).not.toMatch(/\breprendra (après|quand)\b/);
  });

  it("⚠️ un régulateur INCONNU se tait, il n'invente pas de promesse", () => {
    // Le repli est le silence. Une phrase par défaut sur un code qu'on ne connaît pas, c'est
    // exactement comme ça que « reprendra dès que la limite sera levée » est devenu faux.
    montre(
      activite({
        refused: [
          {
            id: 9,
            regulator: "plafond_futur_pas_encore_ecrit",
            detail: "un motif quelconque",
            trigger: "agenda",
            created_at: "2026-08-07T02:00:00Z",
          },
        ],
      }),
    );
    const ligne = screen.getAllByRole("listitem")[0].textContent ?? "";
    expect(ligne).toContain("un motif quelconque");
    expect(ligne).toContain("préparé pour une échéance");
    expect(ligne).not.toContain("reprendra");
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
