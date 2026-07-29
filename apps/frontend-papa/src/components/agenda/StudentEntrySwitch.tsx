// Interrupteur d'ouverture de la saisie élève (ADR-0025 §10).
//
// **Réglage discret — ni KPI, ni bannière.** Et surtout : aucune suggestion calculée du type
// « Massimo a coché 12 fois, vous pouvez ouvrir ». Faire dépendre un droit d'un seuil observé
// transformerait cette page en surveillance. Le geste appartient à Papa, à la date qu'il juge
// bonne (revue prévue à 4 semaines, ADR-0025 §Suivi).
//
// L'ouverture doit rester un **événement positif** : c'est pourquoi rien n'est grisé côté
// Massimo en attendant — sa page ne montre aucun composer désactivé (ADR-0025 §10, règle 3).

interface Props {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

export function StudentEntrySwitch({ enabled, onChange }: Props) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-papa-border bg-papa-surface px-4 py-3">
      <div>
        <p className="text-sm font-medium">Autoriser Massimo à ajouter ses propres échéances</p>
        <p className="mt-1 text-xs leading-relaxed text-papa-muted">
          {enabled
            ? "Massimo peut saisir et modifier ses propres échéances. Les vôtres restent les vôtres : il peut les cocher et les masquer, pas les réécrire."
            : "Pour l'instant, vous êtes la seule source d'échéances. Massimo lit, coche et masque — il ne saisit pas encore."}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="Autoriser Massimo à ajouter ses propres échéances"
        onClick={() => onChange(!enabled)}
        className={`mt-0.5 h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors ${
          enabled ? "bg-papa-accent" : "bg-papa-surface-2"
        }`}
      >
        <span
          className={`block h-5 w-5 rounded-full bg-white transition-transform ${
            enabled ? "translate-x-5" : ""
          }`}
        />
      </button>
    </div>
  );
}
