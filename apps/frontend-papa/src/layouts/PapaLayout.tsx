import { useState } from "react";
import { Outlet } from "react-router-dom";
import { PapaSidebar } from "../components/PapaSidebar";
import { useAuth } from "@zetis/auth";
import { useActiveProductionRun } from "../hooks/useActiveProductionRun";
import { useAutonomyState } from "../hooks/useAutonomyState";
import { ActiveProductionModal } from "../components/ActiveProductionModal";
import { ProductionDoneModal } from "../components/ProductionDoneModal";
import { useProductionActivity } from "../hooks/useProductionActivity";
import { ProductionBar, ProductionEdge } from "../components/ProductionBar";

// Layout commun de l'interface Papa : sidebar + header + zone analytique
// (cf. docs/frontend-papa/README.md § Layout).
export function PapaLayout() {
  const { user, logout } = useAuth();
  // « ZETIS travaille » : le lot tourne dans un worker séparé, Papa peut fermer la modale et
  // naviguer. Sans cet indicateur, plus rien ne le lui disait.
  const { run: activeRun, finished, acknowledge } = useActiveProductionRun();
  // L'état d'autonomie se lit ICI et non dans la sidebar (motif ADR-0030) : le layout ne se
  // démonte pas entre deux routes, donc un seul appel pour les 22 pages. Une lecture dans la
  // sidebar en referait un par entrée — le mal que l'ADR-0030 a supprimé côté Massimo.
  const autonomy = useAutonomyState();
  const [showRun, setShowRun] = useState(false);

  // L'activité COMPLÈTE (ADR-0041) — lots ET travaux unitaires, tous déclencheurs confondus.
  // L'indicateur d'origine ne voyait que les lots : les ~20 producteurs synchrones travaillaient
  // sans que rien ne le dise, et la barre d'équipement n'a jamais été vue tourner une seule fois.
  const { activity, acknowledge: ackEchec } = useProductionActivity();
  return (
    // `overflow-hidden` n'est pas cosmétique : sans lui, la sidebar (22 entrées, ~1100 px) déborde
    // du conteneur en `h-full`, le DOCUMENT grandit à sa taille, et c'est le body qui scrolle —
    // emportant la sidebar ET le header hors de l'écran. On clippe ici, et chaque colonne gère son
    // propre défilement : la nav dans la sidebar, le contenu dans `main`.
    <div className="flex h-full overflow-hidden">
      <PapaSidebar autonomy={autonomy} />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Le fond de marque ZETIS a besoin de hauteur pour exister : à `py-3` (~44 px) l'image
            n'était qu'une texture. Hauteur réduite sous `sm` pour ne pas manger l'écran d'une
            tablette. */}
        <header className="relative h-28 shrink-0 overflow-hidden border-b border-papa-border bg-papa-bg sm:h-36">
          {/* ⚠️ `contain`, PAS `cover`. La bande fait 1400×420 (ratio 3,33) et le header est
              beaucoup plus large que haut : `cover` la mettait à l'échelle de la LARGEUR et
              rognait l'emblème par le haut. `contain` cale sur la HAUTEUR — l'image entre en
              entier, centrée, et le fond de page occupe les côtés. */}
          {/* ⚠️ Le calque porte l'`aspect-[10/3]` de l'image (1400×420) et non `inset-0` : le
              fondu ci-dessous se mesure sur la LARGEUR du calque. Étalé sur tout le header, il
              tombait hors de l'image et ne fondait rien — le rectangle se voyait, constaté à
              l'écran. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-1/2 aspect-[10/3] -translate-x-1/2 bg-contain bg-center bg-no-repeat"
            style={{
              backgroundImage: "url(/zetis-banner.png)",
              // Le noir de l'image n'est pas exactement `--color-papa-bg` : sans ce fondu, ses
              // bords verticaux se voient comme une couture au milieu du header.
              maskImage:
                "linear-gradient(90deg, transparent, black 18%, black 82%, transparent)",
              WebkitMaskImage:
                "linear-gradient(90deg, transparent, black 18%, black 82%, transparent)",
            }}
          />
          <div className="relative flex h-full items-center justify-between px-6">
            {/* Les deux blocs de contenu reçoivent leur propre fond translucide : sur un header
                à fond image, un texte nu devient illisible dès que l'onde passe dessous. */}
            <div className="flex items-center gap-3 rounded-xl border border-papa-border/60 bg-papa-surface/70 px-3 py-2 text-sm backdrop-blur-sm">
              {/* La signature de l'interface. Elle a quitté la sidebar le 2026-08-04 : les deux
                  frontends doivent rester discernables (`docs/frontend-papa/README.md`), mais la
                  sidebar est la colonne rare, et ce header — devenu fixe le même jour — ne coûte
                  rien. ⚠️ Verrouillé par un test : sans ce mot, une capture d'écran de Papa ne se
                  distingue plus d'une capture de Massimo. */}
              <span className="font-bold">
                ZETIS <span className="text-papa-accent">Papa</span>
              </span>
              <span className="h-4 w-px bg-papa-border" role="presentation" />
              <span className="rounded-md bg-papa-surface-2 px-2.5 py-1 font-medium text-papa-text">
                Enfant : Massimo
              </span>
              <span className="text-papa-muted">Période : 2026 — 4ᵉ</span>
            </div>
            {/* La barre de production (ADR-0041) — au CENTRE, entre l'identité et les actions.
                Elle remplace la pastille qui vivait dans la pilule de gauche : celle-ci ne voyait
                que les LOTS, donc rien des ~20 producteurs synchrones. Toute sa doctrine
                d'affichage est conservée (jamais 0 %, « en file » ≠ « arrêté », estimation ancrée
                sur le `started_at` serveur) — c'est ce qu'elle REGARDE qui change. */}
            <ProductionBar
              activity={activity}
              onOpen={() => setShowRun(true)}
              onAcknowledge={ackEchec}
            />
            <div className="flex items-center gap-2 rounded-xl border border-papa-border/60 bg-papa-surface/70 px-2 py-2 backdrop-blur-sm">
              <button
                type="button"
                className="rounded-lg border border-papa-border px-3 py-1.5 text-sm font-medium text-papa-muted hover:text-papa-text"
              >
                Exporter
              </button>
              {user && (
                <button
                  type="button"
                  onClick={logout}
                  className="rounded-lg px-2 py-1 text-xs text-papa-muted hover:text-papa-text"
                >
                  Déconnexion
                </button>
              )}
            </div>
          </div>
          {/* Le repli ultime : sous `sm`, la pilule perd son libellé — ce liseré, lui, reste.
              Il garantit qu'une production ne devient jamais invisible, quelle que soit la
              largeur. Jamais cliquable : c'est un signal, pas une commande. */}
          <ProductionEdge activity={activity} />
        </header>
        {activeRun && showRun && (
          <ActiveProductionModal run={activeRun} onClose={() => setShowRun(false)} />
        )}
        {/* Annonce de fin — s'efface seule, ne laisse aucune trace à traiter. */}
        {finished && <ProductionDoneModal run={finished} onClose={acknowledge} />}
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
