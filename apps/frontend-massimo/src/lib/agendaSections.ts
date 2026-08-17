// Découpage PUR de l'agenda de Massimo en sections (ADR-0025 §6-7) — aucun accès réseau,
// testé isolément.
//
// Deux règles traversent ce fichier, et elles ne sont pas décoratives :
//
// 1. **« À reprendre » ne grossit jamais** — 3 items au maximum, quel qu'en soit le nombre
//    réel, et surtout **aucun « et 7 autres »**. C'est le mécanisme anti-dette : une section
//    qui s'allonge à l'écran est un compteur d'arriéré déguisé.
// 2. **Aucun total, aucun compteur de retard** n'est calculé ici. Ce qui n'est pas fait ne se
//    compte pas.
import {
  type AgendaDay,
  type AgendaItemStudent,
  type AgendaPlanStep,
  type AgendaUpcomingItem,
} from "@zetis/types";
import { subjectRouteFor } from "./notionRoutes";

/** Combien de « À reprendre » sont montrés d'emblée (ADR-0025 §7).
 *
 *  ⚠️ **Plafond d'AFFICHAGE, plus de filtrage** (addendum §17, 2026-08-10). Il coupait la liste
 *  dans `splitSections` : les plus anciens n'étaient pas cachés, ils étaient **hors d'atteinte**.
 *  Ils sont désormais tous là, et la page en montre trois avec un dépliage.
 *
 *  Ce que le §7 interdit reste interdit : un écran qui s'allonge **tout seul**. Un dépliage que
 *  Massimo ouvre est son geste, pas une dette qui pousse sous ses yeux. */
export const RESUME_MAX = 3;

/** Ce que dit un jour SANS rien — ni échéance, ni trace (ADR-0025 Amdt 8 §D15).
 *
 *  🔴 **Une seule phrase, au passé comme à venir, et UN SEUL endroit où elle est écrite.**
 *  Elle vivait en double, formulée différemment selon la surface et selon le temps :
 *  « Ce jour-là, l'école ne demandait rien. » au passé, « Rien de noté pour ce jour. » à venir,
 *  chacune recopiée dans le panneau ET dans le toast. Deux surfaces qui répondent la même
 *  question doivent la dire pareil — et le seul moyen de le garantir est de n'avoir qu'une
 *  source.
 *
 *  ⚠️ **« l'école » a été écarté** (commanditaire, 2026-08-17) : depuis le §D9, c'est ZETIS qui
 *  parle sur cette page, et le toast mélangeait donc deux voix — « Ce que ZETIS te demandait »
 *  en titre, « l'école ne demandait rien » deux lignes plus bas. « Rien de prévu » n'attribue la
 *  demande à personne. */
export const JOUR_VIDE = "Rien de prévu ce jour-là.";

export function isoDay(day: Date): string {
  const month = `${day.getMonth() + 1}`.padStart(2, "0");
  const date = `${day.getDate()}`.padStart(2, "0");
  return `${day.getFullYear()}-${month}-${date}`;
}

export function addDays(day: Date, count: number): Date {
  const next = new Date(day);
  next.setDate(next.getDate() + count);
  return next;
}

export interface AgendaSections {
  today: AgendaItemStudent[];
  tomorrow: AgendaItemStudent[];
  /** Le reste de la bande à venir (J+2 → J+3), replié par défaut côté page. */
  later: AgendaItemStudent[];
  /** Passés non faits, plafonnés. Ambre doux côté rendu, jamais rouge. */
  resume: AgendaItemStudent[];
}

