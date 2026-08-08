// Entrées de la sidebar Massimo (cf. SUIVI Étape 2 + docs/frontend-massimo/README.md).
// Étape 2 : navigation temporaire. Les vraies pages arrivent à l'Étape 7.
import eli5Icon from "../assets/app/ELI5_256.png";
import quizIcon from "../assets/app/quiz_384.png";
import srsIcon from "../assets/app/SRS-cards_384.png";
import mindmapsIcon from "../assets/app/mindmaps_256.png";
import { type NewsKey } from "@zetis/types";

export interface NavItem {
  to: string;
  label: string;
  icon: string;
  /** Icône image de marque (prime sur `icon`). Ex. ELI5. */
  image?: string;
  /** Témoin de nouveauté servi par `GET /api/student/news/summary` (ADR-0030).
   *
   *  ABSENT = pas de badge, et ce n'est jamais un oubli. La règle : un badge compte ce qui est
   *  NOUVEAU — né d'un geste, mort d'un **REGARD** — jamais ce qui est DÛ, qui ne meurt que du
   *  travail et grossit quand Massimo ne vient pas.
   *
   *  🔴 **UNE EXCEPTION, UNE SEULE, ET ELLE EST NOMMÉE.** `/diagnostic` porte un témoin qui meurt
   *  du **TRAVAIL** : il compte les diagnostics relus par Papa que Massimo n'a pas encore passés.
   *  Il tombe donc dans la colonne interdite, **par décision du commanditaire** prise après que
   *  l'objection lui a été exposée et réaffirmée — `adr-0030-addendum-temoin-diagnostic.md`, qui
   *  porte cinq bornes opposables (dont : le compteur ne compte que du RELU, Papa restant le
   *  robinet, et aucun décompte de jours, interdiction NON amendée).
   *  Ne pas en déduire qu'un compteur de non-faits est désormais recevable ailleurs.
   *
   *  Les absences ont chacune leur raison :
   *  - **Matières** est un hub — ce qui arrive (fiches, capsules, cartes) a déjà son entrée ;
   *  - **Quiz** : seul le DIAGNOSTIC est gaté (ADR-0043) ; un quiz de mission ou de fin de cours
   *    vaut `validated` dès sa génération, donc aucun moment « ça arrive ». ⚠️ Le motif d'avant
   *    disait « la table `quizzes` n'a pas de `validation_status` » — faux depuis `a9b0c1d2e3f4` ;
   *  - **ELI5** a bien un `new_count`, mais c'est un critère de RÉCENCE (leçon créée dans les 7
   *    jours) : il décroîtrait tout seul et allumerait une entrée qu'on vient de visiter ;
   *  - Cours, Ma Galaxie, Chat et Paramètres n'ont ni trace de vue ni contenu entrant.
   *  Un test verrouille cette liste, pour qu'elle ne se « complète » pas par symétrie apparente. */
  newsKey?: NewsKey;
}

export const MASSIMO_NAV: NavItem[] = [
  { to: "/", label: "Accueil", icon: "🏠" },
  // Agenda en position 2, juste après l'Accueil et AVANT Matières (ADR-0025).
  // Contre-intuitif vis-à-vis du flux d'apprentissage, et assumé : l'agenda est le déclencheur
  // en amont, pas une étape. Il double le résumé de l'Accueil plutôt que de le remplacer — ce
  // qui vient du collège doit être atteignable sans passer par un rebond.
  // Témoin de NOUVEAUTÉ autorisé depuis le 2026-08-01 (addendum ADR-0025 §12) : il compte ce qui
  // est ARRIVÉ depuis le dernier regard, il naît d'un geste de Papa et meurt d'un regard. Il
  // retombe à zéro dès l'ouverture et y reste toute la semaine, échéances en cours comprises —
  // c'est sa définition, pas un défaut à corriger (§12.5).
  // Un compte d'items NON FAITS reste INTERDIT sous toute forme (§3, §7, §12.4) : il ne
  // décroîtrait que par le travail et grossirait quand Massimo ne vient pas. Les deux règles se
  // ressemblent assez pour devoir être lues côte à côte.
  { to: "/agenda", label: "Agenda", icon: "🗓️", newsKey: "agenda" },
  { to: "/matieres", label: "Matières", icon: "📚" },
  // « Révision » après le bloc « apprendre » (Cours vit sous Matières) : j'apprends → j'ancre.
  // Icône de marque SRS-cards (comme ELI5) ; repli emoji 🗂️ si l'asset manque.
  // Témoin = cartes JAMAIS RÉVISÉES, et surtout pas les cartes dues : une carte due depuis cinq
  // jours est « à revoir », jamais « en retard » (ADR-0013). C'est l'entrée la plus exposée —
  // `due_count` est servi par le même endpoint et répondrait mieux à « qu'est-ce que j'ai à
  // faire », ce qui est exactement pourquoi il est interdit.
  { to: "/revision", label: "Révision", icon: "🗂️", image: srsIcon, newsKey: "revision" },
  // ⚠️ Le seul témoin qui meurt du TRAVAIL — exception nommée, voir `newsKey` ci-dessus.
  { to: "/diagnostic", label: "Diagnostic", icon: "🧭", newsKey: "diagnostic" },
  { to: "/eli5", label: "ELI5", icon: "💡", image: eli5Icon },
  // Icône de marque mindmaps.png (comme ELI5/SRS/Quiz) ; repli emoji 🕸️ si l'asset manque.
  // Témoin ajouté le 2026-08-01 : `POST /mindmaps/{id}/seen` existait depuis l'ADR-0016 mais ne
  // persistait rien (« placeholder Slice A »). La table `mindmap_views` solde cette dette.
  { to: "/mindmaps", label: "Mindmaps", icon: "🕸️", image: mindmapsIcon, newsKey: "mindmaps" },
  // Témoin spécifié dès `page-capsules-ia.md`, jamais livré en navigation jusqu'ici.
  { to: "/capsules", label: "Capsules IA", icon: "🎬", newsKey: "capsules" },
  // Fiches de révision (résumé d'une leçon sur une page) — dérivé du cours validé.
  { to: "/fiches", label: "Fiches", icon: "🗂️", newsKey: "fiches" },
  // Icône de marque quiz.png (comme ELI5/SRS) ; repli emoji ✅ si l'asset manque.
  { to: "/quiz", label: "Quiz", icon: "✅", image: quizIcon },
  // « Ma Galaxie » à la MÊME position qu'avant (addendum ADR-0024 §A) : le renommage ne doit pas
  // se transformer en 6ᵉ onglet, ce que l'ADR-0024 §1 interdit. Le nombre d'entrées ne bouge pas.
  { to: "/galaxy", label: "Ma Galaxie", icon: "🌌" },
  // Témoin = missions validées JAMAIS DÉMARRÉES. Pas les missions disponibles (une file), pas
  // les missions en retard (un arriéré).
  { to: "/missions", label: "Missions", icon: "🎯", newsKey: "missions" },
  { to: "/chat", label: "Chat ZETIS", icon: "💬" },
];
