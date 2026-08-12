import { Link } from "react-router-dom";
import { ACTION_UI } from "../../lib/notionActionUi";
import type { SubjectCatalogueEntry } from "../../hooks/useSubjectPanoply";

/** Libellé au pluriel de chaque type — « 3 fiches », pas « 3 fiche ».
 *
 *  Les libellés d'`ACTION_UI` sont des ORDRES adressés à Massimo (« Lire la fiche »,
 *  « Me tester ») : parfaits sur un bouton d'activité, illisibles derrière un nombre. Ici on
 *  nomme la CHOSE, pas le geste. */
const NOM = {
  cours: ["cours", "cours"],
  eli5: ["explication", "explications"],
  fiche: ["fiche", "fiches"],
  capsule: ["capsule", "capsules"],
  // ⚠️ « mindmap » et non « carte », corrigé le 2026-08-11 sur signalement du user. La bande
  // annonçait « 1 carte » (mindmap) à trois pastilles de « 8 cartes à revoir » (SRS) : deux
  // destinations différentes sous le même mot, et le lien vers les mindmaps se lisait comme
  // absent. C'est le nom que la barre latérale montre à Massimo (`navigation.ts`).
  //
  // `ACTION_UI` a suivi le 2026-08-12 (« Reconstruire la mindmap ») : la même règle tient
  // désormais des deux côtés, et un test-verrou la tient dans chacun — ici
  // `MatiereDetailPage.test.tsx`, là `lib/notionActionUi.test.ts`.
  mindmap: ["mindmap", "mindmaps"],
  revision: ["carte à revoir", "cartes à revoir"],
  quiz: ["quiz", "quiz"],
} as const;

export interface SubjectCatalogueBandProps {
  catalogue: SubjectCatalogueEntry[];
  subjectName: string;
}

/** Ce que ZETIS a pour cette matière, d'un coup d'œil.
 *
 *  Avant elle, la page n'annonçait qu'une chose — les cartes à revoir. Tout le reste n'existait
 *  que notion par notion : il fallait déplier un chapitre et taper sur une notion pour découvrir
 *  qu'il y avait trois fiches dans la matière.
 *
 *  ⚠️ Une entrée à `0` n'est PAS rendue, et la bande entière disparaît si tout est à zéro. Une
 *  matière qui n'a encore rien n'affiche pas six zéros — ce serait dresser la liste de ce qui
 *  manque, alors que l'absence de contenu est l'état du catalogue de Papa, pas un manque de
 *  l'enfant.
 *
 *  Cyan partout : c'est la couleur du « disponible » sur cette page. Pas d'orange (réservé à la
 *  demande), pas d'or (réservé à « ZETIS parle »).
 */
export function SubjectCatalogueBand({ catalogue, subjectName }: SubjectCatalogueBandProps) {
  const visibles = catalogue.filter((entry) => entry.count > 0);
  if (visibles.length === 0) return null;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {visibles.map((entry) => {
        const [singulier, pluriel] = NOM[entry.kind];
        const mot = entry.count > 1 ? pluriel : singulier;
        const label = `${entry.count} ${mot} en ${subjectName}`;
        const ouvrable = entry.route !== null;
        const contenu = (
          <>
            <span aria-hidden className={"text-base " + (ouvrable ? "" : "grayscale")}>
              {ACTION_UI[entry.kind].icon}
            </span>
            <span>
              <span className={"font-bold " + (ouvrable ? "text-zetis-accent-2" : "")}>
                {entry.count}
              </span>{" "}
              {mot}
            </span>
          </>
        );
        const base = "flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-sm";

        // ⚠️ `route === null` (capsule) : aucune route par matière n'existe, la pastille ne mène
        // nulle part. Elle DOIT alors se distinguer à l'œil — bordure pointillée et texte
        // atténué, la grammaire du « bientôt » déjà utilisée sur les activités indisponibles.
        //
        // Le 2026-08-01, `quiz` était dans ce cas et rendu comme une pastille normale : le user
        // a cliqué, rien ne s'est passé, et il l'a signalé comme une PANNE. Il avait raison —
        // une chose qui ressemble à un lien doit être un lien. (`quiz` est depuis devenu
        // cliquable ; la leçon vaut pour tout futur type non adressable.)
        return entry.route ? (
          <Link
            key={entry.kind}
            to={entry.route}
            // Le NOM voyage avec le lien : l'URL ne porte qu'un slug, et `prettifySlug` en
            // ferait « Mathematiques » — un mot français amputé de son accent, qui se lit
            // comme une faute de frappe du produit. Ce n'est pas de l'état de NAVIGATION :
            // les pages cibles ont toutes un repli si on arrive par un lien partagé.
            state={{ name: subjectName }}
            aria-label={label}
            className={`${base} border border-zetis-border bg-zetis-surface text-zetis-text transition-colors hover:border-zetis-accent-2 motion-reduce:transition-none`}
          >
            {contenu}
          </Link>
        ) : (
          <span
            key={entry.kind}
            aria-label={`${label} — pas encore ouvrable depuis ici`}
            className={`${base} cursor-default border border-dashed border-zetis-border bg-transparent text-zetis-muted`}
          >
            {contenu}
          </span>
        );
      })}
    </div>
  );
}
