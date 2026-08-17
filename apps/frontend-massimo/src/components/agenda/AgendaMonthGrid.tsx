import {
  AgendaGlyph,
  AgendaTraceMark,
  AGENDA_KIND_LABEL,
  CADRE_A_VENIR,
  CADRE_EN_RETARD,
  hachurePour,
  joursEnRetard,
  journeeSoldee,
} from "@zetis/ui";
import { type AgendaDay, type AgendaItemStudent, type AgendaMonth } from "@zetis/types";

// Grille MOIS (ADR-0025 Amendement 8 §D1) — la seconde vue, celle qui se demande.
//
// 🔴 **Ce composant existe parce qu'une décision écrite a été RÉVOQUÉE.** Le §Alternatives de
// l'ADR-0025 écartait la vue mois : *« une grille qui s'archive rend les trous visibles, et un
// trou visible est une culpabilité »*. Le commanditaire l'a révoquée le 2026-08-17. Mais la
// moitié du motif SURVIT, et elle est tenue ici :
//
//   · un jour ouvré sans rien ne rend **RIEN** — pas de case grise, pas de point éteint, pas de
//     rail en attente. Il est visuellement identique à une cellule hors mois ;
//   · la grille **n'agrège rien** : aucun total de mois, aucun « X jours travaillés », aucun
//     dégradé d'intensité. **Ce n'est pas une heatmap** — celle-là reste chez Papa ;
//   · **aucun glyphe ne porte l'état de complétion** — deux marques y ont été essayées puis
//     écartées à l'écran (§D11). L'état vit sur la CELLULE : une hachure discrète quand la
//     journée est ENTIÈREMENT soldée. Elle ne grise rien, ne désactive rien, et ne s'allume
//     jamais sur un jour sans échéance — sinon tous les jours vides du mois seraient hachurés,
//     c'est-à-dire l'inverse exact du §7.
//
// Les cellules d'alignement (avant le 1er, après le dernier) sont fabriquées ICI et rendues
// totalement vides, sans numéral : afficher les jours voisins en gris importerait dans le champ
// de vision les trous d'un mois qu'on ne regarde pas.

interface Props {
  month: AgendaMonth;
  /** Items par date, lus depuis la liste vivante (la coche s'y reflète immédiatement). */
  itemsByDate: Record<string, AgendaItemStudent[]>;
  onPickDay: (date: string) => void;
  onNavigate: (anchor: string) => void;
  pickedDay?: string | null;
  today: string;
  /** Survol d'un jour (§D12) — `null` à la sortie. `rect` sert à placer le toast. */
  onHoverDay?: (date: string | null, rect: DOMRect | null) => void;
}

const DOW = ["L", "M", "M", "J", "V", "S", "D"];
const MOIS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

/** Combien de glyphes tiennent dans une cellule. Au-delà : un point neutre qui dit « il y en a
 *  d'autres », JAMAIS combien — un « +2 » serait un compte. */
const MAX_GLYPHES = 3;

function moisLabel(anchor: string): { mois: string; annee: string } {
  const [year, month] = anchor.split("-").map(Number);
  return { mois: MOIS[month - 1], annee: String(year) };
}

/** Jours de décalage entre le lundi et le 1er du mois (0 = le 1er est un lundi). */
function decalageLundi(firstIso: string): number {
  const [y, m, d] = firstIso.split("-").map(Number);
  // ⚠️ Construction composant par composant, jamais `new Date("2026-08-01")` : la forme ISO
  // courte est interprétée en UTC et décale d'un jour selon le fuseau. Convention du dépôt.
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
}

