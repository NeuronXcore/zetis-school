import type { ReactNode } from "react";
import { Fragment, useState } from "react";
import type { GroupableItem, SubjectGroup } from "@zetis/ui";
import { subjectEmoji } from "../../lib/subjectEmoji";
import { subjectIconFor } from "../../lib/subjectIcons";

// « Une seule façon de trouver » (ADR-0057) — les étagères matière → chapitre, avec leur champ
// de recherche et leur état vide. Le motif vient de la page Capsules, où il a vécu seul assez
// longtemps pour être éprouvé ; il devient ici la brique de toutes les surfaces où Massimo
// cherche un objet.
//
// 🔴 **Aucune page ne se fabrique sa variante** (§1). Ce qui change d'une page à l'autre, c'est
// la CARTE d'un objet — d'où `renderItem`, et rien d'autre.

/** Icône de matière : PNG dédié si dispo, sinon repli emoji — **repris à l'identique** de la page
 *  Capsules, parité oblige. */
function SubjectIcon({ slug, size = 20 }: { slug: string; size?: number }) {
  const url = subjectIconFor(slug);
  if (url) {
    return (
      <img
        src={url}
        alt=""
        aria-hidden
        className="inline-block object-contain align-[-0.2em]"
        style={{ width: size, height: size }}
      />
    );
  }
  return <span aria-hidden>{subjectEmoji(slug)}</span>;
}

export interface SubjectChapterShelvesProps<T extends GroupableItem> {
  groups: SubjectGroup<T>[];
  /** Valeur du champ de recherche (contrôlé par la page — le deep link peut la pré-remplir). */
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  /** Phrase de l'état vide, qui **nomme ce qu'on cherchait**. */
  emptyLabel: (search: string) => string;
  renderItem: (item: T) => ReactNode;
  /** Clé d'un objet dans une liste. */
  itemKey: (item: T) => string | number;
  /** Grille des objets d'un chapitre. ⚠️ Le défaut est celui des **Capsules** — la parité de
   *  cet écran est l'étalon de la slice, il ne se change pas par distraction. */
  gridClassName?: string;
  /**
   * Étagères ouvertes à l'arrivée. **`false` par défaut = parité Capsules.**
   *
   * 🔴 `true` là où la matière est DÉJÀ choisie : un écran qui n'a qu'une étagère et la présente
   * fermée cache ce que Massimo vient de demander. Le défaut a été trouvé par un test existant —
   * `/quiz?subject=mathematiques` affichait un accordéon clos au lieu de ses quiz.
   */
  defaultOpen?: boolean;
  /**
   * En-tête de matière (icône + nom + compte). **`true` par défaut = parité Capsules.**
   *
   * 🔴 Le passer à `false` quand la page NOMME DÉJÀ la matière : sur l'écran d'une matière, elle
   * était écrite **trois fois** — rétrolien, titre de page, et en-tête d'étagère. Trouvé à
   * l'écran le 2026-08-14, invisible à tous les tests.
   */
  showSubjectHeader?: boolean;
  /**
   * Libellé du chapitre au-dessus de sa grille. **`true` par défaut = parité Capsules.**
   *
   * 🔴 Le passer à `false` quand **le chapitre EST l'objet** — c'est le cas de `/revision`, où
   * l'étagère ne contient qu'un lanceur par chapitre : le même mot s'écrirait deux fois, sur le
   * libellé et sur la tuile. C'est le défaut trouvé à l'écran sur `/fiches` le 2026-08-14.
   */
  showChapterLabel?: boolean;
  /**
   * Comment se lit le nombre de l'en-tête de matière. **Le défaut est le nombre nu = parité.**
   *
   * ⚠️ `shelf.count` compte les OBJETS de l'étagère. Sur `/revision`, ces objets sont des
   * chapitres, sur une page où tous les autres badges comptent des cartes — un « 2 » nu s'y
   * lirait comme deux cartes. *Un compteur doit dire ce qu'il compte* (ADR-0057 §7).
   */
  countLabel?: (n: number) => string;
}

