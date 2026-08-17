import { useEffect, useState } from "react";
import { type AgendaLateAlert } from "@zetis/types";
import { AgendaGlyph, AGENDA_KIND_LABEL } from "@zetis/ui";
import { longDayLabel } from "../../lib/agendaSections";

// L'alerte de retard à l'ouverture de `/agenda` (ADR-0025 Amdt 9 §D12).
//
// 🔴 **C'est le CINQUIÈME signal du retard sur cette page** — après les cellules ambre, le badge
// animé, le toast de survol et la section elle-même. Ce qui le justifie : la section « En retard »
// vit sous la ligne de flottaison, et un signal qu'il faut chercher n'en est pas un.
//
// 🔴 **Trois bornes, et chacune protège d'une dérive nommée dans l'ADR :**
//   · **du NOUVEAU seulement** — une échéance déjà signalée ne revient jamais. Un enfant qui
//     n'arrive pas à rattraper ne verra pas le même toast tous les jours. C'est le serveur qui
//     tranche, sur UNE date par élève ;
//   · **une fois par jour au maximum** ;
//   · **aucun nombre** — une échéance nommée, jamais un total. Le compteur d'arriéré du §7 est le
//     seul interdit qui n'a pas bougé de la journée.
//
// ⚠️ **Éphémère et non bloquant.** Il s'efface seul et n'attend aucun geste : un toast qu'il faut
// fermer est une réclamation. La croix existe quand même — partir plus tôt est un droit.

/** Combien de temps il reste à l'écran. Assez pour être lu deux fois sans presser, assez peu pour
 *  ne pas s'installer. */
const DUREE_MS = 7000;

interface Props {
  alerte: AgendaLateAlert | null | undefined;
  /** Accuse réception — appelé une seule fois, quand le toast est RÉELLEMENT monté. */
  onShown?: () => void;
  /** Mène à l'échéance : ouvre son jour sous la bande. Une porte, jamais un reproche. */
  onOpenDay: (date: string) => void;
}

export function LateAlertToast({ alerte, onShown, onOpenDay }: Props) {
  /** 🔴 **Le toast garde SA copie de l'alerte, et ce n'est pas de la prudence : c'est un défaut
   *  corrigé.** Le premier montage appelait `onShown()`, dont l'implémentation du hook remet
   *  l'alerte à `null` — ce qui retirait la prop et **démontait le toast dans le même cycle**.
   *  Le filigrane serveur était donc consommé à chaque chargement et **l'alerte n'apparaissait
   *  jamais à l'écran**.
   *
   *  ⚠️ Les tests unitaires ne pouvaient pas le voir : leur `onShown` est un espion sans effet.
   *  Il a fallu regarder la page. Un test le reproduit désormais, avec un parent qui annule. */
  const [montree, setMontree] = useState<AgendaLateAlert | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // ⚠️ `!alerte` et non `alerte === null` : la valeur vient du réseau, et une absence peut
    // arriver comme `undefined`. Écrit strictement, le composant appelait `onShown()` sur un
    // `undefined` et **plantait la page entière de l'agenda** — trouvé par les tests de la page,
    // pas par les siens. Une alerte manquante ne doit jamais coûter l'écran.
    if (!alerte) return;
    setMontree(alerte);
    setVisible(true);
    onShown?.();
    const minuteur = window.setTimeout(() => setVisible(false), DUREE_MS);
    return () => window.clearTimeout(minuteur);
    // `onShown` est volontairement hors dépendances : une identité de fonction qui change à
    // chaque rendu relancerait l'accusé de réception en boucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alerte]);

  if (!montree || !visible) return null;

  return (
    <div
      role="status"
      // `aria-live="polite"` et non `assertive` : l'information est utile, elle n'est pas urgente.
      // Interrompre un lecteur d'écran pour un devoir en retard serait le pendant sonore de
      // l'alarme visuelle que le §7 refuse.
      aria-live="polite"
      className="fixed inset-x-3 bottom-4 z-50 mx-auto max-w-sm rounded-2xl border border-amber-400/60 bg-zetis-surface-2 p-3 shadow-xl motion-safe:[animation:agenda-alerte-entree_320ms_ease-out]"
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 shrink-0">
          <AgendaGlyph kind={montree.kind} color={montree.subject?.color} size={11} />
        </span>
        <div className="min-w-0 flex-1">
          {/* 🔴 UNE échéance NOMMÉE. Ni « 3 devoirs en retard », ni « depuis 4 jours » : le toast
              nomme le jour, il ne mesure pas l'écart. Un écart chiffré est un reproche. */}
          <p className="text-[13px] font-semibold leading-snug">{montree.label}</p>
          <p className="text-[11px] text-zetis-muted">
            {montree.subject?.name ?? "sans matière"} · {AGENDA_KIND_LABEL[montree.kind]} ·{" "}
            {longDayLabel(montree.due_on)}
          </p>
          {/* La PORTE. Elle dit où aller, elle ne qualifie pas Massimo — « tu n'as pas fait » et
              « tu es en retard sur » sont deux phrases, et une seule s'adresse au travail. */}
          <button
            type="button"
            onClick={() => {
              setVisible(false);
              onOpenDay(montree.due_on);
            }}
            className="mt-1.5 rounded-lg text-[11.5px] font-semibold text-amber-300 underline-offset-2 transition-colors hover:text-amber-200 hover:underline motion-reduce:transition-none"
          >
            Reprendre ce jour →
          </button>
        </div>
        {/* Il s'efface seul ; la croix est là pour partir plus tôt, pas pour être obligatoire.
            44 × 44 : le plancher tactile vaut ici comme partout — c'est l'iPhone de Massimo. */}
        <button
          type="button"
          onClick={() => setVisible(false)}
          aria-label="Fermer"
          className="-m-2 grid h-11 w-11 shrink-0 place-items-center rounded-xl text-zetis-muted transition-colors hover:text-white motion-reduce:transition-none"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
