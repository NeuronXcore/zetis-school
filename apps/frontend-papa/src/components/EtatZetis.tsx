// Bloc d'état en tête de la sidebar Papa (addendum ADR-0032 §7).
//
// Quatre refus qui expliquent le code :
//
// 1. **Deux axes, deux signes.** L'avatar porte le RÉGIME, la ligne de texte porte le DÉCLENCHEUR,
//    doublé d'un point qui orbite. « Autonome + désarmé » veut dire « ZETIS sert seul mais attend
//    votre clic » : un signe unique mentirait sur deux lignes de la table de vérité sur quatre.
// 2. **Aucun texte à côté du logo** (2026-08-04) : tout tient dans un BADGE à cheval sur le bas de
//    l'avatar. Il porte le régime — en toutes lettres, parce que le mot cuit dans l'illustration
//    n'est pas dans le vocabulaire du code — ET le glyphe du déclencheur, qui n'est dans aucune
//    image. Les deux axes tiennent en une pastille ; la phrase complète est dans l'infobulle.
// 3. **Aucun régime avant la réponse du serveur, aucun repli à l'erreur.** Le chargement et
//    l'erreur montrent l'avatar NEUTRE, qui ne désigne aucun régime — un régime faux affiché une
//    seconde est un mensonge, et la sidebar est visible sur les 22 pages.
// 4. **Ce bloc LIT, il ne règle pas.** C'est un lien vers `/parametres`, rien d'autre.
import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";

