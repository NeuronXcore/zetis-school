// État de la page « Couverture de production » — logique hors composants (règle CLAUDE.md).
//
// Ne déclenche AUCUNE génération de lui-même : `generate` n'est appelé que par un clic explicite
// sur une cellule `absent`. Rien sur cette page ne se produit automatiquement, jamais.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type ContentRequest,
  type ContentRequestStatus,
  type Coverage,
  type CoverageCellKey,
  type ProductionOrphan,
} from "@zetis/types";
import {
  fetchCoverage,
  fetchOrphans,
  generateForCell,
  regenerateForCell,
} from "../lib/production";
import { fetchContentRequests, setContentRequestStatus } from "../lib/contentRequests";
import { generateSkillCards } from "../lib/srsCards";
import { validateAllLessons } from "../lib/curriculum";

export interface GeneratingCell {
  lessonId: number;
  key: CoverageCellKey;
}

export function useCoverage(subjectId: number | null) {
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [orphans, setOrphans] = useState<ProductionOrphan[]>([]);
  // Demandes de contenu de Massimo (addendum ADR-0027) — chargées EN PLUS de la matrice, fusionnées
  // par `skill_id` côté client (`coverage.py` non touché : invariant lecture seule préservé).
  const [requests, setRequests] = useState<ContentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState<GeneratingCell | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [next, orphanRows, requestRows] = await Promise.all([
        fetchCoverage(subjectId),
        fetchOrphans(),
        fetchContentRequests("pending"),
      ]);
      setCoverage(next);
      setOrphans(orphanRows);
      setRequests(requestRows);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Chargement de la couverture échoué");
    } finally {
      setLoading(false);
    }
  }, [subjectId]);

  /** Demandes en attente indexées par `skill_id` — le badge Couverture fusionne dessus. */
  const requestsBySkill = useMemo(() => {
    const map = new Map<number, ContentRequest[]>();
    for (const req of requests) {
      const list = map.get(req.skill_id);
      if (list) list.push(req);
      else map.set(req.skill_id, [req]);
    }
    return map;
  }, [requests]);

  /** Triage d'une demande (Fait/Ignorer) — mutation OPTIMISTE (retire la ligne) puis confirme.
   * Passe par le module `content_requests`, JAMAIS par `production` (invariant read-only). */
  const setRequestStatus = useCallback(async (id: number, status: ContentRequestStatus) => {
    setRequests((current) => current.filter((req) => req.id !== id));
    try {
      await setContentRequestStatus(id, status);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Triage de la demande échoué");
      await reload(); // échec → on rétablit l'état réel
    }
  }, [reload]);

  useEffect(() => {
    setLoading(true);
    void reload();
  }, [reload]);

  /** Génère l'objet d'une cellule `absent`, puis recharge la matrice. Un seul à la fois : la
   * génération est locale (Ollama), les paralléliser ne ferait que les ralentir toutes. */
  const generate = useCallback(
    async (key: CoverageCellKey, lessonId: number) => {
      if (generating) return;
      setGenerating({ lessonId, key });
      setError(null);
      try {
        await generateForCell(key, lessonId);
        await reload();
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : "Génération échouée");
      } finally {
        setGenerating(null);
      }
    },
    [generating, reload],
  );

  /** Régénère un objet PÉRIMÉ (cellule `stale`). Distinct de `generate` : les endpoints de
   * génération créent une nouvelle ligne, seuls les endpoints de régénération écrasent. */
  const regenerate = useCallback(
    async (key: CoverageCellKey, objectId: number) => {
      if (generating) return;
      setGenerating({ lessonId: objectId, key });
      setError(null);
      try {
        await regenerateForCell(key, objectId);
        await reload();
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : "Régénération échouée");
      } finally {
        setGenerating(null);
      }
    },
    [generating, reload],
  );

  /** Cartes de révision d'UNE notion. Mécanique (recto/verso extraits du cours), donc
   * lançable d'un clic — contrairement à la capsule, qui exige une instruction de Papa. */
  const [generatingSkillId, setGeneratingSkillId] = useState<number | null>(null);
  const generateCards = useCallback(
    async (skillId: number) => {
      if (generatingSkillId !== null) return;
      setGeneratingSkillId(skillId);
      setError(null);
      try {
        await generateSkillCards(skillId);
        await reload();
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : "Génération des cartes échouée");
      } finally {
        setGeneratingSkillId(null);
      }
    },
    [generatingSkillId, reload],
  );

  /** Valide d'un coup les leçons en brouillon d'un chapitre.
   *
   * Ce n'est PAS de la production de contenu : rien n'est généré, on lève seulement le gate
   * qui bloque la ligne. La provenance `parent_bulk` est écrite côté serveur et devient
   * visible dans la colonne Cours — Papa approuve sans avoir tout ouvert, et ça se voit. */
  const [validatingChapterId, setValidatingChapterId] = useState<number | null>(null);
  /** Ce que le dernier lot a SAUTÉ — un constat, jamais une erreur : le geste a réussi pour le
   *  reste. Distinct de `error`, qui porte les échecs, et rendu dans un ton neutre. */
  const [skippedNotice, setSkippedNotice] = useState<string | null>(null);
  const validateChapterLessons = useCallback(
    async (chapterId: number) => {
      if (validatingChapterId !== null) return;
      setValidatingChapterId(chapterId);
      setError(null);
      setSkippedNotice(null);
      try {
        const res = await validateAllLessons(chapterId);
        // 🔴 **Le lot saute les cours VIDES, et il faut le DIRE** (2026-08-11). Valider une leçon
        // sans contenu donnait à Massimo une page blanche que le gate de l'ADR-0011 laissait
        // passer — 50 leçons `validated` sur 88 étaient dans ce cas. Le serveur les saute
        // désormais ; sans ce message, Papa cliquerait, verrait la ligne inchangée, et n'aurait
        // **aucun moyen de savoir pourquoi**. Un manque silencieux se lit comme une panne.
        // `?? 0` : le champ est optionnel au contrat (les lots de CHAPITRES ne le portent pas).
        const n = res.skipped_empty_count ?? 0;
        if (n > 0) {
          setSkippedNotice(
            `${n} leçon${n > 1 ? "s" : ""} non validée${n > 1 ? "s" : ""} : ` +
              `son cours est vide. Il faut le rédiger avant — valider ne donnerait rien à lire.`,
          );
        }
        await reload();
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : "Validation en lot échouée");
      } finally {
        setValidatingChapterId(null);
      }
    },
    [validatingChapterId, reload],
  );

  return {
    coverage,
    orphans,
    requestsBySkill,
    setRequestStatus,
    loading,
    error,
    generating,
    generatingSkillId,
    generate,
    regenerate,
    generateCards,
    validatingChapterId,
    validateChapterLessons,
    skippedNotice,
    reload,
  };
}
