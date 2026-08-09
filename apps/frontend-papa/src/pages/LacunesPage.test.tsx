import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { OpenGap } from "@zetis/types";
import { LacunesPage } from "./LacunesPage";

// Page Lacunes — la surface de DÉCISION vers laquelle le dashboard renvoie.
//
// L'enjeu des tests : elle doit SÉPARER deux situations que le backend distingue et que la page
// mockée confondait — une notion découverte et jamais travaillée (consolidation) d'une notion
// revenue par la révision après un « à revoir ». Les proposer au même geste enverrait Papa sur un
// générateur qui ne la reprendra pas.

vi.mock("../lib/activity", () => ({ fetchOpenGaps: vi.fn() }));
vi.mock("../lib/missionsPilotage", () => ({
  generateRemediation: vi.fn(),
  generateRevision: vi.fn(),
  notifyPendingChanged: vi.fn(),
}));

import { fetchOpenGaps } from "../lib/activity";
import { generateRemediation, generateRevision } from "../lib/missionsPilotage";

function gap(overrides: Partial<OpenGap> = {}): OpenGap {
  return {
    skill_id: 1,
    skill_name: "Comparaison de relatifs",
    subject_slug: "mathematiques",
    subject_name: "Mathématiques",
    severity: "high",
    status: "open",
    first_detected_at: "2026-07-12T10:00:00+02:00",
    has_active_mission: false,
    ...overrides,
  };
}

// Le paramètre a été AJOUTÉ (défaut inchangé) pour le filtre par matière : aucun appel existant
// n'en tient compte, et aucune assertion existante n'a bougé.
function renderPage(url = "/lacunes") {
  render(
    <MemoryRouter initialEntries={[url]}>
      <LacunesPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(fetchOpenGaps).mockReset().mockResolvedValue([]);
  vi.mocked(generateRemediation).mockReset().mockResolvedValue({ created: 1 });
  vi.mocked(generateRevision).mockReset().mockResolvedValue({ created: 1 });
});

describe("séparation des deux situations", () => {
  it("distingue « jamais travaillée » de « revenue par la révision »", async () => {
    vi.mocked(fetchOpenGaps).mockResolvedValue([
      gap({ skill_id: 1, status: "open" }),
      gap({ skill_id: 2, skill_name: "Temps du récit", status: "in_progress" }),
    ]);
    renderPage();

    const decouvertes = (await screen.findByText(/Découvertes, jamais travaillées/)).closest("section");
    const revenues = screen.getByText(/Revenues par la révision/).closest("section");

    expect(within(decouvertes as HTMLElement).getByText(/Comparaison de relatifs/)).toBeInTheDocument();
    expect(within(revenues as HTMLElement).getByText(/Temps du récit/)).toBeInTheDocument();
  });

  it("propose le générateur QUI CORRESPOND à chaque situation", async () => {
    vi.mocked(fetchOpenGaps).mockResolvedValue([
      gap({ skill_id: 2, skill_name: "Temps du récit", status: "in_progress" }),
    ]);
    renderPage();
    await screen.findByText(/Revenues par la révision/);

    // Une notion `in_progress` ne doit JAMAIS mener au générateur de consolidation : il ne la
    // reprendrait pas, et Papa croirait avoir agi.
    expect(screen.queryByText(/mission de consolidation/)).toBeNull();
    expect(screen.getByRole("button", { name: /missions de révision dues/ })).toBeInTheDocument();
  });

  it("range à part ce qu'une mission active couvre déjà", async () => {
    vi.mocked(fetchOpenGaps).mockResolvedValue([gap({ has_active_mission: true })]);
    renderPage();

    const section = (await screen.findByText(/Déjà prises en charge/)).closest("section");
    expect(within(section as HTMLElement).getByText(/Comparaison de relatifs/)).toBeInTheDocument();
    // Rien à décider : aucun bouton de génération sur cette section.
    expect(within(section as HTMLElement).queryByRole("button")).toBeNull();
  });
});

describe("création", () => {
  it("ne crée qu'après confirmation, puis relit la liste", async () => {
    vi.mocked(fetchOpenGaps).mockResolvedValue([gap()]);
    renderPage();
    await screen.findByText(/Découvertes, jamais travaillées/);

    fireEvent.click(screen.getByRole("button", { name: /mission de consolidation/ }));
    expect(generateRemediation).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Créer" }));

    await waitFor(() => expect(generateRemediation).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(fetchOpenGaps).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/en attente de ta validation/)).toBeInTheDocument();
  });

  it("dit clairement quand il n'y avait rien à créer", async () => {
    vi.mocked(fetchOpenGaps).mockResolvedValue([gap()]);
    vi.mocked(generateRemediation).mockResolvedValue({ created: 0 });
    renderPage();
    await screen.findByText(/Découvertes, jamais travaillées/);

    fireEvent.click(screen.getByRole("button", { name: /mission de consolidation/ }));
    fireEvent.click(screen.getByRole("button", { name: "Créer" }));

    expect(await screen.findByText(/Aucune mission à créer/)).toBeInTheDocument();
  });
});

