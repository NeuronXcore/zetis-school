import { useEffect, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { ProgressRing } from "../components/ProgressRing";
import { SUBJECTS } from "../data/mock";
import {
  type GamificationSummary,
  REASON_LABEL,
  fetchGamificationSummary,
} from "../lib/gamification";
import { fetchWelcome } from "../lib/motivation";

// Page Progression Massimo — XP, niveau, badges et PROGRÈS RÉEL.
//
// La tuile « jours de suite » (streak) a été remplacée par « notions consolidées cette semaine » :
// un chiffre vrai, et de progrès, là où il y avait un chiffre de pression. Surtout pas
// « jours cette semaine » ici — ce serait redire « Ma semaine », qui vit sur l'accueil.
// La section « par matière » reste indicative (mock) en attendant la maîtrise par matière.
export function ProgressionPage() {
  const [summary, setSummary] = useState<GamificationSummary | null>(null);
  const [consolidated, setConsolidated] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchGamificationSummary()
      .then(setSummary)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Erreur de chargement"));
    // `context` du message d'accueil : documenté comme servant AUSSI à alimenter d'autres blocs.
    fetchWelcome()
      .then((w) => setConsolidated(w.context.consolidated_this_week))
      .catch(() => setConsolidated(null));
  }, []);

  const levelProgress = summary
    ? Math.round((summary.xp_into_level / summary.xp_for_next) * 100)
    : 0;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Progression" subtitle="Vois tout ce que tu as construit." />

      {error && <p className="mb-3 text-sm text-rose-400">{error}</p>}

      {/* Résumé XP / niveau / progrès de la semaine */}
      <section className="flex flex-wrap items-center gap-6 rounded-2xl border border-zetis-border bg-zetis-surface p-5">
        <ProgressRing value={levelProgress} size={84} />
        <div>
          <p className="text-lg font-bold">Niveau {summary?.level ?? 1}</p>
          <p className="text-sm text-zetis-muted">
            {summary?.xp_into_level ?? 0} / {summary?.xp_for_next ?? 100} XP vers le niveau{" "}
            {(summary?.level ?? 1) + 1}
          </p>
          <p className="mt-1 text-xs text-zetis-muted">{summary?.total_xp ?? 0} XP au total</p>
        </div>
        <div className="ml-auto flex gap-6 text-center">
          <div>
            <p className="text-2xl font-bold text-zetis-accent-2">{consolidated ?? 0}</p>
            <p className="text-xs text-zetis-muted">
              notion{(consolidated ?? 0) > 1 ? "s" : ""} consolidée
              {(consolidated ?? 0) > 1 ? "s" : ""} cette semaine
            </p>
          </div>
          <div>
            <p className="text-2xl font-bold text-emerald-300">{summary?.badges.length ?? 0}</p>
            <p className="text-xs text-zetis-muted">badges gagnés</p>
          </div>
        </div>
      </section>

      {/* Badges */}
      {summary && summary.badges.length > 0 && (
        <section className="mt-4">
          <h3 className="mb-2 font-bold">Tes badges</h3>
          <div className="flex flex-wrap gap-2">
            {summary.badges.map((b) => (
              <span
                key={b.code}
                className="flex items-center gap-1.5 rounded-full border border-zetis-border bg-zetis-surface px-3 py-1.5 text-sm"
              >
                <span className="text-base">{b.icon}</span>
                {b.label}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Activité récente */}
      {summary && summary.recent.length > 0 && (
        <section className="mt-4">
          <h3 className="mb-2 font-bold">Activité récente</h3>
          <ul className="space-y-2">
            {summary.recent.map((e, i) => (
              <li
                key={`${e.reason}-${i}`}
                className="flex items-center justify-between rounded-xl border border-zetis-border bg-zetis-surface px-4 py-2.5 text-sm"
              >
                <span>{REASON_LABEL[e.reason] ?? e.reason}</span>
                <span className="font-semibold text-zetis-accent-2">+{e.amount} XP</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Par matière (indicatif) */}
      <h3 className="mt-6 mb-2 font-bold">Par matière</h3>
      <div className="space-y-2">
        {SUBJECTS.map((s) => (
          <div
            key={s.slug}
            className="flex items-center gap-3 rounded-xl border border-zetis-border bg-zetis-surface px-4 py-3"
          >
            <span className="text-xl">{s.icon}</span>
            <span className="w-32 shrink-0 text-sm font-medium">{s.name}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-zetis-surface-2">
              <div
                className="h-full rounded-full"
                style={{ width: `${s.progress}%`, backgroundColor: s.color }}
              />
            </div>
            <span className="w-10 shrink-0 text-right text-xs text-zetis-muted">{s.progress}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
