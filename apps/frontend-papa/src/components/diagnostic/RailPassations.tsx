import type { DiagnosticCran, DiagnosticRailEntry, DiagnosticSubjectRef } from "@zetis/types";
import { CRAN_TEXTE } from "./crans";

// Le rail chronologique — une entrée par passation, ou par diagnostic en cours de route.
//
// 🔴 **Le témoin a trois crans, et il ne se coche jamais à la main.** « Passé » est LU dans les
// tentatives ; « proposé » est un geste de Papa ; « généré » est un fait du moteur. Le cocher
// serait affirmer un fait que rien n'a mesuré.
//
// 🔴 **Aucun score avant le troisième cran — il n'en existe pas.** Les deux premiers portent un
// libellé (« à relire », « en attente »), jamais un pourcentage. Le serveur sert `null` et non `0`
// précisément pour que cette page n'ait pas à deviner la différence.

const CRAN_RANG: Record<DiagnosticCran, number> = { genere: 1, propose: 2, passe: 3 };

function Temoin({ cran }: { cran: DiagnosticCran }) {
  const atteint = CRAN_RANG[cran];
  return (
    // Trois pastilles remplies jusqu'au cran atteint. `title` porte le sens pour la souris,
    // le libellé texte le porte pour tout le monde — la forme ne le porte jamais seule.
    <span aria-hidden className="inline-flex items-center gap-0.5">
      {[1, 2, 3].map((rang) => (
        <span
          key={rang}
          className={`h-1.5 w-1.5 rounded-full ${
            rang <= atteint ? "bg-papa-accent" : "border border-papa-border"
          }`}
        />
      ))}
    </span>
  );
}

function moisDe(iso: string | null): string {
  if (!iso) return "Sans date";
  const d = new Date(iso);
  const mois = d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  return mois.charAt(0).toUpperCase() + mois.slice(1);
}

