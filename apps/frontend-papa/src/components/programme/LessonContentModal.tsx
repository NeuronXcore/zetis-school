import { Suspense, lazy, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { type CurriculumLesson, type LessonContentAuthor } from "@zetis/types";
import { Button, Spinner } from "@zetis/ui";
import { lessonActions } from "../../lib/chapterActions";
import { ProgressBar, useEstimatedProgress } from "../ProgressBar";
import { LessonSourceBadge, LessonStatusBadge } from "./badges";

// Modale « Lire le cours » d'une leçon (Lot 2) : lit `lesson.content` (markdown),
// pilote sa rédaction locale (~40-60 s, qwen3.6 via get_provider — jamais la dérogation
// cloud), permet de trancher SUR PLACE (Valider/Rejeter, `draft` seul — règle pure)
// et d'ÉCRIRE/ÉDITER le cours à la main (éditeur riche markdown, PATCH content —
// le statut ne bouge pas : Papa est l'autorité de validation). La provenance du cours
// (« Rédigé le … par IA/manuel ») s'affiche aussi en readOnly (page Matières).
// Overlay du patron CapsulesPilotagePage, Échap du patron ConfirmDialog.

// Éditeur riche chargé à la demande : le bundle Lexical/CodeMirror ne pèse que sur
// le mode édition (ni sur Matières en readOnly, ni sur la simple lecture).
const LessonContentEditor = lazy(() => import("./LessonContentEditor"));

// Styles markdown manuels (pas de plugin typography dans le repo) — partagés entre
// le rendu lecture et la zone éditable (l'édition ressemble au résultat).
const MARKDOWN_STYLES =
  "text-sm leading-relaxed [&_h1]:text-lg [&_h1]:font-bold [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:font-semibold [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mt-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mt-1 [&_strong]:font-semibold [&_code]:rounded [&_code]:bg-papa-bg [&_code]:px-1";

// Étiquette d'affichage seulement — la valeur stockée reste 'parent' (contrat API).
function authorLabel(author: LessonContentAuthor | null): string {
  return author === "ai" ? "IA" : author === "parent" ? "admin" : "?";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** « Rédigé le … par IA · Modifié le … par manuel » — la ligne Modifié n'apparaît
 *  que si un write postérieur au premier existe. Fallback si audit absent (cours
 *  antérieur à la migration non backfillé). */
function ContentProvenance({ lesson }: { lesson: CurriculumLesson }) {
  const created = lesson.content_created_at;
  const modified =
    lesson.content_updated_at !== null && lesson.content_updated_at !== created
      ? lesson.content_updated_at
      : null;
  return (
    <p className="text-xs text-papa-muted">
      {created
        ? `Rédigé le ${formatDate(created)} par ${authorLabel(lesson.content_created_by)}`
        : "Rédigé (date inconnue)"}
      {modified &&
        ` · Modifié le ${formatDate(modified)} par ${authorLabel(lesson.content_updated_by)}`}
    </p>
  );
}

export function LessonContentModal({
  lesson,
  generating,
  error,
  readOnly = false,
  onGenerate,
  onValidate,
  onReject,
  onSaveContent,
  onClose,
}: {
  lesson: CurriculumLesson;
  generating: boolean;
  error: string | null;
  /** Consultation pure (page Matières) : aucune action de rédaction ni de décision —
   *  l'édition du référentiel vit dans Programme. La provenance reste visible. */
  readOnly?: boolean;
  onGenerate?: () => void;
  onValidate?: () => void;
  onReject?: () => void;
  /** Écriture/édition manuelle du cours — doit LEVER en cas d'échec (l'éditeur reste
   *  ouvert avec le brouillon, l'erreur s'affiche via `error`). */
  onSaveContent?: (markdown: string) => Promise<void>;
  onClose: () => void;
}) {
  const actions = lessonActions(lesson.created_by, lesson.status);
  // Progression *estimée* : génération LOCALE (qwen3.6), plus lente que le cloud —
  // même calibrage que la génération de capsule (42 s), pas les 22 s de Sonnet.
  const generationPct = useEstimatedProgress(generating, 42000);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // En mode édition, Échap annule l'édition (brouillon jeté), pas la modale.
      if (editing) setEditing(false);
      else onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, editing]);

  function startEditing() {
    setDraft(lesson.content ?? "");
    setEditing(true);
  }

  async function save() {
    if (!onSaveContent || !draft.trim()) return;
    setSaving(true);
    try {
      await onSaveContent(draft);
      setEditing(false);
    } catch {
      // Erreur affichée via `error` (contentError du hook) ; le brouillon est conservé.
    } finally {
      setSaving(false);
    }
  }

  const canEditContent = !readOnly && !generating && onSaveContent !== undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      {/* Cadre arrondi = conteneur `overflow-hidden` ; le défilement vit sur le
          wrapper interne, dont la barre est rognée par l'arrondi du cadre (sinon
          elle « coupe » les coins droits). */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Cours : ${lesson.title}`}
        className="flex max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-2xl border border-papa-accent/30 bg-papa-surface shadow-[0_0_45px_-10px_rgba(16,185,129,0.45),0_0_90px_-18px_rgba(56,189,248,0.35)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="papa-scrollbar min-h-0 w-full overflow-y-auto p-6">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span aria-hidden>📖</span>
            <h2 className="min-w-0 font-semibold">{lesson.title}</h2>
            <LessonSourceBadge createdBy={lesson.created_by} />
            <LessonStatusBadge status={lesson.status} />
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {!readOnly && actions.canValidate && (
              <Button size="sm" onClick={onValidate} disabled={generating || editing}>
                Valider
              </Button>
            )}
            {!readOnly && actions.canReject && (
              <Button
                size="sm"
                variant="outline"
                onClick={onReject}
                disabled={generating || editing}
              >
                Rejeter
              </Button>
            )}
            <Button size="sm" variant="ghost" aria-label="Fermer" onClick={onClose}>
              ✕
            </Button>
          </div>
        </div>

        {lesson.summary && <p className="mb-3 text-xs text-papa-muted">{lesson.summary}</p>}

        {error && (
          <p className="mb-3 rounded-lg bg-rose-500/15 px-3 py-2 text-xs text-rose-300">
            {error}
          </p>
        )}

        {generating && (
          <div className="mb-3">
            <ProgressBar
              pct={generationPct}
              label="ZETIS rédige le cours (40 à 60 s, moteur local)…"
            />
          </div>
        )}

        {editing ? (
          <div className="flex flex-col gap-3">
            <Suspense
              fallback={
                <div className="flex justify-center py-10">
                  <Spinner size={20} />
                </div>
              }
            >
              <LessonContentEditor
                initialMarkdown={draft}
                onChange={setDraft}
                contentClassName={MARKDOWN_STYLES}
              />
            </Suspense>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void save()} disabled={!draft.trim() || saving}>
                {saving ? "Enregistrement…" : "Enregistrer"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditing(false)}
                disabled={saving}
              >
                Annuler
              </Button>
            </div>
          </div>
        ) : lesson.content === null ? (
          !generating && (
            <div className="flex flex-col items-start gap-3 py-2">
              <p className="text-sm text-papa-muted">
                Pas encore de cours rédigé pour cette leçon.
              </p>
              <div className="flex flex-wrap gap-2">
                {!readOnly && <Button onClick={onGenerate}>⚡ Rédiger le cours</Button>}
                {canEditContent && (
                  <Button variant="secondary" onClick={startEditing}>
                    ✎ Écrire à la main
                  </Button>
                )}
              </div>
            </div>
          )
        ) : (
          <>
            {/* Provenance + actions regroupées en tête : visibles sans faire défiler
                un long cours. La provenance reste seule en readOnly (Matières). */}
            <div className="mb-3 flex flex-col gap-2 border-b border-papa-border pb-3">
              <ContentProvenance lesson={lesson} />
              {!readOnly && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={generating}
                    onClick={onGenerate}
                  >
                    ↻ Régénérer le cours
                  </Button>
                  {canEditContent && (
                    <Button size="sm" variant="outline" onClick={startEditing}>
                      ✎ Modifier le cours
                    </Button>
                  )}
                </div>
              )}
            </div>
            <div className={MARKDOWN_STYLES}>
              <ReactMarkdown>{lesson.content}</ReactMarkdown>
            </div>
          </>
        )}
        </div>
      </div>
    </div>
  );
}
