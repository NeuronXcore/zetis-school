import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { FicheCandidates, FicheDraftDetail } from "@zetis/types";

// L'atelier — la fiche que Massimo fabrique (addendum ADR-0015, slice 1).
//
// Ces tests protègent des règles de TENUE, pas une mise en page. Trois d'entre elles ne se
// verraient dans aucun test backend, et une page sans test de rendu est une page qui part en
// production sans que personne l'ait regardée (`AgendaPage` l'a fait).

const api = vi.hoisted(() => ({
  openDraft: vi.fn(),
  fetchCandidates: vi.fn(),
  saveDraft: vi.fn(),
  reviewDraft: vi.fn(),
  finishDraft: vi.fn(),
}));
vi.mock("../lib/atelier", () => api);

const voix = vi.hoisted(() => ({ speak: vi.fn() }));
vi.mock("../lib/speech", () => voix);

import { AtelierPage } from "./AtelierPage";

const DRAFT: FicheDraftDetail = {
  id: 42,
  lesson_id: 7,
  subject_slug: "svt",
  lesson_title: "Les séismes",
  chapter: "La Terre bouge",
  version: 1,
  draft: {
    title: "Les séismes",
    subject: "SVT",
    level: "4e",
    chapter: "La Terre bouge",
    essentiel: null,
    definitions: [],
    points_cles: [],
    erreurs_a_eviter: [],
    mini_exemple: null,
  },
};

const CANDIDATES: FicheCandidates = {
  section: "points_cles",
  slots: 5,
  candidates: [
    { index: 0, texte: "Un séisme vient d'une cassure brutale des roches." },
    { index: 1, texte: "L'épicentre est le point situé à la surface." },
    { index: 2, texte: "La magnitude mesure l'énergie libérée." },
  ],
};

