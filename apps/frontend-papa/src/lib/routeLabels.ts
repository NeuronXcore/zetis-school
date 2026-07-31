// Traduction d'une route de l'espace Massimo en libellé lisible par Papa.
//
// Pourquoi ce fichier existe (addendum ADR-0024 §D) : `POST /api/telemetry/pageview` enregistre
// la route BRUTE dans `LearningEvent.payload_json`, et le serveur la ressert telle quelle comme
// `detail` (`activity/service.py:_detail_for`). Papa lisait donc « Navigation · /eli5 » — un
// chemin d'URL, pas un mot de sa langue.
//
// Le renommage de `/progression` en `/galaxy` (2026-07-31) rendait ce défaut coûteux : la table
// `learning_events` est APPEND-ONLY et rien ne réécrit l'historique. Sans cette table, les
// visites d'avant le renommage et celles d'après apparaîtraient comme DEUX pages distinctes,
// alors que c'est la même. L'historique ne se réécrit pas — on l'interprète.

/** Route Massimo → libellé affiché. Table explicite : aucun libellé n'est deviné. */
const ROUTE_LABELS: Record<string, string> = {
  "/": "Accueil",
  "/agenda": "Agenda",
  "/matieres": "Matières",
  "/revision": "Révision",
  "/revision/session": "Révision (session)",
  "/fiches": "Fiches",
  "/diagnostic": "Diagnostic",
  "/eli5": "ELI5",
  "/mindmaps": "Mindmaps",
  "/capsules": "Capsules IA",
  "/quiz": "Quiz",
  "/quiz/session": "Quiz (session)",
  "/missions": "Missions",
  "/chat": "Chat ZETIS",
  "/login": "Connexion",
  // Les DEUX routes de la galaxie rendent le MÊME libellé — c'est la raison d'être de ce
  // fichier. `/progression` a servi cette page du 2026-07-28 au 2026-07-31 ; ces trois jours de
  // fréquentation réelle de Massimo doivent rester lisibles, et se confondre avec la suite.
  "/galaxy": "Ma Galaxie",
  "/progression": "Ma Galaxie",
};

/** Préfixes à segment variable : `/subjects/svt` et `/fiches/svt` ne peuvent pas être énumérés. */
const ROUTE_PREFIXES: [string, string][] = [
  ["/subjects/", "Matières"],
  ["/fiches/", "Fiches"],
  ["/mindmaps/", "Mindmaps"],
];

/**
 * Libellé lisible d'une route visitée.
 *
 * Une route inconnue est rendue TELLE QUELLE plutôt que masquée : une page nouvelle doit
 * apparaître dans le cahier de bord même si personne n'a pensé à l'ajouter ici. Un trou
 * d'affichage serait pire qu'un chemin brut.
 */
export function routeLabel(route: string): string {
  const clean = route.split("?")[0].replace(/\/+$/, "") || "/";
  const exact = ROUTE_LABELS[clean];
  if (exact) return exact;
  const prefixed = ROUTE_PREFIXES.find(([prefix]) => clean.startsWith(prefix));
  return prefixed ? prefixed[1] : route;
}