describe("états", () => {
  it("état vide : aucune lacune ouverte, ET le renvoi vers les paliers", async () => {
    // Renommé par l'adr-0040 §5. L'assertion est RENFORCÉE, pas seulement adaptée : le libellé
    // seul ne suffisait pas — « aucune lacune ouverte » se lirait « rien à faire » alors que 13
    // notions sont fragiles en base réelle. Les deux populations sont disjointes, et l'écran doit
    // le dire ET offrir le chemin.
    renderPage();
    expect(await screen.findByText(/Aucune lacune ouverte/)).toBeInTheDocument();
    expect(screen.getByText(/disjointes/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Progression/ })).toHaveAttribute(
      "href",
      "/progression?view=notion",
    );
  });

  it("erreur : bandeau + Réessayer, aucune liste inventée", async () => {
    vi.mocked(fetchOpenGaps).mockRejectedValue(new Error("backend éteint"));
    renderPage();

    expect(await screen.findByText("backend éteint")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeInTheDocument();
    expect(screen.queryByText(/Découvertes/)).toBeNull();
  });
});

// --- Filtre par matière (`?subject=`, ADR-0038 §4) ------------------------------------------------
//
// Le paramètre était INERTE : la route servait déjà `subject_slug` sur chaque lacune, personne ne
// le lisait. Ce que ces tests protègent : filtrer ne coûte aucune requête, les trois sections
// suivent le filtre ensemble, un slug inconnu ne vide jamais l'écran, et le filtre se voit et se
// retire. Plus une cinquième chose, décidée le 2026-08-05 : les deux boutons de génération
// n'ont AUCUN paramètre de matière, donc ils disent leur vraie portée.

const TROIS = [
  gap({ skill_id: 1, skill_name: "Comparaison de relatifs", subject_slug: "mathematiques", subject_name: "Mathématiques" }),
  gap({ skill_id: 2, skill_name: "Accord du participe", subject_slug: "francais", subject_name: "Français" }),
  gap({ skill_id: 3, skill_name: "Concordance des temps", subject_slug: "francais", subject_name: "Français", status: "in_progress" }),
];

