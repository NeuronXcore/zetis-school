import { Link } from "react-router-dom";
import type { DiagnosticJauges } from "@zetis/types";
import type { DiagnosticFocus } from "./focus";

// Le bandeau instrument — quatre jauges qui disent l'état de la mesure, pas celui de l'élève.
//
// 🔴 **La quatrième n'est pas un compteur de panne.** Elle vaut zéro PAR DÉCISION : ZETIS ne se
// commande pas de production sur sa propre mesure (station ③). Son rendu — hachures, gris, jamais
// de couleur d'alerte — doit dire « vide voulu », pas « échec ».
//
// 🔴 **Chaque nombre peut montrer sa population (adr-0045 Décision 1).** La règle, en une phrase :
// une jauge FILTRE le rail quand sa population est faite de diagnostics ; elle RENVOIE par un lien
// nommé quand sa population vit sur une autre page ; elle NE FAIT RIEN quand elle vaut zéro par
// décision — et alors elle le dit.
//
// ⚠️ **Une jauge cliquable est un <div> qui CONTIENT un <button>, jamais un <button>.** Elle porte
// des pastilles de sous-population, et un bouton dans un bouton est du HTML invalide : le parseur
// éjecte les enfants hors du parent et la grille se disloque. Piège payé à l'écran sur la maquette
// de ce chantier — les pastilles sont donc les SŒURS de la zone principale, pas ses filles.

interface JaugeProps {
  titre: string;
  valeur: string;
  unite?: string;
  /** Le détail en prose. Mutuellement exclusif avec `souspop` — l'un ou l'autre, jamais les deux. */
  detail?: string;
  /** Les sous-populations, rendues en pastilles : ce sont ELLES que le lecteur ne pouvait pas voir. */
  souspop?: React.ReactNode;
  /** Rendu « vide voulu » : hachures, aucune couleur. Réservé à la 4ᵉ jauge. */
  mur?: boolean;
  /** Le geste principal de la jauge. Absent = la jauge n'est pas actionnable. */
  action?: { onClick: () => void; actif: boolean; indice: string };
}

function Jauge({ titre, valeur, unite, detail, souspop, mur = false, action }: JaugeProps) {
  const corps = (
    <>
      <p className="text-xs leading-snug text-papa-muted">{titre}</p>
      <p className={`mt-2 text-3xl font-bold ${mur ? "text-papa-muted" : ""}`}>
        {valeur}
        {unite && <span className="ml-1 text-base font-normal text-papa-muted">{unite}</span>}
      </p>
    </>
  );

  return (
    <div
      className={`relative overflow-hidden rounded-xl border p-4 transition-colors ${
        mur ? "border-papa-border bg-papa-surface/40" : "bg-papa-surface"
      } ${
        action?.actif
          ? "border-papa-accent bg-papa-accent/10"
          : action
            ? "border-papa-border hover:border-papa-accent/50"
            : "border-papa-border"
      }`}
    >
      {mur && (
        // Hachures : le vide se voit sans se colorer. `aria-hidden` — l'information est dans le
        // texte, la texture ne fait que la doubler.
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, currentColor 0 1px, transparent 1px 7px)",
          }}
        />
      )}
      {action ? (
        <button
          type="button"
          aria-pressed={action.actif}
          onClick={action.onClick}
          title={action.indice}
          className="block w-full text-left"
        >
          {corps}
        </button>
      ) : (
        corps
      )}
      {detail && <p className="mt-1.5 text-xs text-papa-muted">{detail}</p>}
      {souspop && <div className="mt-2 flex flex-wrap gap-1.5">{souspop}</div>}
    </div>
  );
}

