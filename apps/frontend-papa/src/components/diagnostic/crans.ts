import type { DiagnosticCran } from "@zetis/types";

// Le vocabulaire des trois crans (adr-0045, Décisions 5 et 6). Module pur, comme `paliers.ts` —
// c'est sur lui que portent les verrous de doctrine.
//
// 🔴 **L'ACTEUR passe avant l'état.** Les deux crans non passés désignent des acteurs OPPOSÉS, et
// l'écran les rendait en deux paires de deux mots — « à relire / non proposé » et « en attente /
// non passé » — de même casse et **du même gris**. Rien ne disait chez qui la balle se trouvait, et
// douze lignes d'affilée portaient la seconde paire sur les données de dev.
//
// 🔴 **La couleur ne porte JAMAIS l'information seule.** Le mot est écrit ; l'ambre et le bleu ne
// font que doubler ce que la ligne dit déjà.
//
// 🔴 **Aucun compte de jours, sous aucune forme.** « chez Massimo depuis 6 jours » serait un
// décompte de non-fait : il ne décroîtrait que par le travail et grossirait pendant une absence
// (`CLAUDE.md` §gamification, règle « NOUVEAU jamais DÛ » de l'`adr-0030`). La date de proposition
// est déjà affichée — elle dit le même fait sans le transformer en dette.

export interface CranTexte {
  /** Chez qui la balle se trouve. **Vide au 3ᵉ cran** : plus personne n'attend. */
  acteur: string;
  /** Ce qu'il reste à faire, en gris et en second. */
  etat: string;
  /** Le verbe de la date — « proposé le 5 août ». */
  verbe: string;
  /** Ambre = c'est à Papa d'agir · bleu = on attend Massimo. Redondant avec `acteur`, par choix. */
  ton: string;
}

export const CRAN_TEXTE: Record<DiagnosticCran, CranTexte> = {
  genere: { acteur: "chez toi", etat: "à relire", verbe: "généré", ton: "text-papa-warn" },
  propose: {
    acteur: "chez Massimo",
    etat: "pas encore passé",
    verbe: "proposé",
    ton: "text-papa-accent-2",
  },
  passe: { acteur: "", etat: "", verbe: "passé", ton: "" },
};

/** Le geste secondaire d'un cran non passé.
 *
 *  Les deux appellent `POST /quizzes/{id}/reject` — mais ils ne se nomment pas pareil : **refuser
 *  un lot qui n'est jamais sorti n'est pas retirer ce qu'un enfant a déjà sous les yeux.**
 *
 *  🔴 **Aucune de ces formulations ne désigne un manquement de Massimo.** Le refus va au lot, jamais
 *  à l'enfant — et le corps du dialogue le dit en toutes lettres pour que personne ne le réécrive
 *  « il ne l'a pas fait ». */
export const RETRAIT: Record<
  "genere" | "propose",
  { bouton: string; titre: string; corps: string }
> = {
  genere: {
    bouton: "Refuser ce lot",
    titre: "Refuser ce diagnostic ?",
    corps:
      "Il sort de ta file de relecture et n'atteindra pas Massimo. Rien n'est effacé : ses questions restent en base.",
  },
  propose: {
    bouton: "Retirer la proposition",
    titre: "Retirer ce diagnostic de la page de Massimo ?",
    // ⚠️ Cette phrase a été réécrite parce que le verrou de doctrine l'a refusée : elle disait
    // « ce n'est pas un reproche : … pas parce qu'il ne l'a pas fait ». Elle NOMMAIT le reproche
    // pour le nier — et nier une accusation l'introduit. Le verrou est lexical et ne peut pas faire
    // la différence : c'est une bonne raison de ne jamais aborder le sujet.
    corps:
      "Il disparaîtra de sa page. On retire un diagnostic quand il ne tombe plus juste — une autre notion à mesurer d'abord, ou un meilleur moment. Rien n'est effacé : ses questions restent en base.",
  },
};

// 🔴 **`actionPrincipale()` A ÉTÉ SUPPRIMÉE (adr-0051 Décision 1 bis).** Elle rendait, pour le seul
// cran « généré », un lien « Ouvrir dans la file de relecture → » vers `/relecture?kind=diagnostic`.
//
// Ce lien était la SEULE sortie possible tant que la lecture n'existait nulle part — et il est
// devenu un aller-retour le jour où le questionnaire s'est déplié ici : la file renvoie vers cette
// page, cette page renvoyait vers la file, et ni l'une ni l'autre ne montrait les questions.
// L'ADR-0045 D5 est amendée en conséquence, et le dit.
//
// ⚠️ **Ce n'est pas un revirement** : l'action était juste, c'est sa raison d'être qui a disparu.
//
// 🔴 **ET CE QU'ELLE PROTÉGEAIT NE DISPARAÎT PAS AVEC ELLE.** Son `return null` pour le cran
// « proposé » figeait une DÉCISION, pas un manque : « Voir la page de Massimo → » ne peut pas
// rendre ce qu'elle annonce — aucun lien inter-app n'existe, et cette page appelle des routes
// `require_child` qui répondent **403** à un rôle parent (`auth/deps.py:55`). Papa y verrait une
// erreur, jamais ce que Massimo voit. La décision produit qui la débloquerait est au `BACKLOG.md`.
//
// Cette protection a **changé de support** : elle vit désormais dans un test de rendu du panneau
// (`PanneauPassation.test.tsx`), qui vérifie que le cran « proposé » n'offre aucun lien de sortie.
// La supprimer par effet de bord en supprimant cette fonction aurait été une régression masquée.
