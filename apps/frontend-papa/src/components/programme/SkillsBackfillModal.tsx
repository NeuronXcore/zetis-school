import { useEffect, useMemo, useState } from "react";
import { type SkillsBackfillConfirmResult, type SkillsBackfillPreview } from "@zetis/types";
import { Button } from "@zetis/ui";
import { confirmSkillsBackfill, generateSkillsBackfill } from "../../lib/curriculum";
import {
  addNotion,
  countNotions,
  type EditableGroup,
  flattenNotions,
  removeNotion,
  setNotion,
} from "../../lib/skillsBackfill";
import { ProgressBar, useEstimatedProgress } from "../ProgressBar";

// Modale « Rattrapage skills-only » (ADR-0010), déclenchée depuis la page Programme.
// Flux stateless en trois temps : choisir un niveau → générer la prévisualisation (passes
// 1+2 EN MÉMOIRE, rien de persisté) → relire/ajuster les notions → confirmer l'upsert.
// Aucun chapitre ni cours n'est créé : les « chapitres d'échafaudage » ne servent qu'à
// regrouper les notions à l'écran. Chrome de modale du patron LessonContentModal.

// Cycle 4 uniquement (le backend refuse hors cycle 4 par un 400 explicite).
const CYCLE4_LEVELS = ["5e", "4e", "3e"] as const;

/** Niveau antérieur par défaut = celui juste avant l'année active (5e pour une 4e). */
function defaultPriorLevel(activeLevel: string): string | null {
  const i = CYCLE4_LEVELS.indexOf(activeLevel as (typeof CYCLE4_LEVELS)[number]);
  return i > 0 ? CYCLE4_LEVELS[i - 1] : null;
}

