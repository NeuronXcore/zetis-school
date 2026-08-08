import type { DiagnosticContentState, DiagnosticPalier } from "@zetis/types";

// Vocabulaire de la page Diagnostic — celui du PRODUIT, pas un vocabulaire de page.
//
// 🔴 **Le palier se LIT dans la charge utile, il ne se recalcule pas.** La page d'avant recevait
// `status` et l'ignorait : elle recoloriait depuis le score avec ses propres bornes (70/40), ce qui
// faisait disparaître le palier le plus haut. Un 95 % et un 72 % s'affichaient identiques.
//
// ⚠️ Ni « fragile », ni « solide » : ces mots n'existent pas dans les libellés Papa (CLAUDE.md
// §Règles pédagogiques). Le serveur, lui, parle `mastered|solid|learning|weak` — c'est ici, et ici
// seulement, que la traduction se fait.

export const PALIER_LABEL: Record<DiagnosticPalier, string> = {
  mastered: "acquise",
  solid: "en cours",
  // `learning` et `weak` partagent un libellé : la spec ne distingue que trois paliers mesurés
  // (`acquise` ≥ 90, `en cours` ≥ 70, `à renforcer` en dessous). Le quatrième mot du vocabulaire,
  // « non abordée », désigne une notion JAMAIS mesurée — elle n'apparaît donc pas dans le panneau
  // d'une passation, qui ne liste que du mesuré.
  learning: "à renforcer",
  weak: "à renforcer",
};

/** Teintes de palier. **Aucune n'est rouge** : la page décrit une mesure, pas une faute — le rouge
 *  reste banni des deux interfaces (adr-0024, adr-0028 §6). */
export const PALIER_TON: Record<DiagnosticPalier, string> = {
  mastered: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  solid: "border-papa-accent/40 bg-papa-accent/10 text-papa-accent",
  learning: "border-papa-warn/40 bg-papa-warn/10 text-papa-warn",
  weak: "border-papa-warn/40 bg-papa-warn/10 text-papa-warn",
};

export function palierLabel(status: string): string {
  return PALIER_LABEL[status as DiagnosticPalier] ?? status;
}

export function palierTon(status: string): string {
  return PALIER_TON[status as DiagnosticPalier] ?? "border-papa-border text-papa-muted";
}

// ── Les quatre badges de lacune ─────────────────────────────────────────────────
//
// 🔴 **`aucune leçon` et `cours en brouillon` ne se confondent PAS**, et c'est l'adr-0042 qui les a
// séparés. Sans leçon, le quiz s'ancre sur la notion : la lacune est **réparable**, Papa produit.
// Avec une leçon en brouillon, la voie notion **refuse** — dernier recours réservé aux notions sans
// leçon — et Papa doit valider le cours. Un badge unique rendrait les deux indistinguables alors
// que le geste diffère.

export interface BadgeLacune {
  label: string;
  ton: string;
  /** L'action que ce badge commande. `null` = rien à produire, on ouvre simplement la lacune. */
  geste: string;
}

export function badgeLacune(status: string, contentState: DiagnosticContentState): BadgeLacune {
  if (status === "resolved") {
    return {
      label: "résolue",
      ton: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
      geste: "Voir la lacune",
    };
  }
  if (status === "in_progress") {
    return {
      label: "remédiation en cours",
      ton: "border-papa-accent/40 bg-papa-accent/10 text-papa-accent",
      geste: "Voir la lacune",
    };
  }
  if (contentState === "aucune_lecon") {
    return {
      label: "aucune leçon",
      ton: "border-papa-accent-2/40 bg-papa-accent-2/10 text-papa-accent-2",
      geste: "Produire le quiz de cette notion",
    };
  }
  if (contentState === "cours_brouillon") {
    return {
      label: "cours en brouillon",
      ton: "border-papa-warn/40 bg-papa-warn/10 text-papa-warn",
      geste: "Valider le cours de cette leçon",
    };
  }
  return {
    label: "ouverte",
    ton: "border-papa-border bg-papa-surface-2 text-papa-muted",
    geste: "Voir la lacune",
  };
}

/** Le texte qui accompagne une carte de lacune — il dit POURQUOI le geste diffère. */
export function motifLacune(status: string, contentState: DiagnosticContentState): string {
  if (status === "resolved") {
    return "Refermée. La notion garde son palier : une lacune résolue ne remonte pas la maîtrise, et un bon score ne referme pas une lacune — les deux populations restent disjointes.";
  }
  if (status === "in_progress") {
    return "Une mission de remédiation est en cours sur cette notion.";
  }
  if (contentState === "aucune_lecon") {
    return "Aucune leçon ne porte cette notion. Depuis l'adr-0042, ZETIS peut lui produire un quiz ancré sur la notion — à condition qu'une source validée de la matière la documente.";
  }
  if (contentState === "cours_brouillon") {
    return "Une leçon porte cette notion, mais son cours est en brouillon. Le quiz ancré sur la notion ne s'ouvre PAS dans ce cas — c'est un dernier recours réservé aux notions sans leçon. Il faut valider le cours.";
  }
  return "Le cours existe et il est validé : le parcours de remédiation est complet.";
}
