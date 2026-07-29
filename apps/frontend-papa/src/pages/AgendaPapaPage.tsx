import { useState } from "react";
import { type AgendaItemPilot } from "@zetis/types";
import { ConfirmDialog, EmptyState, Spinner } from "@zetis/ui";
import { PageHeader } from "../components/PageHeader";
import { KpiCard } from "../components/KpiCard";
import { AgendaBatchEntry } from "../components/agenda/AgendaBatchEntry";
import { AgendaDetailPanel } from "../components/agenda/AgendaDetailPanel";
import { AgendaTags, AgendaWeekBoard } from "../components/agenda/AgendaWeekBoard";
import { StudentEntrySwitch } from "../components/agenda/StudentEntrySwitch";
import { useAgenda, useAgendaReferential } from "../hooks/useAgenda";
import {
  AGENDA_PERIODS,
  addDays,
  longDayLabel,
  mondayOf,
  weekColumns,
} from "../lib/agendaModel";

// Page Papa « Agenda — cahier de texte » (ADR-0025, Lot 1).
//
// Surface de SAISIE : en phase 0, Papa est la seule source d'items, la qualité de l'agenda de
// Massimo dépend entièrement d'elle. D'où l'ordre vertical — la grille de saisie avant la
// lecture de la semaine.
//
// **Aucune case à cocher nulle part** : c'est l'invariant principal de cette page (§2b). Aucune
// logique métier ici (cf. `useAgenda` et `lib/agendaModel`).

