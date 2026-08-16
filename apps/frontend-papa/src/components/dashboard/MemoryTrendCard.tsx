import { useState } from "react";
import type { DashboardPeriod, DashboardSeries, PageFocus } from "@zetis/types";
import { DashboardCard } from "./DashboardCard";

// « Évolution de la mémoire » — quatre vues d'une même question.
//
// Historique : la carte n'a longtemps porté qu'un seul tracé, trois courbes superposées. Il avait
// deux défauts que la base de dev a rendus mesurables le 2026-08-05 :
//
//   1. **l'échelle écrasait ce qu'on venait lire.** Le maximum de l'axe est fixé par `covered`
//      (222) ; « consolidées » valait 1 et « à renforcer » 13. Les deux courbes que la carte existe
//      pour montrer occupaient les 6 % du bas d'un cadre de 190 px — une dizaine de pixels — pendant
//      que la courbe de contexte en prenait 94 % ;
//   2. **aucune des trois ne pouvait redescendre.** `reconstruct_series` projette l'ensemble
//      d'aujourd'hui à rebours : c'est croissant par construction. Une notion consolidée en juin
//      puis perdue en juillet n'apparaît nulle part — elle est absente de TOUT son passé. Trois
//      courbes qui ne peuvent ni baisser ni se croiser ne montrent jamais d'événement.
//
// D'où quatre vues, et non un tracé de plus : elles ne répondent pas à la même question et ne
// partagent NI la même unité NI la même nature de mesure. Les mélanger sur un axe unique
// fabriquerait la contradiction que `adr-0038`/`adr-0039` passent leur temps à refermer.
//
// ⚠️ « Paliers » reste la vue par défaut, et ce n'est pas un choix esthétique : `CARD_SCOPES` fait
// allumer cette carte par les KPI « Notions consolidées » et « À renforcer » (ADR-0028 §5). Un clic
// sur ces KPI doit tomber sur la vue qui JUSTIFIE leur chiffre. Ouvrir par défaut sur les révisions
// SRS — la vue la mieux fournie en données — casserait ce contrat en silence.

const W = 620;
const H = 190;
const PAD = { l: 34, r: 12, t: 12, b: 26 };

type View = "paliers" | "revisions" | "retention" | "solde";

const VIEWS: readonly (readonly [View, string])[] = [
  ["paliers", "Paliers"],
  ["revisions", "Révisions"],
  ["retention", "Rétention"],
  ["solde", "Solde"],
];

interface MemoryTrendCardProps {
  series: DashboardSeries;
  period: DashboardPeriod;
  focus: PageFocus | null;
  /** 14 entiers, J+0 → J+13 — la moitié droite de la vue « Révisions ». */
  reviewLoad: number[];
  /** Programme entier, dénominateur de l'aire empilée. */
  notionsTotal: number;
  /** Date de mise en service de `skill_mastery_history`, ou `null`. La vue « Solde » en dépend
   *  entièrement : sans bascule enregistrée, un flux à zéro se lirait « rien n'a bougé » alors
   *  qu'il faut lire « on ne sait pas ». */
  historySince: string | null;
}

/** Dernier point d'une série — 0 si elle est vide. `Array.prototype.at` n'est pas dans la lib
 *  TypeScript ciblée par le dépôt. */
const last = (values: number[]): number => values[values.length - 1] ?? 0;

const X_LABELS: Record<DashboardPeriod, string[]> = {
  "7": ["J-6", "J-3", "auj."],
  "30": ["S-4", "S-2", "auj."],
  "90": ["M-3", "M-1", "auj."],
  "365": ["A-1", "M-6", "auj."],
};

/** Largeur d'un intervalle de la fenêtre, en jours — sert à NOMMER l'échelle du passé dans la vue
 *  « Révisions », dont les deux moitiés n'ont pas le même pas. */
const BUCKET_DAYS: Record<DashboardPeriod, string> = {
  "7": "~14 h",
  "30": "~3 j",
  "90": "~8 j",
  "365": "~1 mois",
};

