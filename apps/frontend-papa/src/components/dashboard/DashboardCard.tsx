import type { ReactNode } from "react";
import type { DashboardCardFocus, PageFocus } from "@zetis/types";
import { CARD_FOCUS_HINTS, matchesFocus } from "../../lib/dashboardDerive";

// Coquille commune des huit cartes du dashboard.
//
// Elle porte l'atténuation de focus (ADR-0028 §5) : quand un KPI est actif, les cartes qui ne
// répondent PAS à sa question s'effacent. C'est ce qui rend huit diagrammes praticables sur une
// page — sans ce dispositif, il faudrait en retirer.
//
// L'atténuation combine opacité ET désaturation, et la carte retenue reçoit une bordure : le
// contraste seul serait invisible pour une partie des lecteurs, et un `aria-hidden` sur les
// cartes atténuées mentirait (elles restent lisibles et navigables).
//
// La carte retenue reçoit en plus un souffle vert (`souffle-focus--lie`, cf. `index.css`), à peine
// moins appuyé que celui du KPI cliqué mais bien plus court : ces cartes sont HAUTES, et un voile
// qui monterait à la même hauteur relative envahirait le diagramme. Comme sur le KPI, il DOUBLE le
// signe et ne le porte jamais seul.

interface DashboardCardProps {
  /** Clé de `CARD_SCOPES` — c'est elle qui décide si la carte répond au focus courant. */
  card: string;
  title: string;
  tagline?: string;
  /** Contenu d'en-tête aligné à droite (sélecteur de vue, lien « → »). */
  action?: ReactNode;
  badge?: ReactNode;
  focus: PageFocus | null;
  className?: string;
  children: ReactNode;
  /** Note de bas de carte : explicite ce que le diagramme mesure. Un chiffre dont on ne dit pas
   *  comment il est fabriqué est un chiffre qui ment. */
  note?: ReactNode;
  /** Rend le TITRE cliquable : la carte prend alors le focus elle-même, comme un KPI du bandeau.
   *
   *  Réservé aux cartes dont la mesure n'a **aucun KPI** dans le bandeau (`charge`, `chaine`) :
   *  sans cela elles ne pouvaient que s'atténuer, jamais s'allumer.
   *
   *  🔴 **Le titre, et NON la carte entière.** `ContentChainCard` contient des `<Link>` (« ↓ 19 à
   *  produire ») : une ancre dans un bouton est du HTML invalide et le lien cesserait de
   *  fonctionner. Cibler l'en-tête reste vrai le jour où ces cartes gagnent des contrôles. */
  focusKey?: DashboardCardFocus;
  onToggleFocus?: (next: DashboardCardFocus) => void;
}

export function DashboardCard({
  card,
  title,
  tagline,
  action,
  badge,
  focus,
  className = "",
  children,
  note,
  focusKey,
  onToggleFocus,
}: DashboardCardProps) {
  const matched = matchesFocus(card, focus);
  const dimmed = focus !== null && !matched;
  const highlighted = focus !== null && matched;
  const focusable = focusKey !== undefined && onToggleFocus !== undefined;
  // La carte est-elle allumée PAR SON PROPRE clic, par opposition à « allumée par un KPI » ? C'est
  // ce qui distingue `aria-pressed` (l'état de MON bouton) de `highlighted` (l'état de la carte).
  const selfFocused = focusable && focus === focusKey;

  return (
    <section
      data-card={card}
      className={`rounded-xl border bg-papa-surface transition-[opacity,filter] motion-reduce:transition-none ${
        highlighted ? "border-papa-accent souffle-focus souffle-focus--lie" : "border-papa-border"
      } ${dimmed ? "opacity-40 saturate-50" : ""} ${className}`}
    >
      <header className="flex flex-wrap items-center gap-2.5 px-4 pb-2 pt-3.5">
        {/* Le titre reste un `h3` DANS les deux cas : le bouton se glisse à l'intérieur plutôt que
            de le remplacer. Remplacer le titre par un bouton retirerait la carte de la liste des
            titres de la page — une carte qu'on gagne au clic contre une carte qu'on perd à la
            navigation au clavier n'est pas un échange acceptable. */}
        <h3 className="text-xs font-extrabold uppercase tracking-widest">
          {focusable ? (
            <button
              type="button"
              aria-pressed={selfFocused}
              onClick={() => onToggleFocus(focusKey)}
              className="flex items-center gap-1.5 rounded text-left uppercase tracking-widest transition-colors hover:text-papa-accent"
            >
              {title}
              {/* Le seul signe qui dit « ceci se clique » AVANT le survol. Sans lui l'affordance
                  n'existerait qu'à la souris, et ces deux cartes ont vécu jusqu'ici sans aucun
                  clic — personne n'irait l'essayer. */}
              <span aria-hidden className={selfFocused ? "text-papa-accent" : "text-papa-muted"}>
                ⌖
              </span>
            </button>
          ) : (
            title
          )}
        </h3>
        {tagline && <span className="text-xs font-normal text-papa-muted">{tagline}</span>}
        {badge}
        {/* Même indication que sur un KPI actif, au même endroit du regard : ce qui vient d'être
            filtré. Elle n'est PAS réservée à la place comme sur les KPI — ces cartes sont hautes,
            un saut de 16 px en tête de carte ne déplace rien sous le curseur. */}
        {selfFocused && focusKey && (
          <span className="text-xs font-semibold text-papa-accent">{CARD_FOCUS_HINTS[focusKey]}</span>
        )}
        {action && <span className="ml-auto flex items-center gap-3">{action}</span>}
      </header>
      <div className="px-4 pb-4">
        {children}
        {note && (
          <p className="mt-2.5 border-t border-dashed border-papa-border/60 pt-2 text-[11px] leading-relaxed text-papa-muted">
            {note}
          </p>
        )}
      </div>
    </section>
  );
}