describe("filtre par matière", () => {
  it("ne montre que la matière demandée, sans AUCUNE requête de plus", async () => {
    vi.mocked(fetchOpenGaps).mockResolvedValue(TROIS);
    renderPage("/lacunes?subject=francais");

    expect(await screen.findByText(/Accord du participe/)).toBeInTheDocument();
    expect(screen.queryByText(/Comparaison de relatifs/)).toBeNull();
    // LE verrou : le filtre s'applique à la liste déjà chargée. Une requête de plus voudrait dire
    // que le filtre est parti au serveur.
    expect(fetchOpenGaps).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetchOpenGaps).mock.calls[0]).toEqual([]);
  });

  it("fait suivre les compteurs des TROIS sections, pas seulement la liste", async () => {
    vi.mocked(fetchOpenGaps).mockResolvedValue([
      ...TROIS,
      gap({ skill_id: 4, skill_name: "Discours rapporté", subject_slug: "francais", subject_name: "Français", has_active_mission: true }),
      gap({ skill_id: 5, skill_name: "Théorème de Pythagore", subject_slug: "mathematiques", subject_name: "Mathématiques", has_active_mission: true }),
    ]);
    renderPage("/lacunes?subject=francais");

    // Anti-vacuité : les trois sections sont peuplées ET chacune contient une ligne d'une AUTRE
    // matière dans le jeu complet. Un compteur calculé avant le filtre se verrait sur chacune.
    const decouvertes = (await screen.findByText(/Découvertes, jamais travaillées/)).closest("h2");
    const revenues = screen.getByText(/Revenues par la révision/).closest("h2");
    const couvertes = screen.getByText(/Déjà prises en charge/).closest("h2");

    expect(decouvertes).toHaveTextContent("(1)");
    expect(revenues).toHaveTextContent("(1)");
    expect(couvertes).toHaveTextContent("(1)");
    expect(screen.queryByText(/Théorème de Pythagore/)).toBeNull();
  });

  it("nomme le filtre actif et le rend retirable, sans recharger", async () => {
    vi.mocked(fetchOpenGaps).mockResolvedValue(TROIS);
    renderPage("/lacunes?subject=francais");

    expect(await screen.findByText(/Filtré sur/)).toHaveTextContent("Français");

    fireEvent.click(screen.getByRole("button", { name: "Toutes les matières" }));

    expect(await screen.findByText(/Comparaison de relatifs/)).toBeInTheDocument();
    expect(screen.queryByText(/Filtré sur/)).toBeNull();
    // Retirer un filtre n'est pas une raison de redemander la liste.
    expect(fetchOpenGaps).toHaveBeenCalledTimes(1);
  });

  it("un slug inconnu ne vide PAS la page : repli sur toutes", async () => {
    vi.mocked(fetchOpenGaps).mockResolvedValue(TROIS);
    renderPage("/lacunes?subject=klingon");

    expect(await screen.findByText(/Comparaison de relatifs/)).toBeInTheDocument();
    expect(screen.getByText(/Accord du participe/)).toBeInTheDocument();
    // Pas de chip : rien n'est filtré, et prétendre le contraire serait un compteur qui ment.
    expect(screen.queryByText(/Filtré sur/)).toBeNull();
    expect(screen.queryByText(/Rien à renforcer pour le moment/)).toBeNull();
  });

  it("le bouton de création annonce sa portée RÉELLE, pas celle du filtre", async () => {
    // Décision du 2026-08-05 : `POST /generate-remediation` n'a aucun paramètre de matière. Un
    // bouton annonçant « 1 mission » alors qu'il en créerait 2 serait le défaut de ce chantier,
    // transposé à une action.
    vi.mocked(fetchOpenGaps).mockResolvedValue(TROIS);
    renderPage("/lacunes?subject=francais");

    const bouton = await screen.findByRole("button", { name: /de consolidation/ });
    // 2 notions `open` au total (Mathématiques + Français), 1 seule affichée.
    expect(bouton).toHaveTextContent("Créer 2 missions de consolidation · toutes matières");
    expect(screen.getByText(/Accord du participe/)).toBeInTheDocument();
    expect(screen.queryByText(/Comparaison de relatifs/)).toBeNull();

    // Et la confirmation le redit, au moment où le geste devient irréversible.
    fireEvent.click(bouton);
    expect(await screen.findByText(/la génération ne sait pas se restreindre/)).toBeInTheDocument();
  });

  it("sans filtre, le libellé du bouton est INCHANGÉ", async () => {
    vi.mocked(fetchOpenGaps).mockResolvedValue(TROIS);
    renderPage();

    const bouton = await screen.findByRole("button", { name: /de consolidation/ });
    expect(bouton).toHaveTextContent("Créer 2 missions de consolidation");
    expect(bouton).not.toHaveTextContent("toutes matières");
  });

  // ================================================================================================
  // Les renvois des jauges du Diagnostic (adr-0045, slice C)
  //
  // 🔴 Ce que ces verrous protègent : **un renvoi mène au compte qu'il annonce.** « dont 4 sans
  // contenu → » menait à une page qui en affichait 10. Un nombre cliquable qui conduit à un AUTRE
  // nombre est pire que le nombre invisible qu'il remplace — c'est le défaut dont l'adr-0039 est né,
  // reproduit par le chantier qui le corrigeait.
  // ================================================================================================

  /** Décor NON DÉGÉNÉRÉ : les trois états de contenu, et deux origines. Avec un seul état, un
   *  filtre qui ne filtre rien passerait ; avec une seule origine, aussi. */
  const ORIGINES: OpenGap[] = [
    gap({ skill_id: 1, skill_name: "Avec cours", source: "diagnostic", content_state: "ok" }),
    gap({
      skill_id: 2,
      skill_name: "Sans leçon",
      source: "diagnostic",
      content_state: "aucune_lecon",
    }),
    gap({
      skill_id: 3,
      skill_name: "Cours draft",
      source: "mission",
      content_state: "cours_brouillon",
    }),
  ];

  it("🔴 `contenu=absent` ne garde QUE les lacunes sans contenu produisible", async () => {
    vi.mocked(fetchOpenGaps).mockResolvedValue(ORIGINES);
    renderPage("/lacunes?contenu=absent");

    await screen.findByText(/Sans leçon/);
    expect(screen.getByText(/Cours draft/)).toBeInTheDocument();
    // 🔴 Celle-ci a un cours validé : elle ne fait PAS partie du compte que la jauge annonce.
    expect(screen.queryByText(/Avec cours/)).toBeNull();
  });

  it("🔴 `contenu=absent` qui ne trouve RIEN montre rien — jamais tout", async () => {
    // ⚠️ **Ce test existe parce qu'un sabotage est resté VERT sans lui.** Le décor `ORIGINES`
    // contient deux lacunes sans contenu : un repli « si le filtre ne trouve rien, montre tout »
    // ne s'y déclenche jamais, et passe donc inaperçu. Il faut un décor où le filtre trouve ZÉRO.
    vi.mocked(fetchOpenGaps).mockResolvedValue([
      gap({ skill_id: 1, skill_name: "Avec cours", content_state: "ok" }),
      gap({ skill_id: 2, skill_name: "Aussi avec cours", content_state: "ok" }),
    ]);
    renderPage("/lacunes?contenu=absent");

    expect(await screen.findByText(/Aucune lacune de ce type/)).toBeInTheDocument();
    expect(screen.queryByText(/Avec cours/)).toBeNull();
  });

  it("🔴 `source` filtre, et ne retombe JAMAIS sur « toutes »", async () => {
    // Le filtre par MATIÈRE retombe sur « toutes » quand il ne trouve rien — c'est écrit et
    // justifié (une faute de frappe ne doit pas vider la page). Ici ce repli serait exactement le
    // défaut corrigé : annoncer une population et en montrer une autre, plus large.
    vi.mocked(fetchOpenGaps).mockResolvedValue(ORIGINES);
    renderPage("/lacunes?source=mission");

    await screen.findByText(/Cours draft/);
    expect(screen.queryByText(/Avec cours/)).toBeNull();
    expect(screen.queryByText(/Sans leçon/)).toBeNull();
  });

  it("🔴 la page DIT ce qu'elle filtre, et comment en sortir", async () => {
    vi.mocked(fetchOpenGaps).mockResolvedValue(ORIGINES);
    renderPage("/lacunes?source=diagnostic&contenu=absent");

    // Un filtre nommé, jamais une troncature — même règle que le rail du Diagnostic.
    expect(await screen.findByText(/ouvertes par un diagnostic et sans contenu produisible/))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Toutes les lacunes" })).toBeInTheDocument();
  });

  it("🔴 l'état vide d'un filtre n'emprunte pas la phrase d'un dépôt vide", async () => {
    // Trois lacunes existent ; aucune ne vient d'une révision. « Aucune lacune ouverte » serait
    // un mensonge, et il cohabiterait avec le bandeau qui vient d'annoncer le filtre.
    vi.mocked(fetchOpenGaps).mockResolvedValue(ORIGINES);
    renderPage("/lacunes?source=revision");

    expect(await screen.findByText(/Aucune lacune de ce type/)).toBeInTheDocument();
    expect(screen.queryByText(/Aucune lacune ouverte/)).toBeNull();
  });
});

