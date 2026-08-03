import { useEffect, useState } from "react";
import { type AgendaItemPilot, type AgendaKind, type CurriculumChapter } from "@zetis/types";
import { Button, Input, Select } from "@zetis/ui";
import { kindLabel, longDayLabel } from "../../lib/agendaModel";
import { type SubjectOption } from "./AgendaBatchEntry";

// Panneau de détail d'une échéance.
//
// Il porte les **trois refus** de l'ADR-0025, et il les ÉNONCE — une règle de co-édition non
// dite est vécue comme un bug :
//   1. aucune case à cocher (l'état est en lecture seule, « seul Massimo peut cocher ») ;
//   2. l'édition d'un item de Massimo PRÉVIENT qu'elle sera visible chez lui ;
//   3. « Archiver », jamais « Supprimer ».

const KINDS: AgendaKind[] = ["devoir", "controle", "rendu"];

interface Props {
  item: AgendaItemPilot;
  saving: boolean;
  onClose: () => void;
  onSave: (body: {
    label: string;
    due_on: string;
    kind: AgendaKind;
    chapter_id: number | null;
  }) => Promise<void>;
  onSaveNote: (note: string | null) => Promise<void>;
  onArchive: () => void;
  /** Référentiel de l'année active — porté par la PAGE, qui l'a déjà pour la grille de saisie.
   *  Le recharger ici en ferait un second chargeur pour la même donnée. */
  subjects: SubjectOption[];
  chaptersBySys: Record<number, CurriculumChapter[]>;
  chaptersLoading: Set<number>;
  onNeedChapters: (sysId: number) => void;
  /** Ouvre le Commander scopé sur ce chapitre. Optionnel : le panneau reste montable seul
   *  (tests, réutilisation) sans exiger le hook des missions. */
  onCommandMissions?: (chapterId: number) => void;
}

