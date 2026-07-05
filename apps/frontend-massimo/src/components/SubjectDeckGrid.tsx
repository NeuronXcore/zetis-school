import { type ReactNode } from "react";
import { DeckDisc } from "./DeckDisc";
import { subjectIconFor } from "../lib/subjectIcons";
import { subjectEmoji } from "../lib/subjectEmoji";

// Grille de decks circulaires par matière (présentation pure), extraite de la page
// Révision (section « Par matière ») pour être partagée avec ELI5 v2. Elle possède la
// mise en page de la grille et la résolution illustration/emoji par slug ; l'état de
// chaque deck (compteur, atténuation, cliquabilité) est fourni par l'appelant. Le
// visuel vient de `DeckDisc` — aucune couleur ni classe nouvelle.

export interface SubjectDeck {
  slug: string;
  name: string;
  /** Badge compteur (cartes dues côté Révision, notions côté ELI5). */
  count: number;
  /** Sous-titre optionnel du deck. */
  hint?: string;
  /** Disque atténué « à venir » (Révision : sans carte ; ELI5 : matière sans notion). */
  dimmed?: boolean;
  /** Sous-titre du disque atténué (défaut « pas encore de cartes »). */
  dimmedHint?: string;
  /** Disque « à jour ✓ », atténué et jamais cliquable (Révision uniquement). */
  atDay?: boolean;
  /** Badge « ✨ new » (Révision uniquement). */
  isNew?: boolean;
}

export interface SubjectDeckGridProps {
  subjects: SubjectDeck[];
  onSelect: (slug: string) => void;
  /** Deck spécial rendu en tête (ELI5 « Question libre ») — laissé libre à l'appelant. */
  lead?: ReactNode;
  /** Les decks `dimmed` restent cliquables (ELI5) au lieu d'être inertes (Révision). */
  dimmedClickable?: boolean;
}

export function SubjectDeckGrid({
  subjects,
  onSelect,
  lead,
  dimmedClickable = false,
}: SubjectDeckGridProps) {
  return (
    <>
      {lead && <div className="mb-6 flex justify-center">{lead}</div>}
      <div className="grid grid-cols-2 justify-items-center gap-6 sm:grid-cols-3 md:grid-cols-4">
        {subjects.map((subject) => {
          // « à jour ✓ » n'est jamais cliquable ; « à venir » l'est côté ELI5 (dimmedClickable),
          // inerte côté Révision. Le reste est cliquable dès qu'il porte un compteur.
          const clickable = subject.atDay
            ? false
            : subject.dimmed
              ? dimmedClickable
              : true;
          return (
            <DeckDisc
              key={subject.slug}
              title={subject.name}
              subtitle={subject.hint}
              count={subject.count}
              // Matière atténuée (« à venir ») : emoji, pas d'illustration (comme Révision).
              imageUrl={subject.dimmed ? undefined : subjectIconFor(subject.slug)}
              emoji={subjectEmoji(subject.slug)}
              fallbackInitial={subject.name}
              atDay={subject.atDay}
              noCards={subject.dimmed}
              soonHint={subject.dimmedHint}
              isNew={subject.isNew}
              onClick={clickable ? () => onSelect(subject.slug) : undefined}
            />
          );
        })}
      </div>
    </>
  );
}