// ================================================================================================
// Le GESTE de chaque ligne (ADR-0047 §3) — la page cesse d'énoncer sans permettre d'agir.
//
// 🔴 Ce que ces verrous protègent, et que `gesteLacune.test.ts` ne peut pas voir : que le geste
// arrive JUSQU'À L'ÉCRAN, avec le bon `href`. La règle peut être juste et le rendu l'ignorer —
// c'est exactement ce qui est arrivé à `covered` (PR #91), qui a cessé d'être affichée sans
// qu'aucun test ne rougisse.
// ================================================================================================

describe("le geste de la ligne", () => {
  it("🔴 chaque état mène à SON href, et les quatre diffèrent", async () => {
    vi.mocked(fetchOpenGaps).mockResolvedValue([
      gap({ skill_id: 1, skill_name: "Brouillon", content_state: "cours_brouillon", lesson_id: 24 }),
      gap({ skill_id: 2, skill_name: "Validee", content_state: "ok", lesson_id: 48 }),
      gap({
        skill_id: 3,
        skill_name: "Couverte",
        has_active_mission: true,
        mission_id: 56,
        content_state: "ok",
        lesson_id: 99,
      }),
    ]);
    renderPage();

    expect(await screen.findByRole("link", { name: /Valider le cours/ })).toHaveAttribute(
      "href",
      "/programme?lesson=24",
    );
    expect(screen.getByRole("link", { name: /Relire la leçon/ })).toHaveAttribute(
      "href",
      "/programme?lesson=48",
    );
    // 🔴 La notion couverte porte AUSSI `lesson_id: 99` : si l'ordre des conditions s'inversait,
    // ce lien deviendrait `/programme?lesson=99` et le test le verrait.
    expect(screen.getByRole("link", { name: /Voir la mission/ })).toHaveAttribute(
      "href",
      "/missions?focus=56",
    );
  });

  it("🔴 la section « Déjà prises en charge » gagne un LIEN, et reste sans bouton", async () => {
    // Le verrou historique de cette section (« aucun bouton de génération ») doit continuer de
    // tenir : le geste y est une NAVIGATION, pas une action. Un `<button>` le casserait — et ce
    // serait la bonne alerte, pas un faux positif.
    vi.mocked(fetchOpenGaps).mockResolvedValue([
      gap({ has_active_mission: true, mission_id: 56 }),
    ]);
    renderPage();

    const section = (await screen.findByText(/Déjà prises en charge/)).closest("section");
    expect(within(section as HTMLElement).getByRole("link", { name: /Voir la mission/ })).toBeInTheDocument();
    expect(within(section as HTMLElement).queryByRole("button")).toBeNull();
  });

  it("🔴 `aucune_lecon` propose une ACTION, et la confirmation dit ce qu'elle génère", async () => {
    vi.mocked(fetchOpenGaps).mockResolvedValue([
      gap({ skill_name: "Les fractions", content_state: "aucune_lecon" }),
    ]);
    renderPage();

    const bouton = await screen.findByRole("button", { name: "Équiper cette notion" });
    // Ce n'est PAS un lien : `/quiz` ne peut pas produire le quiz d'une notion sans leçon.
    expect(screen.queryByRole("link", { name: /Équiper/ })).toBeNull();

    fireEvent.click(bouton);

    // La confirmation n'est pas décorative : c'est une génération LLM auto-validée de plusieurs
    // minutes. Elle doit le dire avant, pas après.
    expect(await screen.findByText(/Équiper « Les fractions » \?/)).toBeInTheDocument();
    expect(screen.getByText(/auto-valide/)).toBeInTheDocument();
    expect(screen.getByText(/plusieurs minutes/)).toBeInTheDocument();
  });

  it("une ligne sans geste tenable n'en affiche AUCUN", async () => {
    // `has_active_mission` sans `mission_id`, et `cours_brouillon` sans `lesson_id` : le serveur
    // les garantit ensemble, les décors de test non. Aucun lien mort ne doit sortir.
    vi.mocked(fetchOpenGaps).mockResolvedValue([
      gap({ skill_id: 1, skill_name: "Sans mission_id", has_active_mission: true }),
      gap({ skill_id: 2, skill_name: "Sans lesson_id", content_state: "cours_brouillon" }),
    ]);
    renderPage();

    await screen.findByText(/Sans lesson_id/);
    expect(screen.queryByRole("link", { name: /Voir la mission/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Valider le cours/ })).toBeNull();
    expect(screen.queryByText(/undefined/)).toBeNull();
  });

  it("🔴 le sélecteur de matières POSE le filtre, et il vient des lacunes", async () => {
    // Le filtre existait mais n'était atteignable que par un lien externe : la page savait le lire
    // et le retirer, jamais le poser. Et les matières viennent des lacunes elles-mêmes — proposer
    // une matière sans lacune mènerait à une page vide, soit un filtre qui ment.
    vi.mocked(fetchOpenGaps).mockResolvedValue(TROIS);
    renderPage();

    const groupe = await screen.findByRole("group", { name: /Filtrer par matière/ });
    expect(within(groupe).getByRole("button", { name: /Français/ })).toBeInTheDocument();
    expect(within(groupe).getByRole("button", { name: /Mathématiques/ })).toBeInTheDocument();

    fireEvent.click(within(groupe).getByRole("button", { name: /Français/ }));

    expect(await screen.findByText(/Accord du participe/)).toBeInTheDocument();
    expect(screen.queryByText(/Comparaison de relatifs/)).toBeNull();
    // Filtrer ne coûte AUCUNE requête (adr-0038 §4) — le verrou de la page, transposé au sélecteur.
    expect(fetchOpenGaps).toHaveBeenCalledTimes(1);
  });

  it("une seule matière : pas de sélecteur", async () => {
    // Un groupe de pastilles à une seule option n'offre aucun choix — il occupe l'écran sans rien
    // permettre.
    vi.mocked(fetchOpenGaps).mockResolvedValue([gap()]);
    renderPage();

    await screen.findByText(/Comparaison de relatifs/);
    expect(screen.queryByRole("group", { name: /Filtrer par matière/ })).toBeNull();
  });

  it("le motif accompagne le geste à l'écran", async () => {
    vi.mocked(fetchOpenGaps).mockResolvedValue([
      gap({ content_state: "cours_brouillon", lesson_id: 24 }),
    ]);
    renderPage();

    // Sans lui, le geste est un lien nu : Papa doit deviner pourquoi celui-là.
    expect(await screen.findByText(/son cours est en brouillon/)).toBeInTheDocument();
  });
});