export function splitSections(items: AgendaItemStudent[], today: Date): AgendaSections {
  const todayIso = isoDay(today);
  const tomorrowIso = isoDay(addDays(today, 1));
  const byDate = [...items].sort((a, b) => a.due_on.localeCompare(b.due_on));
  return {
    today: byDate.filter((item) => item.due_on === todayIso),
    tomorrow: byDate.filter((item) => item.due_on === tomorrowIso),
    later: byDate.filter((item) => item.due_on > tomorrowIso),
    // Un item passé DÉJÀ FAIT ne revient pas : il n'y a rien à reprendre.
    //
    // ⚠️ **Plus de plafond ICI depuis le 2026-08-10** (addendum §17). Il y était, et il rendait
    // les plus anciens **inaccessibles**, pas seulement invisibles. Le plafond a changé de nature :
    // il est devenu un plafond d'AFFICHAGE, appliqué par la page (`RESUME_MAX`), que Massimo lève
    // d'un geste. Le §7 protège d'un écran qui s'allonge tout seul — pas d'un dépliage demandé.
    //
    // Plus récent d'abord : ce qu'on vient de manquer se rattrape avant ce qui date de dix jours.
    resume: byDate.filter((item) => item.due_on < todayIso && !item.done).reverse(),
  };
}

/** Étiquette d'origine affichée sous un item, ou `null` s'il n'y a rien à dire.
 *
 * « complété par ZETIS » prime sur « ajouté par ZETIS » : quand l'item de Massimo a été corrigé,
 * l'information neuve est la CORRECTION — c'est elle qui doit être visible, sans quoi l'agenda
 * bougerait tout seul sous ses yeux (ADR-0025 §2a).
 *
 * ⚠️ **« ZETIS » et non « papa » depuis le 2026-08-10** (addendum §16). Le §2a exige que Massimo
 * sache qu'un AUTRE a touché son agenda — il n'exige pas de le nommer. Généralise la décision du
 * 2026-08-02 sur les missions : « une mission arrive dans la voix de ZETIS, quel que soit qui l'a
 * créée ; la voix du monde de Massimo doit tenir dans le temps ». Le marqueur reste, l'invariant
 * du §2a est intact — seul l'auteur nommé change. */
export function originLabel(item: AgendaItemStudent): string | null {
  if (item.edited_by_parent) return "complété par ZETIS";
  if (item.created_by === "parent") return "ajouté par ZETIS";
  return null;
}

/** « dans 3 jours », « demain », « aujourd'hui ».
 *
 * Décompte SUBI, pas fabriqué : l'échéance existe déjà dans le monde de Massimo (ADR-0025 §1).
 * Aucune couleur d'urgence ne l'accompagne — le seul signal d'approche prévu est l'apparition
 * du plan de préparation (Lot 2). */
export function daysLeftLabel(daysLeft: number): string {
  if (daysLeft <= 0) return "aujourd'hui";
  if (daysLeft === 1) return "demain";
  return `dans ${daysLeft} jours`;
}

const WEEKDAY_SHORT = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

/** « jeu. 30 » — repère court, jamais une date complète dans une liste. */
export function shortDayLabel(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return `${WEEKDAY_SHORT[date.getDay()]} ${date.getDate()}`;
}

const WEEKDAY_LONG = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MONTH_LONG = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

/** « samedi 8 août » — en-tête du jour ouvert (addendum §17), où la date complète a du sens :
 *  Massimo vient de la désigner du doigt, elle est le sujet du panneau. */
export function longDayLabel(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return `${WEEKDAY_LONG[date.getDay()]} ${date.getDate()} ${MONTH_LONG[month - 1]}`;
}

/** Les 3 premiers items « aujourd'hui puis demain » du bandeau d'Accueil.
 *  **Aucune date n'y est affichée** : l'Accueil porte l'horizon « maintenant » (§6). */
export function bannerItems(sections: AgendaSections, max = 3): AgendaItemStudent[] {
  return [...sections.today, ...sections.tomorrow].slice(0, max);
}

