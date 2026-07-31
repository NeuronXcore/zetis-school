import { Link } from "react-router-dom";
import type { GalaxySubject } from "@zetis/types";
import { subjectIconFor } from "../../lib/subjectIcons";

// Carte-bouton d'entrée vers `/galaxy`, sur l'Accueil (addendum ADR-0024 §B).
//
// Elle REMPLACE le canvas 3D posé ici le 2026-07-28. Trois jours d'usage ont montré que
// l'Accueil était le mauvais endroit : c'est la page la plus visitée et la première peinte au
// réveil de l'app, et elle chargeait 1,37 Mo (368 Ko gzip) pour une vue contemplative dont aucun
// élément n'est la prochaine action de Massimo. Le coût n'est pas atténué ici, il est ANNULÉ —
// la galaxie se paie à l'ouverture de `/galaxy`, ce qui est sa raison d'être.
//
// ⚠️ CONTRAINTE FERME : ZÉRO import de `@zetis/ui/galaxy/canvas`, direct ou transitif. Un test
// de budget de bundle le vérifie (`accueil.bundle.test.ts`) — sans lui la régression reviendrait
// sans bruit, comme les 3,6 Mo mesurés en juillet quand le canvas passait par le baril.
//
// Contrat FERMÉ, par héritage de l'ADR-0024 §5 : un COMPTE d'étoiles allumées, des pastilles de
// matières en CSS pur. Aucun pourcentage, aucun classement de matières, aucune couleur d'échec,
// aucune notion nommée comme manquante, aucun `mastery_score`.

/** Pastilles affichées au maximum : au-delà, la ligne se replierait et la carte grandirait. */
const MAX_PLANETS = 6;

export interface HomeGalaxyCardProps {
  /** `null` tant que l'appel n'a pas répondu — la carte n'est alors pas rendue par la page. */
  subjects: GalaxySubject[];
}

export function HomeGalaxyCard({ subjects }: HomeGalaxyCardProps) {
  // Le contrat serveur ne porte AUCUN compte global (`GET /api/student/galaxy` sert `lit` et
  // `total` PAR MATIÈRE) : ce total est une somme de présentation, pas une donnée dérivée —
  // aucune règle métier n'entre dans cette page.
  const lit = subjects.reduce((sum, subject) => sum + subject.lit, 0);
  // Une matière sans rien de validé n'a pas de constellation : sa pastille n'irait nulle part.
  const planets = subjects.filter((subject) => subject.total > 0).slice(0, MAX_PLANETS);

  return (
    <Link
      to="/galaxy"
      // La carte ENTIÈRE est la cible de clic : sur iPhone, viser un lien de fin de carte est
      // un geste de précision inutile quand toute la surface veut dire la même chose.
      className="group relative block overflow-hidden rounded-2xl border border-zetis-border bg-zetis-surface p-5 transition-colors hover:border-zetis-accent-2 motion-reduce:transition-none"
      aria-label={`Ma galaxie : ${lit} étoiles allumées — ouvrir`}
    >
      {/* Étoiles décoratives, en CSS pur. `motion-reduce` les fige : elles scintillent pour
          faire joli, jamais pour porter une information. */}
      <span aria-hidden className="pointer-events-none absolute inset-0">
        {STARS.map((star, i) => (
          <span
            key={i}
            className="absolute h-[3px] w-[3px] rounded-full bg-white/70 motion-safe:animate-pulse"
            style={{ top: star.top, left: star.left, animationDelay: star.delay }}
          />
        ))}
      </span>

      <p className="text-xs font-semibold uppercase tracking-wide text-zetis-accent-2">
        Ma galaxie
      </p>

      <p className="mt-2 flex items-baseline gap-2">
        <span className="text-3xl font-bold tabular-nums">{lit}</span>
        <span className="text-sm">étoile{lit > 1 ? "s" : ""} allumée{lit > 1 ? "s" : ""}</span>
      </p>

      {/* Zéro étoile n'est PAS un état vide : une galaxie qui n'a pas encore commencé est le
          point de départ normal (rentrée, premier jour). Pas d'`EmptyState`, pas d'erreur. */}
      <p className="mt-1 text-sm text-zetis-muted">
        {lit === 0
          ? "Ta galaxie t'attend : chaque notion travaillée allume une étoile."
          : "Chaque notion travaillée allume une étoile."}
      </p>

      {planets.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2.5" aria-hidden>
          {planets.map((subject) => {
            const icon = subjectIconFor(subject.slug);
            return (
              <li
                key={subject.slug}
                // Pictogramme de marque, JAMAIS un emoji (design-system.md §Pictogrammes).
                className="grid h-10 w-10 place-items-center rounded-full border border-zetis-border bg-zetis-surface-2"
              >
                {icon ? (
                  <img src={icon} alt="" className="h-7 w-7 rounded-full object-cover" />
                ) : (
                  <span className="text-xs font-bold text-zetis-muted">
                    {subject.name.charAt(0).toUpperCase()}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-4 text-sm font-bold text-zetis-accent-2">Ouvrir ma galaxie →</p>
    </Link>
  );
}

/** Positions figées : un aléa ferait bouger le décor à chaque rendu, sans rien dire de plus. */
const STARS = [
  { top: "14%", left: "12%", delay: "0s" },
  { top: "30%", left: "66%", delay: ".9s" },
  { top: "58%", left: "28%", delay: "1.7s" },
  { top: "22%", left: "88%", delay: "2.4s" },
  { top: "74%", left: "74%", delay: "1.2s" },
  { top: "82%", left: "44%", delay: "3.1s" },
  { top: "44%", left: "52%", delay: ".4s" },
  { top: "66%", left: "8%", delay: "2.8s" },
];