export function AgendaDetailPanel({
  item,
  saving,
  onClose,
  onSave,
  onSaveNote,
  onArchive,
  subjects,
  chaptersBySys,
  chaptersLoading,
  onNeedChapters,
  onCommandMissions,
}: Props) {
  const [label, setLabel] = useState(item.label);
  const [dueOn, setDueOn] = useState(item.due_on);
  const [kind, setKind] = useState<AgendaKind>(item.kind);
  const [chapterId, setChapterId] = useState<number | null>(item.chapter_id);
  const [note, setNote] = useState(item.parent_note ?? "");

  // Changer d'item réinitialise le formulaire : sans ça, la saisie en cours suivrait la
  // sélection et on écrirait sur la mauvaise échéance.
  useEffect(() => {
    setLabel(item.label);
    setDueOn(item.due_on);
    setKind(item.kind);
    setChapterId(item.chapter_id);
    setNote(item.parent_note ?? "");
  }, [item.id, item.label, item.due_on, item.kind, item.chapter_id, item.parent_note]);

  // ⚠️ Les chapitres sont indexés par `school_year_subject_id`, l'item ne connaît que
  // `subject_id` : la correspondance vit dans `subjects` (`useAgendaReferential`), on la lit,
  // on ne la refait pas.
  const sysId = subjects.find((s) => s.id === item.subject_id)?.sysId ?? null;
  const chapters = sysId !== null ? (chaptersBySys[sysId] ?? []) : [];

  // Chargement à la demande, une seule fois par matière — même patron que la grille de saisie.
  useEffect(() => {
    if (sysId !== null && chaptersBySys[sysId] === undefined) onNeedChapters(sysId);
  }, [sysId, chaptersBySys, onNeedChapters]);

  const byStudent = item.created_by === "student";
  const dirty =
    label !== item.label ||
    dueOn !== item.due_on ||
    kind !== item.kind ||
    chapterId !== item.chapter_id;
  const noteDirty = note !== (item.parent_note ?? "");

  return (
    <aside className="flex flex-col gap-4 rounded-xl border border-papa-border bg-papa-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold leading-tight">{item.label}</h2>
          <p className="mt-1 text-xs text-papa-muted">
            {item.subject?.name ?? "Sans matière"} · {longDayLabel(item.due_on)} ·{" "}
            {kindLabel(item.kind)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer le détail"
          className="rounded-md px-2 py-1 text-papa-muted transition-colors hover:text-papa-text"
        >
          ✕
        </button>
      </div>

      {/* Refus n°2 : pas de modification silencieuse. Papa décide en sachant que ce sera vu. */}
      {byStudent ? (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-200">
          ✎ Cette échéance a été saisie par Massimo. Si vous la modifiez, elle portera la mention
          « <b>complété par papa</b> » dans son agenda — il verra que vous y avez touché.
        </p>
      ) : (
        <p className="rounded-lg bg-papa-surface-2 px-3 py-2 text-xs leading-relaxed text-papa-muted">
          Échéance que vous avez ajoutée. Elle apparaît chez Massimo avec la mention « ajouté par
          papa ».
        </p>
      )}

      <label className="flex flex-col gap-1 text-xs text-papa-muted">
        Intitulé
        <Input value={label} onChange={(e) => setLabel(e.target.value)} />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs text-papa-muted">
          Date
          <Input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-papa-muted">
          Type
          <Select value={kind} onChange={(e) => setKind(e.target.value as AgendaKind)}>
            {KINDS.map((value) => (
              <option key={value} value={value}>
                {kindLabel(value)}
              </option>
            ))}
          </Select>
        </label>
      </div>

      {/* Le chapitre — facultatif partout (ADR-0025 §11), mais c'est LUI qui ouvre les deux
          portes : la production automatique (ADR-0035) et le Commander de missions. Il ne
          pouvait être posé qu'à la saisie en lot jusqu'au 2026-08-03 : un item mal saisi, ou
          saisi par Massimo, restait définitivement stérile alors que l'API l'acceptait déjà. */}
      <label className="flex flex-col gap-1 text-xs text-papa-muted">
        Chapitre
        {item.subject_id === null ? (
          <span className="rounded-lg border border-papa-border bg-papa-bg px-3 py-2 text-xs text-papa-muted">
            Choisissez d'abord une matière — les chapitres viennent du programme de l'année.
          </span>
        ) : (
          <Select
            value={chapterId ?? ""}
            aria-label="Chapitre"
            disabled={saving || (sysId !== null && chaptersLoading.has(sysId))}
            onChange={(e) => setChapterId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">
              {chapters.length === 0 ? "— aucun chapitre au programme —" : "— aucun —"}
            </option>
            {chapters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        )}
      </label>

      {/* Dit ce que le silence de ZETIS voudra dire — sinon le déclencheur paraît en panne.
          ⚠️ Volontairement INDÉPENDANT du `kind` : recopier `TRIGGERING_KINDS` ici en ferait une
          seconde source de vérité, qui divergerait au premier ADR (le devoir vient d'y entrer le
          2026-08-03). Et c'est exact pour tous les types — le chapitre ouvre AUSSI la porte du
          Commander, qui ne regarde aucun `kind`. */}
      {chapterId === null ? (
        <p className="rounded-lg border border-amber-400/40 bg-amber-500/5 px-3 py-2 text-xs leading-relaxed text-amber-200">
          Sans chapitre, <b className="text-papa-text">ZETIS ne pourra ni préparer cette échéance
          ni commander de missions dessus</b> — il ne saurait pas sur quoi travailler.
        </p>
      ) : (
        /* La porte « échéance » de l'ADR-0025 §11 — déclarée dès l'origine (`gate: "deadline"`
           existe depuis toujours dans `CommandPreviewRequest`) et jamais alimentée jusqu'ici.
           ⚠️ AUCUN moteur neuf : `resolve_chapter_notions` est déjà scopé par chapitre et
           `create_command_missions` prend déjà `due_date` + `force_priority`. C'est un bouton.
           ⚠️ Et c'est un GESTE de Papa, jamais le scan : produire du contenu sans clic est décidé
           (ADR-0035), PRESCRIRE du travail à Massimo sans clic ne l'est pas. */
        <button
          type="button"
          disabled={!onCommandMissions}
          onClick={() => onCommandMissions?.(chapterId)}
          title={
            onCommandMissions ? undefined : "Disponible depuis la page Agenda"
          }
          className="rounded-lg border border-papa-accent/40 px-3 py-2 text-xs font-semibold text-papa-accent transition-colors hover:bg-papa-accent/10 disabled:opacity-40"
        >
          🎯 Commander les missions de ce chapitre
        </button>
      )}

      {/* Refus n°1 : l'état est une pastille EN LECTURE SEULE. Aucune affordance de coche
          n'existe sur cette page — si l'API renvoyait 403, ce serait un bug d'ici. */}
      <div className="flex flex-col gap-1 text-xs text-papa-muted">
        État
        <div className="flex items-start gap-2 rounded-lg border border-papa-border bg-papa-bg px-3 py-2">
          <span
            aria-hidden
            className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
              item.done_at ? "bg-emerald-400" : "bg-papa-muted/50"
            }`}
          />
          <p className="text-xs leading-relaxed text-papa-text">
            {item.done_at ? (
              <>
                Coché par Massimo. <b>Vous ne pouvez pas décocher</b> à sa place.
              </>
            ) : (
              <>
                Pas encore coché — <b>seul Massimo peut cocher</b>. Vous ne pouvez pas marquer
                cette échéance comme faite à sa place.
              </>
            )}
          </p>
        </div>
      </div>

      <label className="flex flex-col gap-1 text-xs text-papa-muted">
        Note privée
        <textarea
          rows={3}
          value={note}
          placeholder="Visible par vous seul."
          onChange={(e) => setNote(e.target.value)}
          className="w-full rounded-lg border border-papa-border bg-papa-bg px-3 py-2 text-sm text-papa-text outline-none focus:border-papa-accent"
        />
        <span>🔒 Jamais servie à l'interface de Massimo.</span>
      </label>

      {item.edited_by_parent_at && (
        <p className="text-[11px] text-papa-muted">
          Corrigée par vous le{" "}
          {new Date(item.edited_by_parent_at).toLocaleString("fr-FR", {
            dateStyle: "short",
            timeStyle: "short",
          })}
        </p>
      )}
      {item.dismissed_at && (
        <p className="text-[11px] text-papa-muted">
          Masquée / archivée le{" "}
          {new Date(item.dismissed_at).toLocaleString("fr-FR", { dateStyle: "short" })} — la ligne
          est conservée.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={saving || (!dirty && !noteDirty)}
          onClick={() => {
            void (async () => {
              if (dirty) await onSave({ label, due_on: dueOn, kind, chapter_id: chapterId });
              if (noteDirty) await onSaveNote(note.trim() === "" ? null : note);
            })();
          }}
        >
          Enregistrer
        </Button>
        {/* Refus n°3 : « Archiver », jamais « Supprimer ». */}
        {!item.dismissed_at && (
          <Button size="sm" variant="ghost" disabled={saving} onClick={onArchive}>
            Archiver
          </Button>
        )}
      </div>
    </aside>
  );
}
