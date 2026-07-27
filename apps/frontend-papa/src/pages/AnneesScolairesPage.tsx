import { useState } from "react";
import { type SchoolYear } from "@zetis/types";
import { Button, ConfirmDialog, EmptyState, Spinner } from "@zetis/ui";
import { PageHeader } from "../components/PageHeader";
import { ActiveYearCard } from "../components/annees/ActiveYearCard";
import { CreateYearForm } from "../components/annees/CreateYearForm";
import { YearHistoryRow } from "../components/annees/YearHistoryRow";
import { useSchoolYears } from "../hooks/useSchoolYears";

// Page Années scolaires réconciliée (ADR-0009 §4/§9) : cadre TEMPOREL de la scolarité
// (année active, dates, niveau, historique, création). Le CONTENU de l'année vit dans
// la page Programme. Aucun sélecteur de mode : la co-construction Papa/IA est un état
// PAR NŒUD (source + validation_status), jamais une propriété de l'année.
export function AnneesScolairesPage() {
  const data = useSchoolYears();
  const [creating, setCreating] = useState(false);
  const [toActivate, setToActivate] = useState<SchoolYear | null>(null);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Années scolaires"
        subtitle="Cadre temporel de l'année de Massimo — le contenu vit dans Programme"
        actions={
          <Button onClick={() => setCreating(true)} disabled={creating || data.loading}>
            + Créer une année
          </Button>
        }
      />

      {data.actionError && (
        <p className="mb-4 rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-300">
          {data.actionError}
        </p>
      )}

      {creating && (
        <CreateYearForm
          onCreate={async (year) => {
            await data.create(year);
            setCreating(false);
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      {data.loading ? (
        <div className="flex justify-center py-16">
          <Spinner size={28} />
        </div>
      ) : data.error ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm text-rose-300">{data.error}</p>
          <Button variant="outline" onClick={data.retry}>
            Réessayer
          </Button>
        </div>
      ) : data.years.length === 0 ? (
        <EmptyState
          icon="🗓️"
          title="Aucune année scolaire"
          description="Crée la première année de Massimo pour poser le cadre temporel — le programme se construit ensuite dans la page Programme."
          action={
            <Button onClick={() => setCreating(true)} disabled={creating}>
              + Créer une année
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {data.activeYear ? (
            <ActiveYearCard
              year={data.activeYear}
              subjects={data.activeSubjects}
              onSave={(patch) => data.update(data.activeYear!.id, patch)}
            />
          ) : (
            <p className="rounded-xl border border-papa-border bg-papa-surface px-4 py-3 text-sm text-papa-muted">
              Aucune année active — active une année de l'historique ci-dessous.
            </p>
          )}

          {data.history.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-papa-muted">Historique</h2>
              <ul className="flex flex-col gap-2">
                {data.history.map((year) => (
                  <YearHistoryRow
                    key={year.id}
                    year={year}
                    onActivate={() => setToActivate(year)}
                  />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      <ConfirmDialog
        open={toActivate !== null}
        title="Activer l'année"
        confirmLabel="Activer"
        onConfirm={() => {
          if (toActivate) void data.activate(toActivate.id);
          setToActivate(null);
        }}
        onCancel={() => setToActivate(null)}
      >
        « {toActivate?.label} · {toActivate?.level} » deviendra l'année active
        {data.activeYear ? ` et « ${data.activeYear.label} » passera en Archivée` : ""}.
        Une seule année est active à la fois.
      </ConfirmDialog>
    </div>
  );
}
