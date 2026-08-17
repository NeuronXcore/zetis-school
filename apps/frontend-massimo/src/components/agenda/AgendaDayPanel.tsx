import { Link } from "react-router-dom";
import { type AgendaItemStudent, type AgendaPlanStep, type AgendaTraceDetail } from "@zetis/types";
import { subjectColorFor } from "@zetis/ui";
import { subjectIconFor } from "../../lib/subjectIcons";
import { AgendaItemRow } from "./AgendaItemRow";
import {
  type DayPreparation,
  JOUR_VIDE,
  longDayLabel,
  planStepTarget,
  shortDayLabel,
} from "../../lib/agendaSections";

// Le jour ouvert depuis la bande (addendum ADR-0025 §17).
//
// La bande n'était qu'un INDEX : un tap faisait défiler vers les items du jour. Sur un jour
// PASSÉ, le serveur ne renvoie jamais d'échéance (§6, asymétrie calculée serveur) — le tap ne
// faisait donc **rien**, alors que des points de trace étaient allumés dessous. Un jour qui
// montre quelque chose et ne répond pas se lit comme une panne.
//
// **Ce panneau répond toujours**, y compris pour dire qu'il n'y avait rien à rendre.
//
// ⚠️ Registre : aucun rouge, aucun « en retard », aucun compteur d'arriéré (§7). Un item passé
// non fait est « à reprendre », en ambre doux — le même ton que la section du bas, parce que
// c'est le même objet vu par une autre porte.

interface Props {
  date: string;
  items: AgendaItemStudent[];
  /** Ce que Massimo a travaillé ce jour-là (Amdt 8 §D2) — matières, notions, formes.
   *
   *  🔴 Était `traces: number | null`, qui produisait « tu as travaillé 3 fois ». Le nombre ÉTAIT
   *  la phrase à tuer : trois points verts ne disent rien de ce qui a été fait.
   *
   *  ⚠️ Chargé À LA DEMANDE par le parent (une requête par jour ouvert), et non servi avec la
   *  bande : le détail d'un jour n'intéresse que le jour qu'on ouvre, et le précharger sur 14 ou
   *  42 jours coûterait autant de jointures pour rien. */
  traces: AgendaTraceDetail[];
  onClose: () => void;
  onToggle: (item: AgendaItemStudent) => void;
  onDismiss: (item: AgendaItemStudent) => void;
  /** Plans indexés par échéance (ADR-0050). ⚠️ **Ce panneau montre le plan de SES échéances, pas
   *  les étapes qui tombent CE jour-là** : ce sont deux questions différentes, et c'est la
   *  seconde que le `✦` de la bande porte. Un plan se lit sous ce qu'il prépare. */
  planByItem?: Record<number, AgendaPlanStep[]>;
  onToggleStep?: (step: AgendaPlanStep) => void;
  /** Les étapes qui tombent CE jour-là — la seconde question, celle que le `✦` porte. Servie
   *  à part de `planByItem` **exprès** : les fusionner reviendrait à répondre à une question
   *  avec les données de l'autre, ce qui est précisément le défaut corrigé ici. */
  preparations?: DayPreparation[];
  /** Ouvre la panoplie d'une notion travaillée (Amdt 8 §D10). Le chargement et le panneau
   *  vivent chez le parent : ce composant reste présentationnel. */
  onOpenNotion?: (skillId: number) => void;
}

/** Notions affichées par matière. Le même 3 que la bande, les glyphes et « à reprendre » : la
 *  page ne grossit pas toute seule. */
const NOTIONS_MAX = 3;

