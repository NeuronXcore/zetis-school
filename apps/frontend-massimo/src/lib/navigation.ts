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
   *  l'objection lui a été exposée et réaffirmée — `adr-0030-temoins-nouveaute-navigation.md` (Amendement 1), qui
   *  porte cinq bornes opposables (dont : le compteur ne compte que du RELU, Papa restant le
   *  robinet, et aucun décompte de jours, interdiction NON amendée).
   *  Ne pas en déduire qu'un compteur de non-faits est désormais recevable ailleurs.
   *
   *  🔴 **TROIS ABSENCES ONT ÉTÉ LEVÉES LE 2026-08-15.** Leurs motifs sont conservés **barrés et
   *  datés**, jamais effacés : un motif effacé se réinvente, un motif barré non — c'est déjà la
   *  méthode appliquée à `validation_status` ci-dessous, et la chaîne se lit sur trois crans.
   *
   *  - **Matières** — ~~« est un hub : ce qui arrive (fiches, capsules, cartes) a déjà son
   *    entrée »~~. Le motif rangeait le **cours** avec ses **DÉRIVÉS** : fiche, capsule, mindmap et
   *    carte sont produites *à partir* du cours (ADR-0011), le cours est l'original, et c'est le
   *    seul objet dont l'arrivée n'avait aucune entrée. Le témoin ne compte QUE le cours, donc il
   *    ne double rien (`adr-0030-temoins-nouveaute-navigation` (Amendement 2)).
   *  - **Quiz** — ~~« la table `quizzes` n'a pas de `validation_status` »~~ (faux depuis
   *    `a9b0c1d2e3f4`), puis ~~« seul le DIAGNOSTIC est gaté (ADR-0043), donc aucun moment ça
   *    arrive » (ADR-0044 §7)~~. Ce second motif **reste vrai** — et la décision ne le contredit
   *    pas, elle passe par-dessus : le §1 dit « naît d'un geste de Papa ou **DU SYSTÈME** », et un
   *    quiz produit par le worker est un contenu qui arrive. Ce témoin naît d'une **PRODUCTION**,
   *    pas d'une validation — donc **Papa n'en est pas le robinet**
   *    (`adr-0030-temoins-nouveaute-navigation` (Amendement 4), borne 4, écrite pour être surveillée).
   *  - **ELI5** — ~~« a bien un `new_count`, mais c'est un critère de RÉCENCE (leçon créée dans les
   *    7 jours) : il décroîtrait tout seul »~~. La règle reste vraie et ce compteur-là reste
   *    inéligible : on ne l'a pas réutilisé, **on a payé la table** (`eli5_views`). Le §2 en sort
   *    renforcé (`adr-0030-temoins-nouveaute-navigation` (Amendement 3)).
   *
   *  Les absences qui restent : Accueil, Ma Galaxie et Chat n'ont ni trace de vue ni contenu
   *  entrant. Elles sont désormais tenues par une **PARTITION TOTALE** dans `navigation.test.ts` —
   *  les deux camps réunis font exactement `MASSIMO_NAV`, sans doublon — et non plus par une liste
   *  d'exclusion qui rétrécit à chaque chantier (borne B4). Une 14ᵉ entrée devra trancher son camp. */
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
  // Témoin = COURS validés de l'année active jamais ouverts. Pas les fiches, pas les capsules,
  // pas les cartes : elles ont chacune leur entrée, et c'est ce que le motif « hub » protégeait à
  // juste titre. Il meurt du premier `GET /lessons/{id}/cours` — donc d'un regard.
  // ⚠️ Seul des trois témoins posés ce jour-là SANS point zéro : sa trace `lesson_views` est
  // partagée avec la fiabilité du diagnostic et le Cahier de bord, y écrire des vues fictives
  // fausserait un calcul pédagogique. Il démarre donc plein et se vide à l'usage.
  { to: "/matieres", label: "Matières", icon: "📚", newsKey: "matieres" },
  // « Révision » après le bloc « apprendre » (Cours vit sous Matières) : j'apprends → j'ancre.
  // Icône de marque SRS-cards (comme ELI5) ; repli emoji 🗂️ si l'asset manque.
  // Témoin = cartes JAMAIS RÉVISÉES, et surtout pas les cartes dues : une carte due depuis cinq
  // jours est « à revoir », jamais « en retard » (ADR-0013). C'est l'entrée la plus exposée —
  // `due_count` est servi par le même endpoint et répondrait mieux à « qu'est-ce que j'ai à
  // faire », ce qui est exactement pourquoi il est interdit.
  { to: "/revision", label: "Révision", icon: "🗂️", image: srsIcon, newsKey: "revision" },
  // ⚠️ Le seul témoin qui meurt du TRAVAIL — exception nommée, voir `newsKey` ci-dessus.
  { to: "/diagnostic", label: "Diagnostic", icon: "🧭", newsKey: "diagnostic" },
  // Témoin = notions ELI5-éligibles JAMAIS EXPLIQUÉES, adossé à `eli5_views` (table créée le
  // 2026-08-15). ⚠️ Surtout PAS le `new_count` des decks, qui est un critère de récence à 7 jours :
  // les deux coexistent, l'un en page, l'autre ici, et ils ne comptent pas la même chose.
  { to: "/eli5", label: "ELI5", icon: "💡", image: eli5Icon, newsKey: "eli5" },
  // Icône de marque mindmaps.png (comme ELI5/SRS/Quiz) ; repli emoji 🕸️ si l'asset manque.
  // Témoin ajouté le 2026-08-01 : `POST /mindmaps/{id}/seen` existait depuis l'ADR-0016 mais ne
  // persistait rien (« placeholder Slice A »). La table `mindmap_views` solde cette dette.
  { to: "/mindmaps", label: "Mindmaps", icon: "🕸️", image: mindmapsIcon, newsKey: "mindmaps" },
  // Témoin spécifié dès `page-capsules-ia.md`, jamais livré en navigation jusqu'ici.
  { to: "/capsules", label: "Capsules IA", icon: "🎬", newsKey: "capsules" },
  // Fiches de révision (résumé d'une leçon sur une page) — dérivé du cours validé.
  { to: "/fiches", label: "Fiches", icon: "🗂️", newsKey: "fiches" },
  // Icône de marque quiz.png (comme ELI5/SRS) ; repli emoji ✅ si l'asset manque.
  // Témoin = quiz jouables JAMAIS OUVERTS, adossé à `quiz_views` (table créée le 2026-08-15).
  // 🔴 Jamais « jamais joués » : `QuizAttempt` n'entre pas dans le compteur. Ouvrir puis
  // abandonner sans répondre éteint quand même le témoin — c'est le prix de ne pas compter du
  // travail, et il est assumé (addendum Quiz, borne 1).
  { to: "/quiz", label: "Quiz", icon: "✅", image: quizIcon, newsKey: "quiz" },
  // « Ma Galaxie » à la MÊME position qu'avant (addendum ADR-0024 §A) : le renommage ne doit pas
  // se transformer en 6ᵉ onglet, ce que l'ADR-0024 §1 interdit. Le nombre d'entrées ne bouge pas.
  { to: "/galaxy", label: "Ma Galaxie", icon: "🌌" },
  // Témoin = missions validées JAMAIS DÉMARRÉES. Pas les missions disponibles (une file), pas
  // les missions en retard (un arriéré).
  { to: "/missions", label: "Missions", icon: "🎯", newsKey: "missions" },
  { to: "/chat", label: "Chat ZETIS", icon: "💬" },
];
