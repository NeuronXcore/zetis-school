import { useState } from "react";
import { Link } from "react-router-dom";
import { SubjectPictogram, subjectColorFor, subjectIconFor } from "@zetis/ui";
import type { DashboardPeriod, DashboardSubject, PageFocus } from "@zetis/types";
import { DashboardCard } from "./DashboardCard";
import { SubjectAnalysisPanel } from "./SubjectAnalysisPanel";
import { generateCouncil } from "../../lib/councilClass";
import { COUNCIL_PERIOD_LABEL } from "../../lib/dashboardDerive";

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

/** Écarte horizontalement les bulles qui se recouvrent trop, autour de leur position réelle.
 *
 *  🔴 Sans ça, deux matières aux mêmes valeurs occupent le MÊME point et la plus petite disparaît
 *  entièrement sous la plus grosse — constaté à l'écran le 2026-08-05 : Histoire-Géo et Anglais,
 *  toutes deux à 1 min et 0 %, au pixel près l'une sur l'autre. Une matière absente du nuage ne se
 *  lit pas comme « superposée », elle se lit comme « pas de données ».
 *
 *  ⚠️ L'écart DÉPLACE le point sur l'axe du temps. C'est un compromis assumé et borné : le
 *  déplacement vaut au plus un rayon, il est symétrique (aucune matière n'est systématiquement
 *  poussée vers « plus de temps »), et l'infobulle porte toujours les chiffres EXACTS. Il est
 *  annoncé dans la note de la carte. */
function spreadOverlaps(
  points: { cx: number; cy: number; r: number }[],
  minX: number,
  maxX: number,
): void {
  const ordered = [...points].sort((a, b) => a.cx - b.cx || b.r - a.r);
  // Plusieurs passes : écarter un point peut le remettre en contact avec son voisin de gauche.
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 1; i < ordered.length; i++) {
      const prev = ordered[i - 1];
      const cur = ordered[i];
      // On ne désentasse que ce qui se chevauche aussi VERTICALEMENT : deux bulles éloignées en
      // consolidation se lisent très bien même proches en temps.
      if (Math.abs(cur.cy - prev.cy) > (prev.r + cur.r) * 0.7) continue;
      const mini = (prev.r + cur.r) * 0.8; // un léger recouvrement reste lisible
      if (cur.cx - prev.cx >= mini) continue;
      const pousse = (mini - (cur.cx - prev.cx)) / 2;
      // 🔴 Les BORNES sont appliquées ICI, dans la boucle, et l'écart est reporté sur le voisin
      // quand l'un des deux est bloqué contre un bord. Un clamp fait APRÈS coup annulait le
      // désentassement : deux matières à 1 minute étaient toutes deux ramenées contre l'axe et se
      // retrouvaient à 2 px l'une de l'autre — constaté à l'écran le 2026-08-05, alors que les
      // tests passaient parce qu'ils plaçaient la collision loin du bord.
      prev.cx = Math.max(minX + prev.r, prev.cx - pousse);
      cur.cx = Math.min(maxX - cur.r, Math.max(cur.cx + pousse, prev.cx + mini));
    }
  }
}

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
  focus: PageFocus | null;
  selected: DashboardSubject | null;
  /** Clic sur une bulle : sélectionne la matière ET déplie son analyse, en un seul geste. */
  onSelect: (slug: string) => void;
  /** Matière dont l'analyse est dépliée, ou `null`. Vient de l'URL (`?panel=ou-agir`), pas d'un
   *  état local — le lien de preuve de la Lecture ZETIS doit pouvoir l'ouvrir depuis la MÊME page,
   *  où React Router ne remonte pas le composant. */
  panelSubject: DashboardSubject | null;
  onClosePanel: () => void;
}

