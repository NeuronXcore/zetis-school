import { useEffect, useRef } from "react";
import { type AgendaDay, type AgendaItemStudent } from "@zetis/types";
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

// Bande GLISSANTE : 3 jours avant aujourd'hui, aujourd'hui, 10 après (14 colonnes, réglables
// serveur). Jamais alignée sur lundi–dimanche — une bande calendaire passerait de 6 jours
// d'horizon le lundi à 0 le dimanche soir, au pire moment. La grille MOIS répond à l'autre
// question ; elle ne rend pas celle-ci calendaire (ADR-0025 Amdt 8 §D7 : la bande est le défaut).
//
// Le nombre de colonnes n'est JAMAIS présumé ici : la bande rend ce que le serveur envoie.
//
// 🔴 **RANGÉE UNIQUE À DÉFILEMENT** depuis l'Amendement 8 §D6-a. Elle se repliait en
// `grid-cols-7` sur deux rangées, et ces deux rangées de sept **ressemblaient à des semaines
// sans en être** : `DAY_NAMES` est indexé par `getDay()` et la bande part de `aujourd'hui − 3`,
// donc la première colonne était le jour que le hasard désignait — et elle changeait tous les
// jours. Le motif d'origine du repli (« 14 colonnes à 380 px feraient 27 px chacune ») est
// répondu par le DÉFILEMENT, pas par le pliage : un défilement dit honnêtement « il y en a plus
// à droite », un pliage fabrique une fausse semaine.
//
// Ce qu'elle ne montre JAMAIS (ADR-0024 §5, ADR-0025 §7) :
//   – aucun gabarit de cases dont certaines resteraient éteintes. Un jour passé sans trace ne
//     rend RIEN : il est visuellement identique à un jour hors plage ;
//   – aucun bouton « + » sur un jour vide. Un jour vide est normalement vide ;
//   – **aucun état de complétion** : `done` arrive du serveur, il n'est pas rendu ici.

interface Props {
  days: AgendaDay[];
  /** Items par date, lus depuis la liste vivante (la coche s'y reflète immédiatement). */
  itemsByDate: Record<string, AgendaItemStudent[]>;
  onPickDay: (date: string) => void;
  /** Jour actuellement ouvert sous la bande (addendum §17), ou `null`. */
  pickedDay?: string | null;
  /** Survol d'un jour (§D12) — `null` à la sortie. */
  onHoverDay?: (date: string | null, rect: DOMRect | null) => void;
}

const DAY_NAMES = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];
const MAX_GLYPHES = 3;

