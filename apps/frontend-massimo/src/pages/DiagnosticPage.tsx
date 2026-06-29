import { useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { DIAGNOSTIC_RESULT } from "../data/mock";

const OPTIONS = [
  { id: "all", title: "Toutes les matières", desc: "Un tour d'horizon complet" },
  { id: "one", title: "Une matière", desc: "Cible une matière précise" },
  { id: "fast", title: "Rapide 10 min", desc: "Quelques questions clés" },
];

// Page Diagnostic Massimo (Étape 7) — positionnement bienveillant, résultat mocké.
export function DiagnosticPage() {
  const [selected, setSelected] = useState("all");
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="C'est noté ✨" subtitle="Voici ce que ZETIS retient." />
        <section className="rounded-2xl border border-zetis-border bg-zetis-surface p-5">
          <p className="font-semibold text-emerald-300">Tes forces</p>
          <ul className="mt-2 list-inside list-disc text-sm text-zetis-muted">
            {DIAGNOSTIC_RESULT.strengths.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>
        <section className="mt-4 rounded-2xl border border-zetis-border bg-zetis-surface p-5">
          <p className="font-semibold text-zetis-accent-2">Tes prochaines missions</p>
          <ul className="mt-2 space-y-2">
            {DIAGNOSTIC_RESULT.nextMissions.map((m) => (
              <li
                key={m.notion}
                className="flex items-center justify-between rounded-lg bg-zetis-surface-2 px-3 py-2 text-sm"
              >
                <span>
                  {m.subject} — {m.notion}
                </span>
                <span className="text-zetis-accent-2">→</span>
              </li>
            ))}
          </ul>
        </section>
        <button
          type="button"
          onClick={() => setDone(false)}
          className="mt-4 text-sm text-zetis-muted hover:text-zetis-text"
        >
          ← Refaire un diagnostic
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Diagnostic ZETIS"
        subtitle="ZETIS vérifie ce qu'il faut renforcer pour t'aider plus vite."
      />
      <p className="mb-4 text-sm text-zetis-muted">
        Quelques questions courtes, pas de note brute. Objectif : savoir quoi réviser en priorité.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setSelected(o.id)}
            className={`rounded-2xl border p-4 text-left transition-colors ${
              selected === o.id
                ? "border-zetis-accent bg-zetis-accent/10"
                : "border-zetis-border bg-zetis-surface hover:bg-zetis-surface-2"
            }`}
          >
            <p className="font-semibold">{o.title}</p>
            <p className="mt-1 text-xs text-zetis-muted">{o.desc}</p>
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setDone(true)}
        className="mt-5 rounded-xl bg-zetis-accent px-6 py-2.5 font-semibold text-white"
      >
        Commencer
      </button>
    </div>
  );
}
