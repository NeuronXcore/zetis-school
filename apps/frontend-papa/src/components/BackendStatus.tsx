import { useEffect, useState } from "react";
import { fetchHealth } from "../lib/api";

type Status =
  | { kind: "loading" }
  | { kind: "ok"; service: string }
  | { kind: "error"; message: string };

// Affiche l'état de connexion au backend (Étape 5) : loading / ok / error.
export function BackendStatus() {
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    fetchHealth(controller.signal)
      .then((h) => setStatus({ kind: "ok", service: h.service }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setStatus({ kind: "error", message: err instanceof Error ? err.message : "indisponible" });
      });
    return () => controller.abort();
  }, []);

  const dot =
    status.kind === "ok"
      ? "bg-emerald-400"
      : status.kind === "error"
        ? "bg-rose-400"
        : "bg-amber-400 animate-pulse";

  const label =
    status.kind === "ok"
      ? `Backend : ok (${status.service})`
      : status.kind === "error"
        ? `Backend : hors ligne — ${status.message}`
        : "Backend : connexion…";

  return (
    <span className="inline-flex items-center gap-2 rounded-md bg-papa-surface-2 px-3 py-1 text-xs text-papa-muted">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
