import { useState } from "react";

// Le geste par lequel Massimo se donne un objectif : « cette semaine, je viens N jours ».
//
// Une rangée de pastilles, pas un formulaire — un tap suffit, il n'y a ni « Valider », ni select,
// ni curseur. C'est une déclaration, pas une saisie.
//
// **Réviser à la baisse est un droit, pas un aveu.** Les 7 valeurs restent toujours actives, y
// compris celles sous la valeur courante ; choisir 2 après avoir dit 5 se fait exactement comme
// choisir 6, sans confirmation, sans rappel de l'ancienne valeur, sans le moindre commentaire.
// Un engagement qu'on ne peut pas ajuster est un piège.

const CHOICES = [1, 2, 3, 4, 5, 6, 7];

interface WeekGoalPickerProps {
  goalDays: number | null;
  onChoose: (targetDays: number) => void;
  /** Un envoi est en vol : on évite d'en empiler un second. */
  pending?: boolean;
}

export function WeekGoalPicker({ goalDays, onChoose, pending = false }: WeekGoalPickerProps) {
  // Déplié d'office tant qu'aucun engagement n'est pris : c'est l'invitation du lundi.
  const [open, setOpen] = useState(goalDays == null);

  if (goalDays != null && !open) {
    return (
      <p className="mt-3 text-sm text-zetis-muted">
        Cette semaine :{" "}
        <strong className="text-zetis-text">
          {goalDays} jour{goalDays > 1 ? "s" : ""}
        </strong>
        <button
          type="button"
          aria-expanded={false}
          onClick={() => setOpen(true)}
          className="ml-2 underline decoration-dotted hover:text-zetis-text"
        >
          modifier
        </button>
      </p>
    );
  }

  return (
    <div className="mt-3">
      <p className="text-sm text-zetis-muted">Tu viens combien de jours cette semaine ?</p>
      <div
        role="group"
        aria-label="Combien de jours cette semaine ?"
        className="mt-2 flex flex-wrap gap-2"
      >
        {CHOICES.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={n === goalDays}
            disabled={pending}
            onClick={() => {
              onChoose(n);
              setOpen(false);
            }}
            className={`h-9 w-9 rounded-xl text-sm font-bold transition-transform disabled:opacity-50 ${
              n === goalDays
                ? "bg-gradient-to-br from-cyan-400 to-indigo-500 text-white"
                : "bg-white/10 text-zetis-text hover:scale-105"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
