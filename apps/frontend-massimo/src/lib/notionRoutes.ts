// Où mène chaque activité d'une notion — LA table de routage de ZETIS, une seule fois.
//
// Elle vivait dans une closure `go()` de `NotionActionPanel` (Galaxy), avec un `returnTo`
// codé en dur à `"/galaxy"`. La page matière rend le MÊME modèle en liste et a besoin des
// mêmes destinations : la recopier aurait créé un second jeu de routes, qui aurait divergé au
// premier correctif — le mal exact que le prédicat de disponibilité partagé (addendum ADR-0024)
// existe pour empêcher côté serveur.
//
// Module PUR, et il doit le rester : aucun import de valeur, aucun React, aucun routeur, aucun
// client HTTP. C'est ce qui permet de le partager entre la Galaxy (qui paie Three.js) et la
// page matière (dont le budget de bundle 3D est ZÉRO). Un test le verrouille.
import type { ContentRequestKind, GalaxyAction, GalaxyActionKind } from "@zetis/types";

/** Paramètre d'URL qui porte le rétrolien sur les surfaces dont le chemin n'a pas de slug.
 *
 *  `from`, et surtout PAS `subject` : `?subject=` est déjà lu sur `/eli5` et `/revision`, et il y
 *  DÉCLENCHE une action (ouvrir un deck, lancer une session). Le réutiliser transformerait un
 *  lien de retour en effet de bord. Vérifié : l'app ne lit que `name`, `skill`, `skill_id` et
 *  `subject` — `from` était libre. */
export const SUBJECT_BACK_PARAM = "from";

/** Ce qu'une route a besoin de savoir de la notion.
 *
 *  Volontairement plus ÉTROIT que `GalaxyNotion` : `PanoplyNotion` (page matière) ne porte ni
 *  `subject_slug` ni `subject_name` — ils vivent une seule fois sur `SubjectPanoply.subject`.
 *  C'est cette étroitesse qui rend la fonction partageable par les deux surfaces. */
export interface NotionRouteContext {
  skillId: number;
  name: string;
  subjectSlug: string;
  subjectName: string;
  /** D'où l'on part, pour les cibles qui ne savent pas revenir seules (le quiz en session).
   *  `"/galaxy"` depuis la constellation, `"/subjects/<slug>"` depuis l'index. Ce paramètre
   *  EST la raison d'être de cette extraction. */
  returnTo: string;
}

export type NotionRoute =
  /** Navigation synchrone — six activités sur sept. */
  | { mode: "navigate"; to: string; state?: Record<string, unknown> }
  /** `/quiz/session` n'est pas adressable par id : il attend le quiz COMPLET dans
   *  `location.state`. L'appelant doit donc le charger. La décision reste ici, la latence
   *  reste dehors. */
  | { mode: "quiz"; quizId: number; label: string; returnTo: string; fallback: string }
  /** Activité indisponible, ou identifiant absent : on ne navigue pas. Une porte qu'on ouvre
   *  sur du vide est pire que pas de porte. */
  | { mode: "none" };

/** `?from=<slug>`, pour les surfaces qui ne portent pas la matière dans leur chemin. */
function backParam(subjectSlug: string): string {
  return `${SUBJECT_BACK_PARAM}=${encodeURIComponent(subjectSlug)}`;
}

