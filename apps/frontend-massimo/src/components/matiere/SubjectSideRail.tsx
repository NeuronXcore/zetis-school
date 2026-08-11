import { Link } from "react-router-dom";
import type { AgendaUpcomingItem, MotivationWeek } from "@zetis/types";
import { UpcomingCard } from "../agenda/UpcomingCard";
import { WeekDots } from "../motivation/WeekDots";
import { GlassPanel } from "../glass";

export interface SubjectSideRailProps {
  week: MotivationWeek | null;
  upcoming: AgendaUpcomingItem[];
  /** `undefined` sur la grille `/matieres`, qui est AU-DESSUS des matières : les libellés
   *  passent alors au général, et chaque échéance porte le nom de sa matière (c'est là qu'il
   *  distingue les lignes). */
  subjectName?: string;
}

const TITRE = "mb-3 text-[11px] font-bold uppercase tracking-wider text-zetis-muted";

/** Le rail droit de la page matière : ce que Massimo s'est donné, ce que l'école lui a donné,
 *  et à qui parler s'il bloque.
 *
 *  Les trois cartes viennent des maquettes du 2026-08-11, mais **aucune n'y est reprise
 *  telle quelle** — chacune heurtait une règle écrite de `CLAUDE.md` sur l'interface enfant.
 *  Le détail est dans l'addendum ADR-0024 « page matière onglets » §6. */
export function SubjectSideRail({ week, upcoming, subjectName }: SubjectSideRailProps) {
  return (
    <aside
      className="flex flex-col gap-4"
      aria-label={subjectName ? `À côté de ${subjectName}` : "À côté de tes matières"}
    >
      <ObjectifCard week={week} />
      <EcheancesCard upcoming={upcoming} subjectName={subjectName} />
      <AideCard subjectName={subjectName} />
    </aside>
  );
}

/** L'engagement que Massimo S'EST DONNÉ — jamais un objectif qu'on lui pose.
 *
 *  🔴 La maquette disait « **Atteins** le niveau 15 avant les vacances d'hiver ! ». `CLAUDE.md`
 *  l'interdit noir sur blanc : « **objectif imposé à l'enfant** — un objectif subi se fuit, un
 *  objectif qu'on s'est donné se tient ». La carte reste, la **voix change** : rien à
 *  l'impératif, et le nombre affiché est celui que Massimo a choisi lui-même.
 *
 *  ⚠️ **Le geste d'engagement ne se refait pas ici.** Il vit sur l'Accueil, et c'est une
 *  doctrine déjà écrite (`MatieresPage` : « on montre l'état ici, on ne redemande pas de
 *  s'engager à chaque page »). Redemander à chaque écran transformerait un choix en rappel. */
function ObjectifCard({ week }: { week: MotivationWeek | null }) {
  // Pas de carte tant qu'on ne sait rien : un squelette d'objectif n'apprend rien à personne.
  if (!week) return null;

  return (
    <GlassPanel className="p-4">
      <h2 className={TITRE}>Ce que je me suis donné</h2>

      {week.goal_days == null ? (
        <>
          {/* Aucun reproche, aucune injonction : un fait, puis une porte. */}
          <p className="text-sm text-zetis-muted">
            Tu ne t'es pas encore donné d'objectif cette semaine.
          </p>
          <Link
            to="/"
            className="mt-3 inline-flex min-h-11 items-center text-sm font-bold text-zetis-accent-2"
          >
            En choisir un →
          </Link>
        </>
      ) : (
        <>
          <WeekDots week={week} compact />
          <p className="mt-2 text-sm text-zetis-muted">
            {week.days_done} jour{week.days_done > 1 ? "s" : ""} cette semaine · objectif{" "}
            {week.goal_days}
          </p>
          {/* ⚠️ Aucun « il t'en reste N ». `MotivationWeek` n'a d'ailleurs aucun champ
              `remaining` — le type le dit : « rien ne peut se lire comme une punition ». */}
          {week.goal_met && (
            <p className="mt-1 text-sm font-bold text-zetis-accent-2">Objectif tenu 🎉</p>
          )}
          <Link
            to="/"
            className="mt-2 inline-flex min-h-11 items-center text-xs text-zetis-muted hover:text-zetis-text"
          >
            Changer sur l'accueil →
          </Link>
        </>
      )}
    </GlassPanel>
  );
}

/** Les échéances RÉELLES de la matière — celles du cahier de texte, jamais de ZETIS.
 *
 *  🔴 La maquette portait « Quiz : School vocabulary — **5 questions à revoir** ». C'est
 *  l'**arriéré**, et un compteur d'arriéré est la pression quotidienne que `CLAUDE.md`
 *  interdit. Rien de tel ici : la seule source est l'agenda, dont `days_left` est un décompte
 *  **subi** (le contrôle existe déjà, que ZETIS l'affiche ou non).
 *
 *  ⚠️ **Rien à afficher → aucune carte.** Un « à ne pas oublier » vide serait un réceptacle
 *  vide, et surtout il installerait l'idée qu'il devrait toujours y avoir quelque chose. */
function EcheancesCard({
  upcoming,
  subjectName,
}: {
  upcoming: AgendaUpcomingItem[];
  subjectName?: string;
}) {
  if (upcoming.length === 0) return null;

  return (
    <GlassPanel className="p-4">
      <h2 className={TITRE}>{subjectName ? `Ce qui arrive en ${subjectName}` : "Ce qui arrive"}</h2>
      <div className="flex flex-col gap-2">
        {upcoming.map((item) => (
          // `onOpenPlan` est volontairement ABSENT : le plan de préparation vit sur l'Agenda,
          // pas ici. La carte n'affiche alors aucun bouton — c'est son comportement prévu, et
          // ça évite le bouton mort que l'ADR-0050 a déjà fait retirer une fois.
          //
          // `hideSubject` seulement quand on est DÉJÀ dans la matière : le voir répété sur
          // chaque ligne ne dit rien et mange la largeur du rail (vu à l'écran le 2026-08-11).
          // Sur la grille, au contraire, c'est lui qui distingue les lignes.
          <UpcomingCard key={item.id} item={item} hideSubject={subjectName !== undefined} />
        ))}
      </div>
      <Link
        to="/agenda"
        className="mt-2 inline-flex min-h-11 items-center text-xs text-zetis-accent-2"
      >
        Voir mon agenda →
      </Link>
    </GlassPanel>
  );
}

/** L'entrée du chat, depuis la matière où Massimo bloque.
 *
 *  La seule des trois cartes qui passe sans reformulation : demander de l'aide est un geste
 *  positif, et ZETIS est déjà son interlocuteur ailleurs (chat, demandes de contenu). */
function AideCard({ subjectName }: { subjectName?: string }) {
  return (
    <GlassPanel className="p-4">
      <h2 className={TITRE}>Tu bloques ?</h2>
      <p className="text-sm text-zetis-muted">
        {subjectName
          ? `Demande à ZETIS de t'expliquer quelque chose en ${subjectName}.`
          : "Demande à ZETIS de t'expliquer un cours ou un exercice."}
      </p>
      <Link
        to="/chat"
        className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-zetis-border bg-zetis-surface-2 px-3 py-2 text-sm font-bold transition-colors hover:border-zetis-accent-2 motion-reduce:transition-none"
      >
        Parler à ZETIS
      </Link>
    </GlassPanel>
  );
}
