import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ConseilClasseIAPage } from "./ConseilClasseIAPage";
import type { CouncilReport, CouncilSubject } from "../lib/councilClass";

// Lien profond du dashboard vers le Conseil de classe (ADR-0028 §7).
//
// Ce fichier existe pour UN bug précis, constaté le 2026-08-05 : la page portait sa propre table
// de libellés de période, typée `Record<string, string>`. Ce type accepte n'importe quelle clé —
// l'ajout de la fenêtre « Année » au dashboard n'a donc rien pu y casser, et `?period=365` tombait
// dans le repli « Trimestre 1 ». Le Conseil annonçait un trimestre pendant que Papa regardait
// l'année : exactement ce que le transport de la période était censé empêcher.
//
// La table vit désormais dans `lib/dashboardDerive`, typée par `DashboardPeriod`. Retirer une
// fenêtre fait tomber `tsc` ; ce test-ci couvre l'autre moitié — le bout en bout, là où le bug se
// voyait. C'est le seul qui attrape la combinaison « type élargi ailleurs, page pas mise à jour ».

// Le rapport est mutable pour que chaque test pose le sien ; `null` par défaut, ce qui préserve
// exactement le comportement attendu par les trois tests de période ci-dessous.
const etat = vi.hoisted(() => ({ report: null as unknown }));

vi.mock("../hooks/useCouncilClass", () => ({
  useCouncilClass: () => ({
    loading: false,
    error: null,
    report: etat.report,
    history: [],
    subjects: [],
    generating: false,
    equipping: null,
    equipResults: [],
    generatedSkillIds: [],
    created: null,
    championSuggestion: null,
    hasActiveChampion: false,
    generate: vi.fn(),
    openReport: vi.fn(),
    equipAndCreateMissions: vi.fn(),
    equipAndCreateChampion: vi.fn(),
    dismissCreated: vi.fn(),
  }),
}));

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ConseilClasseIAPage />
    </MemoryRouter>,
  );
}

function rapport(
  recentEvolution: CouncilSubject["recent_evolution"],
  promptVersion: string,
): CouncilReport {
  return {
    id: 1,
    period: "Trimestre 1",
    subject_id: null,
    subject_name: null,
    global_summary: "Synthèse.",
    prompt_version: promptVersion,
    created_at: null,
    subjects: [
      {
        subject_id: 7,
        subject_name: "Mathématiques",
        strengths: "",
        to_reinforce: "",
        recent_evolution: recentEvolution,
        recommendations: [],
      },
    ],
  };
}

beforeEach(() => {
  etat.report = null;
});

// ADR-0040 §8.4 — l'absence de bascule s'ÉCRIT, et la prose des rapports antérieurs au prompt v3
// se lit sous une marque. Le champ était un `str` non-nullable : le modèle remplissait par
// obligation de type, et la phrase était figée. On ne réécrit rien, on signale.
describe("ConseilClasseIAPage — évolution récente, absence et marque de lecture", () => {
  it("écrit l'absence plutôt que de masquer la section", () => {
    etat.report = rapport(null, "v3");
    renderAt("/conseil");

    expect(screen.getByText(/absence de trace, pas absence de mouvement/i)).toBeInTheDocument();
  });

  it("marque la prose d'un rapport figé antérieur à v3, sans la réécrire", () => {
    etat.report = rapport("Nette progression depuis trois semaines.", "v2");
    renderAt("/conseil");

    expect(screen.getByText(/Nette progression depuis trois semaines\./)).toBeInTheDocument();
    expect(screen.getByText(/évolution rédigée sans historique daté/i)).toBeInTheDocument();
  });

  it("ne marque PAS un rapport v3 — sinon la marque ne s'éteindrait jamais", () => {
    etat.report = rapport("Trois bascules ce mois-ci.", "v3");
    renderAt("/conseil");

    expect(screen.getByText(/Trois bascules ce mois-ci\./)).toBeInTheDocument();
    expect(screen.queryByText(/évolution rédigée sans historique daté/i)).toBeNull();
  });
});

