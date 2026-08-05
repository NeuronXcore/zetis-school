import { Link } from "react-router-dom";
import { SubjectPictogram, subjectColorFor, subjectIconFor } from "@zetis/ui";
import type { DashboardFocus, DashboardPeriod, DashboardSubject } from "@zetis/types";
import { DashboardCard } from "./DashboardCard";

// « Où agir » — nuage temps actif × taux de consolidation, aire ∝ nombre de notions.
//
// Division du travail avec le Conseil de classe (ADR-0028 §7) : ce nuage **repère** l'anomalie
// (mesure, coup d'œil quotidien), le Conseil l'**explique** (interprétation écrite, trimestrielle).
//
// Deux sorties de niveaux différents :
//   · clic sur une bulle → filtre local instantané, on reste dans le cockpit ;
//   · CTA               → `/conseil?subject=&period=`, on change de surface.
//
// Le deep-link PORTE la période, sinon le Conseil raconterait un trimestre quand Papa regardait
// sept jours.

const W = 400;
const H = 250;
const PAD = { l: 44, r: 18, t: 14, b: 36 };

// Plancher de l'échelle verticale. En début d'année le programme entier est à ~0 % consolidé (1
// notion sur 280 au premier rendu réel) : sans plancher, l'axe se calerait sur 1 % et étalerait
// sur 250 px des écarts qui sont du bruit — quatre matières à EXACTEMENT zéro resteraient de
// toute façon superposées, mais la cinquième monterait en haut du graphe, là où le haut se lit
// « bien ancré ». Le plancher garde ces cas écrasés en bas, ce qui est la lecture vraie.
const Y_FLOOR_PERCENT = 10;

