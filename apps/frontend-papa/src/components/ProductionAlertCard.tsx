// Relais de la Couverture au Dashboard — UNE ligne, cliquable, et rien de plus.
//
// Règle du `docs/frontend-papa/README.md` : les alertes doivent proposer une action. D'où le
// partage des rôles — **le Dashboard signale, la Couverture traite**. Pas de matrice ici, pas
// de KPI de production, pas de compteur détaillé : le Dashboard répond à « où en est Massimo »,
// pas à « où en est mon stock ».
//
// Masquée quand les deux compteurs sont nuls : une alerte à zéro n'est pas une alerte.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CouvertureIcon } from "./CouvertureIcon";
import { fetchCoverage } from "../lib/production";

export function ProductionAlertCard() {
  const [counts, setCounts] = useState<{ pending: number; stale: number } | null>(null);

  useEffect(() => {
    fetchCoverage()
      .then((coverage) =>
        setCounts({ pending: coverage.totals.pending_count, stale: coverage.totals.stale_count }),
      )
      .catch(() => setCounts(null)); // le Dashboard ne doit pas tomber pour une alerte annexe
  }, []);

  if (!counts || (counts.pending === 0 && counts.stale === 0)) return null;

  return (
    <Link
      to="/couverture"
      className="mt-4 flex items-center gap-3 rounded-xl border border-amber-400/40 bg-amber-500/5 px-4 py-3 text-sm transition-colors hover:bg-amber-500/10"
    >
      <CouvertureIcon size="inline" />
      <span className="flex-1">
        <b className="text-amber-300">{counts.pending}</b> objet
        {counts.pending > 1 ? "s" : ""} attend{counts.pending > 1 ? "ent" : ""} ta relecture ·{" "}
        <b className="text-red-300">{counts.stale}</b> périmé{counts.stale > 1 ? "s" : ""}
      </span>
      <span className="text-xs font-semibold text-papa-muted">Ouvrir la Couverture →</span>
    </Link>
  );
}
