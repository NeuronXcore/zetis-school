// « Ce qui va changer » — le corps des modales de confirmation (addendum ADR-0032 §8.4).
//
// ⚠️ Ce n'est PAS `NiveauDetail` en plus court, et la nuance est toute la décision : le panneau de
// la page dit **ce que ce niveau fait**, ce composant dit **ce qui va changer**. La modale
// reprenait le panneau — donc elle répétait mot pour mot ce qui restait affiché derrière elle. En
// montrant l'écart, elle dit la seule chose que la page ne dit pas : l'état d'AVANT.
//
// ⚠️ **On ne confirme pas ce qui ne change pas.** Les classes verrouillées n'apparaissent nulle
// part ici : elles sont du contexte de page, pas l'objet d'une confirmation.
//
// ⚠️ Compare au SERVEUR, pas au préréglage : le brouillon peut venir des cartes ou du détail
// classe par classe, et c'est l'écriture réelle qu'on met sous les yeux — pas l'intention.
import { type Autonomy, type AutonomyLevel } from "@zetis/types";

import { LEVEL_LABEL } from "../../lib/settings";

// ⚠️ Convention de l'addendum §8.0 : ce composant montre l'écart de PALIER (0-3) que le changement
// de NIVEAU (l'un des trois régimes) va écrire. `avant`/`apres` sont donc des paliers.

export function EcartNiveau({
  autonomy,
  draft,
}: {
  autonomy: Autonomy;
  draft: Record<string, AutonomyLevel>;
}) {
  const ecarts = autonomy.classes
    .map((cls) => ({ cls, avant: cls.value, apres: draft[cls.key] }))
    .filter(({ avant, apres }) => apres !== undefined && apres !== avant);

  // Ne devrait pas arriver — le bouton est désactivé quand rien ne change — mais un rendu vide
  // vaut mieux qu'un cadre vide, et ça évite de dépendre d'une garde d'appelant.
  if (ecarts.length === 0) return null;

  return (
    <div
      role="list"
      aria-label="Ce qui va changer"
      className="mt-3 rounded-xl border border-papa-border bg-papa-bg px-4 py-3"
    >
      {ecarts.map(({ cls, avant, apres }) => (
        <div key={cls.key} role="listitem" aria-label={cls.label} className="mt-2 first:mt-0">
          <span className="block text-[12.5px] font-semibold text-papa-text">
            <span className="mr-1.5 text-[10.5px] font-bold tracking-wider text-papa-muted">
              {cls.code}
            </span>
            {cls.label}
          </span>
          <span className="mt-1 flex items-center gap-2 text-[11.5px]">
            {/* L'AVANT est barré et en retrait : l'œil doit trouver la nouvelle valeur en premier,
                l'ancienne n'est là que pour donner la mesure de l'écart. */}
            <span className="text-papa-muted line-through">{LEVEL_LABEL[avant]}</span>
            <span aria-hidden className="text-papa-muted">
              →
            </span>
            <span className="rounded-lg bg-papa-accent/10 px-2.5 py-1 font-semibold text-emerald-300">
              {LEVEL_LABEL[apres!]}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}
