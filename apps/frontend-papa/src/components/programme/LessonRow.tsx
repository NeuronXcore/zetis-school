import { type FormEvent, useState } from "react";
import { type CurriculumLesson, type LessonPatchRequest } from "@zetis/types";
import { Badge, Button, Input } from "@zetis/ui";
import { lessonActions } from "../../lib/chapterActions";
import { LessonSourceBadge, LessonStatusBadge } from "./badges";
import { ReorderButtons } from "./ChapterRow";

// Ligne de leçon de l'étage déplié (Lot 2 Slice B) : badges created_by + status,
// notions en chips lecture seule, actions selon l'état (règle pure `lessonActions`).
// Les leçons `archived` ne sont jamais rendues (filtrées en amont par le panneau).

export function LessonRow({
  lesson,
  isFirst,
  isLast,
  onValidate,
  onReject,
  onEdit,
  onDelete,
  onMove,
  onRead,
  disabled,
}: {
  lesson: CurriculumLesson;
  isFirst: boolean;
  isLast: boolean;
  onValidate: () => void;
  onReject: () => void;
  onEdit: (data: LessonPatchRequest) => Promise<void>;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => void;
  /** Ouvre la modale « Lire le cours » (contenu complet + rédaction locale). */
  onRead: () => void;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const actions = lessonActions(lesson.created_by, lesson.status);

  return (
    <li className="rounded-xl border border-papa-border/70 bg-papa-bg/50 px-3 py-2">
      <div className="flex items-start gap-2">
        <ReorderButtons
          isFirst={isFirst}
          isLast={isLast}
          disabled={disabled}
          onMove={onMove}
        />
        <div className="min-w-0 flex-1">
          {editing ? (
            <EditLessonForm
              lesson={lesson}
              onSubmit={async (data) => {
                await onEdit(data);
                setEditing(false);
              }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span aria-hidden className="text-sm">
                  📄
                </span>
                <span className="min-w-0 truncate text-sm font-medium">
                  {lesson.title}
                </span>
                <LessonSourceBadge createdBy={lesson.created_by} />
                <LessonStatusBadge status={lesson.status} />
              </div>
              {lesson.summary && (
                <p className="mt-0.5 text-xs text-papa-muted">{lesson.summary}</p>
              )}
              {lesson.notions.length > 0 && (
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-papa-muted">notions :</span>
                  {lesson.notions.map((n) => (
                    <Badge key={n.skill_id} variant="muted">
                      {n.name}
                    </Badge>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        {!editing && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            {actions.canReadContent && (
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Lire le cours de ${lesson.title}`}
                onClick={onRead}
                disabled={disabled}
              >
                📖
              </Button>
            )}
            {actions.canValidate && (
              <Button size="sm" onClick={onValidate} disabled={disabled}>
                Valider
              </Button>
            )}
            {actions.canReject && (
              <Button size="sm" variant="outline" onClick={onReject} disabled={disabled}>
                Rejeter
              </Button>
            )}
            {actions.canEdit && (
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Modifier ${lesson.title}`}
                onClick={() => setEditing(true)}
                disabled={disabled}
              >
                ✎
              </Button>
            )}
            {actions.canDelete && (
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Supprimer ${lesson.title}`}
                onClick={onDelete}
                disabled={disabled}
              >
                🗑
              </Button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

// Édition inline : titre / résumé / notions. L'enregistrement REMPLACE le rattachement
// des notions (`PATCH notions`) — les `Skill` elles-mêmes ne sont jamais supprimées.
function EditLessonForm({
  lesson,
  onSubmit,
  onCancel,
}: {
  lesson: CurriculumLesson;
  onSubmit: (data: LessonPatchRequest) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(lesson.title);
  const [summary, setSummary] = useState(lesson.summary ?? "");
  const [notions, setNotions] = useState<string[]>(lesson.notions.map((n) => n.name));
  const [newNotion, setNewNotion] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function addNotion() {
    const name = newNotion.trim();
    if (!name) return;
    // Dédup locale par casse — le backend normalise de toute façon (upsert par nom normalisé).
    if (!notions.some((n) => n.toLowerCase() === name.toLowerCase())) {
      setNotions([...notions, name]);
    }
    setNewNotion("");
  }

  async function handle(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      await onSubmit({ title: title.trim(), summary: summary.trim() || null, notions });
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handle} className="flex flex-col gap-2">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="Titre de la leçon"
        autoFocus
      />
      <Input
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder="Résumé (optionnel)"
        aria-label="Résumé"
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-papa-muted">notions :</span>
        {notions.length === 0 && <span className="text-xs text-papa-muted">aucune</span>}
        {notions.map((n) => (
          <Badge key={n} variant="muted">
            {n}
            <button
              type="button"
              aria-label={`Retirer la notion ${n}`}
              className="ml-0.5 hover:text-rose-300"
              onClick={() => setNotions(notions.filter((x) => x !== n))}
            >
              ×
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={newNotion}
          onChange={(e) => setNewNotion(e.target.value)}
          placeholder="Ajouter une notion"
          aria-label="Nouvelle notion"
          className="max-w-60"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addNotion();
            }
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={addNotion}
          disabled={!newNotion.trim()}
        >
          Ajouter
        </Button>
      </div>
      {err && <p className="text-xs text-rose-300">{err}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!title.trim() || saving}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
