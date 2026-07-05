import { Button, Spinner } from "@zetis/ui";
import { type CommandNotion } from "../lib/missionsPilotage";
import { type CommandGate, type UseCommandMission } from "../hooks/useCommandMission";

// Modale « Commander une mission » (ADR-0018). Purement présentationnelle : toute la logique
// (preview/confirm, résolution des notions, plafond) vit dans useCommandMission.

const PORTES: { key: CommandGate | "recommendation"; icon: string; title: string; sub: string; disabled?: string }[] = [
  { key: "deadline", icon: "📅", title: "Échéance", sub: "Contrôle, exposé… sur un chapitre" },
  { key: "theme_ref", icon: "🎯", title: "Thématique", sub: "Une matière → un chapitre → des notions" },
  {
    key: "recommendation",
    icon: "📋",
    title: "Recommandation",
    sub: "Depuis le Conseil de classe IA",
    disabled: "Bientôt — nécessite la page Conseil de classe IA",
  },
];

function fragilityBadge(n: CommandNotion): { label: string; cls: string } {
  if (n.mastery < 0.5) return { label: `fragile ${n.mastery.toFixed(2)}`, cls: "bg-rose-500/15 text-rose-300" };
  if (n.mastery < 0.8) return { label: `moyen ${n.mastery.toFixed(2)}`, cls: "bg-amber-500/15 text-amber-300" };
  return { label: `solide ${n.mastery.toFixed(2)}`, cls: "bg-emerald-500/15 text-emerald-300" };
}

