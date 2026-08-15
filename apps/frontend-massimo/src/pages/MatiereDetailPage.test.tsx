import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type {
  AgendaUpcomingItem,
  MotivationWeek,
  ReviewsSummary,
  SubjectPanoply,
} from "@zetis/types";
import { MatiereDetailPage } from "./MatiereDetailPage";

const navigateMock = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", async (orig) => {
  const actual = await orig<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

// `PanoplyError` est utilisée en `instanceof` par le hook : le mock doit fournir une VRAIE
// classe, sinon le 404 ne serait jamais reconnu et la page afficherait un état vide muet.
vi.mock("../lib/panoply", () => ({
  PanoplyError: class PanoplyError extends Error {
    constructor(public status: number) {
      super(`Erreur ${status}`);
    }
  },
  fetchSubjectPanoply: vi.fn(),
  fetchSubjectResume: vi.fn(),
  createContentRequest: vi.fn(),
}));
vi.mock("../lib/quiz", () => ({ fetchQuizById: vi.fn() }));
vi.mock("../lib/reviews", () => ({ fetchReviewsSummary: vi.fn() }));
vi.mock("../lib/gamification", () => ({ fetchXpHistory: vi.fn() }));
// Le rail droit : l'engagement de Massimo et ses échéances réelles.
vi.mock("../lib/motivation", () => ({ fetchWeek: vi.fn(), updateWeekGoal: vi.fn() }));
vi.mock("../lib/agenda", () => ({ fetchAgendaUpcoming: vi.fn() }));

import { fetchAgendaUpcoming } from "../lib/agenda";
import { fetchXpHistory } from "../lib/gamification";
import { fetchWeek } from "../lib/motivation";
import {
  PanoplyError,
  createContentRequest,
  fetchSubjectPanoply,
  fetchSubjectResume,
} from "../lib/panoply";
import { fetchQuizById } from "../lib/quiz";
import { fetchReviewsSummary } from "../lib/reviews";

// SVT : deux chapitres, trois notions, chacune choisie pour un cas précis.
const PANOPLY: SubjectPanoply = {
  subject: { subject_id: 1, name: "SVT", slug: "svt" },
  // 250 XP → niveau 3, 50 acquis dans le niveau (barème `XP_PER_LEVEL = 100`). Les valeurs sont
  // calculées SERVEUR : le front n'a aucun barème à reproduire, et un test qui recalculerait ici
  // vérifierait sa propre arithmétique plutôt que le contrat.
  subject_xp: { total: 250, level: 3, into_level: 50, for_next: 100 },
  chapters: [
    {
      chapter_id: 10,
      title: "La cellule",
      notions: [
        {
          // Panoplie COMPLÈTE → aucun bouton « tout ce qui manque ».
          skill_id: 1,
          name: "Mitose",
          status: "solid",
          actions: [
            { kind: "cours", available: true, lesson_id: 3 },
            { kind: "eli5", available: true },
            { kind: "fiche", available: true, fiche_id: 5 },
            { kind: "capsule", available: true, capsule_id: 6 },
            { kind: "mindmap", available: true, mindmap_id: 7 },
            { kind: "revision", available: true },
            { kind: "quiz", available: true, quiz_id: 8 },
          ],
        },
        {
          // Le cours (PREMIER de la liste) manque, la fiche existe → l'accent doit aller à
          // la fiche, et « tout ce qui manque » doit DÉDUPLIQUER cours+eli5.
          skill_id: 2,
          name: "Photosynthèse",
          status: "weak",
          actions: [
            { kind: "cours", available: false },
            { kind: "eli5", available: false },
            { kind: "fiche", available: true, fiche_id: 9 },
            { kind: "capsule", available: false },
            { kind: "mindmap", available: false },
            { kind: "revision", available: false },
            { kind: "quiz", available: false },
          ],
        },
      ],
    },
    {
      chapter_id: 20,
      title: "Nutrition végétale",
      notions: [
        {
          skill_id: 3,
          name: "Racines",
          status: "unknown",
          actions: [
            { kind: "cours", available: true, lesson_id: 4 },
            { kind: "eli5", available: true },
            { kind: "fiche", available: false },
            { kind: "capsule", available: false },
            { kind: "mindmap", available: false },
            { kind: "revision", available: false },
            { kind: "quiz", available: false },
          ],
        },
      ],
    },
  ],
};

const SUMMARY: ReviewsSummary = {
  total_due: 42,
  flash_size: 5,
  new_count: 3,
  subjects: [
    // ⚠️ `due_count` volontairement ÉNORME et distinct de `session_size` : c'est ce qui rend
    // le test-verrou capable de voir la différence.
    { slug: "svt", name: "SVT", due_count: 42, new_count: 3, session_size: 8, has_cards: true },
  ],
};

// L'engagement que Massimo s'est DONNÉ : 3 jours faits, objectif 4. Jamais imposé.
const SEMAINE: MotivationWeek = {
  week_start: "2026-08-10",
  days: [
    { date: "2026-08-10", active: true, is_today: false },
    { date: "2026-08-11", active: true, is_today: true },
    { date: "2026-08-12", active: false, is_today: false },
    { date: "2026-08-13", active: true, is_today: false },
    { date: "2026-08-14", active: false, is_today: false },
    { date: "2026-08-15", active: false, is_today: false },
    { date: "2026-08-16", active: false, is_today: false },
  ],
  days_done: 3,
  today_done: true,
  goal_days: 4,
  goal_met: false,
};

// ⚠️ Deux matières : le rail de SVT ne doit montrer QUE l'échéance de SVT.
const ECHEANCES: AgendaUpcomingItem[] = [
  {
    id: 1,
    label: "Contrôle sur la cellule",
    subject: { id: 1, slug: "svt", name: "SVT", color: null },
    due_on: "2026-08-14",
    days_left: 3,
    has_plan: false,
  },
  {
    id: 2,
    label: "Rendu d'exposé",
    subject: { id: 2, slug: "anglais", name: "Anglais", color: null },
    due_on: "2026-08-13",
    days_left: 2,
    has_plan: false,
  },
];

