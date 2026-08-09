import { useCallback, useEffect, useMemo, useState } from "react";
import type { OpenGap } from "@zetis/types";
import { fetchOpenGaps } from "../lib/activity";
import { generateRemediation, generateRevision, notifyPendingChanged } from "../lib/missionsPilotage";

// État de la page Lacunes — patron maison à trois couches (référence : `useCouncilClass`).
//
// La page est la surface de DÉCISION vers laquelle le dashboard renvoie. Elle ne compose rien
// elle-même : elle appelle les deux générateurs existants et relit la liste.
//
// ⚠️ **Le filtre par matière (ADR-0038 §4) est appliqué ICI, jamais dans la page.** La page dérive
// trois sections de `gaps`/`pending` ; filtrer chez elle voudrait dire filtrer trois fois, et
// oublier une seule des trois ferait un compteur qui contredit sa propre liste. Un seul point de
// filtrage rend l'oubli impossible.
//
// ⚠️ **Aucune requête au changement de filtre** : le filtre s'applique à la liste DÉJÀ chargée.
// `fetchOpenGaps` ne prend aucun paramètre et ne doit pas en prendre — le volume est celui d'un
// seul enfant, et le dépôt vient d'écrire que filtrer ne doit rien coûter.

/** Les filtres d'ORIGINE et de CONTENU (adr-0045), portés par les renvois des jauges du Diagnostic.
 *
 *  🔴 **Ils ne partagent PAS le repli du filtre par matière.** Celui-ci retombe sur « toutes » quand
 *  le slug ne correspond à rien, pour qu'une faute de frappe ne rende pas une page vide. Ici le
 *  repli serait exactement le défaut qu'on corrige : un renvoi annonçant 4 lacunes qui en montre 10.
 *  **Un filtre d'origine qui ne trouve rien montre RIEN, et le dit.** */
export interface LacunesFiltres {
  /** `Gap.source` — `diagnostic`, `mission`… */
  source?: string | null;
  /** `absent` = les lacunes sans contenu produisible (`content_state !== "ok"`). */
  contenu?: string | null;
}

export interface UseLacunes {
  loading: boolean;
  error: string | null;
  /** Le jeu FILTRÉ — ce que la page affiche. */
  gaps: OpenGap[];
  /** Le jeu COMPLET, avant tout filtre. Sert à construire le sélecteur de matières : le dériver
   *  de `gaps` réduirait la liste à la matière déjà choisie, et on ne pourrait plus en sortir. */
  allGaps: OpenGap[];
  /** Lacunes qu'aucune mission active ne couvre, sur le jeu filtré : celles qui attendent un geste. */
  pending: OpenGap[];
  /** Les mêmes, sur TOUT — c'est la portée réelle des deux générateurs, qui ignorent le filtre.
   *  Sans ce champ, un bouton annoncerait 3 missions et en créerait 7. */
  allPending: OpenGap[];
  /** La matière effectivement filtrée, `null` si aucune ou si le slug ne correspond à rien. */
  activeSubject: { slug: string; name: string } | null;
  /** Les filtres d'origine/contenu réellement appliqués — pour que la page DISE ce qu'elle montre.
   *  Un filtre qui retire des lignes sans l'annoncer est une troncature, pas un filtre. */
  activeFiltres: { source: string | null; contenu: string | null };
  busy: null | "remediation" | "revision";
  /** Message de résultat de la dernière génération (« 2 missions créées »). */
  result: string | null;
  reload: () => void;
  createRemediation: () => Promise<void>;
  createRevision: () => Promise<void>;
}

export function useLacunes(
  subjectSlug?: string | null,
  filtres: LacunesFiltres = {},
): UseLacunes {
  const source = filtres.source ?? null;
  const contenu = filtres.contenu ?? null;
  const [gaps, setGaps] = useState<OpenGap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "remediation" | "revision">(null);
  const [result, setResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setGaps(await fetchOpenGaps());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Les notions à renforcer n'ont pas pu être chargées.");
      setGaps([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = useCallback(
    async (kind: "remediation" | "revision") => {
      setBusy(kind);
      setError(null);
      setResult(null);
      try {
        const { created } =
          kind === "remediation" ? await generateRemediation() : await generateRevision();
        setResult(
          created === 0
            ? "Aucune mission à créer : tout ce qui pouvait l'être l'est déjà."
            : `${created} mission${created > 1 ? "s" : ""} créée${created > 1 ? "s" : ""}, en attente de ta validation.`,
        );
        // La sidebar tient un compteur « à valider » : sans ce signal il mentirait jusqu'au
        // prochain rechargement complet.
        notifyPendingChanged();
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "La génération a échoué.");
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  // Le filtre ne s'applique QUE s'il correspond à au moins une lacune servie. Sinon : repli sur
  // « toutes », jamais une page vide.
  //
  // ⚠️ Ce repli confond volontairement deux cas — un slug inconnu, et une matière réelle sans
  // aucune lacune. On ne peut PAS les distinguer sans une seconde source (la liste des matières),
  // et la charger contredirait le « zéro requête » de l'ADR-0038 §4. Le prix de la confusion est
  // faible (on voit tout au lieu de « rien à renforcer en SVT ») ; celui d'une page vide sur une
  // faute de frappe serait un écran qui ment.
  const activeSubject = useMemo(() => {
    if (!subjectSlug) return null;
    const match = gaps.find((gap) => gap.subject_slug === subjectSlug);
    return match ? { slug: subjectSlug, name: match.subject_name ?? subjectSlug } : null;
  }, [gaps, subjectSlug]);

  // 🔴 **Les filtres d'origine et de contenu sont STRICTS — aucun repli.** Le filtre par matière
  // retombe sur « toutes » quand il ne trouve rien, et c'est justifié plus haut. Ici le même repli
  // serait le défaut que l'`adr-0045` corrige : le renvoi « dont 4 sans contenu → » afficherait
  // 10 lacunes, et le nombre cliquable mènerait à un autre nombre. Rien à montrer se montre.
  const visible = useMemo(() => {
    let jeu = activeSubject
      ? gaps.filter((gap) => gap.subject_slug === activeSubject.slug)
      : gaps;
    if (source) jeu = jeu.filter((gap) => gap.source === source);
    // `absent` : tout ce qui n'est pas produisible en l'état — ni leçon, ou cours en brouillon.
    // Un booléen serait plus court et confondrait les deux, que l'ADR-0042 sépare exprès.
    if (contenu === "absent") jeu = jeu.filter((gap) => (gap.content_state ?? "ok") !== "ok");
    return jeu;
  }, [gaps, activeSubject, source, contenu]);

  const activeFiltres = useMemo(() => ({ source, contenu }), [source, contenu]);

  return {
    loading,
    error,
    gaps: visible,
    allGaps: gaps,
    pending: visible.filter((gap) => !gap.has_active_mission),
    allPending: gaps.filter((gap) => !gap.has_active_mission),
    activeSubject,
    activeFiltres,
    busy,
    result,
    reload: () => void load(),
    createRemediation: () => run("remediation"),
    createRevision: () => run("revision"),
  };
}