export function CommandMissionModal({ cmd }: { cmd: UseCommandMission }) {
  if (!cmd.open) return null;
  const atCap = cmd.checked.size >= cmd.maxSkills;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:p-10"
      onClick={cmd.closeModal}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-papa-border bg-papa-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-start justify-between">
          <h2 className="text-lg font-bold text-papa-text">Commander une mission</h2>
          <button
            type="button"
            onClick={cmd.closeModal}
            className="text-xl leading-none text-papa-muted hover:text-papa-text"
          >
            ✕
          </button>
        </div>
        <p className="mb-4 text-xs text-papa-muted">
          Vous donnez l'intention — ZETIS compose depuis l'évidence (maîtrise, lacunes). Une notion
          = une mission courte. Rien n'est créé avant confirmation.
        </p>

        {/* Portes */}
        <div className="mb-4 grid grid-cols-3 gap-2">
          {PORTES.map((porte) => {
            const active = !porte.disabled && cmd.gate === porte.key;
            return (
              <button
                key={porte.key}
                type="button"
                disabled={!!porte.disabled}
                title={porte.disabled ?? ""}
                onClick={() => !porte.disabled && cmd.setGate(porte.key as CommandGate)}
                className={[
                  "rounded-xl border p-2.5 text-left transition-colors",
                  porte.disabled
                    ? "cursor-not-allowed border-papa-border opacity-45"
                    : active
                      ? "border-papa-accent bg-papa-accent/10"
                      : "border-papa-border hover:bg-papa-surface-2",
                ].join(" ")}
              >
                <div className="text-sm font-bold text-papa-text">
                  {porte.icon} {porte.title}
                </div>
                <div className="mt-0.5 text-[11px] text-papa-muted">
                  {porte.disabled ?? porte.sub}
                </div>
              </button>
            );
          })}
        </div>

        {/* Scope : matière → chapitre (+ date pour l'échéance) */}
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-papa-muted">
            Matière
            <select
              value={cmd.sysId ?? ""}
              onChange={(e) => cmd.selectSubject(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-papa-border bg-papa-surface-2 px-3 py-2 text-sm text-papa-text"
            >
              <option value="" disabled>
                Choisir une matière…
              </option>
              {(cmd.year?.subjects ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.subject_icon ? `${s.subject_icon} ` : ""}
                  {s.subject_name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-semibold text-papa-muted">
            Chapitre
            <select
              value={cmd.chapterId ?? ""}
              disabled={cmd.sysId === null || cmd.loadingChapters}
              onChange={(e) => cmd.selectChapter(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-papa-border bg-papa-surface-2 px-3 py-2 text-sm text-papa-text disabled:opacity-50"
            >
              <option value="" disabled>
                {cmd.loadingChapters ? "Chargement…" : "Choisir un chapitre…"}
              </option>
              {cmd.chapters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          {cmd.gate === "deadline" && (
            <label className="text-xs font-semibold text-papa-muted">
              Date (repère, informationnelle)
              <input
                type="date"
                value={cmd.dueDate}
                onChange={(e) => cmd.setDueDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-papa-border bg-papa-surface-2 px-3 py-2 text-sm text-papa-text"
              />
            </label>
          )}
        </div>

        {/* Notions résolues */}
        {cmd.loadingPreview ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : cmd.preview ? (
          <div className="mb-4">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-papa-muted">
                Notions résolues (fragilité × maîtrise) — décochez ce qui ne convient pas
              </span>
              {atCap && (
                <span className="text-[11px] text-amber-300">max {cmd.maxSkills} par commande</span>
              )}
            </div>
            <div className="divide-y divide-papa-border overflow-hidden rounded-xl border border-papa-border">
              {cmd.preview.notions.length === 0 && (
                <p className="px-3 py-4 text-sm text-papa-muted">
                  Aucune notion validée dans ce chapitre.
                </p>
              )}
              {cmd.preview.notions.map((n) => {
                const badge = fragilityBadge(n);
                const isChecked = cmd.checked.has(n.skill_id);
                const disabled = !isChecked && atCap;
                return (
                  <label
                    key={n.skill_id}
                    className={`flex items-center gap-3 px-3 py-2 text-sm ${disabled ? "opacity-45" : "cursor-pointer"}`}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-papa-accent"
                      checked={isChecked}
                      disabled={disabled}
                      onChange={() => cmd.toggleNotion(n.skill_id)}
                    />
                    <span className="flex-1 text-papa-text">
                      {n.name}
                      {n.level ? <span className="text-papa-muted"> · {n.level}</span> : null}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}
                    >
                      {badge.label}
                    </span>
                  </label>
                );
              })}
            </div>
            <p className="mt-2 rounded-lg border-l-2 border-papa-accent bg-papa-accent/5 px-3 py-1.5 text-xs text-papa-muted">
              {cmd.checked.size > 0
                ? `ZETIS composera ${cmd.checked.size} mission${cmd.checked.size > 1 ? "s" : ""} courte${cmd.checked.size > 1 ? "s" : ""} (une par notion), parcours 💡→🎙→❓, ~15 min chacune.`
                : cmd.preview.compose_note}
            </p>
          </div>
        ) : (
          <p className="mb-4 rounded-xl border border-dashed border-papa-border px-3 py-6 text-center text-sm text-papa-muted">
            Choisissez une matière puis un chapitre pour résoudre les notions à travailler.
          </p>
        )}

        {/* Priorité forcée */}
        <label className="mb-4 flex cursor-pointer items-center gap-2 text-sm text-papa-text">
          <input
            type="checkbox"
            className="h-4 w-4 accent-papa-accent"
            checked={cmd.forcePriority}
            onChange={(e) => cmd.setForcePriority(e.target.checked)}
          />
          Prioritaire (plancher de score — passe devant les missions moins urgentes)
        </label>

        {cmd.error && (
          <p className="mb-3 rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-300">
            {cmd.error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={cmd.closeModal}
            className="border border-papa-border"
          >
            Annuler
          </Button>
          <Button onClick={() => void cmd.confirm()} disabled={cmd.busy || cmd.checked.size === 0}>
            {cmd.busy
              ? "Création…"
              : `Créer ${cmd.checked.size || ""} mission${cmd.checked.size > 1 ? "s" : ""}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
