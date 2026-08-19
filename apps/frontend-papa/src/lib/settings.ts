// Client API des réglages Papa (ADR-0032). Routeur NEUTRE `/api/settings`, `require_parent`.
//
// ⚠️ Aucun catalogue de paliers ici. Le serveur envoie `choices` et `reason` par classe, et c'est
// lui qui refuse (422) : recopier la matrice du §G.2 côté front en ferait une seconde source de
// vérité, qui divergerait au premier ADR.
//
// ⚠️ Aucune fonction ne prend un « préréglage » : un régime est un raccourci d'ÉCRITURE qui se
// traduit en valeurs (`paliersPourNiveau`), jamais un état qu'on envoie. Le serveur le DÉRIVE en
// retour. Deux chemins d'écriture pour la même question, c'est ce que le §G.1 a refusé.
import {
  type Autonomy,
  type AutonomyPalier,
  type AutonomyNiveau,
  type Ecarts,
  type Machine,
  type TestMoteur,
} from "@zetis/types";
import { API_URL } from "./authClient";
import { asJson, authHeader, jsonHeaders } from "./httpClient";

const BASE = `${API_URL}/api/settings`;

/** Les six classes, leurs paliers, leurs verrous, et le régime dérivé. */
export async function fetchAutonomy(): Promise<Autonomy> {
  return asJson(await fetch(`${BASE}/autonomy`, { headers: authHeader() }));
}

/** Écriture partielle : on n'envoie que ce qui change. 422 motivé sur toute valeur refusée.
 *
 *  ⚠️ `autoTrigger` voyage dans SON PROPRE CHAMP, jamais dans `values` (ADR-0035 §5) : le serveur
 *  rejette toute clé hors des six paliers, et le déclencheur n'en est pas un. `undefined` = ne pas
 *  y toucher — enregistrer un préréglage ne doit à aucun moment armer ZETIS au passage. */
export async function saveAutonomy(
  values: Record<string, AutonomyPalier>,
  autoTrigger?: boolean,
): Promise<Autonomy> {
  return asJson(
    await fetch(`${BASE}/autonomy`, {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify(
        autoTrigger === undefined
          ? { values }
          : { values, auto_trigger_enabled: autoTrigger },
      ),
    }),
  );
}

/** Libellé d'un palier, du point de vue de Papa — « qui laisse passer », jamais un numéro. */
export const PALIER_LABEL: Record<AutonomyPalier, string> = {
  0: "Jamais",
  1: "ZETIS propose",
  2: "Vous validez",
  3: "ZETIS sert",
};

/** Les noms des trois régimes, à l'écran.
 *
 *  ⚠️ Décision du 2026-08-04 : ce sont les mots des AVATARS qui font foi, pas la traduction
 *  française des ADR (« Manuel · Semi-autonome · Autonome »). Le régime a un visage avant d'avoir
 *  un mot, et un écran qui nomme autrement ce que l'image montre oblige à traduire mentalement.
 *
 *  ⚠️ Les CLÉS, elles, ne bougent pas : `manuel | semi | autonome` viennent du serveur
 *  (`settings/service.py`) et sont l'identité du régime. Renommer l'affichage n'est pas renommer
 *  la donnée — c'est ici, et seulement ici, que les deux se croisent. */
export const NIVEAU_LABEL: Record<AutonomyNiveau, string> = {
  manuel: "Manual",
  semi: "Hybrid",
  autonome: "Autonom",
};

export const NIVEAU_ICON: Record<AutonomyNiveau, string> = {
  manuel: "🔒",
  semi: "⚖️",
  autonome: "🚀",
};

export const NIVEAU_DESCRIPTION: Record<AutonomyNiveau, string> = {
  manuel:
    "ZETIS produit, vous validez tout avant que Massimo le voie — fiches et cartes mentales comprises.",
  semi: "ZETIS sert les dérivés seul. Les cours passent toujours par vous.",
  autonome:
    "ZETIS rédige et sert y compris les cours. Vous pouvez retirer, tant que Massimo n'a pas ouvert.",
};

/** L'ordre d'affichage des régimes : du plus de contrôle au moins. */
export const NIVEAUX: AutonomyNiveau[] = ["manuel", "semi", "autonome"];

/** Les classes qu'un régime écrit — les verrouillées n'y sont jamais, sous peine d'en faire une
 *  porte dérobée sur une décision figée. Miroir de `NIVEAUX` côté serveur (`settings/service.py`),
 *  et le serveur refuse de toute façon ce qui sortirait des `choices`. */
const PALIERS_PAR_NIVEAU: Record<AutonomyNiveau, Record<string, AutonomyPalier>> = {
  manuel: { zetis_autonomy_a0a_derives: 2, zetis_autonomy_a1_course: 2 },
  semi: { zetis_autonomy_a0a_derives: 3, zetis_autonomy_a1_course: 2 },
  autonome: { zetis_autonomy_a0a_derives: 3, zetis_autonomy_a1_course: 3 },
};

