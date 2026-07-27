import { useEffect, useState } from "react";
import { SubjectFilterChips, type SubjectFilterOption } from "@zetis/ui";
import type { ActivityHeatmap as ActivityHeatmapData } from "@zetis/types";
import { fetchHeatmap } from "../../lib/activity";
import { fetchSubjects } from "../../lib/subjects";
import { ActivityHeatmap } from "./ActivityHeatmap";
import { DayDetailPanel } from "./DayDetailPanel";

// Bloc « Régularité » du dashboard Papa : filtre matière + heatmap 26 semaines + badge de
// décrochage + panneau détail-jour inline.

const WEEKS = 26;

/** Seuil d'affichage du badge de décrochage (spec). Affiché À LA CONSULTATION uniquement :
 *  jamais de notification push — le pilotage par l'anxiété est refusé côté Papa comme côté
 *  Massimo. */
const DROPOUT_THRESHOLD = 4;

export function RegularityCard() {
  const [subjects, setSubjects] = useState<SubjectFilterOption[]>([]);
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [heatmap, setHeatmap] = useState<ActivityHeatmapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    fetchSubjects()
      .then((rows) =>
        setSubjects(rows.map((s) => ({ id: s.id, slug: s.slug, name: s.name }))),
      )
      .catch(() => setSubjects([])); // le filtre disparaît, la heatmap reste utilisable
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchHeatmap(WEEKS, subjectId)
      .then((data) => {
        if (!cancelled) {
          setHeatmap(data);
          setError(null);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [subjectId]);

  // Changer de matière remet le panneau à zéro : le journal affiché ne doit jamais rester sur un
  // filtre qui n'est plus celui de la grille.
  function handleSubjectChange(next: number | null) {
    setSubjectId(next);
    setSelectedDate(null);
  }

  const daysInactive = heatmap?.days_inactive ?? 0;
  const selectedSummary = heatmap?.days.find((d) => d.date === selectedDate);
  // Le journal sert des slugs (identifiants stables) ; Papa lit les noms.
  const subjectNames = new Map(subjects.map((s) => [s.slug, s.name]));

  return (
    <section className="mt-6 rounded-xl border border-papa-border bg-papa-surface p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Régularité de Massimo</h2>
        {daysInactive >= DROPOUT_THRESHOLD && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-papa-warn/15 px-3 py-1 text-xs font-semibold text-papa-warn">
            aucune activité depuis {daysInactive} jours
          </span>
        )}
        <span className="text-xs text-papa-muted">
          26 semaines · intensité = minutes actives · cliquer un jour
        </span>
      </div>

      {subjects.length > 0 && (
        <SubjectFilterChips
          subjects={subjects}
          value={subjectId}
          onChange={handleSubjectChange}
          className="mb-3.5"
        />
      )}

      {error && <p className="text-sm text-papa-warn">{error}</p>}
      {!error && !heatmap && <p className="text-sm text-papa-muted">Chargement de l'activité…</p>}

      {heatmap && (
        <>
          <ActivityHeatmap
            days={heatmap.days}
            weeks={WEEKS}
            selectedDate={selectedDate}
            onSelectDay={setSelectedDate}
          />

          {selectedDate ? (
            <DayDetailPanel
              date={selectedDate}
              summary={selectedSummary}
              subjectId={subjectId}
              subjectNames={subjectNames}
            />
          ) : (
            <p className="mt-4 border-t border-papa-border pt-3.5 text-sm italic text-papa-muted">
              Sélectionne un jour dans la grille pour voir le journal de la session.
            </p>
          )}
        </>
      )}

      <p className="mt-3.5 border-t border-papa-border pt-2.5 text-xs text-papa-muted">
        Minutes actives = somme des écarts entre interactions, plafonnés à 5 min. C'est un
        indicateur de <strong>présence</strong>, pas une mesure d'attention.
      </p>
    </section>
  );
}