export function notionRouteFor(action: GalaxyAction, ctx: NotionRouteContext): NotionRoute {
  // Garde-fou porté par la ROUTE et non par le `disabled` du bouton : une surface qui
  // oublierait de griser n'ouvrirait quand même rien.
  if (!action.available) return { mode: "none" };

  switch (action.kind) {
    case "cours":
      return { mode: "navigate", to: `/subjects/${encodeURIComponent(ctx.subjectSlug)}/cours` };
    case "eli5":
      // Seule surface réellement adressable PAR NOTION en URL aujourd'hui. `from` s'y ajoute
      // parce que `/eli5` ne garde aucune trace de la matière : ni son URL (nettoyée dès le
      // premier rendu), ni sa réponse serveur (qui ne porte pas de slug).
      return {
        mode: "navigate",
        to:
          `/eli5?skill_id=${ctx.skillId}&name=${encodeURIComponent(ctx.name)}` +
          `&${backParam(ctx.subjectSlug)}`,
      };
    case "fiche":
      // Le `state` porte le NOM (l'URL n'a qu'un slug, et « Svt » serait laid). Ce n'est pas
      // de l'état de NAVIGATION : la page a un repli si on arrive par un lien partagé.
      return {
        mode: "navigate",
        to: `/fiches/${encodeURIComponent(ctx.subjectSlug)}`,
        state: { name: ctx.subjectName },
      };
    case "capsule":
      // ⚠️ Dette connue, pas introduite ici : `action.capsule_id` est IGNORÉ, on ouvre la liste
      // à plat. Le libellé « Regarder la capsule » sur-promet donc déjà. À corriger quand
      // `/capsules/:id` existera — hors périmètre de ce chantier.
      return { mode: "navigate", to: "/capsules" };
    case "mindmap":
      return action.mindmap_id
        ? { mode: "navigate", to: `/mindmaps/reconstruire/${action.mindmap_id}` }
        : { mode: "none" };
    case "revision":
      // `?subject=` lance la session ; `?from=` sert le rétrolien. Deux rôles, deux paramètres :
      // les confondre ferait d'un retour un lancement.
      return {
        mode: "navigate",
        to:
          `/revision?subject=${encodeURIComponent(ctx.subjectSlug)}` +
          `&${backParam(ctx.subjectSlug)}`,
      };
    case "quiz":
      return action.quiz_id
        ? {
            mode: "quiz",
            quizId: action.quiz_id,
            label: `${ctx.subjectName} · ${ctx.name}`,
            returnTo: ctx.returnTo,
            fallback: "/quiz",
          }
        : { mode: "none" };
  }
}

/** Portée réelle d'une activité, quand elle est plus large que la notion.
 *
 *  `quiz` et `revision` n'ont AUCUN identifiant par notion (hors v1 ADR-0027, cibles
 *  `location.state`) : ils ouvrent la surface MATIÈRE. Les libellés d'`ACTION_UI` (« Me tester »,
 *  « Réviser mes cartes ») promettent pourtant la notion. On ne touche pas `ACTION_UI` — il est
 *  partagé avec la Galaxy et le chat — on ajoute la précision là où on la rend. */
export const SCOPE_NOTE: Partial<Record<GalaxyActionKind, string>> = {
  revision: "toute la matière",
  quiz: "toute la matière",
};

/** Activité → type de contenu demandable à Papa.
 *
 *  Le vocabulaire de `content_requests` n'a que SIX entrées pour SEPT activités : `eli5` se
 *  demande comme `cours` (il s'ancre dessus et dégrade sans lui), `revision` comme `card`. */
export const REQUESTABLE_KIND: Record<GalaxyActionKind, ContentRequestKind> = {
  cours: "cours",
  eli5: "cours",
  fiche: "fiche",
  capsule: "capsule",
  mindmap: "mindmap",
  revision: "card",
  quiz: "quiz",
};

/** Ce qui manque à une notion, traduit en vocabulaire de demande et DÉDUPLIQUÉ.
 *
 *  ⚠️ La déduplication n'est pas un raffinement : `cours` et `eli5` sont TOUJOURS indisponibles
 *  ensemble (les deux suivent l'existence d'un cours validé) et se demandent tous deux comme
 *  `cours`. Sans elle, « tout ce qui manque » annoncerait 7 alors que le maximum est 6 — et
 *  enverrait deux fois la même demande.
 */
export function missingRequestKinds(actions: GalaxyAction[]): ContentRequestKind[] {
  const missing = actions
    .filter((action) => !action.available)
    .map((action) => REQUESTABLE_KIND[action.kind]);
  return [...new Set(missing)];
}
