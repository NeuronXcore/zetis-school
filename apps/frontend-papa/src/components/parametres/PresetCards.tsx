// Les trois régimes (ADR-0032 §1). Un raccourci d'ÉCRITURE, jamais un état stocké.
//
// L'étiquette active est DÉRIVÉE des six valeurs — côté serveur pour ce qui est enregistré, côté
// client pour le brouillon en cours d'édition. Aucun « mode » n'existe en base : deux sources pour
// une même question finiraient par diverger, et le §G.1 a déjà tranché ce débat en refusant une
// colonne `authority` à côté de `validated_by`.
//
// Un régime indisponible est GRISÉ AVEC SON MOTIF, jamais escamoté : c'est la convention Papa
// (« une capacité absente se dit »), et c'est ce que le test-verrou de cette page vérifie.
import { type Autonomy, type AutonomyPreset } from "@zetis/types";

import {
  PRESET_DESCRIPTION,
  PRESET_ICON,
  PRESET_LABEL,
  PRESETS,
  presetAvailability,
} from "../../lib/settings";

export function PresetCards({
  autonomy,
  current,
  onPick,
}: {
  autonomy: Autonomy;
  /** Régime du BROUILLON en cours — `null` = « sur mesure ». */
  current: AutonomyPreset | null;
  onPick: (preset: AutonomyPreset) => void;
}) {
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-3">
      {PRESETS.map((preset) => {
        const { available, reason } = presetAvailability(autonomy, preset);
        const active = current === preset;
        return (
          <button
            key={preset}
            type="button"
            aria-pressed={active}
            disabled={!available}
            title={available ? undefined : (reason ?? "Régime indisponible")}
            onClick={() => onPick(preset)}
            className={[
              "relative rounded-xl border p-3.5 text-left transition-colors",
              active
                ? "border-papa-accent bg-papa-accent/[0.07] ring-1 ring-inset ring-papa-accent"
                : "border-papa-border bg-papa-bg hover:border-papa-border/80",
              available ? "cursor-pointer" : "cursor-not-allowed opacity-50",
            ].join(" ")}
          >
            {active && (
              <span aria-hidden className="absolute right-3 top-3 text-papa-accent">
                ✓
              </span>
            )}
            <span className="flex items-center gap-2 text-[13.5px] font-bold">
              <span aria-hidden>{PRESET_ICON[preset]}</span>
              {PRESET_LABEL[preset]}
            </span>
            <span className="mt-1.5 block text-[11.5px] leading-relaxed text-papa-muted">
              {PRESET_DESCRIPTION[preset]}
            </span>
            {!available && reason && (
              <span className="mt-2 block text-[11px] leading-relaxed text-papa-warn">
                ⏳ {reason}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
