// Les trois régimes (ADR-0032 §1). Un raccourci d'ÉCRITURE, jamais un état stocké.
//
// L'étiquette active est DÉRIVÉE des six valeurs — côté serveur pour ce qui est enregistré, côté
// client pour le brouillon en cours d'édition. Aucun « mode » n'existe en base : deux sources pour
// une même question finiraient par diverger, et le §G.1 a déjà tranché ce débat en refusant une
// colonne `authority` à côté de `validated_by`.
//
// Un régime indisponible est GRISÉ AVEC SON MOTIF, jamais escamoté : c'est la convention Papa
// (« une capacité absente se dit »), et c'est ce que le test-verrou de cette page vérifie.
import { type Autonomy, type AutonomyNiveau } from "@zetis/types";

import {
  NIVEAU_DESCRIPTION,
  NIVEAU_LABEL,
  NIVEAUX,
  niveauDisponible,
} from "../../lib/settings";
import { REGIME_AVATAR } from "../../lib/regimeVisuals";

export function NiveauCards({
  autonomy,
  current,
  onPick,
}: {
  autonomy: Autonomy;
  /** Régime du BROUILLON en cours — `null` = « sur mesure ». */
  current: AutonomyNiveau | null;
  onPick: (niveau: AutonomyNiveau) => void;
}) {
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-3">
      {NIVEAUX.map((niveau) => {
        const { available, reason } = niveauDisponible(autonomy, niveau);
        const active = current === niveau;
        return (
          <button
            key={niveau}
            type="button"
            aria-pressed={active}
            disabled={!available}
            title={available ? undefined : (reason ?? "Régime indisponible")}
            onClick={() => onPick(niveau)}
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
            <span className="flex items-center gap-2.5 text-[13.5px] font-bold">
              {/* L'AVATAR, pas un emoji : c'est ici qu'on choisit un régime, et c'est le visage
                  qu'on verra ensuite en tête de sidebar. Décoratif — le libellé est juste à côté.
                  ⚠️ Ni halo ni animation : trois cartes qui respireraient en même temps seraient
                  une fête foraine. Le halo est la grammaire de la SIDEBAR, où il n'y en a qu'un. */}
              <img
                src={REGIME_AVATAR[niveau]}
                alt=""
                aria-hidden
                className="h-12 w-12 shrink-0 rounded-[22%] object-cover"
              />
              {NIVEAU_LABEL[niveau]}
            </span>
            <span className="mt-1.5 block text-[11.5px] leading-relaxed text-papa-muted">
              {NIVEAU_DESCRIPTION[niveau]}
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
