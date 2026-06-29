import { Link } from "react-router-dom";
import { DAILY_MISSION, PROFILE, QUICK_REVIEW_CARDS, RECOMMENDED_CAPSULE } from "../data/mock";
import { ZetisAvatar } from "../components/ZetisAvatar";

const SHORTCUTS = [
  { to: "/eli5", icon: "💡", title: "ELI5 rapide", desc: "Une notion" },
  { to: "/capsules", icon: "🎬", title: "Capsule IA", desc: `${RECOMMENDED_CAPSULE.subject} ${RECOMMENDED_CAPSULE.durationMin} min` },
  { to: "/mindmaps", icon: "🕸️", title: "Mindmap", desc: "Réviser autrement" },
];

// Accueil Massimo (Étape 7) — données mockées.
export function AccueilMassimoPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold">Bonjour {PROFILE.name} 👋</h1>
      <p className="mt-1 text-zetis-muted">On fait court mais efficace aujourd'hui.</p>

      {/* Mission du jour */}
      <section className="mt-6 rounded-2xl border border-zetis-border bg-zetis-surface p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-zetis-accent-2">
          Mission du jour
        </p>
        <h2 className="mt-1 text-xl font-bold">{DAILY_MISSION.title}</h2>
        <p className="mt-1 text-sm text-zetis-muted">
          {DAILY_MISSION.durationMin} min · +{DAILY_MISSION.xp} XP · {DAILY_MISSION.subject}
        </p>
        <p className="mt-2 text-sm text-zetis-muted">
          ZETIS te propose ça {DAILY_MISSION.reason}.
        </p>
        <button
          type="button"
          className="mt-4 rounded-xl bg-zetis-accent px-5 py-2.5 font-semibold text-white transition-transform hover:scale-[1.02]"
        >
          Commencer →
        </button>
      </section>

      {/* Raccourcis */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Link
          to="/progression"
          className="rounded-2xl border border-zetis-border bg-zetis-surface p-4 transition-transform hover:scale-[1.02]"
        >
          <div className="text-xl">🔁</div>
          <p className="mt-1 font-semibold">Révision rapide</p>
          <p className="text-xs text-zetis-muted">{QUICK_REVIEW_CARDS} cartes</p>
        </Link>
        {SHORTCUTS.map((s) => (
          <Link
            key={s.to}
            to={s.to}
            className="rounded-2xl border border-zetis-border bg-zetis-surface p-4 transition-transform hover:scale-[1.02]"
          >
            <div className="text-xl">{s.icon}</div>
            <p className="mt-1 font-semibold">{s.title}</p>
            <p className="text-xs text-zetis-muted">{s.desc}</p>
          </Link>
        ))}
      </div>

      {/* Message ZETIS */}
      <section className="mt-4 flex items-center gap-3 rounded-2xl border border-zetis-border bg-zetis-surface-2 p-4">
        <ZetisAvatar size={40} />
        <p className="text-sm">
          Tu as consolidé <strong>{PROFILE.consolidatedThisWeek} notions</strong> cette semaine. Continue
          comme ça&nbsp;!
        </p>
      </section>
    </div>
  );
}
