import { type AgendaItemStudent } from "@zetis/types";
import { subjectIconFor } from "../../lib/subjectIcons";
import { originLabel, shortDayLabel } from "../../lib/agendaSections";

// Un item de l'agenda de Massimo.
//
// La coche est **toujours actionnable**, sur tous les items — y compris ceux ajoutés par Papa.
// C'est le seul geste qui rend l'objet sien, et sans lui l'objet n'aurait aucun état (Papa est
// en 403 sur `done_at`). Cocher ne crédite AUCUN XP et ne déclenche aucune célébration : le
// geste est déclaratif, il ne se récompense pas — sinon Massimo apprend à cocher.
//
// **Aucune affordance d'édition** : en phase 0 aucun item ne lui appartient, et le serveur
// répondrait 403. Montrer un bouton qui échoue serait pire que de ne rien montrer.

interface Props {
  item: AgendaItemStudent;
  /** Affiche la date à droite (sections « plus tard » et « à reprendre »). */
  showDate?: boolean;
  /** Ambre doux — jamais rouge, jamais « en retard ». */
  tone?: "normal" | "resume";
  onToggle: () => void;
  onDismiss: () => void;
}

export function AgendaItemRow({
  item,
  showDate = false,
  tone = "normal",
  onToggle,
  onDismiss,
}: Props) {
  const origin = originLabel(item);
  return (
    <div
      id={`agenda-item-${item.id}`}
      style={{ borderLeftColor: item.subject?.color ?? undefined }}
      className={`flex items-start gap-3 rounded-2xl border border-l-2 p-3 transition-colors ${
        tone === "resume"
          ? "border-amber-400/25 bg-amber-400/5"
          : "border-zetis-border bg-zetis-surface"
      } ${item.done ? "opacity-55" : ""} ${item.subject?.color ? "" : "border-l-zetis-border"}`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={item.done}
        aria-label={item.done ? "Décocher" : "Marquer comme fait"}
        // `motion-reduce:transition-none` : `prefers-reduced-motion` est non négociable.
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs transition-colors motion-reduce:transition-none ${
          item.done
            ? "border-emerald-400/70 bg-emerald-400/20 text-emerald-300"
            : "border-white/20 text-transparent hover:border-white/40"
        }`}
      >
        ✓
      </button>

      <div className="min-w-0 flex-1">
        {/* `label` affiché TEL QU'ÉCRIT — le serveur ne le réécrit jamais, l'UI non plus. */}
        <p className={`text-sm leading-snug ${item.done ? "line-through" : ""}`}>{item.label}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-zetis-muted">
          {item.subject && (
            <span className="inline-flex items-center gap-1">
              {/* Sans asset pour cette matière : le nom suffit. Aucun emoji en dur, aucun
                  `<img>` cassé (un item sans matière est rendu sans pictogramme, accent
                  neutre — jamais bloqué). */}
              {subjectIconFor(item.subject.slug) && (
                <img
                  src={subjectIconFor(item.subject.slug)}
                  alt=""
                  aria-hidden
                  className="h-3.5 w-3.5 rounded-[22%] object-contain"
                />
              )}
              {item.subject.name}
            </span>
          )}
          {item.kind === "controle" && (
            <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-fuchsia-300 ring-1 ring-fuchsia-400/50">
              ◆ contrôle
            </span>
          )}
          {showDate && <span>{shortDayLabel(item.due_on)}</span>}
          {/* Émeraude = la couleur de l'interface de Papa. Massimo apprend le code sans
              explication, et rien ne bouge dans son agenda sans qu'il le voie (§2a). */}
          {origin && (
            <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300 ring-1 ring-emerald-400/40">
              {origin}
            </span>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Masquer"
        title="Masquer"
        className="shrink-0 rounded-lg px-1.5 py-0.5 text-xs text-zetis-muted transition-colors hover:text-white motion-reduce:transition-none"
      >
        ✕
      </button>
    </div>
  );
}
