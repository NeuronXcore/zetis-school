import { useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { SCHOOL_YEAR } from "../data/mock";

const MODES = [
  { id: "full", label: "Full IA", desc: "ZETIS propose toute la structure, Papa valide." },
  { id: "hybride", label: "Hybride", desc: "ZETIS propose, Papa ajuste." },
  { id: "manuel", label: "Manuel", desc: "Papa configure directement." },
];

// Années scolaires Papa (Étape 8) — gestion de l'année + mode IA (mock).
export function AnneesScolairesPage() {
  const [mode, setMode] = useState("hybride");

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Années scolaires"
        subtitle={`Année active : ${SCHOOL_YEAR.label} · ${SCHOOL_YEAR.level}`}
        actions={
          <>
            <button type="button" className="rounded-lg border border-papa-border px-4 py-2 text-sm font-medium">
              Importer un programme
            </button>
            <button type="button" className="rounded-lg bg-papa-accent px-4 py-2 text-sm font-semibold text-papa-bg">
              Créer une année
            </button>
          </>
        }
      />

      <p className="mb-2 text-sm font-semibold">Mode de configuration</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            className={`rounded-xl border p-4 text-left transition-colors ${
              mode === m.id
                ? "border-papa-accent bg-papa-accent/10"
                : "border-papa-border bg-papa-surface hover:bg-papa-surface-2"
            }`}
          >
            <p className="font-semibold">{m.label}</p>
            <p className="mt-1 text-xs text-papa-muted">{m.desc}</p>
          </button>
        ))}
      </div>

      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-papa-border bg-papa-surface p-4">
          <p className="font-semibold">Paramètres généraux</p>
          <ul className="mt-2 space-y-1 text-sm text-papa-muted">
            <li>Niveau : {SCHOOL_YEAR.level}</li>
            <li>Rythme : {SCHOOL_YEAR.pace}</li>
            <li>Mode : {MODES.find((m) => m.id === mode)?.label}</li>
          </ul>
        </div>
        <div className="rounded-xl border border-papa-border bg-papa-surface p-4">
          <p className="font-semibold">Matières ({SCHOOL_YEAR.subjects.length})</p>
          <p className="mt-2 text-sm text-papa-muted">{SCHOOL_YEAR.subjects.join(", ")}</p>
        </div>
      </section>
    </div>
  );
}