export function paliersPourNiveau(niveau: AutonomyNiveau): Record<string, AutonomyPalier> {
  return { ...PALIERS_PAR_NIVEAU[niveau] };
}

/** Un régime est indisponible dès qu'une des valeurs qu'il écrirait est hors `choices`.
 *
 * Dérivé, jamais codé en dur : le jour où le veto obtient sa surface, le serveur rouvre le palier
 * 3 d'A1 et *Autonome* redevient offert **sans qu'une ligne du front change**. */
export function niveauDisponible(
  autonomy: Autonomy,
  niveau: AutonomyNiveau,
): { available: boolean; reason: string | null } {
  const levels = paliersPourNiveau(niveau);
  for (const cls of autonomy.classes) {
    const wanted = levels[cls.key];
    if (wanted !== undefined && !cls.choices.includes(wanted)) {
      return { available: false, reason: cls.reason };
    }
  }
  return { available: true, reason: null };
}

/** La clé du cours — la seule dont la montée retire un contrôle humain, donc la seule qui
 *  demande une confirmation explicite. */
export const A1_COURSE_KEY = "zetis_autonomy_a1_course";
export const SERVE: AutonomyPalier = 3;

/** « Le régime ou le déclencheur vient de changer » (addendum ADR-0032 §7.4).
 *
 *  Émis par le PANNEAU après une écriture RÉUSSIE, écouté par le bloc d'état de la sidebar via
 *  `useAutonomyState`. Jamais émis sur un refus : un 422 ne change rien, et faire relire la
 *  sidebar serait un appel de plus sans fait de plus.
 *
 *  ⚠️ L'événement est NU, il ne porte pas la réponse fraîche que le panneau tient pourtant déjà.
 *  La passer en `detail` économiserait un GET, mais ouvrirait DEUX chemins d'écriture dans l'état
 *  du hook — l'un par le réseau, l'autre par une variable locale d'un composant — pour une seule
 *  question. C'est exactement ce que le §2 de l'ADR-0032 a refusé en interdisant de stocker un
 *  mode à côté des six clés. Le coût est un GET par clic sur « Enregistrer », jamais sur horloge.
 *
 *  Il vit ici et non dans un fichier d'événements dédié : une seule lib l'alimente (patron de
 *  `MISSIONS_PENDING_EVENT`) ; `demandesEvents.ts` n'existe que parce que DEUX libs y convergent. */
export const AUTONOMY_CHANGED_EVENT = "zetis:autonomy-changed";

export function notifyAutonomyChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(AUTONOMY_CHANGED_EVENT));
}

/** Les clés `app_settings` qui portent une ligne — « ce que j'ai changé » (ADR-0062 §4).
 *
 *  ⚠️ Le front ne compare RIEN à un défaut : c'est la table qui répond, parce qu'elle est bâtie
 *  pour ça. Recalculer ici « est-ce que la valeur diffère du défaut ? » demanderait au front de
 *  connaître les défauts du serveur — une seconde source de vérité pour une question déjà
 *  tranchée par la forme de la donnée.
 */
export async function fetchEcarts(): Promise<Ecarts> {
  return asJson(await fetch(`${BASE}/ecarts`, { headers: authHeader() }));
}

/** 🧠 L'instantané de la machine — un seul appel (ADR-0062 §2).
 *
 *  ⚠️ **Aucun sondage ne l'appelle.** Une page de réglages qui se rafraîchit toute seule ferait
 *  bouger un champ sous les doigts : cette lecture se fait au montage, et sur un bouton explicite.
 */
export async function fetchMachine(): Promise<Machine> {
  return asJson(await fetch(`${BASE}/machine`, { headers: authHeader() }));
}

/** Vérifier, plutôt que déclarer : un vrai prompt, une vraie latence. Ne persiste rien. */
export async function testMoteur(): Promise<TestMoteur> {
  return asJson(await fetch(`${BASE}/machine/test`, { method: "POST", headers: jsonHeaders() }));
}

/** « J'ai vu. » Un échec reste affiché jusqu'ici, et ne revient plus (ADR-0041 §8).
 *
 *  ⚠️ **On RÉUTILISE la route de l'activité de production**, on n'en crée pas une seconde : le
 *  geste existe depuis l'ADR-0041, il est serveur (`ai_jobs.acknowledged_at`), et deux routes pour
 *  un même acquittement finiraient par en acquitter deux choses différentes. */
export async function acquitterEchec(jobId: number): Promise<void> {
  const res = await fetch(`${API_URL}/api/production/activity/job/${jobId}/ack`, {
    method: "POST",
    headers: jsonHeaders(),
  });
  if (!res.ok) throw new Error(`Erreur ${res.status}`);
}