export function AgendaMonthGrid({
  month,
  itemsByDate,
  onPickDay,
  onNavigate,
  pickedDay,
  today,
  onHoverDay,
}: Props) {
  const { mois, annee } = moisLabel(month.anchor);
  const premier = month.days[0]?.date;
  const vides = premier ? decalageLundi(premier) : 0;

  return (
    // 🔴 **LA GRILLE NE DOIT PAS MANGER TOUT LE PREMIER ÉCRAN** (Amdt 9 §D8).
    // Mesuré le 2026-08-17 : la carte faisait **493 px** dans une fenêtre de 856, et les trois
    // registres commençaient donc à 795, 949 et 1013 — tous hors champ. Le compactage ci-dessous
    // ne vise pas l'esthétique : il rend les réponses atteignables.
    //
    // ⚠️ **Tout ce qui se compacte est conditionné au POINTEUR, jamais à la largeur.** Le plancher
    // de 44 × 44 (WCAG 2.1 AA) existe pour un DOIGT, pas pour un curseur — c'est la même règle qui
    // a fait garder 44 px fixes sur la bande au doigt et `flex-1` à la souris. Une bascule sur
    // `sm:` écraserait les cibles d'une tablette de 768 px, que l'on touche.
    <section className="rounded-3xl border border-zetis-border bg-zetis-surface p-3">
      <div className="flex items-center justify-between pb-1.5 pointer-coarse:pb-3">
        <p className="text-sm font-bold tracking-wide">
          {mois} <span className="font-semibold text-zetis-muted">{annee}</span>
        </p>
        <div className="flex">
          {/* 🔴 Aux bornes, le chevron DISPARAÎT — il n'est jamais grisé (§14.6 :
              « un bouton mort se lit comme une panne »). D'où un rendu conditionnel et non un
              `disabled`. La largeur se conserve pour que l'en-tête ne saute pas. */}
          {month.prev_anchor ? (
            <button
              type="button"
              onClick={() => onNavigate(month.prev_anchor!)}
              aria-label="Mois précédent"
              className="grid h-9 w-11 place-items-center rounded-xl text-zetis-muted transition-colors hover:bg-white/5 hover:text-white motion-reduce:transition-none pointer-coarse:h-11"
            >
              ‹
            </button>
          ) : (
            <span className="h-9 w-11 pointer-coarse:h-11" />
          )}
          {month.next_anchor ? (
            <button
              type="button"
              onClick={() => onNavigate(month.next_anchor!)}
              aria-label="Mois suivant"
              className="grid h-9 w-11 place-items-center rounded-xl text-zetis-muted transition-colors hover:bg-white/5 hover:text-white motion-reduce:transition-none pointer-coarse:h-11"
            >
              ›
            </button>
          ) : (
            <span className="h-9 w-11 pointer-coarse:h-11" />
          )}
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px pb-1 text-center text-[10px] font-bold tracking-widest text-zetis-muted sm:gap-0.5">
        {DOW.map((jour, index) => (
          <span key={index}>{jour}</span>
        ))}
      </div>

      {/* `gap-px` sous 420 px et non `gap-0.5` : MESURÉ dans le DOM, la cellule tombait à 42,4 px
          — sous le plancher tactile de 44 × 44 (WCAG 2.1 AA). Il a fallu DEUX réglages, et aucun
          ne suffisait seul : la gouttière de la carte (p-3) et cette gouttière-ci. */}
      <div className="grid grid-cols-7 gap-px sm:gap-0.5">
        {Array.from({ length: vides }, (_, index) => (
          // Cellule d'alignement : totalement vide, SANS numéral. Voir l'en-tête du fichier.
          <span key={`vide-${index}`} aria-hidden className="min-h-[46px] pointer-coarse:min-h-[62px]" />
        ))}
        {month.days.map((day) => (
          <Cellule
            key={day.date}
            day={day}
            items={itemsByDate[day.date] ?? []}
            isToday={day.date === today}
            today={today}
            isOpen={day.date === pickedDay}
            onPick={() => onPickDay(day.date)}
            onHover={onHoverDay}
          />
        ))}
      </div>
    </section>
  );
}

