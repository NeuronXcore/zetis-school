import { Suspense, lazy, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { GalaxyFullGraph, GalaxySubject, GalaxyTimeline } from "@zetis/types";
import { hasWebGL } from "@zetis/ui/galaxy";
import { fetchFullGraph, fetchGalaxyTimelineWithSkills } from "../../lib/galaxy";
import { useGalaxyGrowth } from "../../hooks/useGalaxyGrowth";
import { subjectIconFor } from "../../lib/subjectIcons";

// Carte d'entrée vers `/galaxy`, sur l'Accueil.
//
// ── Histoire de cette carte, en trois temps ────────────────────────────────────────────
//
// 2026-07-28 : un canvas 3D est posé ici. Il coûte 1,37 Mo (368 Ko gzip) sur la page la plus
// visitée, celle qui est peinte la première au réveil de l'app.
//
// 2026-07-31 matin (addendum ADR-0024 §B) : le canvas est RETIRÉ, remplacé par cette carte en
// CSS pur. Le coût n'est pas atténué, il est annulé.
//
// 2026-07-31 soir (addendum « la galaxie revient sur l'Accueil ») : le §B est RÉVOQUÉ. Le motif
// n'est pas technique — voir une galaxie se construire donne à la page une vie qu'un compte
// statique ne donne pas, et c'est l'intention même de l'addendum « Accueil vivant » écrit le
// même jour. Le coût est ASSUMÉ, pas découvert.
//
// ⚠️ CE QUI N'EST PAS REVENU AVEC : le canvas n'est plus monté au premier rendu. La carte
// statique ci-dessous EST la première peinture ; le canvas arrive après, une fois la page à
// l'écran, et se glisse derrière. Massimo voit sa page tout de suite, puis sa galaxie se
// construit. C'est ce qui distingue cette décision de la régression du 28, où le montage était
// immédiat et non voulu.
//
// ⚠️ La 3D ici est CONTEMPLATIVE : `pointer-events-none`. Toute la carte reste une seule cible
// de clic vers `/galaxy` — viser un lien de fin de carte est un geste de précision inutile sur
// iPhone, et un drag de nœud dans un lien déclencherait la navigation au relâchement.
//
// Contrat FERMÉ, par héritage de l'ADR-0024 §5 : un COMPTE d'étoiles allumées, des pastilles de
// matières. Aucun pourcentage, aucun classement de matières, aucune couleur d'échec, aucune
// notion nommée comme manquante, aucun `mastery_score`.

// ⚠️ Le sous-chemin `/canvas` est indispensable : importer depuis `@zetis/ui/galaxy` (le baril
// léger) embarquerait Three.js dans le bundle de départ malgré le `lazy()` — 3,6 Mo mesurés en
// juillet. `accueil.bundle.test.ts` interdit toujours toute forme SYNCHRONE.
const GalaxyCanvas = lazy(() =>
  import("@zetis/ui/galaxy/canvas").then((m) => ({ default: m.GalaxyCanvas })),
);

/** Pastilles affichées au maximum : au-delà, la ligne se replierait et la carte grandirait. */
const MAX_PLANETS = 6;

/** Hauteur du ciel, sur l'Accueil. Assez pour lire une galaxie qui pousse — 190 px ne
 *  suffisaient pas, la construction s'y voyait à peine. */
const SKY_HEIGHT = 260;

export interface HomeGalaxyCardProps {
  /** `null` tant que l'appel n'a pas répondu — la carte n'est alors pas rendue par la page. */
  subjects: GalaxySubject[];
}

export function HomeGalaxyCard({ subjects }: HomeGalaxyCardProps) {
  // Le contrat serveur ne porte AUCUN compte global (`GET /api/student/galaxy` sert `lit` et
  // `total` PAR MATIÈRE) : ce total est une somme de présentation, pas une donnée dérivée —
  // aucune règle métier n'entre dans cette page.
  const lit = subjects.reduce((sum, subject) => sum + subject.lit, 0);
  // Une matière sans rien de validé n'a pas de constellation : sa pastille n'irait nulle part.
  const planets = subjects.filter((subject) => subject.total > 0).slice(0, MAX_PLANETS);

  // ── Le ciel, monté APRÈS la première peinture ──────────────────────────────────────
  //
  // `requestIdleCallback` plutôt qu'un montage direct : la carte statique s'affiche d'abord,
  // le navigateur finit son travail d'atterrissage, et le chunk 3D ne part qu'ensuite. Sans
  // ce report, on retomberait exactement sur la régression du 2026-07-28.
  const [reduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
  );
  const [sky, setSky] = useState(false);
  useEffect(() => {
    // Mouvement réduit → la carte reste ce qu'elle était. Pas de 3D, pas de rotation : ce n'est
    // pas un réglage de confort (ADR-0024 §6). Sans WebGL non plus, évidemment.
    if (reduced || !hasWebGL()) return;
    const idle = (window as any).requestIdleCallback as
      | ((cb: () => void, opts?: { timeout: number }) => number)
      | undefined;
    if (idle) {
      const handle = idle(() => setSky(true), { timeout: 1500 });
      return () => (window as any).cancelIdleCallback?.(handle);
    }
    // Safari n'a pas `requestIdleCallback` — et c'est le navigateur de l'iPhone et de l'iPad
    // de Massimo, donc le repli n'est pas un cas de bord ici, c'est le cas courant.
    const timer = window.setTimeout(() => setSky(true), 600);
    return () => window.clearTimeout(timer);
  }, [reduced]);

  // Le graphe COMPLET, chargé seulement quand le ciel s'allume.
  //
  // ⚠️ C'est DEUX REQUÊTES DE PLUS sur la page d'atterrissage, et l'addendum du soir disait
  // d'abord « zéro requête de plus » en se contentant du cerveau et des matières. Corrigé au
  // vu du rendu : une arrivée de planètes n'est pas une galaxie qui grandit, et c'est la
  // croissance qui fait l'effet. Les deux appels partent APRÈS la première peinture, en même
  // temps que le chunk 3D — ils ne retardent donc rien de ce que Massimo lit.
  const [graph, setGraph] = useState<GalaxyFullGraph | null>(null);
  const [timeline, setTimeline] = useState<GalaxyTimeline | null>(null);
  useEffect(() => {
    if (!sky) return;
    let active = true;
    // `allSettled` : une frise en panne ne doit pas emporter le graphe, ni l'inverse.
    Promise.allSettled([fetchFullGraph(), fetchGalaxyTimelineWithSkills()]).then(([g, t]) => {
      if (!active) return;
      if (g.status === "fulfilled") setGraph(g.value);
      if (t.status === "fulfilled") setTimeline(t.value);
    });
    return () => {
      active = false;
    };
  }, [sky]);

  // La MÊME croissance que la modale, au mot près : même hook, mêmes pièges déjà payés.
  //
  // ⚠️ Elle rejoue à chaque montage de l'Accueil, et c'est VOULU — c'est tout l'objet de la
  // décision. Le §6 de l'addendum ADR-0029 dit « aucune animation ne démarre sur une surface
  // que Massimo n'a pas ouverte pour elle » : cette page est l'exception assumée, écrite dans
  // l'addendum « la galaxie revient sur l'Accueil ». Le mouvement dure ~5 s puis la galaxie
  // continue de tourner doucement ; il n'y a rien à fermer et rien à attendre.
  const { shown, pinned } = useGalaxyGrowth(graph, timeline, { reduced, enabled: sky });

  return (
    <Link
      to="/galaxy"
      // La carte ENTIÈRE est la cible de clic : sur iPhone, viser un lien de fin de carte est
      // un geste de précision inutile quand toute la surface veut dire la même chose.
      className="group relative block overflow-hidden rounded-2xl border border-zetis-border bg-zetis-surface p-5 transition-colors hover:border-zetis-accent-2 motion-reduce:transition-none"
      aria-label={`Ma galaxie : ${lit} étoiles allumées — ouvrir`}
    >
      {/* Étoiles décoratives, en CSS pur. `motion-reduce` les fige : elles scintillent pour
          faire joli, jamais pour porter une information. Elles restent SOUS le ciel 3D : quand
          il arrive, elles font le fond lointain. */}
      <span aria-hidden className="pointer-events-none absolute inset-0">
        {STARS.map((star, i) => (
          <span
            key={i}
            className="absolute h-[3px] w-[3px] rounded-full bg-white/70 motion-safe:animate-pulse"
            style={{ top: star.top, left: star.left, animationDelay: star.delay }}
          />
        ))}
      </span>

      {/* Le ciel. `aria-hidden` et `pointer-events-none` : c'est du décor animé, et tout ce
          qu'il montre est déjà dit en toutes lettres par le compte et les pastilles. */}
      {sky && shown && shown.nodes.length > 0 && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 opacity-80"
          style={{ height: SKY_HEIGHT }}
        >
          <Suspense fallback={null}>
            <GalaxyCanvas
              nodes={shown.nodes}
              edges={shown.edges}
              // Positions IMPOSÉES : chaque étoile naît sur son parent puis rejoint sa place.
              pinned={pinned}
              height={SKY_HEIGHT}
            />
          </Suspense>
        </span>
      )}

      {/* Le contenu passe AU-DESSUS du ciel : positionné, et postérieur dans le DOM. Sans
          ça, un canvas à 70 % d'opacité laverait le compte et les pastilles. */}
      <span className="relative block">
        <p className="text-xs font-semibold uppercase tracking-wide text-zetis-accent-2">
          Ma galaxie
        </p>

        <p className="mt-2 flex items-baseline gap-2">
          <span className="text-3xl font-bold tabular-nums">{lit}</span>
          <span className="text-sm">étoile{lit > 1 ? "s" : ""} allumée{lit > 1 ? "s" : ""}</span>
        </p>

        {/* Zéro étoile n'est PAS un état vide : une galaxie qui n'a pas encore commencé est le
            point de départ normal (rentrée, premier jour). Pas d'`EmptyState`, pas d'erreur. */}
        <p className="mt-1 text-sm text-zetis-muted">
          {lit === 0
            ? "Ta galaxie t'attend : chaque notion travaillée allume une étoile."
            : "Chaque notion travaillée allume une étoile."}
        </p>

        {planets.length > 0 && (
          // Chaque pastille porte SON COMPTE depuis le 2026-07-31 (addendum « Accueil vivant » §C).
          // Un COMPTE, jamais un pourcentage ; l'ordre est celui du programme, PAS un classement —
          // trier par `lit` transformerait la carte en palmarès de matières, que l'ADR-0024 §5
          // interdit.
          <ul className="mt-4 flex flex-wrap gap-2" aria-hidden>
            {planets.map((subject) => {
              const icon = subjectIconFor(subject.slug);
              return (
                <li
                  key={subject.slug}
                  // Pictogramme de marque, JAMAIS un emoji (design-system.md §Pictogrammes).
                  className="flex items-center gap-1.5 rounded-full border border-zetis-border bg-zetis-surface-2 py-1 pl-1 pr-2.5 text-xs font-bold"
                >
                  {icon ? (
                    <img src={icon} alt="" className="h-6 w-6 rounded-full object-cover" />
                  ) : (
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-zetis-surface text-[10px] text-zetis-muted">
                      {subject.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="text-zetis-muted">{subject.lit}</span>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-4 text-sm font-bold text-zetis-accent-2">Ouvrir ma galaxie →</p>
      </span>
    </Link>
  );
}

/** Positions figées : un aléa ferait bouger le décor à chaque rendu, sans rien dire de plus. */
const STARS = [
  { top: "14%", left: "12%", delay: "0s" },
  { top: "30%", left: "66%", delay: ".9s" },
  { top: "58%", left: "28%", delay: "1.7s" },
  { top: "22%", left: "88%", delay: "2.4s" },
  { top: "74%", left: "74%", delay: "1.2s" },
  { top: "82%", left: "44%", delay: "3.1s" },
  { top: "44%", left: "52%", delay: ".4s" },
  { top: "66%", left: "8%", delay: "2.8s" },
];