function jourDe(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

const ORDINAL = ["", "1ʳᵉ", "2ᵉ", "3ᵉ", "4ᵉ", "5ᵉ", "6ᵉ", "7ᵉ", "8ᵉ", "9ᵉ"];

export interface RailPassationsProps {
  entrees: DiagnosticRailEntry[];
  jamaisGenere: DiagnosticSubjectRef[];
  selection: string | null;
  onSelect: (entree: DiagnosticRailEntry) => void;
  /** Un filtre est posé — pastille de matière ou focus du bandeau. Change ce que dit l'état vide,
   *  et **seulement** cela : le rail ne se comporte pas autrement. */
  filtreActif: boolean;
}

export function RailPassations({
  entrees,
  jamaisGenere,
  selection,
  onSelect,
  filtreActif,
}: RailPassationsProps) {
  // Groupement par mois, dans l'ordre servi (le plus récent d'abord). On ne re-trie pas : l'ordre
  // vient du serveur, et deux tris pour la même liste finiraient par se contredire.
  const parMois: { mois: string; lignes: DiagnosticRailEntry[] }[] = [];
  for (const entree of entrees) {
    const mois = moisDe(entree.date);
    const dernier = parMois[parMois.length - 1];
    if (dernier?.mois === mois) dernier.lignes.push(entree);
    else parMois.push({ mois, lignes: [entree] });
  }

  return (
    <aside className="space-y-5">
      <p className="text-xs uppercase tracking-wide text-papa-muted">
        Diagnostics · {entrees.filter((e) => e.cran === "passe").length} passés ·{" "}
        {entrees.filter((e) => e.cran !== "passe").length} en cours de route
      </p>

      {/* 🔴 **L'état vide dit LAQUELLE des deux situations il rend.** « Aucun diagnostic pour
          l'instant. Lance-en un » annonce un dépôt VIDE : le servir à un lecteur qui a dix-huit
          diagnostics mais filtre sur une matière qui n'en a aucun est un mensonge, et il cohabitait
          avec un bandeau de focus disant « le rail ne montre que les 12 ». Deux phrases, une fausse.

          ⚠️ Le message sort dès que le rail est vide, **y compris quand le bloc « Jamais généré »
          ne l'est pas** : les deux ne disent pas la même chose — celui-ci compte des DIAGNOSTICS,
          celui-là liste des MATIÈRES. Ils se complètent. Une première version les avait crus
          contradictoires et supprimait le message ; un test existant l'a rattrapée. */}
      {entrees.length === 0 && (
        <p className="rounded-xl border border-papa-border bg-papa-surface p-4 text-sm text-papa-muted">
          {filtreActif ? (
            <>
              <strong className="font-medium text-papa-text">Aucun diagnostic ici.</strong> Le
              filtre en cours n'en laisse passer aucun — d'autres existent en dehors.
            </>
          ) : (
            <>
              Aucun diagnostic pour l'instant. Lance-en un : il rejoindra ce rail au premier cran,
              en relecture — pas encore chez Massimo.
            </>
          )}
        </p>
      )}

      {parMois.map(({ mois, lignes }) => (
        <div key={mois} className="space-y-2">
          <p className="text-xs font-medium text-papa-muted">{mois}</p>
          {lignes.map((entree) => {
            const texte = CRAN_TEXTE[entree.cran];
            const actif = selection === entree.cle;
            return (
              <button
                key={entree.cle}
                type="button"
                aria-pressed={actif}
                onClick={() => onSelect(entree)}
                className={`w-full rounded-xl border p-3 text-left transition-colors ${
                  actif
                    ? "border-papa-accent bg-papa-accent/10"
                    : "border-papa-border bg-papa-surface hover:border-papa-accent/50"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate font-medium">
                      <Temoin cran={entree.cran} />
                      {entree.subject}
                    </p>
                    <p className="mt-0.5 text-xs text-papa-muted">
                      {texte.verbe} le {jourDe(entree.date)} · {entree.notions_count} notion
                      {entree.notions_count > 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {/* 🔴 Le score ne s'affiche QUE au troisième cran. Un `0` rendu ici se lirait
                        comme une mesure catastrophique au lieu d'une absence de mesure. */}
                    {entree.cran === "passe" ? (
                      <>
                        <p className="text-sm font-semibold">{entree.score_percent} %</p>
                        {entree.rang !== null && (
                          <p className="text-[11px] text-papa-muted">
                            {ORDINAL[entree.rang] ?? `${entree.rang}ᵉ`} passation
                          </p>
                        )}
                      </>
                    ) : (
                      // 🔴 L'ACTEUR d'abord, en couleur ; l'état ensuite, en gris. Deux paires du
                      // même gris désignaient des acteurs OPPOSÉS — rien ne disait chez qui la
                      // balle se trouvait. La couleur ne porte pas l'information seule : le mot
                      // « chez toi » / « chez Massimo » est écrit.
                      <>
                        <p className={`whitespace-nowrap text-[11.5px] font-semibold ${texte.ton}`}>
                          {texte.acteur}
                        </p>
                        <p className="whitespace-nowrap text-[11px] text-papa-muted">
                          {texte.etat}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ))}

      {jamaisGenere.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-papa-muted">Jamais généré</p>
          {/* Les matières sans diagnostic restent listées : leur absence est l'information. Elles
              ne produisent NI compteur NI pastille de nouveauté — `navigation.ts` range Diagnostic
              parmi les entrées sans témoin, et un test verrouille cette liste. */}
          {jamaisGenere.map((matiere) => (
            <div
              key={matiere.id}
              className="rounded-xl border border-dashed border-papa-border px-3 py-2 text-sm text-papa-muted"
            >
              {matiere.name}
              <span className="ml-2 text-xs">aucun diagnostic</span>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs leading-relaxed text-papa-muted">
        Le témoin se remplit en trois temps et ne se coche jamais à la main. « Passé » est lu dans
        les tentatives ; « proposé » est un geste de ta part ; « généré » est un fait du moteur.
        Aucun score ne s'affiche avant le troisième cran — il n'en existe pas.{" "}
        {/* La formulation que la maquette v3 portait dans sa légende, et qui n'avait jamais été
            implémentée. Elle dit la règle plutôt que de laisser deviner la couleur. */}
        <span className="text-papa-text">
          Tant qu'un diagnostic n'est pas passé, la mention de droite dit <strong>chez qui</strong>{" "}
          il attend : chez toi s'il reste à relire, chez Massimo s'il lui a été proposé.
        </span>
      </p>
    </aside>
  );
}
