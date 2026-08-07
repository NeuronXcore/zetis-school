// Client API du référentiel de programme (Papa, Slice B — ADR-0009).
// Types partagés depuis @zetis/types (contrat unique front/back, règle CLAUDE.md n°8).
import {
  type ActiveSchoolYear,
  type BatchValidationResult,
  type ChapterManualCreateRequest,
  type ChapterPatchRequest,
  type CurriculumChapter,
  type CurriculumLesson,
  type LessonManualCreateRequest,
  type LessonPatchRequest,
  type SkillsBackfillConfirmResult,
  type SkillsBackfillNotion,
  type SkillsBackfillPreview,
} from "@zetis/types";
import { API_URL } from "./authClient";
import { asJson, authHeader, jsonHeaders } from "./httpClient";
import { lancerEtSuivre, type SuiviTravail } from "./travaux";

export async function fetchActiveSchoolYear(): Promise<ActiveSchoolYear> {
  return asJson(
    await fetch(`${API_URL}/api/school-years/active/subjects`, { headers: authHeader() }),
  );
}

export interface OrphanNotion {
  skill_id: number;
  name: string;
  /** Niveau de la notion (« 5e », « 4e »…), ou null. Rendu depuis l'ADR-0042 : les notions de
   *  RATTRAPAGE (niveau antérieur) apparaissent désormais ici, et sans leur niveau elles se
   *  liraient comme un trou dans le programme de l'année en cours. */
  level: string | null;
}

/** Notions du référentiel d'une matière SANS leçon rattachée — ajoutées via « Rattrapage » ou le
 *  pont « Ajouter au programme », donc invisibles dans l'arbre leçon-centré.
 *  ⚠️ Depuis l'ADR-0042, TOUS les niveaux remontent (plus seulement celui de l'année active) :
 *  les notions de rattrapage étaient ciblées par les missions et visibles nulle part. */
export async function fetchOrphanNotions(subjectId: number): Promise<OrphanNotion[]> {
  const body = await asJson<{ notions: OrphanNotion[] }>(
    await fetch(`${API_URL}/api/subjects/${subjectId}/orphan-notions`, { headers: authHeader() }),
  );
  return body.notions;
}

/** Supprime une notion orpheline ajoutée par erreur. 409 si rattachée à une leçon ou avec historique
 *  (Massimo l'a déjà travaillée) — jamais d'effacement d'un travail existant. */
export async function deleteOrphanNotion(skillId: number): Promise<void> {
  const res = await fetch(`${API_URL}/api/skills/${skillId}`, {
    method: "DELETE",
    headers: authHeader(),
  });
  if (!res.ok) await asJson(res); // remonte le `detail` (409) en message d'erreur
}

export async function fetchChapters(sysId: number): Promise<CurriculumChapter[]> {
  return asJson(
    await fetch(`${API_URL}/api/school-year-subjects/${sysId}/chapters`, {
      headers: authHeader(),
    }),
  );
}

/** Passe 1 (appel cloud synchrone ~10-30 s) : remplace les générés non validés. */
export async function generateChapters(
  sysId: number,
  onEtat?: SuiviTravail,
): Promise<CurriculumChapter[]> {
  // 202 + sondage (ADR-0041 §4). ⚠️ Le `503` « clé cloud absente » et le `404` restent
  // SYNCHRONES : la file diffère le travail, jamais le verdict sur la demande.
  await lancerEtSuivre<{ chapter_ids: number[] }>(
    `${API_URL}/api/school-year-subjects/${sysId}/generate-chapters`,
    { method: "POST", headers: authHeader() },
    onEtat,
  );
  return fetchChapters(sysId);
}

export async function createManualChapter(
  sysId: number,
  data: ChapterManualCreateRequest,
): Promise<CurriculumChapter> {
  return asJson(
    await fetch(`${API_URL}/api/school-year-subjects/${sysId}/chapters`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(data),
    }),
  );
}

export async function patchChapter(
  chapterId: number,
  data: ChapterPatchRequest,
): Promise<CurriculumChapter> {
  return asJson(
    await fetch(`${API_URL}/api/chapters/${chapterId}`, {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify(data),
    }),
  );
}

