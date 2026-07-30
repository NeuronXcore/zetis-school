// Panneau d'actions d'une étoile (ADR-0024 §4).
//
// Règle ferme : on rend EXACTEMENT les actions renvoyées par le serveur, dans l'ordre reçu.
// Aucune n'est ajoutée, aucune n'est grisée, aucune règle de repli n'est inventée ici —
// une activité sans contenu validé n'est pas proposée du tout, jamais promise puis refusée.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { GalaxyAction, GalaxyNotion } from "@zetis/types";
import { starStyle } from "@zetis/ui/galaxy";
import { fetchQuizById } from "../../lib/quiz";
// Table d'habillage partagée (aussi utilisée par le menu de notion du chat) — module léger, pas
// de duplication. `GalaxyAction` reste importé pour le typage des actions rendues.
import { ACTION_UI } from "../../lib/notionActionUi";

export interface NotionActionPanelProps {
  notion: GalaxyNotion;
  onClose: () => void;
}

export function NotionActionPanel({ notion, onClose }: NotionActionPanelProps) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const style = starStyle(notion.status);

  async function go(action: GalaxyAction) {
    switch (action.kind) {
      case "cours":
        navigate(`/subjects/${notion.subject_slug}/cours`);
        return;
      case "eli5":
        // Seule surface réellement adressable PAR NOTION en URL aujourd'hui.
        navigate(
          `/eli5?skill_id=${notion.skill_id}&name=${encodeURIComponent(notion.name)}`,
        );
        return;
      case "fiche":
        navigate(`/fiches/${notion.subject_slug}`, { state: { name: notion.subject_name } });
        return;
      case "capsule":
        navigate("/capsules");
        return;
      case "mindmap":
        navigate(`/mindmaps/reconstruire/${action.mindmap_id}`);
        return;
      case "revision":
        navigate(`/revision?subject=${notion.subject_slug}`);
        return;
      case "quiz": {
        // `/quiz/session` attend le quiz COMPLET dans `location.state` (il n'est pas
        // adressable par id en URL) : on le charge avant de naviguer.
        if (!action.quiz_id) return;
        setBusy(true);
        try {
          const quiz = await fetchQuizById(action.quiz_id);
          navigate("/quiz/session", {
            state: {
              quiz,
              label: `${notion.subject_name} · ${notion.name}`,
              returnTo: "/progression",
            },
          });
        } catch {
          // Le quiz a disparu entre l'affichage et le clic : on retombe sur la liste,
          // sans message d'échec — ce n'est pas la faute de Massimo.
          navigate("/quiz");
        } finally {
          setBusy(false);
        }
        return;
      }
    }
  }

  return (
    <aside
      className="flex flex-col gap-1 rounded-2xl border border-zetis-border bg-zetis-surface p-5"
      aria-label={`Que faire avec « ${notion.name} »`}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-zetis-muted">
            {notion.chapter_title}
          </p>
          <h3 className="mt-1 text-lg font-bold leading-tight">{notion.name}</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="shrink-0 rounded-lg px-2 py-1 text-xl leading-none text-zetis-muted hover:text-zetis-text"
        >
          ×
        </button>
      </div>

      <span
        className="mt-2 inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold"
        style={{ borderColor: `${style.color}55`, color: style.color }}
      >
        <span
          aria-hidden
          className="inline-block rounded-full"
          style={{ width: 8, height: 8, backgroundColor: style.color }}
        />
        {style.label}
      </span>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
        {notion.actions.map((action, i) => {
          const ui = ACTION_UI[action.kind];
          // La première activité DISPONIBLE porte l'accent : une action mise en avant doit
          // pouvoir être faite.
          const isPrimary =
            action.available &&
            notion.actions.findIndex((a) => a.available) === i;
          return (
            <button
              key={action.kind}
              type="button"
              disabled={busy || !action.available}
              // Le titre dit ce qui manque sans jamais dire que Massimo a raté quelque chose.
              title={action.available ? undefined : "Pas encore créé"}
              onClick={() => void go(action)}
              className={
                "flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold transition " +
                (!action.available
                  ? "cursor-default border border-dashed border-zetis-border bg-transparent text-zetis-muted opacity-60"
                  : isPrimary
                    ? "cursor-pointer bg-gradient-to-br from-zetis-accent to-zetis-accent-2 text-white"
                    : "cursor-pointer border border-zetis-border bg-zetis-surface-2 hover:border-zetis-accent-2")
              }
            >
              <span aria-hidden className={"text-lg " + (action.available ? "" : "grayscale")}>
                {ui.icon}
              </span>
              <span className="flex-1">{ui.label}</span>
              {!action.available && (
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider">
                  bientôt
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-zetis-muted">
        Ce qui est grisé n'existe pas encore pour cette notion.
      </p>
    </aside>
  );
}
