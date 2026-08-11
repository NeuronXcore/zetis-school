import { starStyle } from "@zetis/ui/galaxy";
import type { StatusCount } from "../../hooks/useSubjectPanoply";
import { GlassPanel } from "../glass";

export interface SubjectProgressRingProps {
  counts: StatusCount[];
  subjectName: string;
}

const SIZE = 132;
const STROKE = 14;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Où en est Massimo dans cette matière — en COMPTES, jamais en pourcentage.
 *
 *  Les maquettes du 2026-08-11 portaient un « 66 % Maîtrisé » au centre de l'anneau. Il est
 *  refusé : l'ADR-0024 §5 interdit « aucun score par matière, aucun pourcentage », et cet
 *  interdit-là **n'a pas été levé** par l'addendum « page matière onglets » — qui n'a rendu
 *  légitime que le XP, parce qu'un XP mesure l'EFFORT et ne peut que monter.
 *
 *  ⚠️ **Ne pas « améliorer » en ajoutant un pourcentage au centre.** Le nombre central est le
 *  compte de notions travaillées, et sa lecture est volontairement neutre : il monte, il ne se
 *  compare à aucun total attendu. Un ratio « 13 / 28 » désignerait les 15 restantes comme un
 *  retard — c'est exactement le glissement que le §5 empêche.
 *
 *  Les segments gardent les couleurs et les libellés d'enfant de `starStyle` : l'anneau et la
 *  galaxie racontent la même chose, ils doivent la nommer pareil. Aucun rouge, par construction.
 */
export function SubjectProgressRing({ counts, subjectName }: SubjectProgressRingProps) {
  // 🔴 **`unknown` (« À découvrir ») est EXCLU de l'anneau, et c'est le cœur de ce composant.**
  //
  // Corrigé le 2026-08-11 après relecture à l'écran, sur des données réelles : SVT a 78 notions
  // « À découvrir » sur 80. L'anneau était un disque gris à 97,5 %, avec deux échardes de
  // couleur. Il ne disait pas « voilà où tu en es », il disait « tu n'as presque rien fait » —
  // un cadrage de perte, sur une surface enfant, qu'aucun test n'avait vu.
  //
  // L'ADR-0024 §5 tranche : « la vue d'ensemble affiche un **COMPTE d'étoiles allumées** ». La
  // galaxie ne dessine pas le noir entre les étoiles ; l'anneau ne dessine pas ce qui n'a pas
  // encore été touché.
  //
  // ⚠️ **Corollaire : le compte de « À découvrir » n'est affiché NULLE PART ici.** « 2
  // travaillées » à côté de « 78 à découvrir » reconstituerait « 2 sur 80 » — le ratio que le §5
  // interdit, réintroduit par la porte de derrière. L'en-tête donne déjà le total du catalogue,
  // et c'est un fait sur la matière, pas sur Massimo.
  const worked = counts.filter((entry) => entry.status !== "unknown");
  const touched = worked.reduce((sum, entry) => sum + entry.count, 0);

  // Rien de commencé : la carte ne s'affiche pas. Un anneau vide serait un réceptacle vide, et
  // les cartes de chapitres juste en dessous sont la vraie invitation à entrer.
  if (touched === 0) return null;

  let offset = 0;
  const segments = worked.map((entry) => {
    const length = (entry.count / touched) * CIRCUMFERENCE;
    const segment = { ...entry, style: starStyle(entry.status), length, offset };
    offset += length;
    return segment;
  });

  return (
    <GlassPanel className="p-5">
      <h2 className="mb-4 text-[11px] font-bold uppercase tracking-wider text-zetis-muted">
        Où j'en suis en {subjectName}
      </h2>

      <div className="flex flex-wrap items-center gap-6">
        <div className="relative shrink-0">
          <svg
            width={SIZE}
            height={SIZE}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            role="img"
            // ⚠️ Aucun « sur N » : ce serait le ratio interdit, dit à voix haute pour les
            // lecteurs d'écran pendant qu'on l'a retiré de l'image.
            aria-label={`${touched} notion${touched > 1 ? "s" : ""} travaillée${
              touched > 1 ? "s" : ""
            } en ${subjectName}`}
          >
            <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
              {segments.map((segment) => (
                <circle
                  key={segment.status}
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={RADIUS}
                  fill="none"
                  stroke={segment.style.color}
                  strokeWidth={STROKE}
                  strokeDasharray={`${segment.length} ${CIRCUMFERENCE - segment.length}`}
                  strokeDashoffset={-segment.offset}
                />
              ))}
            </g>
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold leading-none">{touched}</span>
            <span className="mt-1 text-[10px] uppercase tracking-wider text-zetis-muted">
              travaillées
            </span>
          </div>
        </div>

        {/* `max-w-xs` et non `flex-1` : sur une carte pleine largeur (quand la courbe se retire),
            un libellé collé à gauche et son nombre collé à droite obligent l'œil à traverser
            tout le panneau pour apparier les deux. */}
        <ul className="w-full min-w-0 max-w-xs space-y-1.5">
          {segments.map((segment) => (
            <li key={segment.status} className="flex items-center gap-2.5 text-sm">
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: segment.style.color }}
              />
              <span className="min-w-0 flex-1 truncate text-zetis-muted">
                {segment.style.label}
              </span>
              <span className="shrink-0 font-bold tabular-nums">{segment.count}</span>
            </li>
          ))}
        </ul>
      </div>
    </GlassPanel>
  );
}