export function WhereToActCard({
  subjects,
  period,
  focus,
  selected,
  onSelect,
  panelSubject,
  onClosePanel,
}: WhereToActCardProps) {
  // 🔴 L'état du run vit ICI, au-dessus du panneau. Le panneau se démonte dès que Papa clique une
  // autre bulle : si `running` y vivait, la barre disparaîtrait, l'état repartirait à zéro et le
  // bouton redeviendrait cliquable PENDANT que l'appel tourne — deux rapports pour une matière.
  const [run, setRun] = useState<{ slug: string; name: string } | null>(null);
  const [done, setDone] = useState<{ slug: string; id: number; text: string } | null>(null);

  const lancerSynthese = (cible: DashboardSubject) => {
    setRun({ slug: cible.slug, name: cible.name });
    setDone(null);
    // Le `period` envoyé est le LIBELLÉ, comme sur la page Conseil : un rapport lancé d'ici et un
    // rapport lancé de là-bas doivent porter la même période dans l'historique.
    void generateCouncil(COUNCIL_PERIOD_LABEL[period], cible.id)
      .then((rapport) => {
        const sien = rapport.subjects.find((s) => s.subject_id === cible.id);
        setDone({
          slug: cible.slug,
          id: rapport.id,
          text: sien?.to_reinforce || rapport.global_summary,
        });
      })
      .catch(() => setDone(null))
      .finally(() => setRun(null));
  };
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

  // Positions calculées ICI, une fois, parce que le désentassement a besoin de voir tous les
  // points ensemble — un point ne peut pas savoir seul qu'il en cache un autre.
  const placed = points.map((p) => ({
    ...p,
    r: 6 + Math.sqrt(p.subject.notions.total) * 2.2,
    cx: x(p.minutes),
    cy: y(p.percent),
  }));
  // Les bornes du cadre sont passées au désentassement, pas appliquées après lui : une matière à
  // 1 minute mordait sur l'axe des ordonnées, et la ramener ensuite écrasait l'écart tout juste
  // obtenu.
  for (const p of placed) {
    p.cx = Math.min(W - PAD.r - p.r, Math.max(PAD.l + p.r, p.cx));
  }
  spreadOverlaps(placed, PAD.l, W - PAD.r);
  // Étiquettes décalées quand deux bulles restent proches : leurs noms se superposaient.
  const labelTier = new Map<string, number>();
  [...placed]
    .sort((a, b) => a.cx - b.cx)
    .forEach((p, i, arr) => {
      const voisin = i > 0 ? arr[i - 1] : null;
      const colle = voisin !== null && Math.abs(p.cx - voisin.cx) < 62;
      labelTier.set(p.subject.slug, colle ? 1 - (labelTier.get(voisin!.subject.slug) ?? 0) : 0);
    });

  return (
    <DashboardCard
      card="ou-agir"
      title="Où agir"
      tagline="temps investi × consolidation"
      focus={focus}
      className="xl:col-span-5"
      note={
        zoomed
          ? `Chaque bulle est une matière ; sa taille est le nombre de notions au programme. L'échelle verticale s'arrête à ${yMax} % parce que c'est le maximum atteint : une bulle haute est simplement DEVANT les autres, pas encore ancrée. Les pointillés sont les médianes des matières affichées. Deux matières aux valeurs identiques sont légèrement écartées pour rester visibles — l'infobulle donne les chiffres exacts.`
          : "Chaque bulle est une matière ; sa taille est le nombre de notions au programme. En bas à droite : beaucoup de temps, peu de consolidation — c'est là qu'une mission change quelque chose. Deux matières aux valeurs identiques sont légèrement écartées pour rester visibles — l'infobulle donne les chiffres exacts."
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

          {placed.map(({ subject, minutes, percent, r: radius, cx, cy }) => {
            // ⚠️ Le rayon PORTE une donnée (aire ∝ notions au programme, cf. la note de la carte).
            // Le pictogramme prend exactement la place du disque : le changer de visuel ne doit pas
            // faire perdre l'encodage de taille, sinon la carte ne dit plus qu'une chose sur trois.
            const dimmed = selected !== null && selected.slug !== subject.slug;
            const color = subjectColorFor(subject.slug, subject.color);
            const icon = subjectIconFor(subject.slug);
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
                  y={cy - radius - 5 - (labelTier.get(subject.slug) ?? 0) * 11}
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

      {panelSubject && (
        <SubjectAnalysisPanel
          subject={panelSubject}
          period={period}
          onClose={onClosePanel}
          generating={run?.slug === panelSubject.slug}
          generatingElsewhere={run && run.slug !== panelSubject.slug ? run.name : null}
          onGenerate={() => lancerSynthese(panelSubject)}
          generated={done?.slug === panelSubject.slug ? done : null}
        />
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
            Ouvrir le conseil de classe — {selected.name}
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