/** Une sous-population du détail, devenue cliquable. Sœur de la zone principale, jamais son enfant. */
function Pastille({
  actif,
  onClick,
  children,
}: {
  actif: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={actif}
      onClick={onClick}
      className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${
        actif
          ? "border-papa-accent bg-papa-accent/10 text-papa-accent"
          : "border-papa-border text-papa-muted hover:border-papa-accent/50 hover:text-papa-text"
      }`}
    >
      {children}
    </button>
  );
}

/** Un renvoi vers la surface qui montre la population — quand elle n'est pas faite de diagnostics
 *  et que le rail ne peut donc pas l'afficher. */
function Renvoi({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="rounded-full border border-papa-border px-2.5 py-0.5 text-[11px] text-papa-muted transition-colors hover:border-papa-accent/50 hover:text-papa-text"
    >
      {children}
    </Link>
  );
}

export interface BandeauInstrumentProps {
  jauges: DiagnosticJauges;
  focus: DiagnosticFocus | null;
  onFocus: (focus: DiagnosticFocus) => void;
  /** `null` quand aucune passation n'existe — la jauge reste alors muette au lieu de désigner rien. */
  onPlusAncienne: (() => void) | null;
}

export function BandeauInstrument({
  jauges,
  focus,
  onFocus,
  onPlusAncienne,
}: BandeauInstrumentProps) {
  const pluriel = (n: number) => (n > 1 ? "s" : "");

  return (
    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Jauge
        titre="Matières mesurées au moins une fois"
        valeur={`${jauges.matieres_mesurees} / ${jauges.matieres_total}`}
        action={{
          onClick: () => onFocus("non-mesurees"),
          actif: focus === "non-mesurees",
          indice: "Montrer les matières dont ZETIS ne sait rien",
        }}
        souspop={
          <>
            {/* ⚠️ **L'unité est portée par CHAQUE pastille, et ce n'est pas de la verbosité.** Le
                nombre principal compte des MATIÈRES (`1 / 8`) ; `a_relire` et `proposes_non_passes`
                comptent des DIAGNOSTICS — une même matière peut en porter plusieurs. Vu à l'écran
                sur les données de dev : « 1 / 8 · 13 proposé(s) non passé(s) · 5 » se lisait comme
                13 matières sur 8. */}
            {jauges.a_relire > 0 && (
              <Pastille actif={focus === "a-relire"} onClick={() => onFocus("a-relire")}>
                {jauges.a_relire} diagnostic{pluriel(jauges.a_relire)} à relire
              </Pastille>
            )}
            {jauges.proposes_non_passes > 0 && (
              <Pastille actif={focus === "proposes"} onClick={() => onFocus("proposes")}>
                {jauges.proposes_non_passes} proposé{pluriel(jauges.proposes_non_passes)} non
                passé{pluriel(jauges.proposes_non_passes)}
              </Pastille>
            )}
            {/* 🔴 « générées », PAS « mesurées » (adr-0045 Décision 7). Deux populations distinctes :
                `jamais_generees` compte les matières SANS AUCUN QUIZ, quand le titre de la jauge
                compte celles ayant une TENTATIVE. Écrire « mesurées » ici rendait l'addition fausse
                à l'écran — `matieres_total − matieres_mesurees` ne retombait pas sur ce nombre,
                l'écart étant les matières générées et jamais passées. Le rail dit déjà
                « Jamais généré » : c'est ce mot-là qui fait foi. */}
            {jauges.jamais_generees > 0 && (
              <Pastille
                actif={focus === "jamais-generees"}
                onClick={() => onFocus("jamais-generees")}
              >
                {jauges.jamais_generees} matière{pluriel(jauges.jamais_generees)} jamais générée
                {pluriel(jauges.jamais_generees)}
              </Pastille>
            )}
            {jauges.a_relire === 0 &&
              jauges.proposes_non_passes === 0 &&
              jauges.jamais_generees === 0 && (
                <span className="text-xs text-papa-muted">
                  toutes les matières ont une mesure
                </span>
              )}
          </>
        }
      />

      <Jauge
        titre="Lecture la plus ancienne encore invoquée"
        valeur={jauges.plus_ancienne_lecture ? String(jauges.plus_ancienne_lecture.jours) : "—"}
        unite={jauges.plus_ancienne_lecture ? "j" : undefined}
        detail={
          jauges.plus_ancienne_lecture
            ? `${jauges.plus_ancienne_lecture.subject} · ${new Date(
                jauges.plus_ancienne_lecture.date,
              ).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}`
            : "aucune passation"
        }
        // Cette jauge désigne UNE passation, pas un ensemble : l'ouvrir est le geste direct, la
        // filtrer serait un détour sur une population de un.
        action={
          onPlusAncienne
            ? {
                onClick: onPlusAncienne,
                actif: false,
                indice: "Ouvrir cette passation",
              }
            : undefined
        }
      />

      <Jauge
        titre="Lacunes ouvertes par un diagnostic, encore ouvertes"
        valeur={String(jauges.lacunes_ouvertes)}
        souspop={
          jauges.lacunes_ouvertes > 0 ? (
            <>
              {/* Les lacunes ne sont pas des diagnostics : le rail ne peut pas les afficher. Un
                  renvoi nommé vaut mieux qu'un filtre qui ne filtrerait rien. */}
              <Renvoi to="/lacunes?source=diagnostic">
                voir les {jauges.lacunes_ouvertes} →
              </Renvoi>
              {jauges.lacunes_sans_contenu > 0 && (
                <Renvoi to="/lacunes?source=diagnostic&contenu=absent">
                  dont {jauges.lacunes_sans_contenu} sans contenu →
                </Renvoi>
              )}
            </>
          ) : undefined
        }
        detail={jauges.lacunes_ouvertes === 0 ? "aucune lacune ouverte" : undefined}
      />

      {/* 🔴 **Cette carte doit se comprendre SEULE.** Elle disait « Lots de production déclenchés
          par une mesure · 0 · et c'est voulu — voir ③ », et la relecture humaine a répondu « je ne
          comprends pas la 4ᵉ ». Trois raisons, toutes réparées ici :
            · « lots de production » est du vocabulaire interne, pas celui du lecteur ;
            · « voir ③ » renvoie à une section qu'on ne voit qu'APRÈS avoir sélectionné une
              passation passée et scrollé — un pointeur mort depuis le haut de la page ;
            · un zéro sans sa raison sur la carte se lit comme une panne.
          La raison tient donc en toutes lettres, ici, sans renvoi. */}
      <Jauge
        mur
        titre="Ce qu'une mesure a fait produire à ZETIS"
        valeur={String(jauges.lots_declenches)}
        detail="rien, et c'est une décision : ZETIS ne se commande pas de contenu sur sa propre mesure"
      />
    </div>
  );
}
