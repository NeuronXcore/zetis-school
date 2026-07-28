import { Link } from "react-router-dom";
import { useAuth } from "@zetis/auth";
import { useAccueil } from "../hooks/useAccueil";
import { useMotivationWeek } from "../hooks/useMotivationWeek";
import { HomeGalaxyPreview } from "../components/galaxy/HomeGalaxyPreview";
import { ZetisMessageCard } from "../components/motivation/ZetisMessageCard";
import { WeekDots } from "../components/motivation/WeekDots";
import { WeekGoalPicker } from "../components/motivation/WeekGoalPicker";

// Accueil Massimo — branché sur les routes réelles.
//
// Cette page affichait auparavant TROIS nombres inventés (« 3 notions consolidées cette semaine »,
// « 3 cartes », et toute la mission du jour) tirés de `data/mock.ts`, plus un bouton « Commencer »
// sans handler. ZETIS félicitait Massimo pour des chiffres qui n'existaient pas. Tout ce qui est
// affiché ici vient désormais du serveur, ou n'est pas affiché.
//
// Règle de tenue : AUCUN message technique à l'écran de l'enfant. Un appel qui échoue rend un bloc
// silencieux ou un état serein — jamais un code d'erreur, jamais du rouge.

/** Prénom d'affichage, dérivé du compte connecté (« massimo » → « Massimo »). Provisoire :
 *  le vrai prénom du profil arrivera avec le message d'accueil serveur. */
function displayName(username: string): string {
  return username ? username.charAt(0).toUpperCase() + username.slice(1) : "";
}

const SHORTCUT_CLASS =
  "rounded-2xl border border-zetis-border bg-zetis-surface p-4 transition-transform hover:scale-[1.02]";

export function AccueilMassimoPage() {
  const { user } = useAuth();
  const { welcome, today, reviews, loading, refreshWelcome } = useAccueil();
  // Changer d'engagement change ce que ZETIS a à dire : on le recharge.
  const week = useMotivationWeek(refreshWelcome);
  const elected = today?.elected ?? null;
  // Le prénom du profil dès qu'il est connu ; sinon le compte connecté (« massimo » → « Massimo »).
  const name = welcome?.context.first_name || displayName(user?.username ?? "");

  return (
    // Deux colonnes à partir du grand écran : la galaxie à gauche, ce qu'il y a à FAIRE à
    // droite. En dessous, une seule colonne — sur téléphone, empiler garde l'ordre de
    // lecture, et la galaxie passe alors en dernier (elle inspire, elle n'agit pas).
    <div className="mx-auto max-w-7xl">
      <h1 className="text-2xl font-bold">Bonjour{name ? ` ${name}` : ""} 👋</h1>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
        {/* Colonne gauche — la galaxie. `lg:sticky` : elle reste visible pendant qu'on
            parcourt les actions de droite. */}
        <div className="order-2 lg:order-1 lg:sticky lg:top-4">
          <HomeGalaxyPreview />
        </div>

        {/* Colonne droite — l'action du jour. */}
        <div className="order-1 lg:order-2">

      {/* Ce que ZETIS a à dire, en premier : le levier « il se souvient » doit être la première
          chose lue. Si l'appel échoue, la carte n'est pas rendue — pas de phrase de secours, qui
          serait exactement le mensonge qu'on vient de retirer de cette page. */}
      {welcome && (
        <div>
          <ZetisMessageCard message={welcome} />
        </div>
      )}

      {/* Ma semaine : la grille et le geste d'engagement dans la MÊME carte — l'action et son
          effet au même endroit. */}
      {week.week && (
        <section className="mt-4 rounded-2xl border border-zetis-border bg-zetis-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-zetis-accent-2">
            Ma semaine
          </p>
          <div className="mt-3">
            <WeekDots week={week.week} />
          </div>
          <WeekGoalPicker
            goalDays={week.week.goal_days}
            onChoose={week.chooseGoal}
            pending={week.pending}
          />
          {week.notice && <p className="mt-2 text-sm text-zetis-muted">{week.notice}</p>}
        </section>
      )}

      {/* Mission du jour. `elected: null` n'est pas une erreur : c'est l'état serein prévu par la
          spec — rien d'obligatoire maintenant. */}
      <section className="mt-6 rounded-2xl border border-zetis-border bg-zetis-surface p-6">
        {loading && <p className="text-sm text-zetis-muted">Chargement…</p>}

        {!loading && elected && (
          <>
            <p className="text-xs font-semibold uppercase tracking-wide text-zetis-accent-2">
              Mission du jour
            </p>
            <h2 className="mt-1 text-xl font-bold">{elected.title}</h2>
            <p className="mt-1 text-sm text-zetis-muted">
              {elected.estimated_minutes} min · +{elected.xp_reward} XP · {elected.subject}
            </p>
            {/* Raison SERVIE telle quelle, jamais recomposée côté client. */}
            {today?.reason && <p className="mt-2 text-sm text-zetis-muted">{today.reason}</p>}
            <Link
              to="/missions"
              state={{ openMissionId: elected.id }}
              className="mt-4 inline-block rounded-xl bg-zetis-accent px-5 py-2.5 font-semibold text-white transition-transform hover:scale-[1.02]"
            >
              Commencer →
            </Link>
          </>
        )}

        {!loading && !elected && (
          <>
            <p className="text-xs font-semibold uppercase tracking-wide text-zetis-accent-2">
              Aujourd'hui
            </p>
            <h2 className="mt-1 text-xl font-bold">Rien d'obligatoire maintenant</h2>
            <p className="mt-2 text-sm text-zetis-muted">
              Tu peux choisir une matière, ou faire une révision rapide.
            </p>
            <Link
              to="/matieres"
              className="mt-4 inline-block rounded-xl bg-zetis-accent px-5 py-2.5 font-semibold text-white transition-transform hover:scale-[1.02]"
            >
              Choisir une matière →
            </Link>
          </>
        )}
      </section>

      {/* Raccourcis. Le sous-titre de « Révision rapide » affiche `flash_size` (plafonné serveur)
          et NON `total_due` : « 40 cartes en retard » sur l'accueil serait la pression quotidienne
          anxiogène que CLAUDE.md interdit. Sans donnée, pas de sous-titre — rien n'est inventé. */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Link to="/revision" className={SHORTCUT_CLASS}>
          <div className="text-xl">🔁</div>
          <p className="mt-1 font-semibold">Révision rapide</p>
          {reviews && reviews.flash_size > 0 && (
            <p className="text-xs text-zetis-muted">{reviews.flash_size} cartes</p>
          )}
        </Link>
        <Link to="/eli5" className={SHORTCUT_CLASS}>
          <div className="text-xl">💡</div>
          <p className="mt-1 font-semibold">ELI5 rapide</p>
          <p className="text-xs text-zetis-muted">Se faire expliquer une notion</p>
        </Link>
        <Link to="/capsules" className={SHORTCUT_CLASS}>
          <div className="text-xl">🎬</div>
          <p className="mt-1 font-semibold">Capsule IA</p>
          <p className="text-xs text-zetis-muted">Une notion en vidéo</p>
        </Link>
      </div>
        </div>
      </div>
    </div>
  );
}