// ⚠️ `cours` et `quiz` UNIQUEMENT : le serveur écarte `fiche` et `revision`, qui ne se
// rouvrent pas à l'identique. Ces fixtures ne doivent jamais en contenir d'autres.
const REPRISE = [
  { kind: "cours" as const, title: "Mitose", target_id: 3, at: "2026-08-10T10:00:00Z" },
  { kind: "quiz" as const, title: "Quiz cellule", target_id: 8, at: "2026-08-09T10:00:00Z" },
];

/** L'INDEX DE NOTIONS — recherche, accordéon, panoplie, demandes.
 *
 *  ⚠️ Depuis le 2026-08-11 (addendum ADR-0024 « page matière onglets »), l'index n'est plus la
 *  vue par défaut : il vit sous `?onglet=chapitres`. **Seule cette adresse a changé.** Aucune
 *  assertion des tests écrits avant cette date n'a été touchée — ce qu'ils vérifiaient hier, ils
 *  le vérifient encore, au même endroit du DOM. C'est la condition qui rendait le déplacement
 *  acceptable. */
function renderPage(slug = "svt") {
  return render(
    <MemoryRouter initialEntries={[`/subjects/${slug}?onglet=chapitres`]}>
      <Routes>
        <Route path="/subjects/:slug" element={<MatiereDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** La VUE D'ENSEMBLE — anneau, courbe d'XP, cartes de chapitres (l'onglet par défaut). */
function renderApercu(slug = "svt") {
  return render(
    <MemoryRouter initialEntries={[`/subjects/${slug}`]}>
      <Routes>
        <Route path="/subjects/:slug" element={<MatiereDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Déplie un chapitre, puis ouvre le panneau d'une de ses notions.
 *
 *  ⚠️ TOUS les chapitres sont repliés au chargement (décision du 2026-08-01) : aucune notion
 *  n'est dans le DOM tant qu'on n'a pas déplié son chapitre. D'où le paramètre obligatoire. */
async function ouvrirNotion(chapitre: RegExp, nom: RegExp) {
  fireEvent.click(await screen.findByRole("button", { name: chapitre }));
  const ligne = await screen.findByRole("button", { name: nom });
  fireEvent.click(ligne);
  return ligne;
}

/** Le bouton d'ACTIVITÉ, et non le bouton « demander » voisin — dont le libellé accessible
 *  (« Demander Lire la fiche à ZETIS ») contient le même texte. */
function activite(label: string) {
  return screen.getByRole("button", { name: new RegExp(`^${label}`) });
}

beforeEach(() => {
  navigateMock.mockReset();
  vi.mocked(fetchSubjectPanoply).mockReset().mockResolvedValue(PANOPLY);
  vi.mocked(fetchReviewsSummary).mockReset().mockResolvedValue(SUMMARY);
  vi.mocked(createContentRequest).mockReset().mockResolvedValue({ requested: [] });
  // ⚠️ Série CREUSE : trois jours de travail, et surtout PAS les 27 autres à zéro. C'est le
  // contrat de la route (addendum ADR-0024 « Accueil vivant » §A), et la fixture doit le
  // refléter — une fixture dense laisserait passer un composant qui suppose des zéros.
  vi.mocked(fetchXpHistory)
    .mockReset()
    .mockResolvedValue({
      days: [
        { date: "2026-07-20", xp: 40 },
        { date: "2026-07-28", xp: 90 },
        { date: "2026-08-09", xp: 120 },
      ],
    });
  vi.mocked(fetchWeek).mockReset().mockResolvedValue(SEMAINE);
  vi.mocked(fetchSubjectResume).mockReset().mockResolvedValue({
    subject: { subject_id: 1, name: "SVT", slug: "svt" },
    items: REPRISE,
  });
  vi.mocked(fetchQuizById).mockReset().mockResolvedValue({ id: 8, title: "Quiz cellule" } as never);
  // Deux échéances, dont UNE en anglais : le rail ne doit montrer que celle de SVT.
  vi.mocked(fetchAgendaUpcoming).mockReset().mockResolvedValue(ECHEANCES);
});

// --- Verrous de doctrine (ADR-0024 §5) ---------------------------------------------------

describe("MatiereDetailPage — ce que la page ne dit JAMAIS", () => {
  // ⚠️ RÉVOCATION PARTIELLE, 2026-08-11 (addendum ADR-0024 « page matière onglets »).
  //
  // Ce verrou interdisait « ni niveau, ni XP, ni pourcentage, ni barre de progression » d'un
  // seul tenant. Sa MOITIÉ XP/niveau est levée : l'ADR-0024 §5 ne les nomme pas — il interdit
  // de *noter Massimo* et de *mettre ses matières en concurrence*, et un XP ne fait ni l'un ni
  // l'autre (il compte ce qui a été FAIT, il ne peut que monter). L'interdit venait du doc de
  // page, qui avait étendu l'ADR de lui-même.
  //
  // 🔴 **L'autre moitié n'est PAS levée, et elle est renforcée ci-dessous** : elle doit désormais
  // tenir À CÔTÉ d'une vraie barre d'XP, ce qui est un test plus dur qu'avant.
  it("n'affiche AUCUN pourcentage et AUCUN score de maîtrise", async () => {
    const { container } = renderPage();
    await screen.findByRole("heading", { name: "SVT" });
    // ⚠️ `%` seul, et « acquis » PRÉCÉDÉ d'un nombre : « Bien acquis » est l'un des cinq
    // libellés d'enfant de `starStyle`, parfaitement légitime. C'est « 72 % acquis » des
    // maquettes qui est interdit, pas le mot.
    expect(container.textContent).not.toMatch(/%|mastery|score|\d\s*acquis/i);
  });

  it("n'affiche aucun pourcentage NON PLUS sur la vue d'ensemble", async () => {
    // ⚠️ C'est là que les maquettes en portaient : « 66 % Maîtrisé » au centre de l'anneau et
    // « 72 % acquis » sur les cartes. Refusés — l'anneau rend des COMPTES.
    const { container } = renderApercu();
    await screen.findByRole("heading", { name: "SVT" });
    // ⚠️ `%` seul, et « acquis » PRÉCÉDÉ d'un nombre : « Bien acquis » est l'un des cinq
    // libellés d'enfant de `starStyle`, parfaitement légitime. C'est « 72 % acquis » des
    // maquettes qui est interdit, pas le mot.
    expect(container.textContent).not.toMatch(/%|mastery|score|\d\s*acquis/i);
  });

  it("affiche le XP et le niveau de la matière — l'effort, jamais la note", async () => {
    renderApercu();
    // 250 XP → niveau 3 (barème `XP_PER_LEVEL = 100`), 50 acquis dans le niveau.
    expect(await screen.findByText(/Niveau 3/)).toBeInTheDocument();
    expect(screen.getByText(/250 XP/)).toBeInTheDocument();
  });

  it("l'anneau ne montre QUE ce qui est allumé — jamais « À découvrir »", async () => {
    // 🔴 TEST-VERROU, né de la relecture à l'écran du 2026-08-11 sur données réelles : SVT a
    // 78 notions « À découvrir » sur 80. L'anneau était un disque gris à 97,5 % — il ne disait
    // pas « voilà où tu en es », il disait « tu n'as presque rien fait ».
    //
    // L'ADR-0024 §5 : « la vue d'ensemble affiche un COMPTE d'étoiles allumées ». La galaxie ne
    // dessine pas le noir entre les étoiles. Et « 2 travaillées » à côté de « 78 à découvrir »
    // reconstituerait « 2 sur 80 » — le ratio interdit, réintroduit par la porte de derrière.
    // ⚠️ On vise l'`aria-label` de l'anneau, jamais un `getByText("2")` nu : le rail droit
    // affiche aussi des nombres de jours, et un sabotage a montré que le test devenait ambigu
    // dès qu'une échéance à 2 jours entrait dans la page. Un test qui se casse pour une raison
    // qui n'est pas la sienne ne prouve rien.
    const { container } = renderApercu();
    await screen.findByLabelText(/^2 notions travaillées en SVT$/);
    expect(screen.getByText("Bien acquis")).toBeInTheDocument();
    expect(screen.getByText("On commence")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/À découvrir/);
    // Ni le compte des non-commencées, ni le total du catalogue en face de lui.
    expect(container.textContent).not.toMatch(/\bsur 3\b/);
  });

  it("l'anneau ne s'affiche pas DU TOUT quand rien n'est commencé", async () => {
    // Un anneau vide serait un réceptacle vide — et les cartes de chapitres juste en dessous
    // sont la vraie invitation à entrer.
    vi.mocked(fetchSubjectPanoply).mockResolvedValue({
      ...PANOPLY,
      chapters: PANOPLY.chapters.map((c) => ({
        ...c,
        notions: c.notions.map((n) => ({ ...n, status: "unknown" as const })),
      })),
    });
    const { container } = renderApercu();
    await screen.findByText(/Mes chapitres/i);
    expect(container.textContent).not.toMatch(/Où j'en suis|travaillées/i);
  });

  it("n'affiche AUCUN rouge et AUCUN or (l'or est réservé à « ZETIS parle »)", async () => {
    const { container } = renderPage();
    await screen.findByRole("heading", { name: "SVT" });
    expect(container.innerHTML).not.toMatch(/red-|rose-|ffcf47/i);
  });

  it("ne formule jamais une absence comme un échec", async () => {
    const { container } = renderPage();
    await ouvrirNotion(/La cellule/, /Photosynthèse/);
    // « manque » est autorisé — « tout ce qui manque » est le libellé de la spec. Ce qui est
    // interdit, c'est le vocabulaire qui désigne l'enfant : manquant, raté, échec.
    expect(container.textContent).not.toMatch(/manquant|raté|échec|erreur|retard|nul/i);
  });

  it("affiche le plafond de session, JAMAIS l'arriéré", async () => {
    // ⚠️ TEST-VERROU. `due_count = 42` est l'arriéré : l'afficher serait la pression
    // quotidienne que `CLAUDE.md` interdit. `session_size = 8` est ce que la session servira.
    const { container } = renderPage();
    await screen.findByLabelText("8 cartes à revoir en SVT");
    expect(container.textContent).not.toContain("42");
  });

  it("ne rend PAS la carte de révision quand il n'y a rien à revoir", async () => {
    // « Jamais rendue à vide » : une carte à zéro serait un reproche déguisé.
    vi.mocked(fetchReviewsSummary).mockResolvedValue({
      ...SUMMARY,
      subjects: [{ ...SUMMARY.subjects[0], due_count: 0, session_size: 0 }],
    });
    const { container } = renderPage();
    await screen.findByRole("heading", { name: "SVT" });
    expect(container.textContent).not.toMatch(/à revoir/);
  });
});

// --- En-tête et états --------------------------------------------------------------------

describe("MatiereDetailPage — en-tête et états", () => {
  it("compte le CATALOGUE : 2 chapitres · 3 notions", async () => {
    renderPage();
    expect(await screen.findByText(/2 chapitres · 3 notions/)).toBeInTheDocument();
  });

  it("le décompte ne bouge PAS quand on filtre", async () => {
    // Sinon la recherche donnerait l'impression que la matière rétrécit.
    renderPage();
    await screen.findByText(/2 chapitres · 3 notions/);
    fireEvent.change(screen.getByLabelText("Cherche une notion"), {
      target: { value: "photosynthese" },
    });
    expect(screen.getByText(/2 chapitres · 3 notions/)).toBeInTheDocument();
  });

  it("404 : la matière n'existe pas, avec un retour vers les Matières", async () => {
    vi.mocked(fetchSubjectPanoply).mockRejectedValue(new PanoplyError(404));
    renderPage("latin");
    expect(await screen.findByText(/n'existe pas encore/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Matières/ }).getAttribute("href")).toBe("/matieres");
  });

  it("matière sans rien de validé : état POSITIF, pas une erreur", async () => {
    vi.mocked(fetchSubjectPanoply).mockResolvedValue({ ...PANOPLY, chapters: [] });
    const { container } = renderPage();
    expect(await screen.findByText(/arrivent bientôt/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/erreur|vide|aucun contenu/i);
  });

  it("une panne du résumé de révision n'emporte pas la page", async () => {
    // `allSettled` et jamais `all` : Massimo doit voir sa matière, même dégradée.
    vi.mocked(fetchReviewsSummary).mockRejectedValue(new Error("réseau"));
    renderPage();
    expect(await screen.findByRole("heading", { name: "SVT" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /La cellule/ }));
    expect(screen.getByRole("button", { name: /Mitose/ })).toBeInTheDocument();
  });
});

// --- La bande « ce que ZETIS a pour cette matière » ---------------------------------------

describe("MatiereDetailPage — ce que ZETIS a pour la matière", () => {
  it("annonce chaque type de contenu, avec son compte", async () => {
    // Fixture SVT : Mitose a tout (cours l.3, fiche 5, capsule 6, mindmap 7, quiz 8),
    // Photosynthèse a une fiche (9), Racines un cours (leçon 4). Plus 8 cartes à revoir.
    renderPage();
    expect(await screen.findByLabelText("2 cours en SVT")).toBeInTheDocument();
    expect(screen.getByLabelText("2 fiches en SVT")).toBeInTheDocument();
    // Regex : la capsule n'est pas ouvrable depuis ici, son libellé porte donc un suffixe.
    expect(screen.getByLabelText(/1 capsule en SVT/)).toBeInTheDocument();
    // ⚠️ « mindmap », pas « carte » — corrigé le 2026-08-11. Cette pastille annonçait « 1 carte »
    // à trois pastilles de « 8 cartes à revoir » : le même mot pour deux destinations, et le lien
    // vers les mindmaps se lisait comme absent. Les deux libellés doivent rester DISTINCTS.
    // (`ACTION_UI` a suivi le 2026-08-12 — voir le verrou de `lib/notionActionUi.test.ts`.)
    expect(screen.getByLabelText("1 mindmap en SVT")).toBeInTheDocument();
    expect(screen.getByLabelText("1 quiz en SVT")).toBeInTheDocument();
    expect(screen.getByLabelText("8 cartes à revoir en SVT")).toBeInTheDocument();
  });

  it("ne nomme JAMAIS « carte » deux destinations différentes", async () => {
    // 🔴 TEST-VERROU né d'un signalement du user. La mindmap et la révision SRS sont deux
    // surfaces distinctes ; les appeler pareil fait disparaître l'une des deux à la lecture.
    //
    // ⚠️ Il ne couvre que CETTE bande. La même collision vivait dans `ACTION_UI` — la table
    // partagée par le panneau de notion, la Galaxy et le chat — sans qu'aucune assertion d'ici
    // ne puisse la voir. Elle y a été levée le 2026-08-12, et son propre verrou vit désormais
    // sur la table : `lib/notionActionUi.test.ts`.
    renderPage();
    const mindmap = await screen.findByLabelText(/mindmap en SVT/);
    expect(mindmap.getAttribute("href")).toContain("/mindmaps/");
    // Aucune pastille de mindmap ne doit se présenter comme une « carte » tout court.
    expect(screen.queryByLabelText(/^\d+ cartes? en SVT/)).toBeNull();
  });

  it("compte des RESSOURCES, pas des notions — deux notions d'une même leçon font UNE fiche", async () => {
    // ⚠️ LE test de ce lot. Plusieurs notions partagent la même leçon, donc la même fiche et le
    // même cours : le serveur renvoie le MÊME `fiche_id` sur chacune. Sans déduplication, le
    // compte serait gonflé d'autant de fois que la leçon enseigne de notions.
    vi.mocked(fetchSubjectPanoply).mockResolvedValue({
      ...PANOPLY,
      chapters: [
        {
          chapter_id: 10,
          title: "La cellule",
          notions: [1, 2, 3].map((skill_id) => ({
            skill_id,
            name: `Notion ${skill_id}`,
            status: "weak" as const,
            actions: [
              // Même leçon, même fiche : trois notions, UNE ressource de chaque.
              { kind: "cours" as const, available: true, lesson_id: 77 },
              { kind: "fiche" as const, available: true, fiche_id: 88 },
            ],
          })),
        },
      ],
    });
    renderPage();

    expect(await screen.findByLabelText("1 cours en SVT")).toBeInTheDocument();
    expect(screen.getByLabelText("1 fiche en SVT")).toBeInTheDocument();
    // Le piège qu'on évite : « 3 cours · 3 fiches ».
    expect(screen.queryByLabelText(/3 cours/)).toBeNull();
    expect(screen.queryByLabelText(/3 fiches/)).toBeNull();
  });

  it("les types adressables sont des liens vers leur surface MATIÈRE", async () => {
    renderPage();
    const lien = (label: string) => screen.getByLabelText(label).getAttribute("href");
    await screen.findByLabelText("2 cours en SVT");

    expect(lien("2 cours en SVT")).toBe("/subjects/svt/cours");
    expect(lien("2 fiches en SVT")).toBe("/fiches/svt");
    expect(lien("1 mindmap en SVT")).toBe("/mindmaps/svt");
    expect(lien("8 cartes à revoir en SVT")).toBe("/revision?subject=svt&from=svt");
  });

  it("le quiz ouvre les quiz DE LA MATIÈRE, pas la grille de toutes", async () => {
    // ⚠️ Régression signalée le 2026-08-01 : « le KPI 1 quiz ne marche pas ». Le compte était
    // juste, mais la pastille ne menait nulle part — `/quiz` gardait la matière en état
    // interne. Un lien profond `?subject=` a été ajouté à `QuizPage`.
    renderPage();
    const quiz = await screen.findByLabelText("1 quiz en SVT");
    expect(quiz.getAttribute("href")).toBe("/quiz?subject=svt&from=svt");
  });

  it("une pastille non ouvrable est visiblement INERTE, jamais muette", async () => {
    // La capsule n'a aucune route par matière (`/capsules` est global). Elle doit donc se
    // distinguer à l'œil — sinon elle se lit comme une panne, ce qui est EXACTEMENT ce qui
    // s'est produit avec le quiz : ressembler à un lien sans en être un est un bug d'UI.
    renderPage();
    const capsule = await screen.findByLabelText(/1 capsule en SVT/);

    expect(capsule.tagName).not.toBe("A");
    expect(capsule.className).toContain("border-dashed");
    // Et l'`aria-label` le DIT, au lieu de laisser un lecteur d'écran deviner.
    expect(capsule.getAttribute("aria-label")).toContain("pas encore ouvrable");
    expect(capsule.textContent).toContain("1");
  });

  it("un type sans rien n'a PAS de pastille", async () => {
    vi.mocked(fetchSubjectPanoply).mockResolvedValue({
      ...PANOPLY,
      chapters: [
        {
          chapter_id: 10,
          title: "La cellule",
          notions: [
            {
              skill_id: 1,
              name: "Mitose",
              status: "weak",
              actions: [{ kind: "cours", available: true, lesson_id: 3 }],
            },
          ],
        },
      ],
    });
    renderPage();

    expect(await screen.findByLabelText("1 cours en SVT")).toBeInTheDocument();
    expect(screen.queryByLabelText(/fiche/)).toBeNull();
    expect(screen.queryByLabelText(/capsule/)).toBeNull();
    expect(screen.queryByLabelText(/quiz/)).toBeNull();
  });

  it("la bande DISPARAÎT quand la matière n'a encore rien", async () => {
    // Une matière vide n'affiche pas six zéros : ce serait dresser la liste de ce qui manque.
    vi.mocked(fetchSubjectPanoply).mockResolvedValue({ ...PANOPLY, chapters: [] });
    vi.mocked(fetchReviewsSummary).mockResolvedValue({
      ...SUMMARY,
      subjects: [{ ...SUMMARY.subjects[0], due_count: 0, session_size: 0 }],
    });
    renderPage();

    await screen.findByText(/arrivent bientôt/);
    expect(screen.queryByLabelText(/en SVT/)).toBeNull();
  });

  it("les nombres ne bougent PAS pendant une recherche", async () => {
    // La bande décrit la MATIÈRE, pas les résultats : elle est calculée sur les chapitres
    // bruts, jamais sur les chapitres filtrés.
    renderPage();
    await screen.findByLabelText("2 fiches en SVT");
    fireEvent.change(screen.getByLabelText("Cherche une notion"), {
      target: { value: "photosynthese" },
    });
    expect(screen.getByLabelText("2 fiches en SVT")).toBeInTheDocument();
    expect(screen.getByLabelText("2 cours en SVT")).toBeInTheDocument();
  });

  it("ELI5 n'est PAS dans la bande — ce n'est pas un produit du catalogue", async () => {
    // Il ne stocke rien : il se génère à la volée. Le compter n'aurait aucun sens, et le
    // serveur ne lui donne d'ailleurs aucun identifiant.
    renderPage();
    await screen.findByLabelText("2 cours en SVT");
    expect(screen.queryByLabelText(/explication/)).toBeNull();
  });
});

// --- Témoin « chapitre déjà alimenté » ---------------------------------------------------

describe("MatiereDetailPage — quels chapitres ont déjà de quoi travailler", () => {
  it("un chapitre alimenté annonce COMBIEN de ses notions sont prêtes", async () => {
    // « La cellule » : Mitose (panoplie complète) + Photosynthèse (une fiche) → 2 prêtes.
    // « Nutrition végétale » : Racines (cours + ELI5) → 1 prête.
    renderPage();
    const cellule = await screen.findByRole("button", { name: /La cellule/ });
    expect(cellule.textContent).toContain("2 notions");
    expect(cellule.textContent).toContain("2 prêtes");
    expect(screen.getByRole("button", { name: /Nutrition végétale/ }).textContent).toContain(
      "1 prête",
    );
  });

  it("c'est un COMPTE, jamais un ratio — un « 2 sur 3 » serait un score", async () => {
    // ⚠️ TEST-VERROU (ADR-0024 §5). La Galaxy compte des étoiles allumées, elle ne note pas
    // Massimo ; cet en-tête suit la même règle. Un dénominateur transformerait le témoin en
    // barre de progression déguisée.
    const { container } = renderPage();
    await screen.findByRole("button", { name: /La cellule/ });
    expect(container.textContent).not.toMatch(/\bsur \d|\d\s*\/\s*\d|%/);
  });

  it("un chapitre sans RIEN de prêt reste identique aux autres — ni témoin, ni grisé", async () => {
    // L'absence de contenu est l'état du catalogue de Papa, pas un manque de l'enfant. Un
    // chapitre entier atténué se lirait comme un reproche.
    vi.mocked(fetchSubjectPanoply).mockResolvedValue({
      ...PANOPLY,
      chapters: [
        {
          chapter_id: 30,
          title: "Respiration",
          notions: [
            {
              skill_id: 9,
              name: "Poumons",
              status: "unknown",
              actions: [
                { kind: "cours", available: false },
                { kind: "eli5", available: false },
                { kind: "fiche", available: false },
                { kind: "capsule", available: false },
                { kind: "mindmap", available: false },
                { kind: "revision", available: false },
                { kind: "quiz", available: false },
              ],
            },
          ],
        },
      ],
    });
    renderPage();

    const chapitre = await screen.findByRole("button", { name: /Respiration/ });
    expect(chapitre.textContent).toContain("1 notion");
    expect(chapitre.textContent).not.toMatch(/prête/);
    // Aucune atténuation : il se rend comme n'importe quel autre chapitre.
    expect(chapitre.className).not.toMatch(/opacity|grayscale/);
  });

  it("pendant une recherche, le témoin décrit ce qui est TROUVÉ", async () => {
    // Les deux nombres de l'en-tête doivent parler du même ensemble, sinon ils se
    // contredisent : « 1 notion · 2 prêtes » n'aurait aucun sens.
    renderPage();
    await screen.findByRole("heading", { name: "SVT" });
    fireEvent.change(screen.getByLabelText("Cherche une notion"), {
      target: { value: "photosynthese" },
    });

    const cellule = screen.getByRole("button", { name: /La cellule/ });
    expect(cellule.textContent).toContain("1 notion");
    expect(cellule.textContent).toContain("1 prête");
  });
});

// --- Recherche ---------------------------------------------------------------------------

describe("MatiereDetailPage — recherche locale", () => {
  it("« photosynthese » trouve « Photosynthèse » et fait DISPARAÎTRE les autres chapitres", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "SVT" });
    fireEvent.change(screen.getByLabelText("Cherche une notion"), {
      target: { value: "photosynthese" },
    });

    expect(screen.getByRole("button", { name: /Photosynthèse/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Racines/ })).toBeNull();
    // Le chapitre sans trouvaille ne se contente pas de se replier : il sort de la vue.
    expect(screen.queryByText("Nutrition végétale")).toBeNull();
    expect(screen.getByText(/1 notion trouvée/)).toBeInTheDocument();
  });

  it("surligne la correspondance dans le nom, accent compris", async () => {
    const { container } = renderPage();
    await screen.findByRole("heading", { name: "SVT" });
    fireEvent.change(screen.getByLabelText("Cherche une notion"), {
      target: { value: "photosynthese" },
    });
    const mark = container.querySelector("mark");
    // Le texte surligné est l'ORIGINAL accentué : la carte d'offsets fait son travail.
    expect(mark?.textContent).toBe("Photosynthèse");
  });

  it("`Échap` efface la recherche et restaure l'arbre", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "SVT" });
    const champ = screen.getByLabelText("Cherche une notion");
    fireEvent.change(champ, { target: { value: "photosynthese" } });
    expect(screen.queryByText("Nutrition végétale")).toBeNull();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(await screen.findByText("Nutrition végétale")).toBeInTheDocument();
    expect((champ as HTMLInputElement).value).toBe("");
  });

  it("aucun résultat : message de renvoi vers le chat, jamais un échec", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "SVT" });
    fireEvent.change(screen.getByLabelText("Cherche une notion"), {
      target: { value: "zzz" },
    });
    expect(screen.getByText(/Rien avec ce mot-là en SVT/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "chat" }).getAttribute("href")).toBe("/chat");
  });

  it("au chargement, le compteur ne dit PAS « 0 notion trouvée »", async () => {
    // « Rien de cherché » n'est pas « zéro trouvé » : ce serait un échec inventé.
    const { container } = renderPage();
    await screen.findByRole("heading", { name: "SVT" });
    expect(container.textContent).not.toMatch(/trouvée/);
  });
});

// --- Panoplie et panneau -----------------------------------------------------------------

describe("MatiereDetailPage — panoplie", () => {
  it("rend les 7 pastilles, l'état plein/creux suivant `available`", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Nutrition végétale/ }));
    const ligne = await screen.findByRole("button", { name: /Racines/ });
    const pastilles = within(ligne).getAllByRole("img");
    expect(pastilles).toHaveLength(7);
    expect(pastilles.filter((p) => (p.getAttribute("aria-label") ?? "").includes("bientôt")))
      .toHaveLength(5);
  });

  it("l'accent va à la première activité FAISABLE, pas à la première de la liste", async () => {
    // Sur Photosynthèse, `cours` est le premier kind mais il est indisponible : l'accent doit
    // aller à la fiche. Une action mise en avant doit pouvoir être faite.
    renderPage();
    await ouvrirNotion(/La cellule/, /Photosynthèse/);
    expect(activite("Lire la fiche").className).toContain("from-zetis-accent");
    expect(activite("Voir le cours").className).not.toContain("from-zetis-accent");
  });

  it("une activité indisponible n'est pas cliquable et ne navigue nulle part", async () => {
    renderPage();
    await ouvrirNotion(/La cellule/, /Photosynthèse/);
    const cours = activite("Voir le cours");
    expect(cours.hasAttribute("disabled")).toBe(true);
    fireEvent.click(cours);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("une activité disponible ouvre sa surface en PLEINE PAGE (jamais une modale)", async () => {
    // Amendement ADR-0017, tranché par la Galaxy de fait.
    renderPage();
    await ouvrirNotion(/La cellule/, /Mitose/);
    fireEvent.click(activite("Voir le cours"));
    expect(navigateMock).toHaveBeenCalledWith("/subjects/svt/cours?lesson=3", undefined);
  });

  it("dit que quiz et révision ouvrent la MATIÈRE, sans promettre la notion", async () => {
    renderPage();
    await ouvrirNotion(/La cellule/, /Mitose/);
    expect(activite("Me tester").textContent).toContain(
      "toute la matière",
    );
  });
});