/** Les 2 échéances les plus proches pour la section « À préparer » du bandeau d'Accueil.
 *
 *  Le serveur borne DÉJÀ « ce qui arrive » (horizon + `agenda_upcoming_max`) ; ce second plafond
 *  est celui du bandeau, plus serré que celui de la page. C'est délibéré : l'Accueil dit *qu'il y
 *  a quelque chose à préparer et quand*, la page `/agenda` dit *tout*. Un bandeau qui s'allonge
 *  redeviendrait la liste de dette que l'ADR-0025 §6 refuse d'afficher.
 *
 *  ⚠️ Contrairement à `bannerItems`, ces lignes PORTENT une date — l'horizon n'est plus
 *  « maintenant » mais « bientôt », et une échéance qui vient du collège est un fait subi, jamais
 *  un compte à rebours fabriqué par ZETIS (§1). C'est ce qui la distingue d'un compteur d'arriéré. */
export function bannerUpcoming(
  items: AgendaUpcomingItem[],
  max = 2,
): AgendaUpcomingItem[] {
  return items.slice(0, max);
}

/** L'état de routeur qui lance la session du deck CHAPITRE depuis une échéance (ADR-0049).
 *
 *  Le runner `/revision/session` existe déjà et n'est pas modifié : il lit `location.state`.
 *  Cette fonction ne fait que le composer — d'où sa place ici, dans un module pur et testé,
 *  plutôt que dans le JSX de la ligne d'agenda.
 *
 *  ⚠️ **`label` porte l'intitulé de l'ÉCHÉANCE, pas le nom du chapitre** — et c'est une
 *  contrainte, pas un choix : `AgendaItemStudent` sert `chapter_id`, jamais le nom du chapitre.
 *  L'intitulé est ce que Massimo vient de taper, donc l'en-tête de session prolonge son geste au
 *  lieu d'annoncer un objet qu'il n'a pas vu. Si l'écart gêne à la relecture, le correctif propre
 *  est un `chapter_name` au payload serveur — pas une reconstitution côté client.
 *
 *  ⚠️ **Rend `null` quand le chapitre est absent** : appeler cette fonction sur une échéance sans
 *  chapitre est un bug d'appelant, pas un cas à rattraper en fabriquant un deck.
 */
export function revisionSessionState(item: AgendaItemStudent): {
  deck: { chapter: number };
  label: string;
  subjectSlug?: string;
} | null {
  if (item.chapter_id === null) return null;
  return {
    deck: { chapter: item.chapter_id },
    label: item.label,
    subjectSlug: item.subject?.slug,
  };
}

/** Le plan servi PAR JOUR, regroupé PAR ÉCHÉANCE (ADR-0050 Décision 2 ter).
 *
 *  Le serveur sert les étapes sous les jours — c'est ce dont la bande a besoin pour son `✦`.
 *  Massimo, lui, lit un plan **sous le contrôle qu'il prépare** : sur une semaine à deux
 *  contrôles, une étape posée sous le jour flotterait sans dire de quel chapitre elle parle.
 *
 *  🔴 **Le tri est par `day_offset` DÉCROISSANT.** L'offset compte les jours **avant**
 *  l'échéance : le plus GRAND est le plus TÔT. Trier croissant présenterait le plan à l'envers —
 *  et rien ne le signalerait à l'écran, les trois étapes seraient bien là, dans le mauvais ordre.
 *
 *  `id` croissant départage deux étapes du même jour (cas d'un plan à 2 étapes sur 2 jours). */
export function groupPlanByItem(days: AgendaDay[]): Record<number, AgendaPlanStep[]> {
  const out: Record<number, AgendaPlanStep[]> = {};
  for (const day of days) {
    for (const step of day.plan_steps) (out[step.agenda_item_id] ??= []).push(step);
  }
  for (const steps of Object.values(out)) {
    steps.sort((a, b) => b.day_offset - a.day_offset || a.id - b.id);
  }
  return out;
}

/** Une étape qui tombe un jour donné, avec l'échéance qu'elle prépare. */
export interface DayPreparation {
  step: AgendaPlanStep;
  /** L'échéance visée — le **sujet** de l'étape (ADR-0050 Décision 2 ter), sans quoi la ligne
   *  flotte : « réviser ce chapitre » — lequel ? */
  item: AgendaItemStudent;
}

