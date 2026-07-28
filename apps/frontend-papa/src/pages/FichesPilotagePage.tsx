import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ContentLifecycleActions,
  ContentStatusBadge,
  GenerationProgress,
  SoundToggle,
  useCelebrate,
  useEstimatedProgress,
} from "@zetis/ui";
import { type FicheDetail, type FichePilotageTree } from "@zetis/types";
import { FicheEditorModal } from "../components/FicheEditorModal";
import { FocusableCard } from "../components/FocusableCard";
import { PageHeader } from "../components/PageHeader";
import { type Subject, fetchSubjects } from "../lib/subjects";
import { subjectEmoji } from "../lib/subjectEmoji";
import { subjectIconFor } from "../lib/subjectIcons";
import {
  deleteFiche,
  fetchFichePilotage,
  generateFiche,
  regenerateFiche,
  validateFiche,
} from "../lib/fiches";

// Pilotage Fiches Papa (émeraude) : par matière, les leçons validées + leurs fiches. Génération
// par leçon (barre estimée + célébration), cycle de vie par fiche (briques @zetis/ui partagées),
// édition via formulaire structuré (FicheEditorModal, revalidé → pending). Aucune action locale.

const GEN_MS = 32000; // génération LLM locale d'une fiche (~20-40 s)

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

export function FichesPilotagePage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState<number | null>(null);
  // Lien profond depuis la Couverture : ?subject=<id>&focus=<fiche_id>. La matière visée prime
  // sur la première de la liste, sinon on atterrirait à côté de l'objet cherché.
  const [params] = useSearchParams();
  const focusSubjectId = Number(params.get("subject")) || null;
  const focusFicheId = Number(params.get("focus")) || null;
  const [tree, setTree] = useState<FichePilotageTree | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Op longue en cours : génération (par leçon) ou régénération (par fiche) — pilote la barre.
  const [genLessonId, setGenLessonId] = useState<number | null>(null);
  const [regenFicheId, setRegenFicheId] = useState<number | null>(null);
  const [busyFicheId, setBusyFicheId] = useState<number | null>(null);
  // Modale d'édition (formulaire structuré — FicheEditorModal).
  const [edit, setEdit] = useState<{ fiche: FicheDetail } | null>(null);

  const celebrate = useCelebrate();
  const busyOp = genLessonId !== null || regenFicheId !== null;
  const pct = useEstimatedProgress(busyOp, GEN_MS);

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
    fetchFichePilotage(sid)
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
      await generateFiche(lessonId);
      celebrate({ title: "Fiche créée !", subtitle: lessonTitle });
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Génération échouée.");
    } finally {
      setGenLessonId(null);
    }
  }

  async function onRegenerate(id: number) {
    setRegenFicheId(id);
    setError(null);
    try {
      await regenerateFiche(id);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Régénération échouée.");
    } finally {
      setRegenFicheId(null);
    }
  }

  async function runFiche(id: number, fn: () => Promise<unknown>) {
    setBusyFicheId(id);
    setError(null);
    try {
      await fn();
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action échouée.");
    } finally {
      setBusyFicheId(null);
    }
  }

  function openEdit(fiche: FicheDetail) {
    setEdit({ fiche });
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="🗂️ Fiches — Pilotage"
        subtitle="Génère, valide et édite les fiches de révision (une fiche = une leçon)."
        actions={<SoundToggle />}
      />

      {/* Sélecteur de matière */}
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
          (page Programme) pour pouvoir générer sa fiche.
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
                {lesson.fiches.length === 0 && (
                  <button
                    type="button"
                    onClick={() => onGenerate(lesson.lesson_id, lesson.title)}
                    disabled={busyOp || !lesson.has_content}
                    title={lesson.has_content ? "" : "La leçon n'a pas encore de cours rédigé."}
                    className="rounded-lg bg-papa-accent px-3 py-1.5 text-sm font-semibold text-papa-bg disabled:opacity-50"
                  >
                    ✨ Générer une fiche
                  </button>
                )}
              </div>

              {genLessonId === lesson.lesson_id && (
                <div className="mt-3">
                  <GenerationProgress value={pct} label="Génération de la fiche…" />
                </div>
              )}

              {lesson.fiches.map((fiche) => (
                <FocusableCard key={fiche.id} focused={fiche.id === focusFicheId}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm">
                      <ContentStatusBadge status={fiche.validation_status} />
                      <span className="text-papa-muted">
                        {fiche.spec.definitions.length} déf. · {fiche.spec.points_cles.length} points
                        clés
                      </span>
                    </span>
                    <ContentLifecycleActions
                      status={fiche.validation_status}
                      itemLabel={fiche.title}
                      busy={busyFicheId === fiche.id || busyOp}
                      onValidate={() => runFiche(fiche.id, () => validateFiche(fiche.id))}
                      onEdit={() => openEdit(fiche)}
                      onRegenerate={() => onRegenerate(fiche.id)}
                      onDelete={() => runFiche(fiche.id, () => deleteFiche(fiche.id))}
                    />
                  </div>
                  {regenFicheId === fiche.id && (
                    <div className="mt-3">
                      <GenerationProgress value={pct} label="Régénération de la fiche…" />
                    </div>
                  )}
                </FocusableCard>
              ))}
            </div>
          ))}
        </div>
      ) : null}

      {/* Édition : formulaire structuré (plus de JSON brut) */}
      {edit && (
        <FicheEditorModal
          fiche={edit.fiche}
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