// --- Demandes de contenu -----------------------------------------------------------------

describe("MatiereDetailPage — demander à ZETIS", () => {
  it("« tout ce qui manque » = UN seul appel, avec les kinds DÉDUPLIQUÉS", async () => {
    // ⚠️ Sur Photosynthèse, `cours` ET `eli5` manquent, et tous deux se demandent comme
    // `cours`. Sans dédup, l'appel enverrait deux fois « cours » et le compteur dirait 7 —
    // alors que le vocabulaire n'a que 6 entrées.
    renderPage();
    await ouvrirNotion(/La cellule/, /Photosynthèse/);

    const bouton = screen.getByRole("button", { name: /tout ce qui manque \(5\)/ });
    fireEvent.click(bouton);

    await waitFor(() => expect(createContentRequest).toHaveBeenCalledTimes(1));
    expect(createContentRequest).toHaveBeenCalledWith({
      skill_id: 2,
      content_kinds: ["cours", "capsule", "mindmap", "card", "quiz"],
    });
  });

  it("le bouton « tout ce qui manque » est ABSENT quand la panoplie est complète", async () => {
    renderPage();
    await ouvrirNotion(/La cellule/, /Mitose/);
    expect(screen.queryByRole("button", { name: /tout ce qui manque/ })).toBeNull();
  });

  it("une demande unitaire n'envoie QUE ce type-là, et la pastille passe en « demandé »", async () => {
    renderPage();
    await ouvrirNotion(/Nutrition végétale/, /Racines/);
    fireEvent.click(screen.getByRole("button", { name: /Demander Lire la fiche à ZETIS/ }));

    await waitFor(() => expect(createContentRequest).toHaveBeenCalledTimes(1));
    expect(createContentRequest).toHaveBeenCalledWith({ skill_id: 3, content_kinds: ["fiche"] });
    expect(await screen.findByRole("button", { name: /déjà demandé à ZETIS/ })).toBeInTheDocument();
  });

  it("le retour dit qu'une demande est ENREGISTRÉE, sans promettre de contenu", async () => {
    // « C'est noté par ZETIS » ne promet ni qui traitera la demande ni quand — vrai que le
    // contenu vienne de Papa ou, demain, de ZETIS lui-même.
    //
    // ⚠️ Ce test vérifiait aussi la phrase « ZETIS transmet la demande. Il ne fabrique rien
    // tout seul. », retirée le 2026-08-01 : ZETIS produira bientôt du contenu, et la phrase
    // serait devenue fausse. Ce qui reste interdit, lui, est toujours vérifié ci-dessous.
    renderPage();
    await ouvrirNotion(/Nutrition végétale/, /Racines/);
    fireEvent.click(screen.getByRole("button", { name: /Demander Lire la fiche à ZETIS/ }));

    expect(await screen.findByText("C'est noté par ZETIS")).toBeInTheDocument();
  });

  it("ne promet JAMAIS de préparer le contenu, ni délai, ni statut", async () => {
    // Le garde-fou qui survit au retrait de la phrase fixe. Une promesse non tenue, ça se
    // retient : ZETIS enregistre, il n'annonce pas de livraison.
    const { container } = renderPage();
    await ouvrirNotion(/Nutrition végétale/, /Racines/);
    fireEvent.click(screen.getByRole("button", { name: /Demander Lire la fiche à ZETIS/ }));
    await screen.findByText("C'est noté par ZETIS");

    // ⚠️ Le RAIL DROIT est retiré du balayage, et c'est une précision de portée, pas un
    // affaiblissement : il affiche les échéances réelles du cahier de texte (« dans 3 jours »),
    // qui sont un décompte **subi** — le contrôle existe que ZETIS l'affiche ou non. Ce verrou
    // vise ce que ZETIS **annonce** de sa propre production, pas ce que le professeur a posé.
    container.querySelector("aside")?.remove();
    expect(container.textContent).not.toMatch(
      /je te le prépare|je m'en occupe|en cours de|bientôt prêt|d'ici|dans \d|en attente/i,
    );
  });

  it("la demande porte l'orange électrique — teinte ET halo", async () => {
    // L'orange `zetis-request` distingue le geste de demande des actions faisables (indigo /
    // cyan). Ce n'est pas une couleur d'alerte : demander est la seule chose que Massimo
    // puisse faire face à un contenu absent, donc c'est positif.
    //
    // ⚠️ Le HALO fait partie de la décision, pas de la décoration. La teinte n'a presque
    // aucune marge (l'or est à 18°, le rouge est banni) : « électrique » se dit donc par la
    // LUEUR, comme partout ailleurs dans l'app. Sans `shadow-request`, l'orange redevient un
    // aplat saturé qui lit « attention » au lieu de « demande ».
    renderPage();
    await ouvrirNotion(/Nutrition végétale/, /Racines/);

    const demander = screen.getByRole("button", { name: /Demander Lire la fiche à ZETIS/ });
    expect(demander.className).toContain("zetis-request");
    expect(demander.className).toContain("shadow-request");

    const tout = screen.getByRole("button", { name: /tout ce qui manque/ });
    expect(tout.className).toContain("zetis-request");
    expect(tout.className).toContain("shadow-request");

    // Une activité DISPONIBLE ne porte jamais l'orange : elle n'est pas à demander.
    expect(activite("Voir le cours").className).not.toContain("zetis-request");
  });

  it("une fois demandé, le bouton s'APAISE — il n'appelle plus", async () => {
    // Le halo attire vers un geste à faire. Le geste fait, il n'a plus lieu d'être : garder la
    // lueur ferait clignoter une demande déjà transmise, donc réclamer deux fois.
    renderPage();
    await ouvrirNotion(/Nutrition végétale/, /Racines/);
    fireEvent.click(screen.getByRole("button", { name: /Demander Lire la fiche à ZETIS/ }));

    const demande = await screen.findByRole("button", { name: /déjà demandé à ZETIS/ });
    expect(demande.className).toContain("zetis-request");
    expect(demande.className).not.toContain("shadow-request");
  });

  it("un échec réseau revient en arrière EN SILENCE, sans écran d'erreur", async () => {
    // Une demande perdue ne vaut pas un message d'échec chez un enfant : il retapera. Un
    // message, lui, se retient.
    vi.mocked(createContentRequest).mockRejectedValue(new Error("réseau"));
    const { container } = renderPage();
    await ouvrirNotion(/Nutrition végétale/, /Racines/);
    fireEvent.click(screen.getByRole("button", { name: /Demander Lire la fiche à ZETIS/ }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Demander Lire la fiche à ZETIS/ })).toBeInTheDocument(),
    );
    expect(container.textContent).not.toMatch(/erreur|échec|réessay/i);
  });
});

