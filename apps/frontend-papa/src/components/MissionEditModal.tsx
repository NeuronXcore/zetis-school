import { useEffect, useState } from "react";
import { Button, Spinner } from "@zetis/ui";
import {
  type MissionPatch,
  type MissionPilot,
  type StepOption,
  type StepOptions,
} from "../lib/missionsPilotage";
import { STEP_EMOJI, STEP_LABEL } from "../lib/missionSteps";

// Modale d'édition d'une mission (Papa) : métadonnées + éditeur de parcours (planned only).
// Présentationnel ; les mutations viennent de useMissionsPilotage (patch / saveSteps).
interface Props {
  mission: MissionPilot;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  patch: (id: number, body: MissionPatch) => Promise<void>;
  saveSteps: (id: number, stepTypes: string[]) => Promise<void>;
  loadStepOptions: (id: number) => Promise<StepOptions>;
}

export function MissionEditModal({
  mission,
  busy,
  error,
  onClose,
  patch,
  saveSteps,
  loadStepOptions,
}: Props) {
  const [title, setTitle] = useState(mission.title);
  const [priority, setPriority] = useState(String(mission.priority));
  const [dueDate, setDueDate] = useState(mission.due_date ?? "");
  const [forcePriority, setForcePriority] = useState(mission.force_priority);

  const [order, setOrder] = useState<string[]>([]);
  const [options, setOptions] = useState<StepOption[]>([]);
  const [editable, setEditable] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    loadStepOptions(mission.id)
      .then((o) => {
        if (!alive) return;
        setOrder(o.current_types);
        setOptions(o.options);
        setEditable(o.editable);
      })
      .catch(() => undefined)
      .finally(() => alive && setOptionsLoading(false));
    return () => {
      alive = false;
    };
  }, [mission.id, loadStepOptions]);

  const addable = options.filter((o) => o.available && !order.includes(o.step_type));

  function move(idx: number, dir: -1 | 1) {
    setOrder((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }

  async function onSave() {
    try {
      await patch(mission.id, {
        title,
        priority: Number(priority) || 0,
        force_priority: forcePriority,
        due_date: dueDate || null,
      });
      if (editable && order.length > 0) await saveSteps(mission.id, order);
      onClose();
    } catch {
      // erreur affichée par le hook ; on garde la modale ouverte
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:p-10"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl border border-papa-border bg-papa-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <h2 className="text-lg font-bold text-papa-text">Éditer la mission</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-xl leading-none text-papa-muted hover:text-papa-text"
          >
            ✕
          </button>
        </div>

        {/* --- Métadonnées --- */}
        <div className="space-y-3">
          <label className="block text-xs font-semibold text-papa-muted">
            Titre
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-papa-border bg-papa-surface-2 px-3 py-2 text-sm text-papa-text"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-semibold text-papa-muted">
              Priorité
              <input
                type="number"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="mt-1 w-full rounded-lg border border-papa-border bg-papa-surface-2 px-3 py-2 text-sm text-papa-text"
              />
            </label>
            <label className="block text-xs font-semibold text-papa-muted">
              Échéance (repère)
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-papa-border bg-papa-surface-2 px-3 py-2 text-sm text-papa-text"
              />
            </label>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-papa-text">
            <input
              type="checkbox"
              className="h-4 w-4 accent-papa-accent"
              checked={forcePriority}
              onChange={(e) => setForcePriority(e.target.checked)}
            />
            Prioritaire (plancher de score)
          </label>
        </div>

        {/* --- Éditeur de parcours --- */}
        <div className="mt-5 border-t border-papa-border pt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-papa-muted">
              Parcours d'étapes
            </span>
            {!editable && (
              <span className="text-[11px] text-amber-300">
                verrouillé — mission démarrée
              </span>
            )}
          </div>

          {optionsLoading ? (
            <div className="flex justify-center py-4">
              <Spinner />
            </div>
          ) : (
            <>
              <ol className="space-y-1.5">
                {order.map((t, idx) => (
                  <li
                    key={t}
                    className="flex items-center gap-2 rounded-lg border border-papa-border bg-papa-surface-2 px-3 py-1.5 text-sm text-papa-text"
                  >
                    <span className="text-papa-muted">{idx + 1}.</span>
                    <span className="flex-1">
                      {STEP_EMOJI[t] ?? "•"} {STEP_LABEL[t] ?? t}
                    </span>
                    <button
                      type="button"
                      disabled={!editable || idx === 0}
                      onClick={() => move(idx, -1)}
                      className="px-1 text-papa-muted hover:text-papa-text disabled:opacity-30"
                      aria-label="Monter"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={!editable || idx === order.length - 1}
                      onClick={() => move(idx, 1)}
                      className="px-1 text-papa-muted hover:text-papa-text disabled:opacity-30"
                      aria-label="Descendre"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      disabled={!editable || order.length === 1}
                      onClick={() => setOrder((p) => p.filter((x) => x !== t))}
                      className="px-1 text-rose-300 hover:text-rose-200 disabled:opacity-30"
                      aria-label="Retirer"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ol>

              {editable && addable.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {addable.map((o) => (
                    <button
                      key={o.step_type}
                      type="button"
                      onClick={() => setOrder((p) => [...p, o.step_type])}
                      className="rounded-full border border-papa-border px-2.5 py-1 text-xs text-papa-muted hover:text-papa-text"
                    >
                      + {STEP_EMOJI[o.step_type] ?? "•"} {STEP_LABEL[o.step_type] ?? o.step_type}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {error && (
          <p className="mt-3 rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-300">{error}</p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} className="border border-papa-border">
            Annuler
          </Button>
          <Button onClick={() => void onSave()} disabled={busy || !title.trim()}>
            {busy ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </div>
    </div>
  );
}
