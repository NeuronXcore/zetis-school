import { PageHeader } from "../components/PageHeader";
import { SubjectCard } from "../components/SubjectCard";
import { SUBJECTS } from "../data/mock";

// Page Matières (Étape 7) — grille des 8 matières (données mockées).
export function MatieresPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Matières" subtitle="Choisis une matière pour continuer." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {SUBJECTS.map((subject) => (
          <SubjectCard key={subject.slug} subject={subject} />
        ))}
      </div>
    </div>
  );
}