/** Ce qu'un jour PRÉPARE — l'autre question, celle que le `✦` de la bande porte vraiment.
 *
 *  🔴 **`groupPlanByItem` répond à « quel est le plan de cette échéance ? ». Ce n'est PAS la même
 *  question que « qu'est-ce qui tombe ce jour-là ? »**, et le panneau du jour ouvert répondait à
 *  la première en croyant répondre à la seconde — d'où un jour marqué `✦` qui s'ouvrait sur
 *  *« Rien de noté pour ce jour »* (relecture humaine du 2026-08-10).
 *
 *  ⚠️ **Le défaut était STRUCTUREL, pas anecdotique** : la Décision 3 répartit les étapes de
 *  demain à **la veille**, jamais le jour de l'échéance. Une étape ne tombe donc **jamais** sur
 *  le jour de ce qu'elle prépare, et un jour `✦` n'avait de contenu que s'il portait, par
 *  coïncidence, une échéance sans rapport.
 *
 *  Trié par échéance la plus proche : ce qui arrive en premier se prépare en premier. `id`
 *  départage deux étapes visant la même échéance. */
export function preparationsForDay(
  day: AgendaDay | undefined,
  items: AgendaItemStudent[],
): DayPreparation[] {
  if (!day) return [];
  const byId = new Map(items.map((item) => [item.id, item]));
  return day.plan_steps
    .flatMap((step) => {
      const item = byId.get(step.agenda_item_id);
      // Une étape dont l'échéance est hors de la fenêtre servie n'est pas rendue : la nommer
      // « pour ??? » serait pire que l'omettre. N'arrive pas sur la bande, dont les items sont
      // dérivés de la même fenêtre (`useAgenda`) — la garde couvre la dérive future.
      return item ? [{ step, item }] : [];
    })
    .sort((a, b) => a.item.due_on.localeCompare(b.item.due_on) || a.step.id - b.step.id);
}

/** Ce qu'une étape du plan propose, et où elle mène **vraiment**. */
export interface PlanStepTarget {
  icon: string;
  label: string;
  /** `null` ⇒ l'étape se rend **sans lien**, et sa coche reste : le plan ne disparaît pas faute
   *  de destination. Arrive sur une échéance sans matière, ou sans chapitre pour `revision`. */
  to: string | null;
  /** Passé tel quel à `<Link state>`. Seule `revision` en a besoin (le deck n'est pas dans l'URL). */
  state?: unknown;
}

/** Habillage et destination d'une étape du plan de préparation (ADR-0050 Décision 2 quater).
 *
 *  🔴 **Le libellé nomme sa destination ET son grain** — règle de l'`adr-0047`, appliquée ici
 *  parce qu'elle a été écrite pour exactement ce défaut. Deux activités sur trois **ne sont pas
 *  adressables par URL** dans ce dépôt :
 *
 *  | Étape | Grain atteignable | Route |
 *  |---|---|---|
 *  | `fiche` | la **matière** — `FichesPage` ne lit aucun `searchParams` | `/fiches/<slug>` |
 *  | `revision` | le **chapitre** ✅ — le deck de l'`adr-0049` | `/revision/session` + `state` |
 *  | `quiz` | la **matière** — `QuizPage` ne lit que `subject` | `/quiz?subject=<slug>` |
 *
 *  D'où *« Lire les fiches »* et non *« Lire la fiche »* : le **pluriel** dit qu'on ouvre une
 *  liste, là où le singulier promettrait une fiche précise. Idem *« Choisir un quiz »* — le verbe
 *  dit qu'il y aura un choix, donc que ZETIS n'en a pas désigné un.
 *
 *  ⚠️ **La matière n'est PAS dans le libellé, et c'est une MESURE, pas un goût.** La rédaction
 *  d'origine de la Décision 2 quater disait *« Lire les fiches de \<matière\> »* ; mesuré dans le
 *  DOM le 2026-08-10 : **193 px pour 151 disponibles** sur une carte de téléphone (202 px pour
 *  « Physique-Chimie »). Ce qui se coupait, c'était **le nom de la matière** — précisément
 *  l'information que le libellé avait été allongé pour porter. Et elle est déjà à l'écran, deux
 *  lignes plus haut, sur la ligne de puces de l'échéance.
 *
 *  🔴 **On ne fabrique aucune route.** `/fiches?fiche=<id>` et `/quiz?quiz=<id>` n'existent pas ;
 *  les écrire aurait produit deux liens qui déposent Massimo sur une page qui **ignore** son
 *  paramètre — et **aucun test de rendu ne l'aurait vu** : le lien existe, il est cliquable, il a
 *  l'air de marcher. `step.resource_id` reste donc **inutilisé** pour `fiche` et `quiz` : la
 *  donnée est juste, c'est la route qui manque.
 *
 *  ⚠️ Les destinations viennent de `subjectRouteFor` — LA table de routage du dépôt. En recopier
 *  les chemins ici aurait créé un second jeu de routes, qui aurait divergé au premier correctif.
 */
