// Client API du cadre temporel « Années scolaires » (Papa — ADR-0009 §9).
// Types partagés depuis @zetis/types (contrat unique front/back, règle CLAUDE.md n°8).
// Les matières de l'année active (chips) se lisent via `fetchActiveSchoolYear`
// (lib/curriculum.ts) — lecture existante du module curriculum, non dupliquée ici.
import {
  type SchoolYear,
  type SchoolYearCreateRequest,
  type SchoolYearPatchRequest,
} from "@zetis/types";
import { API_URL } from "./authClient";
import { asJson, authHeader, jsonHeaders } from "./httpClient";

export async function fetchSchoolYears(): Promise<SchoolYear[]> {
  return asJson(
    await fetch(`${API_URL}/api/school-years`, { headers: authHeader() }),
  );
}

/** Création en `draft` — l'activation est un geste séparé (une seule année active). */
export async function createSchoolYear(
  data: SchoolYearCreateRequest,
): Promise<SchoolYear> {
  return asJson(
    await fetch(`${API_URL}/api/school-years`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(data),
    }),
  );
}

/** Édition (libellé, dates, statut). `status: "active"` archive l'ancienne active
 *  côté backend, même transaction. `level` est immuable (422 si envoyé). */
export async function patchSchoolYear(
  yearId: number,
  data: SchoolYearPatchRequest,
): Promise<SchoolYear> {
  return asJson(
    await fetch(`${API_URL}/api/school-years/${yearId}`, {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify(data),
    }),
  );
}
