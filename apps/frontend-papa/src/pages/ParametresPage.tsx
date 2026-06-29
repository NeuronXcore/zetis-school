import { useState } from "react";
import { PageHeader } from "../components/PageHeader";

interface Toggle {
  id: string;
  label: string;
  desc: string;
  on: boolean;
}

const INITIAL: Toggle[] = [
  { id: "validate", label: "Validation manuelle des capsules", desc: "Papa valide avant publication à Massimo.", on: true },
  { id: "sounds", label: "Sons de feedback", desc: "Réussite, gain d'XP, ZETIS parle.", on: true },
  { id: "autocapsule", label: "Capsules automatiques", desc: "ZETIS propose une capsule quand une notion bloque.", on: false },
];

// Paramètres Papa (Étape 8) — réglages pédagogiques + IA (mock, non persisté).
export function ParametresPage() {
  const [toggles, setToggles] = useState(INITIAL);

  function flip(id: string) {
    setToggles((t) => t.map((x) => (x.id === id ? { ...x, on: !x.on } : x)));
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Paramètres" subtitle="Réglages pédagogiques et fournisseur IA." />

      <section className="rounded-xl border border-papa-border bg-papa-surface p-5">
        <p className="mb-3 font-semibold">Fournisseur IA</p>
        <select className="w-full rounded-lg border border-papa-border bg-papa-bg px-3 py-2 text-sm outline-none focus:border-papa-accent">
          <option>Anthropic (Claude)</option>
          <option>OpenAI</option>
          <option>Ollama (local)</option>
        </select>
        <p className="mt-2 text-xs text-papa-muted">
          Les données de Massimo sont privées : strip des infos inutiles avant envoi (cf. SECURITY.md).
        </p>
      </section>

      <section className="mt-4 space-y-2">
        {toggles.map((t) => (
          <div
            key={t.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-papa-border bg-papa-surface px-4 py-3"
          >
            <div>
              <p className="font-medium">{t.label}</p>
              <p className="text-xs text-papa-muted">{t.desc}</p>
            </div>
            <button
              type="button"
              onClick={() => flip(t.id)}
              className={`h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors ${
                t.on ? "bg-papa-accent" : "bg-papa-surface-2"
              }`}
              aria-pressed={t.on}
            >
              <span
                className={`block h-5 w-5 rounded-full bg-white transition-transform ${
                  t.on ? "translate-x-5" : ""
                }`}
              />
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}
