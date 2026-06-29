interface PlaceholderPageProps {
  title: string;
  icon: string;
}

// Page temporaire générique pour les entrées de sidebar non encore développées
// (les vraies pages Massimo arrivent à l'Étape 7).
export function PlaceholderPage({ title, icon }: PlaceholderPageProps) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center justify-center py-20 text-center">
      <div className="text-5xl">{icon}</div>
      <h1 className="mt-4 text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-zetis-muted">
        Cette page sera construite à une prochaine étape du développement.
      </p>
    </div>
  );
}
