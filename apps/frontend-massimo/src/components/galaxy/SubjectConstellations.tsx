// Vue d'ensemble : une planète par matière (ADR-0024 §1).
//
// Chaque matière est une sphère qui TOURNE SUR SON AXE. L'effet est obtenu en CSS pur — une
// texture d'étoiles qui défile derrière un masque circulaire ombré — et surtout PAS en 3D :
// cet écran ne doit pas charger le chunk Three.js (c'est tout l'intérêt du découpage).
//
// La planète s'éclaire à mesure que Massimo progresse. Le libellé dessous est un COMPTE
// d'étoiles allumées — jamais un pourcentage, jamais un classement.
import type { GalaxySubject } from "@zetis/types";
import { GOLD, GOLD_BRIGHT } from "@zetis/ui/galaxy";
import { subjectIconFor } from "../../lib/subjectIcons";

/** Opacité de la couronne solaire, en hexa — de discrète à franche selon la progression.
 *
 * Un plancher à `0x1c` : une matière tout juste commencée doit déjà être touchée par l'or,
 * sinon le halo n'apparaît qu'à mi-parcours et ne récompense rien. */
function goldAlpha(ratio: number): string {
  return Math.round(0x1c + ratio * (0x8c - 0x1c))
    .toString(16)
    .padStart(2, "0");
}

const ACCENTS = ["#6366f1", "#d946ef", "#22d3ee", "#a78bfa", "#34d399", "#f59e0b"];

// Vitesses légèrement différentes d'une matière à l'autre : à pas égal, six planètes qui
// tournent ensemble donnent une impression mécanique. Dérivé de l'index — déterministe,
// jamais `Math.random` (le rendu doit être stable d'une frame à l'autre et en test).
//
// Un tour dure ~9 à 15 s. Au-delà de ~20 s, le mouvement passe sous le seuil de perception
// et la planète paraît immobile — c'était le cas de la première version (17 à 27 s).
const SPIN_SECONDS = [11, 14, 9, 15, 12, 13];

export interface SubjectConstellationsProps {
  subjects: GalaxySubject[];
  onOpen: (slug: string) => void;
  /** `"grid"` : l'écran d'attente / le repli sans WebGL. `"band"` : le bandeau au-dessus du
   *  système solaire, où les planètes servent à VISER une matière dans le graphe. */
  variant?: "grid" | "band";
  /** Matière visée dans le bandeau — reçoit un anneau. */
  selectedSlug?: string | null;
}

