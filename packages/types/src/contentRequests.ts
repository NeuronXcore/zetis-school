// Liste d'attente de contenus réclamés par l'enfant (addendum ADR-0027) — contrat de
// `GET·PATCH /api/content-requests`. Sémantique INVERSE de `notion_requests` : ici la notion
// EXISTE (`skill_id` connu), ce qui manque est un type de contenu.

import type { ProductionRun } from "./production";

/** Vocabulaire fermé, aligné sur les surfaces de contenu (backend `service.CONTENT_KINDS`). */
export type ContentRequestKind = "cours" | "fiche" | "mindmap" | "quiz" | "capsule" | "card";

export type ContentRequestStatus = "pending" | "done" | "dismissed";

export interface ContentRequest {
  id: number;
  skill_id: number;
  /** Nom de la notion (jointure serveur) — rend le badge Papa lisible sans re-fetch. */
  skill_name: string | null;
  /** Matière de la notion — clé de fusion côté client avec la Couverture. */
  subject_id: number | null;
  /** Nom de la matière (jointure serveur) — pour grouper la liste des demandes. */
  subject_name: string | null;
  content_kind: ContentRequestKind;
  status: ContentRequestStatus;
  /** Origine : `chat_orchestrator` (effet de bord d'un tour de chat) ou `subject_page` (geste
   *  explicite de Massimo sur une pastille grisée). La distinction n'est pas cosmétique — elle
   *  sépare le SUBI du CHOISI, et c'est ce qui donne sa valeur de priorité à la file de Papa. */
  source: string;
  created_at: string;
  /** ZETIS sait-il produire ce type tout seul ? (ADR-0036 §3)
   *
   *  `false` pour `capsule`, dont le générateur exige une **instruction en texte libre** —
   *  l'intention pédagogique de Papa — qu'une demande `(skill_id, content_kind)` ne porte pas.
   *
   *  ⚠️ **Verdict SERVEUR, jamais déduit ici.** Le front ne détient aucune liste de types
   *  productibles : la dupliquer la ferait diverger au premier générateur ajouté, et l'écran
   *  offrirait un bouton qui échoue. Même patron que `choices` / `locked` des paliers. */
  producible: boolean;
  /** Pourquoi un lot lancé **maintenant** ne produirait rien — `null` s'il produirait
   *  (addendum ADR-0036 « verdict de situation »).
   *
   *  ⚠️ **`producible` répond du TYPE, celui-ci de la SITUATION.** Un cours est productible en
   *  général, et ne l'est pas sur une notion dont la leçon est vide sous un palier où ZETIS n'a
   *  pas le droit de l'écrire. Le 2026-08-04, Papa a cliqué deux fois sur un bouton qui ne
   *  pouvait rien produire, et ne l'a appris qu'au Journal.
   *
   *  ⚠️ **Il informe, il ne verrouille pas** : la route reste ouverte, et le verdict est daté —
   *  valider un cours dans un autre onglet le rend caduc. L'écran remplace le bouton par le motif
   *  et le geste qui répare, jamais par un bouton grisé. */
  blocked_reason: string | null;
  /** Le lot qui produit CE contenu en ce moment — `null` si rien n'est en cours.
   *
   *  ⚠️ **Redérivé serveur à chaque lecture, jamais mémorisé par la page.** L'écran gardait les
   *  lots lancés dans son propre état : quitter la page et revenir effaçait la barre et rendait
   *  le bouton « Produire », comme si rien n'avait été lancé. Papa recliquait — c'est ainsi que
   *  quatre lots identiques sont nés le 2026-08-05.
   *
   *  ⚠️ Le lien ne passe pas par une clé étrangère : un lot `manual` ne porte aucun
   *  `content_request_id` (la contrainte l'interdit, ADR-0031 §4). Il se retrouve par
   *  `(skill_id, piece)`, la traduction que `REQUEST_KIND_TO_PIECE` porte déjà. */
  active_run: ProductionRun | null;
}

/** `POST /api/student/content-requests` (addendum ADR-0027) — corps de la demande de Massimo.
 *
 *  Plusieurs `content_kinds` en un appel : « demander à Papa tout ce qui manque » est UN geste
 *  de l'enfant, il ne doit pas devenir sept lignes de file émises séparément. */
export interface StudentContentRequestBody {
  skill_id: number;
  content_kinds: ContentRequestKind[];
}

/** Réponse de la même route. **Écriture seule** : les types pris en compte, rien d'autre.
 *
 *  Il n'existe **pas** de `GET` élève, et il ne faut pas en ajouter un : Massimo ne lit pas la
 *  file de Papa. Aucun statut, aucun délai, aucun rappel — ZETIS transmet la demande, il ne
 *  fabrique rien et ne promet rien. */
export interface StudentContentRequestResult {
  requested: ContentRequestKind[];
}
