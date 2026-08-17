import { Link } from "react-router-dom";
import { type AgendaItemStudent, type AgendaPlanStep } from "@zetis/types";
import { subjectColorFor } from "@zetis/ui";
import { subjectIconFor } from "../../lib/subjectIcons";
import {
  originLabel,
  planStepDayLabel,
  planStepTarget,
  revisionSessionState,
  shortDayLabel,
} from "../../lib/agendaSections";
import { agendaCourseRoute } from "../../lib/notionRoutes";

// Un item de l'agenda de Massimo.
//
// La coche est **toujours actionnable**, sur tous les items — y compris ceux ajoutés par Papa.
// C'est le seul geste qui rend l'objet sien, et sans lui l'objet n'aurait aucun état (Papa est
// en 403 sur `done_at`). Cocher ne crédite AUCUN XP et ne déclenche aucune célébration : le
// geste est déclaratif, il ne se récompense pas — sinon Massimo apprend à cocher.
//
// **Aucune affordance d'édition** : en phase 0 aucun item ne lui appartient, et le serveur
// répondrait 403. Montrer un bouton qui échoue serait pire que de ne rien montrer.

interface Props {
  item: AgendaItemStudent;
  /** Affiche la date à droite (sections « plus tard » et « à reprendre »). */
  showDate?: boolean;
  /** Ambre doux — jamais rouge, jamais « en retard ». */
  tone?: "normal" | "resume";
  onToggle: () => void;
  onDismiss: () => void;
  /** Le plan de préparation de CETTE échéance (ADR-0050), déjà trié du plus tôt au plus tard.
   *  Vide ou absent ⇒ **rien n'est rendu** : ni bloc, ni « bientôt », ni espace réservé. */
  planSteps?: AgendaPlanStep[];
  onToggleStep?: (step: AgendaPlanStep) => void;
}