export function AgendaDayPanel({
  date,
  items,
  traces,
  onClose,
  onToggle,
  onDismiss,
  planByItem,
  onToggleStep,
  preparations = [],
  onOpenNotion,
}: Props) {
  const aujourdhui = new Date();
  aujourdhui.setHours(0, 0, 0, 0);
  const passe = new Date(`${date}T00:00:00`) < aujourdhui;

  return (
    <section
      id="agenda-jour"
      aria-label={`Travail du ${longDayLabel(date)}`}
      className="mt-3 rounded-3xl border border-zetis-border bg-zetis-surface p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-zetis-accent-2">
          {longDayLabel(date)}
        </p>
        {/* 🔴 `▴` ET NON `✕` (2026-08-11, relecture humaine). Ce bouton portait **exactement le
            même `className` et le même glyphe** que la croix de masquage des cartes : sur un
            panneau qui montre trois devoirs, l'écran affichait donc **trois `✕` indiscernables**,
            un qui referme et deux qui archivent définitivement. C'est très probablement là que
            deux devoirs de la base de dev sont partis la veille.

            Le masquage a été borné aux items de Massimo le même jour, donc les deux mauvais ont
            disparu — mais le survivant gardait une forme qui, au milieu de devoirs, se lit encore
            « fais disparaître ça ». Et le commanditaire l'a lu ainsi, à la relecture.

            ⚠️ **Le chevron n'est pas un choix de goût : c'est le vocabulaire DÉJÀ employé par la
            page** deux blocs plus bas — « Replier la suite ▴ ». Un même geste, un même signe.
            L'addendum §17 rappelle par ailleurs que **retaper le jour le referme** : ce bouton est
            une affordance secondaire, il n'a pas à emprunter la forme du geste destructeur. */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Replier le jour"
          title="Replier"
          // 44 × 44 (Amdt 8 §D6-f) : il mesurait ~20 × 18 px. `-m-2.5` reprend le débord pour
          // que l'en-tête garde sa densité — la zone grandit, le glyphe ne bouge pas.
          className="-m-2.5 grid h-11 w-11 shrink-0 place-items-center rounded-lg text-xs text-zetis-muted transition-colors hover:text-white motion-reduce:transition-none"
        >
          ▴
        </button>
      </div>

      {items.length > 0 ? (
        <div className="mt-3 flex flex-col gap-2">
          {items.map((item) => (
            <AgendaItemRow
              key={item.id}
              item={item}
              // Le ton « resume » n'est PAS un jugement sur le retard : c'est l'ambre doux du
              // rattrapage, et il ne s'applique qu'à ce qui reste à faire d'un jour passé.
              tone={passe && !item.done ? "resume" : "normal"}
              onToggle={() => onToggle(item)}
              onDismiss={() => onDismiss(item)}
              planSteps={planByItem?.[item.id]}
              onToggleStep={onToggleStep}
            />
          ))}
        </div>
      ) : preparations.length === 0 && traces.length === 0 ? (
        // 🔴 **`traces.length === 0` EST le correctif du défaut fondateur.** Sans cette
        // condition, le samedi 15 août affichait « Rien à rendre ce jour-là. » en corps de
        // panneau — puis, cinquante lignes plus bas, « tu as travaillé 3 fois ». L'écran
        // affirmait le vide, puis se dédisait en note de bas de page.
        //
        // Un jour où Massimo a travaillé n'est pas un jour vide, même si l'école ne demandait
        // rien : la phrase ne doit pas s'imprimer.
        <p className="mt-3 text-sm text-zetis-muted">
          {/* 🔴 **UNE seule phrase, passé comme futur, et écrite UNE seule fois** (§D15). Elle
              était double — « Ce jour-là, l'école ne demandait rien. » / « Rien de noté pour ce
              jour. » — et recopiée dans le toast. La constante partagée est le seul moyen de
              tenir la règle « deux surfaces qui répondent la même chose la disent pareil ». */}
          {JOUR_VIDE}
        </p>
      ) : null}

      {/* ✦ CE QUE LE JOUR PRÉPARE — la promesse du marqueur, enfin tenue.
          Le `✦` de la bande s'allume sur les `plan_steps` du JOUR ; le panneau ne rendait que
          les échéances DU jour. Deux questions différentes (l'en-tête des props le disait déjà),
          et la Décision 3 garantit qu'elles ne coïncident jamais : une étape tombe toujours
          AVANT l'échéance qu'elle prépare. D'où des jours marqués qui s'ouvraient sur du vide.

          🔴 **Aucune coche ici, et c'est le point.** L'étape se coche sous l'échéance, où le plan
          vit (Décision 2 ter). Deux cases pour un même état, c'est exactement le défaut que le
          reste de ce correctif retire. Ces lignes MÈNENT à l'activité, elles ne la déclarent pas. */}
      {preparations.length > 0 && (
        <div className="mt-4 border-t border-white/10 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zetis-accent-2">
            ✦ Ce jour-là, tu prépares
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {preparations.map(({ step, item }) => {
              const target = planStepTarget(step, item);
              const inner = (
                <>
                  <span aria-hidden>{target.icon}</span>
                  <span className="min-w-0 flex-1 truncate">{target.label}</span>
                  {/* Le SUJET de l'étape, jamais un rouage : sans lui, « réviser ce chapitre »
                      ne dit pas lequel — le motif même de la Décision 2 ter. */}
                  <span className="shrink-0 text-[11px] text-zetis-muted">
                    pour {item.label} · {shortDayLabel(item.due_on)}
                  </span>
                </>
              );
              return (
                <li key={step.id} className="flex">
                  {target.to === null ? (
                    <span className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-zetis-muted">
                      {inner}
                    </span>
                  ) : (
                    <Link
                      to={target.to}
                      state={target.state}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs text-slate-100 transition-colors hover:border-violet-400/45 motion-reduce:transition-none"
                    >
                      {inner}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ── CE QUE TU AS TRAVAILLÉ (ADR-0025 Amendement 8 §D2) ────────────────────────────────
          🔴 **Remplace « tu as travaillé N fois »**, qui était le défaut fondateur de cet
          amendement. Sur le samedi 15 août du commanditaire, l'écran affirmait « Rien à rendre
          ce jour-là » en corps de panneau, puis se dédisait cinquante lignes plus bas, en plus
          petit, avec un NOMBRE. Trois points verts ne disent rien de ce qui a été fait.

          Registre — chaque mot est un arbitrage écrit :
            · « Ce que tu as travaillé », pas « Ton activité » (froid, instrumental), pas
              « Bilan » (un bilan appelle un verdict), pas « Résumé » (suppose qu'on comptait) ;
            · **aucun nombre**, aucune minute, aucun XP, aucun score, aucun total ;
            · ordre CHRONOLOGIQUE de première touche, servi tel quel par le serveur — trier ici
              par volume ou par fréquence, **ce serait mesurer**.

          ⚠️ **Aucun lien causal avec les échéances ci-dessus.** Pas de « ✓ tu as fait ton devoir
          de maths » : la trace n'est pas la preuve de l'échéance. C'est tout l'objet de
          l'exclusion `NON_ACTIVITY_EVENTS` côté serveur, et le suggérer à l'écran déferait au
          niveau visuel ce que le serveur protège au niveau de la donnée. */}
      {traces.length > 0 && (
        <div className={items.length > 0 || preparations.length > 0 ? "mt-4 border-t border-white/10 pt-3" : "mt-3"}>
          <p className="text-xs font-semibold uppercase tracking-wide text-zetis-accent-2">
            Ce que tu as travaillé
          </p>
          <ul className="mt-2 flex flex-col gap-0.5">
            {traces.map((trace, index) => {
              const icon = trace.slug ? subjectIconFor(trace.slug) : undefined;
              return (
                <li
                  key={`${trace.slug ?? "neutre"}-${index}`}
                  className="flex gap-3 rounded-r-sm border-l-[3px] py-2 pl-3"
                  // La teinte de la MATIÈRE, via `subjectColorFor` — jamais `trace.color` brut :
                  // `Subject.color` est nullable, et le repli du dépôt existe exactement pour ça.
                  // Une matière sans couleur ne doit pas retomber sur du gris.
                  style={{
                    borderLeftColor: trace.slug
                      ? subjectColorFor(trace.slug, trace.color)
                      : "var(--color-zetis-border)",
                  }}
                >
                  {icon ? (
                    <img src={icon} alt="" aria-hidden className="h-6 w-6 shrink-0 rounded-md object-contain" />
                  ) : (
                    // Matière inconnue OU activité sans matière (le chat, surtout). Une pastille
                    // neutre, jamais un emoji codé en dur, jamais un `<img>` cassé.
                    <span aria-hidden className="h-6 w-6 shrink-0 rounded-md bg-white/10" />
                  )}
                  <span className="min-w-0">
                    {/* Une activité sans matière n'affiche pas de nom : les formes suffisent à
                        dire ce qu'il a fait. Inventer « Autre » serait nommer un vide. */}
                    {trace.name && (
                      <span className="block text-[13.5px] font-bold leading-tight">{trace.name}</span>
                    )}
                    {/* La ligne de notion SAUTE quand l'événement n'en porte pas — la matière
                        seule reste une réponse. ⚠️ « Notion » et non « chapitre » : `Skill` n'a
                        aucun `chapter_id`, aucun chemin ne mène de l'événement au chapitre. */}
                    {trace.notions.length > 0 && (
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                        {/* PLAFOND À 3, vu à l'écran le 2026-08-17 : une journée de maths
                            rendait SIX notions sur trois lignes serrées — un mur de texte à
                            13 px sur l'écran d'un enfant de treize ans. Le plafond est celui
                            que la page applique déjà partout (traces, glyphes, « à reprendre »).
                            ⚠️ **Une ellipse, jamais un nombre** : « +3 » serait un compte, et
                            c'est très exactement ce que cet amendement retire de la surface. */}
                        {trace.notions.slice(0, NOTIONS_MAX).map((notion) => (
                          // 🔴 **Chaque notion est une PORTE** (Amdt 8 §D10). Elle était un texte
                          // inerte : la page racontait à Massimo ce qu'il avait fait sans lui
                          // laisser aucun moyen d'y revenir — un récit en cul-de-sac.
                          // Le tap ouvre la panoplie RÉELLE de la notion, qui n'annonce que ce
                          // qui est disponible : jamais un bouton mort (§14.6).
                          <button
                            key={notion.id}
                            type="button"
                            onClick={() => onOpenNotion?.(notion.id)}
                            className="min-h-8 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[13px] leading-snug text-zetis-text/90 transition-colors hover:border-cyan-400/45 hover:text-white motion-reduce:transition-none"
                          >
                            {notion.name}
                          </button>
                        ))}
                        {trace.notions.length > NOTIONS_MAX && (
                          <span className="text-[13px] text-zetis-muted">…</span>
                        )}
                      </span>
                    )}
                    <span className="mt-0.5 block text-[11.5px] text-zetis-muted">
                      {trace.forms.join(" · ")}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* La PORTE — un jour passé ne doit plus être un cul-de-sac (Amdt 8 §D6-c).
          Le registre est repris de l'état vide de la page, pas inventé. Et la destination est
          `/matieres`, une route JAMAIS vide : envoyer vers une session de révision qui peut ne
          servir aucune carte fabriquerait le bouton mort du §14.6. */}
      {passe && (
        <Link
          to="/matieres"
          className="mt-4 flex items-center gap-2 border-t border-white/10 pt-3 text-[13px] font-semibold text-zetis-accent-2 transition-colors hover:text-cyan-200 motion-reduce:transition-none"
        >
          Reprendre une notion <span aria-hidden>→</span>
        </Link>
      )}
    </section>
  );
}
