import { useCallback, useEffect, useMemo, useState } from "react";
import { type DiagnosticListItem, fetchDiagnostics } from "../lib/diagnostic";

/** Une matière et ses diagnostics non passés — zone B (ADR-0044 Décision 3). */
export interface GroupeMatiere {
  slug: string;
  nom: string;
  items: DiagnosticListItem[];
}

/** Pourquoi ZETIS propose CELUI-CI. Calculé à partir de `measured_at` **SEUL** : c'est ce qui
 *  garantit qu'aucun résultat de mesure ne peut fuir dans la formulation (ADR-0044 §Implémentation).
 *  Un « parce que tu as eu du mal ici » serait un diagnostic négatif montré à l'enfant. */
export type Raison = "jamais" | "ancienne";

/** Ordre de proposition : jamais mesuré d'abord, puis le plus anciennement mesuré.
 *
 *  🔴 Il regarde l'ÂGE d'une mesure, JAMAIS son résultat — un ordre de liste est une formulation,
 *  et trier par « la matière où il est le plus faible » dirait à un enfant où il est mauvais sans
 *  avoir à l'écrire (ADR-0044 Décision 2, alternative (a)).
 *
 *  ⚠️ Le départage par `quiz_id` décroissant n'est PAS un garde-fou théorique : en base réelle,
 *  deux diagnostics d'une même matière piochent dans le même vivier de notions et portent la même
 *  `measured_at` **à la microseconde** (constaté sur 4 des 15 diagnostics de dev). C'est donc lui
 *  qui décide de l'ordre la plupart du temps.
 */
export function trierParAgeDeMesure(items: DiagnosticListItem[]): DiagnosticListItem[] {
  return [...items].sort((a, b) => {
    if ((a.measured_at === null) !== (b.measured_at === null)) return a.measured_at === null ? -1 : 1;
    if (a.measured_at !== null && b.measured_at !== null && a.measured_at !== b.measured_at) {
      return a.measured_at < b.measured_at ? -1 : 1;
    }
    return b.quiz_id - a.quiz_id;
  });
}

export interface EtatDiagnostics {
  /** Ce que porte la carte du haut : la proposition de ZETIS, ou le choix de Massimo s'il en a
   *  fait un. `null` quand il n'y a rien à passer. */
  tete: DiagnosticListItem | null;
  raison: Raison | null;
  /** `true` quand la carte porte un choix de Massimo, `false` quand elle porte la proposition.
   *
   *  🔴 Ce drapeau n'est pas cosmétique : la carte doit CHANGER DE REGISTRE. La phrase de la
   *  proposition dit pourquoi ZETIS recommande celui-là ; la servir sur un diagnostic que Massimo
   *  a choisi ferait revendiquer à ZETIS une recommandation qu'il n'a pas faite — un petit
   *  mensonge, sur la seule page où il mesure. */
  estUnChoix: boolean;
  /** Promeut un diagnostic dans la carte, au lieu de le lancer depuis la zone B. */
  choisir: (quizId: number) => void;
  /** Rend la carte à la proposition de ZETIS. Les deux chemins restent réversibles. */
  revenirALaProposition: () => void;
  /** Le reste des non-passés, groupé par matière — zone B. La tête n'y figure pas. */
  groupes: GroupeMatiere[];
  /** Les passés — zone C, séparés du à-faire. */
  faits: DiagnosticListItem[];
  chargement: boolean;
  erreur: string | null;
  /** `true` quand tout est passé : la zone A devient une carte calme, jamais une page vide. */
  toutAJour: boolean;
  /** `true` quand Papa n'a encore rien laissé passer. */
  rienEncore: boolean;
  recharger: () => void;
}

/** Toute la logique de la page Diagnostic — le composant n'en porte aucune (`CLAUDE.md`). */
export function useDiagnostics(): EtatDiagnostics {
  const [items, setItems] = useState<DiagnosticListItem[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [choisiId, setChoisiId] = useState<number | null>(null);

  const recharger = useCallback(() => {
    setChargement(true);
    fetchDiagnostics()
      .then((rows) => {
        setItems(rows);
        setErreur(null);
      })
      // Message FIXE, détail en console : `e.message` vaut `Erreur 500` et s'affichait tel quel
      // sur la page, à côté des deux autres. `DiagnosticPage` est son unique appelante — cette
      // phrase-ci et les trois siennes forment une seule surface, elles se corrigent ensemble.
      .catch((e: unknown) => {
        console.warn("[diagnostic] chargement de la liste", e); // trace devtools (diagnostic)
        setErreur("La liste n'a pas voulu se charger. Réessaie dans un instant ✨");
      })
      .finally(() => setChargement(false));
  }, []);

  useEffect(recharger, [recharger]);

  const revenirALaProposition = useCallback(() => setChoisiId(null), []);

  return useMemo(() => {
    const aPasser = trierParAgeDeMesure(items.filter((d) => d.taken_at === null));
    const faits = items.filter((d) => d.taken_at !== null);
    const [propose] = aPasser;

    // Le choix de Massimo prend la place de la proposition dans la carte. Il ne s'y ajoute pas :
    // la carte porte UN diagnostic, c'est la Décision 1 et elle ne bouge pas.
    const choisi = choisiId === null ? null : (aPasser.find((d) => d.quiz_id === choisiId) ?? null);
    const tete = choisi ?? propose ?? null;

    // Tout le non-passé SAUF celui qui est dans la carte — donc la proposition de ZETIS
    // réapparaît en zone B dès que Massimo a choisi autre chose. La carte et la liste ne
    // montrent jamais le même diagnostic deux fois.
    const reste = aPasser.filter((d) => d.quiz_id !== tete?.quiz_id);

    // Regroupement côté client (ADR-0044 Décision 2, alternative (e)) : la règle est dérivable des
    // champs servis et ne cache rien, contrairement à l'élection serveur des missions qui protège
    // un scoring. Les matières héritent de l'ordre du tri — celles jamais mesurées d'abord.
    const parSlug = new Map<string, GroupeMatiere>();
    for (const d of reste) {
      const groupe = parSlug.get(d.subject_slug);
      if (groupe) groupe.items.push(d);
      else parSlug.set(d.subject_slug, { slug: d.subject_slug, nom: d.subject, items: [d] });
    }

    return {
      tete,
      raison: tete ? (tete.measured_at === null ? "jamais" : "ancienne") : null,
      estUnChoix: choisi !== null,
      choisir: setChoisiId,
      revenirALaProposition,
      groupes: [...parSlug.values()],
      faits,
      chargement,
      erreur,
      // ⚠️ Distinguer les deux vides : « tout est à jour » se félicite, « rien encore » nomme Papa.
      toutAJour: !chargement && items.length > 0 && aPasser.length === 0,
      rienEncore: !chargement && items.length === 0,
      recharger,
    };
  }, [items, chargement, erreur, recharger, choisiId, revenirALaProposition]);
}