export function AgendaItemRow({
  item,
  showDate = false,
  tone = "normal",
  onToggle,
  onDismiss,
  planSteps,
  onToggleStep,
}: Props) {
  const origin = originLabel(item);
  const coursRoute = agendaCourseRoute(item);
  const steps = planSteps ?? [];
  // 🔴 **Le plan absorbe la porte de l'ADR-0049 quand il la porte déjà.** Les deux mènent au
  // MÊME deck, et les deux conditions serveur sont la même (`chapter_servable_count > 0`) : sans
  // cette garde, une carte à contrôle afficherait deux boutons vers la même destination, à trois
  // lignes d'écart. La version du plan est la meilleure des deux — elle est **datée** et elle se
  // **coche**.
  //
  // ⚠️ Le « N cartes » de la porte n'est PAS repris sur l'étape, et c'est délibéré : sur un
  // bouton qu'on peut presser tout de suite, c'est une offre ; sur une étape datée de mercredi,
  // ça devient un quota pour mercredi. La session l'annoncera au moment de la jouer.
  //
  // ⚠️ Point à confirmer à la relecture visuelle : c'est un arbitrage d'écran, et l'ADR-0050 ne
  // l'avait pas prévu (sa maquette ne montrait pas la porte sur la même carte).
  const planPorteLaRevision = steps.some((step) => step.kind === "revision");
  // `revisable_cards > 0` implique un chapitre côté serveur, mais on ne le SUPPOSE pas : la
  // porte n'existe que si les deux sont vrais. Une garde de moins serait une porte ouverte sur
  // un deck sans chapitre.
  const revisionState =
    item.revisable_cards > 0 && !planPorteLaRevision ? revisionSessionState(item) : null;
  // La teinte de matière, avec son repli. `undefined` (et non du gris) quand l'item n'a AUCUNE
  // matière : la bordure retombe alors sur la couleur de bordure de la carte, ce qui est juste —
  // il n'y a rien à identifier.
  const teinte = item.subject
    ? subjectColorFor(item.subject.slug, item.subject.color)
    : undefined;
  return (
    <div
      id={`agenda-item-${item.id}`}
      // 🔴 **`subjectColorFor()`, jamais `item.subject.color` BRUT** (ADR-0025 Amdt 8 §D6-e).
      // `Subject.color` est `nullable` en base, et le repli du dépôt — palette par slug, puis
      // hachage déterministe — existe exactement pour ce cas. La ligne lisait le champ brut :
      // une matière sans couleur retombait sur `border-l-zetis-border`, du gris. L'agenda était
      // **la seule surface du produit à perdre silencieusement l'identité de matière**, que le
      // donut, le nuage et la Galaxy conservent tous.
      //
      // ⚠️ Et `border-l-4`, pas `border-l-2` : sur une carte `rounded-2xl`, l'arc des coins
      // mangeait l'essentiel du filet — il ne restait qu'une trentaine de pixels visibles.
      style={{ borderLeftColor: teinte }}
      className={`flex items-start gap-3 rounded-2xl border border-l-4 p-3 transition-colors motion-reduce:transition-none ${
        tone === "resume"
          ? "border-amber-400/25 bg-amber-400/5"
          : "border-zetis-border bg-zetis-surface"
      } ${item.done ? "opacity-55" : ""}`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={item.done}
        aria-label={item.done ? "Décocher" : "Marquer comme fait"}
        // `motion-reduce:transition-none` : `prefers-reduced-motion` est non négociable.
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs transition-colors motion-reduce:transition-none ${
          item.done
            ? "border-emerald-400/70 bg-emerald-400/20 text-emerald-300"
            : "border-white/20 text-transparent hover:border-white/40"
        }`}
      >
        ✓
      </button>

      <div className="min-w-0 flex-1">
        {/* `label` affiché TEL QU'ÉCRIT — le serveur ne le réécrit jamais, l'UI non plus. */}
        <p className={`text-sm leading-snug ${item.done ? "line-through" : ""}`}>{item.label}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-zetis-muted">
          {item.subject && (
            <span className="inline-flex items-center gap-1">
              {/* Sans asset pour cette matière : le nom suffit. Aucun emoji en dur, aucun
                  `<img>` cassé (un item sans matière est rendu sans pictogramme, accent
                  neutre — jamais bloqué). */}
              {subjectIconFor(item.subject.slug) && (
                <img
                  src={subjectIconFor(item.subject.slug)}
                  alt=""
                  aria-hidden
                  className="h-3.5 w-3.5 rounded-[22%] object-contain"
                />
              )}
              {item.subject.name}
            </span>
          )}
          {item.kind === "controle" && (
            <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-fuchsia-300 ring-1 ring-fuchsia-400/50">
              ◆ contrôle
            </span>
          )}
          {/* Une leçon à apprendre est du travail ORDINAIRE, pas une échéance qui menace : elle
              se repère, elle n'alarme pas. Ni le fuchsia (réservé au contrôle), ni le rouge
              (interdit transverse §7).
              ⚠️ **Ni le teal**, essayé d'abord et MESURÉ à l'écran le 2026-08-10 : à 16° de teinte
              de l'émeraude d'à côté (oklch 181 vs 165, même clarté, même chroma), les deux badges
              de 10 px étaient indiscernables — et l'émeraude porte un sens que Massimo apprend
              sans explication, « ça vient de papa ». L'indigo est à 110°. */}
          {/* 🔴 **`▬` et non `◆`** (Amdt 8 §D4). Ce badge et celui du contrôle rendaient le
              MÊME glyphe `◆`, séparés uniquement par la teinte, à 10 px — le conflit central de
              l'amendement, en miniature, et il était en production depuis le 2026-08-10.
              Le commentaire sur l'indigo ci-dessus reste vrai et n'est pas contredit : on
              AJOUTE une forme, on ne retire pas la teinte. */}
          {item.kind === "lecon" && (
            <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-indigo-300 ring-1 ring-indigo-400/40">
              ▬ leçon
            </span>
          )}
          {showDate && <span>{shortDayLabel(item.due_on)}</span>}
          {/* Émeraude = la couleur de l'interface de Papa. Massimo apprend le code sans
              explication, et rien ne bouge dans son agenda sans qu'il le voie (§2a). */}
          {origin && (
            <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300 ring-1 ring-emerald-400/40">
              {origin}
            </span>
          )}
          {/* Une échéance qui NOMME un cours sans y donner accès oblige Massimo à le retrouver à
              la main (addendum §15). `null` quand il n'y a rien à ouvrir — jamais un lien vers
              la racine. Indépendant du `kind` : un devoir rattaché à un cours y mène aussi. */}
          {coursRoute && (
            <Link
              to={coursRoute}
              className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-zetis-muted underline-offset-2 transition-colors hover:text-white hover:underline"
            >
              📖 lire le cours
            </Link>
          )}
        </div>

        {/* La porte du deck de révision par chapitre (ADR-0049 Décision 1).

            🔴 **`revisable_cards === 0` ⇒ RIEN.** Pas de bouton grisé, pas de bouton qui
            explique, pas d'espace réservé — l'échéance reste entière et ne promet simplement
            rien. Un chapitre sans leçon validée, ou sans cartes générées, résout zéro carte :
            *« un bouton mort se lit comme une panne, et une promesse non tenue coûte plus cher
            que l'absence »* (addendum ADR-0025 §14.6).

            ⚠️ Ce n'est PAS le cas de l'ADR-0024 §4 (catalogue, indisponible grisé) : là-bas le
            gris dit « Papa ne l'a pas encore produit » sur un écran fait pour être parcouru.
            Ici, Massimo regarde une date — le gris n'y dirait rien d'actionnable.

            ⚠️ Le nombre vient du SERVEUR, plafond compris. On ne le recalcule jamais : le
            plafond vit côté serveur, et une surface qui le recopierait mentirait le jour où il
            bouge (c'est la seconde source de vérité qui a divergé le jour même au §14.5).

            Placement : SOUS la ligne de puces, en pleine largeur. Pas dans l'angle — au chantier
            agenda, une puce d'angle a mangé un tiers de la largeur du titre sur une carte de
            81 px, et aucun test ne mesure une colonne. */}
        {revisionState && (
          <Link
            to="/revision/session"
            state={revisionState}
            className="mt-2 flex items-center gap-2 rounded-xl border border-cyan-400/35 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-slate-100 transition-colors hover:border-cyan-400/60 motion-reduce:transition-none"
          >
            <span aria-hidden>🃏</span>
            <span>Réviser ce chapitre</span>
            {/* Ce que la session servira VRAIMENT, jamais un arriéré. */}
            <span className="ml-auto text-cyan-300">
              {item.revisable_cards} carte{item.revisable_cards > 1 ? "s" : ""}
            </span>
          </Link>
        )}

        {/* Le plan de préparation (ADR-0050) — l'échéance dit QUOI, le plan dit COMMENT s'y
            prendre. C'est le §8 rôle 1, *« le seul rôle qui justifie la fonctionnalité »*.

            🔴 **Aucune étape ⇒ RIEN.** Pas d'encadré vide, pas de « ton plan arrive », pas de
            place réservée : la très grande majorité des échéances n'a pas de plan (il faut un
            chapitre et au moins 2 jours), et un cadre vide sur chacune ferait de l'agenda une
            page de manques. Même règle que la porte ci-dessus (§14.6).

            ⚠️ Les étapes arrivent **déjà triées** du plus tôt au plus tard : le tri se fait une
            fois dans `useAgenda`, sur `day_offset` DÉCROISSANT — l'offset compte les jours AVANT
            l'échéance. Ne pas le refaire ici, et surtout pas dans l'autre sens. */}
        {steps.length > 0 && (
          <div className="mt-2 rounded-xl border border-violet-400/20 bg-violet-400/[0.06] p-2">
            <div className="flex items-center gap-1.5 px-1 pb-1.5 text-[11px] text-violet-200">
              <span aria-hidden>✦</span>
              <span className="font-semibold">Ton plan</span>
              {/* Un compte d'AVANCÉE, pas de retard : « 1 sur 3 » monte, il ne décompte rien.
                  Aucune barre, aucun pourcentage — trois lignes se lisent d'un coup d'œil. */}
              <span className="ml-auto text-zetis-muted">
                {steps.filter((step) => step.done).length} sur {steps.length}
              </span>
            </div>
            <ul className="space-y-1">
              {steps.map((step) => {
                const target = planStepTarget(step, item);
                const inner = (
                  <>
                    <span aria-hidden>{target.icon}</span>
                    <span className={`min-w-0 truncate ${step.done ? "line-through" : ""}`}>
                      {target.label}
                    </span>
                    <span className="ml-auto shrink-0 text-[10px] text-zetis-muted">
                      {planStepDayLabel(item, step)}
                    </span>
                  </>
                );
                // La coche et le lien sont FRÈRES, jamais imbriqués : un `<button>` dans un
                // `<a>` est invalide, et le geste de cocher partirait en navigation.
                return (
                  <li key={step.id} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onToggleStep?.(step)}
                      aria-pressed={step.done}
                      // « coché », jamais « fait » (§14.7) : cocher ne prouve rien.
                      aria-label={step.done ? "Décocher l'étape" : "Cocher l'étape"}
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] transition-colors motion-reduce:transition-none ${
                        step.done
                          ? "border-emerald-400/70 bg-emerald-400/20 text-emerald-300"
                          : "border-white/20 text-transparent hover:border-white/40"
                      }`}
                    >
                      ✓
                    </button>
                    {/* Sans destination (échéance sans matière, ou sans chapitre) l'étape reste
                        LÀ, en texte : elle se coche quand même. Un lien vers la racine serait
                        une petite trahison, et faire disparaître l'étape trouerait le plan. */}
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
      </div>

      {/* 🔴 LA CROIX NE VISE QUE CE QUE MASSIMO A ÉCRIT LUI-MÊME (2026-08-11).
          Le §2c donne le masquage au titre de la **réciprocité** — Papa archive, donc l'enfant
          n'est pas passif sur sa propre page. Le motif est l'autonomie, jamais l'évitement.

          🔴 **Et le §1 du MÊME ADR tranche l'autre moitié, trente lignes plus haut** :
          *« une échéance scolaire existe déjà dans le monde de Massimo — écrite dans son agenda
          papier, annoncée en classe. La masquer ne supprime pas la pression : elle supprime
          seulement son moyen de s'organiser. »* Une croix sur une échéance de l'école faisait
          donc exactement ce que cet ADR passe son §1 à refuser.

          On retire ce que l'ON a écrit, pas ce que l'école a demandé. ⚠️ **En phase 0 la croix
          disparaît de partout** — Massimo ne saisit pas encore (§10) — et elle revient d'elle-même
          le jour où Papa ouvre sa saisie, c'est-à-dire là où l'argument du §2c tient vraiment.
          Les doublons du §2d restent traités par Papa, qui les a créés et que la saisie prévient.

          ⚠️ Conséquence assumée : le rattrapage « Masqué · Annuler » devient **inatteignable en
          phase 0**. Il n'est pas mort — `undismiss` sert au « Rendre à Massimo » de Papa, et le
          bandeau reprend vie avec la saisie. Le retirer réintroduirait le défaut du 2026-08-10. */}
      {item.created_by === "student" && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Masquer"
          title="Masquer"
          // 🔴 **44 × 44** (Amdt 8 §D6-f). Ce bouton **archive un item** et mesurait ~20 × 18 px,
          // sous le plancher tactile de WCAG 2.1 AA / HIG 44 pt. C'est très probablement par lui
          // que deux devoirs de la base de dev sont partis le 2026-08-09.
          // La zone grandit, **le glyphe ne bouge pas** : `-m-3` reprend le débord pour que la
          // carte garde sa densité.
          className="-m-3 grid h-11 w-11 shrink-0 place-items-center rounded-lg text-xs text-zetis-muted transition-colors hover:text-white motion-reduce:transition-none"
        >
          ✕
        </button>
      )}
    </div>
  );
}