export function SubjectConstellations({
  subjects,
  onOpen,
  variant = "grid",
  selectedSlug = null,
}: SubjectConstellationsProps) {
  return (
    <ul
      className={
        variant === "band"
          ? // UNE SEULE LIGNE, sans défilement : les planètes se partagent la largeur
            // (`flex-1`) et rétrécissent avec leur nombre. Un bandeau qui défile cacherait
            // les dernières matières, et un bandeau qui se replie repousserait le graphe hors
            // de l'écran — dans les deux cas, la carte de l'année cesse d'être une carte.
            "flex gap-2"
          : "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
      }
    >
      {subjects.map((subject, i) => {
        const accent = ACCENTS[i % ACCENTS.length];
        const empty = subject.total === 0;
        const ratio = empty ? 0 : subject.lit / subject.total;
        const icon = subjectIconFor(subject.slug);
        // Le relief est dessiné pour un globe de 80 px ; sur le bandeau (44 px) tout est
        // ramené à l'échelle — tuile ET taches. Sans ça, une seule tache remplit la sphère
        // et sa dérive ne se lit plus comme une rotation.
        const k = variant === "band" ? 0.55 : 1;
        const px = (value: number) => `${(value * k).toFixed(1)}px`;
        const tile = px(160);
        return (
          <li key={subject.slug} className={variant === "band" ? "min-w-0 flex-1" : undefined}>
            {/* ⚠️ `cursor-pointer` est EXPLICITE : la préflight de Tailwind v4 pose
                `cursor: default` sur les <button> (changement par rapport à v3). Sans cette
                classe, survoler une planète cliquable ne montre aucune main. */}
            <button
              type="button"
              // Dans le BANDEAU, une matière vide reste cliquable : viser sa planète dans le
              // système solaire est une action légitime (« montre-moi où elle est »), là où
              // OUVRIR sa constellation ne mènerait qu'à un écran d'attente.
              disabled={empty && variant === "grid"}
              onClick={() => onOpen(subject.slug)}
              aria-label={
                empty
                  ? `${subject.name} — les étoiles arrivent bientôt`
                  : `${subject.name} — ${subject.lit} étoiles allumées sur ${subject.total}`
              }
              aria-pressed={variant === "band" ? selectedSlug === subject.slug : undefined}
              className={
                // `relative` : c'est le repère de la couronne solaire, posée en absolu. Sans
                // lui, elle se cale sur un ancêtre lointain et flotte à côté de la planète.
                "group relative flex w-full flex-col items-center rounded-2xl transition disabled:opacity-45 " +
                (variant === "band" ? "gap-1 p-1.5 " : "gap-2.5 p-3 ") +
                (empty && variant === "grid" ? "cursor-default" : "cursor-pointer hover:-translate-y-0.5") +
                (selectedSlug === subject.slug
                  ? " bg-zetis-surface-2 ring-2 ring-zetis-accent-2"
                  : "")
              }
              style={
                {
                  // L'éclat au survol se joue en CSS (et non en état React) : une planète
                  // survolée ne doit pas provoquer de rendu, sinon le globe qui tourne
                  // saccade sous la souris.
                  "--glow": empty ? "transparent" : `${accent}55`,
                  "--glow-strong": empty ? "transparent" : `${accent}cc`,
                } as React.CSSProperties
              }
            >
              {/* Couronne SOLAIRE dorée, DERRIÈRE le globe — elle déborde, c'est ce qui en
                  fait un halo et non un anneau.
                  ⚠️ L'or n'est pas un décor. Le canvas pose déjà la règle (« l'or ne coule que
                  vers ce que Massimo a vraiment travaillé ») et la maquette galaxie dit « aucun
                  or ». Le halo suit donc `ratio` : une matière vide n'en a AUCUN, une matière
                  bien avancée rayonne. Doré ≠ joli, doré = travaillé. */}
              {!empty && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-full motion-safe:animate-[zetis-nebula_6s_ease-in-out_infinite]"
                  style={{
                    width: variant === "band" ? "72px" : "128px",
                    height: variant === "band" ? "72px" : "128px",
                    // Centré sur le GLOBE, pas sur le bouton : padding + moitié du globe −
                    // moitié du halo. Bandeau : 6 + 22 − 36. Grille : 12 + 40 − 64.
                    marginTop: variant === "band" ? "-8px" : "-12px",
                    background: `radial-gradient(circle, ${GOLD_BRIGHT}${goldAlpha(ratio)} 0%, ${GOLD}1f 44%, transparent 68%)`,
                  }}
                />
              )}
              <span
                aria-hidden
                className={
                  "relative mx-auto block overflow-hidden rounded-full " +
                  (variant === "band" ? "h-11 w-11 " : "h-20 w-20 ") +
                  " shadow-[0_0_34px_var(--glow)] transition-[box-shadow,filter,transform] duration-300 " +
                  (empty
                    ? ""
                    : "group-hover:scale-[1.07] group-hover:shadow-[0_0_66px_var(--glow-strong)] group-hover:brightness-125")
                }
                style={{
                  // Base SOMBRE, volontairement : c'est le contraste avec le relief clair qui
                  // rend le défilement visible. Sur une base déjà claire, les taches se
                  // noyaient et la planète paraissait lisse et immobile (constaté).
                  background: `radial-gradient(circle at 50% 50%, ${accent}3a, #0e1326 100%)`,
                }}
              >
                {/* Relief de la planète. La tuile fait 160px pour une sphère de 80 : il FAUT
                    que du relief entre et sorte du champ, sinon le motif paraît figé et rien
                    ne semble tourner. Les taches sont larges et contrastées — des points de
                    1px ne se voient pas défiler. */}
                <span
                  className="absolute inset-0 motion-safe:animate-[zetis-planet-spin_var(--spin)_linear_infinite]"
                  style={
                    {
                      "--spin": `${SPIN_SECONDS[i % SPIN_SECONDS.length]}s`,
                      // `--tile` est lue par `@keyframes zetis-planet-spin` : le déplacement
                      // DOIT valoir exactement la largeur de la tuile, sinon la boucle saute.
                      "--tile": tile,
                      backgroundImage: `
                        radial-gradient(${px(26)} ${px(17)} at ${px(18)} ${px(24)}, ${accent}, transparent 70%),
                        radial-gradient(${px(20)} ${px(26)} at ${px(62)} ${px(56)}, ${accent}dd, transparent 70%),
                        radial-gradient(${px(30)} ${px(15)} at ${px(104)} ${px(18)}, ${accent}, transparent 70%),
                        radial-gradient(${px(18)} ${px(22)} at ${px(138)} ${px(54)}, ${accent}cc, transparent 70%),
                        radial-gradient(${px(14)} ${px(12)} at ${px(86)} ${px(70)}, ${accent}ee, transparent 70%)`,
                      backgroundSize: `${tile} ${px(80)}`,
                      backgroundRepeat: "repeat",
                      // La planète s'éclaire avec la progression, mais garde un plancher :
                      // une matière peu travaillée doit être sobre, pas immobile.
                      opacity: 0.62 + ratio * 0.38,
                    } as React.CSSProperties
                  }
                />
                {/* Voile plus lent : la parallaxe entre deux couches est ce qui donne la
                    sensation d'une sphère, et non d'une image qui glisse. */}
                <span
                  className="absolute inset-0 motion-safe:animate-[zetis-planet-haze_var(--haze)_linear_infinite]"
                  style={
                    {
                      "--haze": `${SPIN_SECONDS[i % SPIN_SECONDS.length] * 1.9}s`,
                      "--tile": tile,
                      backgroundImage: `
                        radial-gradient(${px(34)} ${px(12)} at ${px(46)} ${px(34)}, rgba(255,255,255,.3), transparent 75%),
                        radial-gradient(${px(28)} ${px(10)} at ${px(122)} ${px(62)}, rgba(255,255,255,.26), transparent 75%)`,
                      backgroundSize: `${tile} ${px(80)}`,
                      backgroundRepeat: "repeat",
                      opacity: 0.55,
                    } as React.CSSProperties
                  }
                />
                {/* Emblème de la matière : le pictogramme de marque (`subjectIconFor`, le
                    MÊME que chez Papa et sur les autres pages — jamais un emoji, cf.
                    design-system.md §Pictogrammes de matière). Il reste FIXE et lisible
                    pendant que le globe tourne derrière : c'est ce qui permet à Massimo de
                    reconnaître où aller. Replié sur l'initiale si l'asset manque. */}
                <span className="absolute inset-0 grid place-items-center">
                  {icon ? (
                    <img
                      src={icon}
                      alt=""
                      aria-hidden
                      // Assez grand pour identifier la matière, assez petit pour laisser voir
                      // la surface tourner autour : sinon l'emblème masque la planète.
                      className={
                        variant === "band" ? "h-6 w-6 object-contain" : "h-10 w-10 object-contain"
                      }
                      style={{ filter: "drop-shadow(0 2px 6px rgba(3,6,18,.75))" }}
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="text-xl font-black text-white"
                      style={{ textShadow: "0 2px 6px rgba(3,6,18,.8)" }}
                    >
                      {subject.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </span>
                {/* Volume : lumière en haut-gauche, terminateur marqué en bas-droite, et un
                    liseré au limbe. Sans cette couche fixe, la surface qui défile se lit
                    comme un disque qui glisse — c'est elle qui fait la sphère.
                    Posée APRÈS l'emblème pour que l'ombrage passe aussi sur lui : sinon le
                    pictogramme flotte à plat devant la sphère au lieu d'y être posé. */}
                <span
                  className="pointer-events-none absolute inset-0 rounded-full"
                  style={{
                    background:
                      "radial-gradient(circle at 28% 24%, rgba(255,255,255,.24), transparent 42%)",
                    boxShadow:
                      "inset -11px -12px 22px rgba(3,6,18,.72), inset 4px 4px 12px rgba(255,255,255,.14)",
                  }}
                />
              </span>
              {/* Dans le bandeau, le nom est tronqué plutôt que replié : une hauteur de ligne
                  variable ferait sauter le graphe d'un rendu à l'autre. Le compte se réduit à
                  son nombre — l'`aria-label` du bouton porte la phrase complète. */}
              <span
                className={
                  variant === "band"
                    ? "w-full truncate text-center text-[11px] font-bold leading-tight"
                    : "text-sm font-bold"
                }
              >
                {subject.name}
              </span>
              <span
                className={variant === "band" ? "text-[10px] text-zetis-muted" : "text-xs text-zetis-muted"}
              >
                {empty
                  ? "Bientôt"
                  : variant === "band"
                    ? `${subject.lit} ★`
                    : `${subject.lit} étoile${subject.lit > 1 ? "s" : ""} allumée${
                        subject.lit > 1 ? "s" : ""
                      }`}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
