// Paliers d'autonomie de ZETIS (ADR-0032) — contrat de `GET/PUT /api/settings/autonomy`.
//
// ⚠️ Le front ne détient AUCUNE liste de paliers autorisés : `choices` vient du serveur, qui est
// seul à refuser. L'interface ne fait que rendre lisible ce qu'il refuse déjà — dupliquer la règle
// ici la ferait diverger au premier ADR.

/** 0 jamais · 1 ZETIS propose · 2 ZETIS produit, Papa valide · 3 ZETIS produit ET sert (veto). */
export type AutonomyLevel = 0 | 1 | 2 | 3;

/** Régime nommé, **DÉRIVÉ** des six valeurs par le serveur. `null` = « sur mesure ». */
export type AutonomyPreset = "manuel" | "semi" | "autonome";

export interface AutonomyClass {
  key: string;
  /** `A0a`, `A0b`, `A1`, `A2`, `A3`, `A4` — la matrice du §G.2. */
  code: string;
  label: string;
  value: AutonomyLevel;
  /** Les paliers offerts. Un seul choix ⇒ verrouillé ; ce qui n'y est pas est refusé (422). */
  choices: AutonomyLevel[];
  locked: boolean;
  /** Motif du verrou ou de la restriction. Présent dès que `choices` est réduit — un cadenas
   *  muet se lit comme une panne. */
  reason: string | null;
}

export interface Autonomy {
  classes: AutonomyClass[];
  preset: AutonomyPreset | null;
}
