import { Link } from "react-router-dom";
import { ACTION_UI } from "../../lib/notionActionUi";
import type { SubjectCatalogueEntry } from "../../hooks/useSubjectPanoply";

/** Libellé au pluriel de chaque type — « 3 fiches », pas « 3 fiche ».
 *
 *  Les libellés d'`ACTION_UI` sont des ORDRES adressés à Massimo (« Lire la fiche »,
 *  « Me tester ») : parfaits sur un bouton d'activité, illisibles derrière un nombre. Ici on
 *  nomme la CHOSE, pas le geste. */
const NOM = {
  cours: ["cours", "cours"],
  eli5: ["explication", "explications"],
  fiche: ["fiche", "fiches"],
  capsule: ["capsule", "capsules"],
  mindmap: ["carte", "cartes"],
  revision: ["carte à revoir", "cartes à revoir"],
  quiz: ["quiz", "quiz"],
} as const;

export interface SubjectCatalogueBandProps {
  catalogue: SubjectCatalogueEntry[];
  subjectName: string;
}

/** Ce que ZETIS a pour cette matière, d'un coup d'œil.
 *
 *  Avant elle, la page n'annonçait qu'une chose — les cartes à revoir. Tout le reste n'existait
 *  que notion par notion : il fallait déplier un chapitre et taper sur une notion pour découvrir
 *  qu'il y avait trois fiches dans la matière.
 *
 *  ⚠️ Une entrée à `0` n'est PAS rendue, et la bande entière disparaît si tout est à zéro. Une
 *  matière qui n'a encore rien n'affiche pas six zéros — ce serait dresser la liste de ce qui
 *  manque, alors que l'absence de contenu est l'état du catalogue de Papa, pas un manque de
 *  l'enfant.
 *
 *  Cyan partout : c'est la couleur du « disponible » sur cette page. Pas d'orange (réservé à la
 *  demande), pas d'or (réservé à « ZETIS parle »).
 */
export function SubjectCatalogueBand({ catalogue, subjectName }: SubjectCatalogueBandProps) {
  const visibles = catalogue.filter((entry) => entry.count > 0);
  if (visibles.length === 0) return null;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {visibles.map((entry) => {
        const [singulier, pluriel] = NOM[entry.kind];
        const mot = entry.count > 1 ? pluriel : singulier;
        const label = `${entry.count} ${mot} en ${subjectName}`;
        const contenu = (
          <>
            <span aria-hidden className="text-base">
              {ACTION_UI[entry.kind].icon}
            </span>
            <span>
              <span className="font-bold text-zetis-accent-2">{entry.count}</span> {mot}
            </span>
          </>
        );
        const base =
          "flex min-h-11 items-center gap-2 rounded-xl border border-zetis-border bg-zetis-surface px-3 py-2 text-sm text-zetis-text";

        // `route === null` (capsule, quiz) : aucune route par matière n'existe. On montre le
        // compte SANS affordance de clic plutôt que d'envoyer Massimo sur une liste globale —
        // atterrir sur toutes les matières depuis sa page de SVT serait une petite trahison,
        // exactement ce que le rétrolien corrige ailleurs.
        return entry.route ? (
          <Link
            key={entry.kind}
            to={entry.route}
            aria-label={label}
            className={`${base} transition-colors hover:border-zetis-accent-2 motion-reduce:transition-none`}
          >
            {contenu}
          </Link>
        ) : (
          <span key={entry.kind} aria-label={label} className={base}>
            {contenu}
          </span>
        );
      })}
    </div>
  );
}