export function AgendaPapaPage() {
  const agenda = useAgenda();
  const referential = useAgendaReferential();
  const [selected, setSelected] = useState<AgendaItemPilot | null>(null);
  const [toArchive, setToArchive] = useState<AgendaItemPilot | null>(null);

  // La sélection suit le rechargement : après une correction, l'item du panneau doit être la
  // version fraîche du serveur (c'est lui qui pose `edited_by_parent_at`).
  const current = selected ? (agenda.items.find((i) => i.id === selected.id) ?? null) : null;

  const monday = mondayOf(
    agenda.filter.period === "next" ? addDays(agenda.today, 7) : agenda.today,
  );
  const isBoard = agenda.filter.period === "current" || agenda.filter.period === "next";

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Agenda — cahier de texte"
        subtitle="Ce que le collège demande à Massimo. Vous et lui y écrivez tous les deux ; lui seul coche. Vos corrections apparaissent dans son agenda, jamais en silence."
      />

      {agenda.error && (
        <p className="mb-4 rounded-lg bg-amber-500/15 px-3 py-2 text-sm text-amber-300">
          {agenda.error}{" "}
          <button type="button" onClick={agenda.reload} className="underline">
            Réessayer
          </button>
        </p>
      )}

      {agenda.loading ? (
        <div className="flex items-center gap-2 text-sm text-papa-muted">
          <Spinner /> Chargement…
        </div>
      ) : (
        <>
          {/* KPI — remarquer l'absence volontaire d'un compteur d'items non faits : ce serait
              contourner par l'affichage l'invariant tenu serveur (ADR-0025 §3). */}
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="échéances cette semaine" value={String(agenda.kpis.weekCount)} />
            <KpiCard label="contrôles à venir" value={String(agenda.kpis.upcomingControls)} />
            <KpiCard
              label="saisis par Massimo / par vous"
              value={`${agenda.kpis.byStudent} / ${agenda.kpis.byParent}`}
              hint={
                agenda.studentEntryEnabled ? undefined : "sa saisie n'est pas encore ouverte"
              }
            />
            <KpiCard label="cochés par Massimo" value={String(agenda.kpis.checked)} />
          </div>

          <div className="mb-5">
            <AgendaBatchEntry
              subjects={referential.subjects}
              chaptersBySys={referential.chaptersBySys}
              chaptersLoading={referential.chaptersLoading}
              onNeedChapters={referential.loadChapters}
              saving={agenda.saving}
              onSubmit={agenda.createItems}
            />
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            {AGENDA_PERIODS.map((period) => (
              <button
                key={period.key}
                type="button"
                onClick={() => agenda.setPeriod(period.key)}
                aria-pressed={agenda.filter.period === period.key}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  agenda.filter.period === period.key
                    ? "border-papa-accent bg-papa-accent/15 text-papa-accent"
                    : "border-papa-border text-papa-muted hover:text-papa-text"
                }`}
              >
                {period.label}
              </button>
            ))}
            <select
              aria-label="Filtrer par matière"
              value={agenda.filter.subjectId ?? ""}
              onChange={(e) =>
                agenda.setSubjectId(e.target.value === "" ? null : Number(e.target.value))
              }
              className="ml-auto rounded-lg border border-papa-border bg-papa-bg px-3 py-1.5 text-xs outline-none focus:border-papa-accent"
            >
              <option value="">Toutes les matières</option>
              {referential.subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div>
              {isBoard ? (
                <AgendaWeekBoard
                  columns={weekColumns(agenda.visible, monday, agenda.today)}
                  selectedId={current?.id ?? null}
                  onSelect={setSelected}
                />
              ) : agenda.visible.length === 0 ? (
                <EmptyState
                  icon="🗓️"
                  title={
                    agenda.filter.period === "archived"
                      ? "Aucune échéance archivée"
                      : "Rien d'annoncé pour l'instant"
                  }
                  description={
                    agenda.filter.period === "archived"
                      ? "Les échéances archivées par vous, ou masquées par Massimo, se retrouvent ici. Rien n'est jamais effacé."
                      : "Ajoutez les échéances relevées sur l'ENT avec la grille ci-dessus."
                  }
                />
              ) : (
                <AgendaFlatList
                  items={agenda.visible}
                  selectedId={current?.id ?? null}
                  onSelect={setSelected}
                />
              )}
            </div>

            <div className="flex flex-col gap-4">
              {current && (
                <AgendaDetailPanel
                  item={current}
                  saving={agenda.saving}
                  onClose={() => setSelected(null)}
                  onSave={(body) => agenda.updateItem(current.id, body)}
                  onSaveNote={(note) => agenda.updateNote(current.id, note)}
                  onArchive={() => setToArchive(current)}
                />
              )}
              <StudentEntrySwitch
                enabled={agenda.studentEntryEnabled}
                onChange={(enabled) => void agenda.toggleStudentEntry(enabled)}
              />
            </div>
          </div>
        </>
      )}

      {/* « Archiver », jamais « supprimer » : la ligne reste en base et reste retrouvable. */}
      <ConfirmDialog
        open={toArchive !== null}
        title="Archiver cette échéance ?"
        confirmLabel="Archiver"
        busy={agenda.saving}
        onCancel={() => setToArchive(null)}
        onConfirm={() => {
          const target = toArchive;
          setToArchive(null);
          if (target)
            void agenda.archive(target.id).then(() => {
              if (selected?.id === target.id) setSelected(null);
            });
        }}
      >
        <p className="text-sm">
          Elle disparaît de l'agenda de Massimo mais <b>n'est pas supprimée</b> : la ligne est
          conservée et reste consultable sous le filtre « Archivés ».
        </p>
      </ConfirmDialog>
    </div>
  );
}

/** Liste à plat pour « Tout à venir » et « Archivés » — sept colonnes n'auraient aucun sens
 *  au-delà d'une semaine. Groupée par jour, dans l'ordre des échéances. */
function AgendaFlatList({
  items,
  selectedId,
  onSelect,
}: {
  items: AgendaItemPilot[];
  selectedId: number | null;
  onSelect: (item: AgendaItemPilot) => void;
}) {
  const days = [...new Set(items.map((item) => item.due_on))].sort();
  return (
    <div className="flex flex-col gap-4">
      {days.map((day) => (
        <div key={day}>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-papa-muted">
            {longDayLabel(day)}
          </p>
          <div className="flex flex-col gap-1.5">
            {items
              .filter((item) => item.due_on === day)
              .map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item)}
                  aria-pressed={item.id === selectedId}
                  style={{ borderLeftColor: item.subject?.color ?? undefined }}
                  className={`flex flex-wrap items-center gap-2 rounded-lg border border-papa-border border-l-2 bg-papa-surface px-3 py-2 text-left transition-colors hover:border-papa-accent/60 ${
                    item.id === selectedId ? "ring-1 ring-papa-accent" : ""
                  } ${item.dismissed_at ? "opacity-50" : ""}`}
                >
                  <span className="text-sm">{item.label}</span>
                  <span className="ml-auto flex flex-wrap gap-1">
                    <AgendaTags item={item} />
                  </span>
                </button>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