/** Médiane d'une série, 0 si vide. Sert aux DEUX pointillés de quadrant. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

interface WhereToActCardProps {
  subjects: DashboardSubject[];
  period: DashboardPeriod;
  focus: DashboardFocus | null;
  selected: DashboardSubject | null;
  onSelect: (slug: string) => void;
}

export function WhereToActCard({ subjects, period, focus, selected, onSelect }: WhereToActCardProps) {
  const plotted = subjects.filter((s) => s.notions.total > 0);
  // Les coordonnées sont calculées UNE fois, avant le rendu : l'échelle et les médianes dépendent
  // de l'ensemble des points, on ne peut plus les déduire matière par matière dans le `map`.
  //
  // Tracées de la PLUS GROSSE à la plus petite : SVG peint dans l'ordre du document, et une
  // matière au petit programme tombant près d'une grosse disparaissait entièrement dessous. Dans
  // cet ordre, la petite est toujours au-dessus — elle reste visible et cliquable.
  const points = plotted
    .map((subject) => ({
      subject,
      minutes: subject.minutes[period] ?? 0,
      percent: Math.round((subject.notions.consolidated / subject.notions.total) * 100),
    }))
    .sort((a, b) => b.subject.notions.total - a.subject.notions.total);

  const maxMinutes = Math.max(1, ...points.map((p) => p.minutes)) * 1.15;

  // Échelle verticale ADAPTATIVE : elle se cale sur le maximum atteint (+30 % de respiration,
  // arrondi au multiple de 5) et remonte toute seule jusqu'à 100 % au fil de l'année. Une échelle
  // figée à 100 % collait toutes les matières sur l'axe pendant les premiers mois ; une échelle
  // libre, elle, mentirait — d'où le plancher, la médiane qui suit, et la mention affichée.
  const topPercent = Math.max(0, ...points.map((p) => p.percent));
  const yMax = Math.min(100, Math.max(Y_FLOOR_PERCENT, Math.ceil((topPercent * 1.3) / 5) * 5));
  const zoomed = yMax < 100;

  // ⚠️ Les quadrants sont de VRAIES médianes des matières tracées. La verticale valait
  // `0.42 × max` — un nombre fixe que la spec appelait déjà « médiane » sans qu'il en soit une ;
  // et l'horizontale était figée à 35 %, donc hors du cadre dès que l'échelle zoome. Avec des
  // médianes, la lecture devient relative — « moins ancré que les autres » et non « pas ancré » —
  // ce qui est la seule chose qu'on puisse dire honnêtement quand tout le programme démarre.
  const medianPercent = median(points.map((p) => p.percent));
  const medianMinutes = median(points.map((p) => p.minutes));

  // Une bulle à 0 % est centrée SUR la ligne du zéro : sans retrait, la moitié du pictogramme
  // passe sous l'axe et vient chevaucher les libellés. Tolérable tant qu'une seule matière y
  // était ; intenable maintenant qu'elles y sont presque toutes. On réserve donc la hauteur du
  // plus gros rayon, et la ligne d'axe redevient un CADRE tracé sous la rangée du zéro — les
  // graduations passant par `y()`, l'étiquette « 0 % » reste alignée sur les bulles à zéro.
  const bottomInset = Math.max(0, ...points.map((p) => 6 + Math.sqrt(p.subject.notions.total) * 2.2)) + 2;
  const plotHeight = H - PAD.t - PAD.b - bottomInset;

  const x = (minutes: number) => PAD.l + (minutes / maxMinutes) * (W - PAD.l - PAD.r);
  const y = (percent: number) => H - PAD.b - bottomInset - (percent / yMax) * plotHeight;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(yMax * f));

  return (
    <DashboardCard
      card="ou-agir"
      title="Où agir"
      tagline="temps investi × consolidation"
      focus={focus}
      className="xl:col-span-5"
      note={
        zoomed
          ? `Chaque bulle est une matière ; sa taille est le nombre de notions au programme. L'échelle verticale s'arrête à ${yMax} % parce que c'est le maximum atteint : une bulle haute est simplement DEVANT les autres, pas encore ancrée. Les pointillés sont les médianes des matières affichées.`
          : "Chaque bulle est une matière ; sa taille est le nombre de notions au programme. En bas à droite : beaucoup de temps, peu de consolidation — c'est là qu'une mission change quelque chose."
      }
    >
      {plotted.length === 0 ? (
        <p className="py-6 text-sm italic text-papa-muted">
          Aucune matière n'a encore de notions au programme.
        </p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Temps actif par matière croisé avec le taux de notions consolidées">
          <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} className="stroke-papa-border" />
          <line x1={PAD.l} x2={PAD.l} y1={PAD.t} y2={H - PAD.b} className="stroke-papa-border" />

          {/* Quadrants : les médianes découpent la zone d'alerte, annotée en toutes lettres —
              une position dans un nuage ne se lit pas d'elle-même. Chaque pointillé n'est tracé
              que s'il tombe AILLEURS que sur son axe : une médiane à zéro se confondrait avec
              l'axe et se lirait comme une graduation. */}
          {medianMinutes > 0 && (
            <line x1={x(medianMinutes)} x2={x(medianMinutes)} y1={PAD.t} y2={H - PAD.b} className="stroke-papa-border/60" strokeDasharray="3 4" />
          )}
          {medianPercent > 0 && (
            <line x1={PAD.l} x2={W - PAD.r} y1={y(medianPercent)} y2={y(medianPercent)} className="stroke-papa-border/60" strokeDasharray="3 4" />
          )}
          <text x={W - PAD.r - 4} y={H - PAD.b - 8} textAnchor="end" className="fill-papa-warn/80 text-[10px]">
            beaucoup de temps, peu d'ancrage
          </text>

          {yTicks.map((percent) => (
            <text key={percent} x={PAD.l - 8} y={y(percent) + 3} textAnchor="end" className="fill-papa-muted font-mono text-[9.5px]">
              {percent}%
            </text>
          ))}

          {/* L'aveu, sans lequel tout le reste ment : une bulle haute sur une échelle zoomée n'est
              PAS une matière bien ancrée. Écrit dans le graphe et non dans la note du bas, pour
              être lu en même temps que les bulles. */}
          {zoomed && (
            <text x={PAD.l + 4} y={PAD.t + 8} className="fill-papa-warn/70 font-mono text-[9px]">
              échelle ajustée · max {yMax} %
            </text>
          )}
          <text x={(PAD.l + W - PAD.r) / 2} y={H - 8} textAnchor="middle" className="fill-papa-muted font-mono text-[9.5px]">
            temps actif sur la période →
          </text>

          {points.map(({ subject, minutes, percent }) => {
            // ⚠️ Le rayon PORTE une donnée (aire ∝ notions au programme, cf. la note de la carte).
            // Le pictogramme prend exactement la place du disque : le changer de visuel ne doit pas
            // faire perdre l'encodage de taille, sinon la carte ne dit plus qu'une chose sur trois.
            const radius = 6 + Math.sqrt(subject.notions.total) * 2.2;
            const dimmed = selected !== null && selected.slug !== subject.slug;
            const color = subjectColorFor(subject.slug, subject.color);
            const icon = subjectIconFor(subject.slug);
            const cx = x(minutes);
            const cy = y(percent);
            const clipId = `ou-agir-${subject.slug}`;
            return (
              <g
                key={subject.slug}
                className="cursor-pointer"
                onClick={() => onSelect(subject.slug)}
                opacity={dimmed ? 0.25 : 1}
              >
                {/* Sur le `<g>` : il couvre le pictogramme ET l'étiquette, là où l'ancien titre
                    posé sur le disque laissait le nom de la matière sans infobulle. */}
                <title>{`${subject.name} — ${minutes} min · ${percent} % consolidé · ${subject.notions.total} notions`}</title>
                {icon ? (
                  <>
                    <clipPath id={clipId}>
                      <circle cx={cx} cy={cy} r={radius} />
                    </clipPath>
                    {/* `slice` et non `meet` : les pictogrammes sont carrés, `meet` les laisserait
                        flotter dans le cercle avec du vide sur les côtés. Même cadrage que le
                        `object-cover` de `SubjectPictogram` — le même pictogramme doit se lire
                        pareil ici et sur les pastilles de filtre. */}
                    <image
                      href={icon}
                      x={cx - radius}
                      y={cy - radius}
                      width={radius * 2}
                      height={radius * 2}
                      preserveAspectRatio="xMidYMid slice"
                      clipPath={`url(#${clipId})`}
                    />
                    {/* L'anneau garde le lien avec la couleur de la matière, celle du donut et des
                        pastilles. Sans lui, la bulle perdait son appartenance en changeant de
                        visuel. */}
                    <circle cx={cx} cy={cy} r={radius} fill="none" stroke={color} strokeWidth={1.5} />
                  </>
                ) : (
                  // Repli quand l'asset manque — même règle que `SubjectPictogram`, qui retombe sur
                  // l'initiale plutôt que d'inventer un emoji.
                  <>
                    <circle cx={cx} cy={cy} r={radius} fill={color} stroke={color} strokeWidth={1.5} opacity={0.55} />
                    <text x={cx} y={cy + 3.5} textAnchor="middle" className="fill-papa-text font-semibold text-[10px]">
                      {subject.name.slice(0, 1).toUpperCase()}
                    </text>
                  </>
                )}
                <text
                  x={cx}
                  y={cy - radius - 5}
                  textAnchor="middle"
                  className="fill-papa-muted font-mono text-[9.5px]"
                >
                  {subject.name.slice(0, 12)}
                </text>
              </g>
            );
          })}
        </svg>
      )}

      {/* CTA à DEUX ÉTATS, toujours présent : le faire apparaître décalerait la mise en page au
          moment même où Papa vise une bulle. Le pictogramme qui se colore signale que le lien
          s'est PRÉCISÉ (ADR-0028 §8). */}
      <Link
        to={selected ? `/conseil?subject=${selected.slug}&period=${period}` : "/conseil"}
        className={`mt-3 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
          selected
            ? "bg-papa-accent text-[#042f1f]"
            : "border border-papa-border bg-papa-surface-2 text-papa-muted hover:border-papa-accent/50 hover:text-papa-text"
        }`}
      >
        {selected ? (
          <>
            {/* Pictogramme via `subjectIcons` — jamais d'emoji codé en dur. */}
            <SubjectPictogram slug={selected.slug} name={selected.name} size="sm" />
            Analyser {selected.name} dans le conseil de classe
          </>
        ) : (
          <>
            <span className="opacity-50 grayscale">✦</span>
            Conseil de classe — toutes matières
          </>
        )}
        <span className="opacity-70">→</span>
      </Link>
    </DashboardCard>
  );
}
