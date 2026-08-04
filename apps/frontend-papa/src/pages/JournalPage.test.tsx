// Journal de production (ADR-0034) — les verrous de la page Papa.
//
// Deux d'entre eux sont des verrous de DOCTRINE, pas de comportement : ils tomberont le jour où
// quelqu'un ajoutera un compteur de provenance, ou un bouton « Retirer » sur un contenu que
// Massimo a déjà ouvert. C'est exactement ce qu'on veut d'eux.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { type Journal, type JournalRun } from "@zetis/types";
import { JournalPage } from "./JournalPage";

vi.mock("../lib/journal", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/journal")>()),
  fetchJournal: vi.fn(),
  previewRemoval: vi.fn(),
  removePiece: vi.fn(),
}));
import { fetchJournal, previewRemoval, removePiece } from "../lib/journal";

const RUN: JournalRun = {
  id: 7,
  status: "done",
  trigger: "manual",
  authorized_by: "parent_direct",
  zetis_mode: "manuel",
  zetis_mode_source: "capture",
  chapter_id: 3,
  total_notions: 2,
  done_notions: 2,
  current_skill_id: null,
  current_skill_name: null,
  created_at: "2026-08-02T18:00:00Z",
  started_at: "2026-08-02T18:01:00Z",
  finished_at: "2026-08-02T18:14:00Z",
  events: [
    {
      skill_id: 12,
      skill_name: "Additionner des fractions",
      piece: "fiche",
      outcome: "generated",
      detail: null,
      created_at: "2026-08-02T18:02:00Z",
      // Rien à débloquer sur une pièce produite : la leçon va très bien.
      target: null,
      // `null` et non `false` : sur une pièce produite, la question ne se pose pas.
      resolved: null,
    },
    {
      skill_id: 13,
      skill_name: "Notion en brouillon",
      piece: null,
      outcome: "blocked",
      detail: "Cours à relire — il est écrit, il attend votre validation.",
      created_at: "2026-08-02T18:01:30Z",
      target: { lesson_id: 55, chapter_id: 3, subject_id: 9, object_id: null },
      resolved: false,
    },
  ],
  pieces: [
    {
      kind: "fiche",
      id: 41,
      label: "Fractions — l'essentiel",
      validated_by: "parent_bulk",
      target: { lesson_id: 55, chapter_id: 3, subject_id: 9, object_id: 41 },
      skill_id: 12,
      skill_name: "Additionner des fractions",
      consumed: false,
    },
    {
      kind: "mindmap",
      id: 42,
      label: "Carte des fractions",
      validated_by: "parent_bulk",
      target: { lesson_id: 55, chapter_id: 3, subject_id: 9, object_id: 42 },
      skill_id: 12,
      skill_name: "Additionner des fractions",
      consumed: true,
    },
  ],
};

const JOURNAL: Journal = { runs: [RUN], has_more: false, total: 1 };

function renderPage() {
  return render(
    <MemoryRouter>
      <JournalPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(fetchJournal).mockResolvedValue(JOURNAL);
  vi.mocked(previewRemoval).mockReset();
  vi.mocked(removePiece).mockReset();
});

