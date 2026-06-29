// Page d'accueil temporaire de Massimo (Étape 2). Pas encore de données réelles.
export function HomePage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-bold">
        ZETIS <span className="text-zetis-accent-2">Massimo</span>
      </h1>
      <p className="mt-2 text-zetis-muted">
        Bienvenue&nbsp;! Ton espace d'apprentissage est en cours de construction.
      </p>

      <section className="mt-8 rounded-2xl border border-zetis-border bg-zetis-surface p-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-zetis-accent-2">
          Mission du jour
        </p>
        <h2 className="mt-1 text-xl font-bold">Bientôt disponible</h2>
        <p className="mt-2 text-zetis-muted">
          Les missions, quiz et explications ELI5 arriveront aux prochaines étapes.
        </p>
        <button
          type="button"
          className="mt-4 rounded-xl bg-zetis-accent px-5 py-2.5 font-semibold text-white transition-transform hover:scale-[1.02] active:scale-100"
        >
          Je continue →
        </button>
      </section>
    </div>
  );
}
