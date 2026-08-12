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

/** Route de niveau MATIÈRE pour un type d'activité, ou `null` s'il n'y en a pas.
 *
 *  Table SŒUR de `notionRouteFor`, et non un repli : celle-ci part d'une notion et refuse tout
 *  si son activité n'est pas disponible, ce qui n'a aucun sens quand on veut ouvrir « les fiches
 *  de SVT » depuis un compte agrégé.
 *
 *  ⚠️ Deux types rendent `null`, et ce n'est pas un oubli :
 *  - `capsule` — `/capsules` est une liste GLOBALE, il n'existe ni `/capsules/:slug` ni
 *    `/capsules/:id` ;
 *  - `eli5` — il n'est adressable que par notion (`?skill_id=`), jamais par matière.
 *
 *  L'appelant DOIT rendre ces deux-là non cliquables — **et visiblement inertes**, sinon ils se
 *  lisent comme une panne (constaté sur `quiz` le 2026-08-01 : « le KPI ne marche pas »). Les
 *  envoyer vers la liste globale serait une petite trahison — exactement ce que le rétrolien
 *  corrige ailleurs.
 *
 *  `quiz` en faisait partie jusqu'au 2026-08-01 : `/quiz` gardait la matière en état interne.
 *  Un lien profond `?subject=` lui a été ajouté (patron de `/revision` et `/eli5`), donc il est
 *  désormais adressable — et cliquable.
 */
export function subjectRouteFor(kind: GalaxyActionKind, subjectSlug: string): string | null {
  const slug = encodeURIComponent(subjectSlug);
  switch (kind) {
    case "cours":
      return `/subjects/${slug}/cours`;
    case "fiche":
      return `/fiches/${slug}`;
    case "mindmap":
      // ⚠️ Cette route existe (`App.tsx`), et diffère de la route par NOTION, qui ouvre une
      // carte précise en reconstruction (`/mindmaps/reconstruire/:id`). Ici on ouvre le deck.
      return `/mindmaps/${slug}`;
    case "revision":
      return `/revision?subject=${slug}&${backParam(subjectSlug)}`;
    case "quiz":
      // `?subject=` ouvre les quiz DE LA MATIÈRE, pas la grille de toutes les matières.
      return `/quiz?subject=${slug}&${backParam(subjectSlug)}`;
    case "capsule":
    case "eli5":
      return null;
  }
}

/** Où mène une échéance de l'agenda — son cours (addendum ADR-0025 §15).
 *
 *  Une échéance qui NOMME un cours sans y donner accès oblige Massimo à le retrouver à la main
 *  dans sa matière : c'est le reproche que `pilotageLinks.ts` fait déjà, côté Papa, à une cellule
 *  sans lien. L'agenda est la surface où ce reproche coûte le plus cher — c'est la seule que
 *  Massimo ouvre en sachant ce qu'il a à faire.
 *
 *  **Trois précisions, dans cet ordre**, parce que l'échéance n'en porte pas toujours autant :
 *  la leçon (Papa l'a choisie dans la liste), sinon le chapitre, sinon la matière seule.
 *
 *  ⚠️ **`null` quand il n'y a rien à ouvrir**, jamais un lien vers la racine : même discipline
 *  que `pilotageLink`. Une échéance sans matière n'a pas de page de cours, et un lien qui
 *  déposerait Massimo au hasard est pire que pas de lien.
 *
 *  ⚠️ **Indépendant du `kind`.** Un devoir rattaché à un cours y mène aussi ; recopier ici une
 *  règle de type en ferait une seconde source de vérité — celle de `TRIGGERING_KINDS` a divergé
 *  le jour même où `devoir` y est entré (addendum ADR-0035 §3).
 */
export function agendaCourseRoute(item: {
  subject: { slug: string } | null;
  label?: string;
  lesson_id: number | null;
  chapter_id: number | null;
}): string | null {
  if (!item.subject) return null;
  const base = `/subjects/${encodeURIComponent(item.subject.slug)}/cours`;
  if (item.lesson_id !== null) return `${base}?lesson=${item.lesson_id}`;
  if (item.chapter_id !== null) {
    // Le lien DIT ce qu'il cherche (§15.6). Une échéance peut porter un chapitre sans porter de
    // leçon — toutes celles saisies avant le 2026-08-10, et toutes celles dont l'intitulé a été
    // tapé à la main. Son libellé est pourtant, souvent, le titre EXACT d'un cours du chapitre.
    //
    // ⚠️ Ce n'est pas la résolution « texte libre → leçon » que le §13.3 a écartée : le
    // rapprochement est une **égalité stricte** dans un **chapitre déjà connu**, il ne persiste
    // rien, et son pire cas est l'état actuel — le chapitre déplié, sans cadre.
    const titre = item.label?.trim();
    return titre
      ? `${base}?chapter=${item.chapter_id}&title=${encodeURIComponent(titre)}`
      : `${base}?chapter=${item.chapter_id}`;
  }
  return base;
}

/** Portée réelle d'une activité, quand elle est plus large que la notion.
 *
 *  `quiz` et `revision` n'ont AUCUN identifiant par notion (hors v1 ADR-0027, cibles
 *  `location.state`) : ils ouvrent la surface MATIÈRE. Les libellés d'`ACTION_UI` (« Me tester »,
 *  « Réviser mes cartes ») promettent pourtant la notion. La précision se pose donc ICI, là où on
 *  la rend, et pas dans `ACTION_UI`.
 *
 *  ⚠️ **Ce que cette règle interdit, et ce qu'elle n'interdit pas.** Elle disait « on ne touche pas
 *  `ACTION_UI` » ; c'était trop large. Ce qui n'a rien à faire dans une table partagée par trois
 *  surfaces, c'est un texte qui n'est vrai que sur l'une d'elles — la portée est justement de
 *  celles-là. Un **renommage**, lui, s'applique partout à l'identique : c'est l'usage même d'une
 *  source unique. `mindmap` y a été renommé le 2026-08-12 (« Reconstruire la carte » →
 *  « Reconstruire la mindmap ») pour lever une collision de vocabulaire, sur les cinq surfaces à
 *  la fois — et c'est bien ainsi. */
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
