import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ContentLifecycleActions,
  ContentStatusBadge,
  GenerationProgress,
  Input,
  SoundToggle,
  useCelebrate,
} from "@zetis/ui";
import { type MindmapPilotageCard, type MindmapPilotageTree } from "@zetis/types";
import { MindmapPreviewModal, destructionNotice } from "../components/MindmapPreviewModal";
import { FocusableCard } from "../components/FocusableCard";
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
import { useProgressionEstimee } from "../hooks/useEstimations";

// Pilotage Mindmaps Papa (émeraude) : par matière, les chapitres → leçons validées → leur carte.
// Génération par leçon (barre estimée + célébration), cycle de vie par carte (briques @zetis/ui
// partagées), et surtout **👁 Aperçu** : la modale de fidélité qui rend la carte exactement comme
// Massimo la verra, dans les 3 modes, avant validation (addendum ADR-0016). Aucune action locale.
//
// La métrique « reconstruite N fois · moyenne X % » et le signal des confirmations viennent de
// l'agrégat `attempt_count`/`avg_score` de la route de pilotage — strictement côté Papa.


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

type Lesson = MindmapPilotageTree["lessons"][number];

export function MindmapsPilotagePage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState<number | null>(null);
  // Lien profond depuis la Couverture : ?subject=<id>&focus=<mindmap_id>.
  const [params] = useSearchParams();
  const focusSubjectId = Number(params.get("subject")) || null;
  const focusMindmapId = Number(params.get("focus")) || null;
  const [tree, setTree] = useState<MindmapPilotageTree | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [genLessonId, setGenLessonId] = useState<number | null>(null);
  const [regenMindmapId, setRegenMindmapId] = useState<number | null>(null);
  const [busyMindmapId, setBusyMindmapId] = useState<number | null>(null);
  const [preview, setPreview] = useState<{ card: MindmapPilotageCard; lesson: Lesson } | null>(
    null,
  );

  // Lien profond → on ouvre la modale SUR la carte visée. Le contenu d'une carte mentale vit
  // dans cette modale (4 onglets) : s'arrêter à la ligne surlignée obligerait Papa à cliquer
  // une fois de plus pour voir ce qu'il est venu voir. Même geste que le quiz, dont le lien
  // ouvre déjà sa modale d'inspection.
  const openedRef = useRef<number | null>(null);
  useEffect(() => {
    if (focusMindmapId === null || tree === null) return;
    if (openedRef.current === focusMindmapId) return; // une seule ouverture : refermer doit refermer
    for (const lesson of tree.lessons) {
      const card = lesson.mindmaps.find((m) => m.id === focusMindmapId);
      if (card) {
        openedRef.current = focusMindmapId;
        setPreview({ card, lesson });
        return;
      }
    }
  }, [focusMindmapId, tree]);

  const celebrate = useCelebrate();
  const busyOp = genLessonId !== null || regenMindmapId !== null;
  const pct = useProgressionEstimee(busyOp, "mindmap_generate");

  useEffect(() => {
    fetchSubjects()
      .then((s) => {
        setSubjects(s);
        setSubjectId((prev) => prev ?? focusSubjectId ?? (s.length ? s[0].id : null));
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

  // Leçons filtrées puis regroupées par chapitre, dans l'ordre du curriculum (déjà trié serveur).
  const chapters = useMemo(() => {
    if (!tree) return [];
    const q = query.trim().toLowerCase();
    const kept = q
      ? tree.lessons.filter(
          (l) =>
            l.title.toLowerCase().includes(q) || (l.chapter ?? "").toLowerCase().includes(q),
        )
      : tree.lessons;
    const groups: { name: string; lessons: Lesson[] }[] = [];
    for (const lesson of kept) {
      const name = lesson.chapter ?? "Sans chapitre";
      const last = groups[groups.length - 1];
      if (last && last.name === name) last.lessons.push(lesson);
      else groups.push({ name, lessons: [lesson] });
    }
    return groups;
  }, [tree, query]);

  const toggleChapter = (name: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

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
    setPreview(null);
    try {
      await regenerateMindmap(id);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Régénération échouée.");
    } finally {
      setRegenMindmapId(null);
    }
  }

  async function runMindmap(id: number, fn: () => Promise<unknown>, closePreview = false) {
    setBusyMindmapId(id);
    setError(null);
    if (closePreview) setPreview(null);
    try {
      await fn();
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action échouée.");
    } finally {
      setBusyMindmapId(null);
    }
  }

  const subjectName = tree?.subject.name ?? "";

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="🧠 Mindmaps — Pilotage"
        subtitle="Génère, prévisualise dans les 3 modes, corrige et valide les cartes mentales (une carte = une leçon)."
        actions={<SoundToggle />}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
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

      <div className="mb-5">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="🔍 rechercher une leçon"
          aria-label="Rechercher une leçon"
        />
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-300">{error}</p>
      )}

      {loading ? (
        <p className="text-papa-muted">Chargement…</p>
      ) : tree && tree.lessons.length === 0 ? (
        <p className="rounded-xl border border-dashed border-papa-border p-6 text-sm text-papa-muted">
          Aucun cours validé pour l'instant dans cette matière. Rédige et valide un cours (page
          Programme) pour pouvoir générer sa carte mentale.
        </p>
      ) : tree && chapters.length === 0 ? (
        <p className="rounded-xl border border-dashed border-papa-border p-6 text-sm text-papa-muted">
          Aucune leçon ne correspond à « {query} ».
        </p>
      ) : tree ? (
        <div className="space-y-4">
          {chapters.map((chapter) => {
            const open = !collapsed.has(chapter.name);
            return (
              <section key={chapter.name}>
                <button
                  type="button"
                  onClick={() => toggleChapter(chapter.name)}
                  aria-expanded={open}
                  className="mb-2 flex w-full items-center gap-2 text-left text-sm font-semibold text-papa-text"
                >
                  <span aria-hidden className="text-papa-muted">
                    {open ? "▾" : "▸"}
                  </span>
                  {chapter.name}
                  <span className="text-xs font-normal text-papa-muted">
                    {chapter.lessons.length} leçon{chapter.lessons.length > 1 ? "s" : ""}
                  </span>
                </button>

                {open && (
                  <div className="space-y-3">
                    {chapter.lessons.map((lesson) => (
                      <div
                        key={lesson.lesson_id}
                        className="rounded-xl border border-papa-border bg-papa-surface p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-semibold text-papa-text">{lesson.title}</p>
                          {lesson.mindmaps.length === 0 &&
                            (lesson.has_content ? (
                              <button
                                type="button"
                                onClick={() => onGenerate(lesson.lesson_id, lesson.title)}
                                disabled={busyOp}
                                className="rounded-lg bg-papa-accent px-3 py-1.5 text-sm font-semibold text-papa-bg disabled:opacity-50"
                              >
                                ⚡ Générer une carte
                              </button>
                            ) : (
                              // Le dérivé exige le cours canonique validé (ADR-0011) : pas de
                              // bouton grisé sans explication, on dit pourquoi.
                              <span className="rounded-lg border border-dashed border-papa-border px-3 py-1.5 text-xs text-papa-muted">
                                cours non validé — génération indisponible
                              </span>
                            ))}
                        </div>

                        {genLessonId === lesson.lesson_id && (
                          <div className="mt-3">
                            <GenerationProgress value={pct} label="Génération de la carte…" />
                          </div>
                        )}

                        {lesson.mindmaps.map((mindmap) => (
                          <FocusableCard
                            key={mindmap.id}
                            focused={mindmap.id === focusMindmapId}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="flex flex-wrap items-center gap-2 text-sm">
                                <ContentStatusBadge status={mindmap.validation_status} />
                                <span className="text-papa-muted">
                                  {mindmap.mindmap_json.nodes.length} nœuds · {mindmap.title}
                                </span>
                              </span>
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setPreview({ card: mindmap, lesson })}
                                  className="rounded-lg border border-papa-accent/50 bg-papa-accent/10 px-3 py-1.5 text-sm font-semibold text-papa-accent"
                                >
                                  👁 Aperçu
                                </button>
                                <ContentLifecycleActions
                                  status={mindmap.validation_status}
                                  itemLabel={mindmap.title}
                                  busy={busyMindmapId === mindmap.id || busyOp}
                                  destructionNotice={destructionNotice(mindmap)}
                                  onValidate={() =>
                                    runMindmap(mindmap.id, () => validateMindmap(mindmap.id))
                                  }
                                  onEdit={() => setPreview({ card: mindmap, lesson })}
                                  onRegenerate={() => onRegenerate(mindmap.id)}
                                  onDelete={() =>
                                    runMindmap(mindmap.id, () => deleteMindmap(mindmap.id))
                                  }
                                />
                              </div>
                            </div>

                            {mindmap.attempt_count > 0 && (
                              <p className="mt-2 text-xs text-papa-muted">
                                🧠 reconstruite {mindmap.attempt_count} fois
                                {mindmap.avg_score !== null && ` · moyenne ${mindmap.avg_score} %`}
                              </p>
                            )}

                            {regenMindmapId === mindmap.id && (
                              <div className="mt-3">
                                <GenerationProgress value={pct} label="Régénération de la carte…" />
                              </div>
                            )}
                          </FocusableCard>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      ) : null}

      {preview && (
        <MindmapPreviewModal
          card={preview.card}
          subjectName={subjectName}
          lessonTitle={preview.lesson.title}
          busy={busyMindmapId === preview.card.id || busyOp}
          onClose={() => setPreview(null)}
          onSaved={() => {
            setPreview(null);
            refresh();
          }}
          onValidate={() =>
            runMindmap(preview.card.id, () => validateMindmap(preview.card.id), true)
          }
          onRegenerate={() => onRegenerate(preview.card.id)}
          onDelete={() => runMindmap(preview.card.id, () => deleteMindmap(preview.card.id), true)}
        />
      )}
    </div>
  );
}
