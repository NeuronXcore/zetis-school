import { useCallback, useMemo, useState } from "react";
import {
  type SkillsBackfillConfirmResult,
  type SkillsBackfillPreview,
} from "@zetis/types";
import { confirmSkillsBackfill, generateSkillsBackfill } from "../lib/curriculum";
import {
  addNotion,
  countNotions,
  type EditableGroup,
  findCrossGroupDuplicates,
  flattenNotions,
  removeNotion,
  setNotion,
} from "../lib/skillsBackfill";

// State machine du rattrapage « skills-only » (ADR-0010), extraite du composant pour
// garder la modale en présentation pure. Flux stateless :
//   level → generating → preview → confirming → done
// L'erreur est ORTHOGONALE : on revient à l'étape éditable précédente en conservant
// l'édition, et `retry()` rejoue la dernière action (génération OU confirmation).

/** Cycle 4 uniquement (le backend refuse hors cycle 4 par un 400 explicite). */
export const CYCLE4_LEVELS = ["5e", "4e", "3e"] as const;

/** Niveau antérieur par défaut = celui juste avant l'année active (5e pour une 4e). */
export function defaultPriorLevel(activeLevel: string): string | null {
  const i = CYCLE4_LEVELS.indexOf(activeLevel as (typeof CYCLE4_LEVELS)[number]);
  return i > 0 ? CYCLE4_LEVELS[i - 1] : null;
}

export type BackfillStatus =
  | "level"
  | "generating"
  | "preview"
  | "confirming"
  | "done";

/** Coordonnées de la notion en cours d'édition inline (renommage / ajout). */
export interface EditingCoords {
  gi: number;
  ni: number;
}

function messageOf(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

export function useSkillsBackfill({
  subjectId,
  activeLevel,
}: {
  subjectId: number;
  activeLevel: string;
}) {
  const [status, setStatus] = useState<BackfillStatus>("level");
  const [level, setLevel] = useState<string | null>(() => defaultPriorLevel(activeLevel));
  const [preview, setPreview] = useState<SkillsBackfillPreview | null>(null);
  const [groups, setGroups] = useState<EditableGroup[]>([]);
  const [result, setResult] = useState<SkillsBackfillConfirmResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Quelle action rejouer sur « Réessayer » (l'erreur est orthogonale au statut).
  const [errorAction, setErrorAction] = useState<"generate" | "confirm" | null>(null);
  const [editing, setEditing] = useState<EditingCoords | null>(null);
  const [draft, setDraft] = useState("");

  const busy = status === "generating" || status === "confirming";
  const total = useMemo(() => countNotions(groups), [groups]);
  const duplicates = useMemo(() => findCrossGroupDuplicates(groups), [groups]);
  // Une proposition existe et n'a pas encore été confirmée → fermer/régénérer la perd.
  const hasUnconfirmedProposal = preview !== null && result === null;

  const generate = useCallback(async () => {
    if (level === null || busy) return;
    setStatus("generating");
    setError(null);
    setErrorAction(null);
    setEditing(null);
    try {
      const data = await generateSkillsBackfill(subjectId, level);
      setPreview(data);
      setGroups(data.groups.map((g) => ({ ...g, notions: [...g.notions] })));
      setStatus("preview");
    } catch (e) {
      // 400 (hors cycle 4) / 503 (clé absente) / 502 : detail backend verbatim.
      setError(messageOf(e, "Génération impossible."));
      setErrorAction("generate");
      // Régénération échouée → on garde la proposition en cours ; sinon retour au choix.
      setStatus(preview !== null ? "preview" : "level");
    }
  }, [subjectId, level, busy, preview]);

  const confirm = useCallback(async () => {
    if (level === null || busy) return;
    setStatus("confirming");
    setError(null);
    setErrorAction(null);
    try {
      const res = await confirmSkillsBackfill(subjectId, level, flattenNotions(groups));
      setResult(res);
      setStatus("done");
    } catch (e) {
      setError(messageOf(e, "Confirmation impossible."));
      setErrorAction("confirm");
      setStatus("preview"); // l'édition en cours est conservée (ADR-0009 §7)
    }
  }, [subjectId, level, busy, groups]);

  const retry = useCallback(() => {
    if (errorAction === "generate") void generate();
    else if (errorAction === "confirm") void confirm();
  }, [errorAction, generate, confirm]);

  // --- Édition inline des notions (délègue aux helpers purs) --------------------

  const startEdit = useCallback((gi: number, ni: number, name: string) => {
    setEditing({ gi, ni });
    setDraft(name);
  }, []);

  const commitEdit = useCallback(
    (gi: number, ni: number) => {
      const name = draft.trim().replace(/\s+/g, " ");
      setGroups((gs) => (name ? setNotion(gs, gi, ni, name) : removeNotion(gs, gi, ni)));
      setEditing(null);
    },
    [draft],
  );

  const remove = useCallback((gi: number, ni: number) => {
    setGroups((gs) => removeNotion(gs, gi, ni));
    setEditing(null);
  }, []);

  const startAdd = useCallback((gi: number) => {
    // La nouvelle notion vide est ajoutée en fin de groupe puis immédiatement éditée.
    setGroups((gs) => {
      const next = addNotion(gs, gi, "");
      setEditing({ gi, ni: next[gi].notions.length - 1 });
      return next;
    });
    setDraft("");
  }, []);

  return {
    // état
    status,
    level,
    preview,
    groups,
    result,
    error,
    editing,
    draft,
    // dérivés
    busy,
    total,
    duplicates,
    hasUnconfirmedProposal,
    // actions
    setLevel,
    setDraft,
    generate,
    confirm,
    retry,
    startEdit,
    commitEdit,
    remove,
    startAdd,
  };
}