export function SkillsBackfillModal({
  subjectId,
  subjectName,
  activeLevel,
  onClose,
}: {
  subjectId: number;
  subjectName: string;
  /** Niveau de l'année active — marqué « année en cours », le rattrapage vise un niveau antérieur. */
  activeLevel: string;
  onClose: () => void;
}) {
  const [level, setLevel] = useState<string | null>(() => defaultPriorLevel(activeLevel));
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState<SkillsBackfillPreview | null>(null);
  const [groups, setGroups] = useState<EditableGroup[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<SkillsBackfillConfirmResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Édition inline d'une notion (renommage / ajout) : coordonnées + brouillon.
  const [editing, setEditing] = useState<{ gi: number; ni: number } | null>(null);
  const [draft, setDraft] = useState("");

  // Progression *estimée* : ~6-9 appels LLM séquentiels (cloud), cible ~90 s.
  const generationPct = useEstimatedProgress(generating, 90000);
  const busy = generating || confirming;
  const total = useMemo(() => countNotions(groups), [groups]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Un appel long est en cours (2 min de génération) : ne pas fermer par mégarde.
      if (e.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  async function handleGenerate() {
    if (level === null || generating) return;
    setGenerating(true);
    setError(null);
    setEditing(null);
    try {
      const data = await generateSkillsBackfill(subjectId, level);
      setPreview(data);
      setGroups(data.groups.map((g) => ({ ...g, notions: [...g.notions] })));
    } catch (e) {
      // 400 (hors cycle 4) / 503 (clé absente) / 502 : detail backend verbatim.
      setError(e instanceof Error ? e.message : "Génération impossible.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleConfirm() {
    if (level === null || confirming) return;
    setConfirming(true);
    setError(null);
    try {
      const res = await confirmSkillsBackfill(subjectId, level, flattenNotions(groups));
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Confirmation impossible.");
    } finally {
      setConfirming(false);
    }
  }

  function commitEdit(gi: number, ni: number) {
    const name = draft.trim().replace(/\s+/g, " ");
    setGroups((gs) => (name ? setNotion(gs, gi, ni, name) : removeNotion(gs, gi, ni)));
    setEditing(null);
  }

  function startAdd(gi: number) {
    setGroups((gs) => {
      const next = addNotion(gs, gi, "");
      setEditing({ gi, ni: next[gi].notions.length - 1 });
      return next;
    });
    setDraft("");
  }

  const dialogClass =
    "flex max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-papa-accent/30 " +
    "bg-papa-surface shadow-[0_0_45px_-10px_rgba(16,185,129,0.45)]";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={() => !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Rattrapage — ${subjectName}`}
        className={dialogClass}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="papa-scrollbar min-h-0 w-full overflow-y-auto p-6">
          {/* En-tête : titre + fermeture (désactivée pendant un appel en cours). */}
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span aria-hidden>🎯</span>
              <h2 className="min-w-0 font-semibold">
                Rattrapage — {subjectName}
                {preview && (
                  <span className="font-normal text-papa-muted">
                    {" "}
                    · {preview.level} (programme {preview.program_version})
                  </span>
                )}
              </h2>
            </div>
            <Button
              size="sm"
              variant="ghost"
              aria-label="Fermer"
              onClick={onClose}
              disabled={busy}
            >
              ✕
            </Button>
          </div>

          {error && (
            <p className="mb-3 rounded-lg bg-rose-500/15 px-3 py-2 text-xs text-rose-300">
              {error}
            </p>
          )}

          {generating && (
            <div className="mb-3">
              <ProgressBar
                pct={generationPct}
                label="ZETIS génère les notions (1 à 3 min, comme les chapitres)…"
              />
            </div>
          )}

          {result !== null ? (
            <ResultStep
              result={result}
              subjectName={subjectName}
              level={level ?? ""}
              onClose={onClose}
            />
          ) : preview !== null ? (
            <PreviewStep
              groups={groups}
              failedScaffolds={preview.failed_scaffolds}
              total={total}
              confirming={confirming}
              editing={editing}
              draft={draft}
              setDraft={setDraft}
              onStartEdit={(gi, ni, name) => {
                setEditing({ gi, ni });
                setDraft(name);
              }}
              onCommitEdit={commitEdit}
              onRemove={(gi, ni) => {
                setGroups((gs) => removeNotion(gs, gi, ni));
                setEditing(null);
              }}
              onAdd={startAdd}
              onRegenerate={() => void handleGenerate()}
              onConfirm={() => void handleConfirm()}
              onCancel={onClose}
            />
          ) : (
            <LevelStep
              level={level}
              activeLevel={activeLevel}
              generating={generating}
              onPick={setLevel}
              onGenerate={() => void handleGenerate()}
              onCancel={onClose}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// --- Étape 1 : choix du niveau -------------------------------------------------

function LevelStep({
  level,
  activeLevel,
  generating,
  onPick,
  onGenerate,
  onCancel,
}: {
  level: string | null;
  activeLevel: string;
  generating: boolean;
  onPick: (level: string) => void;
  onGenerate: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-papa-muted">
        Génère les notions d'un niveau antérieur pour alimenter le référentiel de
        rattrapage. Aucun chapitre ni cours n'est créé — seules les notions que tu
        confirmes sont ajoutées.
      </p>
      <div>
        <p className="mb-2 text-xs font-semibold text-papa-text">Niveau à générer</p>
        <div className="flex gap-2" role="group" aria-label="Niveau à générer">
          {CYCLE4_LEVELS.map((lvl) => {
            const active = lvl === activeLevel;
            const on = lvl === level;
            return (
              <button
                key={lvl}
                type="button"
                aria-pressed={on}
                disabled={generating}
                onClick={() => onPick(lvl)}
                className={
                  "rounded-lg border px-4 py-2 text-sm font-semibold transition-colors " +
                  (on
                    ? "border-papa-accent bg-emerald-500/15 text-emerald-200 ring-2 ring-papa-accent/30"
                    : "border-papa-border bg-papa-bg text-papa-muted hover:text-papa-text")
                }
              >
                {lvl}
                {active && <span className="ml-1 text-[10px] font-normal">· en cours</span>}
              </button>
            );
          })}
        </div>
      </div>
      <p className="flex items-center gap-2 text-xs text-papa-muted">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-papa-accent" />~1 à 3 min
        (génération cloud, comme les chapitres).
      </p>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={generating}>
          Annuler
        </Button>
        <Button size="sm" onClick={onGenerate} disabled={level === null || generating}>
          {generating ? "Génération…" : "⚡ Générer"}
        </Button>
      </div>
    </div>
  );
}

// --- Étape 2 : prévisualisation éditable --------------------------------------

function PreviewStep({
  groups,
  failedScaffolds,
  total,
  confirming,
  editing,
  draft,
  setDraft,
  onStartEdit,
  onCommitEdit,
  onRemove,
  onAdd,
  onRegenerate,
  onConfirm,
  onCancel,
}: {
  groups: EditableGroup[];
  failedScaffolds: string[];
  total: number;
  confirming: boolean;
  editing: { gi: number; ni: number } | null;
  draft: string;
  setDraft: (v: string) => void;
  onStartEdit: (gi: number, ni: number, name: string) => void;
  onCommitEdit: (gi: number, ni: number) => void;
  onRemove: (gi: number, ni: number) => void;
  onAdd: (gi: number) => void;
  onRegenerate: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-papa-muted">
        Relis et ajuste. Rien n'est enregistré tant que tu ne confirmes pas.
      </p>
      {failedScaffolds.length > 0 && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          ⚠ {failedScaffolds.length} section
          {failedScaffolds.length > 1 ? "s n'ont" : " n'a"} pas abouti — liste partielle.
          Tu peux confirmer ce qui est proposé, ou régénérer.
        </p>
      )}

      <div className="flex flex-col divide-y divide-papa-border/60">
        {groups.map((g, gi) => (
          <section key={gi} className="py-3 first:pt-0">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-semibold">{g.scaffold_chapter}</span>
              <span className="ml-auto rounded-full border border-papa-border bg-papa-bg px-2 py-0.5 text-[10px] uppercase tracking-wide text-papa-muted">
                échafaudage · non créé
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {g.notions.map((n, ni) =>
                editing && editing.gi === gi && editing.ni === ni ? (
                  <input
                    key={ni}
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus
                    aria-label="Renommer la notion"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => onCommitEdit(gi, ni)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") onCommitEdit(gi, ni);
                      if (e.key === "Escape") onCommitEdit(gi, ni);
                    }}
                    className="rounded-full border border-papa-accent bg-papa-bg px-3 py-1 text-xs text-papa-text outline-none"
                  />
                ) : (
                  <span
                    key={ni}
                    className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/15 py-1 pl-3 pr-1.5 text-xs text-emerald-200"
                  >
                    <button
                      type="button"
                      onClick={() => onStartEdit(gi, ni, n)}
                      aria-label={`Renommer la notion ${n}`}
                      className="max-w-[16rem] truncate"
                    >
                      {n || "(vide)"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(gi, ni)}
                      aria-label={`Retirer la notion ${n}`}
                      className="grid h-4 w-4 place-items-center rounded-full bg-black/20 text-emerald-100 hover:bg-black/40"
                    >
                      ×
                    </button>
                  </span>
                ),
              )}
              <button
                type="button"
                onClick={() => onAdd(gi)}
                aria-label={`Ajouter une notion à ${g.scaffold_chapter}`}
                className="rounded-full border border-dashed border-papa-border px-3 py-1 text-xs text-papa-muted hover:text-papa-text"
              >
                ＋ ajouter une notion
              </button>
            </div>
          </section>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-papa-border pt-3">
        <span className="text-xs tabular-nums text-papa-muted">
          <b className="text-papa-text">{total}</b> notion{total > 1 ? "s" : ""} ·{" "}
          <b className="text-papa-text">{groups.length}</b> section
          {groups.length > 1 ? "s" : ""}
        </span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="ghost" onClick={onRegenerate} disabled={confirming}>
            ↻ Régénérer
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={confirming}>
            Annuler
          </Button>
          <Button size="sm" onClick={onConfirm} disabled={total === 0 || confirming}>
            {confirming ? "Ajout…" : "✓ Confirmer"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// --- Étape 3 : résultat -------------------------------------------------------

function ResultStep({
  result,
  subjectName,
  level,
  onClose,
}: {
  result: SkillsBackfillConfirmResult;
  subjectName: string;
  level: string;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="flex items-center gap-3">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-papa-accent text-white">
          ✓
        </span>
        <p className="font-semibold">Notions ajoutées au référentiel</p>
      </div>
      <div className="flex gap-6">
        <div>
          <p className="text-2xl font-bold tabular-nums text-papa-text">{result.created}</p>
          <p className="text-xs text-papa-muted">créée{result.created > 1 ? "s" : ""}</p>
        </div>
        <div>
          <p className="text-2xl font-bold tabular-nums text-papa-muted">{result.existing}</p>
          <p className="text-xs text-papa-muted">déjà présente{result.existing > 1 ? "s" : ""}</p>
        </div>
      </div>
      <p className="text-sm text-papa-muted">
        Le check-up « {subjectName} · {level} » est maintenant disponible pour Massimo.
        Aucun chapitre ni cours n'a été créé.
      </p>
      <div className="flex justify-end">
        <Button size="sm" onClick={onClose}>
          Fermer
        </Button>
      </div>
    </div>
  );
}
