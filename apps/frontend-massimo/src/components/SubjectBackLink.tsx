// Rétrolien « ← <Matière> », partagé par toutes les surfaces filles d'une matière.
//
// Avant lui, chaque page réinventait son retour et se trompait de destination : `/fiches/:slug`
// et `/mindmaps/:slug` remontaient vers leur DECK (`/fiches`, `/mindmaps`) et non vers la
// matière ; `/revision` n'avait aucun retour ; `/eli5` en avait un purement interne. Massimo
// arrivait de sa matière et ne pouvait pas y revenir.
//
// ⚠️ Le slug est DÉRIVÉ de l'URL, jamais d'un `location.state` ni d'une pile de navigation.
// C'est ce qui le rend robuste au rechargement, au partage d'URL et au retour physique iPhone
// — trois situations où un état de navigation aurait disparu.
import { Link, useParams, useSearchParams } from "react-router-dom";
import { subjectIconFor } from "@zetis/ui";
import { SUBJECT_BACK_PARAM } from "../lib/notionRoutes";

/** `histoire-geo` → `Histoire geo`. Repli quand la page hôte ne connaît pas le vrai nom.
 *  Hoisté ici : il était copié à l'identique dans trois pages. */
export function prettifySlug(slug: string): string {
  const s = slug.replace(/-/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface SubjectBackLinkProps {
  /** Slug forcé quand l'URL ne le porte pas et qu'aucun `?from=` n'est présent — cas de
   *  `/mindmaps/reconstruire/:id`, où il vient de la carte résolue CÔTÉ SERVEUR. C'est une
   *  donnée, pas un état de navigation : elle survit au rechargement. */
  slug?: string;
  /** Nom déjà connu de la page hôte. Sans lui, `prettifySlug` rendrait « Svt ». */
  name?: string;
  className?: string;
}

export function SubjectBackLink({ slug, name, className }: SubjectBackLinkProps) {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const resolved = slug ?? params.slug ?? searchParams.get(SUBJECT_BACK_PARAM) ?? null;

  // Arrivée directe par la sidebar : il n'y a pas de matière d'où l'on vient, on n'en invente
  // pas une. Un retour vers une page qu'on n'a jamais visitée serait un mensonge de navigation.
  if (!resolved) return null;

  const iconUrl = subjectIconFor(resolved);
  return (
    <Link
      to={`/subjects/${encodeURIComponent(resolved)}`}
      className={
        "mb-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-zetis-border bg-zetis-surface px-3 py-2 text-sm text-zetis-muted transition-colors hover:text-zetis-text motion-reduce:transition-none " +
        (className ?? "")
      }
    >
      <span aria-hidden>←</span>
      {iconUrl && <img src={iconUrl} alt="" aria-hidden className="h-5 w-5 object-contain" />}
      <span>{name ?? prettifySlug(resolved)}</span>
    </Link>
  );
}
