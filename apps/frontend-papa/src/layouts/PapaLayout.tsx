import { useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { PapaSidebar } from "../components/PapaSidebar";
import { useAuth } from "@zetis/auth";
import { useActiveProductionRun } from "../hooks/useActiveProductionRun";
import { useAutonomyState } from "../hooks/useAutonomyState";
import { ProductionPopover } from "../components/ProductionPopover";
import { ProductionDoneModal } from "../components/ProductionDoneModal";
import { useProductionActivity } from "../hooks/useProductionActivity";
import { ProductionStrip } from "../components/ProductionStrip";

// Layout commun de l'interface Papa : sidebar + header + zone analytique
// (cf. docs/frontend-papa/README.md § Layout).
export function PapaLayout() {
  const { user, logout } = useAuth();
  // « ZETIS travaille » : le lot tourne dans un worker séparé, Papa peut fermer la modale et
  // naviguer. Sans cet indicateur, plus rien ne le lui disait.
  // ⚠️ Seule l'ANNONCE DE FIN reste ici : `useActiveProductionRun` est le seul à savoir la
  // faire (relecture par id mémorisé, une seule fois). Le lot lui-même est désormais lu par
  // `useProductionActivity`, avec tout le reste de ce que ZETIS fabrique.
  const { finished, acknowledge } = useActiveProductionRun();
  // L'état d'autonomie se lit ICI et non dans la sidebar (motif ADR-0030) : le layout ne se
  // démonte pas entre deux routes, donc un seul appel pour les 22 pages. Une lecture dans la
  // sidebar en referait un par entrée — le mal que l'ADR-0030 a supprimé côté Massimo.
  const autonomy = useAutonomyState();
  const [showRun, setShowRun] = useState(false);
  // La boîte de la bande mène au STOCK — c'est-à-dire à la Couverture, la seule page qui dise ce
  // que Massimo possède. La bande dit le flux ; la Couverture dit le stock.
  const navigate = useNavigate();

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
        {/* ⚠️ Les paliers de repli de la bande se mesurent sur la largeur du HEADER, jamais sur
            celle de la fenêtre — il vit à droite d'une sidebar et porte déjà deux pilules. La
            mesure se fait dans `ProductionStrip`, en JS : 🔴 les container queries Tailwind
            (`@container/entete` + `@max-[…]`) ont été essayées et **n'ont compilé AUCUNE règle**
            (vérifié au navigateur le 2026-08-07, zéro `CSSContainerRule`), ce qui rendait
            l'échelle entièrement inopérante sans que rien ne rougisse. */}
        <header className="relative shrink-0 border-b border-papa-border bg-papa-bg">
          {/* ⚠️ La hauteur et le `overflow-hidden` sont DESCENDUS du header vers ce calque : la
              bande de 46 px vit sous le bandeau, dans le même header, et un `overflow-hidden` en
              haut la clipperait. */}
          <div className="relative h-28 overflow-hidden sm:h-36">
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
            <div className="flex shrink-0 items-center gap-3 whitespace-nowrap rounded-xl border border-papa-border/60 bg-papa-surface/70 px-3 py-2 text-sm backdrop-blur-sm">
              {/* La signature de l'interface. Elle a quitté la sidebar le 2026-08-04 : les deux
                  frontends doivent rester discernables (`docs/frontend-papa/README.md`), mais la
                  sidebar est la colonne rare, et ce header — devenu fixe le même jour — ne coûte
                  rien. ⚠️ Verrouillé par un test : sans ce mot, une capture d'écran de Papa ne se
                  distingue plus d'une capture de Massimo. */}
              <span className="font-bold">
                ZETIS <span className="text-papa-accent">Papa</span>
              </span>
              <span className="hidden h-4 w-px bg-papa-border md:block" role="presentation" />
              {/* ⚠️ Le contexte CÈDE avant la production (corrigé à l'écran le 2026-08-06). Sans ça, cette
                  pilule passait à DEUX LIGNES et la barre tombait à 30 px — elle était le seul bloc
                  à céder, donc elle cédait tout. La signature « ZETIS Papa », elle, ne part jamais :
                  c'est elle qui distingue les deux frontends. */}
              <span className="hidden rounded-md bg-papa-surface-2 px-2.5 py-1 font-medium text-papa-text md:inline-block">
                Enfant : Massimo
              </span>
              <span className="hidden text-papa-muted lg:inline">Période : 2026 — 4ᵉ</span>
            </div>
            <div className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border border-papa-border/60 bg-papa-surface/70 px-2 py-2 backdrop-blur-sm">
              <button
                type="button"
                className="hidden rounded-lg border border-papa-border px-3 py-1.5 text-sm font-medium text-papa-muted hover:text-papa-text lg:block"
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
          </div>
          {/* La bande de production (addendum 2 ADR-0041) — SOUS le bandeau, qui ne bouge pas.
              Elle remplace la pilule, qui ne pouvait pas montrer le mouvement : un lot avance
              d'un pas toutes les 69 s, et à cette cadence une barre est immobile à l'œil. Le
              tapis, lui, bouge en permanence tant que quelque chose est fabriqué. */}
          <ProductionStrip
            activity={activity}
            onOpen={() => setShowRun((ouvert) => !ouvert)}
            onOpenStock={() => navigate("/couverture")}
          />
          {/* Le détail vit DANS le header, ancré sous la bande — c'est ce qui en fait un popover
              et non une modale. Il déborde volontairement : le `overflow-hidden` est resté sur le
              bandeau, jamais sur le header. */}
          {showRun && (
            <ProductionPopover
              activity={activity}
              onClose={() => setShowRun(false)}
              onAcknowledge={ackEchec}
            />
          )}
        </header>
        {/* Annonce de fin — s'efface seule, ne laisse aucune trace à traiter. */}
        {finished && <ProductionDoneModal run={finished} onClose={acknowledge} />}
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