import { NIVEAU_DESCRIPTION, NIVEAU_ICON, NIVEAU_LABEL } from "../lib/settings";
import {
  REGIME_AVATAR,
  REGIME_BADGE,
  REGIME_HALO,
  type Visage,
  declencheurGlyphe,
} from "../lib/regimeVisuals";
import { type AutonomyState } from "../hooks/useAutonomyState";

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
  const niveau = pret ? state.autonomy.niveau : null;
  const arme = pret && state.autonomy.auto_trigger_enabled;
  // ADR-0063 §6 : un ZETIS suspendu INVISIBLE serait la panne des six heures, causée par Papa
  // lui-même — donc plus difficile à soupçonner. L'état se lit ici, sur les 22 pages.
  const suspendu = pret && state.autonomy.production_suspended;
  const visage: Visage = niveau ?? "neutre";
  const sortant = useCrossfade(visage);

  // ⚠️ Libellé IMPORTÉ, jamais recopié — il ne s'affiche plus au repos (il est dans l'image) mais
  // il porte le tooltip et le nom accessible. Une recopie en dur ferait diverger la sidebar de la
  // page des réglages au premier changement de vocabulaire.
  const regime = pret ? (niveau ? NIVEAU_LABEL[niveau] : "Sur mesure") : null;
  const declencheur = arme ? "démarre seul" : "démarre sur clic";

  // Le NOM ACCESSIBLE porte les deux axes. C'est pour cela que l'`<img>` reste `alt=""` : un
  // `alt` non vide l'écraserait et ferait annoncer le régime deux fois, sans le déclencheur.
  const nomAccessible =
    state.status === "loading"
      ? "ZETIS — état d'autonomie en cours de lecture"
      : state.status === "error"
        ? "ZETIS — état d'autonomie indisponible. Ouvrir les Paramètres"
        : suspendu
          ? `ZETIS — SUSPENDU. Régime ${regime}, rien ne démarre. Ouvrir les Paramètres`
          : `ZETIS — régime ${regime}, ${declencheur}. Ouvrir les Paramètres`;

  // ⚠️ Le tooltip est en `position: fixed`, et ce n'est pas un caprice : la sidebar ET son
  // conteneur sont en `overflow-hidden` (le défilement de la nav en dépend), donc une infobulle
  // en `absolute` serait COUPÉE au bord de la colonne. `fixed` sort du flux d'ancrage — mais il
  // faut alors lui donner sa position, d'où la mesure de l'ancre au survol.
  const ancre = useRef<HTMLAnchorElement>(null);
  const [bulle, setBulle] = useState<{ top: number; left: number } | null>(null);

  const montrer = useCallback(() => {
    const rect = ancre.current?.getBoundingClientRect();
    if (rect) setBulle({ top: rect.top, left: rect.right + 10 });
  }, []);
  const cacher = useCallback(() => setBulle(null), []);

  return (
    // ⚠️ Le survol est écouté par ce CONTENEUR, et l'infobulle est sa fille — pas celle du lien.
    // Payé en vrai le 2026-08-04 : une infobulle enfant du `<a>` fait apparaître un nœud DANS le
    // sous-arbre survolé, et `onMouseLeave` cesse de se déclencher de façon fiable. Le lien garde
    // seulement `onFocus`/`onBlur`, qui portent sur LUI.
    <div
      className="relative mb-3 shrink-0"
      onMouseEnter={montrer}
      onMouseLeave={cacher}
    >
    <NavLink
      ref={ancre}
      to="/parametres"
      aria-label={nomAccessible}
      aria-busy={state.status === "loading" || undefined}
      onFocus={montrer}
      onBlur={cacher}
      className="flex justify-center rounded-xl px-2 pb-4 pt-2 transition-colors hover:bg-papa-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-papa-accent"
    >
      <span className="regime-avatar h-[88px] w-[88px] shrink-0">
        {/* Le halo est ABSENT du DOM au chargement et à l'erreur — pas un réceptacle vide, rien. */}
        {pret && <span className={`regime-halo ${REGIME_HALO[visage]}`} aria-hidden />}
        {sortant && (
          <img
            src={REGIME_AVATAR[sortant]}
            alt=""
            aria-hidden
            className="regime-img regime-img--sortant rounded-[22%] object-cover"
          />
        )}
        <img
          key={visage}
          src={REGIME_AVATAR[visage]}
          alt=""
          aria-hidden
          decoding="async"
          className="regime-img rounded-[22%] object-cover"
        />
        {/* Second axe, doublé en ambiance. Absent du DOM quand le déclencheur est désarmé,
            jamais seulement invisible. */}
        {arme && !suspendu && <span className="regime-orbit" aria-hidden />}

        {/* Troisième axe, troisième signe (ADR-0063 §6) : un RUBAN au-dessus de l'avatar. Le
            badge du bas garde le RÉGIME — la suspension ne le change pas (§7), elle se superpose.
            Ambre, jamais rouge : le rouge de ce bloc est l'avatar Autonom (§7.6). */}
        {suspendu && (
          <span
            aria-hidden
            className="absolute -top-1 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full border border-amber-400/60 bg-amber-500/90 px-2 py-0.5 text-[9px] font-extrabold tracking-[0.12em] text-amber-950"
          >
            ⏸ SUSPENDU
          </span>
        )}

        {/* LE BADGE, à cheval sur le bas de l'avatar. Il porte les DEUX axes : le mot du régime
            (celui du CODE, pas celui cuit dans l'illustration) et le glyphe du déclencheur.
            ⚠️ Au chargement il n'y en a PAS : un régime affiché avant la réponse serveur serait
            un mensonge, et c'est ici qu'il se dirait le plus fort. */}
        {state.status === "loading" ? (
          // Squelette STATIQUE, à la place et à la taille exactes du badge : une pulsation en
          // tête de chaque page devient un clignotement parasite (motif de `CouvertureIcon`).
          <span className="regime-badge regime-badge--squelette" aria-hidden />
        ) : state.status === "error" ? (
          // Gris muet, aucune classe rouge : le rouge de ce bloc est celui de l'avatar *Autonom*
          // et veut dire « ZETIS a tous les droits » (§7.6). Les deux doivent rester discernables.
          <span className="regime-badge regime-badge--erreur">ILLISIBLE</span>
        ) : (
          <span className={`regime-badge ${REGIME_BADGE[visage]}`}>
            <span aria-hidden>{declencheurGlyphe(arme)}</span>
            {(regime ?? "").toUpperCase()}
          </span>
        )}
      </span>
    </NavLink>

      {/* L'infobulle DUPLIQUE le nom accessible du lien : elle est donc `aria-hidden`, sinon un
          lecteur d'écran annoncerait deux fois la même chose. Elle s'ouvre aussi au FOCUS clavier
          — un survol qui n'existe qu'à la souris exclut ceux qui n'en utilisent pas. */}
      {bulle && (
        <span
          role="presentation"
          aria-hidden
          style={{ top: bulle.top, left: bulle.left }}
          // Le cadre est TEINTÉ PAR LE RÉGIME, comme le halo de l'avatar et le badge : trois
          // surfaces, une seule grammaire de couleur. Sur une page dense, un cadre neutre se
          // confondait avec les cartes du contenu.
          className={`regime-bulle regime-bulle--${visage} fixed z-50 w-64 rounded-xl p-3 text-[12px] leading-snug text-papa-muted`}
        >
          {state.status === "loading" ? (
            "Lecture de l'état d'autonomie…"
          ) : state.status === "error" ? (
            "État d'autonomie illisible. Ouvrir les Paramètres pour réessayer."
          ) : (
            <>
              <span className="block font-bold text-papa-text">
                {niveau && <span>{NIVEAU_ICON[niveau]} </span>}
                {regime}
              </span>
              {niveau && <span className="mt-1 block">{NIVEAU_DESCRIPTION[niveau]}</span>}
              <span className="mt-1.5 block border-t border-papa-border pt-1.5">
                {suspendu
                  ? "⏸ SUSPENDU — rien ne démarre, même sur clic. Se remet en route dans Paramètres → La machine."
                  : arme
                    ? "⚡ Il démarre sans vous."
                    : "⏸ Il attend votre clic pour démarrer."}
              </span>
            </>
          )}
        </span>
      )}
    </div>
  );
}
