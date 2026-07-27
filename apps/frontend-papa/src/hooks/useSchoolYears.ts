import { useCallback, useEffect, useState } from "react";
import {
  type SchoolYear,
  type SchoolYearCreateRequest,
  type SchoolYearPatchRequest,
  type SchoolYearSubjectRef,
} from "@zetis/types";
import { fetchActiveSchoolYear } from "../lib/curriculum";
import { createSchoolYear, fetchSchoolYears, patchSchoolYear } from "../lib/schoolYears";

// Hook de données de la page Années scolaires (ADR-0009 §9) : cadre temporel.
// Toute la logique API + état vit ici ; la page reste présentationnelle.

export interface SchoolYearsData {
  /** Chargement initial ou re-fetch après mutation. */
  loading: boolean;
  /** Erreur de chargement de page — detail backend verbatim. */
  error: string | null;
  /** Erreur d'action (activation) — detail backend verbatim. */
  actionError: string | null;
  years: SchoolYear[];
  /** Année `active` (au plus une — règle backend), null sinon. */
  activeYear: SchoolYear | null;
  /** Années non actives (`draft`, `archived`), plus récente d'abord. */
  history: SchoolYear[];
  /** Matières de l'année active (chips lecture seule) — lecture curriculum existante,
   *  NON bloquante : null si indisponible (les chips sont juste absentes). */
  activeSubjects: SchoolYearSubjectRef[] | null;
  retry: () => void;
  /** Création (`draft`) — LÈVE en cas d'échec (le formulaire affiche l'erreur). */
  create: (data: SchoolYearCreateRequest) => Promise<void>;
  /** Édition inline (libellé, dates) — LÈVE en cas d'échec (formulaire). */
  update: (yearId: number, data: SchoolYearPatchRequest) => Promise<void>;
  /** Activation : l'ancienne active passe `archived` (règle backend, même transaction). */
  activate: (yearId: number) => Promise<void>;
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : "Erreur inattendue";
}

export function useSchoolYears(): SchoolYearsData {
  const [years, setYears] = useState<SchoolYear[]>([]);
  const [activeSubjects, setActiveSubjects] = useState<SchoolYearSubjectRef[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchSchoolYears();
      setYears(list);
      if (list.some((y) => y.status === "active")) {
        try {
          const active = await fetchActiveSchoolYear();
          setActiveSubjects(active.subjects);
        } catch {
          // Chips non bloquantes : la carte s'affiche sans matières.
          setActiveSubjects(null);
        }
      } else {
        setActiveSubjects(null);
      }
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = useCallback(
    async (data: SchoolYearCreateRequest) => {
      await createSchoolYear(data);
      await load();
    },
    [load],
  );

  const update = useCallback(
    async (yearId: number, data: SchoolYearPatchRequest) => {
      await patchSchoolYear(yearId, data);
      await load();
    },
    [load],
  );

  const activate = useCallback(
    async (yearId: number) => {
      setActionError(null);
      try {
        await patchSchoolYear(yearId, { status: "active" });
        await load();
      } catch (e) {
        setActionError(message(e));
      }
    },
    [load],
  );

  const activeYear = years.find((y) => y.status === "active") ?? null;
  const history = years.filter((y) => y.status !== "active");

  return {
    loading,
    error,
    actionError,
    years,
    activeYear,
    history,
    activeSubjects,
    retry: () => void load(),
    create,
    update,
    activate,
  };
}
