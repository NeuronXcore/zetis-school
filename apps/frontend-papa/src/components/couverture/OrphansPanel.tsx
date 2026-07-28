// Encart orphelins — hors matrice, en bas de page.
//
// Ils n'ont pas de ligne dans la matrice : leur leçon n'existe plus. C'est une anomalie, pas une
// case vide. Réattacher / Supprimer sont INERTES en V1 (endpoints non livrés) : présents,
// désactivés, `title` explicite — marquer l'emplacement sans promettre l'action.
import { type OrphanType, type ProductionOrphan } from "@zetis/types";

const TYPE_LABEL: Record<OrphanType, string> = {
  fiche: "Fiche",
  mindmap: "Mindmap",
  quiz: "Quiz",
};

function formatDate(iso: string | null): string {
  if (!iso) return "date inconnue";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "date inconnue" : date.toLocaleDateString("fr-FR");
}

export function OrphansPanel({ orphans }: { orphans: ProductionOrphan[] }) {
  if (orphans.length === 0) return null;

  return (
    <section
      id="orphelins"
      className="mb-6 rounded-xl border border-red-400/40 bg-papa-surface px-5 py-4"
    >
      <h3 className="mb-1 flex items-center gap-2 text-[13.5px] font-bold">
        🧩 Orphelins
        <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-300">
          hors matrice
        </span>
      </h3>
      <p className="mb-3 max-w-3xl text-xs leading-relaxed text-papa-muted">
        Dérivés dont la leçon a été archivée. Ils ne sont plus servis à Massimo, mais ils occupent
        la base et faussent les compteurs de leurs pages de pilotage. Aucune suppression
        automatique : un objet peut porter de l'historique.
      </p>

      {orphans.map((orphan) => (
        <div
          key={`${orphan.type}-${orphan.id}`}
          className="flex items-center gap-3 border-t border-papa-border/50 py-2.5 text-[13px]"
        >
          <div className="flex-1">
            <div>
              <b>{TYPE_LABEL[orphan.type]}</b> — « {orphan.title} »
            </div>
            <div className="mt-0.5 text-[11.5px] text-papa-muted">
              {orphan.subject ?? "matière inconnue"} · leçon archivée le{" "}
              {formatDate(orphan.archived_at)}
              {orphan.has_history && (
                <b className="text-amber-300"> · porte de l'historique de Massimo</b>
              )}
            </div>
          </div>
          <button
            type="button"
            disabled
            title="Réattachement — endpoint non livré (hors périmètre v1)"
            className="cursor-not-allowed rounded-lg border border-papa-border px-2.5 py-1 text-xs font-semibold text-papa-muted opacity-45"
          >
            Réattacher…
          </button>
          <button
            type="button"
            disabled
            title={
              orphan.has_history
                ? "Des tentatives de Massimo existent — archivage seulement, jamais de suppression"
                : "Suppression — endpoint non livré (hors périmètre v1)"
            }
            className="cursor-not-allowed rounded-lg border border-papa-border px-2.5 py-1 text-xs font-semibold text-papa-muted opacity-45"
          >
            Supprimer
          </button>
        </div>
      ))}
    </section>
  );
}
