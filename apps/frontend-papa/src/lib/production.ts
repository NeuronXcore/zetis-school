// Client API de la page Papa « Couverture de production ».
//
// La matrice reste en LECTURE SEULE (ADR-0023) : `fetchCoverage` / `fetchOrphans` n'écrivent
// rien, et les générations pièce à pièce passent par les clients EXISTANTS de chaque module
// (fiche, mindmap, quiz, cours) — cf. `generateForCell` plus bas.
//
// ⚠️ La production EN LOT (ADR-0031) fait exception, et elle est isolée exprès : elle appelle un
// routeur d'écriture DISTINCT (`/api/production/runs`), jamais celui de la Couverture. L'en-tête
// disait « ce module ne crée aucun endpoint » jusqu'au 2026-08-02 ; le laisser tel quel en
// branchant le bouton en aurait fait un commentaire faux — exactement la dette que le lot de
// corrections vient de solder.
import {
  type ActiveProductionRun,
  type Coverage,
  type CoverageCellKey,
  type ProductionOrphan,
  type ProductionPreview,
  type ProductionRun,
  type ProductionActivity,
} from "@zetis/types";
import { API_URL } from "./authClient";
import { signalerEnfilement } from "./productionSignal";
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

// ⚠️ **`GENERATION_MS` a été SUPPRIMÉE ici** (ADR-0041 §9, 2026-08-06), avec `SCOPE_MS`,
// `KIT_MS_PER_NOTION` et `WORK_ESTIMATION_MS`. Les durées ne vivent plus dans le frontend : le
// serveur les MESURE (`GET /api/production/estimations`, `estimated_ms` sur chaque travail), parce
// qu'il a l'historique de ce que chaque travail a réellement duré et que l'écran ne l'a pas.
// Ne pas en réintroduire une : le test-cliquet `estimation-unique.test.ts` rougit.

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

// --- Production en lot (ADR-0031) --------------------------------------------------------------

/** Ce qu'un lot ferait sur ce chapitre, sans rien créer. */
export async function previewChapterProduction(chapterId: number): Promise<ProductionPreview> {
  return asJson(
    await fetch(`${API}/runs/preview?chapter_id=${chapterId}`, { headers: authHeader() }),
  );
}

/** Lance un lot : 202, le worker le prendra. Lève sur 409 (arriéré de relecture au plafond). */
export async function startChapterProduction(chapterId: number): Promise<ProductionRun> {
  const run = await asJson<ProductionRun>(
    await fetch(`${API}/runs?chapter_id=${chapterId}`, {
      method: "POST",
      headers: authHeader(),
    }),
  );
  // ⚠️ APRÈS le succès, jamais avant : `asJson` lève sur un 409 (arriéré au plafond), et réveiller
  // la barre pour un lot qui n'a pas été créé lui ferait chercher un travail inexistant.
  signalerEnfilement();
  return run;
}

// --- Lots-PIÈCE : ce qu'on affiche pendant qu'ils tournent (ADR-0036 §2) ------------------------
//
// ⚠️ Ces tables sont indexées par **PIÈCE** (`scope_kind` du lot : `srs`), jamais par type de
// demande (`card`). C'est délibéré : le lot porte déjà son `scope_kind`, donc aucune surface n'a
// besoin de traduire `card → srs` côté client. La traduction vit UNE fois, côté serveur
// (`REQUEST_KIND_TO_PIECE`), et la recopier ici l'aurait dédoublée pour rien.

/** Ce que ZETIS est en train de faire. */
export const SCOPE_LABEL: Record<string, string> = {
  cours: GENERATION_LABEL.cours,
  fiche: GENERATION_LABEL.fiche,
  mindmap: GENERATION_LABEL.mindmap,
  quiz: GENERATION_LABEL.quiz,
  srs: "Génération des cartes de révision…",
};

/** Ce que le lot produit, au singulier — pour l'indicateur d'en-tête.
 *
 *  ⚠️ L'en-tête annonçait « ZETIS produit un chapitre » quel que soit le lot. Faux depuis qu'un
 *  lot peut viser une pièce, et constaté à l'écran le 2026-08-03. */
export const SCOPE_NOUN: Record<string, string> = {
  cours: "un cours",
  fiche: "une fiche",
  mindmap: "une carte mentale",
  quiz: "un quiz",
  srs: "des cartes de révision",
};

/** Produit la pièce qu'une demande de Massimo réclame — sur un clic de Papa (ADR-0036 §6).
 *
 *  ⚠️ On envoie l'**id de la demande**, pas `(skill_id, kind)`. La traduction du vocabulaire
 *  (`card` → `srs`) et le refus des types non productibles (`capsule`) vivent côté serveur, en un
 *  seul endroit. Les recopier ici les ferait diverger au premier générateur ajouté.
 *
 *  202 : le lot est accepté, pas exécuté. L'indicateur d'en-tête suit la suite. */
export async function produceForRequest(requestId: number): Promise<ProductionRun> {
  const run = await asJson<ProductionRun>(
    await fetch(`${API}/runs/from-request?request_id=${requestId}`, {
      method: "POST",
      headers: authHeader(),
    }),
  );
  signalerEnfilement();
  return run;
}

/** État d'un lot — pour le suivi pendant l'exécution. */
export async function fetchProductionRun(runId: number): Promise<ProductionRun> {
  return asJson(await fetch(`${API}/runs/${runId}`, { headers: authHeader() }));
}

/** Le lot en cours, ou `null`. Alimente l'indicateur d'en-tête.
 *
 *  ⚠️ Un PROCESSUS, jamais un stock. Cet indicateur ne doit à aucun moment devenir un compteur
 *  d'arriéré : « 12 contenus non contrôlés » en permanence dans le header est exactement ce que
 *  l'addendum ADR-0011 §F.2 interdit — la provenance est un fait, jamais un reproche. Il dit
 *  « ça travaille », pas « vous êtes en retard ». */
export async function fetchActiveProductionRun(): Promise<ActiveProductionRun | null> {
  return asJson(await fetch(`${API}/runs/active`, { headers: authHeader() }));
}

// --- L'activité (ADR-0041) : la source UNIQUE de toutes les barres ------------------------------

/** Tout ce que ZETIS fabrique en ce moment — lots ET travaux unitaires, tous déclencheurs. */
export async function fetchProductionActivity(): Promise<ProductionActivity> {
  return asJson(await fetch(`${API}/activity`, { headers: authHeader() }));
}

/** « J'ai vu. » Un échec reste affiché jusqu'ici — serveur, donc il ne revient sur aucun appareil. */
export async function acknowledgeActivity(kind: "run" | "job", id: number): Promise<void> {
  const r = await fetch(`${API}/activity/${kind}/${id}/ack`, {
    method: "POST",
    headers: authHeader(),
  });
  if (!r.ok) throw new Error("Acquittement impossible");
}
