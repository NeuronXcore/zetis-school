interface KpiCardProps {
  label: string;
  value: string;
  hint?: string;
}

export function KpiCard({ label, value, hint }: KpiCardProps) {
  return (
    <div className="rounded-xl border border-papa-border bg-papa-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-papa-muted">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      {hint && <p className="mt-1 text-xs text-papa-muted">{hint}</p>}
    </div>
  );
}
