// Vue d'ensemble : une planète par matière (ADR-0024 §1).
//
// Chaque matière est une sphère qui TOURNE SUR SON AXE. L'effet est obtenu en CSS pur — une
// texture d'étoiles qui défile derrière un masque circulaire ombré — et surtout PAS en 3D :
// cet écran ne doit pas charger le chunk Three.js (c'est tout l'intérêt du découpage).
//
// La planète s'éclaire à mesure que Massimo progresse. Le libellé dessous est un COMPTE
// d'étoiles allumées — jamais un pourcentage, jamais un classement.
import type { GalaxySubject } from "@zetis/types";
import { subjectIconFor } from "../../lib/subjectIcons";

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
}

export function SubjectConstellations({ subjects, onOpen }: SubjectConstellationsProps) {
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {subjects.map((subject, i) => {
        const accent = ACCENTS[i % ACCENTS.length];
        const empty = subject.total === 0;
        const ratio = empty ? 0 : subject.lit / subject.total;
        const icon = subjectIconFor(subject.slug);
        return (
          <li key={subject.slug}>
            {/* ⚠️ `cursor-pointer` est EXPLICITE : la préflight de Tailwind v4 pose
                `cursor: default` sur les <button> (changement par rapport à v3). Sans cette
                classe, survoler une planète cliquable ne montre aucune main. */}
            <button
              type="button"
              disabled={empty}
              onClick={() => onOpen(subject.slug)}
              aria-label={
                empty
                  ? `${subject.name} — les étoiles arrivent bientôt`
                  : `${subject.name} — ${subject.lit} étoiles allumées sur ${subject.total}`
              }
              className={
                "group flex w-full flex-col items-center gap-2.5 rounded-2xl p-3 transition disabled:opacity-45 " +
                (empty ? "cursor-default" : "cursor-pointer hover:-translate-y-0.5")
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
              <span
                aria-hidden
                className={
                  "relative block h-20 w-20 overflow-hidden rounded-full shadow-[0_0_34px_var(--glow)] transition-[box-shadow,filter,transform] duration-300 " +
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
                      backgroundImage: `
                        radial-gradient(26px 17px at 18px 24px, ${accent}, transparent 70%),
                        radial-gradient(20px 26px at 62px 56px, ${accent}dd, transparent 70%),
                        radial-gradient(30px 15px at 104px 18px, ${accent}, transparent 70%),
                        radial-gradient(18px 22px at 138px 54px, ${accent}cc, transparent 70%),
                        radial-gradient(14px 12px at 86px 70px, ${accent}ee, transparent 70%)`,
                      backgroundSize: "160px 80px",
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
                      backgroundImage: `
                        radial-gradient(34px 12px at 46px 34px, rgba(255,255,255,.3), transparent 75%),
                        radial-gradient(28px 10px at 122px 62px, rgba(255,255,255,.26), transparent 75%)`,
                      backgroundSize: "160px 80px",
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
                      className="h-10 w-10 object-contain"
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
              <span className="text-sm font-bold">{subject.name}</span>
              <span className="text-xs text-zetis-muted">
                {empty
                  ? "Bientôt"
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