// Lot 3 (ADR-0040 §8) — la narration porte des bascules DATÉES et mesurées.
describe("ConseilClasseIAPage — les bascules datées", () => {
  const DATEE = {
    since: "2026-07-10",
    transitions: [
      {
        skill_id: 1,
        skill_name: "Théorème de Pythagore",
        from: "learning",
        to: "solid",
        changed_at: "2026-07-28",
      },
      {
        skill_id: 1,
        skill_name: "Théorème de Pythagore",
        from: null,
        to: "weak",
        changed_at: "2026-07-10",
      },
    ],
    comment: "Une remontée nette sur la trace disponible depuis le 10/07.",
  };

  it("nomme et date chaque bascule, et annonce la borne de trace", () => {
    etat.report = rapport(DATEE, "v4");
    renderAt("/conseil");

    expect(screen.getByText(/2 bascules de palier sur la trace disponible depuis le 2026-07-10/)).toBeInTheDocument();
    expect(screen.getByText("2026-07-28")).toBeInTheDocument();
    expect(screen.getByText("2026-07-10")).toBeInTheDocument();
    expect(screen.getByText(/en apprentissage → solide/)).toBeInTheDocument();
    // La plus ancienne bascule n'a pas de palier de départ : on le DIT, on ne l'invente pas.
    expect(screen.getByText(/première bascule tracée → à renforcer/)).toBeInTheDocument();
    expect(screen.getByText(/Une remontée nette/)).toBeInTheDocument();
  });

  it("🔴 rend les bascules MÊME quand le modèle n'a rien commenté", () => {
    // Elles sont la MESURE ; le commentaire n'en est que la lecture. Les masquer ferait dépendre
    // une donnée serveur du bon vouloir d'un LLM — l'inversion exacte que ce chantier corrige.
    etat.report = rapport({ ...DATEE, comment: null }, "v4");
    renderAt("/conseil");

    expect(screen.getByText(/2 bascules de palier/)).toBeInTheDocument();
    // DEUX lignes pour la même notion : une notion qui bascule deux fois a deux bascules, et les
    // dédoublonner par nom perdrait la moitié de l'histoire.
    expect(screen.getAllByText("Théorème de Pythagore")).toHaveLength(2);
    expect(screen.queryByText(/Une remontée nette/)).toBeNull();
  });

  it("ne marque JAMAIS un rapport daté « rédigé sans historique »", () => {
    etat.report = rapport(DATEE, "v4");
    renderAt("/conseil");

    expect(screen.queryByText(/évolution rédigée sans historique daté/i)).toBeNull();
  });

  it("un rapport v2 figé reste lisible à côté du nouveau format", () => {
    // Anti-régression du §8 : aucune réécriture des rapports figés. La structure et la chaîne
    // cohabitent, et c'est le TYPE qui les distingue — pas une devinette sur le contenu.
    etat.report = rapport("Prose d'avant, adossée à rien.", "v2");
    renderAt("/conseil");

    expect(screen.getByText(/Prose d'avant/)).toBeInTheDocument();
    expect(screen.getByText(/évolution rédigée sans historique daté/i)).toBeInTheDocument();
    expect(screen.queryByText(/bascules? de palier sur la trace/)).toBeNull();
  });
});

describe("ConseilClasseIAPage — période venue du lien profond", () => {
  it("présélectionne « Année scolaire » quand le dashboard était sur l'année", () => {
    renderAt("/conseil?subject=svt&period=365");

    expect(screen.getByLabelText("Période")).toHaveValue("Année scolaire");
  });

  it("présélectionne les trois fenêtres plus courtes", () => {
    for (const [param, libellé] of [
      ["7", "7 derniers jours"],
      ["30", "30 derniers jours"],
      ["90", "Trimestre"],
    ] as const) {
      const { unmount } = renderAt(`/conseil?period=${param}`);
      expect(screen.getByLabelText("Période")).toHaveValue(libellé);
      unmount();
    }
  });

  it("retombe sur le défaut pour une période absente ou aberrante", () => {
    // Le repli reste le bon comportement pour une entrée invalide — il était seulement le mauvais
    // pour une fenêtre légitime.
    for (const url of ["/conseil", "/conseil?period=banane"]) {
      const { unmount } = renderAt(url);
      expect(screen.getByLabelText("Période")).toHaveValue("Trimestre 1");
      unmount();
    }
  });
});
