// Regroupement des capsules par matière → chapitre, avec filtre de recherche par titre.
// Pur (aucun appel réseau) : réutilisé par la liste Papa et les étagères Massimo.

export interface GroupableCapsule {
  title: string;
  subject: string;
  subject_slug: string;
  chapter_id: number | null;
  chapter: string | null;
}

export interface ChapterGroup<T> {
  id: number | null; // null = capsules sans chapitre
  name: string; // nom du chapitre ou « Sans chapitre »
  capsules: T[];
}

export interface SubjectGroup<T> {
  slug: string;
  name: string;
  count: number;
  chapters: ChapterGroup<T>[];
}

export const NO_CHAPTER_LABEL = "Sans chapitre";

// Minuscule + sans accents, pour une recherche tolérante.
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export function groupBySubjectChapter<T extends GroupableCapsule>(
  items: T[],
  query = "",
): SubjectGroup<T>[] {
  const q = normalize(query.trim());
  const filtered = q ? items.filter((c) => normalize(c.title).includes(q)) : items;

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
      ch = { id: c.chapter_id ?? null, name: c.chapter ?? NO_CHAPTER_LABEL, capsules: [] };
      s.chapters.set(chKey, ch);
    }
    ch.capsules.push(c);
  }

  const result: SubjectGroup<T>[] = [];
  for (const s of subjects.values()) {
    const chapters = [...s.chapters.values()].sort((a, b) => {
      if (a.id == null) return 1; // « Sans chapitre » en dernier
      if (b.id == null) return -1;
      return a.name.localeCompare(b.name, "fr");
    });
    const count = chapters.reduce((n, ch) => n + ch.capsules.length, 0);
    result.push({ slug: s.slug, name: s.name, count, chapters });
  }
  result.sort((a, b) => a.name.localeCompare(b.name, "fr"));
  return result;
}