const RATINGS: readonly (readonly [keyof DashboardSeries["reviews"], string, string])[] = [
  ["again", "à revoir", "fill-papa-warn"],
  ["hard", "difficile", "fill-papa-warn/45"],
  ["good", "su", "fill-papa-accent/55"],
  ["easy", "facile", "fill-papa-accent"],
];

function Legend({ items }: { items: readonly (readonly [string, string])[] }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-papa-muted">
      {items.map(([label, className]) => (
        <li key={label}>
          <svg viewBox="0 0 8 8" className="mr-1.5 inline-block h-2 w-2 align-[-1px]">
            <rect width={8} height={8} rx={2} className={className} />
          </svg>
          {label}
        </li>
      ))}
    </ul>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-sm italic text-papa-muted">{children}</p>;
}

export function MemoryTrendCard({
  series,
  period,
  focus,
  reviewLoad,
  notionsTotal,
  historySince,
}: MemoryTrendCardProps) {
  const [view, setView] = useState<View>("paliers");
  const points = series.covered.length;

  // Grille horizontale commune à toutes les vues qui portent un axe des ordonnées.
  const grid = (max: number, y: (v: number) => number, suffix = "") =>
    [0, Math.round(max / 2), max].map((value) => (
      <g key={value}>
        <line
          x1={PAD.l}
          x2={W - PAD.r}
          y1={y(value)}
          y2={y(value)}
          className="stroke-papa-border"
          strokeWidth={1}
        />
        <text
          x={PAD.l - 8}
          y={y(value) + 3}
          textAnchor="end"
          className="fill-papa-muted font-mono text-[9.5px]"
        >
          {value}
          {suffix}
        </text>
      </g>
    ));

  const xLabels = (x: (i: number) => number) =>
    [0, Math.floor((points - 1) / 2), points - 1].map((index, k) => (
      <text
        key={index}
        x={x(index)}
        y={H - 8}
        textAnchor="middle"
        className="fill-papa-muted font-mono text-[9.5px]"
      >
        {X_LABELS[period][k]}
      </text>
    ));

  return (
    <DashboardCard
      card="memoire"
      title="Évolution de la mémoire"
      tagline={
        view === "paliers"
          ? "où en est le programme"
          : view === "revisions"
            ? "ce qui a été revu, et ce qui vient"
            : view === "retention"
              ? "ce qui tient, sur ce qui a été travaillé"
              : "entrées et sorties du palier consolidé"
      }
      focus={focus}
      className="xl:col-span-7"
      action={
        <span className="inline-flex gap-0.5 rounded-lg border border-papa-border bg-papa-surface-2 p-0.5">
          {VIEWS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={view === value}
              onClick={() => setView(value)}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                view === value ? "bg-papa-accent text-[#042f1f]" : "text-papa-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </span>
      }
      note={
        view === "paliers" ? (
          <>
            Quatre paliers qui totalisent le programme entier ({notionsTotal} notions). La bande
            grise n'est pas un retard : ce sont les notions <strong>jamais abordées</strong>, et
            elle domine tant que l'année commence.
          </>
        ) : view === "revisions" ? (
          <>
            Passages de cartes SRS réellement effectués, empilés par note — la seule mesure du
            dépôt qui porte sur la mémoire elle-même et non sur un palier de maîtrise. ⚠️ Les deux
            moitiés n'ont pas la même échelle de temps : un intervalle vaut {BUCKET_DAYS[period]} à
            gauche, un jour à droite.
          </>
        ) : view === "retention" ? (
          <>
            Part des notions <strong>travaillées</strong> qui sont consolidées — jamais rapportée au
            programme entier, qui ferait un ratio rassurant et faux. Avec un dénominateur petit,
            chaque notion déplace la courbe d'un grand pas : il est affiché à côté.
          </>
        ) : (
          <>
            Mouvements datés lus dans <code>skill_mastery_history</code>. ⚠️ Ce n'est{" "}
            <strong>pas</strong> la même mesure que l'écart « +N » du KPI « À renforcer », qui compte
            les entrées de l'ensemble d'aujourd'hui projeté à rebours et ne peut jamais être négatif.
            Les deux nombres n'ont aucune raison de coïncider.
          </>
        )
      }
    >
      {points < 2 ? (
        <Empty>Pas encore assez d'historique pour tracer une évolution.</Empty>
      ) : view === "paliers" ? (
        <PaliersView series={series} total={notionsTotal} grid={grid} xLabels={xLabels} />
      ) : view === "revisions" ? (
        <RevisionsView series={series} load={reviewLoad} period={period} grid={grid} />
      ) : view === "retention" ? (
        <RetentionView series={series} grid={grid} xLabels={xLabels} />
      ) : (
        <SoldeView series={series} historySince={historySince} xLabels={xLabels} />
      )}
    </DashboardCard>
  );
}

type GridFn = (max: number, y: (v: number) => number, suffix?: string) => React.ReactNode;
type XLabelsFn = (x: (i: number) => number) => React.ReactNode;

/** Vue « Paliers » — l'aire empilée qui totalise le programme.
 *
 *  Elle remplace le tracé historique et en corrige le défaut d'échelle par construction : les
 *  bandes se lisent à l'ÉPAISSEUR, sans jamais dépendre de la valeur maximale d'une courbe voisine.
 *  Les quatre paliers sont ceux de « État des notions » — la carte de gauche montre la même
 *  décomposition dans l'espace, celle-ci la montre dans le temps. */
function PaliersView({
  series,
  total,
  grid,
  xLabels,
}: {
  series: DashboardSeries;
  total: number;
  grid: GridFn;
  xLabels: XLabelsFn;
}) {
  const points = series.covered.length;
  const max = Math.max(1, total);
  const x = (i: number) => PAD.l + (i * (W - PAD.l - PAD.r)) / Math.max(1, points - 1);
  const y = (v: number) => H - PAD.b - (v / max) * (H - PAD.t - PAD.b);

  // Empilement depuis le bas : l'acquis repose sur le sol, le non-abordé flotte au-dessus. Le
  // « reste » est une SOUSTRACTION et jamais un statut — même règle que `notAddressed`.
  const bands = [
    { key: "consolidated", label: "consolidées", className: "fill-papa-accent", values: series.consolidated },
    { key: "fragile", label: "à renforcer", className: "fill-papa-warn", values: series.fragile },
    { key: "in_progress", label: "en cours", className: "fill-papa-accent-2/60", values: series.in_progress },
    {
      key: "rest",
      label: "non abordées",
      className: "fill-papa-border",
      values: series.consolidated.map((_, i) =>
        Math.max(
          0,
          max - (series.consolidated[i] ?? 0) - (series.fragile[i] ?? 0) - (series.in_progress[i] ?? 0),
        ),
      ),
    },
  ];

  // Ligne de contexte, PAS une bande : « couvertes par un cours validé » ne se range dans aucun
  // palier de maîtrise — une notion couverte peut être consolidée, fragile, ou pas encore
  // travaillée. L'empiler mentirait sur la partition.
  //
  // 🔴 Elle avait DISPARU de l'écran à la refonte en quatre vues : l'ancien tracé la portait, aucune
  // des quatre nouvelles ne la reprenait, et rien ne l'a signalé — c'est la seule mesure du
  // dashboard qui relie la PRODUCTION (chaîne de contenus) aux NOTIONS. C'est aussi ce qui rend
  // cette carte justifiable par le focus `chaine`.
  //
  // Elle ne peut plus écraser l'échelle comme avant : l'axe est borné par le programme entier, pas
  // par le maximum d'une courbe.
  const coveredPath = series.covered
    .map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(" ");

  let floor = new Array(points).fill(0) as number[];
  const areas = bands.map((band) => {
    const top = floor.map((base, i) => base + (band.values[i] ?? 0));
    const up = top.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
    const down = floor
      .map((_, i) => `L${x(points - 1 - i).toFixed(1)} ${y(floor[points - 1 - i] ?? 0).toFixed(1)}`)
      .join(" ");
    floor = top;
    return <path key={band.key} d={`${up} ${down} Z`} className={band.className} />;
  });

  return (
    <>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Paliers : ${last(series.consolidated)} consolidées, ${last(series.fragile)} à renforcer, ${last(series.in_progress)} en cours, sur ${total} notions au programme`}
      >
        {grid(max, y)}
        {areas}
        <path
          d={coveredPath}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          className="text-papa-text/70"
          strokeLinejoin="round"
        />
        {xLabels(x)}
      </svg>
      <Legend
        items={[
          [`consolidées (${last(series.consolidated)})`, "fill-papa-accent"],
          [`à renforcer (${last(series.fragile)})`, "fill-papa-warn"],
          [`en cours (${last(series.in_progress)})`, "fill-papa-accent-2/60"],
          [`non abordées (${Math.max(0, total - last(series.consolidated) - last(series.fragile) - last(series.in_progress))})`, "fill-papa-border"],
        ]}
      />
      <p className="mt-1.5 text-[11px] text-papa-muted">
        <span className="mr-1.5 inline-block h-0 w-3 border-t border-dashed border-papa-text/70 align-[3px]" />
        couvertes par un cours validé ({last(series.covered)}) — trait de contexte, pas un palier :
        une notion couverte peut être à n'importe lequel des quatre.
      </p>
    </>
  );
}

/** Vue « Révisions » — le passé mesuré à gauche, la charge à venir à droite, aujourd'hui au milieu.
 *
 *  ⚠️ L'axe des abscisses n'est PAS linéaire de part et d'autre du trait : à gauche 12 intervalles
 *  de la fenêtre choisie, à droite 14 jours pleins. C'est le seul moyen de tenir les deux lectures
 *  sur un même cadre, et la note de la carte le dit plutôt que de le taire. */
function RevisionsView({
  series,
  load,
  period,
  grid,
}: {
  series: DashboardSeries;
  load: number[];
  period: DashboardPeriod;
  grid: GridFn;
}) {
  const points = series.reviews.again.length;
  const totals = Array.from({ length: points }, (_, i) =>
    RATINGS.reduce((sum, [key]) => sum + (series.reviews[key][i] ?? 0), 0),
  );
  const done = totals.reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...totals, ...load);

  // 62 % du cadre au passé, 38 % au futur : le passé porte la lecture, le futur n'est qu'un appui.
  const inner = W - PAD.l - PAD.r;
  const split = PAD.l + inner * 0.62;
  const y = (v: number) => H - PAD.b - (v / max) * (H - PAD.t - PAD.b);
  const pastW = (split - PAD.l) / Math.max(1, points);
  const futureW = (W - PAD.r - split) / 14;

  if (done === 0 && load.every((v) => v === 0)) {
    return (
      <Empty>
        Aucune carte de révision n'a été passée sur cette fenêtre, et aucune n'est due dans les 14
        jours.
      </Empty>
    );
  }

  return (
    <>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Révisions : ${done} passages sur la fenêtre, ${load.reduce((a, b) => a + b, 0)} cartes dues dans les 14 jours`}
      >
        {grid(max, y)}

        {/* Passé : une pile par intervalle, du raté (en bas) au su (en haut). */}
        {Array.from({ length: points }, (_, i) => {
          let base = 0;
          return RATINGS.map(([key, , className]) => {
            const value = series.reviews[key][i] ?? 0;
            if (value <= 0) return null;
            const top = base + value;
            const rect = (
              <rect
                key={`${key}-${i}`}
                x={PAD.l + i * pastW + 0.6}
                y={y(top)}
                width={Math.max(pastW - 1.2, 0.8)}
                height={Math.max(y(base) - y(top), 0.8)}
                className={className}
              />
            );
            base = top;
            return rect;
          });
        })}

        {/* Futur : la charge due, en creux. Elle n'est pas mesurée, elle est PLANIFIÉE — d'où le
            contour plutôt que l'aplat, qui la ferait lire comme un fait accompli. */}
        {load.map((value, i) =>
          value <= 0 ? null : (
            <rect
              key={`load-${i}`}
              x={split + i * futureW + 0.6}
              y={y(value)}
              width={Math.max(futureW - 1.2, 0.8)}
              height={Math.max(y(0) - y(value), 0.8)}
              className="fill-papa-accent-2/20 stroke-papa-accent-2/70"
              strokeWidth={0.8}
            />
          ),
        )}

        <line
          x1={split}
          x2={split}
          y1={PAD.t - 4}
          y2={H - PAD.b}
          className="stroke-papa-muted"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
        <text x={split - 6} y={H - 8} textAnchor="end" className="fill-papa-muted font-mono text-[9.5px]">
          {X_LABELS[period][0]} → auj.
        </text>
        <text x={split + 6} y={H - 8} className="fill-papa-muted font-mono text-[9.5px]">
          14 j à venir
        </text>
      </svg>
      <Legend
        items={[
          ...RATINGS.map(
            ([key, label, className]) =>
              [
                `${label} (${series.reviews[key].reduce((a, b) => a + b, 0)})`,
                className,
              ] as const,
          ),
          [`dues à venir (${load.reduce((a, b) => a + b, 0)})`, "fill-papa-accent-2/40"],
        ]}
      />
    </>
  );
}

