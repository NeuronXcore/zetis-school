import { type FormEvent, type ReactNode, useState } from "react";
import { type ChapterPatchRequest, type CurriculumChapter } from "@zetis/types";
import { Badge, Button, Input, cn } from "@zetis/ui";
import { chapterActions } from "../../lib/chapterActions";
import { RepartitionBadge, SourceBadge, ValidationBadge } from "./badges";

// Ligne de chapitre du référentiel : badges source + validation, actions selon l'état
// (règle pure `chapterActions`), état déplié (thèmes / classe / répartition + étage
// leçons via `lessonsSlot`, monté uniquement déplié → chargement paresseux), édition inline.

export function ChapterRow({
  chapter,
  isFirst,
  isLast,
  onValidate,
  onReject,
  onRegenerate,
  onEdit,
  onDelete,
  onMove,
  disabled,
  lessonsSlot,
}: {
  chapter: CurriculumChapter;
  isFirst: boolean;
  isLast: boolean;
  onValidate: () => void;
  onReject: () => void;
  onRegenerate: () => void;
  onEdit: (data: ChapterPatchRequest) => Promise<void>;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => void;
  disabled?: boolean;
  /** Étage leçons (Lot 2 Slice B) — rendu seulement quand la ligne est dépliée. */
  lessonsSlot?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const actions = chapterActions(chapter.source, chapter.validation_status);
  const rejected = chapter.validation_status === "rejected";

  return (
    <li
      className={cn(
        "rounded-2xl border px-4 py-3 transition-[border-color,background-color,box-shadow]",
        // Déplié = chapitre « au travail » : bordure accent + halo émeraude doux
        // (même langage que la modale de cours), la ligne ressort de la liste.
        // Branches EXCLUSIVES : deux utilitaires border/bg concurrents dans la même
        // liste laissent l'ordre de la feuille CSS décider (accent perdait).
        expanded
          ? "border-papa-accent/70 bg-papa-accent/5 shadow-[0_0_35px_-6px_rgba(16,185,129,0.6)]"
          : "border-papa-border bg-papa-surface/60",
        rejected && "opacity-60",
      )}
    >
      <div className="flex items-start gap-3">
        <ReorderButtons
          isFirst={isFirst}
          isLast={isLast}
          disabled={disabled}
          onMove={onMove}
        />
        <div className="min-w-0 flex-1">
          {editing ? (
            <EditForm
              chapter={chapter}
              onSubmit={async (data) => {
                await onEdit(data);
                setEditing(false);
              }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className={cn(
                    "flex min-w-0 items-center gap-1.5 text-left font-medium hover:text-emerald-200",
                    expanded && "text-emerald-200",
                  )}
                  onClick={() => setExpanded((v) => !v)}
                  aria-expanded={expanded}
                >
                  <span className="truncate">{chapter.name}</span>
                  <span aria-hidden className="text-xs text-papa-muted">
                    {expanded ? "▲" : "▼"}
                  </span>
                </button>
                <SourceBadge source={chapter.source} />
                <ValidationBadge status={chapter.validation_status} />
              </div>
              <Hint chapter={chapter} untouched={actions.untouchedByRegeneration} />
              {expanded && (
                <>
                  <ExpandedDetails chapter={chapter} />
                  {lessonsSlot}
                  {/* Second point de fermeture EN BAS : après avoir défilé un long
                      étage de leçons, le titre (seul autre toggle) est hors écran. */}
                  <div className="mt-2 border-t border-papa-border/60 pt-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Replier ${chapter.name}`}
                      onClick={() => setExpanded(false)}
                    >
                      ▲ Replier le chapitre
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
        {!editing && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
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
            {actions.canRegenerate && (
              <Button size="sm" variant="secondary" onClick={onRegenerate} disabled={disabled}>
                Régénérer
              </Button>
            )}
            {actions.canEdit && (
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Modifier ${chapter.name}`}
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
                aria-label={`Supprimer ${chapter.name}`}
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

export function ReorderButtons({
  isFirst,
  isLast,
  disabled,
  onMove,
}: {
  isFirst: boolean;
  isLast: boolean;
  disabled?: boolean;
  onMove: (direction: -1 | 1) => void;
}) {
  return (
    <div className="flex shrink-0 flex-col">
      <button
        type="button"
        aria-label="Monter"
        className="px-1 text-xs text-papa-muted hover:text-papa-text disabled:opacity-30"
        disabled={disabled || isFirst}
        onClick={() => onMove(-1)}
      >
        ▲
      </button>
      <button
        type="button"
        aria-label="Descendre"
        className="px-1 text-xs text-papa-muted hover:text-papa-text disabled:opacity-30"
        disabled={disabled || isLast}
        onClick={() => onMove(1)}
      >
        ▼
      </button>
    </div>
  );
}

// Sous-titre contextuel (spec) : provenance IA à valider, ou rappel « intouchable ».
function Hint({ chapter, untouched }: { chapter: CurriculumChapter; untouched: boolean }) {
  if (chapter.source === "generated" && chapter.validation_status === "pending") {
    return <p className="mt-0.5 text-xs text-papa-muted">Proposé par ZETIS</p>;
  }
  if (untouched && chapter.source === "manual") {
    return <p className="mt-0.5 text-xs text-papa-muted">Intouchable par la régénération</p>;
  }
  return null;
}

// État déplié : description (texte humain) + métadonnées dépliées par l'API (13-bis).
function ExpandedDetails({ chapter }: { chapter: CurriculumChapter }) {
  return (
    <div className="mt-2 flex flex-col gap-2 border-t border-papa-border pt-2 text-sm">
      {chapter.description && <p className="text-papa-muted">{chapter.description}</p>}
      {chapter.themes && chapter.themes.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-papa-muted">Thèmes :</span>
          {chapter.themes.map((t) => (
            <Badge key={t} variant="muted">
              {t}
            </Badge>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs text-papa-muted">
        {chapter.suggested_class && <span>Classe suggérée : {chapter.suggested_class}</span>}
        {chapter.repartition && <RepartitionBadge repartition={chapter.repartition} />}
        {chapter.period && <span>Période : {chapter.period}</span>}
      </div>
    </div>
  );
}

// Édition inline : nom / description / période (PATCH partiel).
function EditForm({
  chapter,
  onSubmit,
  onCancel,
}: {
  chapter: CurriculumChapter;
  onSubmit: (data: ChapterPatchRequest) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(chapter.name);
  const [description, setDescription] = useState(chapter.description ?? "");
  const [period, setPeriod] = useState(chapter.period ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handle(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || null,
        period: period.trim() || null,
      });
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handle} className="flex flex-col gap-2">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="Titre du chapitre"
        autoFocus
      />
      <Input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (visible par Massimo)"
        aria-label="Description"
      />
      <Input
        value={period}
        onChange={(e) => setPeriod(e.target.value)}
        placeholder="Période (ex : Trimestre 1)"
        aria-label="Période"
        className="max-w-52"
      />
      {err && <p className="text-xs text-rose-300">{err}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!name.trim() || saving}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
