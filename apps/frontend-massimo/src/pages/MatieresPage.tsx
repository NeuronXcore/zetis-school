import { Link } from "react-router-dom";
import { GlassPanel, NEON_BAR_FILL, NEON_BUTTON, NeonBackdrop } from "../components/glass";
import { SubjectTile } from "../components/SubjectTile";
import { type Subject } from "../data/mock";
import { type Progression, type WeeklyObjectives, useMatieres } from "../hooks/useMatieres";

// Page Matières de Massimo — même « matière » visuelle que le login (verre + néon).
// Aucune logique métier ici : les données viennent du hook useMatieres.
export function MatieresPage() {
  const { progression, subjects, recommendedCapsule, weekly, bestSubject } = useMatieres();

  return (
    <div className="relative isolate -m-6 min-h-full overflow-hidden bg-[#000010] p-6 text-white">
      <NeonBackdrop />
      <div className="relative mx-auto flex max-w-5xl flex-col gap-5">
        <GlobalProgress progression={progression} />
        <CapsuleCard
          notion={recommendedCapsule.notion}
          subject={recommendedCapsule.subject}
          durationMin={recommendedCapsule.durationMin}
        />
        <SubjectsGrid subjects={subjects} />
        <WeekStrip
          streakDays={progression.streakDays}
          weekly={weekly}
          bestSubject={bestSubject}
        />
      </div>
    </div>
  );
}

// 1. Bandeau « Progression globale » + lien vers la page Progression.
function GlobalProgress({ progression }: { progression: Progression }) {
  return (
    <GlassPanel className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-cyan-300/80">
            Progression globale
          </p>
          <p className="mt-1 text-lg font-bold">Niveau {progression.level}</p>
          <p className="text-sm text-slate-400">
            {progression.xpIntoLevel} / {progression.xpForNext} XP vers le niveau{" "}
            {progression.level + 1}
          </p>
        </div>
        <Link to="/progression" className={NEON_BUTTON}>
          Voir ma progression →
        </Link>
      </div>
      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div className={NEON_BAR_FILL} style={{ width: `${progression.levelProgress}%` }} />
      </div>
    </GlassPanel>
  );
}

// 2. Carte « Capsule IA dispo » (mise en avant).
// Pas de route de lecture par capsule (`/capsules/:id`) côté routeur : « Regarder »
// pointe vers la page Capsules existante (la plus proche).
function CapsuleCard({
  notion,
  subject,
  durationMin,
}: {
  notion: string;
  subject: string;
  durationMin: number;
}) {
  return (
    <GlassPanel className="flex flex-wrap items-center justify-between gap-4 border-cyan-400/30 bg-cyan-400/5 p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-cyan-300/80">
          Capsule IA dispo
        </p>
        <p className="mt-1 text-lg font-bold">{notion}</p>
        <p className="text-sm text-slate-400">
          {subject} · {durationMin} min
        </p>
      </div>
      <Link to="/capsules" className={NEON_BUTTON}>
        ▶ Regarder
      </Link>
    </GlassPanel>
  );
}

// 3. Grille des 8 matières.
function SubjectsGrid({ subjects }: { subjects: Subject[] }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
        Tes matières
      </h2>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {subjects.map((subject) => (
          <SubjectTile key={subject.slug} subject={subject} />
        ))}
      </div>
    </section>
  );
}

// 4. Bande « Cette semaine » : série, objectifs, meilleure matière.
function WeekStrip({
  streakDays,
  weekly,
  bestSubject,
}: {
  streakDays: number;
  weekly: WeeklyObjectives;
  bestSubject: Subject;
}) {
  const weeklyPct = weekly.total > 0 ? Math.round((weekly.done / weekly.total) * 100) : 0;
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
        Cette semaine
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <GlassPanel className="p-4">
          <p className="text-xs text-slate-400">Série en cours</p>
          <p className="mt-1 text-2xl font-bold text-cyan-200">
            {streakDays} <span className="text-base font-medium text-slate-400">jours</span>
          </p>
        </GlassPanel>

        <GlassPanel className="p-4">
          <p className="text-xs text-slate-400">Objectifs de la semaine</p>
          <p className="mt-1 text-sm font-semibold text-slate-100">
            {weekly.done} / {weekly.total}
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div className={NEON_BAR_FILL} style={{ width: `${weeklyPct}%` }} />
          </div>
        </GlassPanel>

        <GlassPanel className="p-4">
          <p className="text-xs text-slate-400">Meilleure matière</p>
          <p className="mt-1 text-lg font-bold text-slate-100">{bestSubject.name}</p>
          <p className="text-xs text-slate-500">{bestSubject.progress}% du chapitre</p>
        </GlassPanel>
      </div>
    </section>
  );
}
