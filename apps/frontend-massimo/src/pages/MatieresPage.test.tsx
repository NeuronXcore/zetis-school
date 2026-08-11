import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { AgendaUpcomingItem, GalaxyOverview, MotivationWeek } from "@zetis/types";
import { MatieresPage } from "./MatieresPage";

vi.mock("../lib/gamification", () => ({ fetchGamificationSummary: vi.fn() }));
vi.mock("../lib/galaxy", () => ({ fetchGalaxyOverview: vi.fn() }));
vi.mock("../lib/motivation", () => ({ fetchWeek: vi.fn(), updateWeekGoal: vi.fn() }));
vi.mock("../lib/agenda", () => ({ fetchAgendaUpcoming: vi.fn() }));

import { fetchAgendaUpcoming } from "../lib/agenda";
import { fetchGalaxyOverview } from "../lib/galaxy";
import { fetchGamificationSummary } from "../lib/gamification";
import { fetchWeek } from "../lib/motivation";

// ⚠️ Dans l'ordre du PROGRAMME, et volontairement À CONTRE-COURANT des nombres : Français est
// premier au programme avec le MOINS d'XP, SVT dernière avec le plus. C'est ce qui rend le
// test-verrou d'ordre capable de voir un tri.
const OVERVIEW: GalaxyOverview = {
  subjects: [
    {
      subject_id: 1,
      name: "Français",
      slug: "francais",
      lit: 2,
      total: 40,
      mastered: 0,
      xp: { total: 30, level: 1, into_level: 30, for_next: 100 },
    },
    {
      subject_id: 2,
      name: "SVT",
      slug: "svt",
      lit: 15,
      total: 51,
      mastered: 4,
      xp: { total: 640, level: 7, into_level: 40, for_next: 100 },
    },
  ],
};

const SEMAINE: MotivationWeek = {
  week_start: "2026-08-10",
  days: [],
  days_done: 3,
  today_done: true,
  goal_days: 4,
  goal_met: false,
};

const ECHEANCES: AgendaUpcomingItem[] = [
  {
    id: 1,
    label: "Contrôle sur la cellule",
    subject: { id: 2, slug: "svt", name: "SVT", color: null },
    due_on: "2026-08-14",
    days_left: 3,
    has_plan: false,
  },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <MatieresPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(fetchGamificationSummary)
    .mockReset()
    .mockResolvedValue({
      total_xp: 1257,
      level: 13,
      xp_into_level: 57,
      xp_for_next: 100,
      regularity: SEMAINE,
      badges: [],
      recent: [],
    });
  vi.mocked(fetchGalaxyOverview).mockReset().mockResolvedValue(OVERVIEW);
  vi.mocked(fetchWeek).mockReset().mockResolvedValue(SEMAINE);
  vi.mocked(fetchAgendaUpcoming).mockReset().mockResolvedValue(ECHEANCES);
});