describe("JournalPage", () => {
  it("rend le lot, ses pièces et son déclencheur", async () => {
    renderPage();
    expect(await screen.findByText(/Lot #7/)).toBeInTheDocument();
    expect(screen.getByText(/Vous l'avez lancé/)).toBeInTheDocument();
    expect(screen.getByText("Fractions — l'essentiel")).toBeInTheDocument();
  });

  it("🔒 dit sous quel RÉGIME le lot a tourné", async () => {
    // Sans ce mot, « 0 produit » sous *Manual* — un gate qui a fonctionné — et « 0 produit » sur
    // panne se lisent pareil. C'est ce qui est arrivé aux lots #21/#22 le 2026-08-04.
    renderPage();
    await screen.findByText(/Lot #7/);
    expect(screen.getByText(/Manual/)).toBeInTheDocument();
  });

  it("un lot dont RIEN ne prouve le régime le dit, il n'en invente pas", async () => {
    // ⚠️ La contre-épreuve qui compte : afficher le réglage d'aujourd'hui sur un vieux lot serait
    // pire que se taire — le Journal ne reconstitue pas le passé (doctrine §F.4).
    vi.mocked(fetchJournal).mockResolvedValue({
      runs: [{ ...RUN, zetis_mode: null, zetis_mode_source: null }],
      has_more: false,
      total: 1,
    });
    renderPage();
    await screen.findByText(/Lot #7/);
    expect(screen.getByText(/régime inconnu/)).toBeInTheDocument();
    expect(screen.queryByText(/Manual/)).toBeNull();
  });

  it("🔒 un régime DÉDUIT s'affiche, mais ne se fait pas passer pour enregistré", async () => {
    // Un lot antérieur à la capture rend quand même son régime — reconstitué de ce qu'il a FAIT.
    // Sans la marque « déduit », cette reconstitution se lirait comme un fait enregistré.
    vi.mocked(fetchJournal).mockResolvedValue({
      runs: [{ ...RUN, zetis_mode: "autonome", zetis_mode_source: "deduit" }],
      has_more: false,
      total: 1,
    });
    renderPage();
    await screen.findByText(/Lot #7/);

    expect(screen.getByText("Autonom")).toBeInTheDocument();
    expect(screen.getByText("déduit")).toBeInTheDocument();
  });

  it("un régime CAPTURÉ ne porte aucune marque", async () => {
    // La contre-épreuve : si « déduit » s'affichait partout, la distinction ne dirait rien.
    renderPage();
    await screen.findByText(/Lot #7/);

    expect(screen.getByText("Manual")).toBeInTheDocument();
    expect(screen.queryByText("déduit")).toBeNull();
  });

  it("🔒 l'en-tête compte ce que le lot a laissé, SANS ouvrir le repli", async () => {
    // Le repli est fermé par défaut : les cases, les motifs et les liens y dorment. « Je ne vois
    // aucune checkbox » (2026-08-04) venait de là. Le résumé remonte l'essentiel dans l'en-tête.
    renderPage();
    await screen.findByText(/Lot #7/);

    // ⚠️ Sans dépliage : le lot entier est dans un pli fermé, et le résumé vit AU-DESSUS.
    expect(screen.getByText("1 à faire")).toBeInTheDocument();
    expect(screen.getByText("1 produit")).toBeInTheDocument();
  });

  it("🔒 une ligne bloquée mais RÉSOLUE ne compte pas dans « à faire »", async () => {
    // Même exigence que le badge « depuis résolu » : le motif est au passé, le compte au présent.
    // La compter réclamerait un geste qui n'a plus lieu d'être.
    vi.mocked(fetchJournal).mockResolvedValue({
      runs: [{ ...RUN, events: [{ ...RUN.events[1]!, resolved: true }] }],
      has_more: false,
      total: 1,
    });
    renderPage();
    await screen.findByText(/Lot #7/);

    // ⚠️ La regex porte le CHIFFRE : le contenu d'un `<details>` fermé reste dans le DOM, donc la
    // ligne d'événement (« à faire », sans nombre) est trouvable même repliée. Sans le `\d+`, ce
    // test vérifierait l'inverse de ce qu'il croit.
    expect(screen.queryByText(/\d+ à faire/)).toBeNull();
    expect(screen.getByText("1 depuis résolu")).toBeInTheDocument();
  });

  it("🔒 une pièce produite porte son lien d'ouverture", async () => {
    // « Les liens cibles ne sont pas mis en place » (2026-08-04) : la liste des pièces n'en
    // offrait aucun. Même convention d'URL que la Couverture, pas une cinquième.
    renderPage();
    await screen.findByText(/Lot #7/);

    expect(screen.getAllByRole("link", { name: "Ouvrir →" })[0]).toHaveAttribute(
      "href",
      "/fiches?subject=9&focus=41",
    );
  });

  it("dit que sa portée s'arrête aux lots", async () => {
    // Un journal qui paraît exhaustif sans l'être est pire qu'un journal qui borne son sujet :
    // le Conseil de classe et la composition champion équipent HORS lot.
    renderPage();
    await screen.findByText(/Lot #7/);
    expect(screen.getByText(/Conseil de classe/)).toBeInTheDocument();
  });

  it("explique un lot sans contenu au lieu de le laisser vide", async () => {
    // ⚠️ Vu à l'écran le 2026-08-03 sur les vrais lots du 2 août : un lot « Terminé · 3/3
    // notions » sans une ligne se lit comme une panne, alors que c'est l'inverse.
    vi.mocked(fetchJournal).mockResolvedValue({
      runs: [{ ...RUN, id: 6, events: [], pieces: [] }],
      has_more: false,
      total: 1,
    });
    renderPage();
    expect(await screen.findByText(/Aucun contenu neuf rattaché à ce lot/)).toBeInTheDocument();
  });

  it("rend visible une notion que le gate a écartée, avec son motif", async () => {
    // Le §7 rendu lisible : une notion silencieusement omise se lirait comme un échec de
    // production, alors que c'est un gate qui fonctionne.
    renderPage();
    await screen.findByText(/Lot #7/);
    expect(screen.getByText("à faire")).toBeInTheDocument();
    expect(screen.getByText(/il attend votre validation/)).toBeInTheDocument();
  });

  it("🔒 une ligne bloquée mène à LA leçon, pas à une page générique", async () => {
    // Le reproche du 2026-08-04 : un motif sans destination oblige Papa à retrouver la
    // leçon à la main. L'URL suit la convention `pilotageLink("cours", …)`, déjà en place pour la
    // Couverture — pas une quatrième façon de désigner un cours.
    renderPage();
    await screen.findByText(/Lot #7/);

    expect(screen.getByRole("link", { name: /Ouvrir la leçon/ })).toHaveAttribute(
      "href",
      "/programme?subject=9&chapter=3&lesson=55",
    );
  });

  it("🔒 une cause levée est annotée « depuis résolu », le motif restant intact", async () => {
    // Le reproche du 2026-08-04 : le lot #23 avait été bloqué deux minutes avant que le cours soit
    // écrit ; sa ligne — exacte — se lisait comme un problème actuel. Les deux temps cohabitent :
    // le motif dit ce qui s'est passé, l'annotation dit où on en est.
    vi.mocked(fetchJournal).mockResolvedValue({
      runs: [{ ...RUN, events: [{ ...RUN.events[1]!, resolved: true }] }],
      has_more: false,
      total: 1,
    });
    renderPage();
    await screen.findByText(/Lot #7/);

    expect(screen.getByText("depuis résolu")).toBeInTheDocument();
    // ⚠️ La moitié qui compte : la ligne d'origine n'a pas été remplacée.
    expect(screen.getByText(/il attend votre validation/)).toBeInTheDocument();
    expect(screen.getByText("à faire")).toBeInTheDocument();
  });

  it("une cause qui TIENT toujours n'est pas annotée", async () => {
    // La contre-épreuve : une mention affichée dans les deux cas ne dirait rien.
    renderPage();
    await screen.findByText(/Lot #7/);

    expect(screen.queryByText("depuis résolu")).toBeNull();
  });

  it("🔒 l'état se lit à la CASE, plus au mot « non produit »", async () => {
    // Dit à l'écran le 2026-08-04 : « non produit » se lit comme un échec, alors que sur une ligne
    // bloquée c'est un gate qui a fonctionné. Coché / pas coché porte la même information sans la
    // charge. ⚠️ La case n'est PAS un `<input>` : un journal ne se coche pas à la main.
    renderPage();
    await screen.findByText(/Lot #7/);

    expect(screen.queryByText("non produit")).toBeNull();
    expect(screen.getByLabelText("à faire")).toBeInTheDocument(); // la ligne bloquée
    expect(screen.getByLabelText("produit")).toBeInTheDocument(); // la ligne produite
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("🔒 une ligne PRODUITE mène à la pièce produite", async () => {
    // Le pendant du lien de déblocage : voir ce que ZETIS vient de faire est le geste suivant le
    // plus naturel, et il manquait. Même convention d'URL que la Couverture.
    vi.mocked(fetchJournal).mockResolvedValue({
      runs: [
        {
          ...RUN,
          events: [
            {
              ...RUN.events[0]!,
              target: { lesson_id: 55, chapter_id: 3, subject_id: 9, object_id: 41 },
            },
          ],
        },
      ],
      has_more: false,
      total: 1,
    });
    renderPage();
    await screen.findByText(/Lot #7/);

    expect(screen.getByRole("link", { name: /Voir une fiche/ })).toHaveAttribute(
      "href",
      "/fiches?subject=9&focus=41",
    );
  });

  it("une ligne PRODUITE sans lien de déblocage", async () => {
    // La contre-épreuve : si le lien s'affichait partout, le verrou précédent serait vert pour la
    // mauvaise raison. Une notion sans leçon non plus n'a rien à ouvrir — son motif le dit déjà.
    vi.mocked(fetchJournal).mockResolvedValue({
      runs: [{ ...RUN, events: [{ ...RUN.events[0]! }] }],
      has_more: false,
      total: 1,
    });
    renderPage();
    await screen.findByText(/Lot #7/);

    expect(screen.queryByRole("link", { name: /Ouvrir la leçon/ })).toBeNull();
  });

  // --- LES VERROUS ------------------------------------------------------------------------

  it("n'offre AUCUN retrait sur un contenu déjà ouvert par Massimo", async () => {
    // §G.3 : la consommation ferme la fenêtre, pas l'horloge. La mindmap est `consumed`.
    renderPage();
    await screen.findByText(/Lot #7/);
    // Une seule pièce est retirable : la fiche. La mindmap dit pourquoi elle ne l'est plus.
    expect(screen.getAllByRole("button", { name: "Retirer" })).toHaveLength(1);
    expect(screen.getByText("Déjà ouvert par Massimo")).toBeInTheDocument();
  });

  it("annonce la portée du retrait AVANT le geste, et l'exécute", async () => {
    vi.mocked(previewRemoval).mockResolvedValue({
      removable: true,
      reason: null,
      cascade: { fiche: [41], srs: [90, 91] },
    });
    vi.mocked(removePiece).mockResolvedValue({ removed: { fiche: 1 } });

    renderPage();
    await screen.findByText(/Lot #7/);
    fireEvent.click(screen.getByRole("button", { name: "Retirer" }));

    // La cascade est ANNONCÉE : un veto qui surprend n'est pas exercé deux fois.
    expect(await screen.findByText(/Ce retrait emporte aussi/)).toBeInTheDocument();
    expect(screen.getByText(/2 Carte de révision/)).toBeInTheDocument();

    // ⚠️ Le bouton de la LIGNE reste dans le DOM derrière la modale : la requête est ambiguë par
    // construction. Le dernier est celui de la modale, rendue après la liste.
    const boutons = screen.getAllByRole("button", { name: "Retirer" });
    fireEvent.click(boutons[boutons.length - 1]);
    await waitFor(() => expect(removePiece).toHaveBeenCalledWith("fiche", 41));
  });

  it("sur un refus, la modale ferme au lieu de proposer un geste qui échouerait", async () => {
    // ⚠️ Verrou de doctrine. Une commande qui ne fait rien est un piège — c'est le motif exact
    // du verrou écrit sur `ParametresPage`, et il vaut pour toutes les pages Papa. Ici le
    // serveur refuserait en 409 : le bouton ne doit pas proposer le geste.
    vi.mocked(previewRemoval).mockResolvedValue({
      removable: false,
      reason: "Massimo a déjà ouvert un contenu tiré de ce cours.",
      cascade: {},
    });

    renderPage();
    await screen.findByText(/Lot #7/);
    // Un seul « Retirer » avant ouverture : celui de la ligne.
    expect(screen.getAllByRole("button", { name: "Retirer" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Retirer" }));

    expect(await screen.findByText(/Massimo a déjà ouvert un contenu/)).toBeInTheDocument();
    // La modale n'AJOUTE aucun « Retirer » : il en reste un, celui de la ligne. Si elle en
    // ajoutait un, il partirait en 409 — la commande qui ne fait rien.
    expect(screen.getAllByRole("button", { name: "Retirer" })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
    expect(removePiece).not.toHaveBeenCalled();
  });

  it("ne totalise AUCUNE provenance", async () => {
    // §F.2 : la provenance est un fait, jamais un reproche — elle s'affiche par objet et ne se
    // totalise pas. Ce test tombera le jour où quelqu'un ajoutera « 31 servis sans relecture ».
    renderPage();
    await screen.findByText(/Lot #7/);
    const body = document.body.textContent ?? "";
    expect(body).not.toMatch(/servis? sans relecture/i);
    expect(body).not.toMatch(/\d+\s*%\s*(par ZETIS|automatis)/i);
    // La provenance PAR OBJET, elle, doit bien être là.
    expect(screen.getAllByText("Vous, en lot").length).toBeGreaterThan(0);
  });
});

describe("JournalPage — la pagination, qui manquait", () => {
  // ⚠️ Ce défaut est ANTÉRIEUR au chantier « tri et filtre » : `fetchJournal` était appelée sans
  // argument, donc bornée à 20 lots, et `has_more` voyageait dans la réponse SANS ÊTRE LU. Au-delà
  // de vingt lots, le Journal était muet — et il ne disait pas qu'il l'était.
  const autre: JournalRun = { ...RUN, id: 8, events: [], pieces: [] };

  it("n'offre AUCUN bouton quand tout est déjà là", async () => {
    vi.mocked(fetchJournal).mockResolvedValue({ runs: [RUN], has_more: false, total: 1 });
    renderPage();
    await screen.findByText(/Lot #7/);
    expect(screen.queryByRole("button", { name: /plus anciens/ })).not.toBeInTheDocument();
  });

  it("EMPILE les lots plus anciens et annonce ce qui reste", async () => {
    // Un journal se lit de haut en bas : la page suivante s'ajoute, elle ne remplace pas.
    vi.mocked(fetchJournal)
      .mockResolvedValueOnce({ runs: [RUN], has_more: true, total: 2 })
      .mockResolvedValueOnce({ runs: [autre], has_more: false, total: 2 });

    renderPage();
    const bouton = await screen.findByRole("button", { name: /1 restant/ });
    fireEvent.click(bouton);

    await waitFor(() => expect(screen.getByText(/Lot #8/)).toBeInTheDocument());
    // ⚠️ LE point du test : le premier lot est TOUJOURS là. Sans empilement, il aurait disparu.
    expect(screen.getByText(/Lot #7/)).toBeInTheDocument();
    // La requête suivante part avec le DÉCALAGE, pas avec la même page. On lit le dernier appel :
    // l'index 1 supposerait qu'aucun autre appel n'a lieu au montage, ce qui est une hypothèse
    // sur React, pas sur la page.
    const appels = vi.mocked(fetchJournal).mock.calls;
    expect(appels[appels.length - 1]).toEqual([20, 1]);
    expect(screen.queryByRole("button", { name: /plus anciens/ })).not.toBeInTheDocument();
  });
});
