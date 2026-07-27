/**
 * Contrats API du référentiel de programme — Lots 1 et 2 Slice A (ADR-0009).
 * Miroir des schémas Pydantic `app/modules/curriculum/schemas.py` (règle CLAUDE.md n°8).
 * Consommés par la page Papa « Programme » (chapitres : étape 14 ; accordéon
 * leçons/notions : Slice B du Lot 2, étape 16).
 */

/** generated = passe 1 IA (validation Papa requise) · manual = écrit par Papa. */
export type ChapterSource = "generated" | "manual";

/** Statut de validation du référentiel — distinct de `status` (progression temporelle). */
export type ChapterValidationStatus = "pending" | "validated" | "rejected";

/** Progression temporelle du chapitre dans l'année (inchangée par l'ADR-0009). */
export type ChapterProgressStatus = "planned" | "active" | "completed" | "skipped";

/** Répartition par classe : conforme aux repères annuels 2019, ou interprétation indicative. */
export type ChapterRepartition = "officielle" | "interpretee";

/** Réponse des endpoints chapitres du référentiel (`/api/school-year-subjects/.../chapters`). */
export interface CurriculumChapter {
  id: number;
  school_year_subject_id: number | null;
  /** Texte humain librement éditable par Papa — jamais de métadonnées sérialisées (13-bis). */
  name: string;
  description: string | null;
  period: string | null;
  status: ChapterProgressStatus;
  sort_order: number;
  source: ChapterSource;
  validation_status: ChapterValidationStatus;
  /** Version déclarative du programme (ex. "2020"), null pour les chapitres manuels. */
  program_version: string | null;
  /** Métadonnées dépliées côté API (stockage `metadata_json` invisible du frontend). */
  themes: string[] | null;
  suggested_class: string | null;
  repartition: ChapterRepartition | null;
}

/** `POST /api/school-year-subjects/{id}/chapters` — création manuelle (validée d'office).
 *  Métadonnées optionnelles : omises → champs null en réponse. */
export interface ChapterManualCreateRequest {
  name: string;
  description?: string | null;
  period?: string | null;
  themes?: string[] | null;
  suggested_class?: string | null;
  repartition?: ChapterRepartition | null;
}

/** `PATCH /api/chapters/{id}` — édition partielle + action de validation optionnelle. */
export interface ChapterPatchRequest {
  name?: string;
  description?: string | null;
  period?: string | null;
  validation_action?: "validate" | "reject";
}

/** `POST /api/school-year-subjects/{id}/chapters/reorder` — liste ordonnée complète. */
export interface ChapterReorderRequest {
  chapter_ids: number[];
}

/** Réponse des endpoints `POST .../validate-all` (lot matière ou année). */
export interface BatchValidationResult {
  validated_count: number;
}

/** `status` d'une leçon ≈ validation (ADR-0009 §3) : draft = à valider, archived = rejetée. */
export type LessonStatus = "draft" | "validated" | "archived";

/** `created_by` d'une leçon ≈ source : parent = manuelle (validée d'office), ai = passe 2. */
export type LessonCreatedBy = "parent" | "ai" | "imported";

/** Auteur d'un write du COURS (`content`) : ai = rédaction locale, parent = édition Papa. */
export type LessonContentAuthor = "ai" | "parent";

/** Notion dépliée d'une leçon (intitulé + `skill_id`) — jamais la table de liaison brute. */
export interface LessonNotion {
  skill_id: number;
  name: string;
}

/** Réponse des endpoints leçons (`/api/chapters/{id}/lessons`, `/api/lessons/{id}`). */
export interface CurriculumLesson {
  id: number;
  chapter_id: number;
  title: string;
  summary: string | null;
  /** Cours complet (markdown), rempli par `POST /lessons/{id}/generate-content`
   *  (moteur local) — null tant que Papa n'a pas demandé la rédaction. */
  content: string | null;
  status: LessonStatus;
  created_by: LessonCreatedBy;
  sort_order: number;
  /** Version déclarative du programme (ex. "2020"), null pour les leçons manuelles. */
  program_version: string | null;
  /** Provenance du COURS (≠ ligne leçon) : `created_*` posés au premier write,
   *  `updated_*` à chaque write ; null tant qu'aucun cours n'existe (dates ISO). */
  content_created_at: string | null;
  content_created_by: LessonContentAuthor | null;
  content_updated_at: string | null;
  content_updated_by: LessonContentAuthor | null;
  notions: LessonNotion[];
}

/** `POST /api/chapters/{id}/lessons` — création manuelle (validée d'office).
 *  Chaque notion upserte une `Skill` (dédup par nom normalisé). */
export interface LessonManualCreateRequest {
  title: string;
  summary?: string | null;
  notions?: string[];
}

/** `PATCH /api/lessons/{id}` — édition partielle ; `notions` fournie = remplace le
 *  rattachement (les `Skill` ne sont jamais supprimées). Validation via les endpoints
 *  dédiés `POST /api/lessons/{id}/validate` et `.../reject` (draft uniquement). */
