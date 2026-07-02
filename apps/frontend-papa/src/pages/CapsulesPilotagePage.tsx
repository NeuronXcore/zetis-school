import { useEffect, useState } from "react";
import capsuleAiIcon from "../assets/app/capsule-AI.png";
import { DifficultyBadge } from "../components/DifficultyBadge";
import { PageHeader } from "../components/PageHeader";
import { ProgressBar, useEstimatedProgress } from "../components/ProgressBar";
import { CapsulePlayer } from "../remotion/CapsulePlayer";
import {
  type Capsule,
  type CapsuleListItem,
  type DifficultyChoice,
  type DurationChoice,
  type VisualChoice,
  classifyCapsule,
  deleteCapsule,
  generateCapsule,
  getCapsule,
  listCapsules,
  regenerateCapsule,
  renderCapsule,
  setCapsuleValidation,
  synthesizeVoice,
  updateSpec,
  videoSrc,
} from "../lib/capsules";
import { groupBySubjectChapter } from "../lib/groupCapsules";
import { type Subject, fetchSubjectDetail, fetchSubjects } from "../lib/subjects";
import { subjectEmoji } from "../lib/subjectEmoji";
import { subjectIconFor } from "../lib/subjectIcons";

const VISUAL_OPTIONS: { value: VisualChoice; label: string }[] = [
  { value: "auto", label: "Auto (le modèle choisit)" },
  { value: "numberline", label: "Droite graduée" },
  { value: "barmodel", label: "Fractions (barre)" },
  { value: "geometry", label: "Géométrie (figure)" },
  { value: "steps", label: "Étapes de résolution" },
  { value: "timeline", label: "Frise chronologique" },
  { value: "diagram", label: "Schéma annoté" },
];
const DURATION_OPTIONS: { value: DurationChoice; label: string }[] = [
  { value: "courte", label: "Courte (~15 s)" },
  { value: "moyenne", label: "Moyenne (~25 s)" },
  { value: "longue", label: "Longue (~35 s)" },
  { value: "1min", label: "≈ 1 min" },
];
const DIFFICULTY_OPTIONS: { value: DifficultyChoice; label: string; stars: string }[] = [
  { value: "facile", label: "Facile", stars: "⭐" },
  { value: "moyen", label: "Moyen", stars: "⭐⭐" },
  { value: "difficile", label: "Difficile", stars: "⭐⭐⭐" },
];

// Étapes IA « longues » (backend opaque) : libellé + durée cible de la barre de progression.
const PROGRESS_META = {
  generate: { label: "Génération de la capsule…", ms: 42000 },
  regenerate: { label: "Régénération de la capsule…", ms: 42000 },
  voice: { label: "Synthèse de la voix (Piper)…", ms: 16000 },
} as const;
type ProgressTask = keyof typeof PROGRESS_META;

type ChapterOption = { id: number; name: string };

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