function monter() {
  return render(
    <MemoryRouter initialEntries={["/fiches/svt/7/atelier"]}>
      <Routes>
        <Route path="/fiches/:slug/:lessonId/atelier" element={<AtelierPage />} />
        <Route path="/fiches/:slug" element={<div>liste-des-fiches</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.openDraft.mockResolvedValue(DRAFT);
  api.fetchCandidates.mockResolvedValue(CANDIDATES);
  api.saveDraft.mockResolvedValue(DRAFT);
});

/** Glisse une phrase du cours sur un emplacement — événements POINTEUR, comme la banque de
 *  nœuds des mindmaps. `elementFromPoint` n'existe pas dans jsdom : on le remplace le temps du
 *  lâcher, sinon la cible serait toujours `null` et le test ne mesurerait rien. */
async function glisser(texte: string, emplacement: number | null) {
  const puce = screen.getByText(texte);
  const cible =
    emplacement === null ? null : document.querySelector(`[data-emplacement="${emplacement}"]`);
  // ⚠️ jsdom n'implémente PAS `elementFromPoint` — `vi.spyOn` échoue sur une propriété absente.
  // On la pose, puis on la retire : c'est la seule façon de faire aboutir un dépôt en test.
  const original = (document as Partial<Document>).elementFromPoint;
  (document as unknown as { elementFromPoint: () => Element | null }).elementFromPoint = () =>
    cible as unknown as Element | null;
  // Deux `act` distincts : les écouteurs globaux ne sont souscrits qu'après le rendu déclenché
  // par le `pointerdown`. Tout envoyer d'un bloc ne déclencherait aucun dépôt.
  await act(async () => {
    fireEvent.pointerDown(puce, { clientX: 10, clientY: 10 });
  });
  await act(async () => {
    fireEvent.pointerMove(window, { clientX: 50, clientY: 50 });
    fireEvent.pointerUp(window, { clientX: 50, clientY: 50 });
  });
  (document as unknown as { elementFromPoint: unknown }).elementFromPoint = original;
}

describe("AtelierPage", () => {
  it("montre les phrases du cours et les emplacements à remplir", async () => {
    monter();
    expect(await screen.findByText(/Les séismes/)).toBeInTheDocument();
    expect(screen.getByText(CANDIDATES.candidates[0].texte)).toBeInTheDocument();
    // Cinq emplacements, tous libres au départ.
    expect(screen.getAllByText(/un emplacement libre/)).toHaveLength(5);
  });

  it("place une phrase au GLISSER et la sauvegarde AUSSITÔT", async () => {
    // La page promet « tout est gardé au fur et à mesure ». Si la sauvegarde n'est pas au geste,
    // la promesse est fausse — et c'est la seule chose qui rend la reprise possible.
    monter();
    await screen.findByText(CANDIDATES.candidates[1].texte);
    await glisser(CANDIDATES.candidates[1].texte, 0);

    await waitFor(() => expect(api.saveDraft).toHaveBeenCalledTimes(1));
    expect(api.saveDraft.mock.calls[0][1].points_cles).toEqual([CANDIDATES.candidates[1].texte]);
    expect(screen.getAllByText(/un emplacement libre/)).toHaveLength(4);
  });

  it("ne place RIEN quand la phrase est lâchée à côté d'un emplacement", async () => {
    // Lâcher à côté ne coûte rien et ne dit rien : la phrase retourne au cours, sans message.
    monter();
    await screen.findByText(CANDIDATES.candidates[0].texte);
    await glisser(CANDIDATES.candidates[0].texte, null);

    expect(api.saveDraft).not.toHaveBeenCalled();
    expect(screen.getAllByText(/un emplacement libre/)).toHaveLength(5);
  });

  it("garde le CLIC pour retirer une phrase placée", async () => {
    // La moitié du geste « je choisis » est de pouvoir se raviser — et retirer reste un clic,
    // pas un glisser : on ne demande pas de viser pour défaire.
    monter();
    await screen.findByText(CANDIDATES.candidates[0].texte);
    await glisser(CANDIDATES.candidates[0].texte, 0);
    fireEvent.click(screen.getByRole("button", { name: /Retirer l'idée 1/ }));

    await waitFor(() => expect(api.saveDraft).toHaveBeenCalledTimes(2));
    expect(api.saveDraft.mock.calls[1][1].points_cles).toEqual([]);
  });

  it("n'en perd aucun quand deux gestes s'enchaînent dans le même tick", async () => {
    // 🔴 Constaté à l'écran le 2026-08-13 : deux retraits enchaînés n'en produisaient qu'UN,
    // parce que le second lisait la sélection capturée dans la fermeture, donc périmée. Un
    // enfant qui tape vite sur un téléphone le déclenche.
    api.openDraft.mockResolvedValue({
      ...DRAFT,
      draft: {
        ...DRAFT.draft,
        points_cles: [CANDIDATES.candidates[0].texte, CANDIDATES.candidates[1].texte],
      },
    });
    monter();
    await screen.findByText(/2 idées sur 5/);

    // ⚠️ Les deux clics DOIVENT partir dans le même `act` : `fireEvent.click` vide la file
    // d'état entre deux appels, donc deux `fireEvent` successifs ne reproduisent JAMAIS le
    // défaut — la version précédente de ce test restait verte sur le code fautif.
    const croix = screen.getAllByRole("button", { name: /Retirer l'idée/ });
    await act(async () => {
      croix[1].click();
      croix[0].click();
    });

    await waitFor(() => expect(api.saveDraft).toHaveBeenCalledTimes(2));
    expect(api.saveDraft.mock.calls[1][1].points_cles).toEqual([]);
    expect(await screen.findByText(/0 idée sur 5/)).toBeInTheDocument();
  });

  it("reprend exactement où il s'était arrêté", async () => {
    api.openDraft.mockResolvedValue({
      ...DRAFT,
      draft: { ...DRAFT.draft, points_cles: [CANDIDATES.candidates[2].texte] },
    });
    monter();

    expect(await screen.findByText(/1 idée sur 5/)).toBeInTheDocument();
    expect(screen.getAllByText(/un emplacement libre/)).toHaveLength(4);
  });

  it("n'ouvre « regarde ma fiche » que lorsqu'il a choisi quelque chose", async () => {
    monter();
    const bouton = await screen.findByRole("button", { name: /regarde ma fiche/i });
    expect(bouton).toBeDisabled();

    await glisser(CANDIDATES.candidates[0].texte, 0);
    await waitFor(() => expect(bouton).toBeEnabled());
  });

  it("ne rend QUE des réussites — aucune remarque en slice 1", async () => {
    // 🔴 Le verrou du blocage tranché : en mode « je choisis », les points-clés SONT des phrases
    // du cours. Une remarque `recopie` dirait à Massimo que tout son travail est du copiage.
    api.reviewDraft.mockResolvedValue({
      reussites: ["« L'épicentre… » — c'est une des idées que ton cours met en gras."],
      remarques: [],
    });
    monter();
    await screen.findByText(CANDIDATES.candidates[1].texte);
    await glisser(CANDIDATES.candidates[1].texte, 0);
    fireEvent.click(screen.getByRole("button", { name: /regarde ma fiche/i }));

    expect(await screen.findByText(/met en gras/)).toBeInTheDocument();
    expect(screen.queryByText(/mot pour mot/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/bravo/i)).not.toBeInTheDocument();
  });

  it("répond à « je sèche » sans déception, sans relance et sans confirmation", async () => {
    // Règle 4 du §5 : si dire « je ne sais pas » est gratuit, il le dit — sinon il recopie son
    // cours. Le test interdit toute formule qui ferait payer l'aveu.
    monter();
    fireEvent.click(await screen.findByRole("button", { name: /Je sèche/ }));

    const message = await screen.findByText(/ça arrive/);
    expect(message).toBeInTheDocument();
    expect(screen.queryByText(/tu es sûr/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/dommage/i)).not.toBeInTheDocument();
  });

  it("ne parle JAMAIS tout seul — la voix attend un geste", async () => {
    // `AudioContext` l'exige (piège payé au test live du 2026-08-02), et une voix qui part seule
    // est une notification poussée.
    monter();
    await screen.findByText(/Les séismes/);
    expect(voix.speak).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Écouter ZETIS/ }));
    expect(voix.speak).toHaveBeenCalledTimes(1);
  });

  it("ne montre AUCUNE étape non implémentée", async () => {
    // Le gabarit de la spec compte six étapes ; la slice 1 n'en tient qu'une. Une étape visible
    // mais morte est une promesse que le produit ne tient pas — même principe que l'étape
    // « Mnemonics », que l'addendum §10 interdit d'afficher grisée.
    monter();
    await screen.findByText(/Les séismes/);
    for (const absente of [/L'essentiel/, /Les mots à connaître/, /Pièges à éviter/, /Mnemonics/]) {
      expect(screen.queryByText(absente)).not.toBeInTheDocument();
    }
  });

  it("ne décompte jamais ce qui manque", async () => {
    // `CLAUDE.md` § Gamification : on compte ce qui est commencé, jamais ce qui reste dû.
    monter();
    expect(await screen.findByText(/0 idée sur 5/)).toBeInTheDocument();
    expect(screen.queryByText(/il te reste/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/plus que/i)).not.toBeInTheDocument();
  });
});