export async function deleteChapter(chapterId: number): Promise<void> {
  const res = await fetch(`${API_URL}/api/chapters/${chapterId}`, {
    method: "DELETE",
    headers: authHeader(),
  });
  if (!res.ok) {
    let detail = `Erreur ${res.status}`;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      // réponse non-JSON : message générique
    }
    throw new Error(detail);
  }
}

/** Lot matière : valide tous les `pending` de la matière (les `rejected` restent). */
export async function validateAllChapters(sysId: number): Promise<BatchValidationResult> {
  return asJson(
    await fetch(`${API_URL}/api/school-year-subjects/${sysId}/chapters/validate-all`, {
      method: "POST",
      headers: authHeader(),
    }),
  );
}

/** Lot année : valide tous les `pending` de l'année active, toutes matières. */
export async function validateAllActiveYear(): Promise<BatchValidationResult> {
  return asJson(
    await fetch(`${API_URL}/api/school-years/active/chapters/validate-all`, {
      method: "POST",
      headers: authHeader(),
    }),
  );
}

export async function reorderChapters(
  sysId: number,
  chapterIds: number[],
): Promise<CurriculumChapter[]> {
  return asJson(
    await fetch(`${API_URL}/api/school-year-subjects/${sysId}/chapters/reorder`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ chapter_ids: chapterIds }),
    }),
  );
}

// ---------------------------------------------------------------------------
// Leçons d'un chapitre (Lot 2 Slice B) — chemins : curriculum/router.py.
// ---------------------------------------------------------------------------

export async function fetchLessons(chapterId: number): Promise<CurriculumLesson[]> {
  return asJson(
    await fetch(`${API_URL}/api/chapters/${chapterId}/lessons`, { headers: authHeader() }),
  );
}

/** Passe 2 (appel cloud synchrone ~10-30 s) : 409 si le chapitre n'est ni validé ni
 *  manuel. Renvoie la liste complète des leçons du chapitre après génération. */
export async function generateLessons(
  chapterId: number,
  onEtat?: SuiviTravail,
): Promise<CurriculumLesson[]> {
  // 202 + sondage (ADR-0041 §4). ⚠️ Le `409` (chapitre ni validé ni manuel) reste SYNCHRONE.
  await lancerEtSuivre<{ lesson_ids: number[] }>(
    `${API_URL}/api/chapters/${chapterId}/generate-lessons`,
    { method: "POST", headers: authHeader() },
    onEtat,
  );
  return fetchLessons(chapterId);
}

/** Extension (appel cloud synchrone ~10-30 s) : complète la liste SANS rien supprimer
 *  (brouillons inclus) — l'existant est injecté dans le prompt, doublons écartés.
 *  Mêmes préconditions que la passe 2 (409 sinon). Renvoie la liste complète. */
export async function extendLessons(
  chapterId: number,
  onEtat?: SuiviTravail,
): Promise<CurriculumLesson[]> {
  await lancerEtSuivre<{ lesson_ids: number[] }>(
    `${API_URL}/api/chapters/${chapterId}/extend-lessons`,
    { method: "POST", headers: authHeader() },
    onEtat,
  );
  return fetchLessons(chapterId);
}

export async function createManualLesson(
  chapterId: number,
  data: LessonManualCreateRequest,
): Promise<CurriculumLesson> {
  return asJson(
    await fetch(`${API_URL}/api/chapters/${chapterId}/lessons`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(data),
    }),
  );
}

export async function patchLesson(
  lessonId: number,
  data: LessonPatchRequest,
): Promise<CurriculumLesson> {
  return asJson(
    await fetch(`${API_URL}/api/lessons/${lessonId}`, {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify(data),
    }),
  );
}

/** `draft` → `validated` (409 sinon — le backend est la source de la règle). */
export async function validateLesson(lessonId: number): Promise<CurriculumLesson> {
  return asJson(
    await fetch(`${API_URL}/api/lessons/${lessonId}/validate`, {
      method: "POST",
      headers: authHeader(),
    }),
  );
}

/** `draft` → `archived` : la leçon sort du flux (pas de statut `rejected` côté leçons). */
export async function rejectLesson(lessonId: number): Promise<CurriculumLesson> {
  return asJson(
    await fetch(`${API_URL}/api/lessons/${lessonId}/reject`, {
      method: "POST",
      headers: authHeader(),
    }),
  );
}