/** Vue « Rétention » — le seul tracé de la carte qui puisse REDESCENDRE.
 *
 *  Un ratio, pas un volume : l'axe est 0–100 % quoi qu'il arrive, donc l'échelle ne peut plus être
 *  confisquée par une courbe de contexte. C'était le premier défaut mesuré de la carte. */
function RetentionView({
  series,
  grid,
  xLabels,
}: {
  series: DashboardSeries;
  grid: GridFn;
  xLabels: XLabelsFn;
}) {
  const points = series.consolidated.length;
  const worked = Array.from(
    { length: points },
    (_, i) =>
      (series.consolidated[i] ?? 0) + (series.fragile[i] ?? 0) + (series.in_progress[i] ?? 0),
  );
  // `null` et non 0 quand rien n'a été travaillé : « 0 % de rien » est un jugement, pas une mesure.
  // La courbe s'interrompt là plutôt que de plonger au sol.
  const rate = worked.map((total, i) =>
    total > 0 ? ((series.consolidated[i] ?? 0) / total) * 100 : null,
  );

  const x = (i: number) => PAD.l + (i * (W - PAD.l - PAD.r)) / Math.max(1, points - 1);
  const y = (v: number) => H - PAD.b - (v / 100) * (H - PAD.t - PAD.b);

  if (rate.every((v) => v === null)) {
    return <Empty>Aucune notion travaillée sur cette fenêtre : il n'y a rien à rapporter.</Empty>;
  }

  // Segments séparés : un trou dans la mesure ne doit pas être relié par un trait qui l'inventerait.
  const segments: string[] = [];
  let current: string[] = [];
  rate.forEach((value, i) => {
    if (value === null) {
      if (current.length > 1) segments.push(current.join(" "));
      current = [];
      return;
    }
    current.push(`${current.length ? "L" : "M"}${x(i).toFixed(1)} ${y(value).toFixed(1)}`);
  });
  if (current.length > 1) segments.push(current.join(" "));

  const lastRate = [...rate].reverse().find((v) => v !== null) ?? 0;

  return (
    <>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Rétention : ${Math.round(lastRate)} % des ${last(worked)} notions travaillées sont consolidées`}
      >
        {grid(100, y, " %")}
        {segments.map((d) => (
          <path
            key={d}
            d={d}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="text-papa-accent"
            strokeLinejoin="round"
          />
        ))}
        {rate.map((value, i) =>
          value === null ? null : (
            <circle key={i} cx={x(i)} cy={y(value)} r={2} className="fill-papa-accent" />
          ),
        )}
        {xLabels(x)}
      </svg>
      <p className="mt-2 text-[11px] text-papa-muted">
        <span className="font-mono text-papa-accent">{Math.round(lastRate)} %</span> — soit{" "}
        {last(series.consolidated)} notion{last(series.consolidated) > 1 ? "s" : ""} consolidée
        {last(series.consolidated) > 1 ? "s" : ""} sur {last(worked)} travaillée
        {last(worked) > 1 ? "s" : ""}.
      </p>
    </>
  );
}

/** Vue « Solde » — le seul endroit du dashboard où une PERTE est visible.
 *
 *  ⚠️ Elle lit `skill_mastery_history`, pas les stocks reconstruits, et les deux ne se réconcilient
 *  pas. `adr-0028-dashboard-papa-agregat-unique (Amendement 2) §5 ter` avait écarté ce solde AU TITRE DU DELTA DE KPI,
 *  parce qu'il aurait contredit la sparkline dessinée à trois millimètres de lui. Ici il est une vue
 *  autonome, nommée, dont la note dit qu'elle ne compte pas comme le KPI. Le §5 ter n'est pas
 *  révoqué : il est borné à ce qu'il visait. */
function SoldeView({
  series,
  historySince,
  xLabels,
}: {
  series: DashboardSeries;
  historySince: string | null;
  xLabels: XLabelsFn;
}) {
  const points = series.gained.length;
  const totalGained = series.gained.reduce((a, b) => a + b, 0);
  const totalLost = series.lost.reduce((a, b) => a + b, 0);

  if (totalGained === 0 && totalLost === 0) {
    // Un flux à zéro ne dit PAS « rien n'a bougé » — il dit « on n'a pas de trace ». La distinction
    // est tout l'intérêt de la vue, et la taire en dessinant une ligne plate serait un mensonge
    // tranquille.
    return (
      <Empty>
        Aucune entrée ni sortie du palier « consolidée » n'est enregistrée sur cette fenêtre.
        {historySince
          ? ` L'historique des bascules ne commence qu'au ${new Date(`${historySince}T00:00:00`).toLocaleDateString("fr-FR")} : c'est une absence de trace, pas une absence de mouvement.`
          : " Aucune bascule n'a encore été enregistrée : c'est une absence de trace, pas une absence de mouvement."}
      </Empty>
    );
  }

  const max = Math.max(1, ...series.gained, ...series.lost);
  const mid = (H - PAD.b + PAD.t) / 2;
  const half = (H - PAD.b - PAD.t) / 2;
  const x = (i: number) => PAD.l + (i * (W - PAD.l - PAD.r)) / Math.max(1, points - 1);
  const barW = Math.max((W - PAD.l - PAD.r) / points - 2, 1);

  return (
    <>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Solde : ${totalGained} entrées et ${totalLost} sorties du palier consolidée sur la fenêtre`}
      >
        <line x1={PAD.l} x2={W - PAD.r} y1={mid} y2={mid} className="stroke-papa-border" strokeWidth={1} />
        <text x={PAD.l - 8} y={mid + 3} textAnchor="end" className="fill-papa-muted font-mono text-[9.5px]">
          0
        </text>

        {series.gained.map((value, i) =>
          value <= 0 ? null : (
            <rect
              key={`g-${i}`}
              x={x(i) - barW / 2}
              y={mid - (value / max) * half}
              width={barW}
              height={(value / max) * half}
              rx={1.5}
              className="fill-papa-accent"
            />
          ),
        )}
        {series.lost.map((value, i) =>
          value <= 0 ? null : (
            <rect
              key={`l-${i}`}
              x={x(i) - barW / 2}
              y={mid}
              width={barW}
              height={(value / max) * half}
              rx={1.5}
              className="fill-papa-warn"
            />
          ),
        )}
        {xLabels(x)}
      </svg>
      <Legend
        items={[
          [`entrées en consolidée (${totalGained})`, "fill-papa-accent"],
          [`sorties (${totalLost})`, "fill-papa-warn"],
        ]}
      />
    </>
  );
}
