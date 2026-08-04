// Bloc d'état en tête de la sidebar Papa (addendum ADR-0032 §7).
//
// Trois refus qui expliquent le code :
//
// 1. **Deux axes, deux signes.** L'avatar porte le RÉGIME, la seconde ligne porte le DÉCLENCHEUR,
//    doublé d'un point qui orbite. « Autonome + désarmé » veut dire « ZETIS sert seul mais attend
//    votre clic » : un signe unique mentirait sur deux lignes de la table de vérité sur quatre.
// 2. **Aucun régime avant la réponse du serveur, aucun repli à l'erreur.** Le chargement et
//    l'erreur montrent l'avatar NEUTRE, qui ne désigne aucun régime — un régime faux affiché une
//    seconde est un mensonge, et la sidebar est visible sur les 22 pages.
// 3. **Ce bloc LIT, il ne règle pas.** C'est un lien vers `/parametres`, rien d'autre : un régime
//    ne doit pas pouvoir bouger d'un clic dans un coin d'écran.
import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { type AutonomyPreset } from "@zetis/types";

import { PRESET_DESCRIPTION, PRESET_ICON, PRESET_LABEL } from "../lib/settings";
import { type AutonomyState } from "../hooks/useAutonomyState";
import neutre from "../assets/brand/zetis-avatar_128.png";
import manuel from "../assets/brand/zetis-regime-manuel_128.png";
import semi from "../assets/brand/zetis-regime-semi_128.png";
import autonome from "../assets/brand/zetis-regime-autonome_128.png";

/** La clé VISUELLE. Quatre images pour six états : chargement, erreur et « Sur mesure » partagent
 *  l'avatar NEUTRE. C'est ce qui rend le §7.4 tenable — il n'existe aucune image « par défaut »
 *  qui ressemblerait à un régime. */
type Visage = AutonomyPreset | "neutre";

const AVATAR: Record<Visage, string> = { manuel, semi, autonome, neutre };

const HALO: Record<Visage, string> = {
  manuel: "regime-halo--manuel",
  semi: "regime-halo--semi",
  autonome: "regime-halo--autonome",
  neutre: "regime-halo--sur-mesure",
};

/** Garde l'image sortante 300 ms pour que le fondu soit ENCHAÎNÉ.
 *
 *  Un `key=` seul ferait disparaître l'ancienne d'un coup et laisserait 300 ms de trou sur le fond
 *  de la sidebar — un fondu à l'entrée n'est pas un fondu enchaîné. */
function useCrossfade(visage: Visage): Visage | null {
  const [sortant, setSortant] = useState<Visage | null>(null);
  const precedent = useRef(visage);

  useEffect(() => {
    if (precedent.current === visage) return;
    setSortant(precedent.current);
    precedent.current = visage;
    const timer = setTimeout(() => setSortant(null), 300);
    return () => clearTimeout(timer);
  }, [visage]);

  return sortant;
}

export function EtatZetis({ state }: { state: AutonomyState }) {
  const pret = state.status === "ready";
  const preset = pret ? state.autonomy.preset : null;
  const arme = pret && state.autonomy.auto_trigger_enabled;
  const visage: Visage = preset ?? "neutre";
  const sortant = useCrossfade(visage);

  // ⚠️ Libellés IMPORTÉS, jamais recopiés : une recopie en dur (« Semi-auto ») ferait diverger la
  // sidebar de la page au premier changement de vocabulaire. Verrouillé par un test.
  const titre =
    state.status === "loading"
      ? null
      : state.status === "error"
        ? "État indisponible"
        : preset
          ? PRESET_LABEL[preset]
          : "Sur mesure";

  const declencheur = arme ? "démarre seul" : "démarre sur clic";

  // Le NOM ACCESSIBLE porte les deux axes. C'est pour cela que l'`<img>` reste `alt=""` : un
  // `alt` non vide l'écraserait et ferait annoncer le régime deux fois, sans le déclencheur.
  const nomAccessible =
    state.status === "loading"
      ? "ZETIS — état d'autonomie en cours de lecture"
      : state.status === "error"
        ? "ZETIS — état d'autonomie indisponible. Ouvrir les Paramètres"
        : `ZETIS — régime ${titre}, ${declencheur}. Ouvrir les Paramètres`;

  return (
    <NavLink
      to="/parametres"
      aria-label={nomAccessible}
      aria-busy={state.status === "loading" || undefined}
      title={preset ? PRESET_DESCRIPTION[preset] : undefined}
      className="mb-4 flex shrink-0 items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-papa-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-papa-accent"
    >
      <span className="regime-avatar h-11 w-11 shrink-0">
        {/* Le halo est ABSENT du DOM au chargement et à l'erreur — pas un réceptacle vide, rien. */}
        {pret && <span className={`regime-halo ${HALO[visage]}`} aria-hidden />}
        {sortant && (
          <img
            src={AVATAR[sortant]}
            alt=""
            aria-hidden
            className="regime-img regime-img--sortant rounded-[22%] object-cover"
          />
        )}
        <img
          key={visage}
          src={AVATAR[visage]}
          alt=""
          aria-hidden
          decoding="async"
          className="regime-img rounded-[22%] object-cover"
        />
        {/* Second axe. Absent du DOM quand le déclencheur est désarmé, jamais seulement invisible. */}
        {arme && <span className="regime-orbit" aria-hidden />}
      </span>

      <span className="min-w-0 flex-1">
        {titre === null ? (
          // Squelette STATIQUE : une pulsation en tête de chaque page devient un clignotement
          // parasite dans le coin de l'œil (même motif que `CouvertureIcon`, qui refuse de
          // respirer en sidebar).
          <>
            <span className="block h-3 w-24 rounded bg-papa-surface-2" aria-hidden />
            <span className="mt-1.5 block h-2.5 w-20 rounded bg-papa-surface-2" aria-hidden />
          </>
        ) : (
          <>
            <span className="block truncate text-[13px] font-bold leading-tight text-papa-text">
              {preset && <span aria-hidden>{PRESET_ICON[preset]} </span>}
              {titre}
            </span>
            <span className="mt-0.5 block whitespace-nowrap text-[11px] leading-tight text-papa-muted">
              {state.status === "error" ? (
                // Gris muet, aucune classe rouge : le rouge de ce bloc est celui de l'avatar
                // *Autonome*, et il veut dire « ZETIS a tous les droits » (§7.6). Les deux
                // messages doivent rester discernables.
                "Ouvrir les Paramètres"
              ) : (
                <>
                  <span aria-hidden>{arme ? "⚡" : "⏸"} </span>
                  {declencheur}
                </>
              )}
            </span>
          </>
        )}
      </span>
    </NavLink>
  );
}
