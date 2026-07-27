import { useCallback, useEffect, useState } from "react";
import {
  ContentLifecycleActions,
  ContentStatusBadge,
  GenerationProgress,
  SoundToggle,
  useCelebrate,
  useEstimatedProgress,
} from "@zetis/ui";
import { type MindmapDetail, type MindmapPilotageTree } from "@zetis/types";
import { MindmapEditorModal } from "../components/MindmapEditorModal";
import { PageHeader } from "../components/PageHeader";
import { type Subject, fetchSubjects } from "../lib/subjects";
import { subjectEmoji } from "../lib/subjectEmoji";
import { subjectIconFor } from "../lib/subjectIcons";
import {
  deleteMindmap,
  fetchMindmapPilotage,
  generateMindmap,
  regenerateMindmap,
  validateMindmap,
} from "../lib/mindmaps";

// Pilotage Mindmaps Papa (émeraude) : par matière, les leçons validées + leurs cartes. Génération
// par leçon (barre estimée + célébration), cycle de vie par carte (briques @zetis/ui partagées),
// édition via le JSON de l'arbre (MindmapEditorModal, revalidé serveur → pending). Aucune action locale.

const GEN_MS = 32000; // génération LLM locale d'une carte (~20-40 s)

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

export function MindmapsPilotagePage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [tree, setTree] = useState<MindmapPilotageTree | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [genLessonId, setGenLessonId] = useState<number | null>(null);
  const [regenMindmapId, setRegenMindmapId] = useState<number | null>(null);
  const [busyMindmapId, setBusyMindmapId] = useState<number | null>(null);
  const [edit, setEdit] = useState<{ mindmap: MindmapDetail } | null>(null);

  const celebrate = useCelebrate();
  const busyOp = genLessonId !== null || regenMindmapId !== null;
  const pct = useEstimatedProgress(busyOp, GEN_MS);

  useEffect(() => {
    fetchSubjects()
      .then((s) => {
        setSubjects(s);
        setSubjectId((prev) => prev ?? (s.length ? s[0].id : null));
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Chargement matières échoué"));
  }, []);

  const loadTree = useCallback((sid: number) => {
    setLoading(true);
    setError(null);
    fetchMindmapPilotage(sid)
      .then(setTree)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Chargement échoué"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (subjectId != null) loadTree(subjectId);
  }, [subjectId, loadTree]);

  const refresh = useCallback(() => {
    if (subjectId != null) loadTree(subjectId);
  }, [subjectId, loadTree]);

  async function onGenerate(lessonId: number, lessonTitle: string) {
    setGenLessonId(lessonId);
    setError(null);
    try {
      await generateMindmap(lessonId);
      celebrate({ title: "Carte créée !", subtitle: lessonTitle });
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Génération échouée.");
    } finally {
      setGenLessonId(null);
    }
  }

  async function onRegenerate(id: number) {
    setRegenMindmapId(id);
    setError(null);
    try {
      await regenerateMindmap(id);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Régénération échouée.");
    } finally {
      setRegenMindmapId(null);
    }
  }

  async function runMindmap(id: number, fn: () => Promise<unknown>) {
    setBusyMindmapId(id);
    setError(null);
    try {
      await fn();
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action échouée.");
    } finally {
      setBusyMindmapId(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="🧠 Mindmaps — Pilotage"
        subtitle="Génère, valide et édite les cartes mentales (une carte = une leçon)."
        actions={<SoundToggle />}
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {subjects.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSubjectId(s.id)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${
              subjectId === s.id
                ? "border-papa-accent bg-papa-accent/10 text-papa-text"
                : "border-papa-border bg-papa-surface text-papa-muted"
            }`}
          >
            <SubjectIcon slug={s.slug} size={18} />
            {s.name}
          </button>
        ))}
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-300">{error}</p>
      )}

      {loading ? (
        <p className="text-papa-muted">Chargement…</p>
      ) : tree && tree.lessons.length === 0 ? (
        <p className="rounded-xl border border-dashed border-papa-border p-6 text-sm text-papa-muted">
          Aucune leçon validée avec un cours rédigé pour cette matière. Rédige et valide un cours
          (page Programme) pour pouvoir générer sa carte mentale.
        </p>
      ) : tree ? (
        <div className="space-y-3">
          {tree.lessons.map((lesson) => (
            <div
              key={lesson.lesson_id}
              className="rounded-xl border border-papa-border bg-papa-surface p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  {lesson.chapter && (
                    <p className="text-[11px] font-medium uppercase tracking-wide text-papa-muted">
                      {lesson.chapter}
                    </p>
                  )}
                  <p className="font-semibold text-papa-text">{lesson.title}</p>
                </div>
                {lesson.mindmaps.length === 0 && (
                  <button
                    type="button"
                    onClick={() => onGenerate(lesson.lesson_id, lesson.title)}
                    disabled={busyOp || !lesson.has_content}
                    title={lesson.has_content ? "" : "La leçon n'a pas encore de cours rédigé."}
                    className="rounded-lg bg-papa-accent px-3 py-1.5 text-sm font-semibold text-papa-bg disabled:opacity-50"
                  >
                    ✨ Générer une carte
                  </button>
                )}
              </div>

              {genLessonId === lesson.lesson_id && (
                <div className="mt-3">
                  <GenerationProgress value={pct} label="Génération de la carte…" />
                </div>
              )}

              {lesson.mindmaps.map((mindmap) => (
                <div
                  key={mindmap.id}
                  className="mt-3 rounded-lg border border-papa-border/70 bg-papa-bg p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm">
                      <ContentStatusBadge status={mindmap.validation_status} />
                      <span className="text-papa-muted">
                        {mindmap.mindmap_json.nodes.length} nœuds ·{" "}
                        {mindmap.mindmap_json.center}
                      </span>
                    </span>
                    <ContentLifecycleActions
                      status={mindmap.validation_status}
                      itemLabel={mindmap.title}
                      busy={busyMindmapId === mindmap.id || busyOp}
                      onValidate={() => runMindmap(mindmap.id, () => validateMindmap(mindmap.id))}
                      onEdit={() => setEdit({ mindmap })}
                      onRegenerate={() => onRegenerate(mindmap.id)}
                      onDelete={() => runMindmap(mindmap.id, () => deleteMindmap(mindmap.id))}
                    />
                  </div>
                  {regenMindmapId === mindmap.id && (
                    <div className="mt-3">
                      <GenerationProgress value={pct} label="Régénération de la carte…" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : null}

      {edit && (
        <MindmapEditorModal
          mindmap={edit.mindmap}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
