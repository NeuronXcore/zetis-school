// File de relecture Papa (adr-0039) — `GET /api/parent/review-queue`.
//
// Le payload ne sert que des NOMS : aucun contenu, aucun markdown, aucune spec. Une file sert à
// décider par quoi commencer, pas à lire — la lecture se fait sur la page de pilotage du type.
import type { ReviewKind } from "./dashboard";

export interface ReviewItem {
  kind: ReviewKind;
  id: number;
  title: string;
  /** Le fil de rattachement est PARTIEL par nature : un chapitre n'a pas de leçon parente, une
   *  capsule peut n'être rattachée à aucun chapitre. Les `null` sont l'information. */
  subject_id: number | null;
  subject: string | null;
  subject_slug: string | null;
  chapter_id: number | null;
  chapter: string | null;
  lesson_id: number | null;
  lesson: string | null;
  created_at: string | null;
}

/** Compteurs par famille — JAMAIS filtrés par `kind` ni `subject_id` (adr-0039 §4). */
export interface ReviewCounts {
  lesson: number;
  fiche: number;
  mindmap: number;
  capsule: number;
  chapter: number;
  /** ADR-0043 : seuls les quiz de type `diagnostic` entrent dans la file. Les quiz de mission et
   *  de fin de cours restent hors gate (adr-0014 §2) — la ligne de partage est `quiz_type`, pas
   *  la table. */
  diagnostic: number;
  total: number;
}

export interface ReviewSubjectRef {
  id: number;
  name: string;
  slug: string;
}

export interface ReviewQueue {
  counts: ReviewCounts;
  subjects: ReviewSubjectRef[];
  items: ReviewItem[];
}
