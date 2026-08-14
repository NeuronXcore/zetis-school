// La datation RELATIVE des fiches de Massimo (ADR-0054 §3).
//
// 🔴 **Relatif à l'écran, absolu sur le papier.** Une date absolue sur un écran d'enfant est de
// la métadonnée d'adulte ; une date relative sur une feuille imprimée ne veut plus rien dire le
// lendemain. Ce module ne sert QUE l'écran — l'export A5 et l'impression datent en absolu.
//
// ⚠️ **Ce qui est interdit ici, et pourquoi.** `CLAUDE.md` § gamification proscrit tout décompte
// de jours et toute pression anxiogène. La formulation est donc un SOUVENIR (« il y a 3 jours »),
// jamais une dette (« ça fait 3 jours que tu n'y as pas touché »), jamais une paire de dates
// (« créée le … · mise à jour le … » se lit comme un reproche sur une fiche ancienne).
//
// ⚠️ **Jours de CALENDRIER local, pas des tranches de 24 h.** Une fiche finie hier à 23 h doit
// dire « hier » quand on la regarde ce matin à 8 h — un calcul en millisecondes dirait « il y a
// 9 heures », donc « aujourd'hui ». Le projet s'est déjà fait prendre par cette confusion côté
// serveur (`datetime.now(timezone.utc).date()` contre le jour local).

/**
 * `13/08/2026` — la date ABSOLUE, réservée au PAPIER (export A5, impression).
 *
 * 🔴 Ne jamais l'employer à l'écran : une date absolue sur un écran d'enfant est de la
 * métadonnée d'adulte. Et symétriquement, `dateRelative` n'a rien à faire sur une feuille —
 * « il y a 3 jours » ne veut plus rien dire le lendemain, or une feuille survit à son impression.
 *
 * Rend `null` si la date manque ou est illisible : une fiche s'imprime alors sans date plutôt
 * qu'avec « Invalid Date » au bas de la page.
 */
export function dateAbsolue(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const jj = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${jj}/${mm}/${d.getFullYear()}`;
}

/** Minuit local du jour d'une date — la base du comptage en jours de calendrier. */
function minuitLocal(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

const JOUR_MS = 86_400_000;

/**
 * « il y a 3 jours », « hier », « aujourd'hui »… à partir d'un ISO 8601.
 *
 * Rend `null` si la date est absente ou illisible : l'appelant affiche alors son texte habituel,
 * sans date. Une fiche sans date lisible ne doit jamais devenir une fiche avec un message d'erreur.
 *
 * Une date dans le FUTUR (horloge décalée, fuseau) est traitée comme « aujourd'hui » plutôt que
 * de produire un « il y a -2 jours » qui n'a aucun sens pour un enfant.
 */
export function dateRelative(iso: string | null | undefined, maintenant = new Date()): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;

  const jours = Math.round((minuitLocal(maintenant) - minuitLocal(d)) / JOUR_MS);

  if (jours <= 0) return "aujourd'hui";
  if (jours === 1) return "hier";
  if (jours < 7) return `il y a ${jours} jours`;
  if (jours < 14) return "il y a une semaine";
  if (jours < 30) return `il y a ${Math.floor(jours / 7)} semaines`;
  if (jours < 60) return "il y a un mois";
  if (jours < 365) return `il y a ${Math.floor(jours / 30)} mois`;
  // Au-delà d'un an on cesse de compter : le nombre exact n'apprend plus rien et un grand
  // chiffre sur SA fiche se lirait comme un reproche.
  return "il y a plus d'un an";
}
