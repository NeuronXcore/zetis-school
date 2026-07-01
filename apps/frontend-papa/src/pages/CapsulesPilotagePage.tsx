import { useEffect, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { CapsulePlayer } from "../remotion/CapsulePlayer";
import {
  type Capsule,
  type CapsuleListItem,
  type DurationChoice,
  type VisualChoice,
  deleteCapsule,
  generateCapsule,
  getCapsule,
  listCapsules,
  regenerateCapsule,
  setCapsuleValidation,
  synthesizeVoice,
} from "../lib/capsules";

const VISUAL_OPTIONS: { value: VisualChoice; label: string }[] = [
  { value: "auto", label: "Auto (le modèle choisit)" },
  { value: "numberline", label: "Droite graduée" },
  { value: "barmodel", label: "Fractions (barre)" },
];
const DURATION_OPTIONS: { value: DurationChoice; label: string }[] = [
  { value: "courte", label: "Courte (~15 s)" },
  { value: "moyenne", label: "Moyenne (~25 s)" },
  { value: "longue", label: "Longue (~35 s)" },
];
import { type Subject, fetchSubjects } from "../lib/subjects";

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-300",
  validated: "bg-emerald-500/15 text-emerald-300",
  rejected: "bg-rose-500/15 text-rose-300",
};
const STATUS_LABEL: Record<string, string> = {
  pending: "à valider",
  validated: "validée",
  rejected: "rejetée",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs ${STATUS_STYLE[status] ?? "bg-papa-border text-papa-muted"}`}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

// Pilotage Capsules IA Papa (Lot 1, ADR-0007) : générer → aperçu Remotion → valider / éditer.
export function CapsulesPilotagePage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [items, setItems] = useState<CapsuleListItem[]>([]);
  const [selected, setSelected] = useState<Capsule | null>(null);
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [instruction, setInstruction] = useState("Explique les fractions avec un exemple simple.");
  const [visual, setVisual] = useState<VisualChoice>("auto");
  const [duration, setDuration] = useState<DurationChoice>("moyenne");
  const [busy, setBusy] = useState<null | "generate" | "action">(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSubjects()
      .then((s) => {
        setSubjects(s);
        if (s.length) setSubjectId((prev) => prev ?? s[0].id);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Chargement matières échoué"));
    refreshList();
  }, []);

  function refreshList() {
    listCapsules()
      .then(setItems)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Chargement capsules échoué"));
  }

  async function run<T>(kind: "generate" | "action", fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(kind);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action échouée.");
    } finally {
      setBusy(null);
    }
  }

  async function onGenerate() {
    if (subjectId == null || !instruction.trim()) return;
    const capsule = await run("generate", () =>
      generateCapsule({ subject_id: subjectId, instruction: instruction.trim(), visual, duration }),
    );
    if (capsule) {
      setSelected(capsule);
      refreshList();
    }
  }

  async function onSelect(id: number) {
    const capsule = await run("action", () => getCapsule(id));
    if (capsule) setSelected(capsule);
  }

  async function onValidate(action: "validate" | "reject") {
    if (!selected) return;
    const capsule = await run("action", () => setCapsuleValidation(selected.id, action));
    if (capsule) {
      setSelected(capsule);
      refreshList();
    }
  }

  async function onRegenerate() {
    if (!selected) return;
    const capsule = await run("generate", () => regenerateCapsule(selected.id));
    if (capsule) {
      setSelected(capsule);
      refreshList();
    }
  }

  async function onVoice() {
    if (!selected) return;
    const capsule = await run("generate", () => synthesizeVoice(selected.id));
    if (capsule) {
      setSelected(capsule);
      refreshList();
    }
  }

  async function onDelete() {
    if (!selected) return;
    const ok = await run("action", async () => {
      await deleteCapsule(selected.id);
      return true;
    });
    if (ok) {
      setSelected(null);
      refreshList();
    }
  }

  const generating = busy === "generate";

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Capsules IA — Pilotage"
        subtitle="Générer, prévisualiser (Remotion) et valider les capsules pédagogiques."
      />

      {error && (
        <p className="mb-4 rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-300">{error}</p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
        {/* Colonne gauche : génération + liste */}
        <div className="space-y-4">
          <div className="space-y-3 rounded-xl border border-papa-border bg-papa-surface p-4">
            <label className="block text-sm">
              <span className="text-papa-muted">Matière</span>
              <select
                value={subjectId ?? ""}
                onChange={(e) => setSubjectId(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-papa-border bg-papa-bg px-3 py-2 text-sm"
              >
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-papa-muted">Instruction</span>
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-lg border border-papa-border bg-papa-bg px-3 py-2 text-sm"
              />
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-papa-muted">Visuel pédagogique</span>
                <select
                  value={visual}
                  onChange={(e) => setVisual(e.target.value as VisualChoice)}
                  className="mt-1 w-full rounded-lg border border-papa-border bg-papa-bg px-3 py-2 text-sm"
                >
                  {VISUAL_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-papa-muted">Durée du clip</span>
                <select
                  value={duration}
                  onChange={(e) => setDuration(e.target.value as DurationChoice)}
                  className="mt-1 w-full rounded-lg border border-papa-border bg-papa-bg px-3 py-2 text-sm"
                >
                  {DURATION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="button"
              onClick={onGenerate}
              disabled={generating || subjectId == null || !instruction.trim()}
              className="w-full rounded-lg bg-papa-accent px-4 py-2 text-sm font-semibold text-papa-bg disabled:opacity-50"
            >
              {generating ? "Génération… (~40 s)" : "Générer une capsule"}
            </button>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-papa-muted">
              Capsules ({items.length})
            </h3>
            {items.length === 0 ? (
              <p className="rounded-xl border border-dashed border-papa-border p-4 text-sm text-papa-muted">
                Aucune capsule pour l'instant.
              </p>
            ) : (
              <ul className="space-y-2">
                {items.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(c.id)}
                      className={`w-full rounded-xl border px-3 py-2.5 text-left text-sm ${
                        selected?.id === c.id
                          ? "border-papa-accent bg-papa-accent/10"
                          : "border-papa-border bg-papa-surface"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{c.title}</span>
                        <StatusBadge status={c.validation_status} />
                      </div>
                      <span className="text-xs text-papa-muted">
                        {c.subject} · {c.scenes_count} scènes
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Colonne droite : aperçu + actions */}
        <div>
          {!selected ? (
            <div className="flex h-full min-h-64 items-center justify-center rounded-xl border border-dashed border-papa-border p-8 text-center text-papa-muted">
              Génère ou sélectionne une capsule pour l'aperçu vidéo.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-lg font-bold">{selected.title}</p>
                  <p className="text-xs text-papa-muted">
                    {selected.subject} · {selected.spec.level} · {selected.spec.scenes.length} scènes
                  </p>
                </div>
                <StatusBadge status={selected.validation_status} />
              </div>

              <CapsulePlayer key={`${selected.id}-${selected.updated_at ?? ""}`} spec={selected.spec} />

              <div className="flex flex-wrap gap-2 text-sm">
                <button
                  type="button"
                  onClick={() => onValidate("validate")}
                  disabled={busy !== null}
                  className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-emerald-300 disabled:opacity-50"
                >
                  Valider
                </button>
                <button
                  type="button"
                  onClick={() => onValidate("reject")}
                  disabled={busy !== null}
                  className="rounded-lg bg-rose-500/15 px-3 py-1.5 text-rose-300 disabled:opacity-50"
                >
                  Rejeter
                </button>
                <button
                  type="button"
                  onClick={onRegenerate}
                  disabled={busy !== null}
                  className="rounded-lg border border-papa-border px-3 py-1.5 disabled:opacity-50"
                >
                  {generating ? "Génération…" : "Régénérer"}
                </button>
                <button
                  type="button"
                  onClick={onVoice}
                  disabled={busy !== null}
                  className="rounded-lg border border-papa-border px-3 py-1.5 disabled:opacity-50"
                >
                  🔊{" "}
                  {selected.spec.scenes.some((s) => s.audioUrl)
                    ? "Regénérer la voix"
                    : "Générer la voix"}
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={busy !== null}
                  className="ml-auto rounded-lg border border-papa-border px-3 py-1.5 text-papa-muted disabled:opacity-50"
                >
                  Supprimer
                </button>
              </div>

              <details className="rounded-xl border border-papa-border bg-papa-surface p-4">
                <summary className="cursor-pointer text-sm font-semibold">
                  CapsuleSpec (JSON)
                </summary>
                <pre className="mt-2 overflow-x-auto text-xs text-papa-muted">
                  {JSON.stringify(selected.spec, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