export async function deleteLesson(lessonId: number): Promise<void> {
  const res = await fetch(`${API_URL}/api/lessons/${lessonId}`, {
    method: "DELETE",
    headers: authHeader(),
  });
  if (!res.ok) {
    let detail = `Erreur ${res.status}`;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      // réponse non-JSON : message générique
    }
    throw new Error(detail);
  }
}

/** Rédaction du cours (moteur LOCAL ollama) : renvoie la leçon mise à jour.
 *
 *  🔴 **C'est LA route du §9.** Sa durée était annoncée par cinq constantes différentes selon
 *  l'écran d'où Papa cliquait — 45 s, 42 s, 50 s, 50 s, 22 s. Il n'y en a plus aucune : le serveur
 *  dit ce qu'il mesure (`estimated_ms`), et cette fonction le transmet via `onEtat`.
 *
 *  202 + sondage (ADR-0041 §4). ⚠️ Le `409` (leçon archivée) et le `404` restent SYNCHRONES :
 *  la file diffère le travail, jamais le verdict sur la demande. */
export async function generateLessonContent(
  lessonId: number,
  onEtat?: SuiviTravail,
): Promise<CurriculumLesson> {
  const sortie = await lancerEtSuivre<{ lesson_id: number }>(
    `${API_URL}/api/lessons/${lessonId}/generate-content`,
    { method: "POST", headers: authHeader() },
    onEtat,
  );
  return fetchLesson(sortie.lesson_id);
}

/** La leçon par son id — sert à rendre l'objet une fois la rédaction finie. */
export async function fetchLesson(lessonId: number): Promise<CurriculumLesson> {
  return asJson(
    await fetch(`${API_URL}/api/lessons/${lessonId}`, { headers: authHeader() }),
  );
}

/** Liste ordonnée COMPLÈTE des ids du chapitre — `archived` incluses (le backend vérifie). */
export async function reorderLessons(
  chapterId: number,
  lessonIds: number[],
): Promise<CurriculumLesson[]> {
  return asJson(
    await fetch(`${API_URL}/api/chapters/${chapterId}/lessons/reorder`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ lesson_ids: lessonIds }),
    }),
  );
}

// ---------------------------------------------------------------------------
// Rattrapage « skills-only » pour un niveau antérieur (ADR-0010).
// Flux stateless : generate (prévisualisation en mémoire, rien de persisté) → confirm.
// ---------------------------------------------------------------------------

/** Passe 1+2 EN MÉMOIRE (appel cloud, ~1-3 min) : rien de persisté, renvoie les notions
 *  groupées par chapitre d'échafaudage + `failed_scaffolds`. 400 si niveau hors cycle 4,
 *  503 sans clé cloud. */
export async function generateSkillsBackfill(
  subjectId: number,
  level: string,
  onEtat?: SuiviTravail,
): Promise<SkillsBackfillPreview> {
  // 202 + sondage (ADR-0041 §4). ⚠️ **Ce travail ne persiste RIEN** (ADR-0010) : sa
  // prévisualisation EST sa sortie — il n'y a aucun id à relire, contrairement aux autres.
  return lancerEtSuivre<SkillsBackfillPreview>(
    `${API_URL}/api/curriculum/skills-backfill/generate`,
    {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ subject_id: subjectId, level }),
    },
    onEtat,
  );
}

/** Upsert des notions revues en `Skill` au niveau cible (aucune leçon ni liaison créée) —
 *  pas d'appel LLM. Idempotent : renvoie `{ created, existing }`. */
export async function confirmSkillsBackfill(
  subjectId: number,
  level: string,
  notions: SkillsBackfillNotion[],
): Promise<SkillsBackfillConfirmResult> {
  return asJson(
    await fetch(`${API_URL}/api/curriculum/skills-backfill/confirm`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ subject_id: subjectId, level, notions }),
    }),
  );
}

/** Valide en lot les leçons `draft` d'un chapitre (provenance `parent_bulk`, addendum §F.3). */
export async function validateAllLessons(chapterId: number): Promise<BatchValidationResult> {
  return asJson(
    await fetch(`${API_URL}/api/chapters/${chapterId}/lessons/validate-all`, {
      method: "POST",
      headers: authHeader(),
    }),
  );
}
