import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { DashboardSubject, SubjectAnalysis } from "@zetis/types";

vi.mock("../../lib/subjectAnalysis", () => ({ fetchSubjectAnalysis: vi.fn() }));
import { fetchSubjectAnalysis } from "../../lib/subjectAnalysis";

import { SubjectAnalysisPanel } from "./SubjectAnalysisPanel";

// Panneau d'analyse d'une matière (addendum ADR-0028, 2026-08-05).
//
// Ce que ces tests protègent, dans l'ordre d'importance :
//   1. les notions sont NOMMÉES — c'est la seule raison d'être du panneau ;
//   2. fragiles et lacunes ne fusionnent JAMAIS sous un total unique ;
//   3. les chiffres déjà servis par l'agrégat viennent de la MÉMOIRE, pas du réseau ;
//   4. changer de matière ne laisse pas les notions de la précédente sous le nouveau titre.

function subject(overrides: Partial<DashboardSubject> = {}): DashboardSubject {
  const zeros = () => Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => 0));
  return {
    id: 1,
    slug: "svt",
    name: "SVT",
    color: "#34d399",
    minutes: { "7": 65, "30": 120, "90": 300, "365": 900 },
    calendar: [],
    slots: { "7": zeros(), "30": zeros(), "90": zeros(), "365": zeros() },
    slots_outside_minutes: { "7": 0, "30": 0, "90": 0, "365": 0 },
    notions: { consolidated: 4, fragile: 3, in_progress: 2, total: 20 },
    series: {
      "7": { covered: [], consolidated: [], fragile: [], in_progress: [], gained: [], lost: [], reviews: { again: [], hard: [], good: [], easy: [] } },
      "30": { covered: [], consolidated: [], fragile: [], in_progress: [], gained: [], lost: [], reviews: { again: [], hard: [], good: [], easy: [] } },
      "90": { covered: [], consolidated: [], fragile: [], in_progress: [], gained: [], lost: [], reviews: { again: [], hard: [], good: [], easy: [] } },
      "365": { covered: [], consolidated: [], fragile: [], in_progress: [], gained: [], lost: [], reviews: { again: [], hard: [], good: [], easy: [] } },
    },
    review_load: [2, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    gaps_open: 1,
    has_referentiel: true,
    ...overrides,
  };
}

function notion(overrides: Partial<SubjectAnalysis["to_reinforce"][0]> = {}) {
  return {
    skill_id: 1,
    skill_name: "Photosynthèse",
    is_fragile: true,
    has_open_gap: false,
    severity: null,
    gap_status: null,
    first_detected_at: null,
    mastery_status: "weak",
    mastery_score: 40,
    weak_quiz_signal: null,
    last_seen_at: null,
    has_active_mission: false,
    ...overrides,
  } as SubjectAnalysis["to_reinforce"][0];
}

function analysis(overrides: Partial<SubjectAnalysis> = {}): SubjectAnalysis {
  return {
    subject_id: 1,
    slug: "svt",
    name: "SVT",
    generated_at: "2026-08-05T08:00:00+02:00",
    to_reinforce: [notion()],
    fragile_count: 1,
    open_gap_count: 0,
    without_mission_count: 1,
    in_progress: {
      missions: [],
      pending_content: 0,
      stale_content: 0,
      review_overdue: 0,
      review_max_overdue_days: 0,
    },
    referentiel: {
      has_referentiel: true,
      lessons: 10,
      lessons_validated: 7,
      courses_written: 7,
      derivatives_percent: 60,
    },
    ...overrides,
  };
}

