import { useEffect, useState } from "react";
import { Button } from "@zetis/ui";
import {
  type NotionRequest,
  fetchNotionRequests,
  resolveNotionRequest,
} from "../../lib/notionRequests";

// Panneau « Demandes de Massimo » (page Programme) : les notions qu'il a demandées sur ELI5
// mais absentes de son programme. Papa les ajoute via 🎯 Rattrapage puis les trie ici.
// Invisible quand il n'y a rien en attente (aucun encombrement).
export function NotionRequestsPanel() {
  const [requests, setRequests] = useState<NotionRequest[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    fetchNotionRequests()
      .then((list) => {
        if (active) setRequests(list);
      })
      .catch((e: unknown) => {
        // Panneau masqué en cas d'échec (pas d'encombrement), mais tracé pour diagnostic
        // (mauvais backend / non connecté / CORS) — évite l'invisibilité silencieuse.
        console.warn("[papa] chargement des demandes de notions échoué", e);
        if (active) setRequests([]);
      });
    return () => {
      active = false;
    };
  }, []);

  async function resolve(id: number, status: "added" | "dismissed") {
    setBusyId(id);
    try {
      await resolveNotionRequest(id, status);
      setRequests((prev) => prev.filter((r) => r.id !== id));
    } catch {
      /* laisse la demande en place : Papa peut réessayer */
    } finally {
      setBusyId(null);
    }
  }

  if (requests.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-4">
      <h2 className="text-sm font-semibold text-amber-200">
        📨 Demandes de Massimo ({requests.length})
      </h2>
      <p className="mt-1 text-xs text-papa-muted">
        Notions demandées sur ELI5 mais absentes du programme. Ajoute-les via 🎯 Rattrapage,
        puis marque-les « ✓ Ajoutée ».
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {requests.map((r) => (
          <li
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-black/10 px-3 py-2"
          >
            <span className="text-sm font-medium">« {r.text} »</span>
            <span className="flex shrink-0 gap-2">
              <Button
                variant="secondary"
                disabled={busyId === r.id}
                onClick={() => void resolve(r.id, "added")}
              >
                ✓ Ajoutée
              </Button>
              <Button
                variant="outline"
                disabled={busyId === r.id}
                onClick={() => void resolve(r.id, "dismissed")}
              >
                Ignorer
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
