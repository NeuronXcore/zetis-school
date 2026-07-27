import { type LayoutKind } from "./mindmapTree";

// Sélecteur de présentation (ADR-0016 §3) : Radial · Horizontal · Vertical · Équilibrée. État de
// vue pur (client), aucune incidence sur le score ou la donnée. Présélection = defaultLayout(mm).

const OPTIONS: { kind: LayoutKind; label: string; icon: string }[] = [
  { kind: "radial", label: "Radial", icon: "✳️" },
  { kind: "h", label: "Horizontal", icon: "➡️" },
  { kind: "v", label: "Vertical", icon: "⬇️" },
  { kind: "bal", label: "Équilibrée", icon: "🦋" },
];

export function LayoutSelector({
  value,
  onChange,
}: {
  value: LayoutKind;
  onChange: (kind: LayoutKind) => void;
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
      {OPTIONS.map((o) => (
        <button
          key={o.kind}
          type="button"
          onClick={() => onChange(o.kind)}
          aria-pressed={value === o.kind}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
            value === o.kind
              ? "bg-gradient-to-br from-indigo-500 to-cyan-400 text-white"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <span aria-hidden>{o.icon}</span>
          {o.label}
        </button>
      ))}
    </div>
  );
}
