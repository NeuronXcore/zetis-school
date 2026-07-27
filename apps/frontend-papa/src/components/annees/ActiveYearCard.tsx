import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { type SchoolYear, type SchoolYearSubjectRef } from "@zetis/types";
import { Badge, Button, Input } from "@zetis/ui";
import { formatDateRange, programmeLine, yearActions } from "../../lib/yearDisplay";
import { YearSubjectChips } from "./YearSubjectChips";

// Carte « Année active » (spec page-annees-scolaires.md) : cadre temporel + résolution
// informative du programme. Le CONTENU de l'année vit dans la page Programme — le pont
// est le seul lien « Voir le programme → ». Édition inline : libellé et dates
// uniquement (le niveau est immuable après création — le backend le garantit).

export function ActiveYearCard({
  year,
  subjects,
  onSave,
}: {
  year: SchoolYear;
  subjects: SchoolYearSubjectRef[] | null;
  onSave: (data: {
    label: string;
    starts_on: string | null;
    ends_on: string | null;
  }) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const { badge, canEdit, showProgramLink } = yearActions(year.status);
  const programme = programmeLine(year.level, year.program_version);
  const dates = formatDateRange(year.starts_on, year.ends_on);

  return (
    <section className="rounded-2xl border border-papa-accent/40 bg-papa-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">
          <span aria-hidden="true" className="text-papa-accent">
            ●{" "}
          </span>
          Année active : {year.label} · {year.level}
        </p>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>

      {editing ? (
        <EditYearForm
          year={year}
          onSave={async (data) => {
            await onSave(data);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="mt-3 flex flex-col gap-2 text-sm">
          {dates && <p className="text-papa-muted">{dates}</p>}
          {programme && <p className="text-papa-muted">Programme : {programme}</p>}
          {subjects && subjects.length > 0 && (
            <div className="mt-1 flex items-start gap-2">
              <span className="pt-0.5 text-papa-muted">Matières :</span>
              <YearSubjectChips subjects={subjects} />
            </div>
          )}
          <div className="mt-3 flex items-center justify-between">
            {showProgramLink ? (
              <Link
                to="/programme"
                className="text-sm font-medium text-papa-accent hover:underline"
              >
                Voir le programme →
              </Link>
            ) : (
              <span />
            )}
            {canEdit && (
              <Button variant="outline" onClick={() => setEditing(true)}>
                Modifier
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// Formulaire d'édition inline de la carte : mêmes champs que le PATCH (jamais le niveau).
function EditYearForm({
  year,
  onSave,
  onCancel,
}: {
  year: SchoolYear;
  onSave: (data: {
    label: string;
    starts_on: string | null;
    ends_on: string | null;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(year.label);
  const [startsOn, setStartsOn] = useState(year.starts_on ?? "");
  const [endsOn, setEndsOn] = useState(year.ends_on ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handle(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      await onSave({
        label: label.trim(),
        starts_on: startsOn || null,
        ends_on: endsOn || null,
      });
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handle} className="mt-3 flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Input
          aria-label="Libellé"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          autoFocus
        />
        <Input
          type="date"
          aria-label="Date de début"
          value={startsOn}
          onChange={(e) => setStartsOn(e.target.value)}
        />
        <Input
          type="date"
          aria-label="Date de fin"
          value={endsOn}
          onChange={(e) => setEndsOn(e.target.value)}
        />
      </div>
      <p className="text-xs text-papa-muted">
        Le niveau ({year.level}) n'est pas modifiable une fois l'année créée.
      </p>
      {err && <p className="text-xs text-rose-300">{err}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={!label.trim() || saving}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
