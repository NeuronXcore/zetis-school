import { Link, useParams } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { XPBadge } from "../components/XPBadge";
import { type ChapterStatus, getSubject } from "../data/mock";

const STATUS_LABEL: Record<ChapterStatus, string> = {
  prevu: "Prévu",
  en_cours: "En cours",
  a_renforcer: "À renforcer",
  maitrise: "Maîtrisé",
};

const STATUS_CLASS: Record<ChapterStatus, string> = {
  prevu: "bg-zetis-surface-2 text-zetis-muted",
  en_cours: "bg-sky-500/15 text-sky-300",
  a_renforcer: "bg-amber-500/15 text-amber-300",
  maitrise: "bg-emerald-500/15 text-emerald-300",
};

const ACTIONS = [
  { icon: "📘", label: "Cours" },
  { icon: "✅", label: "Quiz" },
  { icon: "🕸️", label: "Mindmap" },
  { icon: "🎬", label: "Capsule IA" },
];

// Page matière dédiée (Étape 7) — /subjects/:slug, données mockées.
export function MatiereDetailPage() {
  const { slug } = useParams();
  const subject = slug ? getSubject(slug) : undefined;

  if (!subject) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="text-zetis-muted">Cette matière n'existe pas.</p>
        <Link to="/matieres" className="mt-3 inline-block text-zetis-accent-2">
          ← Retour aux matières
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={`${subject.icon} ${subject.name}`}
        right={<XPBadge xp={subject.xp} level={subject.level} />}
      />

      {/* Prochaine étape */}
      <section className="rounded-2xl border border-zetis-border bg-zetis-surface p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-zetis-accent-2">
          Prochaine étape
        </p>
        <h2 className="mt-1 text-lg font-bold">{subject.nextStep}</h2>
        <div className="mt-3 flex gap-2">
          <Link
            to="/eli5"
            className="rounded-lg bg-zetis-accent px-4 py-2 text-sm font-semibold text-white"
          >
            Lancer ELI5
          </Link>
          <button
            type="button"
            className="rounded-lg border border-zetis-border px-4 py-2 text-sm font-semibold text-zetis-text"
          >
            Faire un quiz
          </button>
        </div>
      </section>

      {/* Actions rapides */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {ACTIONS.map((a) =>
          // « Cours » est branché (page Cours, leçons validées du référentiel) ;
          // les autres actions restent des maquettes (étapes ultérieures).
          a.label === "Cours" ? (
            <Link
              key={a.label}
              to={`/subjects/${slug}/cours`}
              className="rounded-xl border border-zetis-border bg-zetis-surface p-3 text-center transition-transform hover:scale-[1.03]"
            >
              <div className="text-xl">{a.icon}</div>
              <p className="mt-1 text-sm font-medium">{a.label}</p>
            </Link>
          ) : (
            <button
              key={a.label}
              type="button"
              className="rounded-xl border border-zetis-border bg-zetis-surface p-3 text-center transition-transform hover:scale-[1.03]"
            >
              <div className="text-xl">{a.icon}</div>
              <p className="mt-1 text-sm font-medium">{a.label}</p>
            </button>
          ),
        )}
      </div>

      {/* Chapitres */}
      <h3 className="mt-6 mb-2 font-bold">Chapitres</h3>
      <ul className="space-y-2">
        {subject.chapters.map((ch) => (
          <li
            key={ch.name}
            className="flex items-center justify-between rounded-xl border border-zetis-border bg-zetis-surface px-4 py-3"
          >
            <span>{ch.name}</span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASS[ch.status]}`}>
              {STATUS_LABEL[ch.status]}
            </span>
          </li>
        ))}
      </ul>

      {subject.toReinforce.length > 0 && (
        <section className="mt-6 rounded-xl border border-zetis-border bg-zetis-surface-2 p-4">
          <p className="text-sm font-semibold">À renforcer en douceur</p>
          <ul className="mt-2 list-inside list-disc text-sm text-zetis-muted">
            {subject.toReinforce.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
