// Regroupement matière → chapitre, avec filtre de recherche par titre.
//
// 🔴 **La seule façon de trouver** (ADR-0057) : ce module est la brique unique des surfaces où
// Massimo cherche un objet — capsules, quiz, et les pages qui suivront. Il vivait en DEUX copies
// identiques à l'octet (`apps/frontend-massimo/src/lib/groupCapsules.ts` et son jumeau chez Papa)
// avant d'être remonté ici.
//
// Pur : aucun appel réseau, aucun React. La recherche est **cliente**, sur les objets déjà servis
// à la page — jamais un endpoint, jamais un ILIKE, jamais le RAG (§2 de l'ADR).

import { normalizeSearch } from "./normalizeSearch";

/** Ce qu'un objet doit porter pour être groupé et cherché. */
export interface GroupableItem {
  title: string;
  subject: string;
  subject_slug: string;
  chapter_id: number | null;
  chapter: string | null;
}

export interface ChapterGroup<T> {
  id: number | null; // null = objets sans chapitre
  name: string; // nom du chapitre ou « Sans chapitre »
  items: T[];
}

export interface SubjectGroup<T> {
  slug: string;
  name: string;
  count: number;
  chapters: ChapterGroup<T>[];
}

export const NO_CHAPTER_LABEL = "Sans chapitre";

/**
 * Groupe par matière puis par chapitre, en filtrant sur le **titre**.
 *
 * ⚠️ La recherche porte sur **tout ce qui est passé**, toutes matières confondues — c'est la
 * règle des capsules, arbitrée le 2026-08-14 : chercher sans savoir la matière est précisément
 * ce que fait un enfant. À la surface d'**emmener** Massimo là où le résultat vit.
 */
export function groupBySubjectChapter<T extends GroupableItem>(
  items: T[],
  query = "",
): SubjectGroup<T>[] {
  const q = normalizeSearch(query);
  const filtered = q ? items.filter((c) => normalizeSearch(c.title).includes(q)) : items;

  const subjects = new Map<
    string,
    { name: string; slug: string; chapters: Map<string, ChapterGroup<T>> }
  >();

  for (const c of filtered) {
    const sKey = c.subject_slug || c.subject || "—";
    let s = subjects.get(sKey);
    if (!s) {
      s = { name: c.subject || "—", slug: c.subject_slug || "", chapters: new Map() };
      subjects.set(sKey, s);
    }
    const chKey = c.chapter_id == null ? "__none__" : String(c.chapter_id);
    let ch = s.chapters.get(chKey);
    if (!ch) {
      ch = { id: c.chapter_id ?? null, name: c.chapter ?? NO_CHAPTER_LABEL, items: [] };
      s.chapters.set(chKey, ch);
    }
    ch.items.push(c);
  }

  const result: SubjectGroup<T>[] = [];
  for (const s of subjects.values()) {
    const chapters = [...s.chapters.values()].sort((a, b) => {
      if (a.id == null) return 1; // « Sans chapitre » en dernier
      if (b.id == null) return -1;
      return a.name.localeCompare(b.name, "fr");
    });
    const count = chapters.reduce((n, ch) => n + ch.items.length, 0);
    result.push({ slug: s.slug, name: s.name, count, chapters });
  }
  result.sort((a, b) => a.name.localeCompare(b.name, "fr"));
  return result;
}
