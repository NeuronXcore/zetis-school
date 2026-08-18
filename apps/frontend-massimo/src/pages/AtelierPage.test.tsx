import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { FicheCandidates, FicheDraftDetail } from "@zetis/types";

// L'atelier — la fiche que Massimo fabrique (addendum ADR-0015, slice 1).
//
// Ces tests protègent des règles de TENUE, pas une mise en page. Trois d'entre elles ne se
// verraient dans aucun test backend, et une page sans test de rendu est une page qui part en
// production sans que personne l'ait regardée (`AgendaPage` l'a fait).

// ⚠️ `AtelierIncomplet` est une VRAIE classe dans le mock, pas un `vi.fn()` : la page fait
// `e instanceof AtelierIncomplet` pour distinguer le 422 que le serveur a écrit POUR Massimo
// d'une panne qui ne le regarde pas. Un doublon vide ferait échouer l'`instanceof` en silence.
const api = vi.hoisted(() => ({
  AtelierIncomplet: class AtelierIncomplet extends Error {},
  openDraft: vi.fn(),
  fetchCandidates: vi.fn(),
  saveDraft: vi.fn(),
  reviewDraft: vi.fn(),
  finishDraft: vi.fn(),
  transcribeForDraft: vi.fn(),
}));
vi.mock("../lib/atelier", () => api);

const voix = vi.hoisted(() => ({ speak: vi.fn() }));
vi.mock("../lib/speech", () => voix);

const dictee = vi.hoisted(() => ({
  isDictationSupported: vi.fn(() => true),
  startRecording: vi.fn(),
}));
vi.mock("../lib/dictation", () => dictee);

import { AtelierPage } from "./AtelierPage";
import { useSearchParams } from "react-router-dom";

/** Sonde : rend l'URL d'arrivée, pour distinguer « la fiche » de « la liste ». */
function AdresseVue() {
  const [params] = useSearchParams();
  return <output data-testid="adresse">{params.toString() || "sans-parametre"}</output>;
}

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

// Chaque section offre autre chose pour démarrer — le mock doit le refléter, sinon les tests
// des étapes ② et ③ mesureraient les candidates de l'étape ①.
const ESSENTIEL: FicheCandidates = {
  section: "essentiel",
  slots: 1,
  candidates: [],
  amorce: "Les séismes, c'est…",
};
const DEFINITIONS: FicheCandidates = {
  section: "definitions",
  slots: 2,
  candidates: [
    { index: 0, texte: "épicentre" },
    { index: 1, texte: "magnitude" },
  ],
};

const PIEGES: FicheCandidates = {
  section: "erreurs_a_eviter",
  slots: 3,
  candidates: [
    { index: 0, texte: "Attention à : Épicentre", raison: "tu t'es trompé 2 fois là-dessus" },
    { index: 1, texte: "Attention à : Magnitude", raison: "tu t'es trompé une fois là-dessus" },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  api.openDraft.mockResolvedValue(DRAFT);
  api.fetchCandidates.mockImplementation((_id: number, section = "points_cles") =>
    Promise.resolve(
      section === "essentiel"
        ? ESSENTIEL
        : section === "definitions"
          ? DEFINITIONS
          : section === "erreurs_a_eviter"
            ? PIEGES
            : CANDIDATES,
    ),
  );
  api.saveDraft.mockResolvedValue(DRAFT);
  dictee.isDictationSupported.mockReturnValue(true);
});

/** Déplie une étape de l'accordéon en cliquant sur son titre. */
async function deplier(titre: RegExp) {
  fireEvent.click(await screen.findByText(titre));
}

/** Glisse une phrase du cours sur un emplacement — événements POINTEUR, comme la banque de
 *  nœuds des mindmaps. `elementFromPoint` n'existe pas dans jsdom : on le remplace le temps du
 *  lâcher, sinon la cible serait toujours `null` et le test ne mesurerait rien. */
