// Client API de la page Papa « Couverture de production » (ADR-0023).
// LECTURE SEULE : ce module ne crée aucun endpoint. Les générations passent par les clients
// EXISTANTS de chaque module (fiche, mindmap, quiz, cours) — cf. `generateForCell` plus bas.
import { type Coverage, type CoverageCellKey, type ProductionOrphan } from "@zetis/types";
import { API_URL } from "./authClient";
import { asJson, authHeader } from "./httpClient";
import { generateFiche, regenerateFiche } from "./fiches";
import { generateMindmap, regenerateMindmap } from "./mindmaps";
import { generateQuiz, regenerateQuiz } from "./quizPilotage";
import { generateLessonContent } from "./curriculum";

const API = `${API_URL}/api/production`;

/** Matrice matière → chapitre → leçon. `subjectId` absent → toutes les matières de l'année. */
export async function fetchCoverage(subjectId?: number | null): Promise<Coverage> {
  const query = subjectId ? `?subject_id=${subjectId}` : "";
  return asJson(await fetch(`${API}/coverage${query}`, { headers: authHeader() }));
}

/** Dérivés dont la leçon a été archivée. Lecture seule : rien n'est supprimé ni réattaché. */
export async function fetchOrphans(): Promise<ProductionOrphan[]> {
  return asJson(await fetch(`${API}/orphans`, { headers: authHeader() }));
}

/** Durées estimées des générations locales, par type — alimentent la barre de progression. */
export const GENERATION_MS: Record<CoverageCellKey, number> = {
  cours: 45000,
  quiz: 30000,
  fiche: 32000,
  mindmap: 30000,
};

export const GENERATION_LABEL: Record<CoverageCellKey, string> = {
  cours: "Rédaction du cours…",
  quiz: "Génération du quiz…",
  fiche: "Génération de la fiche…",
  mindmap: "Génération de la carte mentale…",
};

/** Adaptateur : une cellule `absent` → l'appel de génération du module correspondant.
 *
 * Les quatre endpoints ne partagent ni chemin ni corps (le quiz prend un `count`, le cours
 * n'en prend aucun) : on adapte, on ne réinvente pas les appels. Aucun endpoint créé ici. */
export async function generateForCell(key: CoverageCellKey, lessonId: number): Promise<void> {
  if (key === "cours") {
    await generateLessonContent(lessonId);
    return;
  }
  if (key === "fiche") {
    await generateFiche(lessonId);
    return;
  }
  if (key === "mindmap") {
    await generateMindmap(lessonId);
    return;
  }
  // `count` et `difficulty` sont des vocabulaires fermés côté backend (5|8, 1|2|3) : on prend
  // le format court et la difficulté médiane, comme le fait la page Quiz par défaut.
  await generateQuiz(lessonId, { count: 5, difficulty: 2 });
}

/** Régénère l'objet d'une cellule périmée. `objectId` est l'id du DÉRIVÉ, pas de la leçon.
 *
 * Surtout ne pas réutiliser `generateForCell` ici : les endpoints `generate` CRÉENT une
 * nouvelle ligne (ils n'écrasent pas), on obtiendrait un doublon silencieux au lieu d'une mise
 * à jour. Le cours fait exception — sa « régénération » EST `generate-content`, qui écrase le
 * `content_markdown` de la leçon et la repasse en `draft`. */
export async function regenerateForCell(
  key: CoverageCellKey,
  objectId: number,
): Promise<void> {
  if (key === "cours") {
    await generateLessonContent(objectId);
    return;
  }
  if (key === "fiche") {
    await regenerateFiche(objectId);
    return;
  }
  if (key === "mindmap") {
    await regenerateMindmap(objectId);
    return;
  }
  await regenerateQuiz(objectId);
}
