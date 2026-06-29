import { PageHeader } from "../components/PageHeader";
import { ProgressRing } from "../components/ProgressRing";
import { PROFILE, SUBJECTS } from "../data/mock";

// Page Progression Massimo (Étape 7) — XP, niveau, régularité, par matière (mock).
export function ProgressionPage() {
  const levelProgress = Math.round((PROFILE.xp / PROFILE.nextLevelXp) * 100);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Progression" subtitle="Vois tout ce que tu as construit." />

      {/* Résumé */}
      <section className="flex flex-wrap items-center gap-6 rounded-2xl border border-zetis-border bg-zetis-surface p-5">
        <ProgressRing value={levelProgress} size={84} />
        <div>
          <p className="text-lg font-bold">Niveau {PROFILE.level}</p>
          <p className="text-sm text-zetis-muted">
            {PROFILE.xp} / {PROFILE.nextLevelXp} XP vers le niveau {PROFILE.level + 1}
          </p>
        </div>
        <div className="ml-auto flex gap-6 text-center">
          <div>
            <p className="text-2xl font-bold text-zetis-accent-2">{PROFILE.streakDays}</p>
            <p className="text-xs text-zetis-muted">jours de suite</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-emerald-300">{PROFILE.consolidatedThisWeek}</p>
            <p className="text-xs text-zetis-muted">notions consolidées</p>
          </div>
        </div>
      </section>

      {/* Par matière */}
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