async function glisser(texte: string, emplacement: number | null) {
  // 🔴 `findByText`, JAMAIS `getByText` — corrigé le 2026-08-17, seconde cause de la CI instable.
  // Les puces viennent de `fetchCandidates`, une promesse ; le bouton « regarde ma fiche », lui,
  // appartient au gabarit et est là tout de suite. Un test qui attend le BOUTON puis glisse une
  // PUCE attend donc la mauvaise chose : sous charge, la puce n'est pas encore née et
  // `getByText` lève « Unable to find an element with the text: … ».
  //
  // L'asymétrie était visible dans ce fichier même : le test « ne rend QUE des réussites »
  // attendait sa puce (`await screen.findByText(…)`), son voisin non. Corriger l'AIDE plutôt que
  // ses appelants ferme la classe entière au lieu d'un cas.
  const puce = await screen.findByText(texte);
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

// ⚠️ « sur 3 » → « sur 4 » le 2026-08-13 (étape ④), puis → « sur 5 » le 2026-08-14 (étape ⑤,
// ADR-0055). Le DÉNOMINATEUR n'est plus constant : l'étape ⑥ est conditionnelle, elle ne compte
// que si ZETIS a détecté une occasion — cf. le test dédié plus bas.
// (addendum ADR-0015 §13). Changement de comportement VOULU, pas un test ajusté pour
// passer — le plan de la fiche compte désormais quatre étapes ouvertes.
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
    await screen.findByText(/1 étape sur 5/);

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
    expect(await screen.findByText(/0 étape sur 5/)).toBeInTheDocument();
  });

  it("reprend exactement où il s'était arrêté", async () => {
    api.openDraft.mockResolvedValue({
      ...DRAFT,
      draft: { ...DRAFT.draft, points_cles: [CANDIDATES.candidates[2].texte] },
    });
    monter();

    expect(await screen.findByText(/1 étape sur 5/)).toBeInTheDocument();
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
    // Le gabarit de la spec compte six étapes ; **la slice 2 en tient trois**. Une étape visible
    // mais morte est une promesse que le produit ne tient pas — même principe que l'étape
    // « Mnemonics », que l'addendum §10 interdit d'afficher grisée.
    //
    // ⚠️ **Liste MISE À JOUR en slice 2** : `L'essentiel` et `Les mots à connaître` sont passés
    // du côté des présentes. Ce n'est pas le test qui s'assouplit, c'est le produit qui livre.
    monter();
    await screen.findByText(/Les séismes/);
    for (const presente of [/L'essentiel/, /Les mots à connaître/, /Un exemple/]) {
      expect(screen.getByText(presente)).toBeInTheDocument();
    }
    // 🔴 **⑥ reste absente ici, et ce n'est PAS parce qu'elle n'est pas implémentée** — elle
    // l'est depuis l'ADR-0055. Elle est absente parce que ce brouillon n'offre **aucune
    // occasion** (§10). C'est la seule étape conditionnelle de la fiche, et elle n'est jamais
    // rendue grisée : une étape visible mais morte est une promesse que le produit ne tient pas.
    expect(screen.queryByText(/Mnemonics/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Pièges à éviter/)).not.toBeInTheDocument();
  });

  it("🔴 n'offre l'étape ⑥ QUE si ZETIS a détecté une occasion", async () => {
    // Le drapeau vient du SERVEUR, recalculé à chaque sauvegarde — la règle n'est pas dupliquée
    // côté client. Sans occasion, l'étape n'existe pas ; avec, elle apparaît ET entre au
    // dénominateur du compteur.
    api.openDraft.mockResolvedValue({ ...DRAFT, mnemonique_occasion: true });
    monter();
    await screen.findByText(/Les séismes/);

    expect(screen.getByText(/Mnemonics/)).toBeInTheDocument();
    expect(await screen.findByText(/0 étape sur 6/)).toBeInTheDocument();
  });

  // ── Slice 2 : les deux étapes qui s'ÉCRIVENT ────────────────────────────────

  it("ne déplie qu'UNE étape à la fois", async () => {
    // Le plan reste visible, le travail reste concentré (spec § gabarit de la colonne).
    monter();
    // ① est ouverte au départ : ses phrases sont là.
    expect(await screen.findByText(CANDIDATES.candidates[0].texte)).toBeInTheDocument();

    await deplier(/L'essentiel/);
    await waitFor(() =>
      expect(screen.queryByText(CANDIDATES.candidates[0].texte)).not.toBeInTheDocument(),
    );
    expect(screen.getByLabelText(/L'essentiel, avec tes mots/)).toBeInTheDocument();
  });

  it("pose une AMORCE et ne laisse jamais la zone vide", async () => {
    // Règle 1 des champs libres (§9) : la page blanche est ce qui fait recopier le cours.
    monter();
    await deplier(/L'essentiel/);
    expect(await screen.findByText(/Les séismes, c'est…/)).toBeInTheDocument();
  });

  it("montre le budget comme de la PLACE, jamais comme un compteur", async () => {
    // « il te reste de la place pour 9 lignes », jamais « 412 / 600 », jamais de rouge (§9).
    monter();
    await deplier(/L'essentiel/);
    expect(await screen.findByText(/il te reste de la place pour \d+ lignes?/)).toBeInTheDocument();
    expect(screen.queryByText(/\d+\s*\/\s*600/)).not.toBeInTheDocument();
  });

  it("n'analyse RIEN pendant que Massimo écrit", async () => {
    // §6 : un correcteur qui commente chaque phrase au moment où elle sort est un évaluateur
    // par-dessus l'épaule — l'enfant cesse d'écrire, ou écrit pour plaire.
    monter();
    await deplier(/L'essentiel/);
    const champ = await screen.findByLabelText(/L'essentiel, avec tes mots/);
    fireEvent.change(champ, { target: { value: "Un séisme, c'est quand ça tremble." } });
    fireEvent.change(champ, { target: { value: "Un séisme, c'est quand la terre tremble." } });

    expect(api.reviewDraft).not.toHaveBeenCalled();
  });

  it("se TAIT pendant l'enregistrement de la dictée", async () => {
    // Sans écouteurs, sa voix repartirait droit dans le micro Whisper (§5 bis, pas de barge-in).
    let arreter: () => void = () => {};
    dictee.startRecording.mockImplementation(
      () =>
        new Promise((resolve) => {
          arreter = () => resolve({ stop: async () => new Blob(), cancel: () => {}, analyser: null });
          arreter();
        }),
    );
    monter();
    await deplier(/L'essentiel/);
    fireEvent.click(await screen.findByRole("button", { name: /Le dire à voix haute/ }));

    const haut_parleur = await screen.findByRole("button", { name: /Écouter ZETIS/ });
    await waitFor(() => expect(haut_parleur).toBeDisabled());
  });

  it("donne le mot et laisse Massimo écrire la définition", async () => {
    // L'hybride du §8 : ZETIS a le terme, Massimo a la phrase. C'est SA formulation qu'il
    // révisera — et c'est un test de récupération, pas une lecture.
    monter();
    await deplier(/Les mots à connaître/);

    const champ = await screen.findByLabelText("épicentre");
    expect(champ).toHaveValue("");
    fireEvent.change(champ, { target: { value: "le point juste au-dessus du foyer" } });
    fireEvent.blur(champ);

    await waitFor(() => expect(api.saveDraft).toHaveBeenCalled());
    const dernier = api.saveDraft.mock.calls.at(-1)![1];
    expect(dernier.definitions).toEqual([
      { terme: "épicentre", definition: "le point juste au-dessus du foyer" },
    ]);
  });

  it("laisse le dernier mot à Massimo sur une remarque", async () => {
    // Règle 6 du §5 : il refuse et garde sa phrase, EN UN CLIC, sans confirmation ni commentaire.
    api.reviewDraft.mockResolvedValue({
      reussites: ["Ton essentiel tient en deux phrases."],
      remarques: [
        {
          section: "essentiel",
          index: 0,
          type: "recopie",
          message: "Ces mots viennent de ton cours, mot pour mot.",
          piste: "Tu peux le dire avec les tiens ?",
        },
      ],
    });
    monter();
    await deplier(/L'essentiel/);
    fireEvent.change(await screen.findByLabelText(/L'essentiel, avec tes mots/), {
      target: { value: "Une proposition est un groupe de mots." },
    });
    fireEvent.click(screen.getByRole("button", { name: /regarde ma fiche/i }));

    expect(await screen.findByText(/mot pour mot/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Je garde ma phrase/ }));

    expect(await screen.findByText(/C'est ta fiche/)).toBeInTheDocument();
    expect(screen.queryByText(/mot pour mot/)).not.toBeInTheDocument();
  });

  it("ne décompte jamais ce qui manque", async () => {
    // `CLAUDE.md` § Gamification : on compte ce qui est commencé, jamais ce qui reste dû.
    monter();
    expect(await screen.findByText(/0 étape sur 5/)).toBeInTheDocument();
    expect(screen.queryByText(/il te reste/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/plus que/i)).not.toBeInTheDocument();
  });
});

// ── Étape ④ — les pièges (addendum ADR-0015 §13) ────────────────────────────────

describe("AtelierPage — les pièges", () => {
  it("montre la RAISON, pas seulement le piège", async () => {
    // 🔴 Sans la raison, « Attention à : Épicentre » est un conseil sorti de nulle part —
    // exactement ce que la règle 7 interdit. Avec elle, c'est sa propre mesure qu'on lui rend.
    monter();
    await deplier(/Les pièges/);
    expect(await screen.findByText("Attention à : Épicentre")).toBeInTheDocument();
    expect(screen.getByText(/tu t'es trompé 2 fois là-dessus/)).toBeInTheDocument();
  });

  it("met le piège sur la fiche au tap, et l'enlève au second", async () => {
    monter();
    await deplier(/Les pièges/);
    const piege = await screen.findByText("Attention à : Épicentre");

    fireEvent.click(piege);
    await waitFor(() =>
      expect(api.saveDraft).toHaveBeenLastCalledWith(
        42,
        expect.objectContaining({ erreurs_a_eviter: ["Attention à : Épicentre"] }),
      ),
    );

    fireEvent.click(piege);
    await waitFor(() =>
      expect(api.saveDraft).toHaveBeenLastCalledWith(
        42,
        expect.objectContaining({ erreurs_a_eviter: [] }),
      ),
    );
  });

  it("ne reproche RIEN quand ZETIS n'a rien mesuré", async () => {
    // État légitime : il n'a pas encore travaillé cette leçon. Aucun décompte, aucun manque.
    api.fetchCandidates.mockImplementation((_id: number, section = "points_cles") =>
      Promise.resolve(
        section === "erreurs_a_eviter"
          ? { section, slots: 3, candidates: [] }
          : section === "essentiel"
            ? ESSENTIEL
            : section === "definitions"
              ? DEFINITIONS
              : CANDIDATES,
      ),
    );
    monter();
    await deplier(/Les pièges/);
    expect(await screen.findByText(/Je n'ai rien noté sur cette leçon/)).toBeInTheDocument();
    for (const interdit of [/retard/i, /manqu/i, /tu devrais/i, /échec/i]) {
      expect(screen.queryByText(interdit)).not.toBeInTheDocument();
    }
  });
});


// ── Le double montage de StrictMode — deux exigences, pas une ────────────────────
//
// 🔴 Ce bloc existe parce qu'un défaut est passé sous 699 tests verts et a atteint `main` :
// Testing Library monte SANS `StrictMode`, alors que `main.tsx` monte AVEC. Le double montage
// de React n'était donc exercé nulle part — et c'est précisément là que le bug vivait.
//
// Les deux exigences se contredisent si on n'y prend pas garde :
//   (a) UN SEUL POST — sinon deux brouillons pour une leçon (constaté en base le 2026-08-13) ;
//   (b) l'état DOIT être rempli — le premier montage reçoit ses candidates après son propre
//       démontage et les jette ; si le second n'en redemande pas, l'écran reste creux.
// Un drapeau « déjà ouvert » tient (a) et casse (b). Mémoriser la PROMESSE tient les deux.

function monterEnStrictMode() {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={["/fiches/svt/7/atelier"]}>
        <Routes>
          <Route path="/fiches/:slug/:lessonId/atelier" element={<AtelierPage />} />
          <Route path="/fiches/:slug" element={<div>liste-des-fiches</div>} />
        </Routes>
      </MemoryRouter>
    </StrictMode>,
  );
}

describe("AtelierPage — monté DEUX FOIS, comme en vrai", () => {
  it("n'ouvre qu'UN brouillon malgré le double montage", async () => {
    monterEnStrictMode();
    await screen.findByText(/À retenir/);
    expect(api.openDraft).toHaveBeenCalledTimes(1);
  });

  it("🔴 remplit quand même l'écran — l'accordéon ne reste PAS creux", async () => {
    // Le défaut réel : `setDetail` passait (il arrive avant le démontage), les candidates non.
    // L'accordéon s'affichait donc, entièrement vide, alors que l'API répondait parfaitement.
    // ⚠️ Pas de `deplier` ici : l'étape ① est ouverte AU DÉPART. Cliquer son titre la
    // REFERMERAIT, et le test rougirait pour la mauvaise raison — ce qu'il a fait d'abord.
    monterEnStrictMode();
    expect(
      await screen.findByText("Un séisme vient d'une cassure brutale des roches."),
    ).toBeInTheDocument();
  });

  it("charge aussi les PIÈGES au second montage", async () => {
    monterEnStrictMode();
    await deplier(/Les pièges/);
    expect(await screen.findByText("Attention à : Épicentre")).toBeInTheDocument();
  });
});

// ── Le compteur d'étapes compte TOUTES les étapes ────────────────────────────────

describe("AtelierPage — le compteur ne sous-compte pas", () => {
  it("🔴 compte les PIÈGES comme une étape remplie", async () => {
    // Trouvé au doigt sur iPhone le 2026-08-14 : `remplies` listait trois étapes quand `ETAPES`
    // en portait quatre. Les pièges étaient rendus, jalonnés, sauvegardés — invisibles au seul
    // compteur. « 2 étapes sur 4 » pour trois étapes remplies : sur un écran qui s'interdit tout
    // reproche, un compteur qui SOUS-compte minimise le travail de l'enfant.
    monter();
    await deplier(/Les pièges/);
    fireEvent.click(await screen.findByText("Attention à : Épicentre"));
    expect(await screen.findByText(/1 étape sur 5/)).toBeInTheDocument();
  });

  it("compte les quatre ensemble", async () => {
    api.openDraft.mockResolvedValue({
      ...DRAFT,
      draft: {
        ...DRAFT.draft,
        points_cles: ["Une idée."],
        essentiel: "Un essentiel.",
        definitions: [{ terme: "épicentre", definition: "le point en surface" }],
        erreurs_a_eviter: ["Attention à : Épicentre"],
      },
    });
    monter();
    expect(await screen.findByText(/4 étapes sur 5/)).toBeInTheDocument();
  });
});

// ── ADR-0058 §2 : « C'est fini, je la garde » mène à la FICHE ─────────────────
//
// 🔴 **Ce bouton n'avait AUCUN test.** Il et « J'ai fini pour aujourd'hui » atterrissaient au même
// endroit — deux gestes opposés, une seule destination, alors que l'un crée une fiche et l'autre
// laisse un brouillon. Vingt-huit tests sur cette page, et pas un sur le geste qui fait exister la
// fiche.

describe("« C'est fini, je la garde » (ADR-0058 §2)", () => {
  function sondeDeLURL() {
    return render(
      <MemoryRouter initialEntries={["/fiches/svt/7/atelier"]}>
        <Routes>
          <Route path="/fiches/:slug/:lessonId/atelier" element={<AtelierPage />} />
          <Route path="/fiches/:slug" element={<AdresseVue />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("🔒 un finish RÉUSSI ouvre la fiche, pas la liste", async () => {
    api.finishDraft.mockResolvedValue({ ...DRAFT, id: 4242 });
    sondeDeLURL();
    fireEvent.click(await screen.findByText("C'est fini, je la garde"));

    // 🔴 L'adresse existait déjà (`?fiche=`, adr-0054 §1) — elle n'était pas utilisée ici.
    // ⏱️ Même chaîne asynchrone que « un finish qui CASSE » (persister → finishDraft → navigation) :
    // la fenêtre par défaut de 1 s est parfois trop courte sous la contention CI. Cf. le test CASSE.
    expect(
      await screen.findByTestId("adresse", undefined, { timeout: 5000 }),
    ).toHaveTextContent("fiche=4242");
  });

  it("🔒 un finish en 422 NE navigue PAS — on reste dans l'atelier", async () => {
    // Le 422 n'est pas un échec : il dit ce qui manque, et c'est déjà juste. Naviguer dessus
    // ferait sortir Massimo de son travail au moment précis où il lui manque une étape.
    //
    // ⚠️ Le refus est un `AtelierIncomplet`, PAS un `Error` nu. Jusqu'au 2026-08-17 ce test
    // levait un `Error` en le nommant « 422 » — il ne pouvait pas faire autrement, le code ne
    // distinguant pas les deux. Il croyait donc prouver le 422 et prouvait *n'importe quel
    // échec*, y compris le 500 dont la phrase partait telle quelle à l'écran.
    api.finishDraft.mockRejectedValue(
      new api.AtelierIncomplet("Il manque encore quelque chose pour ta fiche."),
    );
    sondeDeLURL();
    fireEvent.click(await screen.findByText("C'est fini, je la garde"));

    // ⏱️ Même chaîne asynchrone que « un finish qui CASSE » (persister → finishDraft → setError) :
    // fenêtre par défaut de 1 s parfois trop courte sous la contention CI. Cf. le test CASSE.
    expect(
      await screen.findByText(/Il manque encore quelque chose/, undefined, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("adresse")).not.toBeInTheDocument();
  });

  it("🔴 un finish qui CASSE ne raconte pas la panne — et promet le travail sauf", async () => {
    // Le jumeau que le test ci-dessus n'avait pas. `asJson` fabrique `Erreur 500` quand le
    // serveur n'a rien à dire, et cette chaîne s'affichait telle quelle à un enfant de treize ans
    // (`CLAUDE.md` — « Massimo ne doit pas voir : les informations techniques »).
    api.finishDraft.mockRejectedValue(new Error("Erreur 500"));
    sondeDeLURL();
    fireEvent.click(await screen.findByText("C'est fini, je la garde"));

    // `persister()` tourne avant `finishDraft` : le dire n'est pas une consolation, c'est un fait.
    //
    // ⏱️ Le message ne paraît qu'après DEUX `await` enchaînés (`persister` → `finishDraft` qui
    // rejette) puis un re-render. Sous la contention de la CI, le défaut de 1 s de `findByText`
    // s'épuise parfois avant que cette chaîne ne se pose — c'était là la panne intermittente, PAS
    // dans le composant (prouvé en retardant le rejet : le message finit toujours par paraître). On
    // laisse donc la fenêtre nécessaire, sans rien retirer à ce que le test prouve.
    expect(
      await screen.findByText(/Ton travail est bien enregistré/, undefined, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Erreur 500/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("adresse")).not.toBeInTheDocument();
  });

  it("🔒 « J'ai fini pour aujourd'hui » va TOUJOURS au deck — il n'a rien produit à montrer", async () => {
    sondeDeLURL();
    fireEvent.click(await screen.findByText("J'ai fini pour aujourd'hui"));

    expect(await screen.findByTestId("adresse")).toHaveTextContent("sans-parametre");
    expect(api.finishDraft).not.toHaveBeenCalled();
  });
});