// Icône de matière : PNG dédié (assets/subjects) si dispo, sinon repli emoji.
function SubjectIcon({ slug, size = 20 }: { slug: string; size?: number }) {
  const url = subjectIconFor(slug);
  if (url) {
    return (
      <img
        src={url}
        alt=""
        aria-hidden
        className="inline-block object-contain align-[-0.2em]"
        style={{ width: size, height: size }}
      />
    );
  }
  return <span aria-hidden>{subjectEmoji(slug)}</span>;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs ${STATUS_STYLE[status] ?? "bg-papa-border text-papa-muted"}`}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

// Pilotage Capsules IA Papa : créer (modale) → aperçu Remotion → valider / éditer le JSON.
export function CapsulesPilotagePage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [items, setItems] = useState<CapsuleListItem[]>([]);
  const [selected, setSelected] = useState<Capsule | null>(null);
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [instruction, setInstruction] = useState("Explique les fractions avec un exemple simple.");
  const [visual, setVisual] = useState<VisualChoice>("auto");
  const [duration, setDuration] = useState<DurationChoice>("moyenne");
  const [difficulty, setDifficulty] = useState<DifficultyChoice>("moyen");
  const [chapterId, setChapterId] = useState<number | null>(null);
  const [chaptersBySubject, setChaptersBySubject] = useState<Record<number, ChapterOption[]>>({});
  const [search, setSearch] = useState("");
  // Accordéons matière fermés par défaut : on mémorise ceux qui sont ouverts.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<null | "generate" | "action">(null);
  const [error, setError] = useState<string | null>(null);
  // Modales : création (formulaire) et édition JSON.
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  // Opération IA longue en cours (pilote la barre de progression estimée). Null = aucune.
  const [progressTask, setProgressTask] = useState<ProgressTask | null>(null);

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

  // Charge (et met en cache) les chapitres d'une matière — aplatit thèmes → chapitres.
  async function ensureChapters(sid: number): Promise<void> {
    if (chaptersBySubject[sid]) return;
    try {
      const detail = await fetchSubjectDetail(sid);
      const flat = detail.themes.flatMap((t) => t.chapters.map((c) => ({ id: c.id, name: c.name })));
      setChaptersBySubject((m) => ({ ...m, [sid]: flat }));
    } catch {
      /* pas de chapitres accessibles : le sélecteur reste sur « Aucun » */
    }
  }

  // Au changement de matière du formulaire : réinitialise le chapitre et charge ses chapitres.
  useEffect(() => {
    if (subjectId != null) {
      setChapterId(null);
      void ensureChapters(subjectId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId]);

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
    setProgressTask("generate");
    const capsule = await run("generate", () =>
      generateCapsule({
        subject_id: subjectId,
        instruction: instruction.trim(),
        chapter_id: chapterId,
        visual,
        duration,
        difficulty,
      }),
    );
    setProgressTask(null);
    if (capsule) {
      setSelected(capsule);
      setCreating(false);
      refreshList();
    }
  }

  async function onSelect(id: number) {
    const capsule = await run("action", () => getCapsule(id));
    if (capsule) {
      setSelected(capsule);
      void ensureChapters(capsule.subject_id);
    }
  }

  async function onReclassify(chapter: number | null) {
    if (!selected) return;
    const capsule = await run("action", () => classifyCapsule(selected.id, chapter));
    if (capsule) {
      setSelected(capsule);
      refreshList();
    }
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
    setProgressTask("regenerate");
    const capsule = await run("generate", () => regenerateCapsule(selected.id));
    setProgressTask(null);
    if (capsule) {
      setSelected(capsule);
      refreshList();
    }
  }

  async function onVoice() {
    if (!selected) return;
    setProgressTask("voice");
    const capsule = await run("generate", () => synthesizeVoice(selected.id));
    setProgressTask(null);
    if (capsule) {
      setSelected(capsule);
      refreshList();
    }
  }

  async function onRender() {
    if (!selected) return;
    const capsule = await run("action", () => renderCapsule(selected.id));
    if (capsule) {
      setSelected(capsule);
      refreshList();
    }
  }

  // Édition JSON : ouvre la modale pré-remplie avec le spec courant.
  function openEdit() {
    if (!selected) return;
    setEditText(JSON.stringify(selected.spec, null, 2));
    setEditError(null);
    setEditing(true);
  }

  async function onSaveEdit() {
    if (!selected) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(editText);
    } catch (e) {
      setEditError(`JSON invalide : ${e instanceof Error ? e.message : "erreur de syntaxe"}`);
      return;
    }
    setEditError(null);
    setBusy("action");
    try {
      const capsule = await updateSpec(selected.id, parsed as Capsule["spec"]);
      setSelected(capsule);
      refreshList();
      setEditing(false);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Enregistrement échoué (schéma invalide ?).");
    } finally {
      setBusy(null);
    }
  }

  // Le rendu MP4 est asynchrone (worker-media). Tant que la capsule est en `rendering`, on
  // sonde son état toutes les 4 s pour refléter `published` / `failed` sans action manuelle.
  useEffect(() => {
    if (!selected || selected.status !== "rendering") return;
    const id = selected.id;
    const timer = setInterval(() => {
      getCapsule(id)
        .then((fresh) => {
          setSelected((cur) => (cur && cur.id === id ? fresh : cur));
          if (fresh.status !== "rendering") refreshList();
        })
        .catch(() => {
          /* erreur transitoire de sondage : on réessaie au prochain tick */
        });
    }, 4000);
    return () => clearInterval(timer);
  }, [selected?.id, selected?.status]);

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
  const pct = useEstimatedProgress(
    progressTask !== null,
    progressTask ? PROGRESS_META[progressTask].ms : 1,
  );
  // Le rendu MP4 est asynchrone (worker-media, suivi par polling) : la barre est pilotée par
  // l'état `rendering` — couvre « Rendre la vidéo » ET « Valider (+ rendu) ». ~75 s estimés.
  const renderPct = useEstimatedProgress(selected?.status === "rendering", 75000);
  const groups = groupBySubjectChapter(items, search);
  const formChapters = chaptersBySubject[subjectId ?? -1] ?? [];
  const detailChapters = selected ? (chaptersBySubject[selected.subject_id] ?? []) : [];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Capsules IA — Pilotage"
        subtitle="Créer, prévisualiser (Remotion), valider et éditer les capsules pédagogiques."
        actions={
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 rounded-lg bg-papa-accent px-4 py-2 text-sm font-semibold text-papa-bg"
          >
            <img src={capsuleAiIcon} alt="" aria-hidden className="h-6 w-6 object-contain" />
            ✨ Créer une capsule
          </button>
        }
      />

      {error && (
        <p className="mb-4 rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-300">{error}</p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
        {/* Colonne gauche : liste des capsules */}
        <div>
          <h3 className="mb-2 text-sm font-semibold text-papa-muted">Capsules ({items.length})</h3>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher une capsule…"
            className="mb-3 w-full rounded-lg border border-papa-border bg-papa-bg px-3 py-2 text-sm"
          />
          {items.length === 0 ? (
            <p className="rounded-xl border border-dashed border-papa-border p-4 text-sm text-papa-muted">
              Aucune capsule pour l'instant. Clique « ✨ Créer une capsule ».
            </p>
          ) : groups.length === 0 ? (
            <p className="rounded-xl border border-dashed border-papa-border p-4 text-sm text-papa-muted">
              Aucune capsule ne correspond à « {search} ».
            </p>
          ) : (
            <div className="space-y-3">
              {groups.map((g) => {
                const key = g.slug || g.name;
                const open = !!expanded[key];
                return (
                  <div key={key} className="rounded-xl border border-papa-border bg-papa-surface">
                    <button
                      type="button"
                      onClick={() => setExpanded((m) => ({ ...m, [key]: !m[key] }))}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold"
                    >
                      <span className="flex items-center gap-2">
                        <SubjectIcon slug={g.slug} size={22} />
                        {g.name}
                      </span>
                      <span className="text-xs text-papa-muted">
                        {g.count} · {open ? "▾" : "▸"}
                      </span>
                    </button>
                    {open && (
                      <div className="space-y-2 px-2 pb-2">
                        {g.chapters.map((ch) => (
                          <div key={ch.id ?? "none"}>
                            <p className="px-1 pb-1 text-[11px] font-medium uppercase tracking-wide text-papa-muted">
                              {ch.name}
                            </p>
                            <ul className="space-y-1.5">
                              {ch.capsules.map((c) => (
                                <li key={c.id}>
                                  <button
                                    type="button"
                                    onClick={() => onSelect(c.id)}
                                    className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                                      selected?.id === c.id
                                        ? "border-papa-accent bg-papa-accent/10"
                                        : "border-papa-border bg-papa-bg"
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="flex items-center gap-1.5 font-medium">
                                        <SubjectIcon slug={c.subject_slug} size={18} />
                                        {c.title}
                                      </span>
                                      <span className="flex shrink-0 items-center gap-1">
                                        <DifficultyBadge difficulty={c.difficulty} />
                                        <StatusBadge status={c.validation_status} />
                                      </span>
                                    </div>
                                    <span className="text-xs text-papa-muted">
                                      {c.scenes_count} scènes
                                      {c.status === "published" ? " · 🎬 rendue" : ""}
                                      {c.view_count > 0 ? ` · 👁️ ${c.view_count}` : ""}
                                    </span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Colonne droite : aperçu + actions */}
        <div>
          {!selected ? (
            <div className="flex h-full min-h-64 items-center justify-center rounded-xl border border-dashed border-papa-border p-8 text-center text-papa-muted">
              Sélectionne une capsule pour l'aperçu, ou crée-en une nouvelle.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-lg font-bold">{selected.title}</p>
                  <p className="flex items-center gap-1.5 text-xs text-papa-muted">
                    <SubjectIcon slug={selected.subject_slug} size={16} />
                    {selected.subject} · {selected.spec.level} · {selected.spec.scenes.length} scènes
                    {selected.view_count > 0 ? ` · 👁️ vue ${selected.view_count} fois par Massimo` : ""}
                  </p>
                </div>
                <span className="flex items-center gap-1.5">
                  <DifficultyBadge difficulty={selected.difficulty} />
                  <StatusBadge status={selected.validation_status} />
                </span>
              </div>

              <label className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-papa-muted">Chapitre :</span>
                <select
                  value={selected.chapter_id ?? ""}
                  onChange={(e) => onReclassify(e.target.value ? Number(e.target.value) : null)}
                  disabled={busy !== null}
                  className="rounded-lg border border-papa-border bg-papa-bg px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  <option value="">Aucun (Général)</option>
                  {detailChapters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>

              <CapsulePlayer key={`${selected.id}-${selected.updated_at ?? ""}`} spec={selected.spec} />

              {selected.status === "rendering" && (
                <ProgressBar pct={renderPct} label="🎬 Rendu de la vidéo (worker-media)…" />
              )}
              {selected.status === "failed" && (
                <p className="rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-300">
                  Le rendu du MP4 a échoué. Vérifie worker-media puis réessaie.
                </p>
              )}
              {selected.status === "published" && selected.video_url && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                  <p className="text-sm font-semibold text-emerald-300">
                    ✅ MP4 rendu — visible par Massimo.
                  </p>
                  <video
                    key={selected.video_url}
                    src={videoSrc(selected.video_url)}
                    controls
                    className="mt-2 w-full rounded-lg border border-papa-border"
                  />
                </div>
              )}

              {(progressTask === "voice" || progressTask === "regenerate") && (
                <ProgressBar pct={pct} label={PROGRESS_META[progressTask].label} />
              )}

              <div className="flex flex-wrap gap-2 text-sm">
                <button
                  type="button"
                  onClick={() => onValidate("validate")}
                  disabled={busy !== null}
                  title={
                    selected.spec.scenes.some((s) => s.audioUrl)
                      ? "Valide et lance automatiquement le rendu MP4 pour Massimo."
                      : "Valide la capsule. Génère la voix pour déclencher le rendu MP4."
                  }
                  className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-emerald-300 disabled:opacity-50"
                >
                  {selected.spec.scenes.some((s) => s.audioUrl) ? "Valider (+ rendu)" : "Valider"}
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
                  onClick={openEdit}
                  disabled={busy !== null}
                  className="rounded-lg border border-papa-border px-3 py-1.5 disabled:opacity-50"
                >
                  ✏️ Éditer le JSON
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
                  onClick={onRender}
                  disabled={
                    busy !== null ||
                    selected.status === "rendering" ||
                    selected.validation_status !== "validated" ||
                    !selected.spec.scenes.some((s) => s.audioUrl)
                  }
                  title={
                    selected.validation_status !== "validated"
                      ? "Valide d'abord la capsule"
                      : !selected.spec.scenes.some((s) => s.audioUrl)
                        ? "Génère d'abord la voix"
                        : ""
                  }
                  className="rounded-lg border border-papa-border px-3 py-1.5 disabled:opacity-50"
                >
                  🎬{" "}
                  {selected.status === "rendering"
                    ? "Rendu en cours…"
                    : selected.status === "published"
                      ? "Re-rendre le MP4"
                      : "Rendre la vidéo"}
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
            </div>
          )}
        </div>
      </div>

      {/* Modale de création : formulaire de génération */}
      {creating && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setCreating(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-papa-border bg-papa-surface p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <img src={capsuleAiIcon} alt="" aria-hidden className="h-7 w-7 object-contain" />
                Créer une capsule
              </h2>
              <button
                type="button"
                onClick={() => setCreating(false)}
                aria-label="Fermer"
                className="rounded-lg border border-papa-border px-3 py-1.5 text-sm hover:text-papa-accent"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="text-papa-muted">Matière</span>
                <select
                  value={subjectId ?? ""}
                  onChange={(e) => setSubjectId(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-papa-border bg-papa-bg px-3 py-2 text-sm"
                >
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {subjectEmoji(s.slug)} {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-papa-muted">Chapitre (facultatif)</span>
                <select
                  value={chapterId ?? ""}
                  onChange={(e) => setChapterId(e.target.value ? Number(e.target.value) : null)}
                  className="mt-1 w-full rounded-lg border border-papa-border bg-papa-bg px-3 py-2 text-sm"
                >
                  <option value="">Aucun (Général)</option>
                  {formChapters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
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
                <div className="text-sm sm:col-span-2">
                  <span className="text-papa-muted">Difficulté</span>
                  <div className="mt-1 grid grid-cols-3 gap-2">
                    {DIFFICULTY_OPTIONS.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => setDifficulty(o.value)}
                        aria-pressed={difficulty === o.value}
                        className={`rounded-lg border px-2 py-2 text-center ${
                          difficulty === o.value
                            ? "border-papa-accent bg-papa-accent/10"
                            : "border-papa-border bg-papa-bg text-papa-muted"
                        }`}
                      >
                        <span className="block text-base leading-none">{o.stars}</span>
                        <span className="mt-1 block text-xs font-medium">{o.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {progressTask === "generate" && (
                <ProgressBar pct={pct} label={PROGRESS_META.generate.label} />
              )}
              <button
                type="button"
                onClick={onGenerate}
                disabled={generating || subjectId == null || !instruction.trim()}
                className="w-full rounded-lg bg-papa-accent px-4 py-2 text-sm font-semibold text-papa-bg disabled:opacity-50"
              >
                {generating ? "Génération en cours…" : "Générer une capsule"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale d'édition JSON */}
      {editing && selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setEditing(false)}
        >
          <div
            className="flex h-[88vh] w-full max-w-5xl flex-col rounded-2xl border border-papa-border bg-papa-surface p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex shrink-0 items-center justify-between">
              <h2 className="text-lg font-bold">
                Éditer le JSON <span className="text-papa-muted">— {selected.title}</span>
              </h2>
              <button
                type="button"
                onClick={() => setEditing(false)}
                aria-label="Fermer"
                className="rounded-lg border border-papa-border px-3 py-1.5 text-sm hover:text-papa-accent"
              >
                ✕
              </button>
            </div>
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              wrap="off"
              className="min-h-0 w-full flex-1 resize-none overflow-auto whitespace-pre rounded-lg border border-papa-border bg-papa-bg p-4 font-mono text-sm leading-relaxed text-papa-text"
            />
            {editError && (
              <p className="mt-2 shrink-0 rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-300">
                {editError}
              </p>
            )}
            <div className="mt-3 flex shrink-0 items-center justify-between gap-2">
              <p className="text-xs text-papa-muted">
                L'enregistrement revalide le schéma ; la capsule repasse en « à valider ».
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="rounded-lg border border-papa-border px-3 py-1.5 text-sm"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={onSaveEdit}
                  disabled={busy !== null}
                  className="rounded-lg bg-papa-accent px-4 py-1.5 text-sm font-semibold text-papa-bg disabled:opacity-50"
                >
                  Enregistrer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