// --- Accessibilité -----------------------------------------------------------------------

describe("MatiereDetailPage — plancher d'accessibilité", () => {
  it("chaque notion porte son état dans son `aria-label`", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /La cellule/ }));
    expect(screen.getByRole("button", { name: "Mitose — Bien acquis" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Nutrition végétale/ }));
    expect(screen.getByRole("button", { name: "Racines — À découvrir" })).toBeInTheDocument();
  });

  it("chaque pastille de panoplie dit ce qu'elle est, et si c'est pour bientôt", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Nutrition végétale/ }));
    const ligne = await screen.findByRole("button", { name: /Racines/ });
    expect(within(ligne).getByLabelText("Lire la fiche — bientôt")).toBeInTheDocument();
    expect(within(ligne).getByLabelText("Voir le cours — disponible")).toBeInTheDocument();
  });

  it("l'accordéon annonce son état et ce qu'il contrôle", async () => {
    renderPage();
    const chapitre = await screen.findByRole("button", { name: /La cellule/ });
    // Replié à l'ouverture : la page présente la MATIÈRE, pas le contenu d'un chapitre choisi
    // pour Massimo. C'est lui qui décide où il entre.
    expect(chapitre.getAttribute("aria-expanded")).toBe("false");
    expect(chapitre.getAttribute("aria-controls")).toBe("chapitre-10");
    expect(screen.queryByRole("button", { name: /Mitose/ })).toBeNull();

    fireEvent.click(chapitre);
    expect(chapitre.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: /Mitose/ })).toBeInTheDocument();
  });
});