export function SubjectChapterShelves<T extends GroupableItem>({
  groups,
  search,
  onSearchChange,
  searchPlaceholder,
  emptyLabel,
  renderItem,
  itemKey,
  gridClassName = "grid grid-cols-1 gap-3 sm:grid-cols-3",
  defaultOpen = false,
  showSubjectHeader = true,
  showChapterLabel = true,
  countLabel = String,
}: SubjectChapterShelvesProps<T>) {
  // Une seule mise en évidence à la fois : le dépliage est de la NAVIGATION, la recherche est un
  // FILTRE. Les faire cohabiter rendrait l'écran illisible (règle 2 de la galaxie, ADR-0057 §8).
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  return (
    <>
      <input
        type="search"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={searchPlaceholder}
        className="mt-4 w-full rounded-xl border border-zetis-border bg-zetis-surface px-4 py-2.5 text-sm"
      />

      {groups.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-zetis-border p-6 text-center text-sm text-zetis-muted">
          {emptyLabel(search)}
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {groups.map((shelf) => {
            const key = shelf.slug || shelf.name;
            // ⚠️ **Parité stricte avec la page Capsules** : une recherche ne déplie RIEN. La
            // règle 4 de l'`adr-0057` §8 (« un seul résultat s'ouvre tout seul », empruntée à la
            // galaxie) n'est PAS implémentée — l'appliquer changerait l'écran des Capsules, et la
            // parité est l'étalon de cette slice. Signalé, non traité.
            const open = expanded[key] ?? defaultOpen;
            return (
              <section
                key={key}
                className="overflow-hidden rounded-2xl border border-zetis-border bg-zetis-surface"
              >
                {showSubjectHeader && (
                  <button
                    type="button"
                    onClick={() => setExpanded((m) => ({ ...m, [key]: !m[key] }))}
                    className="flex w-full items-center gap-2 px-4 py-3 text-left font-bold"
                  >
                    <SubjectIcon slug={shelf.slug} size={28} />
                    {shelf.name}
                    <span className="ml-auto text-sm font-medium text-zetis-muted">
                      {countLabel(shelf.count)} · {open ? "▾" : "▸"}
                    </span>
                  </button>
                )}
                {open &&
                  (showChapterLabel ? (
                    <div className="px-4 pb-4">
                      {shelf.chapters.map((ch) => (
                        <div key={ch.id ?? "none"} className="mb-4 last:mb-0">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zetis-muted">
                            {ch.name}
                          </p>
                          <div className={gridClassName}>
                            {/* ⚠️ `Fragment`, pas un `div` : un nœud de plus ici ferait de LUI
                                l'enfant de la grille, et la carte cesserait de s'étirer. La
                                parité se joue à ce niveau de détail. */}
                            {ch.items.map((item) => (
                              <Fragment key={itemKey(item)}>{renderItem(item)}</Fragment>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    // 🔴 **Sans libellé, UNE seule grille pour toute l'étagère.** Le `div` par
                    // chapitre n'existe que pour porter son titre ; le garder sans titre découpe
                    // la grille en autant de conteneurs que de chapitres — et quand le chapitre
                    // EST l'objet (`/revision`), chacun n'en contient qu'un. Les tuiles
                    // s'empilaient alors **verticalement**, une par ligne, `flex-wrap` impuissant
                    // faute d'un second enfant à aligner. Trouvé à l'écran le 2026-08-14, invisible
                    // à quatorze tests — aucun ne regardait la géométrie.
                    <div className={`px-4 pb-4 ${gridClassName}`}>
                      {shelf.chapters.flatMap((ch) =>
                        ch.items.map((item) => (
                          <Fragment key={itemKey(item)}>{renderItem(item)}</Fragment>
                        )),
                      )}
                    </div>
                  ))}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