function renderPanel(props: Partial<Parameters<typeof SubjectAnalysisPanel>[0]> = {}) {
  return render(
    <MemoryRouter>
      <SubjectAnalysisPanel subject={subject()} period="7" onClose={vi.fn()} {...props} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(fetchSubjectAnalysis).mockResolvedValue(analysis());
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("SubjectAnalysisPanel", () => {
  it("NOMME les notions, il ne les compte pas seulement", async () => {
    // La raison d'être du panneau. L'agrégat sait déjà dire « 3 notions à renforcer » ; lui seul
    // peut dire lesquelles.
    vi.mocked(fetchSubjectAnalysis).mockResolvedValue(
      analysis({
        to_reinforce: [
          notion({ skill_id: 1, skill_name: "Photosynthèse" }),
          notion({ skill_id: 2, skill_name: "Respiration cellulaire" }),
        ],
        fragile_count: 2,
        without_mission_count: 2,
      }),
    );
    renderPanel();

    expect(await screen.findByText("Photosynthèse")).toBeInTheDocument();
    expect(screen.getByText("Respiration cellulaire")).toBeInTheDocument();
  });

  it("ne fusionne JAMAIS fragiles et lacunes en un total unique", async () => {
    // Trois notions, dont une qui est les deux à la fois : 2 fragiles + 2 lacunes ≠ 3 lignes.
    // Afficher « 4 » serait faux, afficher « 3 à renforcer » sans distinguer le serait aussi.
    vi.mocked(fetchSubjectAnalysis).mockResolvedValue(
      analysis({
        to_reinforce: [
          notion({ skill_id: 1, is_fragile: true, has_open_gap: false }),
          notion({ skill_id: 2, skill_name: "B", is_fragile: false, has_open_gap: true, severity: "high" }),
          notion({ skill_id: 3, skill_name: "C", is_fragile: true, has_open_gap: true, severity: "low" }),
        ],
        fragile_count: 2,
        open_gap_count: 2,
        without_mission_count: 3,
      }),
    );
    const { container } = renderPanel();
    await screen.findByText("Photosynthèse");

    const texte = container.textContent ?? "";
    expect(texte).toContain("2 fragiles");
    expect(texte).toContain("2 lacunes ouvertes");
    expect(texte).not.toContain("4 notions");
  });

  it("prend les chiffres DÉJÀ servis par l'agrégat dans la mémoire, pas dans la réponse réseau", async () => {
    // Le piège que la règle du §2 ferme. Si le panneau lisait ces chiffres depuis `analysis`, il
    // pourrait afficher autre chose que la bulle située juste au-dessus de lui.
    // Des nombres DISTINCTIFS des deux côtés, pour qu'aucune assertion ne puisse passer par
    // hasard sur un chiffre voisin de la page.
    vi.mocked(fetchSubjectAnalysis).mockResolvedValue(
      analysis({
        in_progress: {
          missions: [],
          pending_content: 0,
          stale_content: 0,
          review_overdue: 41, // réseau — NE doit PAS servir la charge à venir
          review_max_overdue_days: 9,
        },
      }),
    );
    const { container } = renderPanel({
      subject: subject({
        notions: { consolidated: 6, fragile: 3, in_progress: 2, total: 23 },
        minutes: { "7": 137, "30": 200, "90": 300, "365": 900 },
        review_load: [9, 0, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // somme = 19
      }),
    });
    await screen.findByText("Photosynthèse");

    const texte = container.textContent ?? "";
    expect(texte).toContain("6 / 23"); // notions : depuis `subject`
    expect(texte).toContain("2h17"); // 137 min sur la période : depuis `subject.minutes`
    // ⚠️ 19 et non 17 : « 17 » était une SOUS-CHAÎNE de « 2h17 », et l'assertion passait donc
    // même quand la charge à venir était lue depuis le réseau. Démasqué par sabotage.
    expect(texte).toContain("19"); // charge à venir : somme de `subject.review_load`
    expect(texte).toContain("41"); // retard : depuis le réseau — les deux nombres coexistent
  });

  it("sépare le RETARD de révision de la charge à venir", async () => {
    vi.mocked(fetchSubjectAnalysis).mockResolvedValue(
      analysis({
        in_progress: {
          missions: [],
          pending_content: 0,
          stale_content: 0,
          review_overdue: 12,
          review_max_overdue_days: 9,
        },
      }),
    );
    const { container } = renderPanel();
    await screen.findByText("Photosynthèse");

    // 12 vient du réseau (retard), 3 de la mémoire (charge à venir). Deux libellés, deux nombres.
    expect(container.textContent).toContain("en retard");
    expect(container.textContent).toContain("12");
    expect(container.textContent).toContain("d'ici 14 jours");
  });

  it("montre les missions qui couvrent déjà, MÊME non validées", async () => {
    vi.mocked(fetchSubjectAnalysis).mockResolvedValue(
      analysis({
        to_reinforce: [notion({ has_active_mission: true })],
        without_mission_count: 0,
        in_progress: {
          missions: [
            {
              id: 7,
              title: "Consolider la photosynthèse",
              mission_type: "remediation",
              status: "planned",
              validation_status: "pending",
              skill_id: 1,
              skill_name: "Photosynthèse",
            },
          ],
          pending_content: 0,
          stale_content: 0,
          review_overdue: 0,
          review_max_overdue_days: 0,
        },
      }),
    );
    renderPanel();

    expect(await screen.findByText(/Consolider la photosynthèse/)).toBeInTheDocument();
    expect(screen.getByText("déjà couverte")).toBeInTheDocument();
    expect(screen.getByText("à valider")).toBeInTheDocument();
  });

  it("ne laisse PAS les notions de la matière précédente sous le nouveau titre", async () => {
    // Le correctif sur `DayDetailPanel`, qui garde son détail pendant le chargement suivant.
    // Toléré pour des minutes ; ici les notions sont NOMMÉES.
    const { rerender } = renderPanel();
    expect(await screen.findByText("Photosynthèse")).toBeInTheDocument();

    let resoudre: (v: SubjectAnalysis) => void = () => {};
    vi.mocked(fetchSubjectAnalysis).mockReturnValue(
      new Promise<SubjectAnalysis>((r) => {
        resoudre = r;
      }),
    );
    rerender(
      <MemoryRouter>
        <SubjectAnalysisPanel
          subject={subject({ id: 2, slug: "mathematiques", name: "Mathématiques" })}
          period="7"
          onClose={vi.fn()}
        />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText("Analyse en cours…")).toBeInTheDocument());
    expect(screen.queryByText("Photosynthèse")).toBeNull();
    resoudre(analysis({ to_reinforce: [notion({ skill_name: "Fractions" })] }));
  });

  it("JETTE une réponse en retard : la matière d'avant ne peut pas écraser la nouvelle", async () => {
    // La garde d'annulation. Sans elle, cliquer vite A puis B affiche B, puis A quand sa réponse
    // arrive — les notions d'une matière sous le titre d'une autre, sans rien pour l'expliquer.
    let resoudreA: (v: SubjectAnalysis) => void = () => {};
    vi.mocked(fetchSubjectAnalysis).mockReturnValueOnce(
      new Promise<SubjectAnalysis>((r) => {
        resoudreA = r;
      }),
    );
    const { rerender } = renderPanel();

    vi.mocked(fetchSubjectAnalysis).mockResolvedValue(
      analysis({ to_reinforce: [notion({ skill_id: 9, skill_name: "Fractions" })] }),
    );
    rerender(
      <MemoryRouter>
        <SubjectAnalysisPanel
          subject={subject({ id: 2, slug: "mathematiques", name: "Mathématiques" })}
          period="7"
          onClose={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Fractions")).toBeInTheDocument();

    // La réponse de la PREMIÈRE matière arrive maintenant. Elle doit être jetée.
    resoudreA(analysis({ to_reinforce: [notion({ skill_name: "Photosynthèse" })] }));

    await waitFor(() => expect(screen.getByText("Fractions")).toBeInTheDocument());
    expect(screen.queryByText("Photosynthèse")).toBeNull();
  });

  it("garde le panneau OUVERT en cas d'erreur, avec de quoi réessayer", async () => {
    vi.mocked(fetchSubjectAnalysis).mockRejectedValue(new Error("Erreur 500"));
    renderPanel();

    expect(await screen.findByText(/Erreur 500/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeInTheDocument();
    // Le titre est toujours là : refermer ferait disparaître le résultat du geste sans explication.
    expect(screen.getByText("SVT")).toBeInTheDocument();
  });

  it("REGROUPE les missions du même intitulé au lieu de les répéter", async () => {
    // Constaté à l'écran le 2026-08-05 : 15 lignes sur une matière, dont « Travailler : Narrateur »
    // trois fois. Le bloc « Déjà en cours » écrasait le reste du panneau.
    const mission = (id: number, title: string, validation_status = "validated") => ({
      id,
      title,
      mission_type: "manual",
      status: "planned" as const,
      validation_status,
      skill_id: null,
      skill_name: null,
    });
    vi.mocked(fetchSubjectAnalysis).mockResolvedValue(
      analysis({
        in_progress: {
          missions: [
            mission(1, "Travailler : Narrateur"),
            mission(2, "Travailler : Narrateur"),
            mission(3, "Travailler : Narrateur"),
            mission(4, "Progresser : Schéma narratif"),
          ],
          pending_content: 0,
          stale_content: 0,
          review_overdue: 0,
          review_max_overdue_days: 0,
        },
      }),
    );
    const { container } = renderPanel();
    await screen.findByText("Photosynthèse");

    // Deux INTITULÉS, pas quatre lignes — mais le total reste exact et affiché.
    expect(screen.getAllByText(/Travailler : Narrateur/)).toHaveLength(1);
    expect(container.textContent).toContain("×3");
    expect(container.textContent).toContain("4 missions en cours");
  });

  it("ANNONCE ce qu'elle ne montre pas quand il y a trop d'intitulés", async () => {
    // Une liste tronquée sans le dire se lit comme une liste complète.
    vi.mocked(fetchSubjectAnalysis).mockResolvedValue(
      analysis({
        in_progress: {
          missions: Array.from({ length: 8 }, (_, i) => ({
            id: i,
            title: `Mission ${i}`,
            mission_type: "manual",
            status: "planned" as const,
            validation_status: "validated",
            skill_id: null,
            skill_name: null,
          })),
          pending_content: 0,
          stale_content: 0,
          review_overdue: 0,
          review_max_overdue_days: 0,
        },
      }),
    );
    const { container } = renderPanel();
    await screen.findByText("Photosynthèse");

    expect(container.textContent).toContain("et 3 autres intitulés");
  });

  it("ne génère RIEN avant confirmation, et n'appelle qu'une fois", async () => {
    const onGenerate = vi.fn();
    renderPanel({ onGenerate });
    await screen.findByText("Photosynthèse");

    fireEvent.click(screen.getByRole("button", { name: /Demander une synthèse écrite/ }));
    expect(onGenerate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Demander la synthèse" }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it("pendant la génération, le bouton disparaît au profit de la barre", async () => {
    renderPanel({ onGenerate: vi.fn(), generating: true });
    await screen.findByText("Photosynthèse");

    expect(screen.queryByRole("button", { name: /Demander une synthèse/ })).toBeNull();
    expect(screen.getByText(/Le conseil analyse SVT/)).toBeInTheDocument();
  });

  it("la barre est calibrée sur le cas NORMAL, pas sur le pire", async () => {
    // ⚠️ Le pourcentage est vérifié à un instant précis, et c'est le seul moyen d'attraper une
    // estimation mal calibrée : rallonger `GEN_MS` à 4 min ferait ramper la barre à 8 % au bout
    // de 9 s — techniquement « une barre qui monte », concrètement un écran qui semble figé
    // pendant l'attente habituelle. Démasqué par sabotage : sans cette assertion, le test du
    // seuil long restait vert.
    vi.useFakeTimers();
    try {
      const { container } = renderPanel({ onGenerate: vi.fn(), generating: true });
      await vi.advanceTimersByTimeAsync(9000); // la moitié de l'estimation
      const pct = Number(/(\d+)%/.exec(container.textContent ?? "")?.[1] ?? 0);
      expect(pct).toBeGreaterThan(50);
    } finally {
      vi.useRealTimers();
    }
  });

  it("au-delà du seuil, le LIBELLÉ reprend la parole — la barre reste muette à 95 %", async () => {
    vi.useFakeTimers();
    try {
      renderPanel({ onGenerate: vi.fn(), generating: true });
      await vi.advanceTimersByTimeAsync(46000);
      expect(screen.getByText(/Plus long que d'habitude/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("une synthèse en cours AILLEURS désarme le bouton et le dit", async () => {
    // L'état du run vit dans la CARTE : changer de bulle ne doit pas réarmer le bouton pendant
    // qu'un appel tourne — sinon deux rapports pour une matière.
    renderPanel({ onGenerate: vi.fn(), generatingElsewhere: "Mathématiques" });
    await screen.findByText("Photosynthèse");

    expect(screen.getByRole("button", { name: /Demander une synthèse écrite/ })).toBeDisabled();
    expect(screen.getByText(/synthèse sur Mathématiques est déjà en cours/)).toBeInTheDocument();
  });

  it("affiche la synthèse SUR PLACE, sans naviguer", async () => {
    // Après quatre minutes, Papa n'est plus dans la même pensée : une navigation automatique
    // différée serait une éjection.
    renderPanel({
      onGenerate: vi.fn(),
      generated: { id: 12, text: "Les temps du récit restent fragiles." },
    });
    await screen.findByText("Photosynthèse");

    expect(screen.getByText("Les temps du récit restent fragiles.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ouvrir le conseil de classe/ })).toHaveAttribute(
      "href",
      "/conseil",
    );
  });

  it("n'est PAS une modale", async () => {
    // Patron `DayDetailPanel` : un dépliage dans le flux. Le poser sur une coquille de modale
    // ajouterait une onzième copie sans focus trap au dépôt, pour masquer le cockpit qu'on vient
    // justement de filtrer.
    renderPanel();
    await screen.findByText("Photosynthèse");

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
