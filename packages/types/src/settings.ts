// Paliers d'autonomie de ZETIS (ADR-0032) — contrat de `GET/PUT /api/settings/autonomy`.
//
// ⚠️ Le front ne détient AUCUNE liste de paliers autorisés : `choices` vient du serveur, qui est
// seul à refuser. L'interface ne fait que rendre lisible ce qu'il refuse déjà — dupliquer la règle
// ici la ferait diverger au premier ADR.

// ⚠️ **Deux mots, deux objets** (addendum ADR-0032 §8.0), et les confondre est l'erreur la plus
// facile de ce dossier :
//   • un **NIVEAU** est l'un des trois régimes — il se CHOISIT ;
//   • un **PALIER** est le degré 0-3 d'une classe — il se SUBIT.
// Un niveau décide les paliers de deux classes ; les quatre autres ne l'écoutent pas.

/** 0 jamais · 1 ZETIS propose · 2 ZETIS produit, Papa valide · 3 ZETIS produit ET sert (veto). */
export type AutonomyPalier = 0 | 1 | 2 | 3;

/** Régime nommé, **DÉRIVÉ** des six valeurs par le serveur. `null` = « sur mesure ». */
export type AutonomyNiveau = "manuel" | "semi" | "autonome";

export interface AutonomyClass {
  key: string;
  /** `A0a`, `A0b`, `A1`, `A2`, `A3`, `A4` — la matrice du §G.2. */
  code: string;
  label: string;
  value: AutonomyPalier;
  /** Les paliers offerts. Un seul choix ⇒ verrouillé ; ce qui n'y est pas est refusé (422). */
  choices: AutonomyPalier[];
  locked: boolean;
  /** Motif du verrou ou de la restriction. Présent dès que `choices` est réduit — un cadenas
   *  muet se lit comme une panne. */
  reason: string | null;
}

export interface Autonomy {
  classes: AutonomyClass[];
  /** ⚠️ Le champ garde le nom **`niveau`** alors que son type dit « niveau » : c'est la clé JSON
   *  que le serveur envoie (`settings/service.py`). Renommer ici casserait le contrat sans rien
   *  gagner — le TYPE porte le vocabulaire, le CHAMP porte le réseau. */
  niveau: AutonomyNiveau | null;
  /** ZETIS a-t-il le droit de **démarrer** un lot sans que personne clique ? (ADR-0035 §5)
   *
   *  ⚠️ **Séparé de `classes`, et ce n'est pas un détail de forme.** Deux questions, deux
   *  sources : le palier dit si ZETIS peut **servir** sans relecture, ceci dit s'il peut
   *  **démarrer** sans clic. Le mettre dans `classes` ferait qu'un préréglage l'armerait au
   *  passage, et rendrait impossible « ZETIS sert seul, mais il attend que je demande ».
   *
   *  Défaut : `false`. Papa l'arme explicitement. */
  auto_trigger_enabled: boolean;
}
