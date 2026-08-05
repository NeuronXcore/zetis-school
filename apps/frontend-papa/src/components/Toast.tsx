import { useEffect, useRef, useState } from "react";

// Annonce éphémère (Papa) — 2026-08-05.
//
// ## Pourquoi elle n'est pas le bandeau d'erreur rouge
//
// Un refus de doublon n'est PAS une panne : ZETIS a fait exactement ce qu'il fallait — il a
// reconnu que le contenu existait et n'a rien détruit. Le peindre en rouge, à côté des vraies
// erreurs, apprendrait à Papa que les refus de ZETIS sont des dysfonctionnements. Or celui-ci
// est un service : il vient d'éviter une attente pour rien.
//
// ## Pourquoi elle s'efface seule
//
// Même règle que `ProductionDoneModal` : « ne laisse aucune trace à traiter ». Un avis qui exige
// un clic pour disparaître devient une tâche, et une pile d'avis devient un arriéré — exactement
// ce que l'addendum ADR-0011 §F.2 interdit (« la provenance est un fait, jamais un reproche, et
// elle ne se totalise pas »).
//
// ⚠️ **`role="status"`, pas `role="alert"`.** `alert` interrompt un lecteur d'écran au milieu de
// sa phrase — la brutalité est réservée à ce qui casse. Ici on informe.

/** Durée d'affichage. Assez pour lire deux phrases, assez court pour ne pas devenir du décor. */
const DUREE_MS = 6000;

export interface ToastMessage {
  /** ⚠️ Il change à CHAQUE émission, même à texte identique : sans lui, redemander deux fois la
   *  même production ne relancerait pas le compte à rebours, et le second refus passerait
   *  inaperçu sous le premier — le défaut exact qu'on répare. */
  id: number;
  texte: string;
  ton?: "info" | "avertissement";
}

export function Toast({ message, onClose }: { message: ToastMessage | null; onClose: () => void }) {
  const [visible, setVisible] = useState(false);
  // ⚠️ `onClose` gardé dans une ref : le passer en dépendance de l'effet relancerait le minuteur
  // à chaque rendu du parent si la fonction n'est pas mémoïsée. Une annonce qui ne part jamais
  // est le contraire d'une annonce éphémère.
  const fermer = useRef(onClose);
  fermer.current = onClose;

  useEffect(() => {
    if (message === null) return;
    setVisible(true);
    const timer = window.setTimeout(() => {
      setVisible(false);
      fermer.current();
    }, DUREE_MS);
    return () => window.clearTimeout(timer);
    // `message.id` et non `message` : une nouvelle occurrence du même texte doit relancer le
    // minuteur, une simple ré-identité d'objet ne doit rien faire.
  }, [message?.id]);

  if (message === null || !visible) return null;

  const avertissement = message.ton === "avertissement";
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-6 left-1/2 z-50 w-[min(560px,calc(100vw-3rem))] -translate-x-1/2"
    >
      <div
        className={
          avertissement
            ? "pointer-events-auto flex items-start gap-3 rounded-xl border border-amber-400/40 bg-[#1b1608] px-4 py-3 text-sm text-amber-100 shadow-lg shadow-black/40"
            : "pointer-events-auto flex items-start gap-3 rounded-xl border border-papa-border bg-papa-surface px-4 py-3 text-sm text-papa-text shadow-lg shadow-black/40"
        }
      >
        <span aria-hidden className="mt-0.5 shrink-0 text-base leading-none">
          {avertissement ? "⚠️" : "✓"}
        </span>
        <p className="min-w-0 flex-1 leading-snug">{message.texte}</p>
        <button
          type="button"
          onClick={() => {
            setVisible(false);
            fermer.current();
          }}
          aria-label="Fermer l'annonce"
          className="shrink-0 rounded-md px-1.5 text-papa-muted hover:text-papa-text"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