// --- Rail droit : ce que Massimo s'est donné, ce que l'école lui a donné -----------------
//
// Les trois cartes viennent des maquettes du 2026-08-11, et AUCUNE n'y est reprise telle
// quelle : chacune heurtait une règle écrite de `CLAUDE.md` sur l'interface enfant. Ces tests
// verrouillent les reformulations, pas la présence des cartes.

describe("MatiereDetailPage — le rail droit", () => {
  it("affiche l'engagement que Massimo S'EST DONNÉ, jamais un ordre", async () => {
    // 🔴 La maquette disait « **Atteins** le niveau 15 avant les vacances d'hiver ! ».
    // `CLAUDE.md` : « objectif imposé à l'enfant — un objectif subi se fuit, un objectif qu'on
    // s'est donné se tient ».
    const { container } = renderApercu();
    expect(await screen.findByText(/3 jours cette semaine · objectif 4/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Atteins|Tu dois|Il faut que/i);
  });

  it("ne dit JAMAIS combien il en reste à faire", async () => {
    // `MotivationWeek` n'a aucun champ `remaining` — le type le dit : « rien ne peut se lire
    // comme une punition ». L'UI ne doit pas en fabriquer un par soustraction.
    const { container } = renderApercu();
    await screen.findByText(/3 jours cette semaine/);
    expect(container.textContent).not.toMatch(/il t'en reste|plus qu'|encore \d+ jours?\b/i);
  });

  it("propose de s'engager sans culpabiliser quand aucun objectif n'est pris", async () => {
    vi.mocked(fetchWeek).mockResolvedValue({ ...SEMAINE, goal_days: null, goal_met: false });
    const { container } = renderApercu();
    expect(await screen.findByText(/pas encore donné d'objectif/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /En choisir un/ })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/dommage|tu aurais dû|raté|oubli/i);
  });

  it("ne montre que les échéances DE CETTE MATIÈRE", async () => {
    renderApercu();
    expect(await screen.findByText("Contrôle sur la cellule")).toBeInTheDocument();
    // L'échéance d'anglais est servie par la même route et ne doit PAS fuiter ici.
    expect(screen.queryByText("Rendu d'exposé")).toBeNull();
  });

  it("n'affiche AUCUN arriéré — les échéances viennent de l'agenda, pas de ZETIS", async () => {
    // 🔴 TEST-VERROU. La maquette portait « Quiz : School vocabulary — 5 questions à revoir ».
    // C'est `due_count`, l'arriéré : la pression quotidienne que `CLAUDE.md` interdit. Le
    // résumé de révision servi par la fixture en annonce 42 — il ne doit apparaître nulle part.
    const { container } = renderApercu();
    await screen.findByText("Contrôle sur la cellule");
    expect(container.textContent).not.toContain("42");
    expect(container.textContent).not.toMatch(/questions? à revoir|en retard|arriéré/i);
  });

  it("la carte des échéances DISPARAÎT quand la matière n'en a aucune", async () => {
    // Un « à ne pas oublier » vide installerait l'idée qu'il devrait toujours y avoir quelque
    // chose à ne pas oublier.
    vi.mocked(fetchAgendaUpcoming).mockResolvedValue([ECHEANCES[1]]); // anglais seulement
    const { container } = renderApercu();
    await screen.findByRole("heading", { name: "SVT" });
    expect(container.textContent).not.toMatch(/Ce qui arrive en SVT/);
  });

  it("ouvre le chat depuis la matière où Massimo bloque", async () => {
    renderApercu();
    const lien = await screen.findByRole("link", { name: /Parler à ZETIS/ });
    expect(lien.getAttribute("href")).toBe("/chat");
  });
});


// --- « Reprendre » : une carte qui NOMME un contenu doit l'OUVRIR -------------------------

describe("MatiereDetailPage — reprendre son dernier contenu", () => {
  it("ouvre le cours SUR SA LEÇON, pas sur la liste", async () => {
    // 🔴 TEST-VERROU. Nommer « Mitose » puis atterrir sur la liste des cours serait la dette
    // « le libellé sur-promet », déjà consignée sur `capsule_id`. `?lesson=` met la leçon en
    // avant (lien profond de l'addendum ADR-0025 §15).
    renderApercu();
    fireEvent.click(await screen.findByRole("button", { name: /Mitose/ }));
    expect(navigateMock).toHaveBeenCalledWith("/subjects/svt/cours?lesson=3", undefined);
  });

  it("relance le quiz par son identifiant, jamais la grille", async () => {
    renderApercu();
    fireEvent.click(await screen.findByRole("button", { name: /Quiz cellule/ }));
    await waitFor(() => expect(fetchQuizById).toHaveBeenCalledWith(8));
  });

  it("n'affiche AUCUNE date ni durée", async () => {
    // Le serveur sert bien un `at`, et il ne doit pas être rendu : « il y a 6 jours » ferait de
    // cette carte un rappel de ce que Massimo n'a PAS fait — la lecture du temps que « Mon
    // ciel » évite déjà en n'ayant aucun axe.
    const { container } = renderApercu();
    await screen.findByRole("button", { name: /Mitose/ });
    expect(container.textContent).not.toMatch(/il y a|hier|2026-08|jours? ·|min\b/i);
  });

  it("la carte DISPARAÎT quand rien n'est réouvrable", async () => {
    // Un « Reprendre » vide installerait l'idée qu'il devrait toujours y avoir quelque chose
    // en cours.
    vi.mocked(fetchSubjectResume).mockResolvedValue({
      subject: { subject_id: 1, name: "SVT", slug: "svt" },
      items: [],
    });
    const { container } = renderApercu();
    await screen.findByRole("heading", { name: "SVT" });
    expect(container.textContent).not.toMatch(/Reprendre/);
  });

  it("une panne de la reprise n'emporte pas la page", async () => {
    vi.mocked(fetchSubjectResume).mockRejectedValue(new Error("panne"));
    renderApercu();
    expect(await screen.findByRole("heading", { name: "SVT" })).toBeInTheDocument();
  });
});