export function planStepTarget(step: AgendaPlanStep, item: AgendaItemStudent): PlanStepTarget {
  const subject = item.subject;
  switch (step.kind) {
    case "fiche":
      return {
        // 🗒️ et non 📖 : l'icône de `ACTION_UI.fiche`, et surtout PAS celle de `cours` — la puce
        // « 📖 lire le cours » est deux lignes plus haut, sur la même carte. La maquette du
        // cadrage portait 📖 ; elle n'avait pas la puce sous les yeux.
        icon: "🗒️",
        // PLURIEL — c'est lui qui porte le grain : « la fiche » promettrait une fiche précise.
        // La matière n'y est pas : mesurée à 193 px pour 151, elle se coupait (voir l'en-tête).
        label: "Lire les fiches",
        to: subject ? subjectRouteFor("fiche", subject.slug) : null,
        // Le NOM de la matière, comme `notionRouteFor` : l'URL n'a qu'un slug, et « Svt » serait
        // laid. Ce n'est pas de l'état de navigation — la page a un repli.
        state: subject ? { name: subject.name } : undefined,
      };
    case "revision": {
      // Même destination et même état que la porte de l'`adr-0049`, composés une seule fois.
      const state = revisionSessionState(item);
      return {
        icon: "🃏",
        // Le seul libellé qui garde le grain fin, parce que sa destination l'a vraiment.
        label: "Réviser ce chapitre",
        to: state === null ? null : "/revision/session",
        state: state ?? undefined,
      };
    }
    case "quiz":
      return {
        icon: "🎯",
        // « CHOISIR » — le verbe dit qu'il y aura une liste, donc que ZETIS n'a désigné aucun
        // quiz. « Petit quiz » (maquette du cadrage) laissait croire à un quiz préparé pour lui.
        label: "Choisir un quiz",
        to: subject ? subjectRouteFor("quiz", subject.slug) : null,
      };
  }
}

/** Le jour où tombe une étape — « mar. 11 ».
 *
 *  ⚠️ Le serveur sert un **offset**, pas une date : `day_offset` compte les jours **avant**
 *  l'échéance (`1` = la veille). La date se reconstruit donc ici, à partir de `due_on`.
 *
 *  ⚠️ `due_on` est un jour civil, pas un instant : il se parse en composants et se construit en
 *  **local**. Passer par `new Date("2026-08-14")` le lirait en UTC et décalerait d'un jour à
 *  l'ouest de Greenwich. */
export function planStepDayLabel(item: AgendaItemStudent, step: AgendaPlanStep): string {
  const [year, month, day] = item.due_on.split("-").map(Number);
  return shortDayLabel(isoDay(addDays(new Date(year, month - 1, day), -step.day_offset)));
}
