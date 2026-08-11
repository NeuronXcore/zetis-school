import { Link } from "react-router-dom";
import type { GalaxyActionKind } from "@zetis/types";
import { subjectRouteFor } from "../../lib/notionRoutes";

/** L'onglet actif parmi les DEUX vues internes. Les autres onglets sont des liens sortants. */
export type SubjectTab = "apercu" | "chapitres";

/** Les surfaces par matière qui existent VRAIMENT, dans l'ordre pédagogique.
 *
 *  ⚠️ Chaque entrée doit rendre une route non nulle via `subjectRouteFor`. `capsule` et `eli5`
 *  en sont absents et ce n'est pas un oubli : aucune route par matière ne les sert (voir la
 *  table partagée). **Un onglet qui ne mène nulle part est la faute que cette page interdit** —
 *  c'est le signalement du 2026-08-01 sur la pastille `quiz`, cliquée en vain et lue comme une
 *  panne. Une chose qui ressemble à un lien doit être un lien. */
const SURFACES: { kind: GalaxyActionKind; label: string }[] = [
  { kind: "cours", label: "Cours" },
  { kind: "fiche", label: "Fiches" },
  // ⚠️ « Mindmaps », et surtout PAS « Cartes ». Signalé par le user le 2026-08-11 : un onglet
  // « Cartes » posé juste avant « Révisions » se lit comme les cartes de révision, et le lien
  // vers les mindmaps semble MANQUANT. Le mot « carte » désigne déjà deux choses dans l'app
  // (`ACTION_UI` : « Reconstruire la carte » / « Réviser mes cartes ») — cet onglet n'a pas à
  // inventer un troisième nom. « Mindmaps » est celui que la barre latérale montre à Massimo
  // tous les jours (`navigation.ts`).
  { kind: "mindmap", label: "Mindmaps" },
  { kind: "revision", label: "Révisions" },
  { kind: "quiz", label: "Quiz" },
];

export interface SubjectTabsProps {
  slug: string;
  subjectName: string;
  active: SubjectTab;
}

/** La barre d'onglets d'une matière.
 *
 *  Deux vues internes (aperçu, chapitres) portées par `?onglet=` — l'état vit dans l'URL, donc il
 *  survit au rafraîchissement, au partage de lien et au retour physique iPhone. C'est la même
 *  raison qui a fait dériver le rétrolien du `:slug` plutôt que d'un `location.state`.
 *
 *  Les cinq autres sont des LIENS vers des surfaces déjà livrées. C'est ce qui les sépare du
 *  launcher de Phase 1 que la spec condamne : celui-là avait quatre tuiles dont trois sans
 *  `onClick`. Ici, aucune destination n'est inventée — elles viennent toutes de la table de
 *  routes partagée. */
export function SubjectTabs({ slug, subjectName, active }: SubjectTabsProps) {
  const base =
    "min-h-11 shrink-0 whitespace-nowrap rounded-xl px-3 py-2 text-sm transition-colors motion-reduce:transition-none";
  const on = "bg-zetis-surface-2 font-bold text-zetis-text";
  const off = "text-zetis-muted hover:text-zetis-text";

  return (
    <nav
      aria-label={`Sections de ${subjectName}`}
      // `flex-wrap`, et surtout PAS `overflow-x-auto` ni un menu déroulant.
      //
      // ⚠️ Corrigé le 2026-08-11 après mesure à 390 px : en défilement horizontal, la barre se
      // coupait après « Fiches » — Mindmaps, Révisions et Quiz existaient mais **rien ne disait
      // qu'on pouvait faire défiler**. Sur le poste le plus contraint de Massimo, trois surfaces
      // sur sept devenaient introuvables. C'est la version aggravée du défaut que le user venait
      // de signaler sur desktop (l'onglet mindmap lu comme absent).
      //
      // Le repli sur deux ou trois lignes est plus haut, et c'est le prix juste : une navigation
      // qui prend de la place vaut mieux qu'une navigation qui cache. Sur desktop les sept
      // tiennent sur une ligne, donc rien ne bouge là-bas.
      className="mt-4 flex flex-wrap items-center gap-1 rounded-2xl border border-zetis-border bg-zetis-surface p-1"
    >
      <Link
        to={`/subjects/${encodeURIComponent(slug)}`}
        aria-current={active === "apercu" ? "page" : undefined}
        className={`${base} ${active === "apercu" ? on : off}`}
      >
        Vue d'ensemble
      </Link>
      <Link
        to={`/subjects/${encodeURIComponent(slug)}?onglet=chapitres`}
        aria-current={active === "chapitres" ? "page" : undefined}
        className={`${base} ${active === "chapitres" ? on : off}`}
      >
        Chapitres
      </Link>

      {SURFACES.map(({ kind, label }) => {
        const route = subjectRouteFor(kind, slug);
        // Ceinture : si la table cessait un jour de servir cette surface, l'onglet DISPARAÎT
        // plutôt que de devenir un lien mort.
        if (!route) return null;
        return (
          <Link
            key={kind}
            to={route}
            // Le NOM voyage avec le lien : l'URL ne porte qu'un slug, et `prettifySlug` en
            // ferait « Mathematiques », un mot amputé de son accent qui se lit comme une faute
            // de frappe du produit.
            state={{ name: subjectName }}
            className={`${base} ${off}`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