describe("MatieresPage — ce que la grille ne dit JAMAIS", () => {
  it("n'affiche AUCUN pourcentage et AUCUN score de maîtrise", async () => {
    // 🔴 La version mockée affichait « 62 % du chapitre » sur chaque tuile. L'ADR-0024 §5 :
    // « aucun score par matière, aucun pourcentage ». Cet interdit n'a PAS été levé.
    const { container } = renderPage();
    await screen.findByText("640 XP");
    expect(container.textContent).not.toMatch(/%|mastery|score|du chapitre/i);
  });

  it("ne désigne aucune « meilleure matière »", async () => {
    // 🔴 La version mockée portait une tuile « Meilleure matière ». C'est un CLASSEMENT, que le
    // §5 interdit nommément : la page « ne met pas ses matières en concurrence ».
    const { container } = renderPage();
    await screen.findByText("640 XP");
    expect(container.textContent).not.toMatch(/meilleure|classement|podium|1ère|première mati/i);
  });

  it("n'affiche aucun verdict sur une matière", async () => {
    // `CLAUDE.md` tient les diagnostics parentaux hors de l'écran de l'enfant. Le wireframe
    // portait « Risque DNB », « Lacunes 5e » et « Points critiques » : tous refusés.
    const { container } = renderPage();
    await screen.findByText("640 XP");
    expect(container.textContent).not.toMatch(/risque|lacune|critique|à renforcer|retard|faible/i);
  });

  it("ne rend NI barre NI « 0 XP » sur une matière pas encore ouverte", async () => {
    // Vu à l'écran le 2026-08-11 sur Espagnol : une barre vide surmontant un « 0 XP » écrit se
    // lit comme un score nul. Une matière pas encore ouverte n'est pas une matière ratée.
    vi.mocked(fetchGalaxyOverview).mockResolvedValue({
      subjects: [
        {
          ...OVERVIEW.subjects[0],
          lit: 0,
          mastered: 0,
          xp: { total: 0, level: 1, into_level: 0, for_next: 100 },
        },
      ],
    });
    const { container } = renderPage();
    await screen.findByText("À découvrir");
    expect(container.textContent).not.toMatch(/0 XP/);
  });

  it("ne rend pas « 0 notion » sur une matière pas encore ouverte", async () => {
    // Un zéro est un reproche déguisé ; « À découvrir » est une invitation.
    vi.mocked(fetchGalaxyOverview).mockResolvedValue({
      subjects: [{ ...OVERVIEW.subjects[0], lit: 0, mastered: 0 }],
    });
    const { container } = renderPage();
    expect(await screen.findByText("À découvrir")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/0 notion/);
  });
});

describe("MatieresPage — ce qu'elle annonce", () => {
  it("affiche le XP et le niveau de CHAQUE matière", async () => {
    renderPage();
    expect(await screen.findByText("Niveau 7")).toBeInTheDocument();
    expect(screen.getByText("640 XP")).toBeInTheDocument();
    expect(screen.getByText("30 XP")).toBeInTheDocument();
  });

  it("compte les notions travaillées, JAMAIS un « sur N »", async () => {
    // `total` (51) est servi par la route mais ne doit pas atteindre l'écran : « 15 sur 51 »
    // désignerait les 36 restantes comme un retard.
    const { container } = renderPage();
    expect(await screen.findByText(/15 notions travaillées/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/sur 51|\/ ?51/);
  });

  it("🔴 garde l'ORDRE DU PROGRAMME, même quand les nombres disent l'inverse", async () => {
    // TEST-VERROU exigé par l'addendum ADR-0024 §1. Français est premier au programme avec
    // 30 XP, SVT dernière avec 640 : un tri par XP les inverserait. Le serveur sert l'ordre,
    // le client ne le retouche pas.
    renderPage();
    await screen.findByText("640 XP");
    // On repère les tuiles par leur XP, unique à chacune — « SVT » apparaît aussi dans le rail.
    const noms = screen.getAllByRole("link").map((a) => a.textContent ?? "");
    const francais = noms.findIndex((t) => t.includes("30 XP"));
    const svt = noms.findIndex((t) => t.includes("640 XP"));
    expect(francais).toBeGreaterThanOrEqual(0);
    expect(francais).toBeLessThan(svt);
  });

  it("chaque matière ouvre SA page", async () => {
    renderPage();
    // ⚠️ On attend « 640 XP » et pas un lien : « Voir ma galaxie » est rendu AVANT les
    // matières, donc `findAllByRole("link")` se résoudrait sur lui et le test courrait à vide.
    await screen.findByText("640 XP");
    const svt = screen.getAllByRole("link").find((a) => a.textContent?.includes("640 XP"));
    expect(svt?.getAttribute("href")).toBe("/subjects/svt");
  });

  it("une panne totale se dit doucement, jamais par un code HTTP", async () => {
    vi.mocked(fetchGamificationSummary).mockRejectedValue(new Error("500 Internal Server Error"));
    vi.mocked(fetchGalaxyOverview).mockRejectedValue(new Error("500 Internal Server Error"));
    const { container } = renderPage();
    expect(await screen.findByText(/Réessaie dans un moment/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/500|Internal|Error/);
  });

  it("la liste des matières survit à une gamification en panne", async () => {
    vi.mocked(fetchGamificationSummary).mockRejectedValue(new Error("panne"));
    renderPage();
    expect(await screen.findByText("640 XP")).toBeInTheDocument();
  });
});
