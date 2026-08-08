import type { DiagnosticApercu, DiagnosticRailEntry, DiagnosticSubjectRef } from "@zetis/types";

// Les focus du bandeau instrument (adr-0045, Décisions 1 à 3).
//
// 🔴 **Un focus est un filtre NOMMÉ, jamais une troncature.** Il dit ce qu'il montre et comment en
// sortir. C'est la règle déjà écrite ailleurs dans le dépôt — *si une surface borne ce qu'elle
// montre, elle doit dire ce qu'elle laisse dehors* — et c'est ce qui distingue un focus d'une coupe
// silencieuse, qui ferait croire à une couverture complète.
//
// ⚠️ **La quatrième jauge n'a PAS de focus, et c'est une décision.** Elle vaut zéro par décision
// (station ③, `EMITTED_TRIGGERS` sans `evidence`) : lui en donner un ferait chercher une population
// qui n'existe pas, puis demander l'ouverture d'un déclencheur écarté en connaissance de cause.
//
// Ce module est PUR et sans React : c'est sur lui que portent les sabotages des verrous.

// ⚠️ `a-relire` ne figure pas nommément dans la Décision 1 — le `BACKLOG` n'avait relevé que deux
// populations invisibles, `a_relire` valant zéro en dev au moment du constat. Il est ajouté par
// COHÉRENCE : il annonce une population, elle est dans le rail (cran « généré »), et le laisser
// inerte à côté de deux pastilles cliquables contredirait la règle qu'on est en train de poser.
export type DiagnosticFocus = "non-mesurees" | "a-relire" | "proposes" | "jamais-generees";

/** Les matières dont ZETIS ne sait **rien** — aucune tentative complétée, quel que soit l'état du
 *  quiz.
 *
 *  🔴 **Dérivée du RAIL, jamais de `jauges.matieres_mesurees`.** C'est ce qui garantit que le focus
 *  et la jauge comptent la même population : deux sources pour un même fait sont une divergence en
 *  attente, et c'est précisément une divergence de ce genre que la Décision 7 répare.
 *
 *  ⚠️ **Elle contient TROIS familles, et la troisième est celle qu'on oublie :**
 *    1. les matières jamais générées ;
 *    2. celles dont le diagnostic attend la relecture de Papa ;
 *    3. **celles dont le diagnostic est proposé et jamais passé** — générée ✅, mesurée ❌.
 *
 *  Sans la troisième, `matieres_total − matieres_mesurees` ne retombe pas sur ce que la page montre,
 *  et le lecteur qui fait la soustraction trouve un écart. C'est le défaut d'origine. */
export function matieresNonMesurees(apercu: DiagnosticApercu): Set<number> {
  const mesurees = new Set(
    apercu.rail.filter((entree) => entree.cran === "passe").map((entree) => entree.subject_id),
  );
  return new Set(
    apercu.subjects.filter((matiere) => !mesurees.has(matiere.id)).map((matiere) => matiere.id),
  );
}

/** Le rail que le focus laisse passer. `null` = aucun focus, tout passe. */
export function filtrerRail(
  entrees: DiagnosticRailEntry[],
  focus: DiagnosticFocus | null,
  nonMesurees: Set<number>,
): DiagnosticRailEntry[] {
  switch (focus) {
    case null:
      return entrees;
    case "proposes":
      return entrees.filter((entree) => entree.cran === "propose");
    case "a-relire":
      return entrees.filter((entree) => entree.cran === "genere");
    case "non-mesurees":
      return entrees.filter((entree) => nonMesurees.has(entree.subject_id));
    case "jamais-generees":
      // La population n'est pas DANS le rail, elle est SOUS lui : aucune ligne, et le bloc reste.
      return [];
  }
}

/** Le bloc « Jamais généré » **fait partie du rail** — il n'est pas un encart indépendant, et il
 *  subit donc les mêmes filtres.
 *
 *  ⚠️ C'est une correction du read-before-code de la Session A : la page le passait BRUT là où le
 *  rail était filtré, donc filtrer sur une matière montrait quand même les cinq autres. */
export function filtrerJamaisGenere(
  matieres: DiagnosticSubjectRef[],
  focus: DiagnosticFocus | null,
  subjectId: number | null,
): DiagnosticSubjectRef[] {
  // Une matière jamais générée n'a par définition ni « proposé » ni « à relire » : ces deux focus
  // l'excluent en bloc. Les deux autres la gardent — elle EST leur population.
  if (focus === "proposes" || focus === "a-relire") return [];
  return matieres.filter((matiere) => subjectId === null || matiere.id === subjectId);
}

/** La phrase du bandeau de focus.
 *
 *  🔴 **Le nombre vient de ce qui est RÉELLEMENT affiché**, jamais d'une jauge. Un focus qui
 *  annoncerait un compte différent de ses propres lignes serait le défaut d'origine reproduit un
 *  cran plus loin — un nombre qui dit autre chose que ce qu'il montre. */
export function libelleFocus(focus: DiagnosticFocus, compte: number): string {
  const s = compte > 1 ? "s" : "";
  switch (focus) {
    case "non-mesurees":
      return `${compte} matière${s} dont ZETIS ne sait rien`;
    case "a-relire":
      return `${compte} diagnostic${s} qui attend${compte > 1 ? "ent" : ""} ta relecture`;
    case "proposes":
      return `${compte} diagnostic${s} en attente chez Massimo`;
    case "jamais-generees":
      return `${compte} matière${s} jamais générée${s}`;
  }
}

/** Combien de MATIÈRES un focus met en avant — le rail compte des diagnostics, pas des matières,
 *  et deux lignes peuvent porter la même. Sur `proposes`, c'est bien le nombre de diagnostics qui
 *  fait sens : c'est la population que la jauge annonce. */
export function compteFocus(
  focus: DiagnosticFocus,
  entrees: DiagnosticRailEntry[],
  jamaisGenere: DiagnosticSubjectRef[],
): number {
  if (focus === "proposes" || focus === "a-relire") return entrees.length;
  const matieres = new Set<number>(entrees.map((entree) => entree.subject_id));
  for (const matiere of jamaisGenere) matieres.add(matiere.id);
  return matieres.size;
}
