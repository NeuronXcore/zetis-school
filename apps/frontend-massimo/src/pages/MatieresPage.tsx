import { Link } from "react-router-dom";
import { GlassPanel, NEON_BAR_FILL, NEON_BUTTON, NeonBackdrop } from "../components/glass";
import { SubjectTile } from "../components/SubjectTile";
import { type Subject } from "../data/mock";
import { type MotivationWeek } from "@zetis/types";
import { type Progression, useMatieres } from "../hooks/useMatieres";
import { useMotivationWeek } from "../hooks/useMotivationWeek";
import { WeekDots } from "../components/motivation/WeekDots";

// Page Matières de Massimo — même « matière » visuelle que le login (verre + néon).
// Aucune logique métier ici : les données viennent du hook useMatieres.
export function MatieresPage() {
  const { progression, subjects, recommendedCapsule, bestSubject } = useMatieres();
  const week = useMotivationWeek();

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
        <WeekStrip week={week.week} bestSubject={bestSubject} />
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
        <Link to="/galaxy" className={NEON_BUTTON}>
          Voir ma galaxie →
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

// 4. Bande « Cette semaine ».
//
// La tuile « Série en cours » (streak) et la tuile « Objectifs de la semaine » ont été retirées
// ensemble. La première affichait une série qui tombait à zéro après un seul jour manqué — la
// mécanique la plus contraire à l'esprit du produit. La seconde affichait `PROFILE.consolidatedThisWeek`,
// une constante codée en dur, ET portait le même nom que l'engagement hebdomadaire que Massimo
// choisit désormais lui-même : deux « objectifs de la semaine » différents ne pouvaient pas
// coexister dans la même app.
function WeekStrip({
  week,
  bestSubject,
}: {
  week: MotivationWeek | null;
  bestSubject: Subject;
}) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
        Cette semaine
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Rappel discret de « Ma semaine », dont le geste d'engagement vit sur l'accueil : on
            montre l'état ici, on ne redemande pas de s'engager à chaque page. */}
        <GlassPanel className="p-4 sm:col-span-2">
          <p className="text-xs text-slate-400">Ma semaine</p>
          {week ? (
            <div className="mt-2">
              <WeekDots week={week} compact />
              <p className="mt-2 text-sm text-slate-300">
                {week.days_done} jour{week.days_done > 1 ? "s" : ""} cette semaine
                {week.goal_days != null && ` · objectif ${week.goal_days}`}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-400">—</p>
          )}
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
