import { Link } from "react-router-dom";
import type {
  DashboardPeriod,
  DashboardReadingItem,
  PageFocus,
  ProposedMission,
  ReadingTrend,
} from "@zetis/types";
import { DashboardCard } from "./DashboardCard";
import { ProposedMissionPanel } from "./ProposedMissionPanel";

// « Lecture ZETIS » — constats adossés à leurs traces.
//
// En-tête : **moteur local**, jamais « Claude » (adr-0008) — le quotidien pédagogique de Massimo
// ne sort pas de la machine.
//
// Chaque constat porte un lien de preuve. Le serveur n'en émet aucun sans `evidence` : un constat
// sans trace adressable serait une opinion, et une opinion présentée comme une mesure est
// exactement ce qui rendrait ce cadre nuisible.
//
// L'encart « mission proposée » est HORS V1 (adr-0028) : composer une mission suppose d'appeler
// le moteur de missions, ce qu'un GET ne doit pas faire. La carte se rend avec ses constats seuls
// plutôt qu'avec un bouton qui ne mènerait nulle part.

const TREND_ICON: Record<ReadingTrend, { glyph: string; className: string; label: string }> = {
  up: { glyph: "↑", className: "text-papa-accent", label: "en progression" },
  watch: { glyph: "→", className: "text-papa-warn", label: "à surveiller" },
  flat: { glyph: "·", className: "text-papa-muted", label: "sans conclusion" },
};

/** Ajoute la période COURANTE à une preuve qui reste sur le dashboard.
 *
 *  ⚠️ Le `href` est un contrat SERVEUR et son adressage n'est pas réécrit ici — on n'ajoute que la
 *  période, et uniquement aux liens qui pointent vers cette page. Le serveur ne peut pas la
 *  porter : le payload du dashboard est indépendant de toute période, par construction (c'est ce
 *  qui rend le filtrage gratuit). La période est donc un état de LECTURE, que seul le client
 *  connaît.
 *
 *  Sans ça, suivre une preuve renvoyait le sélecteur à « 7 jours » : Papa perdait sa fenêtre au
 *  moment précis où il descendait dans le détail. */
function withPeriod(href: string, period: DashboardPeriod): string {
  if (!href.startsWith("/?")) return href;
  const [chemin, query] = href.split("?");
  const params = new URLSearchParams(query);
  params.set("period", period);
  return `${chemin}?${params}`;
}

interface ZetisReadingCardProps {
  items: DashboardReadingItem[];
  /** Pour que la preuve ne fasse pas perdre la fenêtre en cours. */
  period: DashboardPeriod;
  proposal: ProposedMission | null;
  withoutMission: number;
  focus: PageFocus | null;
  onMissionCreated: () => void;
}

export function ZetisReadingCard({
  items,
  period,
  proposal,
  withoutMission,
  focus,
  onMissionCreated,
}: ZetisReadingCardProps) {
  return (
    <DashboardCard
      card="lecture"
      title="Lecture ZETIS"
      tagline="moteur local · chaque affirmation renvoie à ses traces"
      focus={focus}
      className="xl:col-span-12"
      note="Rien de ce cadre n'apparaît dans l'interface de Massimo."
    >
      <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
      {items.length === 0 ? (
        <p className="py-4 text-sm italic text-papa-muted">
          Pas encore assez de traces mesurées pour formuler un constat. Rien n'est affiché tant
          qu'aucune preuve ne le fonde.
        </p>
      ) : (
        <ul>
          {items.map((item, index) => {
            const trend = TREND_ICON[item.trend];
            return (
              <li
                key={`${item.trend}-${index}`}
                className="flex gap-2.5 border-b border-papa-border/50 py-2.5 text-sm last:border-b-0"
              >
                <span className={`w-4 shrink-0 text-center ${trend.className}`} aria-label={trend.label}>
                  {trend.glyph}
                </span>
                <span className="min-w-0 flex-1 leading-relaxed">
                  {item.text}
                  <Link
                    to={withPeriod(item.evidence.href, period)}
                    className="ml-2 inline-block whitespace-nowrap rounded border border-papa-accent/30 bg-papa-accent/5 px-1.5 py-0.5 font-mono text-[10px] text-papa-accent hover:border-papa-accent"
                  >
                    preuve · {item.evidence.count} {item.evidence.kind}
                  </Link>
                </span>
              </li>
            );
          })}
        </ul>
      )}

        <ProposedMissionPanel
          proposal={proposal}
          withoutMission={withoutMission}
          onCreated={onMissionCreated}
        />
      </div>
    </DashboardCard>
  );
}
