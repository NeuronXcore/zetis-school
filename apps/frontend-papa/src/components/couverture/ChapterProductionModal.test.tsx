import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { type ProductionPreview } from "@zetis/types";

import { ChapterProductionModal } from "./ChapterProductionModal";
import { type UseChapterProduction } from "../../hooks/useChapterProduction";

function prod(preview: Partial<ProductionPreview> | null, extra: Partial<UseChapterProduction> = {}) {
  return {
    chapterId: 1,
    preview: preview
      ? {
          chapter_id: 1,
          eligible: [],
          blocked: [],
          pending_backlog: 0,
          max_pending: 30,
          ...preview,
        }
      : null,
    run: null,
    loading: false,
    busy: false,
    error: null,
    open: vi.fn(),
    close: vi.fn(),
    confirm: vi.fn(),
    ...extra,
  } as UseChapterProduction;
}

describe("ChapterProductionModal", () => {
  it("un chapitre tout bloqué dit que ce N'EST PAS une erreur", () => {
    // LE test de cette slice. L'addendum ADR-0031 désigne ce cas comme le plus facile à rater :
    // sur un chapitre neuf, rien n'est produit — si l'écran n'explique pas que c'est le gate du
    // §7 qui fonctionne, Papa lit un échec de production.
    render(
      <ChapterProductionModal
        prod={prod({
          eligible: [],
          blocked: [{ skill_id: 7, name: "Fractions", reason: "Cours à valider" }],
        })}
      />,
    );
    expect(screen.getByText(/ce n'est pas une erreur/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Équiper 0 notion/ })).toBeDisabled();
  });

  it("nomme les notions bloquées, jamais un compte nu", () => {
    // « 13 en attente » ne dit pas lesquelles, donc ne dit pas à Papa ce qu'il doit valider.
    render(
      <ChapterProductionModal
        prod={prod({
          eligible: [{ skill_id: 1, name: "Narrateur" }],
          blocked: [
            { skill_id: 7, name: "Fractions", reason: "Cours à valider" },
            { skill_id: 8, name: "Pourcentages", reason: "Cours à valider" },
          ],
        })}
      />,
    );
    expect(screen.getByText("Fractions")).toBeInTheDocument();
    expect(screen.getByText("Pourcentages")).toBeInTheDocument();
  });

  it("l'arriéré au plafond bloque le lancement, avec son chiffre", () => {
    render(
      <ChapterProductionModal
        prod={prod({
          eligible: [{ skill_id: 1, name: "Narrateur" }],
          pending_backlog: 30,
          max_pending: 30,
        })}
      />,
    );
    expect(screen.getByText(/30 contenus attendent déjà votre relecture/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Équiper 1 notion/ })).toBeDisabled();
  });

  it("dit que la pause est ENTRE deux notions, jamais au milieu d'une", () => {
    // Un appel LLM n'est pas préemptible : promettre une interruption immédiate serait un
    // mensonge d'architecture (ADR-0031 §3).
    render(
      <ChapterProductionModal
        prod={prod(
          { eligible: [{ skill_id: 1, name: "Narrateur" }] },
          {
            busy: true,
            run: {
              id: 1,
              status: "running",
              trigger: "manual",
              authorized_by: "parent_direct",
              chapter_id: 1,
              total_notions: 4,
              done_notions: 1,
              progress_pct: 25,
              created_at: "",
              finished_at: null,
            },
          },
        )}
      />,
    );
    expect(screen.getByText(/entre deux notions, jamais au milieu d'une/i)).toBeInTheDocument();
  });
});
