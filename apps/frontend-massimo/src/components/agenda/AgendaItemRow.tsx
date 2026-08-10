import { Link } from "react-router-dom";
import { type AgendaItemStudent } from "@zetis/types";
import { subjectIconFor } from "../../lib/subjectIcons";
import { originLabel, revisionSessionState, shortDayLabel } from "../../lib/agendaSections";
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
}

export function AgendaItemRow({
  item,
  showDate = false,
  tone = "normal",
  onToggle,
  onDismiss,
}: Props) {
  const origin = originLabel(item);
  const coursRoute = agendaCourseRoute(item);
  // `revisable_cards > 0` implique un chapitre côté serveur, mais on ne le SUPPOSE pas : la
  // porte n'existe que si les deux sont vrais. Une garde de moins serait une porte ouverte sur
  // un deck sans chapitre.
  const revisionState = item.revisable_cards > 0 ? revisionSessionState(item) : null;
  return (
    <div
      id={`agenda-item-${item.id}`}
      style={{ borderLeftColor: item.subject?.color ?? undefined }}
      className={`flex items-start gap-3 rounded-2xl border border-l-2 p-3 transition-colors ${
        tone === "resume"
          ? "border-amber-400/25 bg-amber-400/5"
          : "border-zetis-border bg-zetis-surface"
      } ${item.done ? "opacity-55" : ""} ${item.subject?.color ? "" : "border-l-zetis-border"}`}
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
          {item.kind === "lecon" && (
            <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-indigo-300 ring-1 ring-indigo-400/40">
              ◆ leçon
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
      </div>

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Masquer"
        title="Masquer"
        className="shrink-0 rounded-lg px-1.5 py-0.5 text-xs text-zetis-muted transition-colors hover:text-white motion-reduce:transition-none"
      >
        ✕
      </button>
    </div>
  );
}