export function AgendaWeekStrip({ days, itemsByDate, onPickDay, pickedDay, onHoverDay }: Props) {
  const piste = useRef<HTMLDivElement>(null);

  // La bande s'ouvre AIMANTÉE SUR AUJOURD'HUI, jamais au début : sans ça, une rangée qui défile
  // s'ouvrirait sur `aujourd'hui − 3`, c'est-à-dire sur le rétroviseur.
  useEffect(() => {
    const rail = piste.current;
    const cible = rail?.querySelector<HTMLElement>("[data-today='true']");
    if (!rail || !cible) return;
    rail.scrollLeft = cible.offsetLeft - rail.clientWidth / 2 + cible.clientWidth / 2;
  }, [days]);

  return (
    <div
      ref={piste}
      // `snap-x` aimante chaque colonne : au doigt, la bande s'arrête sur un jour, jamais entre
      // deux. `overscroll-x-contain` évite d'emporter la navigation arrière du navigateur.
      //
      // 🔴 **Plus de défilement à la souris** (demande du commanditaire, 2026-08-17 :
      // « agrandir la ligne 14 jours pour éviter de scroller horizontalement »). Les colonnes
      // sont en `flex-1` et se partagent toute la largeur : les 14 tiennent d'un coup.
      //
      // ⚠️ **Le discriminant est le POINTEUR, pas la largeur** — et ce n'est pas un détail.
      // Le plancher de 44 × 44 (WCAG 2.1 AA, HIG 44 pt) existe pour un DOIGT, jamais pour un
      // curseur. Une bascule sur `sm:` se serait trompée deux fois : elle aurait écrasé les
      // colonnes à 33 px sur une tablette de 768 px (que l'on touche), et gardé un défilement
      // inutile sur une fenêtre étroite de bureau (que l'on clique).
      // Mesuré ici même le 2026-08-17 : avec `sm:`, la colonne tombait à **33,5 px**.
      //
      // Au doigt, on garde donc 44 px fixes et la bande défile — 14 colonnes dans 335 px
      // feraient 24 px chacune. C'est le calcul qui avait fait REPLIER la bande en deux rangées ;
      // le défilement est la réponse honnête, le pliage fabriquait une fausse semaine.
      className="flex snap-x snap-mandatory gap-1 overflow-x-visible overscroll-x-contain pb-1 pointer-coarse:gap-1.5 pointer-coarse:overflow-x-auto"
    >
      {days.map((day) => {
        const [year, month, date] = day.date.split("-").map(Number);
        const jsDate = new Date(year, month - 1, date);
        const isToday = day.offset === 0;
        // 🔴 **« À venir » n'inclut PAS aujourd'hui**, qui garde son cadre cyan. L'`offset` est
        // servi par le serveur : aucun calcul de date côté client, aucun fuseau à traverser.
        // ⚠️ La seconde garde (`marques.length`) est calculée plus bas — le cadre n'existe que
        // sur un jour qui PORTE quelque chose. Cf. le commentaire de `AgendaMonthGrid`.

        // 🔴 **LE REJEU CLIENT DE L'ASYMÉTRIE A ÉTÉ RETIRÉ** (Amdt 8 §R3). Il y avait ici
        // `day.offset >= 0 ? (itemsByDate[day.date] ?? []) : []`, qui rejouait côté client la
        // règle « un jour passé n'a plus d'échéance à annoncer ». Le serveur ayant cessé de
        // vider `fixed_items`, ne corriger que lui **n'aurait rien changé à l'écran** : le piège
        // était armé à DEUX endroits, et documenté comme tel.
        const items = itemsByDate[day.date] ?? [];

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
          // Le `✦` violet de 10 px a disparu (Amdt 8 §D6-b) : il portait à lui seul tout le
          // signal du plan sans dire QUELLE matière, et sa boîte `h-3` était réservée sur les
          // 14 colonnes pour une marque qui s'allume sur deux jours. Le plan est désormais un
          // glyphe en contour, à la place et à la taille d'une vraie échéance.
          ...day.plan_steps.map((step) => {
            const cible = items.find((item) => item.id === step.agenda_item_id);
            return {
              key: `p${step.id}`,
              kind: cible?.kind ?? ("devoir" as const),
              color: cible?.subject?.color,
              filled: false,
              label: `préparation ${cible?.subject?.name ?? ""}`.trim(),
            };
          }),
        ];
        const traces = day.traces ?? [];
        // Journée SOLDÉE : au moins une échéance, et toutes faites (§D11). La bande et la
        // grille emploient LA MÊME fonction — deux définitions de « fini » divergeraient.
        const soldee = journeeSoldee(items);
        const hachure = hachurePour(items);
        // Le cadre orange : jour FUTUR **et** qui porte au moins une marque. Un jour à venir
        // sans rien ne rend rien — annoncer « ça arrive » sur un jour où rien n'arrive était le
        // défaut vu à l'écran le 2026-08-17.
        const aVenir = day.offset > 0 && marques.length > 0;
        // Jour PASSÉ qui garde une échéance non faite (§D18).
        const enRetard = joursEnRetard(items, day.offset < 0);
        const dit = [
          ...(enRetard ? ["en retard"] : []),
          ...(soldee ? ["journée finie"] : []),
          ...marques.map((marque) => marque.label),
          ...traces.map((trace) => `travaillé ${trace.name ?? "sans matière"}`),
        ].join(", ");

        return (
          <button
            key={day.date}
            type="button"
            data-today={isToday}
            onClick={() => onPickDay(day.date)}
            onMouseEnter={(e) => onHoverDay?.(day.date, e.currentTarget.getBoundingClientRect())}
            onMouseLeave={() => onHoverDay?.(null, null)}
            onFocus={(e) => onHoverDay?.(day.date, e.currentTarget.getBoundingClientRect())}
            onBlur={() => onHoverDay?.(null, null)}
            aria-expanded={pickedDay === day.date}
            aria-label={`${DAY_NAMES[jsDate.getDay()]} ${date}${dit ? ` — ${dit}` : ""}`}
            // Hachure du jour soldé (§D11) — jamais un grisé, jamais un `disabled`.
            style={{
              ...(hachure ? { backgroundImage: hachure } : {}),
              // Cadre orange des jours à venir (§D13) — `isToday` garde toujours son cyan.
              ...(enRetard
                ? { borderColor: CADRE_EN_RETARD }
                : aVenir
                  ? { borderColor: CADRE_A_VENIR }
                  : {}),
            }}
            data-soldee={soldee || undefined}
            data-a-venir={aVenir || undefined}
            data-en-retard={enRetard || undefined}
            // ⚠️ Le jour OUVERT porte une marque distincte de celle d'aujourd'hui, et elle ne la
            // remplace pas : les deux se cumulent quand Massimo ouvre le jour même. Le cyan dit
            // « on est ici dans le temps », l'anneau blanc dit « c'est ce que tu regardes ».
            // Souris : `flex-1 min-w-0`, les colonnes se partagent la largeur, rien ne défile.
            // Doigt : `w-11` fixe (44 px, plancher WCAG) et la bande défile.
            className={`flex min-w-0 flex-1 snap-center flex-col items-center gap-1 rounded-2xl px-0.5 py-2 transition-colors motion-reduce:transition-none pointer-coarse:w-11 pointer-coarse:flex-none pointer-coarse:shrink-0 pointer-coarse:px-1 ${
              isToday
                ? "border border-cyan-400/60 bg-cyan-400/5 shadow-[0_0_18px_-6px_rgba(34,211,238,0.6)]"
                : "border border-transparent hover:bg-white/5"
            } ${pickedDay === day.date ? "ring-2 ring-white/70" : ""}`}
          >
            <span className="text-[10px] uppercase tracking-wide text-zetis-muted">
              {DAY_NAMES[jsDate.getDay()]}
            </span>
            <span className={`text-base font-bold ${isToday ? "text-cyan-300" : ""}`}>{date}</span>

            {/* Registre HAUT — échéances (pleines) puis préparations (contour). Hauteur
                réservée sur TOUTES les colonnes, sinon la bande sauterait d'un jour à l'autre. */}
            <span className="flex h-4 items-center justify-center gap-0.5">
              {marques.slice(0, MAX_GLYPHES).map((marque) => (
                <AgendaGlyph
                  key={marque.key}
                  kind={marque.kind}
                  color={marque.color}
                  filled={marque.filled}
                />
              ))}
              {marques.length > MAX_GLYPHES && (
                <span aria-hidden className="h-[3px] w-[3px] rounded-full bg-zetis-muted opacity-60" />
              )}
            </span>

            {/* Registre BAS — traces. `null` (jour à venir) et `[]` (jour passé sans activité)
                se rendent identiquement : comme RIEN. Aucun réceptacle, jamais. */}
            <span className="flex h-1.5 items-center justify-center gap-0.5">
              {traces.slice(0, MAX_GLYPHES).map((trace, index) => (
                <AgendaTraceMark key={`${trace.slug ?? "neutre"}-${index}`} color={trace.color} />
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}