function Cellule({
  day,
  items,
  isToday,
  today,
  isOpen,
  onPick,
  onHover,
}: {
  day: AgendaDay;
  items: AgendaItemStudent[];
  isToday: boolean;
  today: string;
  isOpen: boolean;
  onPick: () => void;
  onHover?: (date: string | null, rect: DOMRect | null) => void;
}) {
  const numero = Number(day.date.slice(8, 10));
  const [y, m, d] = day.date.split("-").map(Number);
  const weekend = [0, 6].includes(new Date(y, m - 1, d).getDay());

  // Registre HAUT : les échéances (pleines) puis les préparations (contour).
  //
  // ⚠️ **Ordre d'échéance, surtout PAS « contrôle d'abord »** : trier par gravité serait une
  // jauge d'urgence, que le §6 interdit explicitement (« le décompte n'est pas une jauge qui
  // change de couleur »).
  const marques = [
    ...items.map((item) => ({
      key: `i${item.id}`,
      kind: item.kind,
      color: item.subject?.color,
      filled: true,
      label:
        `${item.subject?.name ?? "sans matière"} ${AGENDA_KIND_LABEL[item.kind]}` +
        (item.done ? ", fait" : ""),
    })),
    ...day.plan_steps.map((step) => {
      const cible = items.find((item) => item.id === step.agenda_item_id);
      return {
        key: `p${step.id}`,
        // Le contour porte la silhouette et la teinte de l'ÉCHÉANCE qu'il prépare — d'où la
        // recherche de la cible. Sans elle, un plan flotterait sans dire ce qu'il prépare.
        kind: cible?.kind ?? "devoir",
        color: cible?.subject?.color,
        filled: false,
        label: `préparation ${cible?.subject?.name ?? ""}`.trim(),
      };
    }),
  ];

  // `traces` : `null` sur un jour à venir, `[]` sur un jour passé sans activité. Les deux se
  // rendent IDENTIQUEMENT — comme rien du tout. C'est le §7, préservé entier.
  const traces = day.traces ?? [];

  // Journée SOLDÉE : au moins une échéance, et toutes faites. La seconde garde compte autant que
  // la première — sans elle, tous les jours vides du mois seraient hachurés.
  const soldee = journeeSoldee(items);
  const hachure = hachurePour(items);

  // Le cadre orange (§D13) — DEUX conditions, et la seconde a été oubliée à la première écriture.
  //
  // 🔴 **« À venir » n'inclut PAS aujourd'hui.** Aujourd'hui garde son cadre cyan, qui dit
  // « on est ici dans le temps » ; deux cadres sur la même cellule se contrediraient. La
  // comparaison de chaînes ISO suffit et évite tout fuseau : `2026-08-20` > `2026-08-17`.
  //
  // 🔴 **Et le jour doit PORTER quelque chose.** Sans cette garde, quatorze cellules sur trente
  // et une étaient encadrées, la plupart VIDES : le cadre annonçait « ça arrive » sur des jours
  // où rien n'arrive. C'est le gabarit de cases que le §7 refuse, réintroduit sur le futur —
  // et c'est exactement le même oubli que la garde `items.length > 0` de la hachure (§D11).
  // Signalé par le commanditaire à l'écran, le 2026-08-17.
  const aVenir = day.date > today && marques.length > 0;
  // Jour PASSÉ qui garde une échéance non faite (§D18). Exclusif de `aVenir` par construction.
  const enRetard = joursEnRetard(items, day.date < today);

  const dit = [
    ...(enRetard ? ["en retard"] : []),
    ...(soldee ? ["journée finie"] : []),
    ...marques.map((marque) => marque.label),
    ...traces.map((trace) => `travaillé ${trace.name ?? "sans matière"}`),
  ].join(", ");

  return (
    <button
      type="button"
      onClick={onPick}
      // `mouseEnter`/`mouseLeave` et non `pointerEnter` : au doigt, un `pointerenter` se
      // déclenche AU TAP et ferait apparaître le toast en même temps que le panneau.
      onMouseEnter={(e) => onHover?.(day.date, e.currentTarget.getBoundingClientRect())}
      onMouseLeave={() => onHover?.(null, null)}
      onFocus={(e) => onHover?.(day.date, e.currentTarget.getBoundingClientRect())}
      onBlur={() => onHover?.(null, null)}
      aria-expanded={isOpen}
      // L'`aria-label` énumère les matières EN TOUTES LETTRES : c'est la borne du coût
      // daltonien. La palette des 8 matières n'est pas sûre entre ses propres membres en
      // deutéranopie — dans la grille, la teinte ACCÉLÈRE, elle n'identifie jamais seule.
      aria-label={`${numero}${dit ? ` — ${dit}` : ""}`}
      // La HACHURE du jour soldé (§D11). `backgroundImage` et non une classe : elle se superpose
      // au fond de la cellule (week-end, aujourd'hui) sans le remplacer.
      // 🔴 Aucun `disabled`, aucune baisse d'opacité : une cellule grisée se lirait comme
      // désactivée, or c'est précisément le jour qu'on veut pouvoir rouvrir.
      style={{
        ...(hachure ? { backgroundImage: hachure } : {}),
        // Le cadre ORANGE des jours à venir (§D13). En `style` et non en classe, parce qu'il
        // doit s'appliquer SANS écraser le cyan d'aujourd'hui : `isToday` gagne toujours.
        // ⚠️ **`enRetard` passe AVANT `aVenir`** — les deux sont exclusifs par construction
        // (passé vs futur), mais l'ordre est écrit pour qu'un futur changement de définition ne
        // fasse pas dépendre la couleur de l'ordre des clés d'un objet.
        ...(enRetard
          ? { borderColor: CADRE_EN_RETARD }
          : aVenir
            ? { borderColor: CADRE_A_VENIR }
            : {}),
      }}
      data-soldee={soldee || undefined}
      data-a-venir={aVenir || undefined}
      data-en-retard={enRetard || undefined}
      className={`flex min-h-[46px] flex-col items-center rounded-xl border px-0.5 py-1 pointer-coarse:min-h-[62px] pointer-coarse:py-1.5 transition-colors motion-reduce:transition-none ${
        isToday
          ? // Le cyan d'aujourd'hui ne colore JAMAIS un glyphe : numéral, bordure et halo
            // seulement. C'est ce qui le sépare de la physique-chimie, qui porte exactement la
            // même teinte `#22d3ee`. Un aplat et une lueur ne se confondent pas.
            "border-cyan-400/60 bg-cyan-400/5 shadow-[0_0_18px_-6px_rgba(34,211,238,0.6)]"
          : weekend
            ? // Le week-end RECULE, il ne ferme pas : seul le fond change. Son contenu garde
              // exactement la même vivacité qu'un mardi — l'exemple qui a lancé ce chantier est
              // un samedi travaillé.
              "border-transparent bg-white/[0.02] hover:bg-white/5"
            : "border-transparent hover:bg-white/5"
      } ${isOpen ? "ring-2 ring-white/70" : ""}`}
    >
      <span
        className={`text-[13px] font-semibold leading-4 ${
          isToday ? "text-cyan-300" : weekend ? "text-zetis-muted" : ""
        }`}
      >
        {numero}
      </span>

      {/* Registre HAUT — hauteur réservée sur TOUTES les cellules : sans elle, les rangées
          sauteraient d'une semaine à l'autre. */}
      <span className="mt-0.5 flex h-3 items-center justify-center gap-0.5">
        {marques.slice(0, MAX_GLYPHES).map((marque) => (
          <AgendaGlyph
            key={marque.key}
            kind={marque.kind}
            color={marque.color}
            filled={marque.filled}
          />
        ))}
        {marques.length > MAX_GLYPHES && <Debordement />}
      </span>

      {/* Registre BAS — ce que tu as travaillé. */}
      <span className="mt-0.5 flex h-1.5 items-center justify-center gap-0.5">
        {traces.slice(0, MAX_GLYPHES).map((trace, index) => (
          <AgendaTraceMark key={`${trace.slug ?? "neutre"}-${index}`} color={trace.color} />
        ))}
      </span>
    </button>
  );
}

/** « Il y en a d'autres », jamais combien : un « +2 » serait un compte, et le §7 les interdit. */
function Debordement() {
  return <span aria-hidden className="h-[3px] w-[3px] rounded-full bg-zetis-muted opacity-60" />;
}