export interface LessonPatchRequest {
  title?: string;
  summary?: string | null;
  notions?: string[];
  /** Écriture/édition MANUELLE du cours (markdown, provenance 'parent') ;
   *  absent = cours intact. Le statut de la leçon ne bouge pas. */
  content?: string;
}

/** `POST /api/chapters/{id}/lessons/reorder` — liste ordonnée complète. */
export interface LessonReorderRequest {
  lesson_ids: number[];
}

/** Contrats ÉLÈVE (page Cours de Massimo, lecture seule) : le serveur ne sert QUE du
 *  validé (ADR-0009 §9) et jamais les champs d'atelier (source, statut, actions). */
export interface StudentLessonRef {
  id: number;
  title: string;
  summary: string | null;
  /** Le markdown ne voyage jamais dans la liste : lecture via `/lessons/{id}/cours`. */
  has_content: boolean;
}

export interface StudentChapter {
  id: number;
  name: string;
  description: string | null;
  lessons: StudentLessonRef[];
}

/** `GET /api/student/cours/{subject_slug}` — chapitres validés de l'année active. */
export interface StudentCours {
  subject_id: number;
  subject_name: string;
  subject_slug: string;
  level: string;
  chapters: StudentChapter[];
}

/** `GET /api/student/lessons/{id}/cours` — 404 si non validée ou sans cours. */
export interface StudentLessonContent {
  id: number;
  title: string;
  summary: string | null;
  content: string;
}

/** Decks de notions validées (ELI5 v2) : entrée par matière, lecture seule. Route
 *  NEUTRE (pas de préfixe `/eli5/`) — d'autres dérivés la consommeront. */
export interface NotionSummarySubject {
  slug: string;
  name: string;
  /** Notions (`Skill`) distinctes atteignables via chapitres+leçons validés ;
   *  0 = matière encore vide côté validé (front : « bientôt »), jamais filtrée. */
  notion_count: number;
  /** Notions fraîchement ajoutées (leçon validée porteuse créée récemment) → deck « ✨ new ». */
  new_count: number;
}

/** `GET /api/student/notions/summary` — compteurs par matière de l'année active. */
export interface StudentNotionsSummary {
  subjects: NotionSummarySubject[];
}

export interface SubjectNotionRef {
  skill_id: number;
  name: string;
  /** Chapitre de la leçon validée la plus récente qui enseigne cette notion. */
  chapter_title: string;
}

/** `GET /api/student/subjects/{subject_slug}/notions` — notions validées dédupliquées
 *  par `skill_id`. 404 hors année active ; `notions: []` si rien de validé. */
export interface SubjectNotions {
  subject: { slug: string; name: string };
  notions: SubjectNotionRef[];
}

/** Matière de l'année active — `id` = school_year_subject_id (clé des routes chapitres). */
export interface SchoolYearSubjectRef {
  id: number;
  subject_id: number;
  subject_name: string;
  subject_slug: string;
  /** Emoji de la matière (`subjects.icon`) — affiché devant le nom (pills Programme). */
  subject_icon: string | null;
  status: string;
}

/** `GET /api/school-years/active/subjects` — lecture seule pour la page Programme (Slice B). */
export interface ActiveSchoolYear {
  id: number;
  label: string;
  level: string;
  subjects: SchoolYearSubjectRef[];
}

/* ---------------------------------------------------------------------------
 * Génération « skills-only » pour un niveau antérieur (rattrapage) — ADR-0010.
 * Flux stateless : generate (prévisualisation en mémoire, rien de persisté) →
 * revue Papa → confirm (upsert des `Skill` au niveau cible). Aucun chapitre, aucune
 * leçon, aucune liaison n'est créé par ce chemin.
 * --------------------------------------------------------------------------- */

/** `POST /api/curriculum/skills-backfill/generate` — { subject_id, level } ;
 *  `level` ∈ cycle 4 (5e|4e|3e), sinon 400. */
export interface SkillsBackfillGenerateRequest {
  subject_id: number;
  level: string;
}

/** Notions d'un chapitre d'échafaudage (jeté après génération), dédupliquées. */
export interface SkillsBackfillGroup {
  scaffold_chapter: string;
  notions: string[];
}

/** Réponse de `generate` : prévisualisation revue par Papa avant confirmation.
 *  `failed_scaffolds` = échafaudages dont la passe 2 a échoué (liste partielle assumée). */
export interface SkillsBackfillPreview {
  subject_id: number;
  subject_name: string;
  level: string;
  cycle: string;
  program_version: string;
  groups: SkillsBackfillGroup[];
  failed_scaffolds: string[];
}

/** Notion revue par Papa (éditée/élaguée côté client) ; `scaffold_chapter` conservé
 *  comme contexte même si l'upsert ne le persiste pas encore. */
export interface SkillsBackfillNotion {
  scaffold_chapter: string;
  name: string;
}

/** `POST /api/curriculum/skills-backfill/confirm` — le client porte la liste revue. */
export interface SkillsBackfillConfirmRequest {
  subject_id: number;
  level: string;
  notions: SkillsBackfillNotion[];
}

/** Réponse de `confirm` : notions créées vs déjà présentes (idempotence). */
export interface SkillsBackfillConfirmResult {
  created: number;
  existing: number;
}
